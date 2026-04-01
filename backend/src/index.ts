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
import { dashboardApi } from "./api/dashboard";

const app = new OpenAPIHono();
app.doc("/openapi.json", {
  openapi: "3.0.3",
  info: { title: "WhatsApp Bot API", version: "1.0.0" },
});

app.use(
  "*",
  cors({
    origin: "*",
    allowHeaders: ["Authorization", "Content-Type", "X-Organization-Id"],
    allowMethods: ["GET", "POST", "PUT", "PATCH", "OPTIONS", "DELETE"],
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
app.post("/webhook", handleWebhook);
app.route("/api", dashboardApi);

registerDailyReportCron();
registerScheduledMessagesCron();
registerPurgeReceiptsCron();

serve(
  {
    fetch: app.fetch,
    port: Number(env.PORT),
  },
  (info) => {
    log.info(`Server corriendo en http://localhost:${info.port}`);
  },
);
