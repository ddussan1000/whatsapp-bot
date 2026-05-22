import { z } from "zod";

const envSchema = z.object({
  PORT: z.string().default("3000"),
  LOG_LEVEL: z.string().default("info"),
  /** Orígenes permitidos para CORS, separados por coma. Ej: https://app.dssbot.site,https://dssbot.site */
  ALLOWED_ORIGINS: z.string().default(""),
  SUPABASE_URL: z.string().default(""),
  /** Prefer service_role en el servidor API para leer membresías sin depender de RLS con anon. */
  SUPABASE_KEY: z.string().default(""),
  SUPABASE_SERVICE_ROLE_KEY: z.string().default(""),
  /** Master key for AES-256-GCM encryption (64 hex chars = 32 bytes). Generate with: openssl rand -hex 32 */
  ENCRYPTION_KEY: z.string().regex(/^([0-9a-fA-F]{64})?$/).default(""),
  /** Solo para OCR de comprobantes. La IA post-flujo usa la API key configurada por cada organización. */
  GEMINI_API_KEY: z.string().default(""),
  REDIS_URL: z.string().default("redis://localhost:6379"),
  REDIS_ENABLED: z.enum(["true", "false"]).default("false"),
  ADMIN_PHONE: z.string().default(""),
  TELEGRAM_BOT_TOKEN: z.string().default(""),
  TELEGRAM_CHAT_ID: z.string().default(""),
  DASHBOARD_SECRET: z.string().default(""),
  /** URL pública del backend (ej. https://xxx.up.railway.app). Opcional; si no se define se usa X-Forwarded-* */
  PUBLIC_BASE_URL: z.string().default(""),
  RESEND_API_KEY: z.string().default(""),
  RESEND_FROM_EMAIL: z.string().default("onboarding@resend.dev"),
  /** URL pública del dashboard frontend (ej. https://dashboard.tudominio.com) */
  DASHBOARD_PUBLIC_URL: z.string().default(""),
  STORAGE_MODE: z.enum(["local", "supabase", "r2"]).default("local"),
  SUPABASE_STORAGE_BUCKET_RECEIPTS: z.string().default("receipts"),
  SUPABASE_STORAGE_BUCKET_FLOW_MEDIA: z.string().default("flow-media"),
  R2_ACCOUNT_ID: z.string().default(""),
  R2_ACCESS_KEY_ID: z.string().default(""),
  R2_SECRET_ACCESS_KEY: z.string().default(""),
  R2_BUCKET_NAME: z.string().default(""),
  /** URL pública del bucket R2 (ej. https://media.tudominio.com o https://pub-xxx.r2.dev) */
  R2_PUBLIC_URL: z.string().default(""),
  RECEIPT_RETENTION_DAYS: z.coerce.number().default(7),
  /** OCR provider for receipt images. "gemini" or "auto" (uses Gemini when GEMINI_API_KEY is set). */
  OCR_PROVIDER: z.enum(["gemini", "auto"]).default("auto"),
  /** Gemini model used for OCR. */
  GEMINI_OCR_MODEL: z.string().default("gemini-2.5-flash-lite"),
  /** Direct PostgreSQL connection via PgBouncer (transaction mode, port 6543).
   *  Format: postgresql://postgres.[ref]:[pass]@aws-0-[region].pooler.supabase.com:6543/postgres
   *  Leave empty to use PostgREST (supabase-js) for all queries. */
  DATABASE_URL_DIRECT: z.string().default(""),
});

export const env = envSchema.parse(process.env);
