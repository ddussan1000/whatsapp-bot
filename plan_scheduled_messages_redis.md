# Plan: Migrar scheduled messages de Postgres → Redis Queue

## Contexto

### Problema actual

La tabla `scheduled_flow_messages` actúa como cola de mensajes. El cron la escanea
cada 5 segundos buscando filas `status='pending'`. Con 1 usuario en 4 días ya
acumuló 27,790 filas y 624,235 sequential scans.

**Proyección sin cambios:**

| Usuarios | Filas / día | Seq scans / día | Costo Supabase |
|----------|-------------|-----------------|----------------|
| 1        | ~7k         | 156k            | Plan Free/Pro  |
| 10       | ~70k        | 156k+           | Pro ($25)      |
| 50       | ~350k       | 156k+           | Pro + add-ons  |
| 100      | ~700k       | 156k+           | Plan Enterprise|

El seq_scan count no crece linealmente con usuarios porque el cron sigue siendo
un solo proceso, pero el tamaño de la tabla sí crece, haciendo cada scan más
costoso en IO.

### Reglas de negocio que NO cambian

Los delays entre pasos son **acumulativos** y se calculan al momento de iniciar
el flujo:

```
startAssignedFlow() en T=0:
  Paso 1 → delay 0s  → send_at = T + 0   (envío inmediato)
  Paso 2 → delay 30s → send_at = T + 30s
  Paso 3 → delay 60s → send_at = T + 90s (acumulativo: 30+60)
```

El timestamp absoluto `send_at` es lo que se almacena. Actualmente va a
`scheduled_flow_messages.scheduled_at`. Después irá como score en un Redis
Sorted Set. El comportamiento visible para el usuario final es idéntico.

---

## Arquitectura propuesta

### Estructuras Redis

```
# Cola global — ordenada por timestamp de envío
Key:   sched:queue
Type:  Sorted Set
Score: send_at en Unix ms
Value: jobId (UUID)

# Payload del job — se lee al momento de procesar
Key:   sched:job:{jobId}
Type:  String (JSON)
TTL:   48h (limpieza automática)
Value: {
  id, orgId, phone, stepId,
  conversationId, instanceId,
  metaPhoneNumberId, flowId, sendAt
}

# Índice inverso: jobs pendientes por teléfono
# Permite cancelar todos los jobs de un teléfono en O(1)
Key:   sched:phone:{orgId}:{phone}
Type:  Set de jobIds
TTL:   48h

# Rate limit por instancia WhatsApp (ventana 1 minuto)
Key:   sched:rl:{instanceId}:{minute_bucket}
Type:  String (counter)
TTL:   60s
```

### Write path (sin cambios de comportamiento)

```
startAssignedFlow()
  ├── Paso sin delay → sendStepMessages() inmediato  [igual que ahora]
  └── Pasos con delay:
        jobId = uuid()
        payload = { id: jobId, orgId, phone, stepId, ... sendAt }
        ZADD  sched:queue        <send_at_ms>  <jobId>
        SET   sched:job:{jobId}  <payload_json>  EX 172800
        SADD  sched:phone:{orgId}:{phone}  <jobId>
        EXPIRE sched:phone:{orgId}:{phone}  172800
        INSERT scheduled_flow_messages (audit only, con redis_job_id)
```

### Cancelación cuando inicia nuevo flujo

```
// Antes: UPDATE WHERE org+phone+status='pending' → full table scan
// Después:
jobIds = SMEMBERS sched:phone:{orgId}:{phone}
if jobIds.length > 0:
  ZREM   sched:queue  ...jobIds
  DEL    sched:phone:{orgId}:{phone}
  // Los sched:job:{id} expiran solos por TTL

UPDATE scheduled_flow_messages SET status='cancelled'
WHERE redis_job_id = ANY(jobIds)  // audit only, async, no bloquea el flujo
```

### Worker (reemplaza el cron actual)

```
Cada 2 segundos:
  due = ZRANGEBYSCORE sched:queue 0 <now_ms> LIMIT 0 50
  if due.length === 0 → return   [1 comando Redis, costo mínimo]

  // Claim atómico: ZPOPMIN es atómico, safe para múltiples workers
  claimed = ZPOPMIN sched:queue 50
  payloads = Promise.all(claimed.map(id => GET sched:job:{id}))

  // Procesar en paralelo con límite de concurrencia (no serial como ahora)
  await Promise.allSettled(payloads.map(p => processJob(p)))

processJob(payload):
  // Rate limit por instancia
  bucket = floor(now / 60000)
  count = INCR sched:rl:{instanceId}:{bucket}
  EXPIRE sched:rl:{instanceId}:{bucket} 60
  if count > MAX_PER_MINUTE:
    // Re-encolar con delay de 60s
    ZADD sched:queue <now+60000> <jobId>
    return

  // Obtener step y enviar (igual que ahora)
  step = await supabase.from('flow_steps').select(...).eq('id', payload.stepId)
  await sendStepMessages(step, payload.phone, fakeState)

  // Cleanup Redis
  SREM  sched:phone:{orgId}:{phone}  <jobId>
  DEL   sched:job:{jobId}

  // Audit DB (async, no bloquea el envío)
  supabase.from('scheduled_flow_messages')
    .update({ status: 'sent', sent_at: now })
    .eq('redis_job_id', jobId)
    .then().catch(log.warn)

  // Verificar si quedan pendientes para este teléfono
  remaining = SCARD sched:phone:{orgId}:{phone}
  if remaining === 0 && payload.conversationId:
    supabase.from('conversations').update({ stage: 'flujo_terminado' })...
```

---

## Archivos a modificar

| Archivo | Tipo | Cambio |
|---------|------|--------|
| `src/queue/scheduledMessages.ts` | NUEVO | Módulo central: schedule, cancel, worker |
| `src/bot/flowEngine.ts` | MODIFICAR | Write path → Redis; read path → Redis |
| `src/receipts/handler.ts` | MODIFICAR | cancelPending() → Redis |
| `src/webhook/handler.ts` | MODIFICAR | flowIsInProgress check → Redis |
| `src/cron/processScheduledMessages.ts` | MODIFICAR | Llamar al nuevo worker |
| `backend/scripts/sql/` | NUEVO .sql | Agregar redis_job_id + cleanup cron |

### Detalle por archivo

#### `src/queue/scheduledMessages.ts` (nuevo)
Exporta las funciones que encapsulan toda la lógica Redis:
- `scheduleJob(payload)` — ZADD + SET + SADD
- `cancelJobsForPhone(orgId, phone)` — SMEMBERS + ZREM + DEL
- `hasPendingJobs(orgId, phone): boolean` — SCARD > 0
- `processScheduledMessages()` — worker principal

#### `src/bot/flowEngine.ts`
- `startAssignedFlow()`:
  - Remover: `supabase.from('scheduled_flow_messages').update({ status: 'cancelled' })`
  - Agregar: `await cancelJobsForPhone(orgId, phone)` (Redis)
  - Remover: `supabase.from('scheduled_flow_messages').insert({...})`
  - Agregar: `await scheduleJob({...})` (Redis + INSERT audit)
- `processScheduledMessages()`:
  - Mover toda la lógica a `src/queue/scheduledMessages.ts`
  - Esta función queda como re-export o se elimina

#### `src/receipts/handler.ts`
- `cancelPending()`:
  - Remover: `supabase.from('scheduled_flow_messages').update({ status: 'cancelled' })`
  - Agregar: `await cancelJobsForPhone(state.organizationId, phone)`

#### `src/webhook/handler.ts`
- `flowIsInProgress` check:
  - Remover: `supabase.from('scheduled_flow_messages').select('id', { count: 'exact' })`
  - Agregar: `const flowIsInProgress = await hasPendingJobs(organizationId, phone)`

#### `src/cron/processScheduledMessages.ts`
- Cambiar import: `processScheduledMessages` ahora viene de `../queue/scheduledMessages`
- El intervalo del CronJob puede subir de 5s a 2s sin costo (Redis es barato)
- O usar `setInterval` nativo en vez de CronJob (más simple para este caso)

---

## Fases de implementación

### Fase 0 — Parche inmediato (1 hora)
Mitiga el problema mientras se implementa la solución real.

```sql
-- Correr en Supabase Studio ahora
CREATE INDEX IF NOT EXISTS idx_scheduled_msgs_pending
  ON public.scheduled_flow_messages (scheduled_at)
  WHERE status = 'pending';

DELETE FROM public.scheduled_flow_messages
WHERE status IN ('sent', 'failed', 'cancelled')
  AND scheduled_at < now() - INTERVAL '2 days';
```

Cambiar el cron de `*/5 * * * * *` a `*/10 * * * * *` (mitad de scans).

### Fase 1 — Implementación Redis (2-3 días)

1. Crear `src/queue/scheduledMessages.ts` con toda la lógica
2. Agregar migración SQL con columna `redis_job_id` en `scheduled_flow_messages`
3. Modificar `flowEngine.ts` — write path dual: escribe a Redis Y a DB
4. Modificar `receipts/handler.ts` y `webhook/handler.ts`
5. **Deploy en staging, validar que los mensajes llegan en el tiempo correcto**

En esta fase el cron de DB sigue activo como respaldo. El worker Redis también
corre. Si Redis procesa el job primero, la fila de DB ya tiene `status='sent'`
cuando el cron llega a ella (no la procesa dos veces — ya no está `pending`).

### Fase 2 — Cutover (1 día, después de validar Fase 1)

1. Desactivar el cron de DB (`registerScheduledMessagesCron`)
2. El worker Redis es el único procesador
3. Monitorear por 24h que no haya mensajes perdidos

### Fase 3 — Cleanup (1 semana después)

1. Agregar pg_cron (o cron en backend) que borra filas `status != 'pending'`
   con más de 24h → la tabla se mantiene pequeña indefinidamente
2. La tabla `scheduled_flow_messages` queda como log de auditoría
3. Eliminar la función RPC `claim_scheduled_messages` de Postgres
4. Remover el índice `idx_scheduled_msgs_pending` (ya no se consulta para cola)

---

## Migración SQL requerida

```sql
-- 1. Columna para linkear fila de auditoría con job de Redis
ALTER TABLE public.scheduled_flow_messages
  ADD COLUMN IF NOT EXISTS redis_job_id uuid;

CREATE INDEX IF NOT EXISTS idx_scheduled_msgs_redis_job
  ON public.scheduled_flow_messages (redis_job_id)
  WHERE redis_job_id IS NOT NULL;

-- 2. Cleanup automático diario (vía pg_cron si está habilitado,
--    o como cron del backend en purgeOldMessages.ts)
-- Mantiene la tabla en < 1,000 filas sin importar el volumen
DELETE FROM public.scheduled_flow_messages
WHERE status IN ('sent', 'failed', 'cancelled')
  AND scheduled_at < now() - INTERVAL '24 hours';
```

---

## Escala proyectada

| Usuarios | Jobs Redis / día | Comandos Redis / día | Costo Redis add. |
|----------|-----------------|----------------------|------------------|
| 1        | ~100            | ~18,000              | ~$1/mes          |
| 10       | ~1,000          | ~24,000              | ~$1.50/mes       |
| 100      | ~10,000         | ~78,000              | ~$4.60/mes       |
| 1,000    | ~100,000        | ~660,000             | ~$40/mes         |

El polling (17,280 comandos/día) es **constante** sin importar los usuarios —
un solo worker cubre toda la plataforma. Solo el procesamiento crece con el volumen.

**Comparación Supabase IO (estimado):**

| Usuarios | IO ahora (sin cambios) | IO con Redis |
|----------|------------------------|--------------|
| 1        | ~156k scans/día        | ~0 scans     |
| 10       | ~1.5M scans/día        | ~0 scans     |
| 100      | Plan Enterprise        | Plan Pro ($25)|

---

## Plan de rollback

Si Redis falla en producción, el sistema degrada a:
1. `hasPendingJobs()` → devuelve `false` (safe: inicia el flujo, puede enviar duplicado)
2. `cancelJobsForPhone()` → no-op (safe: el job expira solo por TTL)
3. `scheduleJob()` → solo escribe a DB, el cron de DB sigue como fallback
   si no se ha desactivado aún (Fase 1 y 2)

La función `scheduleJob()` debe tener try/catch que caiga en el comportamiento
actual de DB si Redis no está disponible. El cliente Redis ya tiene este patrón
en `cache/redis.ts` (`enableOfflineQueue: false`).

---

## Restricción: máximo 24 horas de delay acumulado

Un flujo no puede tener un tiempo acumulado de esperas mayor a 86,400 segundos
(24 horas). Si el cliente nunca responde, el bot no puede continuar enviando
mensajes indefinidamente.

**Backend** (`flowRoutes.ts`):
- `UpsertFlowBodySchema` tiene un `.refine()` que suma todos los `delaySeconds`
  y rechaza con 400 si superan 86,400.
- Garantiza que el contrato se cumpla independientemente del cliente.

**Frontend** (`FlowEditor.tsx`):
- Indicador de tiempo total en el header de "Pasos del flow" (verde si OK,
  rojo con ícono si supera 24h).
- El `StepConnector` del paso que causa el overflow se colorea en rojo y
  muestra el tiempo acumulado hasta ese punto.
- Banner de error descriptivo encima del botón guardar.
- Botón guardar deshabilitado mientras el límite esté superado.

**Implicación para Redis**: el TTL de los jobs en Redis (48h) cubre con margen
el máximo posible de un flujo (24h). No hay riesgo de que un job expire antes
de ser procesado.

---

## Checklist de validación

- [ ] Paso 1 (delay 0) se envía inmediatamente al iniciar flujo
- [ ] Paso 2 llega exactamente a los N segundos configurados (±2s)
- [ ] Paso 3 llega a N1+N2 segundos (acumulativo correcto)
- [ ] Al reiniciar el flujo, los mensajes pendientes del flujo anterior no llegan
- [ ] Al recibir un comprobante, los mensajes pendientes se cancelan
- [ ] El check `flowIsInProgress` en webhook impide reiniciar flujo mid-delivery
- [ ] Con dos workers paralelos no se envía el mismo mensaje dos veces
- [ ] Después de todos los pasos, la conversación pasa a `flujo_terminado`
- [ ] La tabla `scheduled_flow_messages` se actualiza a `status='sent'` (auditoría)
- [ ] Seq scans en `scheduled_flow_messages` bajan a < 100/día
