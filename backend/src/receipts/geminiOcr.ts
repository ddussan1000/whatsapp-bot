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

/**
 * Parses a raw amount string returned by Gemini, handling both Latin American
 * (period=thousands, comma=decimal) and US/MX (comma=thousands, period=decimal) formats.
 *
 * Rules (same as aliziabot-reportes-v2):
 *   - If both separators present → last one is decimal
 *   - If one separator with exactly 3 digits after → thousands (remove)
 *   - If one separator with 1-2 digits after → decimal (convert to ".")
 *
 * Examples:
 *   "20.000,00" → 20000   "20,000.00" → 20000
 *   "20.000"    → 20000   "1.500.000" → 1500000
 *   "250,50"    → 250.5   "1.500,50"  → 1500.5
 */
function parseAmountString(raw: string): number | null {
  let s = raw.trim().replace(/\s/g, "").replace(/^\$/, "");
  if (!s || s.toLowerCase() === "null") return null;

  const hasDot = s.includes(".");
  const hasComma = s.includes(",");

  if (hasDot && hasComma) {
    // Both separators: last one is the decimal separator
    if (s.lastIndexOf(",") > s.lastIndexOf(".")) {
      // Latin American: "20.000,00" → remove dots, comma→period
      s = s.replace(/\./g, "").replace(",", ".");
    } else {
      // US/MX: "20,000.00" → remove commas
      s = s.replace(/,/g, "");
    }
  } else if (hasDot) {
    const afterDot = s.split(".").pop() ?? "";
    if (afterDot.length === 3) {
      // Thousands: "20.000" or "1.500.000"
      s = s.replace(/\./g, "");
    }
    // else decimal: "250.50" — leave as-is
  } else if (hasComma) {
    const afterComma = s.split(",").pop() ?? "";
    if (afterComma.length === 3) {
      // Thousands: "20,000"
      s = s.replace(/,/g, "");
    } else {
      // Decimal: "250,50"
      s = s.replace(",", ".");
    }
  }

  const n = parseFloat(s);
  return isNaN(n) ? null : n;
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
{"isReceipt":BOOL,"amount":"STRING_OR_NULL","currency":"CODE_OR_NULL","datetime":"DD/MM/YYYY HH:MM_OR_NULL","reference":"STRING_OR_NULL"}
Rules:
- isReceipt: true only if this is a payment/transaction receipt
- amount: the payment amount exactly as it appears in the image (e.g. "20.000,00" or "1.500.000" or "250.50"). Include separators. DO NOT do any math or conversion. Return null if no amount found. Look for fields: Monto, Valor, Total, Importe, Enviaste, ¿Cuánto?, Cantidad.
- currency: ISO 4217 code if clearly visible, otherwise "${currency}"
- datetime: date AND time in format "dd/mm/yyyy HH:MM" (24h) if both visible, or "dd/mm/yyyy" if only date visible, null if no date found
- reference: transaction/operation ID if visible, null otherwise`;

  const response = await ai.models.generateContent({
    model,
    config: {
      temperature: 0,
      maxOutputTokens: 200,
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

    // Parse amount server-side — Gemini returns the raw string, we apply separator logic
    let amount: number | null = null;
    if (typeof parsed.amount === "string") {
      amount = parseAmountString(parsed.amount);
      log.info({ raw: parsed.amount, parsed: amount }, "geminiOcr: amount parseado");
    } else if (typeof parsed.amount === "number") {
      // Gemini returned a number directly — trust it only if it looks reasonable
      amount = parsed.amount > 0 ? parsed.amount : null;
      log.info({ amount }, "geminiOcr: amount era número directo de Gemini");
    }

    if (amount !== null && amount <= 0) {
      log.warn({ amount }, "geminiOcr: amount <= 0 descartado");
      amount = null;
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
