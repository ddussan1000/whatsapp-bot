export async function downloadFromMeta(mediaId: string, token?: string): Promise<Buffer> {
  const accessToken = token;
  if (!accessToken) throw new Error("Token de acceso no proporcionado");

  const meta = await fetch(`https://graph.facebook.com/v19.0/${mediaId}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  }).then((r) => r.json() as Promise<{ url?: string }>);

  if (!meta.url) throw new Error("No se obtuvo URL de media");
  const img = await fetch(meta.url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  return Buffer.from(await img.arrayBuffer());
}
