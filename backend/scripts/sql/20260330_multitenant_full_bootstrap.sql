-- Full bootstrap v1: multitenant auth/campaigns/flows/templates
-- Safe to run multiple times where possible.

begin;

create extension if not exists pgcrypto;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'org_role') then
    create type public.org_role as enum ('owner', 'admin', 'agent', 'viewer');
  end if;
  if not exists (select 1 from pg_type where typname = 'campaign_status') then
    create type public.campaign_status as enum ('draft', 'active', 'paused', 'archived');
  end if;
  if not exists (select 1 from pg_type where typname = 'flow_version_status') then
    create type public.flow_version_status as enum ('draft', 'published', 'archived');
  end if;
  if not exists (select 1 from pg_type where typname = 'template_kind') then
    create type public.template_kind as enum ('text', 'image', 'document', 'link');
  end if;
  if not exists (select 1 from pg_type where typname = 'invite_status') then
    create type public.invite_status as enum ('pending', 'accepted', 'revoked', 'expired');
  end if;
end $$;

create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.organization_members (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.org_role not null default 'agent',
  created_at timestamptz not null default now(),
  unique (organization_id, user_id)
);

create table if not exists public.organization_invites (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  email text not null,
  role public.org_role not null default 'agent',
  token text not null unique,
  status public.invite_status not null default 'pending',
  invited_by uuid references auth.users(id) on delete set null,
  expires_at timestamptz not null default (now() + interval '7 days'),
  accepted_at timestamptz,
  accepted_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_org_members_user on public.organization_members(user_id);
create index if not exists idx_org_members_org on public.organization_members(organization_id);
create index if not exists idx_org_invites_org on public.organization_invites(organization_id);
create index if not exists idx_org_invites_email_pending on public.organization_invites(lower(email), status);

alter table public.conversations add column if not exists organization_id uuid references public.organizations(id) on delete set null;
alter table public.conversations add column if not exists campaign_id uuid;
alter table public.messages add column if not exists organization_id uuid references public.organizations(id) on delete set null;
alter table public.messages add column if not exists campaign_id uuid;
alter table public.payments add column if not exists organization_id uuid references public.organizations(id) on delete set null;
alter table public.payments add column if not exists campaign_id uuid;

create table if not exists public.campaigns (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  status public.campaign_status not null default 'draft',
  channel text not null default 'whatsapp',
  product text,
  system_prompt text not null default '',
  dispatch_keywords text not null default '',
  config jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, name)
);

alter table public.conversations
  add constraint conversations_campaign_fk
  foreign key (campaign_id) references public.campaigns(id) on delete set null;
alter table public.messages
  add constraint messages_campaign_fk
  foreign key (campaign_id) references public.campaigns(id) on delete set null;
alter table public.payments
  add constraint payments_campaign_fk
  foreign key (campaign_id) references public.campaigns(id) on delete set null;

create index if not exists idx_campaigns_org_status on public.campaigns(organization_id, status);
create index if not exists idx_conversations_org on public.conversations(organization_id, updated_at desc);
create index if not exists idx_messages_org on public.messages(organization_id, created_at desc);
create index if not exists idx_payments_org on public.payments(organization_id, validated_at desc);

create table if not exists public.flow_versions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  version_number integer not null,
  status public.flow_version_status not null default 'draft',
  notes text,
  published_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (campaign_id, version_number)
);

create table if not exists public.flow_nodes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  flow_version_id uuid not null references public.flow_versions(id) on delete cascade,
  node_key text not null,
  node_type text not null,
  title text not null default '',
  config jsonb not null default '{}'::jsonb,
  position_x integer not null default 0,
  position_y integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (flow_version_id, node_key)
);

create table if not exists public.flow_edges (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  flow_version_id uuid not null references public.flow_versions(id) on delete cascade,
  from_node_id uuid not null references public.flow_nodes(id) on delete cascade,
  to_node_id uuid not null references public.flow_nodes(id) on delete cascade,
  condition jsonb not null default '{}'::jsonb,
  priority integer not null default 100,
  created_at timestamptz not null default now()
);

create table if not exists public.flow_triggers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  flow_version_id uuid not null references public.flow_versions(id) on delete cascade,
  trigger_type text not null,
  value text not null,
  is_case_sensitive boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.flow_actions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  flow_version_id uuid not null references public.flow_versions(id) on delete cascade,
  node_id uuid not null references public.flow_nodes(id) on delete cascade,
  action_type text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.message_templates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  campaign_id uuid references public.campaigns(id) on delete set null,
  name text not null,
  category text not null default 'general',
  kind public.template_kind not null default 'text',
  content text not null default '',
  media_url text,
  variables jsonb not null default '[]'::jsonb,
  is_active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, name)
);

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete cascade,
  actor_user_id uuid references auth.users(id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_flow_versions_campaign on public.flow_versions(campaign_id, status);
create index if not exists idx_templates_org on public.message_templates(organization_id, campaign_id);
create index if not exists idx_audit_org_created on public.audit_logs(organization_id, created_at desc);

create or replace function public.current_user_id()
returns uuid
language sql
stable
as $$
  select auth.uid()
$$;

create or replace function public.is_org_member(target_org uuid)
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from public.organization_members m
    where m.organization_id = target_org
      and m.user_id = auth.uid()
  );
$$;

create or replace function public.is_org_admin(target_org uuid)
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from public.organization_members m
    where m.organization_id = target_org
      and m.user_id = auth.uid()
      and m.role in ('owner', 'admin')
  );
$$;

-- Seed default org for existing data.
insert into public.organizations (slug, name)
values ('default-org', 'Default Organization')
on conflict (slug) do nothing;

-- Migrate existing records to default org if null.
update public.conversations
set organization_id = (select id from public.organizations where slug = 'default-org')
where organization_id is null;

update public.messages
set organization_id = (select id from public.organizations where slug = 'default-org')
where organization_id is null;

update public.payments
set organization_id = (select id from public.organizations where slug = 'default-org')
where organization_id is null;

-- Tighten nullability after migration.
alter table public.conversations alter column organization_id set not null;
alter table public.messages alter column organization_id set not null;
alter table public.payments alter column organization_id set not null;

-- Enable RLS.
alter table public.organizations enable row level security;
alter table public.organization_members enable row level security;
alter table public.organization_invites enable row level security;
alter table public.campaigns enable row level security;
alter table public.flow_versions enable row level security;
alter table public.flow_nodes enable row level security;
alter table public.flow_edges enable row level security;
alter table public.flow_triggers enable row level security;
alter table public.flow_actions enable row level security;
alter table public.message_templates enable row level security;
alter table public.conversations enable row level security;
alter table public.messages enable row level security;
alter table public.payments enable row level security;
alter table public.audit_logs enable row level security;

-- organizations
drop policy if exists org_select_member on public.organizations;
create policy org_select_member on public.organizations
for select using (public.is_org_member(id));

drop policy if exists org_update_admin on public.organizations;
create policy org_update_admin on public.organizations
for update using (public.is_org_admin(id));

-- members
drop policy if exists org_members_select_member on public.organization_members;
create policy org_members_select_member on public.organization_members
for select using (public.is_org_member(organization_id));

drop policy if exists org_members_manage_admin on public.organization_members;
create policy org_members_manage_admin on public.organization_members
for all using (public.is_org_admin(organization_id));

-- invites
drop policy if exists org_invites_select_member on public.organization_invites;
create policy org_invites_select_member on public.organization_invites
for select using (public.is_org_member(organization_id));

drop policy if exists org_invites_manage_admin on public.organization_invites;
create policy org_invites_manage_admin on public.organization_invites
for all using (public.is_org_admin(organization_id));

-- generic tenant policy helper usage
drop policy if exists campaigns_member_all on public.campaigns;
create policy campaigns_member_all on public.campaigns
for all using (public.is_org_member(organization_id));

drop policy if exists flow_versions_member_all on public.flow_versions;
create policy flow_versions_member_all on public.flow_versions
for all using (public.is_org_member(organization_id));

drop policy if exists flow_nodes_member_all on public.flow_nodes;
create policy flow_nodes_member_all on public.flow_nodes
for all using (public.is_org_member(organization_id));

drop policy if exists flow_edges_member_all on public.flow_edges;
create policy flow_edges_member_all on public.flow_edges
for all using (public.is_org_member(organization_id));

drop policy if exists flow_triggers_member_all on public.flow_triggers;
create policy flow_triggers_member_all on public.flow_triggers
for all using (public.is_org_member(organization_id));

drop policy if exists flow_actions_member_all on public.flow_actions;
create policy flow_actions_member_all on public.flow_actions
for all using (public.is_org_member(organization_id));

drop policy if exists templates_member_all on public.message_templates;
create policy templates_member_all on public.message_templates
for all using (public.is_org_member(organization_id));

drop policy if exists conversations_member_all on public.conversations;
create policy conversations_member_all on public.conversations
for all using (public.is_org_member(organization_id));

drop policy if exists messages_member_all on public.messages;
create policy messages_member_all on public.messages
for all using (public.is_org_member(organization_id));

drop policy if exists payments_member_all on public.payments;
create policy payments_member_all on public.payments
for all using (public.is_org_member(organization_id));

drop policy if exists audit_member_all on public.audit_logs;
create policy audit_member_all on public.audit_logs
for all using (public.is_org_member(organization_id));

commit;
