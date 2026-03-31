import { supabase } from "./supabase";

export type WhatsAppInstance = {
  id: string;
  organization_id: string;
  phone_number_id: string;
  meta_token: string | null;
  is_active: boolean;
  flow_id?: string | null;
};

export async function getInstanceByPhoneNumberId(organizationId: string, phoneNumberId: string) {
  if (!supabase) return null;
  const { data } = await supabase
    .from("whatsapp_instances")
    .select("id, organization_id, phone_number_id, meta_token, is_active, flow_id")
    .eq("organization_id", organizationId)
    .eq("phone_number_id", phoneNumberId)
    .maybeSingle<WhatsAppInstance>();
  return data ?? null;
}

export async function getActiveInstanceByPhoneNumberId(phoneNumberId: string) {
  if (!supabase) return null;
  const { data } = await supabase
    .from("whatsapp_instances")
    .select("id, organization_id, phone_number_id, meta_token, is_active, flow_id")
    .eq("phone_number_id", phoneNumberId)
    .eq("is_active", true)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle<WhatsAppInstance>();
  return data ?? null;
}

