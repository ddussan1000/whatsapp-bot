-- Add flow_name denormalized column to conversations for fast display
alter table public.conversations
  add column if not exists flow_name text;

-- Backfill from the flows table
update public.conversations c
set flow_name = f.name
from public.flows f
where c.flow_id = f.id
  and c.flow_name is null;

-- Keep flow_name in sync when a flow is renamed
create or replace function public.sync_conversation_flow_name()
returns trigger
language plpgsql
security definer
as $$
begin
  if new.name is distinct from old.name then
    update public.conversations
    set flow_name = new.name
    where flow_id = new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_sync_conversation_flow_name on public.flows;
create trigger trg_sync_conversation_flow_name
  after update on public.flows
  for each row execute procedure public.sync_conversation_flow_name();
