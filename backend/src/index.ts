import { serve } from "@hono/node-server";
import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { cors } from "hono/cors";
import { swaggerUI } from "@hono/swagger-ui";
import { env } from "./config/env";
import { log } from "./logger";
import { verifyWebhook } from "./webhook/verify";
import { handleWebhook } from "./webhook/handler";
import { registerDailyReportCron } from "./cron/dailyReport";
import { registerScheduledMessagesCron } from "./cron/processScheduledMessages";
import { registerPurgeReceiptsCron } from "./cron/purgeReceipts";
import { registerPurgeMessagesCron } from "./cron/purgeOldMessages";
import { dashboardApi } from "./api/dashboard";
import { globalRateLimiter, mutationRateLimiter, webhookRateLimiter } from "./middleware/rateLimiter";
import { startMessageWorker } from "./workers/messageWorker";
import { sql } from "./db/postgres";

const app = new OpenAPIHono();
app.doc("/openapi.json", {
  openapi: "3.0.3",
  info: { title: "WhatsApp Bot API", version: "1.0.0" },
});

const allowedOrigins = env.ALLOWED_ORIGINS
  ? env.ALLOWED_ORIGINS.split(",").map((s) => s.trim()).filter(Boolean)
  : [];

app.use(
  "/api/*",
  cors({
    origin: (origin) => {
      // localhost siempre permitido (desarrollo local en cualquier puerto)
      if (origin && (origin.startsWith("http://localhost:") || origin.startsWith("http://127.0.0.1:"))) {
        return origin;
      }
      // Sin ALLOWED_ORIGINS configurado: permitir cualquier origen
      if (allowedOrigins.length === 0) return origin;
      // En producción: solo los dominios explícitamente listados
      return allowedOrigins.includes(origin) ? origin : null;
    },
    allowHeaders: ["Authorization", "Content-Type", "X-Organization-Id"],
    allowMethods: ["GET", "POST", "PUT", "PATCH", "OPTIONS", "DELETE"],
    credentials: true,
  }),
);

app.openapi(
  createRoute({
    method: "get",
    path: "/",
    responses: {
      200: {
        description: "Service info",
        content: {
          "application/json": {
            schema: z.object({ ok: z.boolean(), service: z.string() }),
          },
        },
      },
    },
  }),
  (c) => c.json({ ok: true, service: "whatsapp-bot" }, 200),
);

app.openapi(
  createRoute({
    method: "get",
    path: "/health",
    responses: {
      200: {
        description: "Health check",
        content: { "application/json": { schema: z.object({ status: z.string() }) } },
      },
    },
  }),
  (c) => c.json({ status: "up" }, 200),
);

app.get("/docs", swaggerUI({ url: "/openapi.json" }));
app.get("/webhook", verifyWebhook);
app.post("/webhook", webhookRateLimiter, handleWebhook);
app.use("/api/*", globalRateLimiter);
app.use("/api/*", async (c, next) => {
  if (["POST", "PUT", "PATCH", "DELETE"].includes(c.req.method)) {
    return mutationRateLimiter(c, next);
  }
  await next();
});
app.route("/api", dashboardApi);

const messageWorker = startMessageWorker();
registerDailyReportCron();
registerScheduledMessagesCron();
registerPurgeReceiptsCron();
registerPurgeMessagesCron();

process.on("unhandledRejection", (reason) => {
  log.error({ reason }, "unhandledRejection — proceso continúa");
});

process.on("uncaughtException", (err) => {
  log.error({ err }, "uncaughtException — proceso continúa");
});

process.on("SIGTERM", async () => {
  log.info("SIGTERM: cerrando worker y conexiones...");
  try {
    await messageWorker?.close();
    await sql?.end();
  } catch (err) {
    log.error({ err }, "SIGTERM: error durante shutdown");
  }
  process.exit(0);
});

serve(
  {
    fetch: app.fetch,
    port: Number(env.PORT),
  },
  (info) => {
    log.info(`Server corriendo en http://localhost:${info.port}`);
  },
);
