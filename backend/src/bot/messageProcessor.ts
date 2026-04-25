/**
 * Message processor — lógica de negocio extraída del webhook handler.
 * Llamado por el BullMQ worker (async) o directamente como fallback síncrono.
 */

import { redis, getState, setState } from "../cache/redis";
import { messageQueue } from "../queue/messageQueue";
import { upsertConversation, getCachedPreviousConversation } from "../db/conversations";
import { insertMessageLog, updateMessageMediaUrl } from "../db/messages";
import { getFlowById, findFlowByCtwaClid, matchesFlowTrigger } from "../db/flows";
import { getFlowById as getFullFlow, startAssignedFlow } from "./flowEngine";
import { handleFlow } from "./flows";
import { classify } from "./classifier";
import { classifyAndHandleImage } from "../receipts/handler";
import { downloadFromMetaWithType } from "../receipts/downloader";
import { saveInboundMedia } from "../receipts/storage";
import { getActiveInstanceByPhoneNumberId } from "../db/instances";
import { hasPendingJobs } from "../queue/scheduledMessages";
import { alertAdmin } from "../alerts/telegram";
import { supabase } from "../db/supabase";
import { fetchAdDetails } from "../meta/adDetails";
import { STAGES, conversationStageSchema } from "../stages";
import { log } from "../logger";
import type { ConversationState, WhatsAppMessage, WhatsAppReferral } from "../types";
import type { MessageJobData } from "../queue/messageQueue";

// ── Helpers ────────────────────────────────────────────────────────────────

async function logAdClick(
  organizationId: string,
  flowId: string | null,
  phone: string,
  referral: WhatsAppReferral,
  metaToken: string | null,
) {
  if (!supabase) return;
  try {
    const { data: row } = await supabase
      .from("ad_click_logs")
      .insert({
        organization_id: organizationId,
        flow_id: flowId,
        phone,
        ctwa_clid: referral.ctwa_clid ?? null,
        source_id: referral.source_id ?? null,
        source_type: referral.source_type ?? null,
        source_url: referral.source_url ?? null,
        headline: referral.headline ?? null,
        body: referral.body ?? null,
        media_type: referral.image?.id ? "image" : referral.video?.id ? "video" : null,
        media_id: referral.image?.id || referral.video?.id || null,
      })
      .select("id")
      .single();

    if (row?.id && referral.source_id && referral.source_type === "ad" && metaToken) {
      fetchAdDetails(referral.source_id, metaToken)
        .then((details) => {
          if (!details.adName && !details.campaignName) return;
          return supabase
            ?.from("ad_click_logs")
            .update({
              ad_name: details.adName,
              campaign_id: details.campaignId,
              campaign_name: details.campaignName,
              adset_id: details.adsetId,
              adset_name: details.adsetName,
            })
            .eq("id", row.id);
        })
        .catch((err) => log.warn({ err }, "logAdClick: ad enrichment failed"));
    }
  } catch (err) {
    log.warn({ err }, "logAdClick: failed to insert ad_click_log");
  }
}

function extFromMime(mimeType: string): string {
  const base = (mimeType.split(";")[0] ?? mimeType).trim().toLowerCase();
  const map: Record<string, string> = {
    "audio/ogg": "ogg",
    "audio/mpeg": "mp3",
    "audio/mp4": "m4a",
    "audio/aac": "aac",
    "audio/amr": "amr",
  };
  return map[base] ?? "ogg";
}

async function persistInboundAudio(
  msg: WhatsAppMessage,
  phone: string,
  organizationId: string,
  metaToken: string | null,
  metaMessageId: string | null,
) {
  const m = msg as unknown as { audio?: { id?: string; mime_type?: string } };
  const mediaId = m.audio?.id;
  if (!mediaId || !metaToken) return;
  try {
    const { buffer, mimeType } = await downloadFromMetaWithType(mediaId, metaToken);
    const ext = extFromMime(mimeType);
    const saved = await saveInboundMedia({
      buffer,
      phone,
      organizationId,
      mediaType: "audio",
      contentType: (mimeType.split(";")[0] ?? mimeType).trim(),
      ext,
    });
    if (saved.publicUrl && metaMessageId) {
      updateMessageMediaUrl(metaMessageId, saved.publicUrl).catch(() => {});
    }
  } catch (err) {
    log.warn({ err, phone, mediaId }, "persistInboundAudio: falló, sin R2 URL");
  }
}

// ── Main processor ─────────────────────────────────────────────────────────

const PHONE_LOCK_TTL = 60;
const phoneLockKey = (metaPhoneNumberId: string, phone: string) =>
  `lock:phone:${metaPhoneNumberId}:${phone}`;

export async function processMessageJob(data: MessageJobData): Promise<void> {
  const { organizationId, metaPhoneNumberId, phone, contactName, referral, msg } = data;

  let phoneLocked = false;
  if (redis) {
    const lockKey = phoneLockKey(metaPhoneNumberId, phone);
    const acquired = await redis.set(lockKey, "1", "EX", PHONE_LOCK_TTL, "NX");
    if (!acquired) {
      // Another message from this phone is in progress — requeue with a short delay
      if (messageQueue) {
        await messageQueue.add("process", data, { delay: 2000 }).catch(() => {});
      }
      log.info({ phone }, "processMessageJob: phone ocupado, mensaje diferido 2s");
      return;
    }
    phoneLocked = true;
  }

  try {
    const instance = await getActiveInstanceByPhoneNumberId(metaPhoneNumberId);
    if (!instance) {
      log.warn({ metaPhoneNumberId }, "processMessageJob: instancia no encontrada");
      return;
    }

    const metaMsgId = (msg as unknown as { id?: string }).id ?? null;
    const previous = await getCachedPreviousConversation(organizationId, phone);
    const state = await getState(phone, metaPhoneNumberId);

    if ((!state.stage || state.stage === STAGES.nuevo) && previous?.stage && previous.stage !== STAGES.nuevo) {
      state.stage = conversationStageSchema.catch(STAGES.nuevo).parse(previous.stage);
    }

    const alreadyPaid = state.stage === STAGES.pago_confirmado;

    const referredFlow = organizationId && referral?.ctwa_clid
      ? await findFlowByCtwaClid(organizationId, referral.ctwa_clid)
      : null;
    const assignedFlow = instance?.flow_id ? await getFlowById(instance.flow_id) : null;
    const runtimeFlow = referredFlow ?? assignedFlow;
    if (!runtimeFlow) {
      log.warn({ phone, organizationId }, "processMessageJob: sin flow asignado");
      return;
    }

    if (referral) {
      await logAdClick(organizationId, runtimeFlow.id, phone, referral, instance?.meta_token ?? null);
    }

    const lastUpdated = previous?.updated_at ? new Date(previous.updated_at).getTime() : 0;
    const sessionTimeoutHours = runtimeFlow.session_timeout_hours ?? 24;
    const timeoutMs = sessionTimeoutHours * 60 * 60 * 1000;
    const expired = sessionTimeoutHours === 0
      ? true
      : lastUpdated > 0 ? Date.now() - lastUpdated > timeoutMs : true;
    const needsTrigger = !previous?.id || expired;
    const inboundText = msg.type === "text" ? (msg.text?.body ?? "") : "";
    const triggerMatched = msg.type === "text" ? matchesFlowTrigger(inboundText, runtimeFlow) : true;

    const flowIsInProgress = await hasPendingJobs(organizationId, phone);

    const shouldStartFlow =
      !flowIsInProgress &&
      needsTrigger &&
      (triggerMatched || runtimeFlow.no_match_behavior === "trigger");

    if (!flowIsInProgress && needsTrigger && !triggerMatched && runtimeFlow.no_match_behavior !== "trigger") {
      return;
    }

    const conv = await upsertConversation({
      organizationId,
      phone,
      stage: state.stage,
      flowId: runtimeFlow.id,
      flowName: runtimeFlow.name,
      whatsappInstanceId: instance?.id ?? state.whatsappInstanceId ?? null,
      contactName,
    });
    const conversationId = conv?.id ?? state.id ?? null;
    const nextBaseState: ConversationState = {
      ...state,
      ...(conversationId && conversationId.length > 0 ? { id: conversationId } : {}),
      organizationId,
      flowId: runtimeFlow.id,
      flowName: runtimeFlow.name,
      whatsappInstanceId: instance?.id ?? state.whatsappInstanceId ?? null,
      metaPhoneNumberId: metaPhoneNumberId || state.metaPhoneNumberId || null,
    };

    const type = classify(msg);
    const text = inboundText;
    await insertMessageLog({
      organizationId,
      conversationId,
      whatsappInstanceId: instance?.id ?? nextBaseState.whatsappInstanceId ?? null,
      flowId: runtimeFlow.id,
      phone,
      direction: "inbound",
      messageType: msg.type === "interactive" ? "interactive" : msg.type,
      textBody:
        msg.type === "text"
          ? text
          : msg.type === "interactive"
            ? ((msg as unknown as { interactive?: { button_reply?: { title?: string }; list_reply?: { title?: string } } }).interactive?.button_reply?.title ??
              (msg as unknown as { interactive?: { button_reply?: { title?: string }; list_reply?: { title?: string } } }).interactive?.list_reply?.title ??
              null)
            : null,
      payload: msg as unknown as Record<string, unknown>,
      metaMessageId: metaMsgId,
    });

    let nextState: ConversationState = {
      ...nextBaseState,
      organizationId,
      metaPhoneNumberId: metaPhoneNumberId || nextBaseState.metaPhoneNumberId || null,
      flowId: runtimeFlow.id,
      flowName: runtimeFlow.name,
      whatsappInstanceId: instance?.id ?? nextBaseState.whatsappInstanceId ?? null,
    };

    if (type === "image") {
      const imgResult = await classifyAndHandleImage(
        msg,
        phone,
        nextState,
        instance?.meta_token ?? null,
        instance?.currency ?? "COP",
        alreadyPaid,
        instance?.high_amount_threshold ?? null,
      );
      if (imgResult.handled) {
        nextState = imgResult.state;
      }
    } else if ((msg as unknown as { type: string }).type === "audio") {
      persistInboundAudio(msg, phone, organizationId, instance?.meta_token ?? null, metaMsgId).catch(() => {});
      if (shouldStartFlow) {
        const fullFlow = await getFullFlow(runtimeFlow.id, organizationId);
        if (fullFlow?.steps?.length) {
          await startAssignedFlow(phone, nextState);
          nextState = { ...nextState, stage: STAGES.en_flujo };
        }
      }
    } else if (shouldStartFlow) {
      const fullFlow = await getFullFlow(runtimeFlow.id, organizationId);
      const hasSteps = Boolean(fullFlow?.steps?.length);
      if (hasSteps) {
        await startAssignedFlow(phone, nextState);
        nextState = { ...nextState, stage: STAGES.en_flujo };
      } else {
        if (msg.type === "text" && text) {
          nextState = await handleFlow(type, phone, text, nextState);
        }
      }
    } else if (!flowIsInProgress) {
      if (msg.type === "text" && text) {
        nextState = await handleFlow(type, phone, text, nextState);
      }
    }

    await setState(phone, nextState, metaPhoneNumberId || null);
    if (
      nextState.stage !== state.stage ||
      nextState.flowId !== state.flowId ||
      nextState.flowName !== state.flowName
    ) {
      await upsertConversation({
        organizationId,
        phone,
        stage: nextState.stage,
        flowId: nextState.flowId,
        flowName: nextState.flowName,
        whatsappInstanceId: nextState.whatsappInstanceId,
      });
    }

    log.info({ phone, type, stage: nextState.stage }, "mensaje procesado");
  } catch (err) {
    await alertAdmin(`Error procesando mensaje: ${(err as Error).message}`, "error");
    log.error({ err, phone, organizationId }, "processMessageJob: fallo al procesar");
  } finally {
    if (phoneLocked && redis) {
      await redis.del(phoneLockKey(metaPhoneNumberId, phone)).catch(() => {});
    }
  }
}
