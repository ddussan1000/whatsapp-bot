# Diseño: Mejoras Conversaciones, Reportes y Adjuntos

**Fecha:** 2026-04-08  
**Estado:** Aprobado

---

## Resumen

Tres mejoras independientes al dashboard:

1. **Adjuntar desde biblioteca** — el botón Paperclip abre el `MediaPickerModal` de la org en lugar de un file picker local.
2. **Eliminar página de Pagos + mejorar Reportes** — la gestión de pagos se distribuye entre la página de Reportes (tabs) y el modal de detalle de conversación.
3. **Lista de conversaciones estilo WhatsApp** — último mensaje, contador de no leídos, estado siempre visible, nuevo estado `post_venta`.

---

## Feature 1: Botón adjuntar → Biblioteca de media

### Qué cambia

El compositor de mensajes en `ConversationDetailPage` reemplaza el botón Paperclip + `<input type="file">` oculto por el `MediaPickerModal` existente (`dashboard/src/components/ui/media-picker-modal.tsx`).

El usuario **solo puede enviar archivos que estén en la biblioteca de la organización**. El modal ya tiene botón "Subir archivo" para añadir nuevos items a la biblioteca antes de seleccionarlos.

### Flujo

1. Usuario hace click en Paperclip → se abre `MediaPickerModal` (sin `allowedType`, acepta cualquier tipo).
2. Usuario selecciona un archivo → `onSelect` devuelve `{ url, filename, mediaType, mimeType }`.
3. Se llama a un nuevo endpoint `POST /api/conversations/{id}/send-media` con `{ url, filename, mimeType }`.
4. El backend envía el archivo via WhatsApp Meta API usando el campo `link` del objeto media (sin descargar el archivo).

### Backend — nuevo endpoint

```
POST /api/conversations/{id}/send-media
Body: { url: string, filename: string, mimeType: string }
```

- Determina el tipo WhatsApp (`image`, `video`, `document`) desde `mimeType`.
- Llama a la Meta API con `{ type, [type]: { link: url, filename? } }`.
- Devuelve `{ ok: true, messageId: string }`.

### Frontend — nuevo hook

```ts
useUploadAndSendFileMutation(id)   // existente, se mantiene sin cambios internos
useSendMediaFromLibraryMutation(id) // nuevo: POST /conversations/{id}/send-media
```

### Qué se elimina

- El `<input type="file" ref={fileInputRef}>` del compositor.
- El estado `file: File | null` y su lógica asociada (`onDropFile` de drag-and-drop).
- La preview del archivo adjunto local (el chip con nombre + KB + botón X).

> El drag-and-drop se elimina porque ya no tiene sentido si no se puede adjuntar archivos locales.

---

## Feature 2: Eliminar página de Pagos + Tabs en Reportes + Pagos en modal de conversación

### 2a. Eliminar página de Pagos

- Quitar `{ to: "/payments", label: "Pagos", icon: Receipt }` de `operationsLinks` en `AppLayout.tsx`.
- Quitar la ruta `/payments` de `App.tsx` (o el router principal).
- `PaymentsPage.tsx` puede eliminarse del proyecto.

### 2b. ReportsPage — estructura con Tabs (Shadcn)

Instalar: `bunx shadcn@latest add tabs`

La página se reorganiza en tres tabs con filtros compartidos arriba:

```
[Resumen]  [Pagos]  [Anuncios]
```

**Filtros compartidos** (fecha, flujo, instancia, granularidad, presets rápidos) permanecen visibles fuera de los tabs. El botón "Exportar CSV" también queda fuera.

**Tab Resumen:**
- KPIs (Ingresos, Ventas, Ticket promedio, Conversaciones, Conversión)
- Gráfico de serie temporal (AreaChart)
- Embudo por etapa (BarChart horizontal)
- Ingresos por flujo (BarChart horizontal)
- Distribución por instancia (PieChart)

**Tab Pagos** (migrado desde `PaymentsPage`):
- Mismos filtros adicionales de PaymentsPage (estado, instancia, rango de fechas extra)
- Lista de pagos con `PaymentRow` y badge de estado
- Botón cambio de estado (`PUT /payments/{id}/state` — nuevo endpoint) inline en cada fila para pagos `pending_manual_review`
- Paginación

**Tab Anuncios:**
- KPIs de anuncios CTWA (clics, leads, conversiones, ingresos, tasa)
- BarChart comparativa por anuncio
- PieChart distribución de clics
- Tabla detallada de anuncios

### 2c. Sección Pagos en ClientInfoModal

En `ConversationDetailPage.tsx`, el `ClientInfoModal` agrega una sección **al final** (después del bloque de origen del anuncio), separada por un divisor.

**Mantiene todo lo existente:**
- Header con avatar, nombre, teléfono, flujo
- Selector de estado de conversación (con `onStageChange`)
- Timestamps (inicio, última actividad)
- Bloque de origen de anuncio Meta (si aplica)

**Nueva sección Pagos:**
- Título con icono Lucide `<CreditCard size={12} />` + texto "Pagos de esta conversación" (sin emojis)
- Se cargan con `usePaymentsQuery({ phone: conversation.phone, pageSize: 20 })`
- Cada pago muestra: monto + moneda, flujo, fecha, badge de estado
- Si estado es `pending_manual_review`: botones **Aprobar** y **Rechazar**
- Si estado es `validated` o `rejected`: solo badge de estado + link "Ver comprobante"
- Al aprobar/rechazar: llama `PUT /payments/{id}/state`, actualiza sin cerrar el modal
- Estado vacío: "Sin pagos registrados para esta conversación"

**Nuevos hooks:**
```ts
useConversationPaymentsQuery(phone)   // GET /payments?phone=xxx — requiere nuevo parámetro en backend
useUpdatePaymentStateMutation()       // PUT /payments/{id}/state — requiere nuevo endpoint en backend
```

**Nuevos endpoints backend necesarios:**
- `GET /payments`: agregar query param `phone?: string` para filtrar por teléfono
- `PUT /payments/{id}/state`: endpoint nuevo con body `{ state: "validated" | "rejected" }`, hace `UPDATE payments SET state=?, validated_at=NOW() WHERE id=? AND organization_id=?`

---

## Feature 3: Lista de conversaciones mejorada

### 3a. Backend — nuevos campos en `GET /conversations`

Agregar a `ConversationSchema`:

```ts
last_message_text: z.string().nullable().optional(),
last_message_direction: z.enum(["inbound", "outbound"]).nullable().optional(),
unread_count: z.number().optional(),
```

**Cálculo de `unread_count`:** cantidad de mensajes `inbound` posteriores al último mensaje `outbound` en esa conversación. Se calcula via subquery en la misma query de listado (o en un batch separado por teléfono, similar al batch de ad names).

**Cálculo de `last_message_text`:** último mensaje de la conversación (texto o descripción del tipo: "📷 Imagen", "📄 Documento", "🎥 Video").

### 3b. Backend — nuevo stage `post_venta`

En `webhook/handler.ts`, antes de clasificar el mensaje entrante:

- Si el stage actual del cliente es uno de los **stages terminales**: `pago_confirmado`, `comprobante_rechazado`, `comprobante_vencido`, `comprobante_ilegible`
- Y llega un mensaje inbound del cliente
- → Actualizar stage a `post_venta` antes de continuar el flujo normal

Constante a definir en el handler:
```ts
const TERMINAL_STAGES = [
  "pago_confirmado",
  "comprobante_rechazado", 
  "comprobante_vencido",
  "comprobante_ilegible",
]
```

### 3c. Frontend — rediseño de `ConversationRow`

Nuevo layout de cada fila (3 líneas):

```
[Avatar con badge no leídos]  Nombre/teléfono          tiempo
                               Último mensaje (preview)
                               [Badge estado] · Flujo
```

**Detalles visuales:**
- **Avatar**: iniciales de las últimas 2 cifras del teléfono. Badge verde encima-derecha con el `unread_count` si es > 0.
- **Primera línea**: nombre o teléfono formateado + timestamp a la derecha.
- **Segunda línea**: `last_message_text` truncado. En negrita y color más claro si `unread_count > 0`.
- **Tercera línea**: badge del estado con color semántico + `·` + nombre del flujo.
- **Fila post-venta**: fondo levemente cálido (`bg-amber-950/30`) con borde sutil dorado.
- **Filas sin actividad reciente** (sin no leídos, stage final): opacidad reducida.

**Colores de badge por estado:**
| Stage | Color |
|---|---|
| `flow_started` | Azul |
| `interesado` | Slate |
| `listo_pagar` | Cyan |
| `necesita_agente` | Naranja |
| `confirmar_comprobante` | Amarillo |
| `pago_confirmado` | Verde |
| `post_venta` | Ámbar/dorado `★` |
| `comprobante_rechazado` | Rojo |
| Otros | Gris |

### 3d. Frontend — `STAGE_OPTIONS` actualizado

Agregar `post_venta` a los arrays `STAGE_OPTIONS` en:
- `ConversationsPage.tsx` (filtro de estado)
- `ConversationDetailPage.tsx` (selector en ClientInfoModal)

```ts
{ value: "post_venta", label: "Post-venta" }
```

### 3e. Frontend — `StatusBadge` component

Agregar estilo para `post_venta` en `dashboard/src/components/StatusBadge.tsx`.

---

## Convención visual

**Sin emojis en el frontend.** Donde se necesite un ícono, usar exclusivamente componentes de Lucide React (`lucide-react`). Esto aplica a títulos de sección, badges, botones y cualquier elemento UI. Los mockups del spec usan emojis solo como referencia de concepto.

---

## Consideraciones técnicas

### Mobile
- `ConversationRow` usa flexbox vertical — la tercera línea con estado y flujo se adapta naturalmente a pantallas pequeñas.
- El badge de no leídos sobre el avatar no requiere ancho extra.
- El `ClientInfoModal` ya es scrollable (`max-h-[90vh] overflow-y-auto`), la sección de pagos simplemente se añade al final.

### Regenerar tipos OpenAPI
Después de agregar el endpoint `send-media` y los nuevos campos en `ConversationSchema`:
```bash
cd dashboard && bun run generate:api
```

### Sin migraciones SQL
- `unread_count` y `last_message_text` son calculados en runtime (subquery), no columnas.
- `post_venta` es un string libre como todos los stages — no requiere cambio de schema.

---

## Archivos afectados

### Backend
- `backend/src/api/dashboard.ts` — nuevo endpoint `/send-media`, nuevos campos en `ConversationSchema` y query, nuevo endpoint `PUT /payments/{id}/state`, nuevo query param `phone` en `GET /payments`
- `backend/src/webhook/handler.ts` — lógica de transición a `post_venta`

### Frontend
- `dashboard/src/pages/ConversationsPage.tsx` — rediseño `ConversationRow`, nuevos STAGE_OPTIONS
- `dashboard/src/pages/ConversationDetailPage.tsx` — reemplazar adjunto por `MediaPickerModal`, sección pagos en `ClientInfoModal`, nuevos STAGE_OPTIONS
- `dashboard/src/pages/ReportsPage.tsx` — restructurar con Tabs (Resumen/Pagos/Anuncios)
- `dashboard/src/layout/AppLayout.tsx` — eliminar enlace a Pagos
- `dashboard/src/components/StatusBadge.tsx` — agregar `post_venta`
- `dashboard/src/lib/hooks.ts` — `useSendMediaFromLibraryMutation`, posiblemente `useUpdatePaymentStateMutation`
- `dashboard/src/App.tsx` (o router) — eliminar ruta `/payments`
- `dashboard/src/pages/PaymentsPage.tsx` — eliminar archivo
