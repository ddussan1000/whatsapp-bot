import { GoogleGenAI } from "@google/genai";
import { env } from "../config/env";
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

async function askGroq(text: string, systemPrompt: string, apiKey: string, model: string): Promise<AssistantResult> {
  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
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
  if (!res.ok) throw new Error(`Groq API error ${res.status}: ${await res.text()}`);
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

async function askOpenAI(text: string, systemPrompt: string, apiKey: string, model: string): Promise<AssistantResult> {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
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
  if (!res.ok) throw new Error(`OpenAI API error ${res.status}: ${await res.text()}`);
  const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const raw = data.choices?.[0]?.message?.content ?? '{"reply":"No pude responder","next_state":null,"send_catalog":false}';
  return extractJson(raw);
}

function getDefaultModel(provider: "openai" | "gemini" | "anthropic" | "groq"): string {
  switch (provider) {
    case "openai": return "gpt-4o-mini";
    case "gemini": return "gemini-2.0-flash-lite";
    case "anthropic": return "claude-3-5-haiku-latest";
    case "groq": return "llama-3.3-70b-versatile";
  }
}

// System-level assistant (uses env vars), existing behavior preserved
export async function askAssistant(text: string, systemOverride?: string | null): Promise<AssistantResult> {
  const systemPrompt = systemOverride && systemOverride.trim().length > 0 ? systemOverride : DEFAULT_SYSTEM;
  const provider =
    env.AI_PROVIDER === "auto"
      ? env.GEMINI_API_KEY
        ? "gemini"
        : env.GROQ_API_KEY
          ? "groq"
          : env.ANTHROPIC_API_KEY
            ? "anthropic"
            : "none"
      : env.AI_PROVIDER;

  const missingKey =
    (provider === "gemini" && !env.GEMINI_API_KEY) ||
    (provider === "groq" && !env.GROQ_API_KEY) ||
    (provider === "anthropic" && !env.ANTHROPIC_API_KEY) ||
    provider === "none";

  if (missingKey) {
    log.warn({ provider }, "askAssistant: no hay API key configurada para el proveedor");
    return { reply: "Por ahora estoy en modo pruebas. Te ayudamos pronto.", next_state: "interesado", send_catalog: false };
  }

  try {
    const model = provider === "anthropic"
      ? "claude-3-5-haiku-latest"
      : provider === "gemini"
        ? "gemini-2.0-flash-lite"
        : env.GROQ_MODEL;
    if (provider === "gemini") return await askGemini(text, systemPrompt, env.GEMINI_API_KEY, model);
    if (provider === "groq") return await askGroq(text, systemPrompt, env.GROQ_API_KEY, model);
    if (provider === "anthropic") return await askAnthropic(text, systemPrompt, env.ANTHROPIC_API_KEY, model);
  } catch (err) {
    log.error({ err, provider }, "askAssistant: fallo al llamar al proveedor de AI");
  }
  return {
    reply: "Por ahora estoy en modo pruebas. Te ayudamos pronto.",
    next_state: "interesado",
    send_catalog: false,
  };
}

// Org-level assistant: uses org config if available, falls back to system
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
      if (orgConfig.ai_provider === "openai") return await askOpenAI(text, systemPrompt, apiKey, model);
      if (orgConfig.ai_provider === "gemini") return await askGemini(text, systemPrompt, apiKey, model);
      if (orgConfig.ai_provider === "anthropic") return await askAnthropic(text, systemPrompt, apiKey, model);
      if (orgConfig.ai_provider === "groq") return await askGroq(text, systemPrompt, apiKey, model);
    } catch (err) {
      log.error({ err, provider: orgConfig.ai_provider }, "askAssistantForOrg: fallo proveedor org, usando sistema");
    }
  }

  // Fallback to system-level
  return askAssistant(text, systemPrompt);
}

// Validation: test that an API key + model combo works
export async function validateAiProvider(
  provider: "openai" | "gemini" | "anthropic" | "groq",
  apiKey: string,
  model: string,
): Promise<{ ok: boolean; error?: string }> {
  const testPrompt = 'Respond with exactly: {"ok":true}';
  const systemPrompt = "You are a test assistant. Follow instructions exactly.";
  try {
    if (provider === "openai") await askOpenAI(testPrompt, systemPrompt, apiKey, model);
    else if (provider === "gemini") await askGemini(testPrompt, systemPrompt, apiKey, model);
    else if (provider === "anthropic") await askAnthropic(testPrompt, systemPrompt, apiKey, model);
    else if (provider === "groq") await askGroq(testPrompt, systemPrompt, apiKey, model);
    return { ok: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: msg };
  }
}
