import { S3Client, PutObjectCommand, DeleteObjectCommand, ListObjectsV2Command, DeleteObjectsCommand } from "@aws-sdk/client-s3";
import { env } from "../config/env";

function getClient() {
  return new S3Client({
    region: "auto",
    endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: env.R2_ACCESS_KEY_ID,
      secretAccessKey: env.R2_SECRET_ACCESS_KEY,
    },
  });
}

function sanitizeFileName(filename: string) {
  return filename.replace(/[^a-zA-Z0-9._-]/g, "_");
}

export async function uploadToR2(params: {
  key: string;
  buffer: Buffer;
  contentType: string;
}): Promise<{ key: string; publicUrl: string }> {
  const client = getClient();
  await client.send(
    new PutObjectCommand({
      Bucket: env.R2_BUCKET_NAME,
      Key: params.key,
      Body: params.buffer,
      ContentType: params.contentType,
    }),
  );
  const publicUrl = `${env.R2_PUBLIC_URL.replace(/\/$/, "")}/${params.key}`;
  return { key: params.key, publicUrl };
}

export async function deleteFromR2(key: string): Promise<void> {
  const client = getClient();
  await client.send(
    new DeleteObjectCommand({ Bucket: env.R2_BUCKET_NAME, Key: key }),
  );
}

export async function uploadOrgFlowMediaR2(params: {
  organizationId: string;
  filename: string;
  buffer: Buffer;
  contentType: string;
}) {
  const safeName = sanitizeFileName(params.filename || "file.bin");
  const key = `${params.organizationId}/flows/${Date.now()}_${safeName}`;
  return uploadToR2({ key, buffer: params.buffer, contentType: params.contentType });
}

export async function uploadOrgMediaR2(params: {
  organizationId: string;
  filename: string;
  buffer: Buffer;
  contentType: string;
}) {
  const safeName = sanitizeFileName(params.filename || "file.bin");
  const key = `${params.organizationId}/media/${Date.now()}_${safeName}`;
  return uploadToR2({ key, buffer: params.buffer, contentType: params.contentType });
}

export async function uploadInboundMediaR2(params: {
  organizationId: string;
  phone: string;
  mediaType: string;
  buffer: Buffer;
  contentType: string;
  ext: string;
}): Promise<{ key: string; publicUrl: string }> {
  const now = new Date();
  const yyyy = now.getUTCFullYear();
  const mm = String(now.getUTCMonth() + 1).padStart(2, "0");
  // Prefix `inbound/` al inicio para que la lifecycle rule de R2 aplique por prefijo
  const key = `inbound/${params.mediaType}/${params.organizationId}/${yyyy}/${mm}/${params.phone}_${Date.now()}.${params.ext}`;
  return uploadToR2({ key, buffer: params.buffer, contentType: params.contentType });
}

export async function uploadReceiptAssetR2(params: {
  organizationId: string;
  bucket: string;
  phone: string;
  buffer: Buffer;
  contentType?: string;
}) {
  const now = new Date();
  const yyyy = now.getUTCFullYear();
  const mm = String(now.getUTCMonth() + 1).padStart(2, "0");
  // Prefix `receipts/` al inicio para que la lifecycle rule de R2 aplique por prefijo
  const key = `receipts/${params.organizationId}/${yyyy}/${mm}/${params.phone}_${Date.now()}.jpg`;
  return uploadToR2({ key, buffer: params.buffer, contentType: params.contentType ?? "image/jpeg" });
}

export async function purgeOldReceiptsR2(bucket: string, retentionDays: number): Promise<void> {
  const client = getClient();
  const cutoff = new Date(Date.now() - retentionDays * 86400000);
  let continuationToken: string | undefined;

  do {
    const res = await client.send(
      new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: "",
        ContinuationToken: continuationToken,
        MaxKeys: 1000,
      }),
    );

    const toDelete = (res.Contents ?? [])
      .filter((obj) => obj.Key && obj.LastModified && obj.LastModified < cutoff)
      .map((obj) => ({ Key: obj.Key! }));

    if (toDelete.length > 0) {
      await client.send(
        new DeleteObjectsCommand({ Bucket: bucket, Delete: { Objects: toDelete, Quiet: true } }),
      );
    }

    continuationToken = res.NextContinuationToken;
  } while (continuationToken);
}
