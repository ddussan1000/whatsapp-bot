import { GoogleGenAI } from "@google/genai";
import { env } from "../config/env";
import { log } from "../logger";
import sharp from "sharp";

export type GeminiOcrResult = {
  isReceipt: boolean;
  amount: number | null;
  currency: string | null;
  /** "DD/MM/YYYY HH:MM" con hora, o "DD/MM/YYYY" solo fecha, o null */
  datetime: string | null;
  reference: string | null;
};

async function compressForGemini(imgBuffer: Buffer): Promise<Buffer> {
  return sharp(imgBuffer)
    .resize({
      width: 1024,
      height: 1024,
      fit: "inside",
      withoutEnlargement: true,
    })
    .jpeg({ quality: 85 })
    .toBuffer();
}

export async function runGeminiOcr(
  imgBuffer: Buffer,
  currency = "COP",
): Promise<GeminiOcrResult> {
  if (!env.GEMINI_API_KEY) throw new Error("GEMINI_API_KEY not configured");

  const model = env.GEMINI_OCR_MODEL ?? "gemini-1.5-flash";
  log.info({ model, currency }, "geminiOcr: iniciando llamada a Gemini API");

  const compressed = await compressForGemini(imgBuffer);
  const base64 = compressed.toString("base64");
  const ai = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });

  const prompt = `Analyze this payment receipt image. The expected currency is ${currency}.
Respond ONLY with this JSON (no explanation):
{"isReceipt":BOOL,"amount":NUMBER_OR_NULL,"currency":"CODE_OR_NULL","datetime":"DD/MM/YYYY HH:MM_OR_NULL","reference":"STRING_OR_NULL"}
Rules:
- isReceipt: true only if this is a payment/transaction receipt
- amount: return as a plain INTEGER — no decimals, no separators, no currency symbols. LATIN AMERICAN FORMAT RULE (COP, ARS, MXN, PEN, etc.): the period "." is a THOUSANDS separator (remove it), the comma "," is a DECIMAL separator (remove it and everything after it). Examples: "$ 12.000,00" → 12000 | "$ 1.500.000,00" → 1500000 | "$ 25.000" → 25000 | "$ 4.315" → 4315 | "$ 850.000,00" → 850000. CRITICAL: NEVER return 0 or a number under 100 for COP/ARS/MXN receipts — those currencies have no cents worth less than 1. If the full amount is ambiguous, return null.
- currency: ISO 4217 code if clearly visible, otherwise "${currency}"
- datetime: date AND time in format "dd/mm/yyyy HH:MM" (24h) if both visible, or "dd/mm/yyyy" if only date is visible, null if no date found
- reference: transaction/operation ID if visible, null otherwise`;

  const response = await ai.models.generateContent({
    model,
    config: {
      temperature: 0,
      maxOutputTokens: 150,
      responseMimeType: "application/json",
    },
    contents: [
      {
        role: "user",
        parts: [
          { inlineData: { mimeType: "image/jpeg", data: base64 } },
          { text: prompt },
        ],
      },
    ],
  });

  const raw = (response.text ?? "{}")
    .replace(/```(?:json)?\s*/g, "")
    .replace(/```/g, "")
    .trim();
  const rawPreview = raw.slice(0, 500);
  log.info({ raw: rawPreview }, "geminiOcr: respuesta raw de Gemini");
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    log.info(
      { isReceipt: parsed.isReceipt, amount: parsed.amount, datetime: parsed.datetime },
      "geminiOcr: JSON parseado correctamente",
    );
    // Coerce string amounts ("12000" → 12000) in case Gemini ignores JSON type hint
    let rawAmount: number | null = null;
    if (typeof parsed.amount === "number") {
      rawAmount = parsed.amount;
    } else if (typeof parsed.amount === "string" && parsed.amount.trim() !== "") {
      const coerced = Number(parsed.amount.trim());
      if (!isNaN(coerced)) {
        rawAmount = coerced;
        log.warn({ raw: parsed.amount, coerced }, "geminiOcr: amount era string, se coercionó a número");
      }
    }
    // Discard 0 and negatives — valid payments always have amount > 0
    const amount = rawAmount !== null && rawAmount > 0 ? rawAmount : null;
    if (rawAmount !== null && rawAmount <= 0) {
      log.warn({ rawAmount }, "geminiOcr: amount <= 0 descartado");
    }
    return {
      isReceipt: parsed.isReceipt === true,
      amount,
      currency:
        typeof parsed.currency === "string" && parsed.currency.length > 0
          ? parsed.currency
          : currency,
      datetime:
        typeof parsed.datetime === "string" && parsed.datetime.length > 0
          ? parsed.datetime
          : null,
      reference:
        typeof parsed.reference === "string" && parsed.reference.length > 0
          ? parsed.reference
          : null,
    };
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error("[geminiOcr] JSON parse error:", errMsg, "raw:", raw);
    log.error({ errMsg, raw: rawPreview }, "geminiOcr: error parseando JSON de respuesta");
    return {
      isReceipt: false,
      amount: null,
      currency: null,
      datetime: null,
      reference: null,
    };
  }
}
