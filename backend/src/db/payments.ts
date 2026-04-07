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

  // If we have a meta_message_id, use upsert to avoid duplicates on webhook retries
  if (payload.meta_message_id) {
    const { error } = await supabase
      .from("payments")
      .upsert(payload, { onConflict: "meta_message_id", ignoreDuplicates: true });
    if (error) {
      log.error({ error, input }, "No se pudo guardar payment en Supabase");
      throw error;
    }
    return;
  }

  const { error } = await supabase.from("payments").insert(payload);
  if (error) {
    log.error({ error, input }, "No se pudo guardar payment en Supabase");
    throw error;
  }
}
