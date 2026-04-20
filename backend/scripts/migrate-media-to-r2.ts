/**
 * Migrates existing media from Supabase Storage to Cloudflare R2.
 * Updates org_media.public_url, org_media.storage_path, and flow_step_messages.media_url.
 *
 * Run after setting R2 env vars:
 *   bun run scripts/migrate-media-to-r2.ts
 */
import { createClient } from "@supabase/supabase-js";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_KEY!;
const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID!;
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID!;
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY!;
const R2_BUCKET_NAME = process.env.R2_BUCKET_NAME!;
const R2_PUBLIC_URL = process.env.R2_PUBLIC_URL!;

for (const [k, v] of Object.entries({
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY,
  R2_ACCOUNT_ID,
  R2_ACCESS_KEY_ID,
  R2_SECRET_ACCESS_KEY,
  R2_BUCKET_NAME,
  R2_PUBLIC_URL,
})) {
  if (!v) {
    console.error(`❌ Falta variable de entorno: ${k}`);
    process.exit(1);
  }
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
const r2 = new S3Client({
  region: "auto",
  endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: R2_ACCESS_KEY_ID,
    secretAccessKey: R2_SECRET_ACCESS_KEY,
  },
});

async function migrate() {
  // Fetch all org_media rows
  const { data: mediaRows, error } = await supabase
    .from("org_media")
    .select("id, storage_path, public_url, mime_type")
    .order("created_at", { ascending: true });

  if (error) {
    console.error("Error fetching org_media:", error.message);
    process.exit(1);
  }
  if (!mediaRows?.length) {
    console.log("No hay archivos en org_media.");
    return;
  }

  console.log(`\n📦 Migrando ${mediaRows.length} archivos a R2...\n`);

  for (const row of mediaRows) {
    const key = row.storage_path; // keep same path structure
    const newPublicUrl = `${R2_PUBLIC_URL.replace(/\/$/, "")}/${key}`;

    process.stdout.write(`  ↑ ${key.split("/").pop()} ... `);

    // Download from Supabase public URL
    const res = await fetch(row.public_url);
    if (!res.ok) {
      console.log(`❌ Error descargando (${res.status})`);
      continue;
    }
    const buffer = Buffer.from(await res.arrayBuffer());

    // Upload to R2
    await r2.send(
      new PutObjectCommand({
        Bucket: R2_BUCKET_NAME,
        Key: key,
        Body: buffer,
        ContentType: row.mime_type || "application/octet-stream",
      }),
    );

    // Update org_media
    const { error: updateErr } = await supabase
      .from("org_media")
      .update({ public_url: newPublicUrl })
      .eq("id", row.id);

    if (updateErr) {
      console.log(
        `⚠️  Subido a R2 pero error actualizando DB: ${updateErr.message}`,
      );
      continue;
    }

    // Update flow_step_messages that reference this URL
    const { data: updated } = await supabase
      .from("flow_step_messages")
      .update({ media_url: newPublicUrl })
      .eq("media_url", row.public_url)
      .select("id");
    const count = updated?.length ?? 0;

    console.log(
      `✅ (${(buffer.length / 1024).toFixed(0)} KB)${count ? ` — ${count} step(s) actualizados` : ""}`,
    );
  }

  console.log("\n✅ Migración completada.\n");
  console.log("Próximos pasos:");
  console.log(
    "  1. Verifica que los archivos estén en R2 (Cloudflare → R2 → flow-media → Objects)",
  );
  console.log("  2. Configura STORAGE_MODE=r2 en Railway");
  console.log("  3. Redeploy del backend");
}

migrate().catch((err) => {
  console.error(err);
  process.exit(1);
});
