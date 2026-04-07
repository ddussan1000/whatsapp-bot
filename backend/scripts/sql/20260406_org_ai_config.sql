-- Migration: Add per-organization AI configuration
ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS ai_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS ai_provider text CHECK (ai_provider IN ('openai', 'gemini', 'anthropic', 'groq')),
  ADD COLUMN IF NOT EXISTS ai_api_key text,
  ADD COLUMN IF NOT EXISTS ai_model text,
  ADD COLUMN IF NOT EXISTS ai_system_prompt text;

COMMENT ON COLUMN organizations.ai_enabled IS 'If false, bot does not respond with AI after flow ends';
COMMENT ON COLUMN organizations.ai_api_key IS 'AES-256-GCM encrypted. Format: enc:<base64>';
