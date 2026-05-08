import type { ConversationState, WhatsAppMessage } from "../types";
import { sendMessage } from "../bot/sender";
import { textMessage } from "../bot/messages";
import { downloadFromMeta } from "./downloader";
import { runOcrWithFallback } from "./ocr";
import { saveReceipt } from "./storage";
import { insertPayment } from "../db/payments";
import { updateMessageMediaUrl } from "../db/messages";
import { supabase } from "../db/supabase";
import { log } from "../logger";
import { STAGES } from "../stages";
import { cancelJobsForPhone } from "../queue/scheduledMessages";

const DEFAULT_RECEIPT_REJECTED_MESSAGE =
  "No pudimos validar tu comprobante. Un agente lo revisara manualmente y te informara.";
const DEFAULT_RECEIPT_CONFIRMED_MESSAGE =
  "¡Gracias! Recibimos tu pago correctamente.";

type ReceiptMessages = {
  rejectedMessage: string;
  confirmedMessage: string;
};

function pick(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim().length > 0
    ? value
    : fallback;
}

async function getReceiptMessages(
  organizationId: string,
  flowId?: string | null,
): Promise<ReceiptMessages> {
  if (!supabase) {
    return {
      rejectedMessage: DEFAULT_RECEIPT_REJECTED_MESSAGE,
      confirmedMessage: DEFAULT_RECEIPT_CONFIRMED_MESSAGE,
    };
  }

  let flowOverrides: Record<string, unknown> = {};
  if (flowId) {
    const { data: flowRow } = await supabase
      .from("flows")
      .select("message_overrides")
      .eq("id", flowId)
      .maybeSingle();
    flowOverrides = (flowRow?.message_overrides ?? {}) as Record<
      string,
      unknown
    >;
  }

  const { data: orgRow } = await supabase
    .from("organizations")
    .select("bot_config")
    .eq("id", organizationId)
    .maybeSingle();
  const orgCfg = (orgRow?.bot_config ?? {}) as Record<string, unknown>;

  return {
    rejectedMessage: pick(
      flowOverrides.receiptRejectedMessage,
      pick(orgCfg.receiptRejectedMessage, DEFAULT_RECEIPT_REJECTED_MESSAGE),
    ),
    confirmedMessage: pick(
      flowOverrides.receiptConfirmedMessage,
      pick(orgCfg.receiptConfirmedMessage, DEFAULT_RECEIPT_CONFIRMED_MESSAGE),
    ),
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
 * Always persists the image to storage regardless of OCR result.
 * Returns { handled: true, state } if the image was a receipt (processed or retry).
 * Returns { handled: false } if the image is NOT a receipt -> caller should continue with normal flow.
 *
 * alreadyPaid: true when the conversation already has a confirmed payment — any new
 * valid receipt is stored as pending_manual_review instead of creating a second payment.
 */
export async function classifyAndHandleImage(
  msg: WhatsAppMessage,
  phone: string,
  state: ConversationState,
  metaToken?: string | null,
  currency = "COP",
  alreadyPaid = false,
  highAmountThreshold?: number | null,
): Promise<{ handled: boolean; state: ConversationState }> {
  if (!state.organizationId) return { handled: false, state };
  if (msg.type !== "image" || !msg.image?.id) return { handled: false, state };

  log.info(
    { phone, mediaId: msg.image.id },
    "classifyAndHandleImage: image received, downloading",
  );

  let buffer: Buffer;
  try {
    buffer = await downloadFromMeta(msg.image.id, metaToken ?? undefined);
    log.debug(
      { phone, mediaId: msg.image.id, bytes: buffer.length },
      "classifyAndHandleImage: download ok",
    );
  } catch (err) {
    log.error(
      { err, phone, mediaId: msg.image.id },
      "classifyAndHandleImage: download failed",
    );
    return { handled: false, state };
  }

  // Always persist the image, regardless of whether it's a receipt
  const metaMessageId = (msg as unknown as { id?: string }).id ?? null;
  let receiptUrl = "";
  let receiptPublicUrl: string | null = null;
  try {
    const saved = await saveReceipt(buffer, phone, state.organizationId);
    receiptUrl = saved.storageUri;
    receiptPublicUrl = saved.publicUrl;
    if (receiptPublicUrl && metaMessageId) {
      updateMessageMediaUrl(metaMessageId, receiptPublicUrl).catch(() => {});
    }
  } catch (err) {
    log.warn({ err, phone }, "classifyAndHandleImage: storage save failed, continuing without URL");
  }

  const cancelPending = () => cancelJobsForPhone(state.organizationId!, phone);

  let ocrResult: Awaited<ReturnType<typeof runOcrWithFallback>>;
  try {
    ocrResult = await runOcrWithFallback(buffer, currency);
    log.debug(
      {
        phone,
        provider: ocrResult.ocrProvider,
        isReceipt: ocrResult.isLikelyReceipt,
      },
      "classifyAndHandleImage: OCR done",
    );
  } catch (err) {
    log.warn(
      { err, phone },
      "classifyAndHandleImage: OCR timeout/error → revision_manual",
    );
    const { rejectedMessage } = await getReceiptMessages(
      state.organizationId,
      state.flowId,
    );
    await cancelPending();
    await sendMessage(phone, textMessage(rejectedMessage), msgCtx(state));
    return {
      handled: true,
      state: { ...state, stage: STAGES.revision_manual },
    };
  }

  if (!ocrResult.isLikelyReceipt) {
    log.info(
      { phone, event: "image.not_receipt" },
      "classifyAndHandleImage: NOT a receipt, skipping",
    );
    return { handled: false, state };
  }

  log.info(
    { phone, event: "image.is_receipt" },
    "classifyAndHandleImage: classified as RECEIPT",
  );

  let { amount, receiptDate, isWithin24Hours } = ocrResult;
  log.info(
    {
      phone,
      amount,
      receiptDate: receiptDate?.toISOString() ?? null,
      isWithin24Hours,
    },
    "classifyAndHandleImage: fields extracted",
  );

  const { rejectedMessage, confirmedMessage } =
    await getReceiptMessages(state.organizationId, state.flowId);

  if (!amount) {
    log.warn(
      { phone, event: "receipt.illegible" },
      "classifyAndHandleImage: amount not detected → revision_manual",
    );
    await cancelPending();
    await sendMessage(phone, textMessage(rejectedMessage), msgCtx(state));
    return { handled: true, state: { ...state, stage: STAGES.revision_manual } };
  }

  if (receiptDate && !isWithin24Hours) {
    log.warn(
      { phone, event: "receipt.rejected", receiptDate: receiptDate.toISOString() },
      "classifyAndHandleImage: receipt older than 24h → revision_manual",
    );
    await cancelPending();
    await sendMessage(phone, textMessage(rejectedMessage), msgCtx(state));
    return { handled: true, state: { ...state, stage: STAGES.revision_manual } };
  }

  if (!receiptDate && amount) {
    // No date visible in receipt → treat message received time as the payment date.
    log.info(
      { phone, event: "receipt.no_date_fallback", amount },
      "classifyAndHandleImage: no date detected → using now() as receipt date",
    );
    receiptDate = new Date();
    isWithin24Hours = true;
  }

  // Valid receipt (amount + date within 24h).
  // If amount exceeds the per-instance high-amount threshold, send to manual review.
  if (highAmountThreshold != null && highAmountThreshold > 0 && amount > highAmountThreshold) {
    log.info(
      { phone, event: "receipt.high_amount", amount, threshold: highAmountThreshold },
      "classifyAndHandleImage: amount exceeds threshold → pending_manual_review",
    );
    await insertPayment({
      organizationId: state.organizationId,
      phone,
      product: state.flowName ?? null,
      flow_id: state.flowId ?? null,
      whatsapp_instance_id: state.whatsappInstanceId ?? null,
      amount,
      currency: ocrResult.currency ?? currency,
      receipt_url: receiptUrl,
      receipt_date: receiptDate ? receiptDate.toISOString() : null,
      conversation_id: state.id ?? null,
      state: "pending_manual_review",
      meta_message_id: metaMessageId,
    });
    await cancelPending();
    await sendMessage(phone, textMessage(rejectedMessage), msgCtx(state));
    return { handled: true, state: { ...state, stage: STAGES.revision_manual } };
  }

  // If the conversation already has a confirmed payment, treat as manual review
  // to avoid registering duplicate payments.
  if (alreadyPaid) {
    log.info(
      { phone, event: "receipt.duplicate", amount },
      "classifyAndHandleImage: second receipt on confirmed payment → pending_manual_review",
    );
    await insertPayment({
      organizationId: state.organizationId,
      phone,
      product: state.flowName ?? null,
      flow_id: state.flowId ?? null,
      whatsapp_instance_id: state.whatsappInstanceId ?? null,
      amount,
      currency: ocrResult.currency ?? currency,
      receipt_url: receiptUrl,
      receipt_date: receiptDate ? receiptDate.toISOString() : null,
      conversation_id: state.id ?? null,
      state: "pending_manual_review",
      meta_message_id: metaMessageId,
    });
    await cancelPending();
    await sendMessage(phone, textMessage(rejectedMessage), msgCtx(state));
    return { handled: true, state: { ...state, stage: STAGES.revision_manual } };
  }

  log.info(
    {
      phone,
      event: "receipt.validated",
      amount,
      receiptDate: receiptDate?.toISOString(),
    },
    "classifyAndHandleImage: payment validated ✓",
  );
  await insertPayment({
    organizationId: state.organizationId,
    phone,
    product: state.flowName ?? null,
    flow_id: state.flowId ?? null,
    whatsapp_instance_id: state.whatsappInstanceId ?? null,
    amount,
    currency: ocrResult.currency ?? currency,
    receipt_url: receiptUrl,
    receipt_date: receiptDate ? receiptDate.toISOString() : null,
    conversation_id: state.id ?? null,
    state: "validated",
    meta_message_id: metaMessageId,
  });
  await cancelPending();
  await sendMessage(phone, textMessage(confirmedMessage), msgCtx(state));
  return { handled: true, state: { ...state, stage: STAGES.pago_confirmado } };
}

/** @deprecated Use classifyAndHandleImage instead */
export async function handleReceipt(
  msg: WhatsAppMessage,
  phone: string,
  state: ConversationState,
) {
  const result = await classifyAndHandleImage(msg, phone, state);
  return result.state;
}
