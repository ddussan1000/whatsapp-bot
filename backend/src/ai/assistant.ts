import { GoogleGenAI } from "@google/genai";
import { env } from "../config/env";
import { log } from "../logger";

const DEFAULT_SYSTEM = `Eres un asistente de ventas por WhatsApp.
Responde en espanol, maximo 3 oraciones y tono amigable.
Devuelve JSON valido con:
{"reply":"texto","next_state":"interesado|listo_pagar|necesita_agente|null","send_catalog":false}`;

type AssistantResult = {
  reply?: string;
  next_state?: string | null;
  send_catalog?: boolean;
};

function extractJson(text: string): AssistantResult {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  const raw = start >= 0 && end > start ? text.slice(start, end + 1) : text;
  try {
    return JSON.parse(raw);
  } catch {
    // Gemini sometimes wraps JSON in markdown code blocks
    const mdMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (mdMatch) return JSON.parse(mdMatch[1].trim());
    throw new Error(`extractJson: no valid JSON found in: ${text.slice(0, 200)}`);
  }
}

async function askAnthropic(text: string, systemPrompt: string): Promise<AssistantResult> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-3-5-haiku-latest",
      max_tokens: 250,
      system: systemPrompt,
      messages: [{ role: "user", content: text }],
    }),
  });
  if (!res.ok) throw new Error(`Anthropic API error ${res.status}`);
  const data = (await res.json()) as { content?: Array<{ text?: string }> };
  const raw = data.content?.[0]?.text ?? "{\"reply\":\"No pude responder\",\"next_state\":null,\"send_catalog\":false}";
  return extractJson(raw);
}

async function askGemini(text: string, systemPrompt: string): Promise<AssistantResult> {
  const ai = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });
  const response = await ai.models.generateContent({
    model: "gemini-2.0-flash-lite",
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

export async function askAssistant(text: string, systemOverride?: string | null): Promise<AssistantResult> {
  const systemPrompt = systemOverride && systemOverride.trim().length > 0 ? systemOverride : DEFAULT_SYSTEM;
  const provider =
    env.AI_PROVIDER === "auto"
      ? env.GEMINI_API_KEY
        ? "gemini"
        : env.ANTHROPIC_API_KEY
          ? "anthropic"
          : "none"
      : env.AI_PROVIDER;

  if (provider === "none" || (provider === "gemini" && !env.GEMINI_API_KEY) || (provider === "anthropic" && !env.ANTHROPIC_API_KEY)) {
    log.warn({ provider }, "askAssistant: no hay API key configurada para el proveedor");
    return { reply: "Por ahora estoy en modo pruebas. Te ayudamos pronto.", next_state: "interesado", send_catalog: false };
  }

  try {
    if (provider === "gemini") return await askGemini(text, systemPrompt);
    if (provider === "anthropic") return await askAnthropic(text, systemPrompt);
  } catch (err) {
    log.error({ err, provider }, "askAssistant: fallo al llamar al proveedor de AI");
  }
  return {
    reply: "Por ahora estoy en modo pruebas. Te ayudamos pronto.",
    next_state: "interesado",
    send_catalog: false,
  };
}

