import fs from "node:fs/promises";
import path from "node:path";
import { env } from "../config/env";
import { supabase } from "../db/supabase";
import { log } from "../logger";
import { purgeOldReceiptsR2 } from "../storage/r2Storage";

export async function purgeOldReceipts() {
  if (env.STORAGE_MODE === "r2") {
    await purgeOldReceiptsR2(env.R2_BUCKET_NAME, env.RECEIPT_RETENTION_DAYS);
    return;
  }
  if (env.STORAGE_MODE === "supabase") {
    if (!supabase) return;
    const bucket = env.SUPABASE_STORAGE_BUCKET_RECEIPTS;
    const cutoff = Date.now() - env.RECEIPT_RETENTION_DAYS * 86400000;
    const { data: orgDirs } = await supabase.storage.from(bucket).list("", { limit: 1000 });
    for (const orgDir of orgDirs ?? []) {
      if (!orgDir.name) continue;
      const prefix = `${orgDir.name}/receipts`;
      const { data: files } = await supabase.storage.from(bucket).list(prefix, { limit: 1000, sortBy: { column: "name", order: "asc" } });
      const toDelete = (files ?? [])
        .filter((f) => {
          const ts = f.updated_at ? new Date(f.updated_at).getTime() : 0;
          return ts > 0 && ts < cutoff;
        })
        .map((f) => `${prefix}/${f.name}`);
      if (toDelete.length > 0) {
        await supabase.storage.from(bucket).remove(toDelete);
      }
    }
    return;
  }

  const dir = "./tmp/receipts";
  const files = await fs.readdir(dir).catch(() => []);
  const now = Date.now();
  await Promise.all(
    files.map(async (file) => {
      const full = path.join(dir, file);
      const stat = await fs.stat(full);
      if (now - stat.mtimeMs > 7 * 86400000) await fs.unlink(full);
    }),
  );
}

export function registerPurgeReceiptsCron() {
  setInterval(() => {
    void purgeOldReceipts().catch((error) => {
      log.error({ error }, "receipt purge failed");
    });
  }, 6 * 60 * 60 * 1000);
}
