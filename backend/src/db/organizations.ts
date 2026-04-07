import { supabase } from "./supabase";

export type OrgAiConfig = {
  ai_enabled: boolean;
  ai_provider: "openai" | "gemini" | "anthropic" | "groq" | null;
  ai_api_key: string | null; // decrypted value
  ai_model: string | null;
  ai_system_prompt: string | null;
};

export async function getOrgAiConfig(organizationId: string): Promise<OrgAiConfig> {
  const defaults: OrgAiConfig = {
    ai_enabled: true,
    ai_provider: null,
    ai_api_key: null,
    ai_model: null,
    ai_system_prompt: null,
  };

  if (!supabase) return defaults;

  const { data } = await supabase
    .from("organizations")
    .select("ai_enabled, ai_provider, ai_api_key, ai_model, ai_system_prompt")
    .eq("id", organizationId)
    .maybeSingle();

  if (!data) return defaults;

  const { safeDecrypt } = await import("../crypto/encrypt");

  return {
    ai_enabled: (data.ai_enabled as boolean) ?? true,
    ai_provider: (data.ai_provider as OrgAiConfig["ai_provider"]) ?? null,
    ai_api_key: await safeDecrypt((data.ai_api_key as string | null) ?? null),
    ai_model: (data.ai_model as string | null) ?? null,
    ai_system_prompt: (data.ai_system_prompt as string | null) ?? null,
  };
}
