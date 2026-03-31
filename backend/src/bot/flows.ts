import { askAssistant } from "../ai/assistant";
import { textMessage, welcomeButtons } from "./messages";
import { sendMessage } from "./sender";
import type { ConversationState } from "../types";
import { getFlowById } from "../db/flows";
import { log } from "../logger";

/**
 * Resolve prompt from assigned flow with safe fallback.
 */
async function resolvePrompt(flowId: string | null, fallbackName: string | null): Promise<string> {
  if (flowId) {
    const flow = await getFlowById(flowId);
    if (flow?.system_prompt?.trim()) {
      return `Eres asistente del flow "${flow.name}". ${flow.system_prompt}`;
    }
    if (flow?.name) {
      return `Eres el asistente del flow ${flow.name}. Responde en español, sé amigable y conciso.`;
    }
  }
  if (fallbackName) {
    return `Eres el asistente del flow ${fallbackName}. Responde en español, sé amigable y conciso.`;
  }
  return "Eres un asistente de ventas por WhatsApp. Responde en español, sé amigable y conciso.";
}

export async function handleFlow(type: string, phone: string, text: string, state: ConversationState) {
  const flowName = state.flowName ?? "flujo principal";

  const ctx = {
    metaPhoneNumberId: state.metaPhoneNumberId,
    organizationId: state.organizationId,
    conversationId: state.id ?? null,
    whatsappInstanceId: state.whatsappInstanceId,
    flowId: state.flowId,
  };

  if (type === "greeting") {
    await sendMessage(phone, welcomeButtons(), ctx);
    if (state.flowId) {
      await sendMessage(
        phone,
        textMessage(`Te ayudo con ${flowName}. Si quieres precio, escribe "precio"; para pagar, escribe "pagar".`),
        ctx,
      );
    }
    return { ...state, stage: "saludo", flowName: state.flowName ?? null };
  }

  if (type === "products") {
    await sendMessage(phone, textMessage(`Tenemos info activa de ${flowName}. Escribe 'pagar' para continuar.`), ctx);
    return { ...state, stage: "catalogo", flowName: state.flowName ?? null };
  }

  if (type === "pay") {
    await sendMessage(phone, textMessage("Perfecto. Envia tu comprobante en foto para validarlo."), ctx);
    return { ...state, stage: "esperando_comprobante", flowName: state.flowName ?? null };
  }

  if (type === "price") {
    await sendMessage(phone, textMessage(`Los precios de ${flowName} dependen del plan. Escribe 'pagar' para continuar.`), ctx);
    return { ...state, stage: "precio", flowName: state.flowName ?? null };
  }

  if (type === "help") {
    await sendMessage(phone, textMessage(`Estoy para ayudarte con ${flowName}, precios y pagos.`), ctx);
    return { ...state, stage: "ayuda", flowName: state.flowName ?? null };
  }

  const systemPrompt = await resolvePrompt(state.flowId ?? null, state.flowName ?? null);
  const ai = await askAssistant(text, systemPrompt);

  if (!ai.reply) {
    log.warn({ phone, type, event: "bot.ai_empty_reply" }, "AI returned empty reply, using fallback");
  }

  await sendMessage(phone, textMessage(ai.reply ?? "Te respondo en breve."), ctx);
  return { ...state, stage: ai.next_state ?? state.stage, flowName: state.flowName ?? null };
}
