-- Normalizes legacy conversation stage names to current values.
-- Safe to run multiple times (idempotent — rows already migrated won't match).
--
-- Mapping:
--   flow_started          → en_flujo         (~230 rows)
--   post_venta            → flujo_terminado   (~52 rows)
--   confirmar_comprobante → revision_manual   (~1 row)

BEGIN;

UPDATE conversations SET stage = 'en_flujo'         WHERE stage = 'flow_started';
UPDATE conversations SET stage = 'flujo_terminado'   WHERE stage = 'post_venta';
UPDATE conversations SET stage = 'revision_manual'   WHERE stage = 'confirmar_comprobante';

-- Verify result (optional — run manually after commit to confirm)
-- SELECT stage, COUNT(*) FROM conversations GROUP BY stage ORDER BY COUNT(*) DESC;

COMMIT;
