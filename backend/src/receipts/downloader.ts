export async function downloadFromMeta(mediaId: string, token?: string): Promise<Buffer> {
  const { buffer } = await downloadFromMetaWithType(mediaId, token);
  return buffer;
}

export async function downloadFromMetaWithType(
  mediaId: string,
  token?: string,
): Promise<{ buffer: Buffer; mimeType: string }> {
  if (!token) throw new Error("Token de acceso no proporcionado");
  const meta = await fetch(`https://graph.facebook.com/v19.0/${mediaId}`, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(10_000),
  }).then((r) => r.json() as Promise<{ url?: string; mime_type?: string }>);
  if (!meta.url) throw new Error("No se obtuvo URL de media");
  const res = await fetch(meta.url, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(30_000),
  });
  return {
    buffer: Buffer.from(await res.arrayBuffer()),
    mimeType: meta.mime_type ?? "application/octet-stream",
  };
}
