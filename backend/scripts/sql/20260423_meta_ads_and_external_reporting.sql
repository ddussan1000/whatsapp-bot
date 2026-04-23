-- Agrega configuración de Meta Ads (ID de cuenta publicitaria, reusa meta_token existente)
-- y credenciales del sistema de reportes externo, ambas por instancia de WhatsApp.
ALTER TABLE whatsapp_instances
  ADD COLUMN IF NOT EXISTS meta_ads_account_id TEXT,
  ADD COLUMN IF NOT EXISTS external_reporting_key TEXT,
  ADD COLUMN IF NOT EXISTS external_reporting_url TEXT;
