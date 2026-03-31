import { supabase } from "./supabase";
import { log } from "../logger";
type UpsertConversationInput = {
  organizationId: string;
  phone: string;
  stage: string;
  flowId?: string | null;
  flowName?: string | null;
  whatsappInstanceId?: string | null;
};

export async function upsertConversation(input: UpsertConversationInput) {
  if (!supabase || !input.organizationId) return null;
  const { data: existing } = await supabase
    .from("conversations")
    .select("id, phone, stage, product, flow_id, whatsapp_instance_id, started_at, updated_at")
    .eq("organization_id", input.organizationId)
    .eq("phone", input.phone)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const payload = existing
    ? {
        id: existing.id,
        phone: input.phone,
        stage: input.stage,
        product: input.flowName ?? existing.product ?? null,
        flow_id: input.flowId ?? existing.flow_id ?? null,
        whatsapp_instance_id: input.whatsappInstanceId ?? existing.whatsapp_instance_id ?? null,
        started_at: existing.started_at,
        organization_id: input.organizationId,
        updated_at: new Date().toISOString(),
      }
    : {
        phone: input.phone,
        stage: input.stage,
        product: input.flowName ?? null,
        flow_id: input.flowId ?? null,
        whatsapp_instance_id: input.whatsappInstanceId ?? null,
        organization_id: input.organizationId,
        updated_at: new Date().toISOString(),
      };
  const action = existing
    ? supabase.from("conversations").update(payload).eq("id", existing.id)
    : supabase.from("conversations").insert(payload);
  const { error } = await action;

  if (error) {
    log.error({ error, input }, "No se pudo guardar conversation en Supabase");
    throw error;
  }

  const { data, error: fetchError } = await supabase
    .from("conversations")
    .select("id, phone, stage, product, flow_id, whatsapp_instance_id, started_at, updated_at")
    .eq("organization_id", input.organizationId)
    .eq("phone", input.phone)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (fetchError) {
    log.error({ fetchError, input }, "No se pudo recuperar conversation");
    return null;
  }

  return data ?? null;
}
