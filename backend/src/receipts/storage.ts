import fs from "node:fs/promises";
import path from "node:path";
import { env } from "../config/env";
import { uploadReceiptAsset } from "../storage/supabaseStorage";

export async function saveReceipt(buffer: Buffer, phone: string, organizationId: string) {
  if (env.STORAGE_MODE === "local") {
    const dir = "./tmp/receipts";
    await fs.mkdir(dir, { recursive: true });
    const filename = `${phone}_${Date.now()}.jpg`;
    await fs.writeFile(path.join(dir, filename), buffer);
    return `local://${filename}`;
  }
  const uploaded = await uploadReceiptAsset({
    organizationId,
    bucket: env.SUPABASE_STORAGE_BUCKET_RECEIPTS,
    phone,
    buffer,
  });
  return `supabase://${env.SUPABASE_STORAGE_BUCKET_RECEIPTS}/${uploaded.path}`;
}
