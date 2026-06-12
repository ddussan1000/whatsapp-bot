import { supabase } from "./supabase";
import { getCached, setCached, deleteCached } from "../cache/redis";

export type OrgAiConfig = {
  ai_enabled: boolean;
  ai_provider: "openai" | "gemini" | "anthropic" | "groq" | "deepseek" | "openrouter" | null;
  ai_api_key: string | null; // decrypted value
  ai_model: string | null;
  ai_system_prompt: string | null;
};

type OrgAiConfigRaw = {
  ai_enabled: boolean | null;
  ai_provider: string | null;
  ai_api_key: string | null; // encrypted
  ai_model: string | null;
  ai_system_prompt: string | null;
};

const ORG_AI_TTL = 3600;
const orgAiKey = (orgId: string) => `org:ai:${orgId}`;

export async function getOrgAiConfig(organizationId: string): Promise<OrgAiConfig> {
  const defaults: OrgAiConfig = {
    ai_enabled: true,
    ai_provider: null,
    ai_api_key: null,
    ai_model: null,
    ai_system_prompt: null,
  };

  const { safeDecrypt } = await import("../crypto/encrypt");

  const cached = await getCached<OrgAiConfigRaw>(orgAiKey(organizationId));
  if (cached) {
    return {
      ai_enabled: cached.ai_enabled ?? true,
      ai_provider: (cached.ai_provider as OrgAiConfig["ai_provider"]) ?? null,
      ai_api_key: await safeDecrypt(cached.ai_api_key),
      ai_model: cached.ai_model ?? null,
      ai_system_prompt: cached.ai_system_prompt ?? null,
    };
  }

  if (!supabase) return defaults;

  const { data } = await supabase
    .from("organizations")
    .select("ai_enabled, ai_provider, ai_api_key, ai_model, ai_system_prompt")
    .eq("id", organizationId)
    .maybeSingle();

  if (!data) return defaults;

  await setCached(orgAiKey(organizationId), data, ORG_AI_TTL);

  return {
    ai_enabled: (data.ai_enabled as boolean) ?? true,
    ai_provider: (data.ai_provider as OrgAiConfig["ai_provider"]) ?? null,
    ai_api_key: await safeDecrypt((data.ai_api_key as string | null) ?? null),
    ai_model: (data.ai_model as string | null) ?? null,
    ai_system_prompt: (data.ai_system_prompt as string | null) ?? null,
  };
}

export async function invalidateOrgAiConfig(organizationId: string) {
  await deleteCached(orgAiKey(organizationId));
}
