/**
 * Flow Engine
 *
 * Sends step 0 immediately and schedules following steps.
 */

import { supabase } from "../db/supabase";
import { log } from "../logger";
import { sendMessage } from "./sender";
import { textMessage } from "./messages";
import type { ConversationState } from "../types";
import { scheduleJob, cancelJobsForPhone } from "../queue/scheduledMessages";
import type { ScheduledJobPayload } from "../queue/scheduledMessages";
import { getCached, setCached } from "../cache/redis";

const FULL_FLOW_TTL = 3600;
export const fullFlowCacheKey = (flowId: string) => `flow:full:${flowId}`;

// ── Types ─────────────────────────────────────────────────────────────────

export type FlowMessageType = "text" | "image" | "document" | "video" | "audio";

export type FlowStepMessage = {
  id: string;
  step_id: string;
  position: number;
  message_type: FlowMessageType;
  text_content: string | null;
  media_url: string | null;
  filename: string | null;
  caption: string | null;
};

export type FlowStep = {
  id: string;
  flow_id: string;
  organization_id: string;
  position: number;
  delay_seconds: number;
  trigger_keywords: string[];
  label: string | null;
  messages?: FlowStepMessage[];
};

export type FlowDefinition = {
  id: string;
  organization_id: string;
  name: string;
  trigger_phrase: string;
  trigger_first_word: string;
  keywords: string[];
  no_match_behavior: "trigger" | "ignore";
  system_prompt: string | null;
  is_active: boolean;
  steps?: FlowStep[];
};

// ── DB helpers ────────────────────────────────────────────────────────────

export async function getFlowById(flowId: string, organizationId: string): Promise<FlowDefinition | null> {
  if (!supabase) return null;

  const cached = await getCached<FlowDefinition>(fullFlowCacheKey(flowId));
  if (cached) return cached;

  const { data, error } = await supabase
    .from("flows")
    .select(
      `id, organization_id, name, trigger_phrase, trigger_first_word, keywords, no_match_behavior, system_prompt, is_active,
       steps:flow_steps(
         id, flow_id, organization_id, position, delay_seconds, trigger_keywords, label,
         messages:flow_step_messages(id, step_id, position, message_type, text_content, media_url, filename, caption)
       )`,
    )
    .eq("id", flowId)
    .eq("organization_id", organizationId)
    .eq("is_active", true)
    .maybeSingle();

  if (error) {
    log.error({ err: error }, "flowEngine: error fetching flow");
    return null;
  }
  if (data) await setCached(fullFlowCacheKey(flowId), data, FULL_FLOW_TTL);
  return (data as FlowDefinition | null) ?? null;
}

// ── Message sender ────────────────────────────────────────────────────────

export async function sendStepMessages(
  step: FlowStep,
  phone: string,
  state: ConversationState,
): Promise<void> {
  if (!step.messages?.length) return;

  const sorted = [...step.messages].sort((a, b) => a.position - b.position);
  const ctx = {
    metaPhoneNumberId: state.metaPhoneNumberId,
    organizationId: state.organizationId,
    conversationId: state.id ?? null,
    whatsappInstanceId: state.whatsappInstanceId,
    flowId: state.flowId,
    skipPayload: true, // no persistir payload JSONB para mensajes de flujos programados
  };

  for (const msg of sorted) {
    try {
      if (msg.message_type === "text" && msg.text_content) {
        await sendMessage(phone, textMessage(msg.text_content), ctx);
      } else if (msg.message_type === "image" && msg.media_url) {
        await sendMessage(
          phone,
          {
            type: "image",
            image: {
              link: msg.media_url,
              ...(msg.caption ? { caption: msg.caption } : {}),
            },
          },
          ctx,
        );
      } else if (msg.message_type === "document" && msg.media_url) {
        await sendMessage(
          phone,
          {
            type: "document",
            document: {
              link: msg.media_url,
              ...(msg.filename ? { filename: msg.filename } : {}),
              ...(msg.caption ? { caption: msg.caption } : {}),
            },
          },
          ctx,
        );
      } else if (msg.message_type === "video" && msg.media_url) {
        await sendMessage(
          phone,
          {
            type: "video",
            video: {
              link: msg.media_url,
              ...(msg.caption ? { caption: msg.caption } : {}),
            },
          },
          ctx,
        );
      } else if (msg.message_type === "audio" && msg.media_url) {
        await sendMessage(
          phone,
          { type: "audio", audio: { link: msg.media_url } },
          ctx,
        );
      }
    } catch (err) {
      log.error({ err, stepId: step.id, msgId: msg.id }, "flowEngine: error sending step message");
    }
  }
}

export async function startAssignedFlow(
  phone: string,
  state: ConversationState,
  fromStepId?: string,
): Promise<boolean> {
  if (!supabase || !state.organizationId || !state.flowId) return false;
  const flow = await getFlowById(state.flowId, state.organizationId);
  if (!flow?.steps?.length) return false;
  const sorted = [...flow.steps].sort((a, b) => a.position - b.position);

  // When starting from a specific step, slice from that step onwards.
  // Cumulative delay resets to 0 so the first step in the slice sends immediately.
  let steps = sorted;
  if (fromStepId) {
    const fromIndex = sorted.findIndex((s) => s.id === fromStepId);
    if (fromIndex === -1) return false; // stepId not found — abort instead of defaulting
    steps = sorted.slice(fromIndex);
  }

  if (!steps.length) return false;

  await cancelJobsForPhone(state.organizationId, phone);

  const now = Date.now();
  let cumulativeDelayMs = 0;

  for (const step of steps) {
    cumulativeDelayMs += step.delay_seconds * 1000;

    if (cumulativeDelayMs === 0) {
      // First step with no delay → send immediately
      await sendStepMessages(step, phone, state);
    } else {
      const payload: ScheduledJobPayload = {
        id: crypto.randomUUID(),
        orgId: state.organizationId,
        phone,
        stepId: step.id,
        conversationId: state.id ?? null,
        instanceId: state.whatsappInstanceId ?? null,
        metaPhoneNumberId: state.metaPhoneNumberId ?? null,
        flowId: state.flowId ?? null,
        sendAt: now + cumulativeDelayMs,
      };
      await scheduleJob(payload);
    }
  }

  log.info(
    { flowId: flow.id, phone, steps: steps.length, fromStepId, event: "flow.started" },
    `Flow started: ${flow.name}`,
  );

  return true;
}

