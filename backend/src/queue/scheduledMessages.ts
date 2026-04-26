// Queue module for scheduled flow messages via Redis Sorted Sets.
//
// Replaces the PostgreSQL table as the scheduling mechanism.
// The DB table remains as an audit log only.
//
// Structures:
//   sched:queue              → Sorted Set, score = send_at (Unix ms), value = jobId
//   sched:job:{jobId}        → String JSON payload, TTL 48h
//   sched:phone:{orgId}:{p}  → Set of active jobIds for a phone, TTL 48h
//   sched:rl:{instId}:{min}  → Rate limit counter per instance/minute, TTL 60s
//
// Note: this module and bot/flowEngine.ts import from each other.
// That circular reference is safe because neither calls the other at module level.

import { redis } from "../cache/redis";
import { supabase } from "../db/supabase";
import { log } from "../logger";
import { STAGES, FLOW_IN_PROGRESS_STAGES } from "../stages";
import type { ConversationState } from "../types";
import { sendStepMessages, getFlowById } from "../bot/flowEngine";
import type { FlowStep } from "../bot/flowEngine";

const QUEUE_KEY = "sched:queue";
const JOB_TTL = 48 * 3600; // seconds
const MAX_MSGS_PER_MINUTE = 200;

export type ScheduledJobPayload = {
  id: string;
  orgId: string;
  phone: string;
  stepId: string;
  conversationId: string | null;
  instanceId: string | null;
  metaPhoneNumberId: string | null;
  flowId: string | null;
  sendAt: number; // Unix ms
};

// ── Write path ────────────────────────────────────────────────────────────────

export async function scheduleJob(payload: ScheduledJobPayload): Promise<void> {
  const r = redis;
  if (r) {
    try {
      const phoneKey = `sched:phone:${payload.orgId}:${payload.phone}`;
      const pipeline = r.pipeline();
      pipeline.zadd(QUEUE_KEY, payload.sendAt, payload.id);
      pipeline.set(`sched:job:${payload.id}`, JSON.stringify(payload), "EX", JOB_TTL);
      pipeline.sadd(phoneKey, payload.id);
      pipeline.expire(phoneKey, JOB_TTL);
      await pipeline.exec();

      // Audit row with redis_job_id so the DB cron ignores it (fire-and-forget)
      supabase?.from("scheduled_flow_messages").insert({
        organization_id: payload.orgId,
        conversation_id: payload.conversationId,
        step_id: payload.stepId,
        phone: payload.phone,
        whatsapp_instance_id: payload.instanceId,
        meta_phone_number_id: payload.metaPhoneNumberId,
        flow_id: payload.flowId,
        scheduled_at: new Date(payload.sendAt).toISOString(),
        status: "pending",
        redis_job_id: payload.id,
      });
      return;
    } catch (err) {
      log.warn({ err }, "scheduleJob: Redis failed, falling back to DB-only");
    }
  }

  // DB-only fallback: processed by the existing cron (no redis_job_id)
  await supabase?.from("scheduled_flow_messages").insert({
    organization_id: payload.orgId,
    conversation_id: payload.conversationId,
    step_id: payload.stepId,
    phone: payload.phone,
    whatsapp_instance_id: payload.instanceId,
    meta_phone_number_id: payload.metaPhoneNumberId,
    flow_id: payload.flowId,
    scheduled_at: new Date(payload.sendAt).toISOString(),
    status: "pending",
  });
}

// ── Cancellation ──────────────────────────────────────────────────────────────

export async function cancelJobsForPhone(orgId: string, phone: string): Promise<void> {
  const r = redis;
  if (r) {
    try {
      const phoneKey = `sched:phone:${orgId}:${phone}`;
      const jobIds = await r.smembers(phoneKey);
      if (jobIds.length > 0) {
        const pipeline = r.pipeline();
        pipeline.zrem(QUEUE_KEY, ...jobIds);
        pipeline.del(phoneKey);
        await pipeline.exec();

        // Fire-and-forget audit update
        Promise.resolve(
          supabase
            ?.from("scheduled_flow_messages")
            .update({ status: "cancelled" })
            .in("redis_job_id", jobIds),
        ).catch((err: unknown) =>
          log.warn({ err }, "cancelJobsForPhone: audit update failed"),
        );
      }
    } catch (err) {
      log.warn({ err }, "cancelJobsForPhone: Redis operation failed");
    }
  }
}

// ── Status check ──────────────────────────────────────────────────────────────

export async function hasPendingJobs(orgId: string, phone: string): Promise<boolean> {
  const r = redis;
  if (!r) return false;
  try {
    const count = await r.scard(`sched:phone:${orgId}:${phone}`);
    return count > 0;
  } catch (err) {
    log.warn({ err }, "hasPendingJobs: Redis failed");
    return false;
  }
}

// ── Worker ────────────────────────────────────────────────────────────────────

async function processJob(payload: ScheduledJobPayload): Promise<void> {
  const r = redis;
  if (!supabase || !r) return;

  // Rate limit per WhatsApp instance (sliding 1-minute window)
  if (payload.instanceId) {
    const bucket = Math.floor(Date.now() / 60_000);
    const rlKey = `sched:rl:${payload.instanceId}:${bucket}`;
    const count = await r.incr(rlKey);
    if (count === 1) await r.expire(rlKey, 60);
    if (count > MAX_MSGS_PER_MINUTE) {
      log.warn({ instanceId: payload.instanceId, count }, "processJob: rate limit, re-enqueueing in 60s");
      await r.zadd(QUEUE_KEY, Date.now() + 60_000, payload.id);
      return;
    }
  }

  const phoneKey = `sched:phone:${payload.orgId}:${payload.phone}`;
  const sentAt = new Date().toISOString();

  // Use cached flow to avoid a Supabase hit on every scheduled message.
  // Falls back to a direct DB query only if the flow isn't cached or has no flowId.
  let step: FlowStep | null = null;

  if (payload.flowId) {
    const flow = await getFlowById(payload.flowId, payload.orgId);
    step = (flow?.steps?.find((s) => s.id === payload.stepId) as FlowStep | undefined) ?? null;
  }

  if (!step) {
    // Flow not in cache or no flowId — fall back to direct DB query
    const { data, error: stepErr } = await supabase
      .from("flow_steps")
      .select(
        `id, flow_id, organization_id, position, delay_seconds, trigger_keywords, label,
         messages:flow_step_messages(id, step_id, position, message_type, text_content, media_url, filename, caption)`,
      )
      .eq("id", payload.stepId)
      .maybeSingle();

    if (stepErr) {
      // Supabase error — re-enqueue instead of dropping the job permanently
      log.warn({ stepId: payload.stepId, jobId: payload.id, err: stepErr }, "processJob: Supabase error, re-enqueueing in 30s");
      await r.zadd(QUEUE_KEY, Date.now() + 30_000, payload.id);
      return;
    }

    if (!data) {
      log.warn({ stepId: payload.stepId, jobId: payload.id }, "processJob: step not found, marking failed");
      const p = r.pipeline();
      p.srem(phoneKey, payload.id);
      p.del(`sched:job:${payload.id}`);
      await p.exec();
      Promise.resolve(
        supabase
          .from("scheduled_flow_messages")
          .update({ status: "failed", sent_at: sentAt })
          .eq("redis_job_id", payload.id),
      ).catch(() => {});
      return;
    }

    step = data as FlowStep;
  }

  const fakeState: ConversationState = {
    stage: STAGES.en_flujo,
    organizationId: payload.orgId,
    id: payload.conversationId ?? undefined,
    flowId: payload.flowId ?? null,
    whatsappInstanceId: payload.instanceId ?? null,
    metaPhoneNumberId: payload.metaPhoneNumberId ?? null,
    flowName: null,
    history: [],
  };

  await sendStepMessages(step as FlowStep, payload.phone, fakeState);

  // Cleanup Redis atomically
  const p = r.pipeline();
  p.srem(phoneKey, payload.id);
  p.del(`sched:job:${payload.id}`);
  await p.exec();

  // Audit DB update (fire-and-forget, non-blocking)
  Promise.resolve(
    supabase
      .from("scheduled_flow_messages")
      .update({ status: "sent", sent_at: sentAt })
      .eq("redis_job_id", payload.id),
  ).catch((err: unknown) =>
    log.warn({ err, jobId: payload.id }, "processJob: audit DB update failed"),
  );

  // If all steps for this phone are done, mark conversation as flujo_terminado.
  // The .in("stage", FLOW_IN_PROGRESS_STAGES) guard prevents overwriting a stage
  // that was already advanced (e.g. pago_confirmado, revision_manual).
  const remaining = await r.scard(phoneKey);
  if (remaining === 0 && payload.conversationId) {
    await supabase
      .from("conversations")
      .update({ stage: STAGES.flujo_terminado })
      .eq("id", payload.conversationId)
      .in("stage", FLOW_IN_PROGRESS_STAGES);
  }
}

export async function processScheduledMessages(): Promise<void> {
  const r = redis;
  if (!r || r.status !== "ready") return;

  const nowMs = Date.now();

  // Cheap peek before claiming — avoids pipeline overhead when queue is empty
  const peek = await r.zrangebyscore(QUEUE_KEY, "-inf", nowMs, "LIMIT", 0, 1);
  if (!peek.length) return;

  // Atomic claim: pop up to 50 lowest-score (earliest) items.
  // zpopmin returns a flat [member, score, member, score, ...] string array.
  const claimed = await r.zpopmin(QUEUE_KEY, 50);
  const jobIds: string[] = [];
  const requeue: Array<[number, string]> = [];

  for (let i = 0; i < claimed.length - 1; i += 2) {
    const member = claimed[i] as string;
    const score = parseFloat(claimed[i + 1] as string);
    if (score <= nowMs) {
      jobIds.push(member);
    } else {
      // Not due yet — put back (can happen if fewer than 50 items are due)
      requeue.push([score, member]);
    }
  }

  if (requeue.length > 0) {
    const p = r.pipeline();
    for (const [score, member] of requeue) {
      p.zadd(QUEUE_KEY, score, member);
    }
    await p.exec();
  }

  if (!jobIds.length) return;

  log.info({ count: jobIds.length }, "processScheduledMessages (Redis): processing batch");

  // Fetch all payloads in parallel
  const rawPayloads = await Promise.all(
    jobIds.map((id) => r.get(`sched:job:${id}`)),
  );

  await Promise.allSettled(
    rawPayloads.map((raw, i) => {
      if (!raw) {
        log.warn({ jobId: jobIds[i] }, "processScheduledMessages: payload missing (TTL expired?)");
        return Promise.resolve();
      }
      return processJob(JSON.parse(raw) as ScheduledJobPayload);
    }),
  );
}
