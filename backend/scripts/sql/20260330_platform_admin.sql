-- Dueños de la plataforma (acceso /admin) y lista de correos permitidos antes del primer login

begin;

create table if not exists public.platform_admins (
  email text primary key,
  note text,
  created_at timestamptz not null default now()
);

create index if not exists idx_platform_admins_email_lower on public.platform_admins (lower(email));

create table if not exists public.organization_signup_allowlist (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  email text not null,
  role public.org_role not null default 'owner',
  created_at timestamptz not null default now()
);

create unique index if not exists idx_org_signup_allowlist_email_lower
  on public.organization_signup_allowlist (lower(email));

create index if not exists idx_org_signup_allowlist_org on public.organization_signup_allowlist (organization_id);

comment on table public.platform_admins is 'Correos con acceso total a /admin (gestión de empresas). Insertar manualmente.';
comment on table public.organization_signup_allowlist is 'Correos autorizados a crear su usuario; al primer login se crea membership y se elimina la fila.';

commit;
