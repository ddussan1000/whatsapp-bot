import { supabase } from "./supabase";

let cachedDefaultOrgId: string | null = null;

export async function getDefaultOrganizationId() {
  if (!supabase) return null;
  if (cachedDefaultOrgId) return cachedDefaultOrgId;
  const { data } = await supabase.from("organizations").select("id").eq("slug", "default-org").maybeSingle();
  if (!data?.id) return null;
  cachedDefaultOrgId = data.id;
  return data.id;
}
