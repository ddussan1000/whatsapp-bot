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
    payload: input.payload ?? null,
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
) {
  if (!supabase || !organizationId) return { items: [], total: 0 };
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;
  const { data, count, error } = await supabase
    .from("messages")
    .select(
      "id, conversation_id, phone, direction, message_type, text_body, media_url, payload, meta_message_id, created_at",
      { count: "exact" },
    )
    .eq("organization_id", organizationId)
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true })
    .range(from, to);
  if (error) throw error;
  return { items: data ?? [], total: count ?? 0 };
}

export async function updateMessageDeliveryStatus(input: {
  organizationId?: string | null;
  metaMessageId: string;
  status: "sent" | "delivered" | "read" | string;
  timestamp?: string | null;
}) {
  if (!supabase) return;
  let { data, error } = await supabase
    .from("messages")
    .select("id, payload")
    .match(input.organizationId ? { organization_id: input.organizationId } : {})
    .eq("meta_message_id", input.metaMessageId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  // Fallback flexible para diferencias de formato del ID de Meta (algunas cuentas envian variaciones)
  if (!data?.id) {
    const fallback = await supabase
      .from("messages")
      .select("id, payload")
      .match(input.organizationId ? { organization_id: input.organizationId } : {})
      .ilike("meta_message_id", `%${input.metaMessageId}%`)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    data = fallback.data;
    error = fallback.error;
  }
  if (error || !data?.id) return;

  const nextPayload = {
    ...(typeof data.payload === "object" && data.payload ? (data.payload as Record<string, unknown>) : {}),
    meta_status: input.status,
    meta_status_at: input.timestamp ?? null,
  };

  await supabase.from("messages").update({ payload: nextPayload }).eq("id", data.id);
}
