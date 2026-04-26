import { supabase } from "./supabase";
import { safeDecrypt } from "../crypto/encrypt";
import { getCached, setCached, deleteCached } from "../cache/redis";

export type WhatsAppInstance = {
  id: string;
  organization_id: string;
  phone_number_id: string;
  meta_token: string | null;
  app_secret: string | null;
  is_active: boolean;
  flow_id?: string | null;
  currency?: string | null;
  high_amount_threshold?: number | null;
};

const INSTANCE_SELECT = "id, organization_id, phone_number_id, meta_token, app_secret, is_active, flow_id, currency, high_amount_threshold";

async function decryptInstance(data: WhatsAppInstance | null): Promise<WhatsAppInstance | null> {
  if (!data) return null;
  return {
    ...data,
    meta_token: await safeDecrypt(data.meta_token),
    app_secret: await safeDecrypt(data.app_secret),
  };
}

const instanceByOrgKey = (orgId: string, phoneNumberId: string) => `instance:org:${orgId}:pn:${phoneNumberId}`;

export async function getInstanceByPhoneNumberId(organizationId: string, phoneNumberId: string) {
  if (!supabase) return null;
  const cached = await getCached<WhatsAppInstance>(instanceByOrgKey(organizationId, phoneNumberId));
  if (cached) return decryptInstance(cached);
  const { data } = await supabase
    .from("whatsapp_instances")
    .select(INSTANCE_SELECT)
    .eq("organization_id", organizationId)
    .eq("phone_number_id", phoneNumberId)
    .maybeSingle<WhatsAppInstance>();
  if (data) await setCached(instanceByOrgKey(organizationId, phoneNumberId), data);
  return decryptInstance(data ?? null);
}

export async function invalidateInstanceCacheByOrg(orgId: string, phoneNumberId: string) {
  await deleteCached(instanceByOrgKey(orgId, phoneNumberId));
}

const instanceKey = (phoneNumberId: string) => `instance:pn:${phoneNumberId}`;

export async function getActiveInstanceByPhoneNumberId(phoneNumberId: string) {
  if (!supabase) return null;
  const cached = await getCached<WhatsAppInstance>(instanceKey(phoneNumberId));
  if (cached) return decryptInstance(cached);
  const { data } = await supabase
    .from("whatsapp_instances")
    .select(INSTANCE_SELECT)
    .eq("phone_number_id", phoneNumberId)
    .eq("is_active", true)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle<WhatsAppInstance>();
  if (data) await setCached(instanceKey(phoneNumberId), data);
  return decryptInstance(data ?? null);
}

export async function invalidateInstanceCache(phoneNumberId: string) {
  await deleteCached(instanceKey(phoneNumberId));
}

const instanceByIdKey = (instanceId: string) => `instance:id:${instanceId}`;

export async function getInstanceById(instanceId: string) {
  if (!supabase) return null;
  const cached = await getCached<WhatsAppInstance>(instanceByIdKey(instanceId));
  if (cached) return decryptInstance(cached);
  const { data } = await supabase
    .from("whatsapp_instances")
    .select(INSTANCE_SELECT)
    .eq("id", instanceId)
    .maybeSingle<WhatsAppInstance>();
  if (data) await setCached(instanceByIdKey(instanceId), data);
  return decryptInstance(data ?? null);
}
