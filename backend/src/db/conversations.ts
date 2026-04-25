import { supabase } from "./supabase";
import { sql as pgSql } from "./postgres";
import { log } from "../logger";
import { getCached, setCached, deleteCached } from "../cache/redis";

const CONV_PREV_TTL = 300;
const convPrevKey = (orgId: string, phone: string) => `conv:prev:${orgId}:${phone}`;

export type PreviousConversation = {
  id: string;
  updated_at: string;
  flow_id: string | null;
  product: string | null;
  stage: string;
};

export async function getCachedPreviousConversation(orgId: string, phone: string): Promise<PreviousConversation | null> {
  const cached = await getCached<PreviousConversation>(convPrevKey(orgId, phone));
  if (cached) return cached;
  if (!supabase) return null;
  const { data } = await supabase
    .from("conversations")
    .select("id, updated_at, flow_id, product, stage")
    .eq("organization_id", orgId)
    .eq("phone", phone)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (data) await setCached(convPrevKey(orgId, phone), data as PreviousConversation, CONV_PREV_TTL);
  return (data as PreviousConversation | null) ?? null;
}

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
  if (!input.organizationId) return null;

  // Fast path: direct postgres via PgBouncer
  if (pgSql) {
    try {
      const rows = await pgSql`
        INSERT INTO conversations
          (phone, organization_id, stage, product, flow_id, whatsapp_instance_id, updated_at, contact_name)
        VALUES
          (${input.phone}, ${input.organizationId}, ${input.stage}, ${input.flowName ?? null},
           ${input.flowId ?? null}, ${input.whatsappInstanceId ?? null}, NOW(), ${input.contactName ?? null})
        ON CONFLICT (organization_id, phone)
        DO UPDATE SET
          stage               = EXCLUDED.stage,
          product             = EXCLUDED.product,
          flow_id             = EXCLUDED.flow_id,
          whatsapp_instance_id = EXCLUDED.whatsapp_instance_id,
          updated_at          = EXCLUDED.updated_at,
          contact_name        = COALESCE(EXCLUDED.contact_name, conversations.contact_name)
        RETURNING id, phone, stage, product, flow_id, whatsapp_instance_id, started_at, updated_at
      `;
      await deleteCached(convPrevKey(input.organizationId, input.phone));
      return rows[0] ?? null;
    } catch (err) {
      log.warn({ err }, "upsertConversation: postgres.js falló, fallback a supabase");
    }
  }

  // Fallback: PostgREST
  if (!supabase) return null;
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
    .upsert(payload, { onConflict: "organization_id,phone", ignoreDuplicates: false })
    .select("id, phone, stage, product, flow_id, whatsapp_instance_id, started_at, updated_at")
    .maybeSingle();
  if (error) {
    log.error({ error, input }, "No se pudo guardar conversation en Supabase");
    throw error;
  }
  if (data) await deleteCached(convPrevKey(input.organizationId, input.phone));
  return data ?? null;
}
