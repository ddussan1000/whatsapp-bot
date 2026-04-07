/**
 * One-time migration script to encrypt existing meta_token and app_secret values.
 * Run from the backend directory: cd backend && bun run src/scripts/migrate-encrypt-tokens.ts
 *
 * Idempotent: already-encrypted rows (starting with "enc:") are skipped.
 * Sets token_encrypted = true after processing each row.
 */
import { createClient } from "@supabase/supabase-js";
import { encrypt, isEncrypted } from "../crypto/encrypt";
import { env } from "../config/env";

const supabaseUrl = env.SUPABASE_URL;
const supabaseKey = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_KEY;

if (!supabaseUrl) {
  console.error("Error: SUPABASE_URL no está definido en .env");
  process.exit(1);
}
if (!supabaseKey) {
  console.error("Error: SUPABASE_SERVICE_ROLE_KEY o SUPABASE_KEY deben estar en .env");
  process.exit(1);
}
if (!env.ENCRYPTION_KEY) {
  console.error("Error: ENCRYPTION_KEY no está definido en .env");
  console.error("Generá una con: openssl rand -hex 32");
  process.exit(1);
}

const client = createClient(supabaseUrl, supabaseKey);
const PAGE_SIZE = 50;

async function main() {
  console.log("Iniciando migración de encriptación de tokens...");
  let page = 0;
  let total = 0;
  let skipped = 0;

  while (true) {
    const { data, error } = await client
      .from("whatsapp_instances")
      .select("id, meta_token, app_secret, token_encrypted")
      .eq("token_encrypted", false)
      .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

    if (error) throw error;
    if (!data || data.length === 0) break;

    for (const row of data) {
      const updates: Record<string, unknown> = { token_encrypted: true };

      if (row.meta_token && !isEncrypted(row.meta_token as string)) {
        updates.meta_token = await encrypt(row.meta_token as string);
      } else {
        skipped++;
      }

      if (row.app_secret && !isEncrypted(row.app_secret as string)) {
        updates.app_secret = await encrypt(row.app_secret as string);
      }

      const { error: updateError } = await client
        .from("whatsapp_instances")
        .update(updates)
        .eq("id", row.id as string);

      if (updateError) {
        console.error(`Error actualizando fila ${row.id}:`, updateError.message);
      } else {
        console.log(`✓ Fila ${row.id} encriptada`);
        total++;
      }
    }

    page++;
  }

  console.log(`\nMigración completa. Procesadas: ${total}, Omitidas (ya encriptadas): ${skipped}`);
}

main().catch((err) => {
  console.error("Error fatal:", err);
  process.exit(1);
});
