# Mejoras Conversaciones, Reportes y Adjuntos — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reemplazar el botón de adjuntar local por la biblioteca de media de la org, eliminar la página de Pagos distribuyendo su funcionalidad en Reportes y el modal de conversación, y rediseñar la lista de conversaciones con último mensaje, contador de no leídos y stage `post_venta`.

**Architecture:** Los cambios de backend se concentran en `dashboard.ts` (3 nuevos endpoints + campos extras en `/conversations`) y `webhook/handler.ts` (transición `post_venta`). El frontend refactoriza 3 páginas existentes y `StatusBadge`; no se crean nuevos archivos de página salvo la eliminación de `PaymentsPage.tsx`.

**Tech Stack:** Bun + Hono + Zod (backend), React + TanStack Query + TailwindCSS + Shadcn/ui + Lucide (frontend). Sin migraciones SQL (todo computado en runtime).

---

## Mapa de archivos

| Archivo | Acción |
|---|---|
| `backend/src/api/dashboard.ts` | Modificar: nuevo endpoint `POST /conversations/{id}/send-media`, nuevo endpoint `PUT /payments/{id}/state`, param `phone` en `GET /payments`, campos `last_message_text/direction/unread_count` en `GET /conversations` |
| `backend/src/webhook/handler.ts` | Modificar: detectar stages terminales y transicionar a `post_venta` |
| `dashboard/src/lib/api.ts` | Modificar: agregar `sendMediaFromLibrary`, `updatePaymentState`, param `phone` en `getPayments` |
| `dashboard/src/lib/hooks.ts` | Modificar: agregar `useSendMediaFromLibraryMutation`, `useUpdatePaymentStateMutation`, param `phone` en `usePaymentsQuery` |
| `dashboard/src/components/StatusBadge.tsx` | Modificar: agregar `post_venta` y entradas para stages faltantes |
| `dashboard/src/pages/ConversationsPage.tsx` | Modificar: rediseño `ConversationRow` con last_message + unread badge + stage siempre visible |
| `dashboard/src/pages/ConversationDetailPage.tsx` | Modificar: reemplazar attach por `MediaPickerModal`, agregar sección Pagos en `ClientInfoModal`, agregar `post_venta` a `STAGE_OPTIONS` |
| `dashboard/src/pages/ReportsPage.tsx` | Modificar: restructurar con Tabs Shadcn (Resumen / Pagos / Anuncios) |
| `dashboard/src/layout/AppLayout.tsx` | Modificar: eliminar link a `/payments` |
| `dashboard/src/App.tsx` | Modificar: eliminar ruta `/payments` e import de `PaymentsPage` |
| `dashboard/src/pages/PaymentsPage.tsx` | Eliminar |

---

## Task 1: Backend — `PUT /payments/{id}/state`

**Files:**
- Modify: `backend/src/api/dashboard.ts` (después de la ruta `GET /payments`, alrededor de línea 3232)

- [ ] **Step 1: Agregar el endpoint después del cierre de `GET /payments`**

Buscar la línea `);` que cierra el handler de `GET /payments` (aprox línea 3231) e insertar inmediatamente después:

```typescript
dashboardApi.openapi(
  createRoute({
    method: "put",
    path: "/payments/{id}/state",
    request: {
      headers: AuthHeaderSchema,
      params: z.object({ id: z.string() }),
      body: {
        required: true,
        content: {
          "application/json": {
            schema: z.object({
              state: z.enum(["validated", "rejected"]),
            }),
          },
        },
      },
    },
    responses: {
      200: {
        description: "Estado actualizado",
        content: { "application/json": { schema: z.object({ ok: z.boolean() }) } },
      },
      404: {
        description: "No encontrado",
        content: { "application/json": { schema: ErrorSchema } },
      },
      500: {
        description: "Error",
        content: { "application/json": { schema: ErrorSchema } },
      },
    },
  }),
  async (c) => {
    if (!supabase) return c.json({ error: "Supabase no configurado" }, 500);
    const { id } = c.req.valid("param");
    const { state } = c.req.valid("json");
    const organization = orgId(c);

    const { data: existing } = await supabase
      .from("payments")
      .select("id")
      .eq("id", id)
      .eq("organization_id", organization)
      .maybeSingle();

    if (!existing) return c.json({ error: "Pago no encontrado" }, 404);

    const { error } = await supabase
      .from("payments")
      .update({
        state,
        validated_at: state === "validated" ? new Date().toISOString() : null,
      })
      .eq("id", id)
      .eq("organization_id", organization);

    if (error) return c.json({ error: error.message }, 500);
    return c.json({ ok: true }, 200);
  },
);
```

- [ ] **Step 2: Verificar que el backend compila**

```bash
cd backend && bun run dev 2>&1 | head -20
```

Esperado: sin errores de TypeScript, servidor iniciado.

- [ ] **Step 3: Commit**

```bash
git add backend/src/api/dashboard.ts
git commit -m "feat(api): add PUT /payments/{id}/state endpoint"
```

---

## Task 2: Backend — param `phone` en `GET /payments`

**Files:**
- Modify: `backend/src/api/dashboard.ts` (ruta `GET /payments`, aprox líneas 3126–3231)

- [ ] **Step 1: Agregar `phone` al schema de query**

En el objeto `query` de `GET /payments` (aprox línea 3129), agregar después de `to: z.string().optional()`:

```typescript
phone: z.string().optional(),
```

- [ ] **Step 2: Desestructurar y aplicar el filtro en el handler**

En la desestructuración del handler (aprox línea 3165), agregar `phone` junto a los demás params:

```typescript
const {
  page, pageSize, sortBy, sortDir, state, flowId, instanceId,
  from: fromDate, to: toDate,
  phone,
} = c.req.valid("query");
```

Después de las líneas donde se aplican los filtros existentes (aprox línea 3195, después de `if (toDate)`), agregar:

```typescript
if (phone) query = query.eq("phone", phone);
```

Hacer lo mismo para `countQuery` (aprox línea 3205):

```typescript
if (phone) countQuery = countQuery.eq("phone", phone);
```

- [ ] **Step 3: Verificar compilación**

```bash
cd backend && bun run dev 2>&1 | head -20
```

Esperado: sin errores.

- [ ] **Step 4: Commit**

```bash
git add backend/src/api/dashboard.ts
git commit -m "feat(api): add phone filter to GET /payments"
```

---

## Task 3: Backend — campos `last_message_*` y `unread_count` en `GET /conversations`

**Files:**
- Modify: `backend/src/api/dashboard.ts`

- [ ] **Step 1: Ampliar `ConversationSchema`**

Buscar `ConversationSchema` (aprox línea 120) y agregar los tres campos nuevos antes del cierre `)`  :

```typescript
const ConversationSchema = z.object({
  id: z.string(),
  phone: z.string(),
  contact_name: z.string().nullable().optional(),
  stage: z.string(),
  flow_id: z.string().nullable().optional(),
  flow_name: z.string().nullable().optional(),
  started_at: z.string().nullable().optional(),
  updated_at: z.string().nullable().optional(),
  ad_name: z.string().nullable().optional(),
  ad_source: AdSourceSchema.nullable().optional(),
  last_message_text: z.string().nullable().optional(),
  last_message_direction: z.enum(["inbound", "outbound"]).nullable().optional(),
  unread_count: z.number().optional(),
});
```

- [ ] **Step 2: Calcular los nuevos campos en el handler de `GET /conversations`**

Justo después de construir `adNameByPhone` (después del `for (const row of adRows ?? [])` loop, aprox línea 2722) y antes de construir `items`, agregar este batch de mensajes:

```typescript
// Batch-fetch last message and unread count per conversation id
type MsgRow = { conversation_id: string; text_body: string | null; direction: string; created_at: string };
let lastMsgByConvId: Map<string, MsgRow> = new Map();
let unreadByConvId: Map<string, number> = new Map();

if ((data ?? []).length > 0) {
  const convIds = (data ?? []).map((c) => (c as Record<string, unknown>).id as string);

  // Last message per conversation
  const { data: msgRows } = await supabase
    .from("messages")
    .select("conversation_id, text_body, direction, message_type, created_at")
    .in("conversation_id", convIds)
    .order("created_at", { ascending: false });

  for (const row of msgRows ?? []) {
    const cid = row.conversation_id as string;
    if (!lastMsgByConvId.has(cid)) {
      lastMsgByConvId.set(cid, row as MsgRow);
    }
  }

  // Unread count: inbound messages after last outbound per conversation
  // Strategy: fetch all messages for these convs, compute per conv in JS
  const allMsgs = (msgRows ?? []) as unknown as Array<{
    conversation_id: string;
    direction: string;
    created_at: string;
  }>;

  for (const cid of convIds) {
    const convMsgs = allMsgs
      .filter((m) => m.conversation_id === cid)
      .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
    const lastOutboundIdx = convMsgs.map((m) => m.direction).lastIndexOf("outbound");
    const unread = lastOutboundIdx === -1
      ? convMsgs.filter((m) => m.direction === "inbound").length
      : convMsgs.slice(lastOutboundIdx + 1).filter((m) => m.direction === "inbound").length;
    unreadByConvId.set(cid, unread);
  }
}
```

- [ ] **Step 3: Agregar los campos en el mapeo de `items`**

En el `.map()` que construye `items` (aprox línea 2724), agregar los tres campos nuevos al objeto retornado:

```typescript
const items: z.infer<typeof ConversationSchema>[] = (data ?? []).map(
  (conv) => {
    const c = conv as Record<string, unknown>;
    const convId = c.id as string;
    const lastMsg = lastMsgByConvId.get(convId);
    const lastMsgText = lastMsg
      ? (lastMsg.text_body?.trim() || null)
      : null;
    return {
      id: convId,
      phone: c.phone as string,
      stage: c.stage as string,
      contact_name: (c.contact_name as string | null) ?? null,
      flow_id: (c.flow_id as string | null) ?? null,
      flow_name: (c.flow_name as string | null) ?? null,
      started_at: (c.started_at as string | null) ?? null,
      updated_at: (c.updated_at as string | null) ?? null,
      ad_name: adNameByPhone.get(c.phone as string) ?? null,
      last_message_text: lastMsgText,
      last_message_direction: lastMsg
        ? (lastMsg.direction as "inbound" | "outbound")
        : null,
      unread_count: unreadByConvId.get(convId) ?? 0,
    };
  },
);
```

- [ ] **Step 4: Verificar compilación**

```bash
cd backend && bun run dev 2>&1 | head -20
```

Esperado: sin errores.

- [ ] **Step 5: Commit**

```bash
git add backend/src/api/dashboard.ts
git commit -m "feat(api): add last_message and unread_count to GET /conversations"
```

---

## Task 4: Backend — endpoint `POST /conversations/{id}/send-media`

**Files:**
- Modify: `backend/src/api/dashboard.ts` (antes del handler de `GET /payments`, aprox línea 3122)

- [ ] **Step 1: Agregar el endpoint antes de `GET /payments`**

Insertar antes de la línea `dashboardApi.openapi(` de `GET /payments`:

```typescript
dashboardApi.openapi(
  createRoute({
    method: "post",
    path: "/conversations/{id}/send-media",
    request: {
      headers: AuthHeaderSchema,
      params: z.object({ id: z.string() }),
      body: {
        required: true,
        content: {
          "application/json": {
            schema: z.object({
              url: z.string().url(),
              filename: z.string(),
              mimeType: z.string(),
            }),
          },
        },
      },
    },
    responses: {
      200: {
        description: "Media enviada",
        content: {
          "application/json": {
            schema: z.object({ ok: z.boolean(), messageId: z.string().nullable().optional() }),
          },
        },
      },
      404: {
        description: "Conversación no encontrada",
        content: { "application/json": { schema: ErrorSchema } },
      },
      500: {
        description: "Error",
        content: { "application/json": { schema: ErrorSchema } },
      },
    },
  }),
  async (c) => {
    if (!supabase) return c.json({ error: "Supabase no configurado" }, 500);
    const { id } = c.req.valid("param");
    const { url, filename, mimeType } = c.req.valid("json");
    const organization = orgId(c);

    const { data: conversation } = await supabase
      .from("conversations")
      .select("id, phone, whatsapp_instance_id")
      .eq("id", id)
      .eq("organization_id", organization)
      .maybeSingle();
    if (!conversation) return c.json({ error: "Conversacion no encontrada" }, 404);

    let metaPhoneNumberId: string | null = null;
    if (conversation.whatsapp_instance_id) {
      const { data: instance } = await supabase
        .from("whatsapp_instances")
        .select("phone_number_id")
        .eq("id", conversation.whatsapp_instance_id)
        .eq("organization_id", organization)
        .maybeSingle();
      metaPhoneNumberId = instance?.phone_number_id ?? null;
    }

    // Determine WhatsApp media type from mimeType
    let waType: "image" | "video" | "document";
    if (mimeType.startsWith("image/")) {
      waType = "image";
    } else if (mimeType.startsWith("video/")) {
      waType = "video";
    } else {
      waType = "document";
    }

    const mediaPayload =
      waType === "image"
        ? { type: "image", image: { link: url } }
        : waType === "video"
          ? { type: "video", video: { link: url } }
          : { type: "document", document: { link: url, filename } };

    await sendMessage(conversation.phone, mediaPayload, {
      metaPhoneNumberId,
      organizationId: organization,
      conversationId: id,
    });

    return c.json({ ok: true }, 200);
  },
);
```

- [ ] **Step 2: Verificar compilación**

```bash
cd backend && bun run dev 2>&1 | head -20
```

Esperado: sin errores.

- [ ] **Step 3: Commit**

```bash
git add backend/src/api/dashboard.ts
git commit -m "feat(api): add POST /conversations/{id}/send-media endpoint"
```

---

## Task 5: Backend — transición `post_venta` en webhook

**Files:**
- Modify: `backend/src/webhook/handler.ts`

- [ ] **Step 1: Verificar cómo se persiste el stage en el handler**

```bash
grep -n "setState\|getState\|upsertConversation\|state\.stage" backend/src/webhook/handler.ts | head -15
```

El handler obtiene el estado via `getState(phone, ...)` (Redis) y luego llama a `upsertConversation({ stage: state.stage, ... })`. Mutar `state.stage` antes de `upsertConversation` es suficiente — se persiste automáticamente.

- [ ] **Step 2: Definir stages terminales y agregar la transición**

Buscar la línea `const state = await getState(phone, metaPhoneNumberId || null);` (aprox línea 174). Inmediatamente después, agregar:

```typescript
// Si el cliente escribe después de un stage terminal, transicionar a post_venta
const TERMINAL_STAGES = [
  "pago_confirmado",
  "comprobante_rechazado",
  "comprobante_vencido",
  "comprobante_ilegible",
];
if (state.stage && TERMINAL_STAGES.includes(state.stage)) {
  state.stage = "post_venta";
}
```

Esta mutación es suficiente: el `upsertConversation` que llama el handler a continuación (aprox línea 247) ya lee `state.stage` y lo persiste en la DB y Redis.

- [ ] **Step 3: Verificar compilación**

```bash
cd backend && bun run dev 2>&1 | head -20
```

Esperado: sin errores.

- [ ] **Step 4: Commit**

```bash
git add backend/src/webhook/handler.ts
git commit -m "feat(bot): transition conversation to post_venta after terminal stage"
```

---

## Task 6: Frontend — regenerar tipos y agregar funciones API + hooks

**Files:**
- Modify: `dashboard/src/lib/api.ts`
- Modify: `dashboard/src/lib/hooks.ts`

- [ ] **Step 1: Regenerar tipos OpenAPI**

```bash
cd dashboard && bun run generate:api
```

Esperado: `dashboard/src/lib/__gen__/api_v1.d.ts` actualizado sin errores.

- [ ] **Step 2: Agregar funciones en `api.ts`**

En el objeto `api` dentro de `dashboard/src/lib/api.ts`, agregar las siguientes funciones junto a las existentes de payments/conversations:

Después de `uploadAndSendFile`:
```typescript
sendMediaFromLibrary: (id: string, payload: { url: string; filename: string; mimeType: string }) =>
  buildHeaders(true).then((headers) =>
    fetch(`${API_URL}/api/conversations/${id}/send-media`, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    }).then((r) => {
      if (!r.ok) return throwApiError(r);
      return r.json() as Promise<{ ok: boolean; messageId?: string | null }>;
    })
  ),
updatePaymentState: (id: string, state: "validated" | "rejected") =>
  buildHeaders(true).then((headers) =>
    fetch(`${API_URL}/api/payments/${id}/state`, {
      method: "PUT",
      headers,
      body: JSON.stringify({ state }),
    }).then((r) => {
      if (!r.ok) return throwApiError(r);
      return r.json() as Promise<{ ok: boolean }>;
    })
  ),
```

Agregar `phone?: string` al tipo del parámetro de `getPayments` y al `URLSearchParams`:

```typescript
getPayments: (params?: {
  page?: number;
  pageSize?: number;
  sortBy?: string;
  sortDir?: "asc" | "desc";
  state?: string;
  flowId?: string;
  instanceId?: string;
  from?: string;
  to?: string;
  phone?: string;  // nuevo
}) => {
  const q = new URLSearchParams();
  // ... (resto igual) ...
  if (params?.phone) q.set("phone", params.phone);  // nuevo
  return request<Paginated<Payment>>(`/api/payments?${q.toString()}`);
},
```

- [ ] **Step 3: Agregar hooks en `hooks.ts`**

Agregar después de `usePaymentsQuery`:

```typescript
export function useUpdatePaymentStateMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, state }: { id: string; state: "validated" | "rejected" }) =>
      api.updatePaymentState(id, state),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["payments"] });
    },
  });
}
```

Actualizar `usePaymentsQuery` para aceptar `phone`:

```typescript
export function usePaymentsQuery(params?: {
  page?: number;
  pageSize?: number;
  sortBy?: string;
  sortDir?: "asc" | "desc";
  state?: string;
  flowId?: string;
  instanceId?: string;
  from?: string;
  to?: string;
  phone?: string;  // nuevo
}) {
  return useQuery({
    queryKey: ["payments", params],
    queryFn: () => api.getPayments(params),
  });
}
```

Agregar hook para enviar media desde biblioteca:

```typescript
export function useSendMediaFromLibraryMutation(conversationId: string) {
  return useMutation({
    mutationFn: (payload: { url: string; filename: string; mimeType: string }) =>
      api.sendMediaFromLibrary(conversationId, payload),
  });
}
```

- [ ] **Step 4: Verificar que el frontend compila**

```bash
cd dashboard && bun run build 2>&1 | tail -20
```

Esperado: sin errores de TypeScript.

- [ ] **Step 5: Commit**

```bash
git add dashboard/src/lib/api.ts dashboard/src/lib/hooks.ts dashboard/src/lib/__gen__/api_v1.d.ts
git commit -m "feat(frontend): add sendMediaFromLibrary and updatePaymentState API + hooks"
```

---

## Task 7: Frontend — `StatusBadge` con `post_venta` y todos los stages

**Files:**
- Modify: `dashboard/src/components/StatusBadge.tsx`

- [ ] **Step 1: Reemplazar el contenido de `StatusBadge.tsx`**

```typescript
import { Star } from "lucide-react";

type Props = {
  state: string;
};

const colorMap: Record<string, string> = {
  flow_started: "badge badge-indigo",
  interesado: "badge badge-blue",
  listo_pagar: "badge badge-cyan",
  necesita_agente: "badge badge-orange",
  confirmar_comprobante: "badge badge-purple",
  pago_confirmado: "badge badge-green",
  post_venta: "badge badge-amber",
  comprobante_rechazado: "badge badge-red",
  comprobante_ilegible: "badge badge-red",
  comprobante_vencido: "badge badge-red",
  saludo: "badge badge-gray",
  catalogo: "badge badge-gray",
  esperando_comprobante: "badge badge-yellow",
  ayuda: "badge badge-gray",
};

const labelMap: Record<string, string> = {
  flow_started: "En flujo",
  interesado: "Interesado",
  listo_pagar: "Listo para pagar",
  necesita_agente: "Necesita agente",
  confirmar_comprobante: "En revisión",
  pago_confirmado: "Pago confirmado",
  post_venta: "Post-venta",
  comprobante_rechazado: "Comp. rechazado",
  comprobante_ilegible: "Comp. ilegible",
  comprobante_vencido: "Comp. vencido",
  saludo: "Saludo",
  catalogo: "Catálogo",
  esperando_comprobante: "Esperando comp.",
  ayuda: "Ayuda",
};

export function StatusBadge({ state }: Props) {
  const label = labelMap[state] ?? state;
  const isPostVenta = state === "post_venta";
  return (
    <span className={`${colorMap[state] ?? "badge badge-gray"} inline-flex items-center gap-1`}>
      {isPostVenta && <Star size={10} />}
      {label}
    </span>
  );
}
```

> Nota: Si las clases `badge-cyan`, `badge-red`, `badge-yellow` no existen en el CSS global, agregar solo las que falten siguiendo el patrón de las existentes. Verificar en `dashboard/src/index.css` o el archivo de estilos globales.

- [ ] **Step 2: Verificar clases de badge disponibles**

```bash
grep -n "badge-" dashboard/src/index.css | head -20
```

Si faltan clases (`badge-cyan`, `badge-red`, `badge-yellow`, `badge-amber`), agregarlas en `index.css` siguiendo el patrón de las existentes.

- [ ] **Step 3: Verificar compilación**

```bash
cd dashboard && bun run build 2>&1 | grep -E "error|Error" | head -10
```

Esperado: sin errores.

- [ ] **Step 4: Commit**

```bash
git add dashboard/src/components/StatusBadge.tsx dashboard/src/index.css
git commit -m "feat(ui): update StatusBadge with post_venta and all stages"
```

---

## Task 8: Frontend — rediseño `ConversationRow` en `ConversationsPage`

**Files:**
- Modify: `dashboard/src/pages/ConversationsPage.tsx`

- [ ] **Step 1: Agregar `post_venta` a `STAGE_OPTIONS` y actualizar `Conversation` usage**

En `ConversationsPage.tsx`, actualizar el array `STAGE_OPTIONS`:

```typescript
const STAGE_OPTIONS = [
  { value: "flow_started", label: "En flujo" },
  { value: "interesado", label: "Interesado" },
  { value: "listo_pagar", label: "Listo para pagar" },
  { value: "necesita_agente", label: "Necesita agente" },
  { value: "confirmar_comprobante", label: "En revisión" },
  { value: "pago_confirmado", label: "Pago confirmado" },
  { value: "post_venta", label: "Post-venta" },
  { value: "comprobante_rechazado", label: "Comp. rechazado" },
  { value: "comprobante_vencido", label: "Comp. vencido" },
];
```

- [ ] **Step 2: Reemplazar la función `ConversationRow`**

Reemplazar la función `ConversationRow` completa con el nuevo diseño:

```typescript
function ConversationRow({
  conv,
  onClick,
}: {
  conv: Conversation;
  onClick: () => void;
}) {
  const isPostVenta = conv.stage === "post_venta";
  const unread = (conv as Conversation & { unread_count?: number }).unread_count ?? 0;
  const lastText = (conv as Conversation & { last_message_text?: string | null }).last_message_text;

  return (
    <button
      type="button"
      onClick={onClick}
      className={`group flex w-full items-center gap-3 rounded-xl border px-4 py-3 text-left transition-all hover:bg-muted/40 hover:shadow-sm ${
        isPostVenta
          ? "bg-amber-950/20 border-amber-800/30"
          : "bg-card"
      }`}
    >
      {/* Avatar con badge de no leídos */}
      <div className="relative shrink-0">
        <div className="flex h-11 w-11 items-center justify-center rounded-full bg-primary/10 text-primary font-semibold text-sm">
          {conv.phone.slice(-2)}
        </div>
        {unread > 0 && (
          <span className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-green-500 text-[10px] font-bold text-white border-2 border-background">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </div>

      {/* Contenido */}
      <div className="flex flex-1 flex-col gap-0.5 min-w-0">
        {/* Línea 1: nombre + timestamp */}
        <div className="flex items-center justify-between gap-2">
          <span className={`text-sm truncate ${unread > 0 ? "font-semibold" : "font-medium"}`}>
            {conv.contact_name ?? formatPhone(conv.phone)}
          </span>
          <span className="shrink-0 text-xs text-muted-foreground">
            {timeAgo(conv.updated_at)}
          </span>
        </div>

        {/* Línea 2: último mensaje */}
        <p className={`text-xs truncate ${
          unread > 0
            ? "text-foreground font-medium"
            : "text-muted-foreground"
        }`}>
          {lastText ?? "Sin mensajes"}
        </p>

        {/* Línea 3: estado + flujo */}
        <div className="flex items-center gap-1.5 mt-0.5">
          <StatusBadge state={String(conv.stage)} />
          {conv.flow_name && (
            <>
              <span className="text-muted-foreground/40 text-xs">·</span>
              <span className="text-xs text-muted-foreground truncate max-w-32 flex items-center gap-1">
                <Workflow size={10} className="shrink-0" />
                {conv.flow_name}
              </span>
            </>
          )}
        </div>
      </div>
    </button>
  );
}
```

- [ ] **Step 3: Verificar que los imports incluyen `Workflow` y `StatusBadge`**

Los imports ya deben incluir `Workflow` (de lucide-react) y `StatusBadge`. Verificar que estén presentes; si falta alguno, agregarlo.

- [ ] **Step 4: Verificar compilación**

```bash
cd dashboard && bun run build 2>&1 | grep -E "error|Error" | head -10
```

Esperado: sin errores.

- [ ] **Step 5: Commit**

```bash
git add dashboard/src/pages/ConversationsPage.tsx
git commit -m "feat(conversations): redesign ConversationRow with last message, unread badge and always-visible stage"
```

---

## Task 9: Frontend — reemplazar adjunto por `MediaPickerModal` en `ConversationDetailPage`

**Files:**
- Modify: `dashboard/src/pages/ConversationDetailPage.tsx`

- [ ] **Step 1: Agregar import y hook**

En los imports de `ConversationDetailPage.tsx`, agregar:

```typescript
import { MediaPickerModal } from "../components/ui/media-picker-modal";
import type { MediaPickerResult } from "../components/ui/media-picker-modal";
import { useSendMediaFromLibraryMutation } from "../lib/hooks";
```

- [ ] **Step 2: Reemplazar estado y refs del adjunto local**

En la función `ConversationDetailPage`, reemplazar:

```typescript
// ANTES:
const [file, setFile] = useState<File | null>(null);
const fileInputRef = useRef<HTMLInputElement | null>(null);
```

Por:

```typescript
const [mediaPickerOpen, setMediaPickerOpen] = useState(false);
```

Agregar el nuevo mutation junto a los existentes:

```typescript
const sendMediaMutation = useSendMediaFromLibraryMutation(id);
```

- [ ] **Step 3: Actualizar `isSending` e `onSend`**

Actualizar `isSending`:

```typescript
const isSending = sendMutation.isPending || sendMediaMutation.isPending;
```

En `onSend`, eliminar el bloque `if (file)` completo y dejar solo el envío de texto:

```typescript
const onSend = async () => {
  if (isSending) return;
  if (!text.trim()) return;
  await sendMutation.mutateAsync({ type: "text", text });
  setText("");
  const res = await api.getConversationMessages(id, 1, PAGE_SIZE, true);
  setMessages([...res.items].reverse());
  setTotal(res.total);
  requestAnimationFrame(() => {
    const el = chatWindowRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  });
};
```

Agregar handler para cuando el usuario confirma media:

```typescript
const onMediaSelect = async (result: MediaPickerResult) => {
  await sendMediaMutation.mutateAsync({
    url: result.url,
    filename: result.filename,
    mimeType: result.mimeType,
  });
  const res = await api.getConversationMessages(id, 1, PAGE_SIZE, true);
  setMessages([...res.items].reverse());
  setTotal(res.total);
  requestAnimationFrame(() => {
    const el = chatWindowRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  });
};
```

- [ ] **Step 4: Actualizar el compositor en el JSX**

En el compositor (sección `{/* ── Composer ── */}`), eliminar:

- El chip de preview del archivo (`{file && (...)}`)
- El `<input ref={fileInputRef} type="file" ...>`
- El handler `onDropFile` del `<div>` exterior y del compositor
- La prop `onDrop={onDropFile}` de ambos divs

Reemplazar el botón Paperclip:

```tsx
// ANTES:
<button
  type="button"
  aria-label="Adjuntar archivo"
  onClick={() => fileInputRef.current?.click()}
  disabled={isSending}
  className="mb-1 shrink-0 text-muted-foreground hover:text-foreground disabled:opacity-40"
>
  <Paperclip size={18} />
</button>

// DESPUÉS:
<button
  type="button"
  aria-label="Adjuntar desde biblioteca"
  onClick={() => setMediaPickerOpen(true)}
  disabled={isSending}
  className="mb-1 shrink-0 text-muted-foreground hover:text-foreground disabled:opacity-40"
>
  <Paperclip size={18} />
</button>
```

- [ ] **Step 5: Agregar `MediaPickerModal` al JSX (junto a `ClientInfoModal`)**

Justo después del cierre de `<ClientInfoModal ... />`, agregar:

```tsx
<MediaPickerModal
  open={mediaPickerOpen}
  onClose={() => setMediaPickerOpen(false)}
  onSelect={(result) => void onMediaSelect(result)}
  title="Seleccionar archivo para enviar"
/>
```

- [ ] **Step 6: Eliminar imports no usados**

Verificar que `DragEventHandler` (si se removió `onDropFile`) y el type import de `File` ya no se usen. Eliminar si es el caso.

- [ ] **Step 7: Verificar compilación**

```bash
cd dashboard && bun run build 2>&1 | grep -E "error|Error" | head -10
```

Esperado: sin errores.

- [ ] **Step 8: Commit**

```bash
git add dashboard/src/pages/ConversationDetailPage.tsx
git commit -m "feat(conversation): replace local file attach with org media library picker"
```

---

## Task 10: Frontend — sección Pagos en `ClientInfoModal`

**Files:**
- Modify: `dashboard/src/pages/ConversationDetailPage.tsx`

- [ ] **Step 1: Agregar imports necesarios**

En `ConversationDetailPage.tsx`, agregar a los imports:

```typescript
import { CreditCard, CheckCircle2, XCircle } from "lucide-react";
import { usePaymentsQuery, useUpdatePaymentStateMutation } from "../lib/hooks";
```

- [ ] **Step 2: Agregar `post_venta` a `STAGE_OPTIONS`**

```typescript
const STAGE_OPTIONS = [
  { value: "flow_started", label: "En flujo" },
  { value: "interesado", label: "Interesado" },
  { value: "listo_pagar", label: "Listo para pagar" },
  { value: "necesita_agente", label: "Necesita agente" },
  { value: "confirmar_comprobante", label: "En revisión" },
  { value: "pago_confirmado", label: "Pago confirmado" },
  { value: "post_venta", label: "Post-venta" },
  { value: "comprobante_rechazado", label: "Comp. rechazado" },
];
```

- [ ] **Step 3: Crear componente `ConversationPayments`**

Agregar esta función antes de `ClientInfoModal`:

```typescript
function ConversationPayments({ phone }: { phone: string }) {
  const { data, isLoading } = usePaymentsQuery({ phone, pageSize: 10 });
  const updateState = useUpdatePaymentStateMutation();
  const payments = data?.items ?? [];

  if (isLoading) {
    return (
      <div className="flex flex-col gap-2 pt-1">
        {[1, 2].map((i) => <Skeleton key={i} className="h-16 w-full rounded-xl" />)}
      </div>
    );
  }

  if (payments.length === 0) {
    return (
      <p className="text-xs text-muted-foreground pt-1">
        Sin pagos registrados para esta conversación.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-2 pt-1">
      {payments.map((p) => (
        <div
          key={p.id}
          className={`rounded-xl border p-3 flex flex-col gap-2 ${
            p.state === "pending_manual_review"
              ? "border-amber-500/30 bg-amber-950/20"
              : p.state === "validated"
                ? "border-green-500/20 bg-green-950/20"
                : "border-red-500/20 bg-red-950/20"
          }`}
        >
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="font-semibold text-sm">
                {p.amount != null
                  ? p.amount.toLocaleString("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 })
                  : "—"}
              </p>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                {p.flow_name ?? "—"} · {p.receipt_date
                  ? new Date(p.receipt_date).toLocaleDateString("es-CO", { day: "2-digit", month: "short", year: "numeric" })
                  : "—"}
              </p>
            </div>
            <span
              className={`shrink-0 inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium ${
                p.state === "pending_manual_review"
                  ? "bg-amber-500/10 text-amber-600 border-amber-500/20"
                  : p.state === "validated"
                    ? "bg-green-500/10 text-green-600 border-green-500/20"
                    : "bg-red-500/10 text-red-600 border-red-500/20"
              }`}
            >
              {p.state === "pending_manual_review"
                ? "Pendiente"
                : p.state === "validated"
                  ? "Validado"
                  : "Rechazado"}
            </span>
          </div>

          {p.state === "pending_manual_review" && (
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                className="flex-1 h-8 text-xs gap-1 border-green-500/40 text-green-600 hover:bg-green-500/10"
                disabled={updateState.isPending}
                onClick={() => updateState.mutate({ id: p.id, state: "validated" })}
              >
                <CheckCircle2 size={13} />
                Aprobar
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="flex-1 h-8 text-xs gap-1 border-red-500/40 text-red-600 hover:bg-red-500/10"
                disabled={updateState.isPending}
                onClick={() => updateState.mutate({ id: p.id, state: "rejected" })}
              >
                <XCircle size={13} />
                Rechazar
              </Button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Agregar la sección al modal**

En `ClientInfoModal`, al final del JSX de `conversation` (después del bloque `{ad && ...}` con el origen del anuncio), agregar:

```tsx
{/* Pagos */}
<div className="h-px bg-border" />
<div className="flex flex-col gap-2">
  <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
    <CreditCard size={12} />
    Pagos
  </p>
  <ConversationPayments phone={conversation.phone} />
</div>
```

- [ ] **Step 5: Verificar compilación**

```bash
cd dashboard && bun run build 2>&1 | grep -E "error|Error" | head -10
```

Esperado: sin errores.

- [ ] **Step 6: Commit**

```bash
git add dashboard/src/pages/ConversationDetailPage.tsx
git commit -m "feat(conversation): add payments section to client info modal with approve/reject"
```

---

## Task 11: Frontend — ReportsPage con Tabs (Resumen / Pagos / Anuncios)

**Files:**
- Modify: `dashboard/src/pages/ReportsPage.tsx`

- [ ] **Step 1: Instalar componente Tabs de Shadcn**

```bash
cd dashboard && bunx shadcn@latest add tabs
```

Esperado: `dashboard/src/components/ui/tabs.tsx` creado.

- [ ] **Step 2: Reemplazar los imports de `ReportsPage.tsx`**

Al inicio del archivo, reemplazar los imports actuales por:

```typescript
import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, LabelList,
  Pie, PieChart, Tooltip, XAxis, YAxis,
} from "recharts";
import { Button } from "../components/ui/button";
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from "../components/ui/card";
import {
  ChartContainer, ChartLegend, ChartLegendContent,
  ChartTooltip, ChartTooltipContent,
} from "../components/ui/chart";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "../components/ui/select";
import {
  Tabs, TabsContent, TabsList, TabsTrigger,
} from "../components/ui/tabs";
import { Skeleton } from "../components/ui/skeleton";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "../components/ui/table";
import {
  useAdReferralsQuery, useFlowsV2Query, useInstancesQuery,
  useReportsQuery, usePaymentsQuery, useUpdatePaymentStateMutation,
} from "../lib/hooks";
import { CheckCircle2, XCircle } from "lucide-react";
import type { Payment } from "../types/api";
```

- [ ] **Step 3: Reemplazar la función `ReportsPage` completa**

Reemplazar toda la función `ReportsPage` con la versión restructurada. El esqueleto principal:

```typescript
export function ReportsPage() {
  const now = new Date();
  const [fromDate, setFromDate] = useState(dateInputValue(new Date(now.getTime() - 7 * 86400000)));
  const [toDate, setToDate] = useState(dateInputValue(now));
  const [instanceId, setInstanceId] = useState<string>("all");
  const [flowId, setFlowId] = useState<string>("all");
  const [granularity, setGranularity] = useState<"day" | "week" | "month">("day");
  const [page, setPage] = useState(1);
  const [paymentsPage, setPaymentsPage] = useState(1);
  const [paymentsState, setPaymentsState] = useState("all");
  const pageSize = 20;

  const queryParams = useMemo(() => ({
    from: toIsoStart(fromDate), to: toIsoEnd(toDate),
    instanceId: instanceId === "all" ? undefined : [instanceId],
    flowId: flowId === "all" ? undefined : [flowId],
    granularity, page, pageSize,
  }), [flowId, fromDate, granularity, instanceId, page, toDate]);

  const adQueryParams = useMemo(() => ({
    from: toIsoStart(fromDate), to: toIsoEnd(toDate),
    flowId: flowId === "all" ? undefined : [flowId],
  }), [flowId, fromDate, toDate]);

  const { data, isLoading, isFetching, isError, refetch } = useReportsQuery(queryParams);
  const { data: adData, isLoading: adLoading } = useAdReferralsQuery(adQueryParams);
  const { data: instances = [] } = useInstancesQuery();
  const { data: flows = [] } = useFlowsV2Query();
  const { data: paymentsData, isLoading: paymentsLoading } = usePaymentsQuery({
    page: paymentsPage,
    pageSize: 15,
    sortBy: "validated_at",
    sortDir: "desc",
    state: paymentsState !== "all" ? paymentsState : undefined,
    flowId: flowId !== "all" ? flowId : undefined,
    instanceId: instanceId !== "all" ? instanceId : undefined,
    from: toIsoStart(fromDate),
    to: toIsoEnd(toDate),
  });
  const updatePaymentState = useUpdatePaymentStateMutation();

  const table = data?.table;
  const loading = isLoading || isFetching;
  const empty = !loading && (table?.total ?? 0) === 0;
  const kpis = data?.kpis;

  // ... (helpers exportCsv, adItems, adChartData igual que antes) ...

  return (
    <section className="flex flex-col gap-3 p-3 sm:gap-4 sm:p-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">Reportes</h2>
          <p className="text-sm text-muted-foreground">Ventas, conversiones y rendimiento de anuncios</p>
        </div>
        <Button onClick={exportCsv} size="sm">Exportar CSV</Button>
      </div>

      {/* Filtros compartidos */}
      <Card>
        <CardContent className="pt-4 flex flex-wrap gap-3">
          {/* Date range, instancia, flujo, granularidad, presets — igual que antes */}
        </CardContent>
      </Card>

      {/* Tabs */}
      <Tabs defaultValue="resumen">
        <TabsList className="w-full sm:w-auto">
          <TabsTrigger value="resumen">Resumen</TabsTrigger>
          <TabsTrigger value="pagos">Pagos</TabsTrigger>
          <TabsTrigger value="anuncios">Anuncios</TabsTrigger>
        </TabsList>

        {/* Tab Resumen: KPIs + charts */}
        <TabsContent value="resumen" className="flex flex-col gap-3 mt-3">
          {/* KPIs grid, serie temporal, embudo, por flujo, por instancia — igual que antes */}
        </TabsContent>

        {/* Tab Pagos: lista de pagos con acciones */}
        <TabsContent value="pagos" className="flex flex-col gap-3 mt-3">
          {/* Filtro adicional de estado */}
          <div className="flex flex-wrap gap-2">
            <Select value={paymentsState} onValueChange={(v) => { setPaymentsState(v); setPaymentsPage(1); }}>
              <SelectTrigger className="h-9 w-44 text-sm"><SelectValue placeholder="Estado" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos los estados</SelectItem>
                <SelectItem value="pending_manual_review">Revisión pendiente</SelectItem>
                <SelectItem value="validated">Validado</SelectItem>
                <SelectItem value="rejected">Rechazado</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <Card>
            <CardContent className="pt-4 space-y-2">
              {paymentsLoading
                ? Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)
                : (paymentsData?.items ?? []).map((p: Payment) => (
                    <PaymentRowWithActions key={p.id} p={p} onUpdateState={updatePaymentState.mutate} isPending={updatePaymentState.isPending} />
                  ))}
              {/* Paginación */}
              <div className="flex items-center justify-between pt-2">
                <p className="text-xs text-muted-foreground">Total: {paymentsData?.total ?? 0}</p>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" disabled={paymentsPage <= 1} onClick={() => setPaymentsPage((p) => p - 1)}>Anterior</Button>
                  <Button variant="outline" size="sm" disabled={!paymentsData || paymentsPage * 15 >= paymentsData.total} onClick={() => setPaymentsPage((p) => p + 1)}>Siguiente</Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab Anuncios: métricas CTWA — igual que antes */}
        <TabsContent value="anuncios" className="flex flex-col gap-3 mt-3">
          {/* sección de anuncios actual */}
        </TabsContent>
      </Tabs>
    </section>
  );
}
```

> **Nota importante:** El código del tab "Resumen" es el copy exacto de los charts actuales (KPIs grid, AreaChart de serie temporal, BarChart de embudo, BarChart por flujo, PieChart por instancia). El tab "Anuncios" es el copy exacto de la sección "Rendimiento de anuncios" actual. No los dupliques en este plan — copiálos directamente del archivo existente al implementar.

- [ ] **Step 4: Agregar `PaymentRowWithActions` antes de `ReportsPage`**

```typescript
type PaymentState = "validated" | "rejected" | "pending_manual_review";

const PAYMENT_STATE_CONFIG: Record<PaymentState, { label: string; className: string }> = {
  pending_manual_review: { label: "Revisión pendiente", className: "bg-amber-500/10 text-amber-600 border-amber-500/20" },
  validated: { label: "Validado", className: "bg-green-500/10 text-green-600 border-green-500/20" },
  rejected: { label: "Rechazado", className: "bg-red-500/10 text-red-600 border-red-500/20" },
};

function PaymentRowWithActions({
  p,
  onUpdateState,
  isPending,
}: {
  p: Payment;
  onUpdateState: (args: { id: string; state: "validated" | "rejected" }) => void;
  isPending: boolean;
}) {
  const stateKey = (p.state ?? "pending_manual_review") as PaymentState;
  const cfg = PAYMENT_STATE_CONFIG[stateKey] ?? { label: p.state ?? "—", className: "bg-muted text-muted-foreground border-border" };

  const formatMoney = (v: number | null | undefined) =>
    v == null ? "—" : v.toLocaleString("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 });

  const formatDate = (iso: string | null | undefined) =>
    !iso ? "—" : new Date(iso).toLocaleString("es-CO", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

  return (
    <div className="rounded-xl border bg-card px-4 py-3 text-sm">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex-1 min-w-0">
          <p className="font-medium">{p.phone}</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {p.flow_name ?? "—"} · {formatDate(p.validated_at ?? p.receipt_date)}
          </p>
        </div>
        <span className="font-semibold tabular-nums">{formatMoney(p.amount)}</span>
        <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ${cfg.className}`}>
          {cfg.label}
        </span>
        {p.state === "pending_manual_review" && (
          <div className="flex gap-1.5">
            <Button size="sm" variant="outline" className="h-7 text-xs gap-1 border-green-500/40 text-green-600 hover:bg-green-500/10" disabled={isPending} onClick={() => onUpdateState({ id: p.id, state: "validated" })}>
              <CheckCircle2 size={12} /> Aprobar
            </Button>
            <Button size="sm" variant="outline" className="h-7 text-xs gap-1 border-red-500/40 text-red-600 hover:bg-red-500/10" disabled={isPending} onClick={() => onUpdateState({ id: p.id, state: "rejected" })}>
              <XCircle size={12} /> Rechazar
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Verificar compilación**

```bash
cd dashboard && bun run build 2>&1 | grep -E "error|Error" | head -10
```

Esperado: sin errores.

- [ ] **Step 6: Commit**

```bash
git add dashboard/src/pages/ReportsPage.tsx dashboard/src/components/ui/tabs.tsx
git commit -m "feat(reports): restructure with Tabs (Resumen/Pagos/Anuncios) and inline payment actions"
```

---

## Task 12: Frontend — eliminar página de Pagos y link del nav

**Files:**
- Modify: `dashboard/src/layout/AppLayout.tsx`
- Modify: `dashboard/src/App.tsx`
- Delete: `dashboard/src/pages/PaymentsPage.tsx`

- [ ] **Step 1: Eliminar link del nav en `AppLayout.tsx`**

En `dashboard/src/layout/AppLayout.tsx`, encontrar `operationsLinks` (aprox línea 77) y eliminar la entrada de Pagos:

```typescript
// ANTES:
const operationsLinks: NavItem[] = [
  { to: "/", label: "Resumen", icon: LayoutDashboard },
  { to: "/conversations", label: "Conversaciones", icon: MessagesSquare },
  { to: "/payments", label: "Pagos", icon: Receipt },
  { to: "/reports", label: "Reportes", icon: BarChart3 },
];

// DESPUÉS:
const operationsLinks: NavItem[] = [
  { to: "/", label: "Resumen", icon: LayoutDashboard },
  { to: "/conversations", label: "Conversaciones", icon: MessagesSquare },
  { to: "/reports", label: "Reportes", icon: BarChart3 },
];
```

Eliminar también el import de `Receipt` si queda sin usar:

```typescript
// Verificar y eliminar si no se usa en otro lugar:
Receipt,
```

- [ ] **Step 2: Eliminar ruta en `App.tsx`**

En `dashboard/src/App.tsx`, eliminar:

```typescript
import { PaymentsPage } from "./pages/PaymentsPage";  // eliminar
// ...
<Route path="/payments" element={<PaymentsPage />} />  // eliminar
```

- [ ] **Step 3: Eliminar el archivo**

```bash
rm dashboard/src/pages/PaymentsPage.tsx
```

- [ ] **Step 4: Verificar compilación final**

```bash
cd dashboard && bun run build 2>&1 | tail -20
```

Esperado: build exitoso sin errores ni warnings de imports no usados.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: remove PaymentsPage and nav link, payments now in Reports and conversation modal"
```

---

## Task 13: Verificación smoke test

- [ ] **Step 1: Correr ambos servicios**

```bash
# Terminal 1
cd backend && bun run dev

# Terminal 2
cd dashboard && bun run dev
```

- [ ] **Step 2: Checklist manual**

Verificar en el navegador:

1. `/conversations` — las filas muestran último mensaje, badge de no leídos (si aplica), estado siempre visible
2. `/conversations/:id` — el botón Paperclip abre el modal de media. Confirmar un archivo envía sin error (toast de éxito)
3. `/conversations/:id` → Info (modal) — sección "Pagos" visible al final, botones Aprobar/Rechazar en pagos pendientes funcionan
4. `/reports` — la página tiene tres tabs, los charts siguen funcionando en "Resumen", la lista de pagos aparece en "Pagos"
5. `/payments` — debe redirigir a 404 o página no encontrada (la ruta no existe)
6. Nav lateral — no aparece "Pagos"

- [ ] **Step 3: Verificar TypeScript sin errores**

```bash
cd dashboard && bun run build 2>&1 | grep -c "error"
```

Esperado: `0`

- [ ] **Step 4: Commit final**

```bash
git add .
git commit -m "chore: final smoke test verification complete"
```
