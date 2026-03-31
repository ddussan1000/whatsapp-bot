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

// ── Types ─────────────────────────────────────────────────────────────────

export type FlowMessageType = "text" | "image" | "document" | "video";

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
      }
    } catch (err) {
      log.error({ err, stepId: step.id, msgId: msg.id }, "flowEngine: error sending step message");
    }
  }
}

export async function startAssignedFlow(
  phone: string,
  state: ConversationState,
): Promise<boolean> {
  if (!supabase || !state.organizationId || !state.flowId) return false;
  const flow = await getFlowById(state.flowId, state.organizationId);
  if (!flow?.steps?.length) return false;
  const sorted = [...flow.steps].sort((a, b) => a.position - b.position);

  await supabase
    .from("scheduled_flow_messages")
    .update({ status: "cancelled" })
    .eq("organization_id", state.organizationId)
    .eq("phone", phone)
    .eq("status", "pending");

  const now = Date.now();
  let cumulativeDelayMs = 0;

  for (const step of sorted) {
    cumulativeDelayMs += step.delay_seconds * 1000;

    if (cumulativeDelayMs === 0) {
      // First step with no delay → send immediately
      await sendStepMessages(step, phone, state);
    } else {
      // Schedule future step
      const scheduledAt = new Date(now + cumulativeDelayMs).toISOString();
      await supabase.from("scheduled_flow_messages").insert({
        organization_id: state.organizationId,
        conversation_id: state.id ?? null,
        step_id: step.id,
        phone,
        whatsapp_instance_id: state.whatsappInstanceId ?? null,
        meta_phone_number_id: state.metaPhoneNumberId ?? null,
        flow_id: state.flowId ?? null,
        scheduled_at: scheduledAt,
        status: "pending",
      });
    }
  }

  log.info(
    { flowId: flow.id, phone, steps: sorted.length, event: "flow.started" },
    `Flow started: ${flow.name}`,
  );

  return true;
}

// ── Scheduled message processor ───────────────────────────────────────────

/**
 * Called by the cron job every minute.
 * Fetches all pending scheduled messages due now and sends them.
 */
export async function processScheduledMessages(): Promise<void> {
  if (!supabase) return;

  const now = new Date().toISOString();

  const { data: pending, error } = await supabase
    .from("scheduled_flow_messages")
    .select(
      `id, organization_id, conversation_id, step_id, phone,
       whatsapp_instance_id, meta_phone_number_id, flow_id`,
    )
    .eq("status", "pending")
    .lte("scheduled_at", now)
    .limit(50);

  if (error) {
    log.error({ err: error }, "processScheduledMessages: fetch error");
    return;
  }

  if (!pending?.length) return;

  log.info({ count: pending.length }, "processScheduledMessages: processing batch");

  for (const row of pending) {
    try {
      // Fetch the step with its messages
      const { data: step, error: stepErr } = await supabase
        .from("flow_steps")
        .select(
          `id, flow_id, organization_id, position, delay_seconds, trigger_keywords, label,
           messages:flow_step_messages(id, step_id, position, message_type, text_content, media_url, filename, caption)`,
        )
        .eq("id", row.step_id)
        .maybeSingle();

      if (stepErr || !step) {
        log.warn({ stepId: row.step_id }, "processScheduledMessages: step not found");
        await supabase
          .from("scheduled_flow_messages")
          .update({ status: "failed", sent_at: now })
          .eq("id", row.id);
        continue;
      }

      const fakeState: ConversationState = {
        stage: "flow",
        organizationId: row.organization_id,
        id: row.conversation_id ?? null,
        flowId: row.flow_id ?? null,
        whatsappInstanceId: row.whatsapp_instance_id ?? null,
        metaPhoneNumberId: row.meta_phone_number_id ?? null,
        flowName: null,
        history: [],
      };

      await sendStepMessages(step as FlowStep, row.phone, fakeState);

      await supabase
        .from("scheduled_flow_messages")
        .update({ status: "sent", sent_at: new Date().toISOString() })
        .eq("id", row.id);
    } catch (err) {
      log.error({ err, rowId: row.id }, "processScheduledMessages: send error");
      await supabase
        .from("scheduled_flow_messages")
        .update({ status: "failed" })
        .eq("id", row.id);
    }
  }
}
