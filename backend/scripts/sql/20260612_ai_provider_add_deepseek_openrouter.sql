-- Migration: allow DeepSeek and OpenRouter as org AI providers
-- The original CHECK was created inline in 20260406_org_ai_config.sql, so Postgres
-- auto-named it organizations_ai_provider_check. Drop and re-create with the wider set.
ALTER TABLE organizations DROP CONSTRAINT IF EXISTS organizations_ai_provider_check;
ALTER TABLE organizations
  ADD CONSTRAINT organizations_ai_provider_check
  CHECK (ai_provider IN ('openai', 'gemini', 'anthropic', 'groq', 'deepseek', 'openrouter'));
