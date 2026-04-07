-- Migration: Add currency field to whatsapp_instances
-- Each WhatsApp number (instance) handles payments in a single currency at a time.
-- The currency is used in OCR (passed to Gemini) and shown in the dashboard.

ALTER TABLE whatsapp_instances
  ADD COLUMN IF NOT EXISTS currency text NOT NULL DEFAULT 'COP';

COMMENT ON COLUMN whatsapp_instances.currency IS 'ISO 4217 currency code for payments received on this instance (e.g. COP, USD, EUR, MXN, BRL, VES)';
