import { supabase } from "../db/supabase";

function sanitizeFileName(filename: string) {
  return filename.replace(/[^a-zA-Z0-9._-]/g, "_");
}

export async function uploadToSupabaseStorage(params: {
  bucket: string;
  path: string;
  buffer: Buffer;
  contentType: string;
  upsert?: boolean;
}) {
  if (!supabase) throw new Error("Supabase no configurado");
  const { bucket, path, buffer, contentType, upsert = false } = params;
  const { error } = await supabase.storage.from(bucket).upload(path, buffer, {
    contentType,
    upsert,
  });
  if (error) throw new Error(error.message);
  const { data } = supabase.storage.from(bucket).getPublicUrl(path);
  return { path, publicUrl: data.publicUrl };
}

export async function uploadOrgFlowMedia(params: {
  organizationId: string;
  bucket: string;
  filename: string;
  buffer: Buffer;
  contentType: string;
}) {
  const safeName = sanitizeFileName(params.filename || "file.bin");
  const path = `${params.organizationId}/flows/${Date.now()}_${safeName}`;
  return uploadToSupabaseStorage({
    bucket: params.bucket,
    path,
    buffer: params.buffer,
    contentType: params.contentType,
  });
}

export async function deleteFromSupabaseStorage(params: {
  bucket: string;
  path: string;
}) {
  if (!supabase) throw new Error("Supabase no configurado");
  const { error } = await supabase.storage.from(params.bucket).remove([params.path]);
  if (error) throw new Error(error.message);
}

export async function uploadOrgMedia(params: {
  organizationId: string;
  bucket: string;
  filename: string;
  buffer: Buffer;
  contentType: string;
}) {
  const safeName = sanitizeFileName(params.filename || "file.bin");
  const path = `${params.organizationId}/media/${Date.now()}_${safeName}`;
  return uploadToSupabaseStorage({
    bucket: params.bucket,
    path,
    buffer: params.buffer,
    contentType: params.contentType,
  });
}

export async function uploadInboundMediaAsset(params: {
  organizationId: string;
  bucket: string;
  phone: string;
  mediaType: string;
  buffer: Buffer;
  contentType: string;
  ext: string;
}) {
  const now = new Date();
  const yyyy = now.getUTCFullYear();
  const mm = String(now.getUTCMonth() + 1).padStart(2, "0");
  const path = `inbound/${params.mediaType}/${params.organizationId}/${yyyy}/${mm}/${params.phone}_${Date.now()}.${params.ext}`;
  return uploadToSupabaseStorage({
    bucket: params.bucket,
    path,
    buffer: params.buffer,
    contentType: params.contentType,
  });
}

export async function uploadReceiptAsset(params: {
  organizationId: string;
  bucket: string;
  phone: string;
  buffer: Buffer;
  contentType?: string;
}) {
  const now = new Date();
  const yyyy = now.getUTCFullYear();
  const mm = String(now.getUTCMonth() + 1).padStart(2, "0");
  const path = `${params.organizationId}/receipts/${yyyy}/${mm}/${params.phone}_${Date.now()}.jpg`;
  return uploadToSupabaseStorage({
    bucket: params.bucket,
    path,
    buffer: params.buffer,
    contentType: params.contentType ?? "image/jpeg",
  });
}

