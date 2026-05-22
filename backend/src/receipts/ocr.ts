import { env } from "../config/env";
import { log } from "../logger";

/**
 * UTC offset en horas para la zona horaria principal de cada divisa.
 * No se usa DST — se asume el offset estándar como aproximación.
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
  // UTC+0
  USD: 0, EUR: 0, GBP: 0,
};

function parseReceiptDatetime(
  datetime: string,
  currency: string,
): { date: Date; hasTime: boolean } | null {
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
    const date = new Date(Date.UTC(year, month - 1, day, hour - utcOffset, minute));
    return { date, hasTime: true };
  }

  const dateOnly = datetime.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})$/);
  if (dateOnly?.[1] && dateOnly[2] && dateOnly[3]) {
    const day = Number(dateOnly[1]);
    const month = Number(dateOnly[2]);
    const year = Number(dateOnly[3].length === 2 ? `20${dateOnly[3]}` : dateOnly[3]);
    const utcOffset = CURRENCY_UTC_OFFSET[currency.toUpperCase()] ?? 0;
    // Assume noon local to bound error to ±12h
    const date = new Date(Date.UTC(year, month - 1, day, 12 - utcOffset, 0));
    return { date, hasTime: false };
  }

  const fallback = new Date(datetime);
  if (!isNaN(fallback.getTime())) return { date: fallback, hasTime: false };

  return null;
}

function isRetryableError(err: unknown): boolean {
  const msg = (err instanceof Error ? err.message : String(err)).toLowerCase();
  return (
    msg.includes("503") ||
    msg.includes("429") ||
    msg.includes("unavailable") ||
    msg.includes("high demand") ||
    msg.includes("quota") ||
    msg.includes("rate limit") ||
    msg.includes("overloaded") ||
    msg.includes("too many requests")
  );
}

const GEMINI_RETRY_DELAYS_MS = [2_000, 5_000];
const GEMINI_MAX_ATTEMPTS = 3;

export type OcrResult = {
  amount: number | null;
  receiptDate: Date | null;
  isWithin24Hours: boolean;
  isLikelyReceipt: boolean;
  rawText: string;
  ocrProvider: "gemini";
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

  if (!useGemini) {
    throw new Error("Gemini OCR not configured — image sent to manual review");
  }

  const { runGeminiOcr } = await import("./geminiOcr");

  let lastError: unknown;
  for (let attempt = 1; attempt <= GEMINI_MAX_ATTEMPTS; attempt++) {
    try {
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
        log.info({}, "OCR: Gemini determinó que NO es un comprobante");
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

        const windowHours = hasTime ? 24 : 36;
        const isWithin24Hours =
          receiptDate && hoursDiff !== null
            ? hoursDiff <= windowHours && hoursDiff >= -2
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

      // Gemini detected receipt but extracted no usable data → manual review
      log.warn(
        { amount: geminiResult.amount, datetime: geminiResult.datetime },
        "OCR: Gemini detectó comprobante pero no extrajo datos → revisión manual",
      );
      return {
        amount: null,
        receiptDate: null,
        isWithin24Hours: false,
        isLikelyReceipt: true,
        rawText: "[Gemini] receipt detected but no data extracted",
        ocrProvider: "gemini",
        currency: null,
      };
    } catch (err) {
      lastError = err;
      const errMsg = err instanceof Error ? err.message : String(err);
      const retryable = isRetryableError(err);

      log.error(
        { errMsg, attempt, retryable },
        `OCR: Gemini error en intento ${attempt}/${GEMINI_MAX_ATTEMPTS}`,
      );

      if (retryable && attempt < GEMINI_MAX_ATTEMPTS) {
        const delay = GEMINI_RETRY_DELAYS_MS[attempt - 1] ?? 5_000;
        log.info({ delay, nextAttempt: attempt + 1 }, "OCR: reintentando Gemini");
        await new Promise((r) => setTimeout(r, delay));
        continue;
      }

      // Non-retryable error or retries exhausted → throw to trigger manual review
      break;
    }
  }

  const finalMsg =
    lastError instanceof Error ? lastError.message : String(lastError);
  log.error(
    { errMsg: finalMsg, attempts: GEMINI_MAX_ATTEMPTS },
    "OCR: Gemini falló tras todos los intentos → revisión manual",
  );
  throw lastError instanceof Error
    ? lastError
    : new Error(`Gemini OCR failed: ${finalMsg}`);
}
