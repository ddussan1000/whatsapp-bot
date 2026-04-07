import { supabase } from "./supabase";
import { safeDecrypt } from "../crypto/encrypt";

export type WhatsAppInstance = {
  id: string;
  organization_id: string;
  phone_number_id: string;
  meta_token: string | null;
  app_secret: string | null;
  is_active: boolean;
  flow_id?: string | null;
  currency?: string | null;
};

const INSTANCE_SELECT = "id, organization_id, phone_number_id, meta_token, app_secret, is_active, flow_id, currency";

async function decryptInstance(data: WhatsAppInstance | null): Promise<WhatsAppInstance | null> {
  if (!data) return null;
  return {
    ...data,
    meta_token: await safeDecrypt(data.meta_token),
    app_secret: await safeDecrypt(data.app_secret),
  };
}

export async function getInstanceByPhoneNumberId(organizationId: string, phoneNumberId: string) {
  if (!supabase) return null;
  const { data } = await supabase
    .from("whatsapp_instances")
    .select(INSTANCE_SELECT)
    .eq("organization_id", organizationId)
    .eq("phone_number_id", phoneNumberId)
    .maybeSingle<WhatsAppInstance>();
  return decryptInstance(data ?? null);
}

export async function getActiveInstanceByPhoneNumberId(phoneNumberId: string) {
  if (!supabase) return null;
  const { data } = await supabase
    .from("whatsapp_instances")
    .select(INSTANCE_SELECT)
    .eq("phone_number_id", phoneNumberId)
    .eq("is_active", true)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle<WhatsAppInstance>();
  return decryptInstance(data ?? null);
}
