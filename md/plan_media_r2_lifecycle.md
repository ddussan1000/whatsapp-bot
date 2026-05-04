# Plan: Guardado de Audio + Ciclo de Vida de Media en R2

## Objetivo

Guardar los audios inbound de usuarios en Cloudflare R2 (además de las imágenes que ya se guardan),
y configurar expiración automática por tipo de archivo para controlar costos y privacidad.

---

## Estructura de keys en R2

Cambiar los prefijos para que las reglas de ciclo de vida de R2 apliquen por tipo:

| Tipo | Prefijo actual | Prefijo nuevo |
|------|---------------|---------------|
| Comprobantes | `{orgId}/receipts/{año}/{mes}/` | `receipts/{orgId}/{año}/{mes}/` |
| Imágenes inbound (no comprobante) | `{orgId}/receipts/{año}/{mes}/` (mismo bucket, mismo prefijo — no se distinguía) | `inbound/images/{orgId}/{año}/{mes}/` |
| Audios inbound | *(no implementado)* | `inbound/audio/{orgId}/{año}/{mes}/` |
| Media de flujos | `{orgId}/flows/` | sin cambio |
| Librería de media org | `{orgId}/media/` | sin cambio |

---

## Reglas de ciclo de vida en Cloudflare (configuración manual)

Configurar en el dashboard de Cloudflare → R2 → bucket → Settings → Object lifecycle rules:

| Regla | Prefijo | Expiración |
|-------|---------|-----------|
| Comprobantes | `receipts/` | **30 días** |
| Media inbound | `inbound/` | **3 días** |

> **Por qué 30 días para comprobantes**: un pago puede quedar en `pending_manual_review`
> varios días. Si el agente lo revisa después de 10 días y la imagen ya no existe, se pierde
> la evidencia. 30 días da margen suficiente sin costo significativo en R2.

---

## Cambios en código

### 1. `backend/src/storage/r2Storage.ts`

**Agregar** función `uploadInboundImageR2`:
```typescript
export async function uploadInboundImageR2(params: {
  organizationId: string;
  phone: string;
  buffer: Buffer;
}) {
  const now = new Date();
  const yyyy = now.getUTCFullYear();
  const mm = String(now.getUTCMonth() + 1).padStart(2, "0");
  const key = `inbound/images/${params.organizationId}/${yyyy}/${mm}/${params.phone}_${Date.now()}.jpg`;
  return uploadToR2({ key, buffer: params.buffer, contentType: "image/jpeg" });
}
```

**Agregar** función `uploadInboundAudioR2`:
```typescript
export async function uploadInboundAudioR2(params: {
  organizationId: string;
  phone: string;
  buffer: Buffer;
  contentType?: string;
}) {
  const now = new Date();
  const yyyy = now.getUTCFullYear();
  const mm = String(now.getUTCMonth() + 1).padStart(2, "0");
  const ext = params.contentType?.includes("mpeg") ? "mp3" : "ogg";
  const key = `inbound/audio/${params.organizationId}/${yyyy}/${mm}/${params.phone}_${Date.now()}.${ext}`;
  return uploadToR2({ key, buffer: params.buffer, contentType: params.contentType ?? "audio/ogg" });
}
```

**Modificar** `uploadReceiptAssetR2`: cambiar el key de
`{orgId}/receipts/...` → `receipts/{orgId}/...` para que coincida con la regla de lifecycle.

### 2. `backend/src/receipts/storage.ts`

Actualizar `saveReceipt` para distinguir imágenes de comprobante vs. imagen inbound general.
Actualmente ambas usan `uploadReceiptAssetR2`. Separar en dos rutas:
- Llamada desde `classifyAndHandleImage` antes del OCR → usar `uploadInboundImageR2` (3 días)
- Si el OCR confirma que ES un comprobante → reubicar a `receipts/` prefix (30 días) o simplemente
  guardar directamente en `receipts/` desde el inicio si la función ya sabe el contexto.

> **Alternativa más simple**: siempre guardar imágenes inbound como `receipts/` (30 días).
> El costo extra de retener imágenes no-comprobante 30 días es mínimo comparado con la
> complejidad de resubir si el OCR las clasifica como comprobante después.

### 3. `backend/src/receipts/downloader.ts`

La función `downloadFromMeta` ya es genérica (descarga por `mediaId` + token). No necesita cambios.

### 4. `backend/src/webhook/handler.ts`

Agregar bloque para audios inbound (después del bloque `if (type === "image")`):

```typescript
if (type === "audio") {
  const audioId = (msg.audio as { id?: string } | undefined)?.id;
  if (audioId && instance?.meta_token && state.organizationId) {
    try {
      const buffer = await downloadFromMeta(audioId, instance.meta_token);
      const contentType = (msg.audio as { mime_type?: string } | undefined)?.mime_type;
      const saved = await uploadInboundAudioR2({
        organizationId: state.organizationId,
        phone,
        buffer,
        contentType,
      });
      const metaMessageId = (msg as unknown as { id?: string }).id ?? null;
      if (metaMessageId) {
        updateMessageMediaUrl(metaMessageId, saved.publicUrl).catch(() => {});
      }
    } catch (err) {
      log.warn({ err, phone }, "audio: download/upload failed, continuing");
    }
  }
}
```

### 5. Eliminar el cron `purgeOldReceiptsR2`

Una vez configuradas las reglas de lifecycle en R2, la función `purgeOldReceiptsR2` en
`r2Storage.ts` y su cron asociado quedan redundantes. Eliminarlos para simplificar.

---

## Orden de ejecución

1. Configurar las reglas de lifecycle en el dashboard de Cloudflare **primero** (no requiere deploy).
2. Hacer deploy del código con los nuevos prefijos de keys.
3. Los archivos existentes con el prefijo viejo (`{orgId}/receipts/`) no se ven afectados por
   la nueva regla hasta que se migren manualmente (opcional — pueden dejarse expirar solos
   con una regla temporal o migrarse con un script).
4. Eliminar el cron de purge en un deploy posterior.

---

## Notas

- Meta sirve los audios como `audio/ogg; codecs=opus` (notas de voz) o `audio/mpeg` (audio regular).
  El `Content-Type` viene en el payload del webhook como `mime_type`.
- R2 no cobra por peticiones de lectura (GET), solo por escritura y almacenamiento.
  Con retención de 3 días el costo de audios es marginal.
- Los archivos en `{orgId}/flows/` y `{orgId}/media/` (librería org) no tienen lifecycle rule
  porque son permanentes (el usuario los gestiona manualmente).
