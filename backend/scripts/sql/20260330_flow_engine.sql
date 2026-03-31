-- Flow engine v1: flow_definitions, flow_steps, flow_step_messages, scheduled_flow_messages
-- Plus: bot_config persisted in organizations (removes in-memory botConfig)
-- Run after 20260330_products_and_instances.sql

begin;

-- ── 1. Bot config in DB ────────────────────────────────────────────────────
alter table public.organizations
  add column if not exists bot_config jsonb not null default '{}'::jsonb;

-- ── 2. Enums ───────────────────────────────────────────────────────────────
do $$
begin
  if not exists (select 1 from pg_type where typname = 'flow_definition_type') then
    create type public.flow_definition_type as enum ('keyword', 'sequential');
  end if;
  if not exists (select 1 from pg_type where typname = 'flow_message_type') then
    create type public.flow_message_type as enum ('text', 'image', 'document', 'video');
  end if;
  if not exists (select 1 from pg_type where typname = 'scheduled_msg_status') then
    create type public.scheduled_msg_status as enum ('pending', 'sent', 'failed', 'cancelled');
  end if;
end $$;

-- ── 3. Flow definitions ────────────────────────────────────────────────────
-- Each definition belongs to an org + optionally a product.
-- flow_type = 'keyword'    → steps contain trigger_keywords + response messages
-- flow_type = 'sequential' → ordered steps with delay_seconds between them
create table if not exists public.flow_definitions (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  product_id      uuid references public.products(id) on delete cascade,
  name            text not null,
  flow_type       public.flow_definition_type not null default 'keyword',
  is_active       boolean not null default true,
  created_by      uuid references auth.users(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- ── 4. Flow steps ──────────────────────────────────────────────────────────
-- keyword flow  → each step = one keyword group + its response messages
-- sequential    → each step = one stage in the drip sequence
create table if not exists public.flow_steps (
  id               uuid primary key default gen_random_uuid(),
  flow_id          uuid not null references public.flow_definitions(id) on delete cascade,
  organization_id  uuid not null references public.organizations(id) on delete cascade,
  position         integer not null default 0,      -- order within the flow
  delay_seconds    integer not null default 0,       -- delay BEFORE sending this step (sequential only)
  trigger_keywords text[]  not null default '{}',   -- keywords that fire this step (keyword only)
  label            text,                             -- friendly name shown in UI
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

-- ── 5. Flow step messages ──────────────────────────────────────────────────
-- Each step can have 1..N messages sent in sequence (position order).
create table if not exists public.flow_step_messages (
  id              uuid primary key default gen_random_uuid(),
  step_id         uuid not null references public.flow_steps(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  position        integer not null default 0,
  message_type    public.flow_message_type not null default 'text',
  text_content    text,       -- for type='text'
  media_url       text,       -- for image/document/video
  filename        text,       -- for document
  caption         text,       -- for image/document
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- ── 6. Scheduled flow messages ─────────────────────────────────────────────
-- When a sequential flow is triggered, future steps are queued here.
-- The cron job processes rows where scheduled_at <= now() and status = 'pending'.
create table if not exists public.scheduled_flow_messages (
  id                    uuid primary key default gen_random_uuid(),
  organization_id       uuid not null references public.organizations(id) on delete cascade,
  conversation_id       uuid references public.conversations(id) on delete set null,
  step_id               uuid not null references public.flow_steps(id) on delete cascade,
  phone                 text not null,
  whatsapp_instance_id  uuid references public.whatsapp_instances(id) on delete set null,
  meta_phone_number_id  text,
  product_id            uuid references public.products(id) on delete set null,
  scheduled_at          timestamptz not null,
  sent_at               timestamptz,
  status                public.scheduled_msg_status not null default 'pending',
  created_at            timestamptz not null default now()
);

-- ── Indexes ────────────────────────────────────────────────────────────────
create index if not exists idx_flow_defs_org       on public.flow_definitions(organization_id);
create index if not exists idx_flow_defs_product   on public.flow_definitions(product_id);
create index if not exists idx_flow_defs_active    on public.flow_definitions(organization_id, is_active);
create index if not exists idx_flow_steps_flow     on public.flow_steps(flow_id, position);
create index if not exists idx_flow_step_msgs_step on public.flow_step_messages(step_id, position);
create index if not exists idx_scheduled_pending   on public.scheduled_flow_messages(organization_id, scheduled_at)
  where status = 'pending';

commit;
