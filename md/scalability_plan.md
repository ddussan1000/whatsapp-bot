# Plan de Escalabilidad — Arquitectura WhatsApp Bot Platform

> **Fecha:** Abril 2026 | **Contexto:** 1 organización, ~386 conv/día, ya generando IO pressure en Supabase Pro

---

## Diagnóstico: por qué ya tenemos problemas con poco volumen

Con un solo cliente a 386 conv/día ya agotamos el Disk IO budget de Supabase. El problema no es el volumen — es que el stack actual tiene **ineficiencias que se amplifican** a cualquier escala:

### Bottlenecks críticos encontrados (con código)

| # | Problema | Archivo | Frecuencia | Impacto |
|---|----------|---------|-----------|---------|
| 1 | **Full flow con todos los steps se fetchea desde DB en cada activación de flujo** | `bot/flowEngine.ts:56-78` | 10-40% de mensajes | Query nested costosa sin cache |
| 2 | **Conversation state se consulta a Supabase en cada mensaje** | `webhook/handler.ts:209-216` | 100% de mensajes | ~3000 queries/hr innecesarias |
| 3 | **Org AI config no tiene cache** | `db/organizations.ts:11-39` | Cada flujo IA | Supabase hit en lugar de Redis |
| 4 | **Webhook procesa todo sincrónicamente** | `webhook/handler.ts` entero | 100% de mensajes | Si Meta envía 100 msg/s, fallamos |
| 5 | **Crons sin distributed lock** | `index.ts:89-92` | Siempre | En multi-instancia: duplicados |
| 6 | **Instance lookup duplicado en sender** | `bot/sender.ts:25` | Cada mensaje enviado | Double-fetch que ya se hizo en handler |

### Qué pasa cuando escalamos sin arreglar esto

```
386 conv/día   → IO budget depleted (YA OCURRIÓ)
2,000 conv/día → Meta empieza a recibir timeouts del webhook (duplica mensajes)
5,000 conv/día → Supabase compute se satura, latencia > 5s en respuestas
10,000 conv/día → Sistema no responde bajo carga sostenida
```

---

## Arquitectura objetivo

```
┌─────────────┐     ┌──────────────────────────────────────────────────────┐
│   Meta API  │────▶│  Railway Backend                                      │
└─────────────┘     │                                                       │
                    │  ┌─────────────┐    ┌──────────────────────────────┐  │
                    │  │  Webhook    │───▶│  Redis Queue (BullMQ)        │  │
                    │  │  Receiver   │    │  - msg:process               │  │
                    │  │  (ACK < 1s) │    │  - sched:queue (ya existe)   │  │
                    │  └─────────────┘    └──────────────┬───────────────┘  │
                    │                                    │                  │
                    │  ┌─────────────────────────────────▼───────────────┐  │
                    │  │  Workers (escalable horizontalmente)            │  │
                    │  │  - processMessage()                             │  │
                    │  │  - AI calls (async)                             │  │
                    │  └────────────────────────────┬────────────────────┘  │
                    │                               │                       │
                    │  ┌────────────────────────────▼────────────────────┐  │
                    │  │  Dashboard API (Hono routes)                    │  │
                    │  └────────────────────────────────────────────────┘  │
                    └──────────────────────────────────────────────────────┘
                                     │                    │
                    ┌────────────────▼───┐    ┌──────────▼──────────────────┐
                    │  Railway Redis     │    │  Neon.tech (PostgreSQL)     │
                    │  - Conversation    │    │  + Supabase Auth (gratis)   │
                    │    state cache     │    │                             │
                    │  - Flow cache      │    │                             │
                    │  - Job queues      │    │                             │
                    │  - Rate limiting   │    │                             │
                    └────────────────────┘    └─────────────────────────────┘
```

---

## Fases

### Fase 1 — Cache fixes (código, sin migración de infra)
**Cuándo:** Ahora mismo | **Costo adicional:** $0 | **Tiempo:** 1-2 días

Estos cambios alivian el IO de Supabase inmediatamente con el stack actual.

#### 1a. Cachear full flow con steps en Redis
```typescript
// bot/flowEngine.ts — getFullFlow() actualmente NO cachea steps
// Agregar cache con TTL 1 hora:
const FLOW_FULL_TTL = 3600;
const fullFlowKey = (flowId: string) => `flow:full:${flowId}`;

export async function getFullFlow(flowId: string) {
  const cached = await getCached<FullFlow>(fullFlowKey(flowId));
  if (cached) return cached;
  
  const flow = await supabase.from("flows")
    .select(`*, flow_steps(*, flow_step_messages(*))`)
    .eq("id", flowId)
    .single();
  
  if (flow.data) await setCached(fullFlowKey(flowId), flow.data, FLOW_FULL_TTL);
  return flow.data;
}
```
**Impacto:** Elimina la query nested más costosa. Invalida cache en `PUT /flows/:id`.

#### 1b. Cachear conversation state en Redis
```typescript
// webhook/handler.ts:209-216 — fetch de Supabase en cada mensaje
// Agregar cache corto (5 min TTL es suficiente):
const CONV_CACHE_TTL = 300;
const convKey = (orgId: string, phone: string) => `conv:${orgId}:${phone}`;

// En getConversationByPhone() — cachear el resultado
// Invalidar en upsertConversation()
```
**Impacto:** ~3000 Supabase queries/hr → 0 (cache hits la mayoría).

#### 1c. Cachear org AI config
```typescript
// db/organizations.ts — getOrgAiConfig() sin cache actualmente
const ORG_CONFIG_TTL = 3600; // 1 hora — rara vez cambia
const orgConfigKey = (orgId: string) => `org:config:${orgId}`;
```
**Impacto:** Elimina fetch de Supabase en cada respuesta IA.

#### 1d. Pasar instance como contexto en sender
```typescript
// bot/sender.ts:25 — re-fetches instance que ya tenemos en handler
// Cambiar firma para aceptar instance como parámetro opcional
// Evita double-fetch en el path crítico
```

#### 1e. Railway Redis (ya planeado)
Cambiar `REDIS_URL` en Railway. 5 minutos. $10/mes fijo vs Upstash PAYG.

---

### Fase 2 — Async webhook processing
**Cuándo:** ~1,500 conv/día O cuando Meta empiece a reportar timeouts | **Costo adicional:** $0 (usa Redis existente) | **Tiempo:** 2-3 días

Este es el cambio arquitectónico más importante. Actualmente el webhook procesa todo sincrónicamente — una IA lenta o un Supabase bajo presión hace que Meta espere y reintente (duplica mensajes).

#### Arquitectura actual (problema):
```
Meta → POST /webhook → [procesar todo: 500-3000ms] → 200 OK
        ↑ Si esto tarda > 5s, Meta reintenta → mensajes duplicados
```

#### Arquitectura nueva:
```
Meta → POST /webhook → [validar firma, push a queue] → 200 OK (< 100ms)
                              ↓
                        Worker picks up job
                              ↓
                        [procesar: sin límite de tiempo]
```

#### Implementación con BullMQ:
```typescript
// backend/src/queue/messageQueue.ts (nuevo)
import { Queue, Worker } from "bullmq";

export const messageQueue = new Queue("msg:process", { connection: redis });

// En webhook/handler.ts — reemplazar procesamiento directo:
await messageQueue.add("process", {
  orgId, phone, message, instanceId, ...
}, { removeOnComplete: true });
return c.text("ok"); // < 100ms always

// backend/src/workers/messageWorker.ts (nuevo)
new Worker("msg:process", async (job) => {
  await processMessage(job.data); // toda la lógica actual aquí
}, { connection: redis, concurrency: 10 });
```

**BullMQ** ya está disponible con Railway Redis, cero costo adicional. La lógica de `processMessage` es literalmente el cuerpo actual de `webhook/handler.ts`.

#### Distributed cron lock (necesario para multi-instancia):
```typescript
// Para que el cron de processScheduledMessages no duplique al escalar:
const lockKey = "cron:lock:scheduled-messages";
const lock = await redis.set(lockKey, instanceId, "NX", "EX", 3);
if (!lock) return; // otro worker está procesando
```

---

### Fase 3 — Direct PostgreSQL (PgBouncer)
**Cuándo:** Cuando las queries dashboard sean lentas O Supabase compute empiece a ser el cuello | **Costo adicional:** $0 (usa Supabase existente) | **Tiempo:** 3-5 días

Supabase expone dos endpoints:
- **PostgREST** (puerto 443): overhead HTTP, usado actualmente para todo
- **PgBouncer** (puerto 6543): conexión directa a PostgreSQL, ~3x más rápido para writes/reads frecuentes

Las queries del bot engine son el 80% del volumen. Migrarlas a `postgres.js` directo.

```typescript
// backend/src/db/postgres.ts (nuevo)
import postgres from "postgres";

export const sql = postgres(env.DATABASE_URL_DIRECT, {
  max: 10,                // pool size
  idle_timeout: 20,       // cerrar conexiones idle
  connect_timeout: 10,
});

// DATABASE_URL_DIRECT = postgres://postgres.[ref]:[pass]@aws-0-[region].pooler.supabase.com:6543/postgres
```

**Queries a migrar primero** (mayor frecuencia):
1. `upsertConversation()` — 100% de mensajes
2. `insertMessageLog()` — 100% de mensajes
3. `getActiveInstanceByPhoneNumberId()` — cache miss path
4. `updateConversationStage()` — frecuente en workers

**Dashboard routes** — mantener PostgREST (bajo volumen, más fácil con filtros complejos).

---

### Fase 4 — Neon.tech (migración de DB)
**Cuándo:** ~10,000 conv/día O cuando Supabase compute > $40/mes | **Ahorro:** ~$30-60/mes | **Complejidad:** Media

#### Por qué Neon sobre otras opciones:

| Servicio | Costo 10K conv | IO Budget | Branching | Complejidad migración |
|---------|---------------|-----------|-----------|----------------------|
| Supabase Pro + Large | $100+/mes | Sí (limitado) | No | 0 (actual) |
| **Neon Pro** | **$19/mes** | **No** | **Sí** | Baja |
| Railway PostgreSQL | $10/mes | No | No | Media (sin managed backups) |
| PlanetScale | $39/mes | No | Sí | Alta (MySQL, incompatible) |
| CockroachDB Serverless | $0.50/M RUs | No | Sí | Media |

**Neon es la opción clara:**
- PostgreSQL puro → RLS policies se copian sin cambios
- Sin IO budget → write-heavy workloads no tienen penalización
- Serverless: suspende cuando idle → cero costo en staging
- Branching: `neon branches create` para PRs y staging
- $19/mes Pro cubre hasta ~50M compute units/mes

#### Estrategia de migración:
1. Mantener Supabase **solo para Auth** (50K MAU gratis para siempre)
2. `pg_dump` de Supabase → `pg_restore` en Neon
3. Migrar RLS policies (son PostgreSQL nativo, idénticas)
4. Cambiar `DATABASE_URL` en Railway → redeploy
5. Remover `@supabase/supabase-js` del backend (queda solo para auth en frontend)

La Fase 3 (PgBouncer directo) acelera esta migración porque ya habremos reemplazado PostgREST con `postgres.js` en las rutas más frecuentes.

---

### Fase 5 — Multi-instancia (horizontal scaling)
**Cuándo:** ~20,000 conv/día | **Costo adicional:** +$15-20/mes por instancia | **Complejidad:** Baja (ya preparado)

El backend ya es stateless con Redis. Escalar es literalmente:

**Railway:** Settings → Service → Replicas → aumentar número.

**Prerequisitos ya cubiertos en Fase 2:**
- BullMQ workers con concurrencia configurable
- Distributed cron lock
- Redis como estado compartido
- Sin in-memory state por instancia

---

## Proyección de costos por fase

| Conv/día | Redis | DB | Backend | R2 | **Total** | Fase |
|----------|-------|----|---------|----|-----------|------|
| 386 (hoy) | $13 (Upstash) | $25+$10 (Pro+Small) | $15 | $0.50 | **~$64** | Actual |
| 1,500 | $10 (Railway) | $25+$10 (Pro+Small) | $15 | $1 | **~$61** | Fase 1+2 |
| 5,000 | $10 | $25+$20 (Pro+Medium) | $20 | $2 | **~$77** | Fase 3 |
| 10,000 | $10 | $19 (Neon) | $40 (2x) | $3 | **~$72** | Fase 4 |
| 30,000 | $15 | $19 (Neon) | $80 (4x) | $8 | **~$122** | Fase 5 |
| 100,000 | $30 | $49 (Neon Pro scale) | $200 (8x) | $20 | **~$299** | Scale |

---

## Resumen ejecutivo — prioridades

```
AHORA (días)        → Fase 1: Cache fixes en código
                       • Full flow cache
                       • Conversation state cache
                       • Org config cache
                       • Railway Redis ($10/mes fijo)

PRÓXIMAS SEMANAS   → Fase 2: Async webhook (BullMQ)
                       • Elimina riesgo de timeouts Meta
                       • Permite escalar workers independientemente
                       • Distributed cron lock

~3 MESES           → Fase 3: Direct PgBouncer
                       • Prepara migración a Neon
                       • Reduce overhead PostgREST en bot engine

~6 MESES O ~10K conv → Fase 4: Neon.tech
                         • Elimina restricciones de IO para siempre
                         • Reduce costo DB en ~60%

SEGÚN CRECIMIENTO  → Fase 5: Multi-instancia en Railway
                       (sin cambios de código gracias a Fase 2)
```

---

## Riesgos y notas

- **BullMQ + Railway Redis**: Si Redis cae, mensajes entrantes se pierden hasta que vuelva. Mitigación: persistencia Redis habilitada + Railway garantiza 99.9% uptime.
- **Neon serverless cold starts**: El primer query después de que la DB suspende tarda ~500ms. No afecta el bot (siempre hay tráfico). Puede afectar staging — usar `neon branches` con compute siempre activo para staging.
- **Multi-instancia y Meta webhooks**: Meta puede enviar el mismo mensaje a múltiples instancias. La deduplicación Redis (`isDuplicate()`) ya cubre esto — está implementada y funciona bien.
- **Supabase Auth**: Mantenerlo aunque se migre la DB. Eliminar Supabase completamente es innecesario y complicado — el free tier Auth (50K MAU) es más que suficiente.
