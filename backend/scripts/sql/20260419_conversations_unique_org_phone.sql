-- Replace phone-only unique constraint with composite (organization_id, phone)
-- to support multi-tenant upserts and eliminate race conditions on concurrent webhooks

alter table public.conversations drop constraint if exists ux_conversations_phone;
alter table public.conversations drop constraint if exists uq_conversations_org_phone;

alter table public.conversations
  add constraint uq_conversations_org_phone unique (organization_id, phone);
