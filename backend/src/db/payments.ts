import { supabase } from "./supabase";
import { log } from "../logger";

export type PaymentInput = {
  organizationId: string;
  phone: string;
  product?: string | null;
  flow_id?: string | null;
  whatsapp_instance_id?: string | null;
  amount: number;
  currency?: string | null;
  receipt_url?: string | null;
  receipt_date?: string | null;
  conversation_id?: string | null;
  state?: string | null;
  meta_message_id?: string | null;
};

export async function insertPayment(input: PaymentInput) {
  if (!supabase || !input.organizationId) return;
  const { organizationId, ...rest } = input;
  const payload = { ...rest, organization_id: organizationId };

  // PostgREST can't express partial-index ON CONFLICT, so INSERT and treat
  // duplicate key (23505) as success — dedup via the partial unique index.
  const { error } = await supabase.from("payments").insert(payload);
  if (error) {
    if (error.code === "23505") return;
    log.error({ error, input }, "No se pudo guardar payment en Supabase");
    throw error;
  }
}
