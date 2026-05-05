-- Fix: payments validated manually on a later day were appearing in today's
-- reports because the fallback date was validated_at (= when the agent clicked
-- "validated"), not when the comprobante actually arrived.
--
-- Solution: add received_at (set once at insert time = when the bot processes
-- the comprobante). Use COALESCE(receipt_date, received_at) as the sale date.
-- validated_at is kept for auditing only.

ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS received_at timestamptz;

-- Backfill existing rows: prefer receipt_date, then validated_at, then now()
UPDATE public.payments
  SET received_at = COALESCE(receipt_date, validated_at, now());

ALTER TABLE public.payments
  ALTER COLUMN received_at SET NOT NULL,
  ALTER COLUMN received_at SET DEFAULT now();

-- Replace the sale-date index to use received_at as fallback
DROP INDEX IF EXISTS idx_payments_sale_date;

CREATE INDEX IF NOT EXISTS idx_payments_sale_date
  ON public.payments (organization_id, COALESCE(receipt_date, received_at) DESC)
  WHERE state = 'validated';

-- Update get_reports_analytics to use received_at
CREATE OR REPLACE FUNCTION public.get_reports_analytics(
  p_organization_id uuid,
  p_from timestamptz,
  p_to timestamptz,
  p_instance_ids uuid[] default null,
  p_flow_ids uuid[] default null,
  p_granularity text default 'day',
  p_page integer default 1,
  p_page_size integer default 20,
  p_timezone text default 'America/Bogota'
)
returns jsonb
language plpgsql
stable
as $$
declare
  v_result jsonb;
begin
  with filtered_payments as (
    select
      p.id,
      p.validated_at,
      p.receipt_date,
      p.received_at,
      coalesce(p.receipt_date, p.received_at) as sale_date,
      p.amount,
      p.currency,
      p.phone,
      p.flow_id,
      p.whatsapp_instance_id,
      p.state
    from public.payments p
    where p.organization_id = p_organization_id
      and p.state = 'validated'
      and coalesce(p.receipt_date, p.received_at) >= p_from
      and coalesce(p.receipt_date, p.received_at) <= p_to
      and (p_instance_ids is null or array_length(p_instance_ids, 1) is null or p.whatsapp_instance_id = any(p_instance_ids))
      and (p_flow_ids is null or array_length(p_flow_ids, 1) is null or p.flow_id = any(p_flow_ids))
  ),
  filtered_conversations as (
    select
      c.id,
      c.stage,
      c.started_at,
      c.flow_id,
      c.whatsapp_instance_id
    from public.conversations c
    where c.organization_id = p_organization_id
      and c.started_at >= p_from
      and c.started_at <= p_to
      and (p_instance_ids is null or array_length(p_instance_ids, 1) is null or c.whatsapp_instance_id = any(p_instance_ids))
      and (p_flow_ids is null or array_length(p_flow_ids, 1) is null or c.flow_id = any(p_flow_ids))
  ),
  kpis as (
    select
      coalesce(sum(fp.amount), 0)::numeric as revenue_total,
      count(fp.id)::integer as sales_count
    from filtered_payments fp
  ),
  conv_count as (
    select count(fc.id)::integer as conversations_count
    from filtered_conversations fc
  ),
  payments_by_bucket as (
    select
      case
        when p_granularity = 'month' then to_char(date_trunc('month', fp.sale_date at time zone p_timezone), 'YYYY-MM')
        when p_granularity = 'week' then to_char(date_trunc('week', fp.sale_date at time zone p_timezone), 'IYYY-"W"IW')
        else to_char(date_trunc('day', fp.sale_date at time zone p_timezone), 'YYYY-MM-DD')
      end as bucket,
      coalesce(sum(fp.amount), 0)::numeric as revenue,
      count(fp.id)::integer as sales
    from filtered_payments fp
    group by 1
  ),
  conv_by_bucket as (
    select
      case
        when p_granularity = 'month' then to_char(date_trunc('month', fc.started_at at time zone p_timezone), 'YYYY-MM')
        when p_granularity = 'week' then to_char(date_trunc('week', fc.started_at at time zone p_timezone), 'IYYY-"W"IW')
        else to_char(date_trunc('day', fc.started_at at time zone p_timezone), 'YYYY-MM-DD')
      end as bucket,
      count(fc.id)::integer as conversations
    from filtered_conversations fc
    group by 1
  ),
  timeseries as (
    select
      coalesce(pb.bucket, cb.bucket) as bucket,
      coalesce(pb.revenue, 0)::numeric as revenue,
      coalesce(pb.sales, 0)::integer as sales,
      coalesce(cb.conversations, 0)::integer as conversations
    from payments_by_bucket pb
    full outer join conv_by_bucket cb on pb.bucket = cb.bucket
  ),
  by_flow as (
    select
      coalesce(fp.flow_id::text, 'sin_flow') as id,
      coalesce(f.name, 'Sin flow') as label,
      coalesce(sum(fp.amount), 0)::numeric as revenue,
      count(fp.id)::integer as sales
    from filtered_payments fp
    left join public.flows f on f.id = fp.flow_id
    group by 1, 2
    order by coalesce(sum(fp.amount), 0) desc
  ),
  by_instance as (
    select
      coalesce(fp.whatsapp_instance_id::text, 'sin_instancia') as id,
      coalesce(wi.label, 'Sin instancia') as label,
      coalesce(sum(fp.amount), 0)::numeric as revenue,
      count(fp.id)::integer as sales
    from filtered_payments fp
    left join public.whatsapp_instances wi on wi.id = fp.whatsapp_instance_id
    group by 1, 2
    order by coalesce(sum(fp.amount), 0) desc
  ),
  funnel as (
    select
      coalesce(fc.stage, 'desconocido') as stage,
      count(fc.id)::integer as count
    from filtered_conversations fc
    group by 1
    order by count(fc.id) desc
  ),
  table_total as (
    select count(fp.id)::integer as total
    from filtered_payments fp
  ),
  table_rows as (
    select
      fp.id as payment_id,
      fp.validated_at,
      fp.receipt_date,
      fp.amount,
      fp.currency,
      fp.phone,
      fp.flow_id,
      f.name as flow_name,
      fp.whatsapp_instance_id as instance_id,
      wi.label as instance_label,
      fp.state
    from filtered_payments fp
    left join public.flows f on f.id = fp.flow_id
    left join public.whatsapp_instances wi on wi.id = fp.whatsapp_instance_id
    order by fp.sale_date desc nulls last
    offset greatest((p_page - 1) * p_page_size, 0)
    limit greatest(p_page_size, 1)
  )
  select jsonb_build_object(
    'kpis', jsonb_build_object(
      'revenueTotal', coalesce((select revenue_total from kpis), 0),
      'salesCount', coalesce((select sales_count from kpis), 0),
      'avgTicket',
        case when coalesce((select sales_count from kpis), 0) > 0
          then coalesce((select revenue_total from kpis), 0) / (select sales_count from kpis)
          else 0 end,
      'conversationsCount', coalesce((select conversations_count from conv_count), 0),
      'conversionRate',
        case when coalesce((select conversations_count from conv_count), 0) > 0
          then (coalesce((select sales_count from kpis), 0)::numeric / (select conversations_count from conv_count))
          else 0 end
    ),
    'timeseries', coalesce((
      select jsonb_agg(jsonb_build_object(
        'bucket', t.bucket,
        'revenue', t.revenue,
        'sales', t.sales,
        'conversations', t.conversations
      ) order by t.bucket asc)
      from timeseries t
    ), '[]'::jsonb),
    'byFlow', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', bf.id,
        'label', bf.label,
        'revenue', bf.revenue,
        'sales', bf.sales
      ))
      from by_flow bf
    ), '[]'::jsonb),
    'byInstance', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', bi.id,
        'label', bi.label,
        'revenue', bi.revenue,
        'sales', bi.sales
      ))
      from by_instance bi
    ), '[]'::jsonb),
    'funnel', coalesce((
      select jsonb_agg(jsonb_build_object(
        'stage', fu.stage,
        'count', fu.count
      ))
      from funnel fu
    ), '[]'::jsonb),
    'table', jsonb_build_object(
      'items', coalesce((
        select jsonb_agg(jsonb_build_object(
          'paymentId', tr.payment_id::text,
          'validatedAt', tr.validated_at,
          'receiptDate', tr.receipt_date,
          'amount', tr.amount,
          'currency', tr.currency,
          'phone', tr.phone,
          'flowId', tr.flow_id::text,
          'flowName', tr.flow_name,
          'instanceId', tr.instance_id::text,
          'instanceLabel', tr.instance_label,
          'state', tr.state
        ))
        from table_rows tr
      ), '[]'::jsonb),
      'page', greatest(p_page, 1),
      'pageSize', greatest(p_page_size, 1),
      'total', coalesce((select total from table_total), 0)
    )
  )
  into v_result;

  return coalesce(v_result, '{}'::jsonb);
end;
$$;
