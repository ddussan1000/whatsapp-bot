import { GoogleGenAI } from "@google/genai";
import { log } from "../logger";
import type { OrgAiConfig } from "../db/organizations";

const DEFAULT_SYSTEM = `Eres un asistente de ventas por WhatsApp.
Responde en espanol, maximo 3 oraciones y tono amigable.
Devuelve JSON valido con:
{"reply":"texto","next_state":"interesado|listo_pagar|necesita_agente|null","send_catalog":false}`;

export type AssistantResult = {
  reply?: string;
  next_state?: string | null;
  send_catalog?: boolean;
};

function extractJson(text: string): AssistantResult {
  // Try markdown code block first (```json ... ```)
  const mdMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (mdMatch) {
    try { return JSON.parse(mdMatch[1]!.trim()); } catch {}
  }

  // Try to extract a JSON object from anywhere in the text
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start >= 0 && end > start) {
    try { return JSON.parse(text.slice(start, end + 1)); } catch {}
  }

  // Model returned plain text — treat it as the reply directly
  const plain = text.trim();
  if (plain.length > 0) return { reply: plain, next_state: null, send_catalog: false };

  throw new Error(`extractJson: no valid JSON found in: ${text.slice(0, 200)}`);
}

async function askAnthropic(text: string, systemPrompt: string, apiKey: string, model: string): Promise<AssistantResult> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model,
      max_tokens: 250,
      system: systemPrompt,
      messages: [{ role: "user", content: text }],
    }),
  });
  if (!res.ok) throw new Error(`Anthropic API error ${res.status}: ${await res.text()}`);
  const data = (await res.json()) as { content?: Array<{ text?: string }> };
  const raw = data.content?.[0]?.text ?? '{"reply":"No pude responder","next_state":null,"send_catalog":false}';
  return extractJson(raw);
}

const OPENAI_COMPATIBLE_URLS = {
  openai: "https://api.openai.com/v1/chat/completions",
  groq: "https://api.groq.com/openai/v1/chat/completions",
  deepseek: "https://api.deepseek.com/v1/chat/completions",
  openrouter: "https://openrouter.ai/api/v1/chat/completions",
} as const;

type OpenAICompatibleProvider = keyof typeof OPENAI_COMPATIBLE_URLS;

async function askOpenAICompatible(
  provider: OpenAICompatibleProvider,
  text: string,
  systemPrompt: string,
  apiKey: string,
  model: string,
): Promise<AssistantResult> {
  const res = await fetch(OPENAI_COMPATIBLE_URLS[provider], {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model,
      max_tokens: 280,
      temperature: 0.3,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: text },
      ],
    }),
  });
  if (!res.ok) throw new Error(`${provider} API error ${res.status}: ${await res.text()}`);
  const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const raw = data.choices?.[0]?.message?.content ?? '{"reply":"No pude responder","next_state":null,"send_catalog":false}';
  return extractJson(raw);
}

async function askGemini(text: string, systemPrompt: string, apiKey: string, model: string): Promise<AssistantResult> {
  const ai = new GoogleGenAI({ apiKey });
  const response = await ai.models.generateContent({
    model,
    config: {
      temperature: 0.3,
      maxOutputTokens: 280,
      responseMimeType: "application/json",
      systemInstruction: systemPrompt,
    },
    contents: [{ role: "user", parts: [{ text }] }],
  });
  const raw = response.text ?? '{"reply":"No pude responder","next_state":null,"send_catalog":false}';
  return extractJson(raw);
}

function getDefaultModel(provider: "openai" | "gemini" | "anthropic" | "groq" | "deepseek" | "openrouter"): string {
  switch (provider) {
    case "openai": return "gpt-4o-mini";
    case "gemini": return "gemini-2.0-flash-lite";
    case "anthropic": return "claude-3-5-haiku-latest";
    case "groq": return "llama-3.3-70b-versatile";
    case "deepseek": return "deepseek-chat";
    case "openrouter": return "openai/gpt-4o-mini";
  }
}

// Org-level assistant: uses org's own API key. Returns null if AI is disabled or not configured.
export async function askAssistantForOrg(
  text: string,
  orgConfig: OrgAiConfig,
  systemOverride?: string | null,
): Promise<AssistantResult | null> {
  // If AI is disabled for this org, return null (caller should not respond)
  if (!orgConfig.ai_enabled) return null;

  const systemPrompt = systemOverride && systemOverride.trim().length > 0
    ? systemOverride
    : orgConfig.ai_system_prompt && orgConfig.ai_system_prompt.trim().length > 0
      ? orgConfig.ai_system_prompt
      : DEFAULT_SYSTEM;

  // If org has their own provider configured, use it
  if (orgConfig.ai_provider && orgConfig.ai_api_key) {
    const apiKey = orgConfig.ai_api_key;
    const model = orgConfig.ai_model ?? getDefaultModel(orgConfig.ai_provider);
    try {
      if (orgConfig.ai_provider === "openai" || orgConfig.ai_provider === "groq" ||
          orgConfig.ai_provider === "deepseek" || orgConfig.ai_provider === "openrouter") {
        return await askOpenAICompatible(orgConfig.ai_provider, text, systemPrompt, apiKey, model);
      }
      if (orgConfig.ai_provider === "gemini") return await askGemini(text, systemPrompt, apiKey, model);
      if (orgConfig.ai_provider === "anthropic") return await askAnthropic(text, systemPrompt, apiKey, model);
    } catch (err) {
      log.error({ err, provider: orgConfig.ai_provider }, "askAssistantForOrg: fallo proveedor org");
    }
  }

  // Org has no AI provider configured
  log.info({ organizationId: orgConfig.ai_provider }, "askAssistantForOrg: org sin proveedor AI configurado, skipping");
  return null;
}

// Raw text completion using the org's BYOK provider. Unlike askAssistantForOrg this is NOT gated on
// ai_enabled (that flag governs the auto-responder, not editor tools) and does not coerce to the
// sales JSON schema — it returns whatever the model produced. Returns null if no provider/key configured.
const RAW_OPENAI_COMPATIBLE_URLS: Record<string, string> = {
  openai: "https://api.openai.com/v1/chat/completions",
  groq: "https://api.groq.com/openai/v1/chat/completions",
  deepseek: "https://api.deepseek.com/v1/chat/completions",
  openrouter: "https://openrouter.ai/api/v1/chat/completions",
};

async function rawOpenAICompatible(
  url: string,
  system: string,
  user: string,
  apiKey: string,
  model: string,
  maxTokens: number,
  opts: { jsonMode?: boolean; temperature?: number } = {},
): Promise<string> {
  const body: Record<string, unknown> = {
    model,
    max_tokens: maxTokens,
    temperature: opts.temperature ?? 0.7,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
  };
  if (opts.jsonMode) body.response_format = { type: "json_object" };

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`AI_PROVIDER_ERROR:${res.status}:${body}`);
  }
  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string }; finish_reason?: string }>;
  };
  if (data.choices?.[0]?.finish_reason === "length") {
    throw new Error("AI_RESPONSE_TRUNCATED");
  }
  return data.choices?.[0]?.message?.content ?? "";
}

async function rawAnthropic(system: string, user: string, apiKey: string, model: string, maxTokens: number): Promise<string> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model, max_tokens: maxTokens, system, messages: [{ role: "user", content: user }] }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`AI_PROVIDER_ERROR:${res.status}:${body}`);
  }
  const data = (await res.json()) as { content?: Array<{ text?: string }> };
  return data.content?.[0]?.text ?? "";
}

async function rawGemini(system: string, user: string, apiKey: string, model: string, maxTokens: number): Promise<string> {
  const ai = new GoogleGenAI({ apiKey });
  const response = await ai.models.generateContent({
    model,
    config: { temperature: 0.7, maxOutputTokens: maxTokens, systemInstruction: system },
    contents: [{ role: "user", parts: [{ text: user }] }],
  });
  return response.text ?? "";
}

export async function generateRawForOrg(
  system: string,
  user: string,
  orgConfig: OrgAiConfig,
  maxTokens = 3000,
  opts: { jsonMode?: boolean; temperature?: number } = {},
): Promise<string | null> {
  if (!orgConfig.ai_provider || !orgConfig.ai_api_key) return null;
  const apiKey = orgConfig.ai_api_key;
  const model = orgConfig.ai_model ?? getDefaultModel(orgConfig.ai_provider);
  const p = orgConfig.ai_provider;
  if (p === "gemini") return await rawGemini(system, user, apiKey, model, maxTokens);
  if (p === "anthropic") return await rawAnthropic(system, user, apiKey, model, maxTokens);
  const url = RAW_OPENAI_COMPATIBLE_URLS[p];
  if (!url) return null;
  return await rawOpenAICompatible(url, system, user, apiKey, model, maxTokens, opts);
}

// Validation: test that an API key + model combo works
export async function validateAiProvider(
  provider: "openai" | "gemini" | "anthropic" | "groq" | "deepseek" | "openrouter",
  apiKey: string,
  model: string,
): Promise<{ ok: boolean; error?: string }> {
  const testPrompt = 'Respond with exactly: {"ok":true}';
  const systemPrompt = "You are a test assistant. Follow instructions exactly.";
  try {
    if (provider === "openai" || provider === "groq" || provider === "deepseek" || provider === "openrouter") {
      await askOpenAICompatible(provider, testPrompt, systemPrompt, apiKey, model);
    } else if (provider === "gemini") await askGemini(testPrompt, systemPrompt, apiKey, model);
    else if (provider === "anthropic") await askAnthropic(testPrompt, systemPrompt, apiKey, model);
    return { ok: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: msg };
  }
}
