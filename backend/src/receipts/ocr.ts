import sharp from "sharp";
import Tesseract from "tesseract.js";

const RECEIPT_KEYWORDS = [
  "comprobante",
  "pago",
  "transaccion",
  "transferencia",
  "recibo",
  "deposito",
  "consignacion",
  "nequi",
  "daviplata",
  "bancolombia",
  "davivienda",
  "banco",
  "bbva",
  "scotiabank",
  "colpatria",
  "popular",
  "exitoso",
  "exitosa",
  "aprobado",
  "aprobada",
  "confirmado",
  "confirmada",
  "valor",
  "monto",
  "total",
  "referencia",
  "ref",
  "numero de operacion",
  "clave",
  "cta",
  "cuenta",
  "debito",
  "credito",
  "ahorro",
  "corriente",
  "pse",
  "efecty",
  "giro",
  "remesa",
  "corresponsal",
  "transf",
  "movimiento",
  "compra",
  "abono",
  "retiro",
  "ingreso",
  "egreso",
  "saldo",
  "destinatario",
  "beneficiario",
  "ordenante",
  "cus",
  "aprobacion",
  "voucher",
  "recaudo",
  "billetera",
  "billetera digital",
  "codigo de barras",
  "codigo qr",
  "autorizacion",
  "entidad",
  "sucursal",
  "cajero",
  "receipt",
  "payment",
  "transaction",
  "transfer",
  "approved",
  "amount",
];

const monthMap: Record<string, number> = {
  enero: 1,
  ene: 1,
  febrero: 2,
  feb: 2,
  marzo: 3,
  mar: 3,
  abril: 4,
  abr: 4,
  mayo: 5,
  junio: 6,
  jun: 6,
  julio: 7,
  jul: 7,
  agosto: 8,
  ago: 8,
  septiembre: 9,
  setiembre: 9,
  sep: 9,
  octubre: 10,
  oct: 10,
  noviembre: 11,
  nov: 11,
  diciembre: 12,
  dic: 12,
};

function normalizeText(raw: string) {
  return raw
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .replace(/a\.\s*m\./g, "am")
    .replace(/p\.\s*m\./g, "pm")
    .replace(/a\s*m/g, "am")
    .replace(/p\s*m/g, "pm")
    .trim();
}

function parseTime(timeRaw?: string, meridiemRaw?: string) {
  if (!timeRaw) return { hours: 12, minutes: 0 };
  const [h, m] = timeRaw.split(":");
  let hours = Number(h ?? "0");
  const minutes = Number(m ?? "0");
  const meridiem = (meridiemRaw ?? "").toLowerCase();

  if (meridiem === "pm" && hours < 12) hours += 12;
  if (meridiem === "am" && hours === 12) hours = 0;
  return { hours, minutes };
}

function parseReceiptDate(text: string): Date | null {
  const normalized = normalizeText(text);

  const numeric = normalized.match(
    /(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})(?:\s*[-,]?\s*(\d{1,2}:\d{2})\s*(am|pm)?)?/,
  );
  if (numeric?.[1] && numeric?.[2] && numeric?.[3]) {
    const day = Number(numeric[1]);
    const month = Number(numeric[2]);
    const year = Number(
      numeric[3].length === 2 ? `20${numeric[3]}` : numeric[3],
    );
    const { hours, minutes } = parseTime(numeric[4], numeric[5]);
    return new Date(year, month - 1, day, hours, minutes, 0, 0);
  }

  const isoLike = normalized.match(
    /(\d{4})[\/\-\.](\d{1,2})[\/\-\.](\d{1,2})(?:\s*[-,]?\s*(\d{1,2}:\d{2})\s*(am|pm)?)?/,
  );
  if (isoLike?.[1] && isoLike?.[2] && isoLike?.[3]) {
    const year = Number(isoLike[1]);
    const month = Number(isoLike[2]);
    const day = Number(isoLike[3]);
    const { hours, minutes } = parseTime(isoLike[4], isoLike[5]);
    return new Date(year, month - 1, day, hours, minutes, 0, 0);
  }

  const literalPatterns = [
    /(\d{1,2})\s+de\s+([a-z]+)\s+d(?:e|el)\s+(\d{4})(?:\s*[-,]?\s*(\d{1,2}:\d{2})\s*(am|pm)?)?/,
    /(\d{1,2})\s+([a-z]+)\s+(\d{4})(?:\s*[-,]?\s*(\d{1,2}:\d{2})\s*(am|pm)?)?/,
  ];

  for (const rx of literalPatterns) {
    const literal = normalized.match(rx);
    if (!literal?.[1] || !literal?.[2] || !literal?.[3]) continue;
    const day = Number(literal[1]);
    const month = monthMap[literal[2]];
    const year = Number(literal[3]);
    if (!month) continue;
    const { hours, minutes } = parseTime(literal[4], literal[5]);
    return new Date(year, month - 1, day, hours, minutes, 0, 0);
  }

  return null;
}

const OCR_TIMEOUT_MS = 30_000;

export async function runOcr(imgBuffer: Buffer): Promise<string> {
  const processed = await sharp(imgBuffer)
    .grayscale()
    .normalize()
    .sharpen()
    .toBuffer();
  const { data } = await Promise.race([
    Tesseract.recognize(processed, "spa"),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("OCR timeout")), OCR_TIMEOUT_MS),
    ),
  ]);
  return data.text ?? "";
}

export function isLikelyReceipt(ocrText: string): boolean {
  const normalized = normalizeText(ocrText);
  let matches = 0;
  for (const kw of RECEIPT_KEYWORDS) {
    if (normalized.includes(kw)) {
      matches++;
      if (matches >= 2) return true;
    }
  }
  return false;
}

export function extractPaymentFields(ocrText: string) {
  const amountPatterns = [
    /(?:valor|monto|total|por)[:\s]*\$?\s*([\d.,]+)/i,
    /\$\s*([\d]{1,3}(?:[.,]\d{3})+)/,
    /([\d]{1,3}(?:\.\d{3})+)/,
  ];

  let amount: number | null = null;
  for (const p of amountPatterns) {
    const match = ocrText.match(p);
    if (match?.[1]) {
      amount = Number.parseFloat(match[1].replace(/\./g, "").replace(",", "."));
      break;
    }
  }

  const receiptDate = parseReceiptDate(ocrText);
  const hoursDiff = receiptDate
    ? (Date.now() - receiptDate.getTime()) / 3600000
    : null;
  const isWithin24Hours = receiptDate
    ? hoursDiff !== null && hoursDiff <= 24 && hoursDiff >= 0
    : false;
  return { text: ocrText, amount, receiptDate, isWithin24Hours };
}

/** @deprecated Use runOcr + extractPaymentFields instead */
export async function extractPaymentData(imgBuffer: Buffer) {
  const text = await runOcr(imgBuffer);
  return extractPaymentFields(text);
}

// ── Unified OCR with Gemini fallback ──────────────────────────────────────

import { env } from "../config/env";
import { log } from "../logger";

export type OcrResult = {
  amount: number | null;
  receiptDate: Date | null;
  isWithin24Hours: boolean;
  isLikelyReceipt: boolean;
  rawText: string;
  ocrProvider: "gemini" | "tesseract" | "gemini_then_tesseract";
  currency: string | null;
};

export async function runOcrWithFallback(
  imgBuffer: Buffer,
  currency = "COP",
): Promise<OcrResult> {
  const useGemini =
    env.OCR_PROVIDER === "gemini" ||
    (env.OCR_PROVIDER === "auto" && !!env.GEMINI_API_KEY);

  log.info(
    {
      ocrProvider: env.OCR_PROVIDER,
      useGemini,
      hasGeminiKey: !!env.GEMINI_API_KEY,
      imageSizeKb: Math.round(imgBuffer.length / 1024),
    },
    "OCR: iniciando análisis de imagen",
  );

  if (useGemini) {
    try {
      const { runGeminiOcr } = await import("./geminiOcr");
      const geminiResult = await runGeminiOcr(imgBuffer, currency);

      log.info(
        {
          isReceipt: geminiResult.isReceipt,
          amount: geminiResult.amount,
          currency: geminiResult.currency,
          date: geminiResult.date,
          reference: geminiResult.reference,
        },
        "OCR: respuesta de Gemini",
      );

      if (!geminiResult.isReceipt) {
        log.info("OCR: Gemini determinó que NO es un comprobante");
        return {
          amount: null,
          receiptDate: null,
          isWithin24Hours: false,
          isLikelyReceipt: false,
          rawText: "",
          ocrProvider: "gemini",
          currency: null,
        };
      }

      if (geminiResult.amount !== null || geminiResult.date !== null) {
        let receiptDate: Date | null = null;
        if (geminiResult.date) {
          const m = geminiResult.date.match(
            /^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})$/,
          );
          if (m?.[1] && m[2] && m[3]) {
            const year = m[3].length === 2 ? `20${m[3]}` : m[3];
            receiptDate = new Date(
              Number(year),
              Number(m[2]) - 1,
              Number(m[1]),
            );
          } else {
            const d = new Date(geminiResult.date);
            if (!isNaN(d.getTime())) receiptDate = d;
          }
        }
        const hoursDiff = receiptDate
          ? (Date.now() - receiptDate.getTime()) / 3600000
          : null;
        log.info(
          {
            receiptDate: receiptDate?.toISOString() ?? null,
            hoursDiff: hoursDiff !== null ? Math.round(hoursDiff * 10) / 10 : null,
            isWithin24Hours: receiptDate && hoursDiff !== null ? hoursDiff <= 24 && hoursDiff >= 0 : false,
          },
          "OCR: comprobante validado por Gemini",
        );
        return {
          amount: geminiResult.amount,
          receiptDate,
          isWithin24Hours:
            receiptDate && hoursDiff !== null
              ? hoursDiff <= 24 && hoursDiff >= 0
              : false,
          isLikelyReceipt: true,
          rawText: `[Gemini] amount=${geminiResult.amount} date=${geminiResult.date} ref=${geminiResult.reference}`,
          ocrProvider: "gemini",
          currency: geminiResult.currency,
        };
      }
      // Gemini detected receipt but no data extracted → fall through to Tesseract
      log.warn(
        { amount: geminiResult.amount, date: geminiResult.date },
        "OCR: Gemini detectó comprobante pero no extrajo datos → fallback a Tesseract",
      );
    } catch (err) {
      log.error(
        { err },
        "OCR: Gemini lanzó error → fallback a Tesseract",
      );
    }
  }

  // Tesseract path
  log.info("OCR: ejecutando Tesseract");
  const ocrText = await runOcr(imgBuffer);
  const likelyReceipt = isLikelyReceipt(ocrText);
  log.info(
    {
      likelyReceipt,
      textSnippet: ocrText.slice(0, 300),
    },
    "OCR: resultado Tesseract",
  );
  if (!likelyReceipt) {
    return {
      amount: null,
      receiptDate: null,
      isWithin24Hours: false,
      isLikelyReceipt: false,
      rawText: ocrText,
      ocrProvider: useGemini ? "gemini_then_tesseract" : "tesseract",
      currency: null,
    };
  }
  const fields = extractPaymentFields(ocrText);
  return {
    amount: fields.amount,
    receiptDate: fields.receiptDate,
    isWithin24Hours: fields.isWithin24Hours,
    isLikelyReceipt: true,
    rawText: ocrText,
    ocrProvider: useGemini ? "gemini_then_tesseract" : "tesseract",
    currency,
  };
}
