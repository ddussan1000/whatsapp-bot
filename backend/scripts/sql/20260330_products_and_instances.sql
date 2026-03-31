-- Product-first + multi-instance bootstrap (v1)
-- Adds: whatsapp_instances, products, product_referrals
-- Links products -> campaigns via campaigns.product_id (product-first UI, reuse existing flows/templates schema).

begin;

create extension if not exists pgcrypto;

-- Provider type (optional)
do $$
begin
  if not exists (select 1 from pg_type where typname = 'wa_provider') then
    create type public.wa_provider as enum ('meta');
  end if;
end $$;

create table if not exists public.whatsapp_instances (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  provider public.wa_provider not null default 'meta',
  label text not null default '',
  waba_id text,
  meta_app_id text,
  phone_number_id text not null,
  display_phone_number text,
  meta_token text, -- store encrypted externally later; for now raw token in DB
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, phone_number_id)
);

create index if not exists idx_whatsapp_instances_org_active on public.whatsapp_instances(organization_id, is_active);

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  slug text not null,
  is_active boolean not null default true,
  system_prompt text not null default '',
  dispatch_keywords text not null default '',
  config jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, slug)
);

create index if not exists idx_products_org_active on public.products(organization_id, is_active);

create table if not exists public.product_referrals (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  ctwa_clid text not null,
  source_id text,
  source_type text,
  source_url text,
  created_at timestamptz not null default now(),
  unique (organization_id, ctwa_clid)
);

create index if not exists idx_product_referrals_org_product on public.product_referrals(organization_id, product_id);

-- Link campaigns to products (reuse existing flows/templates schema which is campaign-based).
alter table public.campaigns add column if not exists product_id uuid references public.products(id) on delete set null;
create unique index if not exists uq_campaigns_org_product on public.campaigns(organization_id, product_id) where product_id is not null;

-- Add optional linkage to conversation/message logs for traceability.
alter table public.conversations add column if not exists whatsapp_instance_id uuid references public.whatsapp_instances(id) on delete set null;
alter table public.conversations add column if not exists product_id uuid references public.products(id) on delete set null;

alter table public.messages add column if not exists whatsapp_instance_id uuid references public.whatsapp_instances(id) on delete set null;
alter table public.messages add column if not exists product_id uuid references public.products(id) on delete set null;

alter table public.payments add column if not exists whatsapp_instance_id uuid references public.whatsapp_instances(id) on delete set null;
alter table public.payments add column if not exists product_id uuid references public.products(id) on delete set null;

-- RLS (mirrors existing tenant approach)
alter table public.whatsapp_instances enable row level security;
alter table public.products enable row level security;
alter table public.product_referrals enable row level security;

drop policy if exists wa_instances_member_all on public.whatsapp_instances;
create policy wa_instances_member_all on public.whatsapp_instances
for all using (public.is_org_member(organization_id));

drop policy if exists products_member_all on public.products;
create policy products_member_all on public.products
for all using (public.is_org_member(organization_id));

drop policy if exists product_referrals_member_all on public.product_referrals;
create policy product_referrals_member_all on public.product_referrals
for all using (public.is_org_member(organization_id));

commit;

