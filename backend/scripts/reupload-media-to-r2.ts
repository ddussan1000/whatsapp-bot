/**
 * Uploads local files from a temp folder to R2, using the exact storage_path
 * from the database records (keyed by filename match).
 *
 * Usage:
 *   TEMP_DIR=./tmp/media bun run scripts/reupload-media-to-r2.ts
 *
 * Required env vars: R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME
 */
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { readdirSync } from "node:fs";
import { join } from "node:path";

const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID!;
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID!;
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY!;
const R2_BUCKET_NAME = process.env.R2_BUCKET_NAME!;
const TEMP_DIR = process.env.TEMP_DIR || "./tmp/media";

for (const [k, v] of Object.entries({ R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME })) {
  if (!v) { console.error(`❌ Falta: ${k}`); process.exit(1); }
}

const r2 = new S3Client({
  region: "auto",
  endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId: R2_ACCESS_KEY_ID, secretAccessKey: R2_SECRET_ACCESS_KEY },
});

// DB records — storage_path is the R2 key, filename is stored name in DB.
// local_name: override when the local file name differs from stripping the timestamp prefix.
const DB_RECORDS = [
  { filename: "1776637526475_Huertos-Organicos-en-Casa.pdf",             storage_path: "24928736-905a-47aa-9a3b-531cb7a18df9/media/1776637526475_Huertos-Organicos-en-Casa.pdf",             mime_type: "application/pdf" },
  { filename: "1776641781074_AUDIO_1.mp3",                               storage_path: "24928736-905a-47aa-9a3b-531cb7a18df9/media/1776641781074_AUDIO_1.mp3",                               mime_type: "audio/mpeg",   local_name: "AUDIO 1.mp3" },
  { filename: "1776637532253_Tabla-de-Nutrientes-por-Cultivo.pdf",       storage_path: "24928736-905a-47aa-9a3b-531cb7a18df9/media/1776637532253_Tabla-de-Nutrientes-por-Cultivo.pdf",       mime_type: "application/pdf" },
  { filename: "1776637521082_Checklist-Imprimible-para-Preparar-tu-Sistema-Hidroponico-Paso-a-Paso.pdf", storage_path: "24928736-905a-47aa-9a3b-531cb7a18df9/media/1776637521082_Checklist-Imprimible-para-Preparar-tu-Sistema-Hidroponico-Paso-a-Paso.pdf", mime_type: "application/pdf" },
  { filename: "1776637530790_Sistema-Microgreens-Hidroponico.pdf",       storage_path: "24928736-905a-47aa-9a3b-531cb7a18df9/media/1776637530790_Sistema-Microgreens-Hidroponico.pdf",       mime_type: "application/pdf" },
  { filename: "1776637524880_hidroponia-casera-desde-cero--cultiva-alimentos-en-casa-sin-tierra--sin-experiencia-y-sin-gastar-de-m-s-completo.pdf", storage_path: "24928736-905a-47aa-9a3b-531cb7a18df9/media/1776637524880_hidroponia-casera-desde-cero--cultiva-alimentos-en-casa-sin-tierra--sin-experiencia-y-sin-gastar-de-m-s-completo.pdf", mime_type: "application/pdf" },
  { filename: "1776637522035_Diario_Cultivo_Hidroponico.xlsx",           storage_path: "24928736-905a-47aa-9a3b-531cb7a18df9/media/1776637522035_Diario_Cultivo_Hidroponico.xlsx",           mime_type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" },
  { filename: "1775574994177_5451-183788677.mp4",                        storage_path: "c3058060-1913-4649-a5fa-c69cc3640fd4/media/1775574994177_5451-183788677.mp4",                        mime_type: "video/mp4" },
  { filename: "1776637523386_Guia-de-Solucion-de-Problemas-Comunes-en-Hidroponia-para-Principiantes.pdf", storage_path: "24928736-905a-47aa-9a3b-531cb7a18df9/media/1776637523386_Guia-de-Solucion-de-Problemas-Comunes-en-Hidroponia-para-Principiantes.pdf", mime_type: "application/pdf" },
  { filename: "1776641782744_AUDIO_2.mp3",                               storage_path: "24928736-905a-47aa-9a3b-531cb7a18df9/media/1776641782744_AUDIO_2.mp3",                               mime_type: "audio/mpeg",   local_name: "AUDIO 2.mp3" },
  { filename: "1776637519704_Calendario-de-Siembra-y-Cosecha-para-Todo-el-Ano.pdf", storage_path: "24928736-905a-47aa-9a3b-531cb7a18df9/media/1776637519704_Calendario-de-Siembra-y-Cosecha-para-Todo-el-Ano.pdf", mime_type: "application/pdf" },
  { filename: "1776637529090_Recetas-Saludables-con-Verduras-Hidroponicas-Recien-Cosechadas.pdf", storage_path: "24928736-905a-47aa-9a3b-531cb7a18df9/media/1776637529090_Recetas-Saludables-con-Verduras-Hidroponicas-Recien-Cosechadas.pdf", mime_type: "application/pdf" },
  { filename: "1776637527954_La-Hidroponia-No-Es-Cara-Tu-Checklist-Definitivo.pdf", storage_path: "24928736-905a-47aa-9a3b-531cb7a18df9/media/1776637527954_La-Hidroponia-No-Es-Cara-Tu-Checklist-Definitivo.pdf", mime_type: "application/pdf" },
  { filename: "1776641784289_AUDIO_3.mp3",                               storage_path: "24928736-905a-47aa-9a3b-531cb7a18df9/media/1776641784289_AUDIO_3.mp3",                               mime_type: "audio/mpeg",   local_name: "AUDIO 3.mp3" },
  { filename: "1776374337015___19.000_COP.png",                          storage_path: "24928736-905a-47aa-9a3b-531cb7a18df9/media/1776374337015___19.000_COP.png",                          mime_type: "image/png",    local_name: "$ 19.000 COP.png" },
  { filename: "1776639445595_c2d6d5c1-17c4-45d1-99d1-fa401a4da4ec.png", storage_path: "24928736-905a-47aa-9a3b-531cb7a18df9/media/1776639445595_c2d6d5c1-17c4-45d1-99d1-fa401a4da4ec.png", mime_type: "image/png" },
];

// Strip leading timestamp prefix (digits + underscore) to get the original filename
function originalName(filename: string): string {
  return filename.replace(/^\d+_/, "");
}

// Map by local_name (explicit override) or stripped filename
const byOriginalName = new Map(
  DB_RECORDS.map(r => [r.local_name ?? originalName(r.filename), r])
);

async function reupload() {
  let localFiles: string[];
  try {
    localFiles = readdirSync(TEMP_DIR);
  } catch {
    console.error(`❌ No se puede leer TEMP_DIR: ${TEMP_DIR}`);
    process.exit(1);
  }

  console.log(`\n📁 ${localFiles.length} archivo(s) en ${TEMP_DIR}`);
  console.log(`📦 Bucket: ${R2_BUCKET_NAME}\n`);

  let ok = 0, skipped = 0, fail = 0;

  for (const localName of localFiles) {
    const record = byOriginalName.get(localName);
    if (!record) {
      console.log(`  ⚠️  Sin registro en DB: ${localName} — omitido`);
      skipped++;
      continue;
    }

    process.stdout.write(`  ↑ ${localName} → ${record.storage_path} ... `);

    const file = Bun.file(join(TEMP_DIR, localName));
    const buffer = Buffer.from(await file.arrayBuffer());

    try {
      await r2.send(new PutObjectCommand({
        Bucket: R2_BUCKET_NAME,
        Key: record.storage_path,
        Body: buffer,
        ContentType: record.mime_type,
      }));
      console.log(`✅ ${(buffer.length / 1024).toFixed(0)} KB`);
      ok++;
    } catch (err: any) {
      console.log(`❌ ${err.message}`);
      fail++;
    }
  }

  console.log(`\n✅ ${ok} subidos  ⚠️  ${skipped} omitidos  ❌ ${fail} fallidos\n`);
  if (fail > 0) process.exit(1);
}

reupload().catch((err) => { console.error(err); process.exit(1); });
