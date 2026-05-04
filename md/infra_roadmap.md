# Infrastructure Roadmap

## Estado actual (abril 2026)

| Servicio | Stack | Costo | Estado |
|---------|-------|-------|--------|
| Base de datos | Supabase Pro (PostgreSQL + Auth + RLS) | $25/mes | ✅ Activo |
| Cache / Cola | Upstash Redis PAYG | ~$13/mes | ✅ Activo |
| Storage multimedia | Cloudflare R2 | ~$0.50/mes | ✅ Migrado |
| Backend | Railway | ~$15/mes | ✅ Activo |
| Frontend | Railway/Vercel | ~$0/mes | ✅ Activo |

---

## Migraciones completadas

### Redis Queue (scheduled messages)
**Problema resuelto:** `scheduled_flow_messages` acumulaba 156K seq_scans/día con 1 usuario.  
**Solución:** Redis Sorted Set como cola principal; tabla queda solo como auditoría.

**Fases:**
- ✅ **Fase 0** — Índice + limpieza de historial en Supabase
- ✅ **Fase 1** — Dual-write: Redis + DB en paralelo. Cron DB solo procesa filas sin `redis_job_id`
- ✅ **Fase 2** — Cutover: cron DB deshabilitado. Cron corre solo el worker Redis
- ✅ **Fase 3** — Cleanup: `processDatabaseScheduledMessages()` eliminado del código, bloques legacy removidos de `cancelJobsForPhone` y `hasPendingJobs`. SQL en `20260424_redis_cutover_cleanup.sql` (pendiente ejecutar en Supabase Studio)

**SQL para verificar antes de Fase 2:**
```sql
SELECT count(*) FROM scheduled_flow_messages
WHERE status = 'pending' AND redis_job_id IS NULL;
-- Debe ser 0
```

**Código a modificar para Fase 2** (`backend/src/index.ts`):
```typescript
// Comentar/eliminar esta línea:
registerScheduledMessagesCron();
```

### Cloudflare R2 (multimedia)
**Problema resuelto:** Egress de Supabase Storage crece con el volumen de fotos de comprobantes.  
**Solución:** R2 no cobra egress.
- ✅ Migrado en producción

---

## Próximas migraciones

### Redis propio en Railway
**Cuándo activar:** ~2,500 conversaciones/día  
**Ahorro:** ~$142/mes a 5K conv/día (tarifa fija ~$10 vs Upstash PAYG por comando)  
**Complejidad:** Muy baja — solo cambiar `REDIS_URL` en Railway

**Pasos:**
1. Provisionar Redis/Valkey en Railway (Add Service → Database → Redis)
2. Cambiar variable de entorno `REDIS_URL` en el servicio backend
3. Redeploy — sin cambios de código

---

### Neon.tech (PostgreSQL)
**Cuándo activar:** ~10,000 conversaciones/día  
**Ahorro:** ~$30-200+/mes según escala (serverless vs compute fijo de Supabase)  
**Complejidad:** Media — migración de datos + cambio de cliente

**Estrategia:** Mantener Supabase Free solo para Auth (50K MAU gratis). Migrar solo el DB a Neon.

**Pasos:**
1. Crear proyecto en Neon (Pro plan: $19/mes)
2. `pg_dump` desde Supabase → `pg_restore` en Neon
   ```bash
   pg_dump "$(supabase_connection_string)" | pg_restore -d "$(neon_connection_string)"
   ```
3. Migrar RLS policies (son PostgreSQL nativo, funcionan igual en Neon)
4. Cambiar cliente DB en `backend/src/db/supabase.ts`:
   ```typescript
   // Antes: @supabase/supabase-js (PostgREST)
   // Después: postgres.js con PgBouncer de Neon (puerto 5432 pooled)
   import postgres from "postgres";
   export const sql = postgres(env.DATABASE_URL, { max: 10 });
   ```
5. Actualizar queries del bot a SQL directo (reemplazar `.from(...).select(...)`)
6. Mantener Supabase client solo para Auth (`supabase.auth.*`)
7. Actualizar `DATABASE_URL` en Railway → redeploy

**Variables de entorno a agregar:**
```
DATABASE_URL=postgres://...@...neon.tech/neondb?sslmode=require
```

**Ventajas de Neon:**
- Autoscale: DB suspende cuando no hay tráfico → sin costo idle
- Branching: `neon branches create` para staging/PR previews
- No cobra bandwidth
- Mismo PostgreSQL (RLS, funciones, extensiones idénticas)

---

### Conexión directa PostgreSQL via PgBouncer (Supabase)
**Cuándo activar:** Antes de Neon, cuando el plan Pro empiece a generar API request overages  
**Ahorro:** Evita $5/millón de requests de PostgREST  
**Complejidad:** Baja-Media

**Pasos:**
1. Usar el puerto 6543 (transaction mode) de Supabase con `postgres.js`:
   ```typescript
   // backend/src/db/postgres.ts
   import postgres from "postgres";
   export const sql = postgres(env.DATABASE_URL_DIRECT, { max: 10, idle_timeout: 20 });
   // DATABASE_URL_DIRECT = postgres://postgres.[ref]:[password]@aws-0-[region].pooler.supabase.com:6543/postgres
   ```
2. Migrar gradualmente las queries más frecuentes del bot engine

---

## Proyección de costos

| Conv/día | Redis (propio) | Supabase/Neon + Auth | R2 | Railway | **Total** |
|----------|---------------|---------------------|-----|---------|-----------|
| 386 (hoy) | $13 (Upstash) | $25 (Supabase) | $0.50 | $15 | **~$54** |
| 2,500 | $10 (Railway) | $25 (Supabase) | $1 | $20 | **~$56** |
| 10,000 | $10 | $25 (Supabase+direct pg) | $2 | $50 | **~$87** |
| 10,000* | $10 | $19 (Neon) + $0 (Auth free) | $2 | $50 | **~$81** |
| 50,000* | $15 | $25 (Neon) + $0 (Auth free) | $5 | $100 | **~$145** |

*Con Neon migrado

---

## Checklist de validación Redis (completado)

- [x] Paso 1 (delay 0) se envía inmediatamente al iniciar flujo
- [x] Paso 2+ llegan en el tiempo configurado (±2s)
- [x] Delays acumulativos correctos (paso 3 = delay1 + delay2)
- [x] Al reiniciar flujo, mensajes pendientes del flujo anterior no llegan
- [x] Al recibir comprobante, mensajes pendientes se cancelan
- [x] `flowIsInProgress` impide reiniciar flujo mid-delivery
- [x] Con dos instancias paralelas no se duplican mensajes (ZPOPMIN es atómico)
- [x] Conversación pasa a `flujo_terminado` al completarse todos los pasos
- [ ] Seq scans en `scheduled_flow_messages` bajaron a < 100/día (verificar en Supabase después de deploy)

## Pendiente post-deploy

- [ ] Ejecutar `20260424_redis_cutover_cleanup.sql` en Supabase Studio (drop función, drop índice, setup pg_cron cleanup)
- [ ] Verificar seq scans bajos en Supabase Dashboard → Database → Query Performance
