import { supabase } from "./supabase";
import { log } from "../logger";

export type MessageDirection = "inbound" | "outbound";
export type MessageType = "text" | "image" | "document" | "interactive" | "unknown";

export type MessageInput = {
  organizationId: string;
  conversationId?: string | null;
  whatsappInstanceId?: string | null;
  flowId?: string | null;
  phone: string;
  direction: MessageDirection;
  messageType: MessageType;
  textBody?: string | null;
  mediaUrl?: string | null;
  payload?: Record<string, unknown> | null;
  metaMessageId?: string | null;
  /** Si es true, no se guarda el payload JSONB (para mensajes outbound de flujos programados) */
  skipPayload?: boolean;
};

async function getLatestConversationIdByPhone(phone: string, organizationId: string) {
  if (!supabase || !organizationId) return null;
  const { data } = await supabase
    .from("conversations")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("phone", phone)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data?.id ?? null;
}

export async function insertMessageLog(input: MessageInput) {
  if (!supabase || !input.organizationId) return;
  const conversationId = input.conversationId ?? (await getLatestConversationIdByPhone(input.phone, input.organizationId));
  const { error } = await supabase.from("messages").insert({
    organization_id: input.organizationId,
    conversation_id: conversationId,
    whatsapp_instance_id: input.whatsappInstanceId ?? null,
    flow_id: input.flowId ?? null,
    phone: input.phone,
    direction: input.direction,
    message_type: input.messageType,
    text_body: input.textBody ?? null,
    media_url: input.mediaUrl ?? null,
    payload: input.skipPayload ? null : (input.payload ?? null),
    meta_message_id: input.metaMessageId ?? null,
  });
  if (error) {
    log.error({ error, input }, "No se pudo guardar message log en Supabase");
  }
}

export async function listMessagesByConversation(
  organizationId: string,
  conversationId: string,
  page: number,
  pageSize: number,
  sortDesc = false,
) {
  if (!supabase || !organizationId) return { items: [], total: 0 };
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;
  const { data, count, error } = await supabase
    .from("messages")
    .select(
      "id, conversation_id, phone, direction, message_type, text_body, media_url, payload, meta_message_id, delivery_status, delivered_at, created_at",
      { count: "exact" },
    )
    .eq("organization_id", organizationId)
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: !sortDesc })
    .range(from, to);
  if (error) throw error;
  return { items: data ?? [], total: count ?? 0 };
}

export async function updateMessageMediaUrl(metaMessageId: string, mediaUrl: string) {
  if (!supabase) return;
  await supabase
    .from("messages")
    .update({ media_url: mediaUrl })
    .eq("meta_message_id", metaMessageId);
}

export async function updateMessageDeliveryStatus(input: {
  organizationId?: string | null;
  metaMessageId: string;
  status: "sent" | "delivered" | "read" | string;
  timestamp?: string | null;
}) {
  if (!supabase) return;

  const deliveredAt = input.timestamp
    ? new Date(Number(input.timestamp) * 1000).toISOString()
    : null;

  const matchFilter = input.organizationId
    ? { organization_id: input.organizationId, meta_message_id: input.metaMessageId }
    : { meta_message_id: input.metaMessageId };

  // Intento 1: coincidencia exacta
  let { data, error } = await supabase
    .from("messages")
    .select("id")
    .match(matchFilter)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  // Intento 2: fallback flexible (Meta a veces envía variaciones del ID)
  if (!data?.id) {
    const fallback = await supabase
      .from("messages")
      .select("id")
      .match(input.organizationId ? { organization_id: input.organizationId } : {})
      .ilike("meta_message_id", `%${input.metaMessageId}%`)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    data = fallback.data;
    error = fallback.error;
  }

  if (error || !data?.id) return;

  await supabase
    .from("messages")
    .update({ delivery_status: input.status, delivered_at: deliveredAt })
    .eq("id", data.id);
}
