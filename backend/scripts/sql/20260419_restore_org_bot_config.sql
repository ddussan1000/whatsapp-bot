-- Restore bot_config column on organizations.
-- The phase2_flows_redesign migration accidentally dropped this column which
-- is still used by the backend for org-level bot configuration messages.
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS bot_config jsonb NOT NULL DEFAULT '{}'::jsonb;
