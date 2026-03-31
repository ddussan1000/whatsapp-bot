import { env } from "../config/env";

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
  return JSON.parse(raw);
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
  const model = "gemini-1.5-flash";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${env.GEMINI_API_KEY}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text }] }],
      systemInstruction: { parts: [{ text: systemPrompt }] },
      generationConfig: {
        temperature: 0.3,
        maxOutputTokens: 280,
        responseMimeType: "application/json",
      },
    }),
  });
  if (!res.ok) throw new Error(`Gemini API error ${res.status}`);
  const data = (await res.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  const raw =
    data.candidates?.[0]?.content?.parts?.[0]?.text ??
    "{\"reply\":\"No pude responder\",\"next_state\":null,\"send_catalog\":false}";
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

  try {
    if (provider === "gemini" && env.GEMINI_API_KEY) return await askGemini(text, systemPrompt);
    if (provider === "anthropic" && env.ANTHROPIC_API_KEY) return await askAnthropic(text, systemPrompt);
  } catch {
    // fallback below
  }
  return {
    reply: "Por ahora estoy en modo pruebas. Te ayudamos pronto.",
    next_state: "interesado",
    send_catalog: false,
  };
}

