import { env } from "../config/env";

const SYSTEM = `Eres un asistente de ventas por WhatsApp.
Responde en espanol, maximo 3 oraciones y tono amigable.
Devuelve JSON valido con:
{"reply":"texto","next_state":"interesado|listo_pagar|necesita_agente|null","send_catalog":false}`;

export async function askHaiku(text: string, systemOverride?: string | null) {
  if (!env.ANTHROPIC_API_KEY) {
    return { reply: "Por ahora estoy en modo pruebas. Te ayudamos pronto.", next_state: "interesado", send_catalog: false };
  }

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
      system: systemOverride && systemOverride.trim().length > 0 ? systemOverride : SYSTEM,
      messages: [{ role: "user", content: text }],
    }),
  });

  if (!res.ok) throw new Error(`Haiku API error ${res.status}`);
  const data = (await res.json()) as { content?: Array<{ text?: string }> };
  const raw = data.content?.[0]?.text ?? "{\"reply\":\"No pude responder\",\"next_state\":null,\"send_catalog\":false}";
  return JSON.parse(raw);
}
