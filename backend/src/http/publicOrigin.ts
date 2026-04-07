import type { Context } from "hono";
import { env } from "../config/env";
import { log } from "../logger";

/**
 * Origen público (https://host) para URLs mostradas al usuario.
 * Detrás de Railway/Vercel el request interno suele ser http; el proxy envía
 * X-Forwarded-Proto y X-Forwarded-Host.
 */
export function getPublicOrigin(c: Context): string {
  const fromEnv = env.PUBLIC_BASE_URL?.trim();
  if (fromEnv) {
    try {
      return new URL(fromEnv).origin;
    } catch (err) {
      log.warn({ err, PUBLIC_BASE_URL: fromEnv }, "publicOrigin: URL inválida en PUBLIC_BASE_URL → usando headers");
    }
  }

  const url = new URL(c.req.url, "http://localhost");
  const forwardedProto = c.req.header("x-forwarded-proto")?.split(",")[0]?.trim();
  const forwardedHost = c.req.header("x-forwarded-host")?.split(",")[0]?.trim();
  const host = forwardedHost || c.req.header("host") || url.host;
  const proto =
    forwardedProto ||
    (url.protocol && url.protocol !== ":" ? url.protocol.replace(":", "") : "http");

  return `${proto}://${host}`;
}
