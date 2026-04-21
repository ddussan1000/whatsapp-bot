-- Optimización de índices en messages para reducir latencia en actualizaciones de delivery status.
--
-- 1. El índice existente (solo meta_message_id) no cubre queries que filtran por
--    (organization_id, meta_message_id) juntos — el planner tiene que filtrar org en memoria.
-- 2. El fallback ilike("%wamid...%") hace full table scan sin soporte trigram.

-- 1. Índice compuesto para el path frecuente: buscar mensaje por org + ID exacto.
CREATE INDEX IF NOT EXISTS idx_messages_org_meta_message_id
  ON messages (organization_id, meta_message_id)
  WHERE meta_message_id IS NOT NULL;

-- 2. Soporte para búsquedas ilike con wildcard inicial (fallback de variaciones de ID de Meta).
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS idx_messages_meta_message_id_trgm
  ON messages USING gin (meta_message_id gin_trgm_ops)
  WHERE meta_message_id IS NOT NULL;
