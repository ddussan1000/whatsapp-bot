import { env } from "../config/env";
import { log } from "../logger";
import { insertMessageLog } from "../db/messages";
import { getInstanceByPhoneNumberId } from "../db/instances";

export async function sendMessage(
  to: string,
  payload: Record<string, unknown>,
  ctx?: {
    metaPhoneNumberId?: string | null;
    organizationId?: string | null;
    conversationId?: string | null;
    whatsappInstanceId?: string | null;
    flowId?: string | null;
  },
) {
  const organizationId = ctx?.organizationId ?? null;
  const metaPhoneNumberId = ctx?.metaPhoneNumberId ?? null;

  let resolvedPhoneNumberId = env.META_PHONE_ID;
  let resolvedToken = env.META_TOKEN;

  if (organizationId && metaPhoneNumberId) {
    const instance = await getInstanceByPhoneNumberId(organizationId, metaPhoneNumberId);
    if (instance?.meta_token) {
      resolvedPhoneNumberId = instance.phone_number_id;
      resolvedToken = instance.meta_token;
    }
  }

  if (!resolvedPhoneNumberId || !resolvedToken) {
    log.info({ to, payload }, "META no configurado, mensaje en modo log");
    if (organizationId) {
      await insertMessageLog({
        organizationId,
        conversationId: ctx?.conversationId ?? null,
        whatsappInstanceId: ctx?.whatsappInstanceId ?? null,
        flowId: ctx?.flowId ?? null,
        phone: to,
        direction: "outbound",
        messageType: String(payload.type ?? "unknown") as
          | "text"
          | "image"
          | "document"
          | "interactive"
          | "unknown",
        textBody: typeof payload.text === "object" ? String((payload.text as { body?: string }).body ?? "") : null,
        payload,
      });
    }
    return;
  }

  const res = await fetch(
    `https://graph.facebook.com/v19.0/${resolvedPhoneNumberId}/messages`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${resolvedToken}`,
      },
      body: JSON.stringify({ messaging_product: "whatsapp", to, ...payload }),
    },
  );

  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Meta API error: ${res.status} ${txt}`);
  }

  const data = (await res.json()) as { messages?: Array<{ id?: string }> };
  if (organizationId) {
    await insertMessageLog({
      organizationId,
      conversationId: ctx?.conversationId ?? null,
      whatsappInstanceId: ctx?.whatsappInstanceId ?? null,
      flowId: ctx?.flowId ?? null,
      phone: to,
      direction: "outbound",
      messageType: String(payload.type ?? "unknown") as
        | "text"
        | "image"
        | "document"
        | "interactive"
        | "unknown",
      textBody: typeof payload.text === "object" ? String((payload.text as { body?: string }).body ?? "") : null,
      payload,
      metaMessageId: data.messages?.[0]?.id ?? null,
    });
  }
}
