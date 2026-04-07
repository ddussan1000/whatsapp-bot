# Contexto del proyecto: WhatsApp Bot + Dashboard multitenant

Documento de referencia para entender **qué hace el sistema**, **cómo está organizado** y **cómo encajan autenticación, datos y WhatsApp**.

---

## Visión general

El repositorio es una **plataforma de ventas y soporte por WhatsApp** orientada a **varios clientes (empresas)**. Cada empresa tiene su propia **organización**, datos aislados por `organization_id` y puede configurar **campañas**, **flujos**, **plantillas**, **productos** e **instancias** de WhatsApp (Cloud API de Meta).

Hay dos piezas principales:

| Carpeta | Rol |
|--------|-----|
| `backend/` | Servidor HTTP (Bun + Hono): webhook de WhatsApp, API REST del dashboard, cron, integración con Supabase, Redis, OCR de comprobantes, etc. |
| `dashboard/` | SPA (React + Vite): panel web para clientes y administración de plataforma. |

El nombre del servicio expuesto en la API raíz es `whatsapp-bot` (ver `backend/src/index.ts`).

---

## Flujo de WhatsApp (Cloud API)

1. **Meta** envía eventos al endpoint `POST /webhook` (y la verificación del challenge en `GET /webhook` con `VERIFY_TOKEN`).
2. El handler (`backend/src/webhook/handler.ts`) identifica la **instancia** de WhatsApp por `phone_number_id` del payload y obtiene el **`organization_id`** asociado. Si no hay instancia activa, el evento se ignora de forma segura.
3. Se procesan **actualizaciones de estado** de mensajes (entregado, leído, etc.) y se actualiza el log en base de datos.
4. Para **mensajes entrantes**: se mantiene **estado de conversación** en **Redis** (teléfono + `phone_number_id`), se hace **upsert** de la conversación en Supabase, se registra el mensaje y se clasifica el tipo de interacción.
5. Según el tipo (**saludo**, **productos**, **pago**, **comprobante**, etc.) se ejecuta un **flujo** (`backend/src/bot/flows.ts`) o el **manejador de comprobantes** (`backend/src/receipts/handler.ts`) con posible **OCR** (Tesseract u otro proveedor según env).
6. Las respuestas salen por **`backend/src/bot/sender.ts`** hacia la API de Meta, con registro de contexto (organización, conversación, producto, instancia).

**Productos y campañas**: el sistema puede enlazar conversaciones con **productos** (por texto, CTWA `ctwa_clid`, etc.) y **campañas** derivadas del producto. La lógica de catálogo y keywords está en `backend/src/db/products.ts` y módulos relacionados.

**Clasificación**: `backend/src/bot/classifier.ts` decide qué “tipo” de paso ejecutar (p. ej. recibo vs flujo normal).

**IA post-flujo**: `backend/src/ai/assistant.ts` — usa la API key y proveedor configurados por cada organización (OpenAI, Gemini, Anthropic, Groq). Si la org no tiene key configurada, el bot no responde con IA. No hay fallback al servidor.

---

## Multitenancy (clientes / empresas)

- **`organizations`**: empresa (slug, nombre).
- **`organization_members`**: vínculo usuario Supabase ↔ organización con **rol** (`owner`, `admin`, `agent`, `viewer`).
- **`organization_invites`**: invitaciones por email con token (flujo de equipo dentro del dashboard).
- Tablas de negocio (`conversations`, `messages`, `payments`, `campaigns`, …) llevan **`organization_id`** (y muchas veces `campaign_id`) para aislar datos.

Los scripts SQL evolutivos están en `backend/scripts/sql/`:

- **`20260330_multitenant_full_bootstrap.sql`**: núcleo multitenant, campañas, flujos, plantillas, enlaces a conversaciones/mensajes/pagos, etc.
- **`20260330_products_and_instances.sql`**: instancias de WhatsApp por org, productos, referrals, relación producto–campaña.
- **`20260330_platform_admin.sql`**: dueños de plataforma y allowlist de primer acceso.

Convención: ejecutar en orden coherente con las dependencias entre tablas (bootstrap → productos/instancias → platform admin si aplica).

---

## Autenticación del dashboard

- El **frontend** usa **Supabase Auth** (sesión en el cliente) y envía `Authorization: Bearer <access_token>` a la API (`dashboard/src/lib/api.ts`).
- Variable opcional **`VITE_DASHBOARD_TOKEN`**: puede usarse como Bearer fijo cuando no hay sesión Supabase (desarrollo o integraciones).
- El backend resuelve la sesión en `backend/src/api/authContext.ts` (`resolveSession`):

  - Valida el JWT con **Supabase** (`supabase.auth.getUser(token)`).
  - **`DASHBOARD_SECRET`**: si el token coincide, se usa un modo especial que toma la **primera membresía** de `organization_members` (usuario sintético `dashboard-secret`) — pensado para scripts o entornos controlados, no para usuarios finales.

- **Cabecera `X-Organization-Id`**: si el usuario es **administrador de plataforma** (`platform_admins`), puede **actuar como** esa organización y recibir `organizationId` + rol efectivo `owner` para las rutas **tenant** del API. Sin esta cabecera, un platform admin sin membresía tiene `organizationId: null` y las rutas que exigen tenant responden pidiendo selección de organización.

- **Allowlist de primer login** (`organization_signup_allowlist`): si un email está autorizado y aún no es miembro, en el primer login válido se **inserta** en `organization_members` y se **elimina** la fila de la allowlist (onboarding sin registro público).

---

## Administración de plataforma (`/admin`)

- Tabla **`platform_admins`**: emails (en práctica **minúsculas** al comparar) insertados **manualmente** en base de datos. Esos usuarios tienen `isPlatformAdmin: true` en sesión.
- Rutas API bajo **`/api/admin/*`**: protegidas por middleware que exige `isPlatformAdmin` (ver `backend/src/api/dashboard.ts` y `backend/src/api/adminRoutes.ts`): listado/creación/edición de **organizaciones**, gestión de **allowlist** por organización.
- En el **dashboard**, la ruta **`/admin`** está envuelta en `AuthGuard` + `AdminGuard` y usa `AdminLayout` / `AdminPage` (`dashboard/src/App.tsx`). Todo lo que cuelgue de `/admin` está pensado solo para dueños de la plataforma.
- Enlace “Plataforma” (u similar) en la UI principal cuando la sesión indica `isPlatformAdmin` (`AppLayout`).

Los clientes finales **no se autoregistran** en un flujo público típico: el dueño de la plataforma **crea la empresa** y **añade emails** a la allowlist para que el primer acceso (Google, magic link, etc.) provisione la membresía.

---

## API REST del dashboard (`/api`)

- Montada en `app.route("/api", dashboardApi)` (`backend/src/index.ts`).
- Tras autenticación global, el middleware distingue:
  - **`/api/auth/session`**: información de sesión (incluye `organizationId` nullable e `isPlatformAdmin`).
  - **`/api/admin/*`**: solo platform admins.
  - **Resto**: exige **organización** en sesión; los platform admins sin org deben enviar **`X-Organization-Id`** (o tener membresía por defecto).

Incluye (entre otras) estadísticas, conversaciones, pagos, informes, configuración de bot, **organización** (invites, miembros), **campañas**, **flujos**, **plantillas**, **instancias** WhatsApp, **productos**, **referrals**, subida de medios, envío de mensajes, etc. La documentación OpenAPI se expone en **`/openapi.json`** y la UI en **`/docs`**.

El cliente TypeScript puede regenerar tipos con `npm run generate:api` / `generate:api:file` en `dashboard/` apuntando al `openapi.json` del backend.

---

## Dashboard (frontend)

- **React Router** (`dashboard/src/App.tsx`): rutas públicas de login; área autenticada con layout principal; **`/admin`** separada.
- **TanStack Query**, **sonner** (toasts), componentes estilo **shadcn**, **Tailwind**.
- **`active_organization_id`** en `localStorage` (clave `ACTIVE_ORG_KEY` en `api.ts`) para enviar `X-Organization-Id` cuando el usuario es platform admin o tiene varias membresías (según evolucione la UI).

Páginas típicas: inicio, conversaciones (y detalle), pagos, informes, configuración, organización, campañas, flujos, plantillas, instancias, productos, referrals, instrucciones, **admin de plataforma**.

---

## Otros servicios backend

- **Redis** (`backend/src/cache/redis.ts`, `REDIS_ENABLED`, `REDIS_URL`): estado por usuario/teléfono para el bot. Si Redis no está activo, el comportamiento debe revisarse según implementación actual.
- **Cron** (`backend/src/cron/dailyReport.ts`): reporte diario por WhatsApp al **`ADMIN_PHONE`** (resumen de pagos del día). Zona horaria `America/Bogota`.
- **Alertas Telegram** (`backend/src/alerts/telegram.ts`): notificaciones ante errores críticos del webhook (entre otros usos).
- **Almacenamiento de medios** (`STORAGE_MODE`: `local` | `supabase`) y **OCR** de comprobantes (`OCR_PROVIDER`: `auto` | `gemini` | `tesseract`). OCR usa Gemini Vision como primario con validación de fecha/hora timezone-aware según la divisa del comprobante.

---

## Variables de entorno relevantes (backend)

Definidas y validadas en `backend/src/config/env.ts` (resumen):

- **Servidor**: `PORT`, `LOG_LEVEL`, `ALLOWED_ORIGINS`
- **Supabase**: `SUPABASE_URL`, `SUPABASE_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `ENCRYPTION_KEY` (AES-256 para API keys de orgs)
- **OCR** (única IA del servidor): `GEMINI_API_KEY`, `GEMINI_OCR_MODEL` (default: `gemini-2.5-flash-lite`), `OCR_PROVIDER`
- **Redis**: `REDIS_URL`, `REDIS_ENABLED`
- **Operaciones**: `ADMIN_PHONE`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`
- **Dashboard**: `DASHBOARD_SECRET`, `DASHBOARD_PUBLIC_URL`
- **Medios**: `STORAGE_MODE`, `SUPABASE_STORAGE_BUCKET_RECEIPTS`, `SUPABASE_STORAGE_BUCKET_FLOW_MEDIA`, `RECEIPT_RETENTION_DAYS`
- **Eliminadas** (no usar): `META_TOKEN`, `META_PHONE_ID`, `VERIFY_TOKEN`, `ANTHROPIC_API_KEY`, `GROQ_API_KEY`, `GROQ_MODEL`, `AI_PROVIDER` — las credenciales de Meta son por instancia en DB; la IA post-flujo es por organización en DB

El **dashboard** usa al menos `VITE_API_URL`, `VITE_SUPABASE_*` y opcionalmente `VITE_DASHBOARD_TOKEN` (según `.env` del proyecto).

---

## Cómo ejecutar (referencia)

- **Backend**: en `backend/`, `bun install` y `bun run dev` (o `bun run start`). Typecheck: `bun run check`.
- **Dashboard**: en `dashboard/`, `bun install` / `npm install`, `bun run dev` o `npm run dev`, build con `bun run build`.

El webhook de Meta debe apuntar a la URL pública HTTPS del backend (`/webhook`).

---

## Resumen en una frase

**Un backend Hono/Bun recibe WhatsApp, aísla por organización e instancia, ejecuta flujos y validación de pagos; Supabase guarda el modelo multitenant; un dashboard React gestiona cada cliente; y un rol “dueño de plataforma” gobierna empresas y allowlist vía `/admin` y tablas dedicadas.**

---

*Última actualización alineada con el código del repo (rutas, SQL y módulos citados). Si añades features nuevas, conviene actualizar este archivo en el mismo commit.*
