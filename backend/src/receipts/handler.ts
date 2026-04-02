import type { ConversationState, WhatsAppMessage } from "../types";
import { sendMessage } from "../bot/sender";
import { textMessage } from "../bot/messages";
import { downloadFromMeta } from "./downloader";
import { runOcr, isLikelyReceipt, extractPaymentFields } from "./ocr";
import { saveReceipt } from "./storage";
import { insertPayment } from "../db/payments";
import { supabase } from "../db/supabase";
import { log } from "../logger";

const DEFAULT_RECEIPT_PENDING_MESSAGE =
  "Gracias por tu comprobante. Lo estamos validando manualmente y te confirmaremos pronto.";
const DEFAULT_RECEIPT_REJECTED_MESSAGE =
  "No pudimos validar tu comprobante. Por favor verifica que la imagen sea legible y que la fecha sea de las ultimas 24 horas.";
const DEFAULT_RECEIPT_RETRY_MESSAGE =
  "No pudimos leer tu comprobante. Por favor envia una foto mas clara, con buena iluminacion y sin recortar. Asegurate de que se vean los datos del pago completos.";

type ReceiptMessages = {
  pendingMessage: string;
  rejectedMessage: string;
  retryMessage: string;
};

function pick(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim().length > 0 ? value : fallback;
}

async function getReceiptMessages(organizationId: string, flowId?: string | null): Promise<ReceiptMessages> {
  if (!supabase) {
    return {
      pendingMessage: DEFAULT_RECEIPT_PENDING_MESSAGE,
      rejectedMessage: DEFAULT_RECEIPT_REJECTED_MESSAGE,
      retryMessage: DEFAULT_RECEIPT_RETRY_MESSAGE,
    };
  }

  let flowOverrides: Record<string, unknown> = {};
  if (flowId) {
    const { data: flowRow } = await supabase
      .from("flows")
      .select("message_overrides")
      .eq("id", flowId)
      .maybeSingle();
    flowOverrides = (flowRow?.message_overrides ?? {}) as Record<string, unknown>;
  }

  const { data: orgRow } = await supabase
    .from("organizations")
    .select("bot_config")
    .eq("id", organizationId)
    .maybeSingle();
  const orgCfg = (orgRow?.bot_config ?? {}) as Record<string, unknown>;

  return {
    pendingMessage: pick(flowOverrides.receiptPendingMessage, pick(orgCfg.receiptPendingMessage, DEFAULT_RECEIPT_PENDING_MESSAGE)),
    rejectedMessage: pick(flowOverrides.receiptRejectedMessage, pick(orgCfg.receiptRejectedMessage, DEFAULT_RECEIPT_REJECTED_MESSAGE)),
    retryMessage: pick(flowOverrides.receiptRetryMessage, pick(orgCfg.receiptRetryMessage, DEFAULT_RECEIPT_RETRY_MESSAGE)),
  };
}

function msgCtx(state: ConversationState) {
  return {
    metaPhoneNumberId: state.metaPhoneNumberId,
    organizationId: state.organizationId,
    conversationId: state.id ?? null,
    whatsappInstanceId: state.whatsappInstanceId,
    flowId: state.flowId,
  };
}

/**
 * Classify image and handle if it's a receipt.
 * Returns { handled: true, state } if the image was a receipt (processed or retry).
 * Returns { handled: false } if the image is NOT a receipt -> caller should continue with normal flow.
 */
export async function classifyAndHandleImage(
  msg: WhatsAppMessage,
  phone: string,
  state: ConversationState,
): Promise<{ handled: boolean; state: ConversationState }> {
  if (!state.organizationId) return { handled: false, state };
  if (msg.type !== "image" || !msg.image?.id) return { handled: false, state };

  log.info({ phone, mediaId: msg.image.id }, "classifyAndHandleImage: image received, downloading");

  let buffer: Buffer;
  try {
    buffer = await downloadFromMeta(msg.image.id);
    log.debug({ phone, mediaId: msg.image.id, bytes: buffer.length }, "classifyAndHandleImage: download ok");
  } catch (err) {
    log.error({ err, phone, mediaId: msg.image.id }, "classifyAndHandleImage: download failed");
    return { handled: false, state };
  }

  const ocrText = await runOcr(buffer);
  log.debug({ phone, ocrChars: ocrText.length, ocrPreview: ocrText.slice(0, 120).replace(/\n/g, " ") }, "classifyAndHandleImage: OCR done");

  if (!isLikelyReceipt(ocrText)) {
    log.info({ phone, event: "image.not_receipt", ocrPreview: ocrText.slice(0, 80).replace(/\n/g, " ") }, "classifyAndHandleImage: NOT a receipt, skipping");
    return { handled: false, state };
  }

  log.info({ phone, event: "image.is_receipt" }, "classifyAndHandleImage: classified as RECEIPT, extracting fields");

  const { amount, receiptDate, isWithin24Hours } = extractPaymentFields(ocrText);
  log.info(
    { phone, amount, receiptDate: receiptDate?.toISOString() ?? null, isWithin24Hours },
    "classifyAndHandleImage: fields extracted",
  );

  const receiptUrl = await saveReceipt(buffer, phone, state.organizationId);
  const { pendingMessage, rejectedMessage, retryMessage } = await getReceiptMessages(state.organizationId, state.flowId);

  if (!amount) {
    log.warn({ phone, event: "receipt.illegible" }, "classifyAndHandleImage: amount not detected → comprobante_ilegible");
    await sendMessage(phone, textMessage(retryMessage), msgCtx(state));
    return { handled: true, state: { ...state, stage: "comprobante_ilegible" } };
  }

  if (receiptDate && !isWithin24Hours) {
    log.warn({ phone, event: "receipt.rejected", receiptDate: receiptDate.toISOString() }, "classifyAndHandleImage: receipt older than 24h → comprobante_rechazado");
    await sendMessage(phone, textMessage(rejectedMessage), msgCtx(state));
    return { handled: true, state: { ...state, stage: "comprobante_rechazado" } };
  }

  if (!receiptDate && amount) {
    log.info({ phone, event: "receipt.pending_review", amount }, "classifyAndHandleImage: no date detected → pending_manual_review");
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
    await sendMessage(phone, textMessage(pendingMessage), msgCtx(state));
    return { handled: true, state: { ...state, stage: "confirmar_comprobante" } };
  }

  log.info({ phone, event: "receipt.validated", amount, receiptDate: receiptDate?.toISOString() }, "classifyAndHandleImage: payment validated ✓");
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

  await sendMessage(phone, textMessage(`Pago de $${amount.toLocaleString("es-CO")} confirmado.`), msgCtx(state));
  return { handled: true, state: { ...state, stage: "pago_confirmado" } };
}

/** @deprecated Use classifyAndHandleImage instead */
export async function handleReceipt(msg: WhatsAppMessage, phone: string, state: ConversationState) {
  const result = await classifyAndHandleImage(msg, phone, state);
  return result.state;
}
