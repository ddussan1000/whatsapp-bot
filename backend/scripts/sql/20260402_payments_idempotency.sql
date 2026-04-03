-- Agrega meta_message_id a payments para idempotencia del webhook.
-- Evita insertar el mismo comprobante dos veces si Meta reenvía el webhook.

ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS meta_message_id TEXT DEFAULT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS payments_meta_message_id_idx
  ON payments(meta_message_id)
  WHERE meta_message_id IS NOT NULL;

COMMENT ON COLUMN payments.meta_message_id IS
  'ID del mensaje de WhatsApp (de Meta) que originó este pago. Usado para deduplicación de webhooks.';
