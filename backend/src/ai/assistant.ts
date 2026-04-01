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
  // Try markdown code block first (```json ... ```)
  const mdMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (mdMatch) {
    try {
      return JSON.parse(mdMatch[1].trim());
    } catch {}
  }

  // Try to extract a JSON object from anywhere in the text
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start >= 0 && end > start) {
    try {
      return JSON.parse(text.slice(start, end + 1));
    } catch {}
  }

  // Model returned plain text — treat it as the reply directly
  const plain = text.trim();
  if (plain.length > 0) {
    return { reply: plain, next_state: null, send_catalog: false };
  }

  throw new Error(`extractJson: no valid JSON found in: ${text.slice(0, 200)}`);
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

async function askGroq(text: string, systemPrompt: string): Promise<AssistantResult> {
  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${env.GROQ_API_KEY}`,
    },
    body: JSON.stringify({
      model: env.GROQ_MODEL,
      max_tokens: 280,
      temperature: 0.3,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: text },
      ],
    }),
  });
  if (!res.ok) throw new Error(`Groq API error ${res.status}`);
  const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const raw = data.choices?.[0]?.message?.content ?? '{"reply":"No pude responder","next_state":null,"send_catalog":false}';
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
    if (provider === "gemini") return await askGemini(text, systemPrompt);
    if (provider === "groq") return await askGroq(text, systemPrompt);
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

