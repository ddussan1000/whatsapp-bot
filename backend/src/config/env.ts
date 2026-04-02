import { z } from "zod";

const envSchema = z.object({
  PORT: z.string().default("3000"),
  LOG_LEVEL: z.string().default("info"),
  META_TOKEN: z.string().default(""),
  META_PHONE_ID: z.string().default(""),
  VERIFY_TOKEN: z.string().default(""),
  SUPABASE_URL: z.string().default(""),
  /** Prefer service_role en el servidor API para leer membresías sin depender de RLS con anon. */
  SUPABASE_KEY: z.string().default(""),
  SUPABASE_SERVICE_ROLE_KEY: z.string().default(""),
  ANTHROPIC_API_KEY: z.string().default(""),
  GEMINI_API_KEY: z.string().default(""),
  GROQ_API_KEY: z.string().default(""),
  GROQ_MODEL: z.string().default("llama-3.3-70b-versatile"),
  AI_PROVIDER: z.enum(["anthropic", "gemini", "groq", "auto"]).default("auto"),
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
  STORAGE_MODE: z.enum(["local", "supabase"]).default("local"),
  SUPABASE_STORAGE_BUCKET_RECEIPTS: z.string().default("receipts"),
  SUPABASE_STORAGE_BUCKET_FLOW_MEDIA: z.string().default("flow-media"),
  RECEIPT_RETENTION_DAYS: z.coerce.number().default(7),
  OCR_PROVIDER: z.enum(["tesseract", "google"]).default("tesseract"),
});

export const env = envSchema.parse(process.env);
