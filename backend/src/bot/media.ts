import { env } from "../config/env";
import { getInstanceByPhoneNumberId } from "../db/instances";

export async function uploadMediaToMeta(
  file: File,
  mimeType: string,
  ctx?: { metaPhoneNumberId?: string | null; organizationId?: string | null },
) {
  const organizationId = ctx?.organizationId ?? null;
  const metaPhoneNumberId = ctx?.metaPhoneNumberId ?? null;
  let resolvedPhoneNumberId = env.META_PHONE_ID;
  let resolvedToken = env.META_TOKEN;

  if (organizationId && metaPhoneNumberId) {
    const instance = await getInstanceByPhoneNumberId(organizationId, metaPhoneNumberId);
    if (instance?.meta_token) {
      resolvedPhoneNumberId = instance.phone_number_id;
      resolvedToken = instance.meta_token;
    }
  }

  if (!resolvedPhoneNumberId || !resolvedToken) {
    throw new Error("META_PHONE_ID/META_TOKEN no configurado");
  }

  const form = new FormData();
  form.append("messaging_product", "whatsapp");
  form.append("type", mimeType);
  form.append("file", file, file.name);

  const res = await fetch(`https://graph.facebook.com/v19.0/${resolvedPhoneNumberId}/media`, {
    method: "POST",
    headers: { Authorization: `Bearer ${resolvedToken}` },
    body: form,
  });

  const data = (await res.json()) as { id?: string; error?: { message?: string } };
  if (!res.ok || !data.id) {
    throw new Error(data.error?.message ?? `Meta media upload error: ${res.status}`);
  }
  return data.id;
}

