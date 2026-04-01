-- Ad click tracking + message_overrides en flows + campos extra en flow_referrals
-- Ejecutar en Supabase SQL editor

begin;

-- 1. Tabla ad_click_logs: registra cada clic individual desde anuncios CTWA
create table if not exists public.ad_click_logs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  flow_id uuid references public.flows(id) on delete set null,
  phone text not null,
  ctwa_clid text,
  source_id text,
  source_type text,
  source_url text,
  headline text,
  body text,
  media_type text,
  media_id text,
  created_at timestamptz not null default now()
);

create index if not exists idx_ad_click_logs_org on public.ad_click_logs(organization_id);
create index if not exists idx_ad_click_logs_source on public.ad_click_logs(organization_id, source_id);
create index if not exists idx_ad_click_logs_created on public.ad_click_logs(created_at);

-- RLS
alter table public.ad_click_logs enable row level security;

drop policy if exists ad_click_logs_member_all on public.ad_click_logs;
create policy ad_click_logs_member_all on public.ad_click_logs
  for all using (public.is_org_member_or_platform_admin(organization_id));

-- 2. Ampliar flow_referrals con campos extra del referral
do $$
begin
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'flow_referrals' and column_name = 'headline') then
    alter table public.flow_referrals add column headline text;
  end if;
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'flow_referrals' and column_name = 'body') then
    alter table public.flow_referrals add column body text;
  end if;
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'flow_referrals' and column_name = 'media_type') then
    alter table public.flow_referrals add column media_type text;
  end if;
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'flow_referrals' and column_name = 'media_id') then
    alter table public.flow_referrals add column media_id text;
  end if;
end $$;

-- 3. Agregar message_overrides (jsonb) a flows
do $$
begin
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'flows' and column_name = 'message_overrides') then
    alter table public.flows add column message_overrides jsonb default '{}';
  end if;
end $$;

-- 4. Actualizar upsert_flow_tree para persistir message_overrides
create or replace function public.upsert_flow_tree(payload jsonb)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_now timestamptz := now();
  v_flow_id uuid;
  v_org_id uuid;
  v_step jsonb;
  v_msg jsonb;
  v_step_id uuid;
  v_message_id uuid;
  keep_step_ids uuid[] := '{}';
  keep_message_ids uuid[] := '{}';
begin
  if payload is null then
    raise exception 'payload requerido';
  end if;

  v_flow_id := nullif(payload->>'id', '')::uuid;
  v_org_id := nullif(payload->>'organizationId', '')::uuid;

  if v_flow_id is null and v_org_id is null then
    raise exception 'organizationId requerido para crear flow';
  end if;

  if v_flow_id is not null then
    select organization_id into v_org_id from public.flows where id = v_flow_id;
    if v_org_id is null then
      raise exception 'flow no encontrado';
    end if;
  end if;

  if not public.is_org_member_or_platform_admin(v_org_id) then
    raise exception 'forbidden';
  end if;

  if v_flow_id is null then
    insert into public.flows (
      organization_id, name, trigger_phrase, trigger_first_word, keywords,
      no_match_behavior, system_prompt, message_overrides, is_active, created_at, updated_at
    )
    values (
      v_org_id,
      coalesce(nullif(payload->>'name', ''), 'Flow'),
      coalesce(nullif(payload->>'triggerPhrase', ''), 'hola'),
      coalesce(
        nullif(
          split_part(
            regexp_replace(
              lower(coalesce(nullif(payload->>'triggerPhrase', ''), 'hola')),
              '[^a-z0-9áéíóúüñ ]', '', 'g'
            ), ' ', 1
          ), ''
        ), 'hola'
      ),
      coalesce(
        (select coalesce(array_agg(lower(trim(x))), '{}'::text[])
         from jsonb_array_elements_text(coalesce(payload->'keywords', '[]'::jsonb)) t(x)
         where trim(x) <> ''),
        '{}'::text[]
      ),
      coalesce(nullif(payload->>'noMatchBehavior', ''), 'trigger'),
      nullif(payload->>'systemPrompt', ''),
      coalesce(payload->'messageOverrides', '{}'::jsonb),
      coalesce((payload->>'isActive')::boolean, true),
      v_now, v_now
    )
    returning id into v_flow_id;
  else
    update public.flows
    set
      name = coalesce(nullif(payload->>'name', ''), name),
      trigger_phrase = coalesce(nullif(payload->>'triggerPhrase', ''), trigger_phrase),
      trigger_first_word = coalesce(
        nullif(
          split_part(
            regexp_replace(
              lower(coalesce(nullif(payload->>'triggerPhrase', ''), trigger_phrase)),
              '[^a-z0-9áéíóúüñ ]', '', 'g'
            ), ' ', 1
          ), ''
        ), trigger_first_word
      ),
      keywords = coalesce(
        (select coalesce(array_agg(lower(trim(x))), '{}'::text[])
         from jsonb_array_elements_text(coalesce(payload->'keywords', '[]'::jsonb)) t(x)
         where trim(x) <> ''),
        keywords
      ),
      no_match_behavior = coalesce(nullif(payload->>'noMatchBehavior', ''), no_match_behavior),
      system_prompt = case
        when payload ? 'systemPrompt' then nullif(payload->>'systemPrompt', '')
        else system_prompt
      end,
      message_overrides = case
        when payload ? 'messageOverrides' then coalesce(payload->'messageOverrides', '{}'::jsonb)
        else message_overrides
      end,
      is_active = coalesce((payload->>'isActive')::boolean, is_active),
      updated_at = v_now
    where id = v_flow_id
      and organization_id = v_org_id;
  end if;

  for v_step in
    select value from jsonb_array_elements(coalesce(payload->'steps', '[]'::jsonb))
  loop
    v_step_id := nullif(v_step->>'id', '')::uuid;

    if v_step_id is null then
      insert into public.flow_steps (
        flow_id, organization_id, position, delay_seconds, trigger_keywords, label, created_at, updated_at
      )
      values (
        v_flow_id, v_org_id,
        coalesce((v_step->>'position')::int, 0),
        coalesce((v_step->>'delaySeconds')::int, 0),
        '{}'::text[],
        nullif(v_step->>'label', ''),
        v_now, v_now
      )
      returning id into v_step_id;
    else
      update public.flow_steps
      set
        position = coalesce((v_step->>'position')::int, position),
        delay_seconds = coalesce((v_step->>'delaySeconds')::int, delay_seconds),
        label = case when v_step ? 'label' then nullif(v_step->>'label', '') else label end,
        updated_at = v_now
      where id = v_step_id
        and flow_id = v_flow_id
        and organization_id = v_org_id;
    end if;

    keep_step_ids := array_append(keep_step_ids, v_step_id);
    keep_message_ids := '{}';

    for v_msg in
      select value from jsonb_array_elements(coalesce(v_step->'messages', '[]'::jsonb))
    loop
      v_message_id := nullif(v_msg->>'id', '')::uuid;

      if v_message_id is null then
        insert into public.flow_step_messages (
          step_id, organization_id, position, message_type,
          text_content, media_url, filename, caption, created_at, updated_at
        )
        values (
          v_step_id, v_org_id,
          coalesce((v_msg->>'position')::int, 0),
          coalesce(nullif(v_msg->>'messageType', '')::public.flow_message_type, 'text'::public.flow_message_type),
          nullif(v_msg->>'textContent', ''),
          nullif(v_msg->>'mediaUrl', ''),
          nullif(v_msg->>'filename', ''),
          nullif(v_msg->>'caption', ''),
          v_now, v_now
        )
        returning id into v_message_id;
      else
        update public.flow_step_messages
        set
          position = coalesce((v_msg->>'position')::int, position),
          message_type = coalesce(nullif(v_msg->>'messageType', '')::public.flow_message_type, message_type),
          text_content = case when v_msg ? 'textContent' then nullif(v_msg->>'textContent', '') else text_content end,
          media_url = case when v_msg ? 'mediaUrl' then nullif(v_msg->>'mediaUrl', '') else media_url end,
          filename = case when v_msg ? 'filename' then nullif(v_msg->>'filename', '') else filename end,
          caption = case when v_msg ? 'caption' then nullif(v_msg->>'caption', '') else caption end,
          updated_at = v_now
        where id = v_message_id
          and step_id = v_step_id
          and organization_id = v_org_id;
      end if;

      keep_message_ids := array_append(keep_message_ids, v_message_id);
    end loop;

    delete from public.flow_step_messages
    where step_id = v_step_id
      and organization_id = v_org_id
      and (array_length(keep_message_ids, 1) is null or id <> all(keep_message_ids));
  end loop;

  delete from public.flow_steps
  where flow_id = v_flow_id
    and organization_id = v_org_id
    and (array_length(keep_step_ids, 1) is null or id <> all(keep_step_ids));

  update public.flows set updated_at = v_now where id = v_flow_id and organization_id = v_org_id;
  return v_flow_id;
end;
$$;

commit;
