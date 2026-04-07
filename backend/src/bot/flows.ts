import { askAssistantForOrg } from "../ai/assistant";
import { textMessage } from "./messages";
import { sendMessage } from "./sender";
import type { ConversationState } from "../types";
import { getFlowById } from "../db/flows";
import { getOrgAiConfig } from "../db/organizations";
import { log } from "../logger";

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

export async function handleFlow(_type: string, phone: string, text: string, state: ConversationState) {
  const ctx = {
    metaPhoneNumberId: state.metaPhoneNumberId,
    organizationId: state.organizationId,
    conversationId: state.id ?? null,
    whatsappInstanceId: state.whatsappInstanceId,
    flowId: state.flowId,
  };

  const [systemPrompt, orgConfig] = await Promise.all([
    resolvePrompt(state.flowId ?? null, state.flowName ?? null),
    getOrgAiConfig(state.organizationId),
  ]);

  const ai = await askAssistantForOrg(text, orgConfig, systemPrompt);

  // AI is disabled for this org - don't respond
  if (ai === null) {
    log.info({ phone, organizationId: state.organizationId }, "handleFlow: AI disabled for org, skipping response");
    return { ...state, flowName: state.flowName ?? null };
  }

  if (!ai.reply) {
    log.warn({ phone, type: _type, event: "bot.ai_empty_reply" }, "AI returned empty reply, using fallback");
  }

  await sendMessage(phone, textMessage(ai.reply ?? "Te respondo en breve."), ctx);
  return { ...state, stage: ai.next_state ?? state.stage, flowName: state.flowName ?? null };
}
