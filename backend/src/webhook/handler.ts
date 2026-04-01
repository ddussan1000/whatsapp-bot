import type { Context } from "hono";
import { classify } from "../bot/classifier";
import { handleFlow } from "../bot/flows";
import { startAssignedFlow, getFlowById as getFullFlow } from "../bot/flowEngine";
import { getState, setState } from "../cache/redis";
import type { ConversationState, WhatsAppMessage, WhatsAppReferral } from "../types";
import { classifyAndHandleImage } from "../receipts/handler";
import { upsertConversation } from "../db/conversations";
import { log } from "../logger";
import { alertAdmin } from "../alerts/telegram";
import { insertMessageLog, updateMessageDeliveryStatus } from "../db/messages";
import { findFlowByCtwaClid, getFlowById, matchesFlowTrigger } from "../db/flows";
import { getActiveInstanceByPhoneNumberId } from "../db/instances";
import { supabase } from "../db/supabase";

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
) {
  if (!supabase) return;
  try {
    await supabase.from("ad_click_logs").insert({
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
    });
  } catch (err) {
    log.warn({ err }, "logAdClick: failed to insert ad_click_log");
  }
}

export async function handleWebhook(c: Context) {
  try {
    const body = await c.req.json();
    const entry = body.entry?.[0];
    const change = entry?.changes?.[0]?.value;
    const metaPhoneNumberId = (change?.metadata?.phone_number_id ?? "") as string;
    const instance = metaPhoneNumberId ? await getActiveInstanceByPhoneNumberId(metaPhoneNumberId) : null;
    const organizationId = instance?.organization_id ?? null;
    if (!organizationId) {
      log.warn({ metaPhoneNumberId }, "Webhook ignorado: no se encontro instancia activa para phone_number_id");
      return c.text("ok");
    }
    const statusUpdates = (change?.statuses ?? []) as Array<{ id?: string; status?: string; timestamp?: string }>;
    if (statusUpdates.length > 0) {
      await Promise.all(
        statusUpdates
          .filter((s) => s.id && s.status)
          .map((s) =>
            updateMessageDeliveryStatus({
              organizationId,
              metaMessageId: s.id as string,
              status: s.status as string,
              timestamp: s.timestamp ?? null,
            }),
          ),
      );
      return c.text("ok");
    }

    const msg = change?.messages?.[0] as WhatsAppMessage | undefined;
    if (!msg) return c.text("ok");

    const phone = msg.from;
    const previousConversation = await supabase
      ?.from("conversations")
      .select("id, updated_at, flow_id, product")
      .eq("organization_id", organizationId)
      .eq("phone", phone)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const previous = previousConversation?.data ?? null;

    const state = await getState(phone, metaPhoneNumberId || null);

    const referral = extractReferral(msg);
    const ctwaClid = referral?.ctwa_clid ?? null;
    const referredFlow = organizationId && ctwaClid ? await findFlowByCtwaClid(organizationId, ctwaClid) : null;
    const assignedFlow = instance?.flow_id ? await getFlowById(instance.flow_id) : null;
    const runtimeFlow = referredFlow ?? assignedFlow;
    if (!runtimeFlow) {
      log.warn({ phone, organizationId, instanceId: instance?.id }, "Webhook ignorado: instancia sin flow asignado");
      return c.text("ok");
    }

    if (referral) {
      await logAdClick(organizationId, runtimeFlow.id, phone, referral);
    }

    const lastUpdated = previous?.updated_at ? new Date(previous.updated_at).getTime() : 0;
    const timeoutMs = (runtimeFlow.session_timeout_hours ?? 24) * 60 * 60 * 1000;
    const expired = lastUpdated > 0 ? Date.now() - lastUpdated > timeoutMs : true;
    const needsTrigger = !previous?.id || expired;
    const inboundText = msg.type === "text" ? msg.text?.body ?? "" : "";
    const triggerMatched = msg.type === "text" ? matchesFlowTrigger(inboundText, runtimeFlow) : true;
    const shouldStartFlow = needsTrigger && (triggerMatched || runtimeFlow.no_match_behavior === "trigger");
    if (needsTrigger && !shouldStartFlow) {
      return c.text("ok");
    }

    const conv = await upsertConversation({
      organizationId,
      phone,
      stage: state.stage,
      flowId: runtimeFlow.id,
      flowName: runtimeFlow.name,
      whatsappInstanceId: instance?.id ?? state.whatsappInstanceId ?? null,
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
            ? msg.interactive?.button_reply?.title ?? msg.interactive?.list_reply?.title ?? null
            : null,
      payload: msg as unknown as Record<string, unknown>,
      metaMessageId: (msg as unknown as { id?: string }).id ?? null,
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
      const imgResult = await classifyAndHandleImage(msg, phone, nextState);
      if (imgResult.handled) {
        nextState = imgResult.state;
      }
      // If not handled (not a receipt), do nothing -- image was not a receipt, flow continues silently
    } else if (shouldStartFlow) {
      const fullFlow = await getFullFlow(runtimeFlow.id, organizationId);
      const hasSteps = Boolean(fullFlow?.steps?.length);
      if (hasSteps) {
        await startAssignedFlow(phone, nextState);
        nextState = { ...nextState, stage: "flow_started" };
      } else {
        if (msg.type === "text" && text) {
          nextState = await handleFlow(type, phone, text, nextState);
        }
      }
    } else {
      if (msg.type === "text" && text) {
        nextState = await handleFlow(type, phone, text, nextState);
      }
    }

    await setState(phone, nextState, metaPhoneNumberId || null);
    await upsertConversation({
      organizationId,
      phone,
      stage: nextState.stage,
      flowId: nextState.flowId,
      flowName: nextState.flowName,
      whatsappInstanceId: nextState.whatsappInstanceId,
    });
    log.info({ phone, type, stage: nextState.stage }, "mensaje procesado");
    return c.text("ok");
  } catch (err) {
    await alertAdmin(`Error webhook: ${(err as Error).message}`, "error");
    log.error({ err }, "fallo al procesar webhook");
    return c.text("ok");
  }
}
