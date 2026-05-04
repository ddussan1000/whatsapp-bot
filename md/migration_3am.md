# Guía de Migración 3AM — Railway Redis + Nueva Cuenta Railway

> **Duración estimada:** 15-20 minutos | **Downtime esperado:** ~2 minutos (solo el tiempo de redeploy)

---

## Parte 1 — Upstash Redis → Railway Redis

### Prerrequisitos
- Acceso a la nueva cuenta Railway Pro
- Acceso al dashboard de Railway actual
- `REDIS_URL` actual de Upstash disponible

### Paso 1 — Provisionar Redis en Railway

1. En la nueva cuenta Railway: **New Project** → **Add Service** → **Database** → **Redis** (o **Valkey**)
2. Esperar que levante (~30 segundos)
3. Ir al servicio Redis → **Variables** → copiar `REDIS_URL`  
   Formato: `redis://default:PASSWORD@roundhouse.proxy.rlwy.net:PORT`

### Paso 2 — Migrar datos de Upstash a Railway Redis

```bash
# Ejecutar desde local con las dos URLs:
SOURCE_REDIS_URL="rediss://default:TOKEN@HOST.upstash.io:6380" \
DEST_REDIS_URL="redis://default:PASSWORD@roundhouse.proxy.rlwy.net:PORT" \
bun run backend/scripts/migrate-redis.ts
```

**El script migra:**
- `sched:queue` — jobs pendientes de envío (CRÍTICO)
- `sched:job:*` — payloads de cada job
- `sched:phone:*` — mapping teléfono → jobs activos
- `conv:*` — estado de conversaciones activas

**Verificar output:**
```
✓ sched:queue coincide en SOURCE y DEST
```
Si difieren por pocos jobs es normal (jobs procesados durante la migración).

### Paso 3 — Actualizar variable de entorno en Railway

En el servicio backend (cuenta actual o nueva):
```
REDIS_URL = redis://default:PASSWORD@roundhouse.proxy.rlwy.net:PORT
```
**No cambiar nada más todavía.**

### Paso 4 — Redeploy y verificar

1. Redeploy del backend
2. Enviar un mensaje de prueba al bot → verificar que responde
3. Verificar en Railway Redis que aparecen keys nuevas (`conv:*`, `sched:*`)
4. Esperar 10 minutos y confirmar que los flujos programados siguen llegando

### Paso 5 — Apagar Upstash (después de 24h)

Una vez confirmado que todo funciona con Railway Redis, cancelar el plan Upstash.

---

## Parte 2 — Cambiar cuenta de Railway

### Opción A: Transferir proyecto (recomendado)

Railway soporta transferencia de proyectos entre cuentas:

1. En la cuenta actual → Settings del proyecto → **Transfer Project**
2. Ingresar el email de la nueva cuenta
3. Aceptar en la nueva cuenta
4. Todas las env vars, servicios y dominios se mantienen

### Opción B: Redeploy desde cero (si Transfer no está disponible)

#### 1. Copiar todas las variables de entorno

En la cuenta actual, backend → Variables → copiar TODAS:
```
PORT
SUPABASE_URL
SUPABASE_KEY
SUPABASE_SERVICE_ROLE_KEY
ENCRYPTION_KEY
GEMINI_API_KEY
REDIS_URL              ← ya es el nuevo Railway Redis
REDIS_ENABLED=true
ALLOWED_ORIGINS
PUBLIC_BASE_URL
DASHBOARD_PUBLIC_URL
R2_ACCOUNT_ID
R2_ACCESS_KEY_ID
R2_SECRET_ACCESS_KEY
R2_BUCKET_NAME
R2_PUBLIC_URL
STORAGE_MODE=r2
RESEND_API_KEY
RESEND_FROM_EMAIL
ADMIN_PHONE
TELEGRAM_BOT_TOKEN
TELEGRAM_CHAT_ID
DASHBOARD_SECRET
DATABASE_URL_DIRECT    ← (ver Parte 3 si ya lo tienes)
```

#### 2. Crear nuevo servicio en nueva cuenta

1. **New Project** → **Deploy from GitHub** → seleccionar el repo
2. **Root directory:** `backend`
3. **Start command:** `bun run src/index.ts`
4. Pegar todas las variables de entorno
5. Deploy

#### 3. Actualizar dominio/URL

- Si usas dominio custom: actualizar DNS para apuntar al nuevo servicio Railway
- Si usas `*.up.railway.app`: el URL cambiará. Actualizar en:
  - Meta Webhook URL (WhatsApp Business Manager)
  - `PUBLIC_BASE_URL` env var
  - `ALLOWED_ORIGINS` en el frontend si aplica

#### 4. Actualizar Meta Webhook (crítico)

1. **Meta Business Suite** → **WhatsApp** → **Configuration** → **Webhook**
2. Cambiar Callback URL al nuevo dominio
3. Verificar que el webhook pasa la verificación (GET /webhook)
4. Enviar mensaje de prueba

#### 5. Teardown cuenta antigua

Solo después de confirmar que todo funciona en la nueva cuenta (esperar 30 minutos mínimo).

---

## Parte 3 — Activar PgBouncer (conexión directa a Supabase)

Esto activa la **Fase 3** (ya está implementada en el código, solo necesita el env var).

### Obtener el connection string

1. **Supabase Dashboard** → Settings → Database → **Connection pooling**
2. Seleccionar **Transaction mode** (puerto **6543**)
3. Copiar el connection string:
   ```
   postgresql://postgres.[ref]:[password]@aws-0-[region].pooler.supabase.com:6543/postgres
   ```

### Agregar env var

En Railway (nueva cuenta):
```
DATABASE_URL_DIRECT = postgresql://postgres.[ref]:[pass]@aws-0-[region].pooler.supabase.com:6543/postgres
```

### Verificar

Al hacer redeploy, el backend loguea:
```
postgres.js: conexión directa PgBouncer activa
```

Los `upsertConversation` e `insertMessageLog` (las 2 queries más frecuentes del bot) ahora van directo a PostgreSQL sin pasar por PostgREST.

---

## Checklist final

- [ ] Railway Redis con datos migrados
- [ ] Backend usando `REDIS_URL` nuevo (redeploy ok)
- [ ] Flujos programados llegando correctamente
- [ ] Meta Webhook URL actualizado (si cambió el dominio)
- [ ] `DATABASE_URL_DIRECT` configurado (Fase 3 activa)
- [ ] Upstash cancelado (después de 24h de estabilidad)
- [ ] Cuenta Railway antigua dada de baja
