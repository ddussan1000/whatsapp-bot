import type { Context } from "hono";
import { isDuplicate } from "../cache/redis";
import type { WhatsAppMessage, WhatsAppReferral } from "../types";
import { updateMessageDeliveryStatus } from "../db/messages";
import { getActiveInstanceByPhoneNumberId } from "../db/instances";
import { validateWebhookSignature } from "./validateSignature";
import { log } from "../logger";
import { messageQueue } from "../queue/messageQueue";
import { processMessageJob } from "../bot/messageProcessor";

function extractReferral(msg: WhatsAppMessage): WhatsAppReferral | null {
  const ref = (msg as unknown as { referral?: WhatsAppReferral }).referral;
  if (!ref || (!ref.ctwa_clid && !ref.source_id)) return null;
  return ref;
}

export async function handleWebhook(c: Context) {
  try {
    const rawBody = await c.req.text();
    const body = JSON.parse(rawBody);
    const entry = body.entry?.[0];
    const change = entry?.changes?.[0]?.value;
    const metaPhoneNumberId = (change?.metadata?.phone_number_id ?? "") as string;

    const instance = metaPhoneNumberId
      ? await getActiveInstanceByPhoneNumberId(metaPhoneNumberId)
      : null;

    if (instance?.app_secret) {
      const signature = c.req.header("x-hub-signature-256");
      if (!validateWebhookSignature(rawBody, signature, instance.app_secret)) {
        log.warn({ metaPhoneNumberId }, "webhook: firma inválida, rechazando");
        return c.text("Unauthorized", 401);
      }
    }

    const organizationId = instance?.organization_id ?? null;
    if (!organizationId) {
      log.warn({ metaPhoneNumberId }, "Webhook ignorado: no se encontró instancia activa");
      return c.text("ok");
    }

    // Status updates (delivery receipts) — fast path, no ILIKE
    const statusUpdates = (change?.statuses ?? []) as Array<{
      id?: string;
      status?: string;
      timestamp?: string;
    }>;
    if (statusUpdates.length > 0) {
      for (const s of statusUpdates.filter((s) => s.id && s.status)) {
        if (s.status === "failed") {
          log.warn({ metaMessageId: s.id, organizationId }, "webhook: Meta reportó fallo de entrega");
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

    // Dedup check — Redis SET NX, fast
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
      (change?.contacts as Array<{ profile?: { name?: string } }> | undefined)?.[0]?.profile?.name ?? null;
    const referral = extractReferral(msg);

    const jobData = { organizationId, metaPhoneNumberId, phone, contactName, referral, msg };

    if (messageQueue) {
      try {
        // Async: encolar y responder a Meta en < 100ms
        await messageQueue.add("process", jobData);
      } catch (err) {
        log.error({ err }, "webhook: fallo al encolar en Redis, procesando síncronamente");
        processMessageJob(jobData).catch((e) =>
          log.error({ e }, "webhook: fallo en procesamiento síncrono"),
        );
      }
    } else {
      // Fallback síncrono cuando Redis no está disponible
      processMessageJob(jobData).catch((err) =>
        log.error({ err }, "webhook: fallo en procesamiento síncrono"),
      );
    }

    return c.text("ok");
  } catch (err) {
    log.error({ err }, "webhook: fallo en handleWebhook");
    return c.text("ok");
  }
}
