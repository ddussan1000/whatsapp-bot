import { supabase } from "./supabase";
import { log } from "../logger";
type UpsertConversationInput = {
  organizationId: string;
  phone: string;
  stage: string;
  flowId?: string | null;
  flowName?: string | null;
  whatsappInstanceId?: string | null;
  contactName?: string | null;
};

export async function upsertConversation(input: UpsertConversationInput) {
  if (!supabase || !input.organizationId) return null;

  const payload = {
    phone: input.phone,
    organization_id: input.organizationId,
    stage: input.stage,
    product: input.flowName ?? null,
    flow_id: input.flowId ?? null,
    whatsapp_instance_id: input.whatsappInstanceId ?? null,
    updated_at: new Date().toISOString(),
    ...(input.contactName != null ? { contact_name: input.contactName } : {}),
  };

  const { data, error } = await supabase
    .from("conversations")
    .upsert(payload, {
      onConflict: "organization_id,phone",
      ignoreDuplicates: false,
    })
    .select("id, phone, stage, product, flow_id, whatsapp_instance_id, started_at, updated_at")
    .maybeSingle();

  if (error) {
    log.error({ error, input }, "No se pudo guardar conversation en Supabase");
    throw error;
  }

  return data ?? null;
}
