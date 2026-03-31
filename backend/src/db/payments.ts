import { supabase } from "./supabase";
import { log } from "../logger";

export type PaymentInput = {
  organizationId: string;
  phone: string;
  product?: string | null;
  flow_id?: string | null;
  whatsapp_instance_id?: string | null;
  amount: number;
  receipt_url?: string | null;
  receipt_date?: string | null;
  conversation_id?: string | null;
  state?: string | null;
};

export async function insertPayment(input: PaymentInput) {
  if (!supabase || !input.organizationId) return;
  const { organizationId, ...rest } = input;
  const { error } = await supabase.from("payments").insert({
    ...rest,
    organization_id: organizationId,
  });
  if (error) {
    log.error({ error, input }, "No se pudo guardar payment en Supabase");
    throw error;
  }
}
