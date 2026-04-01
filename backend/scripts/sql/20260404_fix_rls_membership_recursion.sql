-- is_org_member() consulta organization_members; las políticas RLS de esa tabla usan
-- is_org_member(organization_id) → recursión infinita → "stack depth limit exceeded".
-- SECURITY DEFINER hace que el SELECT interno no re-evalúe RLS (patrón recomendado en Supabase).

begin;

create or replace function public.is_org_member(target_org uuid)
returns boolean
language sql
stable
security definer
set search_path = public
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
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.organization_members m
    where m.organization_id = target_org
      and m.user_id = auth.uid()
      and m.role in ('owner', 'admin')
  );
$$;

commit;
