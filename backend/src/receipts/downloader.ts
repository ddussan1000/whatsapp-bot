import { env } from "../config/env";

export async function downloadFromMeta(mediaId: string): Promise<Buffer> {
  if (!env.META_TOKEN) throw new Error("META_TOKEN no configurado");

  const meta = await fetch(`https://graph.facebook.com/v19.0/${mediaId}`, {
    headers: { Authorization: `Bearer ${env.META_TOKEN}` },
  }).then((r) => r.json() as Promise<{ url?: string }>);

  if (!meta.url) throw new Error("No se obtuvo URL de media");
  const img = await fetch(meta.url, {
    headers: { Authorization: `Bearer ${env.META_TOKEN}` },
  });
  return Buffer.from(await img.arrayBuffer());
}
