-- Migration: Add encryption support for sensitive instance tokens
-- Run in Supabase Studio SQL editor

-- Track which rows have been encrypted (for migration script)
ALTER TABLE whatsapp_instances
  ADD COLUMN IF NOT EXISTS token_encrypted boolean NOT NULL DEFAULT false;

-- Index for migration script efficiency
CREATE INDEX IF NOT EXISTS idx_whatsapp_instances_token_encrypted
  ON whatsapp_instances(token_encrypted) WHERE token_encrypted = false;

COMMENT ON COLUMN whatsapp_instances.meta_token IS 'AES-256-GCM encrypted. Format: enc:<base64(iv+ciphertext+tag)>';
COMMENT ON COLUMN whatsapp_instances.app_secret IS 'AES-256-GCM encrypted. Format: enc:<base64(iv+ciphertext+tag)>';
