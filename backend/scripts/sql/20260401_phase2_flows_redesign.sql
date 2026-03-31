-- Phase 2: Flows unificados (sin products/campaigns/flow_definitions)
-- Incluye:
-- 1) migracion de esquema y datos legacy
-- 2) funcion RPC transaccional upsert_flow_tree(payload jsonb)
-- 3) RLS/policies para tablas impactadas
-- 4) queries de validacion post-migracion

begin;

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- 1) Tabla principal flows
-- ---------------------------------------------------------------------------
create table if not exists public.flows (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  trigger_phrase text not null default 'hola',
  trigger_first_word text not null default 'hola',
  keywords text[] not null default '{}',
  no_match_behavior text not null default 'trigger'
    check (no_match_behavior in ('trigger', 'ignore')),
  system_prompt text,
  is_active boolean not null default true,
  legacy_flow_definition_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_flows_org on public.flows(organization_id);
create index if not exists idx_flows_org_active on public.flows(organization_id, is_active);
create unique index if not exists uq_flows_legacy_flow_definition on public.flows(legacy_flow_definition_id)
  where legacy_flow_definition_id is not null;

-- ---------------------------------------------------------------------------
-- 2) Migracion legacy -> flows
-- ---------------------------------------------------------------------------
-- 2.1 Desde flow_definitions (+ products si existen)
insert into public.flows (
  organization_id,
  name,
  trigger_phrase,
  trigger_first_word,
  keywords,
  no_match_behavior,
  system_prompt,
  is_active,
  legacy_flow_definition_id,
  created_at,
  updated_at
)
select
  fd.organization_id,
  fd.name,
  coalesce(nullif(trim(fd.name), ''), 'flow') as trigger_phrase,
  coalesce(
    nullif(
      split_part(
        regexp_replace(lower(coalesce(nullif(trim(fd.name), ''), 'flow')), '[^a-z0-9áéíóúüñ ]', '', 'g'),
        ' ',
        1
      ),
      ''
    ),
    'hola'
  ) as trigger_first_word,
  case
    when p.dispatch_keywords is null or btrim(p.dispatch_keywords) = '' then '{}'::text[]
    else regexp_split_to_array(lower(p.dispatch_keywords), '\s*,\s*')
  end as keywords,
  'trigger' as no_match_behavior,
  p.system_prompt,
  coalesce(fd.is_active, true) and coalesce(p.is_active, true) as is_active,
  fd.id as legacy_flow_definition_id,
  coalesce(fd.created_at, now()),
  coalesce(fd.updated_at, now())
from public.flow_definitions fd
left join public.products p
  on p.id = fd.product_id
where not exists (
  select 1
  from public.flows f
  where f.legacy_flow_definition_id = fd.id
);

-- 2.2 Para products sin flow_definition, crear flow base
insert into public.flows (
  organization_id,
  name,
  trigger_phrase,
  trigger_first_word,
  keywords,
  no_match_behavior,
  system_prompt,
  is_active,
  created_at,
  updated_at
)
select
  p.organization_id,
  p.name,
  coalesce(nullif(trim(p.name), ''), 'flow') as trigger_phrase,
  coalesce(
    nullif(
      split_part(
        regexp_replace(lower(coalesce(nullif(trim(p.name), ''), 'flow')), '[^a-z0-9áéíóúüñ ]', '', 'g'),
        ' ',
        1
      ),
      ''
    ),
    'hola'
  ) as trigger_first_word,
  case
    when p.dispatch_keywords is null or btrim(p.dispatch_keywords) = '' then '{}'::text[]
    else regexp_split_to_array(lower(p.dispatch_keywords), '\s*,\s*')
  end as keywords,
  'trigger' as no_match_behavior,
  p.system_prompt,
  coalesce(p.is_active, true),
  coalesce(p.created_at, now()),
  coalesce(p.updated_at, now())
from public.products p
where not exists (
  select 1
  from public.flow_definitions fd
  where fd.product_id = p.id
);

-- ---------------------------------------------------------------------------
-- 3) Mapping temporal product/campaign -> flow
-- ---------------------------------------------------------------------------
create temporary table _legacy_product_flow_map (
  product_id uuid primary key,
  flow_id uuid not null
) on commit drop;

-- primero mapeo por flow_definitions (mas preciso)
insert into _legacy_product_flow_map (product_id, flow_id)
select distinct
  fd.product_id,
  f.id
from public.flow_definitions fd
join public.flows f on f.legacy_flow_definition_id = fd.id
where fd.product_id is not null;

-- fallback: productos sin flow_definition
insert into _legacy_product_flow_map (product_id, flow_id)
select
  p.id as product_id,
  f.id as flow_id
from public.products p
join public.flows f
  on f.organization_id = p.organization_id
 and f.name = p.name
 and f.legacy_flow_definition_id is null
where not exists (
  select 1 from _legacy_product_flow_map m where m.product_id = p.id
);

-- ---------------------------------------------------------------------------
-- 4) flow_steps y flow_step_messages apuntan a flows
-- ---------------------------------------------------------------------------
alter table public.flow_steps drop constraint if exists flow_steps_flow_id_fkey;

update public.flow_steps s
set flow_id = f.id,
    updated_at = now()
from public.flows f
where f.legacy_flow_definition_id = s.flow_id;

alter table public.flow_steps
  add constraint flow_steps_flow_id_fkey
  foreign key (flow_id) references public.flows(id) on delete cascade;

-- ---------------------------------------------------------------------------
-- 5) flow_id en instancias, conversaciones, mensajes, pagos, scheduled, templates
-- ---------------------------------------------------------------------------
alter table public.whatsapp_instances add column if not exists flow_id uuid references public.flows(id) on delete set null;

alter table public.conversations add column if not exists flow_id uuid references public.flows(id) on delete set null;
alter table public.messages add column if not exists flow_id uuid references public.flows(id) on delete set null;
alter table public.payments add column if not exists flow_id uuid references public.flows(id) on delete set null;
alter table public.scheduled_flow_messages add column if not exists flow_id uuid references public.flows(id) on delete set null;
alter table public.message_templates add column if not exists flow_id uuid references public.flows(id) on delete set null;

-- conversaciones: product_id -> flow_id
update public.conversations c
set flow_id = m.flow_id
from _legacy_product_flow_map m
where c.flow_id is null
  and c.product_id = m.product_id;

-- mensajes: product_id -> flow_id
update public.messages msg
set flow_id = m.flow_id
from _legacy_product_flow_map m
where msg.flow_id is null
  and msg.product_id = m.product_id;

-- pagos: product_id -> flow_id
update public.payments p
set flow_id = m.flow_id
from _legacy_product_flow_map m
where p.flow_id is null
  and p.product_id = m.product_id;

-- scheduled_flow_messages: product_id -> flow_id
update public.scheduled_flow_messages s
set flow_id = m.flow_id
from _legacy_product_flow_map m
where s.flow_id is null
  and s.product_id = m.product_id;

-- templates: campaign_id -> campaigns.product_id -> flow_id
update public.message_templates t
set flow_id = m.flow_id
from public.campaigns c
join _legacy_product_flow_map m on m.product_id = c.product_id
where t.flow_id is null
  and t.campaign_id = c.id;

-- indices nuevos
create index if not exists idx_instances_org_flow on public.whatsapp_instances(organization_id, flow_id);
create index if not exists idx_conversations_org_flow on public.conversations(organization_id, flow_id, updated_at desc);
create index if not exists idx_messages_org_flow on public.messages(organization_id, flow_id, created_at desc);
create index if not exists idx_payments_org_flow on public.payments(organization_id, flow_id, validated_at desc);
create index if not exists idx_scheduled_flow_pending on public.scheduled_flow_messages(organization_id, flow_id, scheduled_at) where status = 'pending';
create index if not exists idx_templates_org_flow on public.message_templates(organization_id, flow_id);

-- ---------------------------------------------------------------------------
-- 6) product_referrals -> flow_referrals
-- ---------------------------------------------------------------------------
alter table if exists public.product_referrals rename to flow_referrals;
alter index if exists public.idx_product_referrals_org_product rename to idx_flow_referrals_org_flow;
alter index if exists public.product_referrals_pkey rename to flow_referrals_pkey;

alter table public.flow_referrals rename column product_id to flow_id;
alter table public.flow_referrals drop constraint if exists product_referrals_product_id_fkey;
alter table public.flow_referrals drop constraint if exists flow_referrals_product_id_fkey;
alter table public.flow_referrals
  add constraint flow_referrals_flow_id_fkey
  foreign key (flow_id) references public.flows(id) on delete cascade;

update public.flow_referrals fr
set flow_id = m.flow_id
from _legacy_product_flow_map m
where fr.flow_id = m.product_id;

drop policy if exists product_referrals_member_all on public.flow_referrals;
drop policy if exists flow_referrals_member_all on public.flow_referrals;

create index if not exists idx_flow_referrals_org_flow on public.flow_referrals(organization_id, flow_id);

-- ---------------------------------------------------------------------------
-- 7) Limpieza columnas legacy
-- ---------------------------------------------------------------------------
alter table public.conversations drop column if exists product_id;
alter table public.conversations drop constraint if exists conversations_campaign_fk;
alter table public.conversations drop column if exists campaign_id;

alter table public.messages drop column if exists product_id;
alter table public.messages drop constraint if exists messages_campaign_fk;
alter table public.messages drop column if exists campaign_id;

alter table public.payments drop column if exists product_id;
alter table public.payments drop constraint if exists payments_campaign_fk;
alter table public.payments drop column if exists campaign_id;

alter table public.scheduled_flow_messages drop column if exists product_id;

alter table public.message_templates drop column if exists campaign_id;

alter table public.organizations drop column if exists bot_config;

-- ---------------------------------------------------------------------------
-- 8) Eliminar tablas legacy en orden seguro
-- ---------------------------------------------------------------------------
drop table if exists public.flow_actions;
drop table if exists public.flow_triggers;
drop table if exists public.flow_edges;
drop table if exists public.flow_nodes;
drop table if exists public.flow_versions;

drop table if exists public.flow_definitions;
drop table if exists public.campaigns;
drop table if exists public.products;

-- ---------------------------------------------------------------------------
-- 9) RPC transaccional: upsert_flow_tree(payload jsonb)
-- ---------------------------------------------------------------------------
create or replace function public.upsert_flow_tree(payload jsonb)
returns uuid
language plpgsql
security invoker
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

  if not public.is_org_member(v_org_id) then
    raise exception 'forbidden';
  end if;

  if v_flow_id is null then
    insert into public.flows (
      organization_id, name, trigger_phrase, trigger_first_word, keywords,
      no_match_behavior, system_prompt, is_active, created_at, updated_at
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
              '[^a-z0-9áéíóúüñ ]',
              '',
              'g'
            ),
            ' ',
            1
          ),
          ''
        ),
        'hola'
      ),
      coalesce(
        (
          select coalesce(array_agg(lower(trim(x))), '{}'::text[])
          from jsonb_array_elements_text(coalesce(payload->'keywords', '[]'::jsonb)) t(x)
          where trim(x) <> ''
        ),
        '{}'::text[]
      ),
      coalesce(nullif(payload->>'noMatchBehavior', ''), 'trigger'),
      nullif(payload->>'systemPrompt', ''),
      coalesce((payload->>'isActive')::boolean, true),
      v_now,
      v_now
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
              '[^a-z0-9áéíóúüñ ]',
              '',
              'g'
            ),
            ' ',
            1
          ),
          ''
        ),
        trigger_first_word
      ),
      keywords = coalesce(
        (
          select coalesce(array_agg(lower(trim(x))), '{}'::text[])
          from jsonb_array_elements_text(coalesce(payload->'keywords', '[]'::jsonb)) t(x)
          where trim(x) <> ''
        ),
        keywords
      ),
      no_match_behavior = coalesce(nullif(payload->>'noMatchBehavior', ''), no_match_behavior),
      system_prompt = case
        when payload ? 'systemPrompt' then nullif(payload->>'systemPrompt', '')
        else system_prompt
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
        v_flow_id,
        v_org_id,
        coalesce((v_step->>'position')::int, 0),
        coalesce((v_step->>'delaySeconds')::int, 0),
        '{}'::text[],
        nullif(v_step->>'label', ''),
        v_now,
        v_now
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
          v_step_id,
          v_org_id,
          coalesce((v_msg->>'position')::int, 0),
          coalesce(nullif(v_msg->>'messageType', '')::public.flow_message_type, 'text'::public.flow_message_type),
          nullif(v_msg->>'textContent', ''),
          nullif(v_msg->>'mediaUrl', ''),
          nullif(v_msg->>'filename', ''),
          nullif(v_msg->>'caption', ''),
          v_now,
          v_now
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

-- ---------------------------------------------------------------------------
-- 10) RLS + Policies (tenant)
-- ---------------------------------------------------------------------------
alter table public.flows enable row level security;
alter table public.flow_steps enable row level security;
alter table public.flow_step_messages enable row level security;
alter table public.flow_referrals enable row level security;
alter table public.whatsapp_instances enable row level security;
alter table public.message_templates enable row level security;
alter table public.conversations enable row level security;
alter table public.messages enable row level security;
alter table public.payments enable row level security;
alter table public.scheduled_flow_messages enable row level security;

drop policy if exists flows_member_all on public.flows;
create policy flows_member_all on public.flows
for all using (public.is_org_member(organization_id));

drop policy if exists flow_steps_member_all on public.flow_steps;
create policy flow_steps_member_all on public.flow_steps
for all using (public.is_org_member(organization_id));

drop policy if exists flow_step_messages_member_all on public.flow_step_messages;
create policy flow_step_messages_member_all on public.flow_step_messages
for all using (public.is_org_member(organization_id));

drop policy if exists flow_referrals_member_all on public.flow_referrals;
create policy flow_referrals_member_all on public.flow_referrals
for all using (public.is_org_member(organization_id));

drop policy if exists wa_instances_member_all on public.whatsapp_instances;
create policy wa_instances_member_all on public.whatsapp_instances
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

drop policy if exists scheduled_flow_messages_member_all on public.scheduled_flow_messages;
create policy scheduled_flow_messages_member_all on public.scheduled_flow_messages
for all using (public.is_org_member(organization_id));

-- legacy helper column ya no se necesita luego de migrar
alter table public.flows drop column if exists legacy_flow_definition_id;

commit;

-- ---------------------------------------------------------------------------
-- 11) Validacion post-migracion (ejecutar manualmente)
-- ---------------------------------------------------------------------------
-- A) RLS habilitado
-- select schemaname, tablename, rowsecurity
-- from pg_tables
-- where schemaname = 'public'
--   and tablename in (
--     'flows','flow_steps','flow_step_messages','flow_referrals',
--     'whatsapp_instances','message_templates','conversations','messages',
--     'payments','scheduled_flow_messages'
--   )
-- order by tablename;

-- B) Policies existentes
-- select schemaname, tablename, policyname, cmd, qual
-- from pg_policies
-- where schemaname = 'public'
--   and tablename in (
--     'flows','flow_steps','flow_step_messages','flow_referrals',
--     'whatsapp_instances','message_templates','conversations','messages',
--     'payments','scheduled_flow_messages'
--   )
-- order by tablename, policyname;

-- C) FKs residuales a tablas legacy (debe dar 0)
-- select conrelid::regclass as table_name, confrelid::regclass as referenced_table, conname
-- from pg_constraint
-- where contype = 'f'
--   and confrelid::regclass::text in ('public.products','public.campaigns','public.flow_definitions');
