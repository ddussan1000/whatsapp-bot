import fs from "node:fs/promises";
import path from "node:path";
import { env } from "../config/env";
import { uploadReceiptAsset, uploadInboundMediaAsset } from "../storage/supabaseStorage";
import { uploadReceiptAssetR2, uploadInboundMediaR2 } from "../storage/r2Storage";

export async function saveInboundMedia(params: {
  buffer: Buffer;
  phone: string;
  organizationId: string;
  mediaType: string;
  contentType: string;
  ext: string;
}): Promise<{ storageUri: string; publicUrl: string | null }> {
  if (env.STORAGE_MODE === "local") {
    return { storageUri: "local://skipped", publicUrl: null };
  }
  if (env.STORAGE_MODE === "r2") {
    const uploaded = await uploadInboundMediaR2({
      organizationId: params.organizationId,
      phone: params.phone,
      mediaType: params.mediaType,
      buffer: params.buffer,
      contentType: params.contentType,
      ext: params.ext,
    });
    return {
      storageUri: `r2://${env.R2_BUCKET_NAME}/${uploaded.key}`,
      publicUrl: uploaded.publicUrl,
    };
  }
  const uploaded = await uploadInboundMediaAsset({
    organizationId: params.organizationId,
    bucket: env.SUPABASE_STORAGE_BUCKET_RECEIPTS,
    phone: params.phone,
    mediaType: params.mediaType,
    buffer: params.buffer,
    contentType: params.contentType,
    ext: params.ext,
  });
  return {
    storageUri: `supabase://${env.SUPABASE_STORAGE_BUCKET_RECEIPTS}/${uploaded.path}`,
    publicUrl: uploaded.publicUrl,
  };
}

export async function saveReceipt(
  buffer: Buffer,
  phone: string,
  organizationId: string,
): Promise<{ storageUri: string; publicUrl: string | null }> {
  if (env.STORAGE_MODE === "local") {
    const dir = "./tmp/receipts";
    await fs.mkdir(dir, { recursive: true });
    const filename = `${phone}_${Date.now()}.jpg`;
    await fs.writeFile(path.join(dir, filename), buffer);
    return { storageUri: `local://${filename}`, publicUrl: null };
  }
  if (env.STORAGE_MODE === "r2") {
    const uploaded = await uploadReceiptAssetR2({
      organizationId,
      bucket: env.R2_BUCKET_NAME,
      phone,
      buffer,
    });
    return {
      storageUri: `r2://${env.R2_BUCKET_NAME}/${uploaded.key}`,
      publicUrl: uploaded.publicUrl,
    };
  }
  const uploaded = await uploadReceiptAsset({
    organizationId,
    bucket: env.SUPABASE_STORAGE_BUCKET_RECEIPTS,
    phone,
    buffer,
  });
  return {
    storageUri: `supabase://${env.SUPABASE_STORAGE_BUCKET_RECEIPTS}/${uploaded.path}`,
    publicUrl: uploaded.publicUrl,
  };
}
