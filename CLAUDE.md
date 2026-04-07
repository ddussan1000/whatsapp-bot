# WhatsApp Bot Platform — CLAUDE.md

Guía de referencia rápida para no tener que explorar el código en cada sesión.

---

## Stack

| Capa | Tecnología |
|------|-----------|
| Backend | Bun + Hono + `@hono/zod-openapi` |
| Frontend | Vite + React + TailwindCSS + Shadcn/ui + TanStack Query |
| DB | Supabase (PostgreSQL + RLS) |
| Auth | Supabase Auth (Google OAuth) |
| Cache | Redis (Upstash) — estado de conversaciones |
| Deploy | Railway (backend), Vercel/Railway (frontend) |
| IA post-flujo | Multi-proveedor configurable por org (OpenAI, Gemini, Anthropic, Groq) — API key propia del usuario |
| OCR comprobantes | Gemini Vision (modelo configurable via `GEMINI_OCR_MODEL`, default `gemini-2.5-flash-lite`) + Tesseract como fallback |

---

## Estructura del proyecto

```
/
├── backend/               # API + bot engine
│   ├── src/
│   │   ├── api/
│   │   │   ├── dashboard.ts       # TODAS las rutas del dashboard (principal)
│   │   │   ├── flowRoutes.ts      # CRUD de flujos (upsert_flow_tree RPC)
│   │   │   └── adminRoutes.ts     # Rutas de plataforma admin
│   │   ├── bot/
│   │   │   ├── handler.ts / flows.ts / flowEngine.ts / classifier.ts
│   │   │   └── sender.ts / messages.ts / media.ts
│   │   ├── receipts/              # OCR de comprobantes
│   │   │   └── handler.ts         # Lógica de validación y mensajes de respuesta
│   │   ├── webhook/handler.ts     # Punto de entrada de mensajes WhatsApp
│   │   ├── db/                    # Funciones de acceso a Supabase
│   │   ├── cron/                  # Tareas periódicas
│   │   └── config/env.ts          # Variables de entorno
│   └── scripts/sql/               # Migraciones SQL (correr en Supabase Studio)
│
├── dashboard/             # SPA React
│   ├── src/
│   │   ├── pages/                 # Una página por ruta
│   │   ├── components/            # Componentes reutilizables
│   │   │   └── ui/                # Shadcn components (auto-generados)
│   │   ├── lib/
│   │   │   ├── hooks.ts           # TanStack Query hooks (useXxxQuery / useXxxMutation)
│   │   │   ├── api.ts             # Funciones fetch (wrapper sobre fetch + auth header)
│   │   │   ├── supabase.ts        # Cliente Supabase (solo para auth en frontend)
│   │   │   └── __gen__/api_v1.d.ts # Tipos auto-generados desde OpenAPI
│   │   ├── layout/AppLayout.tsx   # Layout principal (sidebar + topbar + NavUser)
│   │   └── types/api.ts           # Tipos manuales adicionales
│   └── public/favicon.svg
```

---

## Base de datos — tablas principales

### `organizations`
- `id`, `name`, `slug`, `bot_config` (jsonb)
- `bot_config`: `{ systemPrompt, keywords, receiptPendingMessage, receiptRejectedMessage, receiptConfirmedMessage }`
- **IA post-flujo** (columnas dedicadas, NO en bot_config):
  - `ai_enabled` (bool, default true) — activa/desactiva respuestas IA cuando el flujo ya terminó
  - `ai_provider` — proveedor elegido por el usuario: `"openai" | "gemini" | "anthropic" | "groq" | null`
  - `ai_api_key` — API key del usuario, encriptada con AES-256-GCM. **Nunca se devuelve al frontend** (solo se informa si está configurada)
  - `ai_model` — modelo específico (nullable, usa default del proveedor si null)
  - `ai_system_prompt` — prompt extra para respuestas post-flujo (override del systemPrompt de bot_config)
- **IMPORTANTE**: la IA de OCR (Gemini/Tesseract para comprobantes) es completamente independiente de estas columnas. Usa `GEMINI_API_KEY` del servidor, no la del usuario.
- Las variables de servidor `ANTHROPIC_API_KEY`, `GROQ_API_KEY`, `GROQ_MODEL`, `AI_PROVIDER` **no existen** — fueron eliminadas. La IA post-flujo usa exclusivamente la key de cada org. Si la org no tiene key configurada, el bot no responde con IA (no hay fallback al servidor).

### `flows`
- `id`, `organization_id`, `name`, `trigger_phrase`, `trigger_first_word`, `keywords[]`
- `no_match_behavior` ("trigger" | "ignore")
- `system_prompt` — prompt del asistente IA específico para este flujo (override del org)
- `message_overrides` (jsonb) — mensajes de pago por flujo: `{ receiptPendingMessage, receiptRejectedMessage, receiptConfirmedMessage }`
- `is_active`, `session_timeout_hours`
- Se edita vía RPC `upsert_flow_tree(payload jsonb)`

### `flow_steps` + `flow_step_messages`
- Pasos del flujo con mensajes (text, image, video, audio, document)

### `conversations`
- `id`, `organization_id`, `phone`, `stage` (text libre), `flow_id`, `flow_name` (desnormalizado)
- `whatsapp_instance_id`, `started_at`, `updated_at`
- `flow_name` se sincroniza via trigger `trg_sync_conversation_flow_name` cuando cambia `flows.name`
- **No hay enum para stage** — son strings libres

### Stages de conversación (valores usados en código)
```
saludo | catalogo | esperando_comprobante | confirmar_comprobante
pago_confirmado | comprobante_rechazado | comprobante_ilegible
comprobante_vencido | ayuda | interesado | flow_started
```
> Los stages mostrados en el filtro del frontend deben coincidir con los que realmente usa el backend

### `payments`
- `id`, `organization_id`, `phone`, `flow_id`, `whatsapp_instance_id`
- `amount`, `currency`, `receipt_date`, `receipt_url`
- `state`: `pending_manual_review | validated | rejected`
- `validated_at`
- `meta_message_id` — tiene constraint `UNIQUE` para deduplicar reintentos del webhook de Meta

### `ad_click_logs`
- Registra cada clic desde anuncio CTWA
- `organization_id`, `flow_id`, `phone`, `ctwa_clid`, `source_id`
- `ad_name`, `campaign_name`, `adset_name`, `campaign_id`, `adset_id` (enriquecidos via Meta Ads API)
- `headline`, `body`, `media_type`, `media_id`

### `whatsapp_instances`
- `id`, `organization_id`, `label`, `phone_number_id`, `meta_token`, `flow_id`

### `messages`
- `id`, `organization_id`, `conversation_id`, `phone`, `direction` (inbound/outbound)
- `message_type`, `content`, `meta_message_id`, `delivery_status`

### `memberships`
- `user_id`, `organization_id`, `role` (owner | admin | agent | viewer)

---

## API Backend — rutas principales (`/api`)

### Conversaciones
| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/conversations/filters` | Flows y anuncios disponibles para filtros (DEBE ir ANTES de `/{id}`) |
| GET | `/conversations` | Lista paginada. Params: `state, search, fromAd, adSourceId, flowId, page, pageSize, sortBy, sortDir` |
| GET | `/conversations/{id}` | Detalle + enriquecimiento `ad_source` |
| GET | `/conversations/{id}/messages` | Mensajes paginados |
| POST | `/conversations/{id}/messages` | Enviar mensaje |
| POST | `/conversations/{id}/upload` | Subir y enviar media |

### Pagos
| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/payments` | Lista paginada. Params: `state, flowId, instanceId, fromDate, toDate, page, pageSize` |
| PUT | `/payments/{id}/state` | Cambiar estado manualmente |

### Configuración Bot
| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/config/bot` | Obtener config del bot de la organización |
| PUT | `/config/bot` | Actualizar config (merge parcial) |

### Reportes
| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/reports/kpis` | KPIs principales |
| GET | `/reports/time-series` | Serie temporal de ventas |
| GET | `/reports/by-flow` | Ventas agrupadas por flujo |
| GET | `/reports/by-instance` | Ventas agrupadas por instancia |
| GET | `/reports/funnel` | Embudo de etapas de conversación |
| GET | `/reports/table` | Tabla detalle de pagos |

### Organización
| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/org/current` | Info de la org actual |
| PUT | `/org/current` | Actualizar nombre (owner/admin only) |
| GET | `/org/members` | Lista de miembros |
| POST | `/org/invites` | Crear invitación |
| DELETE | `/org/members/{userId}` | Remover miembro |

### Flujos
| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/flows` | Lista de flujos |
| GET | `/flows/{id}` | Detalle de flujo |
| POST | `/flows` | Crear flujo (vía RPC) |
| PUT | `/flows/{id}` | Actualizar flujo (vía RPC) |
| DELETE | `/flows/{id}` | Eliminar flujo |

---

## Frontend — páginas

| Ruta | Página | Descripción |
|------|--------|-------------|
| `/` | ResumenPage | KPIs del día |
| `/conversations` | ConversationsPage | Lista de conversaciones con filtros |
| `/conversations/:id` | ConversationDetailPage | Chat + modal de info del cliente |
| `/payments` | PaymentsPage | Pagos con filtros y badges de estado |
| `/reports` | ReportsPage | Gráficos y embudo |
| `/flows` | FlowsPage | Editor de flujos |
| `/media` | MediaPage | Librería de medios |
| `/templates` | TemplatesPage | Plantillas de mensajes |
| `/whatsapp` | WhatsAppPage | Gestión de instancias |
| `/organization` | OrganizationPage | Org + miembros + invitaciones |
| `/config` | ConfigPage | Configuración del bot (org-level) |
| `/guide` | GuidePage | Guía de inicio |

---

## Frontend — hooks principales (`dashboard/src/lib/hooks.ts`)

```ts
useConversationsQuery(params)       // GET /conversations
useConversationQuery(id)            // GET /conversations/{id}
useConversationFiltersQuery()       // GET /conversations/filters
useConversationMessagesQuery(id)    // GET /conversations/{id}/messages
useSendMessageMutation()            // POST /conversations/{id}/messages
usePaymentsQuery(params)            // GET /payments
useBotConfigQuery()                 // GET /config/bot
useUpdateBotConfigMutation()        // PUT /config/bot
useCurrentOrgQuery()                // GET /org/current
useUpdateOrgMutation()              // PUT /org/current
useSupabaseUser()                   // supabase.auth.getUser() — avatar, nombre
useFlowsQuery()                     // GET /flows
```

---

## Lógica del bot (webhook → respuesta)

1. `webhook/handler.ts` recibe mensaje WhatsApp
2. Identifica instancia → organización → flujo asignado
3. Si hay referral CTWA → `logAdClick` → busca flujo por `ctwa_clid`
4. Verifica si sesión expiró (`session_timeout_hours`) o si es nuevo
5. Si `shouldStartFlow` → `startAssignedFlow` (flowEngine)
6. Si no → `classify` → maneja según stage (texto AI, imagen → OCR, etc.)
7. `receipts/handler.ts`: detecta comprobante → OCR → valida → mensaje de respuesta
   - Mensajes de respuesta: primero busca `flows.message_overrides`, luego `organizations.bot_config`, luego defaults hardcoded
   - OCR usa Gemini como primario (`GEMINI_API_KEY` + `GEMINI_OCR_MODEL`) y Tesseract como fallback
   - La fecha/hora del comprobante se interpreta en la zona horaria de la divisa (`CURRENCY_UTC_OFFSET` en `receipts/ocr.ts`)
   - Ventana de validez: 24h si Gemini extrae hora exacta, 36h si solo extrae fecha (tolerancia de zona horaria)

---

## Generación de tipos

Después de cambiar rutas en `backend/src/api/dashboard.ts`:
```bash
cd dashboard && bun run generate:api
```
Esto actualiza `dashboard/src/lib/__gen__/api_v1.d.ts`.

---

## Migraciones SQL

Están en `backend/scripts/sql/`. Se ejecutan manualmente en Supabase Studio (SQL editor).
Formato: `YYYYMMDD_descripcion.sql`

---

## Comandos útiles

```bash
# Backend
cd backend && bun run dev

# Frontend
cd dashboard && bun run dev

# Build frontend (ver errores TypeScript)
cd dashboard && bun run build

# Generar tipos OpenAPI → TypeScript
cd dashboard && bun run generate:api

# Instalar componente Shadcn
cd dashboard && bunx shadcn@latest add <component>
```

---

## Convenciones de código

- **Backend**: OpenAPI-first con `createRoute` + Zod schemas. Siempre validar con `.valid("query")` / `.valid("json")`.
- **Frontend**: TanStack Query para todo el estado del servidor. Invalidar queries tras mutaciones con `queryClient.invalidateQueries`.
- **Auth**: Header `Authorization: Bearer <token>` en todas las rutas. El token es el JWT de Supabase Auth.
- **Multi-tenant**: Todas las queries filtran por `organization_id` via `orgId(c)` en el backend.
- **RLS**: Todas las tablas tienen RLS habilitado. La función `is_org_member_or_platform_admin(org_id)` es la política base.
- **Rutas**: Registrar rutas específicas ANTES de las genéricas con parámetros (ej: `/conversations/filters` antes de `/conversations/{id}`).

---

## Notas importantes

- `flow_name` en `conversations` es desnormalizado (trigger lo mantiene sincronizado).
- Los stages de conversación son strings libres — no hay enum en DB.
- `message_overrides` en `flows` sobreescribe los mensajes de pago del bot a nivel de flujo.
- `system_prompt` en `flows` sobreescribe el system prompt del asistente IA para ese flujo.
- La config del bot global está en `organizations.bot_config` (jsonb).
- No se guardan nombres de contactos de Meta — solo el número de teléfono.
- El avatar/nombre del usuario viene de `user_metadata` de Supabase Auth (Google OAuth).
