-- Fix: atomic claim for scheduled messages processor
-- Prevents duplicate sends when multiple server instances run the cron simultaneously.
-- Uses FOR UPDATE SKIP LOCKED (standard queue pattern in PostgreSQL).
-- No new enum values needed: rows are claimed by setting status='sent' optimistically.
-- If the send fails, the code updates status to 'failed'.

create or replace function public.claim_scheduled_messages(batch_limit integer default 50)
returns setof public.scheduled_flow_messages
language sql
security definer
as $$
  update public.scheduled_flow_messages
  set status = 'sent'
  where id in (
    select id
    from public.scheduled_flow_messages
    where status = 'pending'
      and scheduled_at <= now()
    order by scheduled_at
    limit batch_limit
    for update skip locked
  )
  returning *;
$$;
