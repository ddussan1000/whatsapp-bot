import type { MiddlewareHandler } from "hono";
import Redis from "ioredis";
import { env } from "../config/env";
import { log } from "../logger";

// Reutiliza la conexión Redis si está habilitada
const redis =
  env.REDIS_ENABLED === "true"
    ? new Redis(env.REDIS_URL, { maxRetriesPerRequest: 1, enableOfflineQueue: false })
    : null;

// Fallback en memoria cuando Redis no está disponible
const inMemory = new Map<string, { count: number; resetAt: number }>();

async function increment(key: string, windowMs: number): Promise<number> {
  const now = Date.now();

  if (redis) {
    try {
      const pipeline = redis.pipeline();
      pipeline.incr(key);
      pipeline.pexpire(key, windowMs);
      const results = await pipeline.exec();
      return (results?.[0]?.[1] as number) ?? 1;
    } catch (err) {
      log.warn({ err }, "rateLimiter: Redis falló → fallback a memoria");
    }
  }

  // Fallback en memoria
  const entry = inMemory.get(key);
  if (!entry || now >= entry.resetAt) {
    inMemory.set(key, { count: 1, resetAt: now + windowMs });
    return 1;
  }
  entry.count += 1;
  return entry.count;
}

type RateLimitConfig = {
  /** Clave que identifica el bucket (función que recibe el contexto) */
  keyFn: (c: Parameters<MiddlewareHandler>[0]) => string;
  /** Cantidad máxima de requests permitidos */
  limit: number;
  /** Ventana de tiempo en milisegundos */
  windowMs: number;
};

function createRateLimiter(config: RateLimitConfig): MiddlewareHandler {
  return async (c, next) => {
    const key = `rl:${config.keyFn(c)}`;
    const count = await increment(key, config.windowMs);

    c.header("X-RateLimit-Limit", String(config.limit));
    c.header("X-RateLimit-Remaining", String(Math.max(0, config.limit - count)));

    if (count > config.limit) {
      log.warn({ key, count, limit: config.limit }, "rate limit excedido");
      return c.json(
        { error: "Demasiadas solicitudes. Intenta más tarde." },
        429,
        { "Retry-After": String(Math.ceil(config.windowMs / 1000)) },
      );
    }

    await next();
  };
}

/**
 * Rate limiter global por IP — 200 req / 10 s.
 * Aplicar a todas las rutas /api/*.
 */
export const globalRateLimiter = createRateLimiter({
  keyFn: (c) => {
    const ip =
      c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ??
      c.req.header("x-real-ip") ??
      "unknown";
    return `global:${ip}`;
  },
  limit: 200,
  windowMs: 10_000,
});

/**
 * Rate limiter para mutaciones por organización — 30 req / 10 s.
 * Aplicar a rutas POST / PUT / PATCH / DELETE de /api/*.
 */
export const mutationRateLimiter = createRateLimiter({
  keyFn: (c) => {
    const orgHeader = c.req.header("x-organization-id") ?? "anon";
    return `mut:${orgHeader}`;
  },
  limit: 30,
  windowMs: 10_000,
});

/**
 * Rate limiter estricto para el webhook — 300 req / 10 s global.
 * Meta puede enviar ráfagas; no limitamos por org aquí.
 */
export const webhookRateLimiter = createRateLimiter({
  keyFn: (c) => {
    const ip =
      c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
    return `webhook:${ip}`;
  },
  limit: 300,
  windowMs: 10_000,
});
