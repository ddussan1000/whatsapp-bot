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

/**
 * UTC offset en horas para la zona horaria principal de cada divisa.
 * Permite interpretar correctamente la hora del comprobante según el país.
 * No se usa DST (horario de verano) — se asume el offset estándar como aproximación.
 */
const CURRENCY_UTC_OFFSET: Record<string, number> = {
  // UTC-6
  MXN: -6, GTQ: -6, HNL: -6, NIO: -6, CRC: -6, SVC: -6,
  // UTC-5
  COP: -5, PEN: -5, PAB: -5, ECU: -5,
  // UTC-4
  VES: -4, BOB: -4, PYG: -4, DOP: -4, CLP: -4, GYD: -4,
  // UTC-3
  ARS: -3, BRL: -3, UYU: -3, SRD: -3,
  // UTC-4:30 → redondeamos a -4
  // UTC+0
  USD: 0, EUR: 0, GBP: 0,
  // UTC+1
  // default: 0 para todo lo demás
};

/**
 * Parsea el datetime del comprobante (en hora local del país de la divisa)
 * y lo convierte a UTC para comparar correctamente con Date.now().
 *
 * @param datetime "DD/MM/YYYY HH:MM" o "DD/MM/YYYY"
 * @param currency  Código ISO 4217 de la divisa (ej: "COP")
 * @returns { date: Date en UTC, hasTime: boolean }
 */
function parseReceiptDatetime(
  datetime: string,
  currency: string,
): { date: Date; hasTime: boolean } | null {
  // Intentar con fecha + hora: "DD/MM/YYYY HH:MM"
  const withTime = datetime.match(
    /^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})\s+(\d{1,2}):(\d{2})$/,
  );
  if (withTime?.[1] && withTime[2] && withTime[3] && withTime[4] && withTime[5]) {
    const day = Number(withTime[1]);
    const month = Number(withTime[2]);
    const year = Number(withTime[3].length === 2 ? `20${withTime[3]}` : withTime[3]);
    const hour = Number(withTime[4]);
    const minute = Number(withTime[5]);
    const utcOffset = CURRENCY_UTC_OFFSET[currency.toUpperCase()] ?? 0;
    // Convertir hora local → UTC: UTC = local - utcOffset
    const date = new Date(Date.UTC(year, month - 1, day, hour - utcOffset, minute));
    return { date, hasTime: true };
  }

  // Solo fecha: "DD/MM/YYYY"
  const dateOnly = datetime.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})$/);
  if (dateOnly?.[1] && dateOnly[2] && dateOnly[3]) {
    const day = Number(dateOnly[1]);
    const month = Number(dateOnly[2]);
    const year = Number(dateOnly[3].length === 2 ? `20${dateOnly[3]}` : dateOnly[3]);
    const utcOffset = CURRENCY_UTC_OFFSET[currency.toUpperCase()] ?? 0;
    // Sin hora: asumir mediodía local para reducir error máximo a ±12h
    const date = new Date(Date.UTC(year, month - 1, day, 12 - utcOffset, 0));
    return { date, hasTime: false };
  }

  // Fallback: intentar parseo nativo
  const fallback = new Date(datetime);
  if (!isNaN(fallback.getTime())) return { date: fallback, hasTime: false };

  return null;
}

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
          datetime: geminiResult.datetime,
          reference: geminiResult.reference,
        },
        "OCR: respuesta de Gemini",
      );

      if (!geminiResult.isReceipt) {
        log.info({ dummy: true }, "OCR: Gemini determinó que NO es un comprobante");
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

      if (geminiResult.amount !== null || geminiResult.datetime !== null) {
        let receiptDate: Date | null = null;
        let hasTime = false;
        const effectiveCurrency = geminiResult.currency ?? currency;

        if (geminiResult.datetime) {
          const parsed = parseReceiptDatetime(geminiResult.datetime, effectiveCurrency);
          if (parsed) {
            receiptDate = parsed.date;
            hasTime = parsed.hasTime;
          }
        }

        const hoursDiff = receiptDate
          ? (Date.now() - receiptDate.getTime()) / 3600000
          : null;

        // Si no se extrajo la hora exacta, permitir ±12h de tolerancia extra
        const windowHours = hasTime ? 24 : 36;
        const isWithin24Hours =
          receiptDate && hoursDiff !== null
            ? hoursDiff <= windowHours && hoursDiff >= -2 // -2h tolera relojes adelantados
            : false;

        log.info(
          {
            receiptDateUtc: receiptDate?.toISOString() ?? null,
            hoursDiff: hoursDiff !== null ? Math.round(hoursDiff * 10) / 10 : null,
            hasTime,
            windowHours,
            isWithin24Hours,
            currency: effectiveCurrency,
            utcOffset: CURRENCY_UTC_OFFSET[effectiveCurrency.toUpperCase()] ?? 0,
          },
          "OCR: comprobante validado por Gemini",
        );

        return {
          amount: geminiResult.amount,
          receiptDate,
          isWithin24Hours,
          isLikelyReceipt: true,
          rawText: `[Gemini] amount=${geminiResult.amount} datetime=${geminiResult.datetime} ref=${geminiResult.reference}`,
          ocrProvider: "gemini",
          currency: geminiResult.currency,
        };
      }
      // Gemini detected receipt but no data extracted → fall through to Tesseract
      log.warn(
        { amount: geminiResult.amount, datetime: geminiResult.datetime },
        "OCR: Gemini detectó comprobante pero no extrajo datos → fallback a Tesseract",
      );
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      const errStack = err instanceof Error ? err.stack : undefined;
      console.error("[OCR] Gemini error:", errMsg, errStack);
      log.error(
        { errMsg, errStack },
        "OCR: Gemini lanzó error → fallback a Tesseract",
      );
    }
  }

  // Tesseract path
  log.info({ useGemini }, "OCR: ejecutando Tesseract");
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
