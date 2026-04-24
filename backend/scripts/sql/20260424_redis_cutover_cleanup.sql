-- Redis Cutover Cleanup (Fase 3)
-- Pre-requisito: verificar que no hay filas pendientes sin redis_job_id:
--   SELECT count(*) FROM scheduled_flow_messages WHERE status = 'pending' AND redis_job_id IS NULL;
--   → debe retornar 0

-- 1. Eliminar función legacy de claim atómico (ya no la usa ningún cron)
DROP FUNCTION IF EXISTS claim_scheduled_messages(integer);

-- 2. Eliminar índice legacy (reemplazado por idx_scheduled_msgs_redis_job)
DROP INDEX IF EXISTS idx_scheduled_pending;

-- 3. Limpieza diaria: eliminar filas de auditoría con más de 30 días
--    Supabase Pro incluye pg_cron; ejecutar una sola vez.
SELECT cron.schedule(
  'cleanup-scheduled-flow-messages',
  '0 3 * * *',
  $$DELETE FROM scheduled_flow_messages WHERE created_at < NOW() - INTERVAL '30 days'$$
);
