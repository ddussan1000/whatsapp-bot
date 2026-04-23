import type { Context } from "hono";
import { classify } from "../bot/classifier";
import { handleFlow } from "../bot/flows";
import {
  startAssignedFlow,
  getFlowById as getFullFlow,
} from "../bot/flowEngine";
import { getState, setState, isDuplicate } from "../cache/redis";
import type {
  ConversationState,
  WhatsAppMessage,
  WhatsAppReferral,
} from "../types";
import { classifyAndHandleImage } from "../receipts/handler";
import { downloadFromMetaWithType } from "../receipts/downloader";
import { saveInboundMedia } from "../receipts/storage";
import { upsertConversation } from "../db/conversations";
import { log } from "../logger";
import { alertAdmin } from "../alerts/telegram";
import { insertMessageLog, updateMessageDeliveryStatus, updateMessageMediaUrl } from "../db/messages";
import {
  findFlowByCtwaClid,
  getFlowById,
  matchesFlowTrigger,
} from "../db/flows";
import { getActiveInstanceByPhoneNumberId } from "../db/instances";
import { supabase } from "../db/supabase";
import { fetchAdDetails } from "../meta/adDetails";
import { validateWebhookSignature } from "./validateSignature";

function extractReferral(msg: WhatsAppMessage): WhatsAppReferral | null {
  const ref = (msg as unknown as { referral?: WhatsAppReferral }).referral;
  if (!ref || (!ref.ctwa_clid && !ref.source_id)) return null;
  return ref;
}

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
        media_type: referral.image?.id
          ? "image"
          : referral.video?.id
            ? "video"
            : null,
        media_id: referral.image?.id || referral.video?.id || null,
      })
      .select("id")
      .single();

    // Enrich with ad/campaign/adset names from Meta Ads API (fire-and-forget)
    if (
      row?.id &&
      referral.source_id &&
      referral.source_type === "ad" &&
      metaToken
    ) {
      fetchAdDetails(referral.source_id, metaToken)
        .then((details) => {
          if (!details.adName && !details.campaignName) return; // nothing enriched
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

export async function handleWebhook(c: Context) {
  try {
    // Leer raw body antes de parsear — necesario para verificar firma HMAC-SHA256
    const rawBody = await c.req.text();
    const body = JSON.parse(rawBody);
    const entry = body.entry?.[0];
    const change = entry?.changes?.[0]?.value;
    const metaPhoneNumberId = (change?.metadata?.phone_number_id ??
      "") as string;
    const instance = metaPhoneNumberId
      ? await getActiveInstanceByPhoneNumberId(metaPhoneNumberId)
      : null;

    // Verificar firma del webhook si la instancia tiene app_secret configurado
    if (instance?.app_secret) {
      const signature = c.req.header("x-hub-signature-256");
      if (!validateWebhookSignature(rawBody, signature, instance.app_secret)) {
        log.warn({ metaPhoneNumberId }, "webhook: firma inválida, rechazando");
        return c.text("Unauthorized", 401);
      }
    }
    const organizationId = instance?.organization_id ?? null;
    if (!organizationId) {
      log.warn(
        { metaPhoneNumberId },
        "Webhook ignorado: no se encontro instancia activa para phone_number_id",
      );
      return c.text("ok");
    }
    const statusUpdates = (change?.statuses ?? []) as Array<{
      id?: string;
      status?: string;
      timestamp?: string;
    }>;
    if (statusUpdates.length > 0) {
      for (const s of statusUpdates.filter((s) => s.id && s.status)) {
        if (s.status === "failed") {
          log.warn(
            { metaMessageId: s.id, organizationId, metaPhoneNumberId },
            "webhook: Meta reportó fallo de entrega de mensaje",
          );
        }
        await updateMessageDeliveryStatus({
          organizationId,
          metaMessageId: s.id as string,
          status: s.status as string,
          timestamp: s.timestamp ?? null,
        });
      }
      return c.text("ok");
    }

    const msg = change?.messages?.[0] as WhatsAppMessage | undefined;
    if (!msg) return c.text("ok");

    // Deduplicar: ignorar mensajes ya procesados (Meta puede reenviar)
    const metaMsgId = (msg as unknown as { id?: string }).id;
    if (metaMsgId) {
      const alreadyProcessed = await isDuplicate(`dedup:msg:${metaMsgId}`, 300);
      if (alreadyProcessed) {
        log.info({ metaMsgId }, "webhook: mensaje duplicado ignorado");
        return c.text("ok");
      }
    }

    const phone = msg.from;
    const contactName =
      (
        change?.contacts as Array<{ profile?: { name?: string } }> | undefined
      )?.[0]?.profile?.name ?? null;
    const previousConversation = await supabase
      ?.from("conversations")
      .select("id, updated_at, flow_id, product, stage")
      .eq("organization_id", organizationId)
      .eq("phone", phone)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const previous = previousConversation?.data ?? null;

    const state = await getState(phone, metaPhoneNumberId || null);

    // Fall back to DB stage if Redis cache expired.
    // Also catches the case where Redis returned the default "nuevo" for an existing conversation.
    if ((!state.stage || state.stage === "nuevo") && previous?.stage && previous.stage !== "nuevo") {
      state.stage = previous.stage as string;
    }

    // Track if the user already has a confirmed payment, so a second receipt goes to manual review
    const alreadyPaid = state.stage === "pago_confirmado";

    const referral = extractReferral(msg);
    const ctwaClid = referral?.ctwa_clid ?? null;
    const referredFlow =
      organizationId && ctwaClid
        ? await findFlowByCtwaClid(organizationId, ctwaClid)
        : null;
    const assignedFlow = instance?.flow_id
      ? await getFlowById(instance.flow_id)
      : null;
    const runtimeFlow = referredFlow ?? assignedFlow;
    if (!runtimeFlow) {
      log.warn(
        { phone, organizationId, instanceId: instance?.id },
        "Webhook ignorado: instancia sin flow asignado",
      );
      return c.text("ok");
    }

    if (referral) {
      await logAdClick(
        organizationId,
        runtimeFlow.id,
        phone,
        referral,
        instance?.meta_token ?? null,
      );
    }

    const lastUpdated = previous?.updated_at
      ? new Date(previous.updated_at).getTime()
      : 0;
    const sessionTimeoutHours = runtimeFlow.session_timeout_hours ?? 24;
    // session_timeout_hours = 0 means "no persistent session" — treat every message as a fresh start
    const timeoutMs = sessionTimeoutHours * 60 * 60 * 1000;
    const expired =
      sessionTimeoutHours === 0
        ? true
        : lastUpdated > 0
          ? Date.now() - lastUpdated > timeoutMs
          : true;
    const needsTrigger = !previous?.id || expired;
    const inboundText = msg.type === "text" ? (msg.text?.body ?? "") : "";
    const triggerMatched =
      msg.type === "text" ? matchesFlowTrigger(inboundText, runtimeFlow) : true;

    // Guard: don't restart a flow that still has pending scheduled steps being delivered
    const pendingResult = supabase
      ? await supabase
          .from("scheduled_flow_messages")
          .select("id", { count: "exact", head: true })
          .eq("organization_id", organizationId)
          .eq("phone", phone)
          .eq("status", "pending")
      : null;
    const flowIsInProgress = (pendingResult?.count ?? 0) > 0;

    // Starting a new session always requires an explicit trigger match.
    // no_match_behavior="trigger" only applies within an active session (unmatched messages
    // fall through to the AI handler below, but never auto-restart the flow from step 0).
    const shouldStartFlow = !flowIsInProgress && needsTrigger && triggerMatched;

    // If session needs a trigger, the phrase didn't match, and no_match_behavior = "ignore" → drop the message
    if (
      !flowIsInProgress &&
      needsTrigger &&
      !triggerMatched &&
      runtimeFlow.no_match_behavior !== "trigger"
    ) {
      return c.text("ok");
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
      ...(conversationId && conversationId.length > 0
        ? { id: conversationId }
        : {}),
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
      whatsappInstanceId:
        instance?.id ?? nextBaseState.whatsappInstanceId ?? null,
      flowId: runtimeFlow.id,
      phone,
      direction: "inbound",
      messageType: msg.type === "interactive" ? "interactive" : msg.type,
      textBody:
        msg.type === "text"
          ? text
          : msg.type === "interactive"
            ? (msg.interactive?.button_reply?.title ??
              msg.interactive?.list_reply?.title ??
              null)
            : null,
      payload: msg as unknown as Record<string, unknown>,
      metaMessageId: (msg as unknown as { id?: string }).id ?? null,
    });

    let nextState: ConversationState = {
      ...nextBaseState,
      organizationId,
      metaPhoneNumberId:
        metaPhoneNumberId || nextBaseState.metaPhoneNumberId || null,
      flowId: runtimeFlow.id,
      flowName: runtimeFlow.name,
      whatsappInstanceId:
        instance?.id ?? nextBaseState.whatsappInstanceId ?? null,
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
      // If not handled (not a receipt), image was saved but flow continues silently
    } else if ((msg as unknown as { type: string }).type === "audio") {
      persistInboundAudio(msg, phone, organizationId, instance?.meta_token ?? null, metaMsgId ?? null).catch(() => {});
      if (shouldStartFlow) {
        const fullFlow = await getFullFlow(runtimeFlow.id, organizationId);
        if (fullFlow?.steps?.length) {
          await startAssignedFlow(phone, nextState);
          nextState = { ...nextState, stage: "en_flujo" };
        }
      }
    } else if (shouldStartFlow) {
      const fullFlow = await getFullFlow(runtimeFlow.id, organizationId);
      const hasSteps = Boolean(fullFlow?.steps?.length);
      if (hasSteps) {
        await startAssignedFlow(phone, nextState);
        nextState = { ...nextState, stage: "en_flujo" };
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
    return c.text("ok");
  } catch (err) {
    await alertAdmin(`Error webhook: ${(err as Error).message}`, "error");
    log.error({ err }, "fallo al procesar webhook");
    return c.text("ok");
  }
}
