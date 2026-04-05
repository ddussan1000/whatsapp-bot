-- Migración: columnas de estado de entrega y optimización de retención en messages
-- Ejecutar en Supabase Studio > SQL Editor

-- 1. Columnas para delivery status (sustituye meta_status dentro del payload JSONB)
ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS delivery_status text,
  ADD COLUMN IF NOT EXISTS delivered_at timestamptz;

-- 2. Índice para búsqueda rápida por meta_message_id (usado al actualizar estado de entrega)
CREATE INDEX IF NOT EXISTS idx_messages_meta_message_id
  ON messages (meta_message_id)
  WHERE meta_message_id IS NOT NULL;

-- 3. Índice compuesto para la política de retención (borrado por org + fecha)
CREATE INDEX IF NOT EXISTS idx_messages_org_created_at
  ON messages (organization_id, created_at);
