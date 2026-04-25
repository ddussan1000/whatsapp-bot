import postgres from "postgres";
import { env } from "../config/env";
import { log } from "../logger";

// Direct PostgreSQL connection via Supabase PgBouncer (transaction mode, port 6543).
// Only active when DATABASE_URL_DIRECT is set. Falls back to PostgREST (supabase-js) otherwise.
export const sql = env.DATABASE_URL_DIRECT
  ? postgres(env.DATABASE_URL_DIRECT, {
      max: 10,
      idle_timeout: 20,
      connect_timeout: 10,
      onnotice: () => {},
    })
  : null;

if (sql) {
  log.info("postgres.js: conexión directa PgBouncer activa");
}
