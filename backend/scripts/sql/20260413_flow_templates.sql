-- Tabla de plantillas de flujo creadas por los usuarios
-- Ejecutar en Supabase SQL editor

begin;

create table if not exists public.flow_templates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  description text,
  category text not null default 'Personalizado',
  draft jsonb not null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_flow_templates_org on public.flow_templates(organization_id, created_at desc);

alter table public.flow_templates enable row level security;

drop policy if exists flow_templates_member_all on public.flow_templates;
create policy flow_templates_member_all on public.flow_templates
  for all using (public.is_org_member_or_platform_admin(organization_id));

commit;
