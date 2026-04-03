-- Agrega app_secret a whatsapp_instances para verificación de firma HMAC-SHA256 del webhook Meta.
-- El App Secret se encuentra en Meta for Developers → tu app → App Settings → Basic → App Secret.
-- Es opcional: si no se configura, el webhook no verifica la firma (compatible hacia atrás).

ALTER TABLE whatsapp_instances
  ADD COLUMN IF NOT EXISTS app_secret TEXT DEFAULT NULL;

COMMENT ON COLUMN whatsapp_instances.app_secret IS
  'App Secret de la Meta App. Se usa para verificar X-Hub-Signature-256 en webhooks entrantes.';
