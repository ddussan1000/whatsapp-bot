import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Verifica la firma X-Hub-Signature-256 que Meta envía en cada webhook.
 * El app_secret es el "App Secret" de la Meta App, almacenado por instancia en la DB.
 * Retorna true si la firma es válida, false si no.
 */
export function validateWebhookSignature(
  rawBody: string,
  signatureHeader: string | undefined,
  appSecret: string,
): boolean {
  if (!signatureHeader || !appSecret) return false;

  const expected =
    "sha256=" +
    createHmac("sha256", appSecret).update(rawBody, "utf8").digest("hex");

  try {
    return timingSafeEqual(
      Buffer.from(signatureHeader),
      Buffer.from(expected),
    );
  } catch {
    return false;
  }
}
