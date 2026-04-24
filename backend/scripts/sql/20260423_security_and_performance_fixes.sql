-- ─────────────────────────────────────────────────────────────────────────────
-- Security Advisor (ERROR) + Performance Advisor (WARN) fixes.
--
-- Security ERRORs addressed:
--   • Enable RLS on platform_admins and organization_signup_allowlist.
--
-- Security WARNs addressed:
--   • Add SET search_path = public to functions that were missing it:
--     current_user_id, claim_scheduled_messages, sync_conversation_flow_name,
--     trg_sync_conversation_timestamps, get_reports_analytics.
--   • Change is_platform_admin_user to SECURITY DEFINER so that enabling RLS
--     on platform_admins does not cause infinite recursion.
--
-- Performance WARNs addressed:
--   • org_media RLS: use (select auth.uid()) so the auth call is evaluated
--     once per query rather than once per row.
--   • organization_members / organization_invites: had two permissive SELECT
--     policies (FOR SELECT + FOR ALL). Replaced with one SELECT policy and
--     separate INSERT / UPDATE / DELETE policies.
--
-- NOTE: set_updated_at is a Supabase-managed moddatetime function — fix it in
-- Dashboard → Database → Functions → set_updated_at → add set search_path.
--
-- Safe to run multiple times.
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Fix is_platform_admin_user() → SECURITY DEFINER
--    Without this, enabling RLS on platform_admins causes infinite recursion:
--    the policy calls is_platform_admin_user() → queries platform_admins →
--    policy is re-evaluated → recursion.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.is_platform_admin_user()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.platform_admins pa
    WHERE lower(pa.email) = lower(coalesce((auth.jwt() ->> 'email')::text, ''))
  );
$$;


-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Enable RLS on platform_admins (Security ERROR)
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.platform_admins ENABLE ROW LEVEL SECURITY;

-- Only platform admins can view or modify this table.
-- Backend uses service_role (bypasses RLS), so these policies only gate
-- direct authenticated-client access.
DROP POLICY IF EXISTS platform_admins_all ON public.platform_admins;
CREATE POLICY platform_admins_all ON public.platform_admins
  FOR ALL USING (public.is_platform_admin_user());


-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Enable RLS on organization_signup_allowlist (Security ERROR)
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.organization_signup_allowlist ENABLE ROW LEVEL SECURITY;

-- Only platform admins can manage the allowlist.
-- The signup flow itself runs server-side via service_role.
DROP POLICY IF EXISTS org_signup_allowlist_all ON public.organization_signup_allowlist;
CREATE POLICY org_signup_allowlist_all ON public.organization_signup_allowlist
  FOR ALL USING (public.is_platform_admin_user());


-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Add SET search_path to functions missing it (Security WARNs)
-- ─────────────────────────────────────────────────────────────────────────────

-- current_user_id ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.current_user_id()
RETURNS uuid
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT auth.uid()
$$;

-- claim_scheduled_messages ────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.claim_scheduled_messages(batch_limit integer DEFAULT 50)
RETURNS SETOF public.scheduled_flow_messages
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.scheduled_flow_messages
  SET status = 'sent'
  WHERE id IN (
    SELECT id
    FROM public.scheduled_flow_messages
    WHERE status = 'pending'
      AND scheduled_at <= now()
    ORDER BY scheduled_at
    LIMIT batch_limit
    FOR UPDATE SKIP LOCKED
  )
  RETURNING *;
$$;

-- sync_conversation_flow_name ─────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.sync_conversation_flow_name()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.name IS DISTINCT FROM OLD.name THEN
    UPDATE public.conversations
    SET flow_name = NEW.name
    WHERE flow_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

-- trg_sync_conversation_timestamps ────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.trg_sync_conversation_timestamps()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.direction = 'inbound' THEN
    UPDATE public.conversations
       SET last_inbound_at = NEW.created_at
     WHERE id = NEW.conversation_id
       AND (last_inbound_at IS NULL OR NEW.created_at > last_inbound_at);
  ELSIF NEW.direction = 'outbound' THEN
    UPDATE public.conversations
       SET last_outbound_at = NEW.created_at
     WHERE id = NEW.conversation_id
       AND (last_outbound_at IS NULL OR NEW.created_at > last_outbound_at);
  END IF;
  RETURN NEW;
END;
$$;

-- get_reports_analytics ───────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_reports_analytics(
  p_organization_id uuid,
  p_from            timestamptz,
  p_to              timestamptz,
  p_instance_ids    uuid[]  DEFAULT NULL,
  p_flow_ids        uuid[]  DEFAULT NULL,
  p_granularity     text    DEFAULT 'day',
  p_page            integer DEFAULT 1,
  p_page_size       integer DEFAULT 20,
  p_timezone        text    DEFAULT 'America/Bogota'
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result jsonb;
BEGIN
  WITH filtered_payments AS (
    SELECT
      p.id,
      p.validated_at,
      p.amount,
      p.currency,
      p.phone,
      p.flow_id,
      p.whatsapp_instance_id,
      p.state
    FROM public.payments p
    WHERE p.organization_id = p_organization_id
      AND p.validated_at >= p_from
      AND p.validated_at <= p_to
      AND (p_instance_ids IS NULL OR array_length(p_instance_ids, 1) IS NULL OR p.whatsapp_instance_id = ANY(p_instance_ids))
      AND (p_flow_ids IS NULL OR array_length(p_flow_ids, 1) IS NULL OR p.flow_id = ANY(p_flow_ids))
  ),
  filtered_conversations AS (
    SELECT
      c.id,
      c.stage,
      c.started_at,
      c.flow_id,
      c.whatsapp_instance_id
    FROM public.conversations c
    WHERE c.organization_id = p_organization_id
      AND c.started_at >= p_from
      AND c.started_at <= p_to
      AND (p_instance_ids IS NULL OR array_length(p_instance_ids, 1) IS NULL OR c.whatsapp_instance_id = ANY(p_instance_ids))
      AND (p_flow_ids IS NULL OR array_length(p_flow_ids, 1) IS NULL OR c.flow_id = ANY(p_flow_ids))
  ),
  kpis AS (
    SELECT
      COALESCE(SUM(fp.amount), 0)::numeric AS revenue_total,
      COUNT(fp.id)::integer                AS sales_count
    FROM filtered_payments fp
  ),
  conv_count AS (
    SELECT COUNT(fc.id)::integer AS conversations_count
    FROM filtered_conversations fc
  ),
  payments_by_bucket AS (
    SELECT
      CASE
        WHEN p_granularity = 'month' THEN to_char(date_trunc('month', fp.validated_at AT TIME ZONE p_timezone), 'YYYY-MM')
        WHEN p_granularity = 'week'  THEN to_char(date_trunc('week',  fp.validated_at AT TIME ZONE p_timezone), 'IYYY-"W"IW')
        ELSE                              to_char(date_trunc('day',   fp.validated_at AT TIME ZONE p_timezone), 'YYYY-MM-DD')
      END AS bucket,
      COALESCE(SUM(fp.amount), 0)::numeric AS revenue,
      COUNT(fp.id)::integer                AS sales
    FROM filtered_payments fp
    GROUP BY 1
  ),
  conv_by_bucket AS (
    SELECT
      CASE
        WHEN p_granularity = 'month' THEN to_char(date_trunc('month', fc.started_at AT TIME ZONE p_timezone), 'YYYY-MM')
        WHEN p_granularity = 'week'  THEN to_char(date_trunc('week',  fc.started_at AT TIME ZONE p_timezone), 'IYYY-"W"IW')
        ELSE                              to_char(date_trunc('day',   fc.started_at AT TIME ZONE p_timezone), 'YYYY-MM-DD')
      END AS bucket,
      COUNT(fc.id)::integer AS conversations
    FROM filtered_conversations fc
    GROUP BY 1
  ),
  timeseries AS (
    SELECT
      COALESCE(pb.bucket, cb.bucket)  AS bucket,
      COALESCE(pb.revenue, 0)::numeric AS revenue,
      COALESCE(pb.sales, 0)::integer   AS sales,
      COALESCE(cb.conversations, 0)::integer AS conversations
    FROM payments_by_bucket pb
    FULL OUTER JOIN conv_by_bucket cb ON pb.bucket = cb.bucket
  ),
  by_flow AS (
    SELECT
      COALESCE(fp.flow_id::text, 'sin_flow') AS id,
      COALESCE(f.name, 'Sin flow')           AS label,
      COALESCE(SUM(fp.amount), 0)::numeric   AS revenue,
      COUNT(fp.id)::integer                  AS sales
    FROM filtered_payments fp
    LEFT JOIN public.flows f ON f.id = fp.flow_id
    GROUP BY 1, 2
    ORDER BY COALESCE(SUM(fp.amount), 0) DESC
  ),
  by_instance AS (
    SELECT
      COALESCE(fp.whatsapp_instance_id::text, 'sin_instancia') AS id,
      COALESCE(wi.label, 'Sin instancia')                      AS label,
      COALESCE(SUM(fp.amount), 0)::numeric                     AS revenue,
      COUNT(fp.id)::integer                                    AS sales
    FROM filtered_payments fp
    LEFT JOIN public.whatsapp_instances wi ON wi.id = fp.whatsapp_instance_id
    GROUP BY 1, 2
    ORDER BY COALESCE(SUM(fp.amount), 0) DESC
  ),
  funnel AS (
    SELECT
      COALESCE(fc.stage, 'desconocido') AS stage,
      COUNT(fc.id)::integer             AS count
    FROM filtered_conversations fc
    GROUP BY 1
    ORDER BY COUNT(fc.id) DESC
  ),
  table_total AS (
    SELECT COUNT(fp.id)::integer AS total FROM filtered_payments fp
  ),
  table_rows AS (
    SELECT
      fp.id                      AS payment_id,
      fp.validated_at,
      fp.amount,
      fp.currency,
      fp.phone,
      fp.flow_id,
      f.name                     AS flow_name,
      fp.whatsapp_instance_id    AS instance_id,
      wi.label                   AS instance_label,
      fp.state
    FROM filtered_payments fp
    LEFT JOIN public.flows f             ON f.id  = fp.flow_id
    LEFT JOIN public.whatsapp_instances wi ON wi.id = fp.whatsapp_instance_id
    ORDER BY fp.validated_at DESC NULLS LAST
    OFFSET greatest((p_page - 1) * p_page_size, 0)
    LIMIT  greatest(p_page_size, 1)
  )
  SELECT jsonb_build_object(
    'kpis', jsonb_build_object(
      'revenueTotal',        COALESCE((SELECT revenue_total FROM kpis), 0),
      'salesCount',          COALESCE((SELECT sales_count FROM kpis), 0),
      'avgTicket',
        CASE WHEN COALESCE((SELECT sales_count FROM kpis), 0) > 0
          THEN COALESCE((SELECT revenue_total FROM kpis), 0) / (SELECT sales_count FROM kpis)
          ELSE 0 END,
      'conversationsCount',  COALESCE((SELECT conversations_count FROM conv_count), 0),
      'conversionRate',
        CASE WHEN COALESCE((SELECT conversations_count FROM conv_count), 0) > 0
          THEN (COALESCE((SELECT sales_count FROM kpis), 0)::numeric / (SELECT conversations_count FROM conv_count))
          ELSE 0 END
    ),
    'timeseries', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'bucket',        t.bucket,
        'revenue',       t.revenue,
        'sales',         t.sales,
        'conversations', t.conversations
      ) ORDER BY t.bucket ASC)
      FROM timeseries t
    ), '[]'::jsonb),
    'byFlow', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id',      bf.id,
        'label',   bf.label,
        'revenue', bf.revenue,
        'sales',   bf.sales
      ))
      FROM by_flow bf
    ), '[]'::jsonb),
    'byInstance', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id',      bi.id,
        'label',   bi.label,
        'revenue', bi.revenue,
        'sales',   bi.sales
      ))
      FROM by_instance bi
    ), '[]'::jsonb),
    'funnel', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'stage', fu.stage,
        'count', fu.count
      ))
      FROM funnel fu
    ), '[]'::jsonb),
    'table', jsonb_build_object(
      'items', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'paymentId',     tr.payment_id::text,
          'validatedAt',   tr.validated_at,
          'amount',        tr.amount,
          'currency',      tr.currency,
          'phone',         tr.phone,
          'flowId',        tr.flow_id::text,
          'flowName',      tr.flow_name,
          'instanceId',    tr.instance_id::text,
          'instanceLabel', tr.instance_label,
          'state',         tr.state
        ))
        FROM table_rows tr
      ), '[]'::jsonb),
      'page',     greatest(p_page, 1),
      'pageSize', greatest(p_page_size, 1),
      'total',    COALESCE((SELECT total FROM table_total), 0)
    )
  )
  INTO v_result;

  RETURN COALESCE(v_result, '{}'::jsonb);
END;
$$;


-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Fix org_media RLS: (select auth.uid()) evaluated once per query, not per row
-- ─────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS org_media_select ON public.org_media;
DROP POLICY IF EXISTS org_media_insert ON public.org_media;
DROP POLICY IF EXISTS org_media_delete ON public.org_media;

CREATE POLICY org_media_select ON public.org_media
  FOR SELECT USING (
    organization_id IN (
      SELECT organization_id FROM public.organization_members
      WHERE user_id = (SELECT auth.uid())
    )
  );

CREATE POLICY org_media_insert ON public.org_media
  FOR INSERT WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM public.organization_members
      WHERE user_id = (SELECT auth.uid())
        AND role IN ('owner', 'admin', 'agent')
    )
  );

CREATE POLICY org_media_delete ON public.org_media
  FOR DELETE USING (
    organization_id IN (
      SELECT organization_id FROM public.organization_members
      WHERE user_id = (SELECT auth.uid())
        AND role IN ('owner', 'admin')
    )
  );


-- ─────────────────────────────────────────────────────────────────────────────
-- 6. Fix duplicate permissive SELECT on organization_members
--    Before: org_members_select_member (FOR SELECT) + org_members_manage_admin
--    (FOR ALL) → two permissive paths evaluated on every SELECT.
--    After: one SELECT policy + explicit INSERT / UPDATE / DELETE policies.
-- ─────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS org_members_select_member ON public.organization_members;
DROP POLICY IF EXISTS org_members_manage_admin  ON public.organization_members;

CREATE POLICY org_members_select ON public.organization_members
  FOR SELECT USING (public.is_org_member_or_platform_admin(organization_id));

CREATE POLICY org_members_insert ON public.organization_members
  FOR INSERT WITH CHECK (public.is_org_admin(organization_id));

CREATE POLICY org_members_update ON public.organization_members
  FOR UPDATE
  USING     (public.is_org_admin(organization_id))
  WITH CHECK (public.is_org_admin(organization_id));

CREATE POLICY org_members_delete ON public.organization_members
  FOR DELETE USING (public.is_org_admin(organization_id));


-- ─────────────────────────────────────────────────────────────────────────────
-- 7. Fix duplicate permissive SELECT on organization_invites (same pattern)
-- ─────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS org_invites_select_member ON public.organization_invites;
DROP POLICY IF EXISTS org_invites_manage_admin  ON public.organization_invites;

CREATE POLICY org_invites_select ON public.organization_invites
  FOR SELECT USING (public.is_org_member_or_platform_admin(organization_id));

CREATE POLICY org_invites_insert ON public.organization_invites
  FOR INSERT WITH CHECK (public.is_org_admin(organization_id));

CREATE POLICY org_invites_update ON public.organization_invites
  FOR UPDATE
  USING     (public.is_org_admin(organization_id))
  WITH CHECK (public.is_org_admin(organization_id));

CREATE POLICY org_invites_delete ON public.organization_invites
  FOR DELETE USING (public.is_org_admin(organization_id));


COMMIT;
