-- Agregar contact_name a conversations para guardar el nombre del contacto de Meta
-- Ejecutar en Supabase SQL editor

begin;

do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'conversations' and column_name = 'contact_name'
  ) then
    alter table public.conversations add column contact_name text;
  end if;
end $$;

commit;
