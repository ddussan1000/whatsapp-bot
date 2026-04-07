import { GoogleGenAI } from "@google/genai";
import { env } from "../config/env";
import sharp from "sharp";

export type GeminiOcrResult = {
  isReceipt: boolean;
  amount: number | null;
  currency: string | null;
  date: string | null;
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

  const compressed = await compressForGemini(imgBuffer);
  const base64 = compressed.toString("base64");
  const ai = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });

  const prompt = `Analyze this payment receipt image. The expected currency is ${currency}.
Respond ONLY with this JSON (no explanation):
{"isReceipt":BOOL,"amount":NUMBER_OR_NULL,"currency":"CODE_OR_NULL","date":"DD/MM/YYYY_OR_NULL","reference":"STRING_OR_NULL"}
Rules:
- isReceipt: true only if this is a payment/transaction receipt
- amount: numeric value only (no symbols), null if not found
- currency: ISO 4217 code if clearly visible, otherwise "${currency}"
- date: format dd/mm/yyyy if found, null otherwise
- reference: transaction/operation ID if visible, null otherwise`;

  const response = await ai.models.generateContent({
    model: "gemini-2.0-flash-lite",
    config: {
      temperature: 0,
      maxOutputTokens: 120,
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
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return {
      isReceipt: parsed.isReceipt === true,
      amount: typeof parsed.amount === "number" ? parsed.amount : null,
      currency:
        typeof parsed.currency === "string" && parsed.currency.length > 0
          ? parsed.currency
          : currency,
      date:
        typeof parsed.date === "string" && parsed.date.length > 0
          ? parsed.date
          : null,
      reference:
        typeof parsed.reference === "string" && parsed.reference.length > 0
          ? parsed.reference
          : null,
    };
  } catch {
    return {
      isReceipt: false,
      amount: null,
      currency: null,
      date: null,
      reference: null,
    };
  }
}
