-- Migración: soporte para Redis Queue en scheduled_flow_messages
--
-- Fase 1 (dual-write): las nuevas filas tienen redis_job_id; las viejas no.
-- El cron de DB solo procesa filas sin redis_job_id para evitar duplicados.
-- El worker de Redis procesa las filas nuevas vía sched:queue.
--
-- Ejecutar en Supabase Studio antes de desplegar el backend con Redis queue.

-- 1. Columna para linkear fila de auditoría con job de Redis
ALTER TABLE public.scheduled_flow_messages
  ADD COLUMN IF NOT EXISTS redis_job_id uuid;

-- 2. Índice parcial para lookup por redis_job_id (audit updates)
CREATE INDEX IF NOT EXISTS idx_scheduled_msgs_redis_job
  ON public.scheduled_flow_messages (redis_job_id)
  WHERE redis_job_id IS NOT NULL;

-- 3. Actualizar claim_scheduled_messages para ignorar filas con redis_job_id
--    Garantiza que el cron de DB y el worker de Redis nunca procesen el mismo job.
--    Las filas con redis_job_id IS NOT NULL son gestionadas exclusivamente por Redis.
CREATE OR REPLACE FUNCTION public.claim_scheduled_messages(batch_limit integer DEFAULT 50)
RETURNS SETOF public.scheduled_flow_messages
LANGUAGE sql
SECURITY DEFINER
AS $$
  UPDATE public.scheduled_flow_messages
  SET status = 'sent'
  WHERE id IN (
    SELECT id
    FROM public.scheduled_flow_messages
    WHERE status = 'pending'
      AND scheduled_at <= now()
      AND redis_job_id IS NULL
    ORDER BY scheduled_at
    LIMIT batch_limit
    FOR UPDATE SKIP LOCKED
  )
  RETURNING *;
$$;
