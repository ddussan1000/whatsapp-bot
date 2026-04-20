-- Add composite unique constraint on (organization_id, phone) for conversations
-- This replaces any existing phone-only unique constraint and enables atomic upserts

-- Drop old phone-only unique index/constraint if it exists
drop index if exists public.conversations_phone_key;
alter table public.conversations drop constraint if exists conversations_phone_key;
alter table public.conversations drop constraint if exists conversations_pkey_phone;

-- Add the correct composite unique constraint for multi-tenant upserts
alter table public.conversations
  drop constraint if exists uq_conversations_org_phone;

alter table public.conversations
  add constraint uq_conversations_org_phone unique (organization_id, phone);
