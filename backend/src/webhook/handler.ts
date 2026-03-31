import type { Context } from "hono";
import { classify } from "../bot/classifier";
import { handleFlow } from "../bot/flows";
import { startAssignedFlow } from "../bot/flowEngine";
import { getState, setState } from "../cache/redis";
import type { ConversationState, WhatsAppMessage } from "../types";
import { handleReceipt } from "../receipts/handler";
import { upsertConversation } from "../db/conversations";
import { log } from "../logger";
import { alertAdmin } from "../alerts/telegram";
import { insertMessageLog, updateMessageDeliveryStatus } from "../db/messages";
import { findFlowByCtwaClid, getFlowById, matchesFlowTrigger } from "../db/flows";
import { getActiveInstanceByPhoneNumberId } from "../db/instances";
import { supabase } from "../db/supabase";

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
    const ctwaClid = (msg as unknown as { referral?: { ctwa_clid?: string } }).referral?.ctwa_clid ?? null;
    const referredFlow = organizationId && ctwaClid ? await findFlowByCtwaClid(organizationId, ctwaClid) : null;
    const assignedFlow = instance?.flow_id ? await getFlowById(instance.flow_id) : null;
    const runtimeFlow = referredFlow ?? assignedFlow;
    if (!runtimeFlow) {
      log.warn({ phone, organizationId, instanceId: instance?.id }, "Webhook ignorado: instancia sin flow asignado");
      return c.text("ok");
    }

    const lastUpdated = previous?.updated_at ? new Date(previous.updated_at).getTime() : 0;
    const expired = lastUpdated > 0 ? Date.now() - lastUpdated > 24 * 60 * 60 * 1000 : true;
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
    const nextBaseState = {
      ...state,
      ...(conversationId && conversationId.length > 0 ? { id: conversationId } : {}),
      organizationId,
      flowId: runtimeFlow.id,
      flowName: runtimeFlow.name,
      whatsappInstanceId: instance?.id ?? state.whatsappInstanceId ?? null,
      metaPhoneNumberId: metaPhoneNumberId || state.metaPhoneNumberId || null,
    };

    const type = classify(msg, { productKeywords: runtimeFlow.keywords ?? [] });
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
    if (type === "receipt") {
      nextState = await handleReceipt(msg, phone, nextState);
    } else if (shouldStartFlow) {
      await startAssignedFlow(phone, nextState);
      if (msg.type === "text" && text) {
        nextState = await handleFlow(type, phone, text, nextState);
      }
    } else {
      nextState = await handleFlow(type, phone, text, nextState);
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
