import type { ConversationState, WhatsAppMessage } from "../types";
import { sendMessage } from "../bot/sender";
import { textMessage } from "../bot/messages";
import { downloadFromMeta } from "./downloader";
import { extractPaymentData } from "./ocr";
import { saveReceipt } from "./storage";
import { insertPayment } from "../db/payments";
import { supabase } from "../db/supabase";

const DEFAULT_RECEIPT_PENDING_MESSAGE =
  "Gracias por tu comprobante. Lo estamos validando manualmente y te confirmaremos pronto.";
const DEFAULT_RECEIPT_REJECTED_MESSAGE =
  "No pudimos validar tu comprobante. Por favor verifica que la imagen sea legible y que la fecha sea de las ultimas 24 horas.";

async function getReceiptMessages(organizationId: string) {
  if (!supabase) {
    return {
      pendingMessage: DEFAULT_RECEIPT_PENDING_MESSAGE,
      rejectedMessage: DEFAULT_RECEIPT_REJECTED_MESSAGE,
    };
  }
  const { data } = await supabase
    .from("organizations")
    .select("bot_config")
    .eq("id", organizationId)
    .maybeSingle();
  const cfg = (data?.bot_config ?? {}) as Record<string, unknown>;
  return {
    pendingMessage:
      typeof cfg.receiptPendingMessage === "string" && cfg.receiptPendingMessage.trim().length > 0
        ? cfg.receiptPendingMessage
        : DEFAULT_RECEIPT_PENDING_MESSAGE,
    rejectedMessage:
      typeof cfg.receiptRejectedMessage === "string" && cfg.receiptRejectedMessage.trim().length > 0
        ? cfg.receiptRejectedMessage
        : DEFAULT_RECEIPT_REJECTED_MESSAGE,
  };
}

export async function handleReceipt(msg: WhatsAppMessage, phone: string, state: ConversationState) {
  if (!state.organizationId) return state;
  if (msg.type !== "image" || !msg.image?.id) {
    await sendMessage(phone, textMessage("No encontre imagen para validar."), {
      metaPhoneNumberId: state.metaPhoneNumberId,
      organizationId: state.organizationId,
      conversationId: state.id ?? null,
      whatsappInstanceId: state.whatsappInstanceId,
      flowId: state.flowId,
    });
    return state;
  }

  const buffer = await downloadFromMeta(msg.image.id);
  const { amount, receiptDate, isWithin24Hours } = await extractPaymentData(buffer);
  const receiptUrl = await saveReceipt(buffer, phone, state.organizationId);
  const { pendingMessage, rejectedMessage } = await getReceiptMessages(state.organizationId);

  if (!amount || (receiptDate && !isWithin24Hours)) {
    await sendMessage(phone, textMessage(rejectedMessage), {
      metaPhoneNumberId: state.metaPhoneNumberId,
      organizationId: state.organizationId,
      conversationId: state.id ?? null,
      whatsappInstanceId: state.whatsappInstanceId,
      flowId: state.flowId,
    });
    return { ...state, stage: "comprobante_rechazado" };
  }

  if (!receiptDate && amount) {
    await insertPayment({
      organizationId: state.organizationId,
      phone,
      product: state.flowName ?? null,
      flow_id: state.flowId ?? null,
      whatsapp_instance_id: state.whatsappInstanceId ?? null,
      amount,
      receipt_url: receiptUrl,
      receipt_date: null,
      conversation_id: state.id ?? null,
      state: "pending_manual_review",
    });
    await sendMessage(phone, textMessage(pendingMessage), {
      metaPhoneNumberId: state.metaPhoneNumberId,
      organizationId: state.organizationId,
      conversationId: state.id ?? null,
      whatsappInstanceId: state.whatsappInstanceId,
      flowId: state.flowId,
    });
    return { ...state, stage: "confirmar_comprobante" };
  }

  await insertPayment({
    organizationId: state.organizationId,
    phone,
    product: state.flowName ?? null,
    flow_id: state.flowId ?? null,
    whatsapp_instance_id: state.whatsappInstanceId ?? null,
    amount,
    receipt_url: receiptUrl,
    receipt_date: receiptDate ? receiptDate.toISOString() : null,
    conversation_id: state.id ?? null,
    state: "validated",
  });

  await sendMessage(phone, textMessage(`Pago de $${amount.toLocaleString("es-CO")} confirmado.`), {
    metaPhoneNumberId: state.metaPhoneNumberId,
    organizationId: state.organizationId,
    conversationId: state.id ?? null,
    whatsappInstanceId: state.whatsappInstanceId,
    flowId: state.flowId,
  });
  return { ...state, stage: "pago_confirmado" };
}
