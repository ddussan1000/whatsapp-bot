-- RPC: get_ad_referral_stats
-- Replaces JS-level click/payment aggregation in /stats/ad-referrals.
-- All grouping and attribution done in DB; returns ready-to-use JSON.
--
-- Attribution window: 30 days before p_from (captures clicks that predate the period).
-- Totals are deduplicated by phone (fixes double-count for phones that clicked multiple ads).

CREATE OR REPLACE FUNCTION get_ad_referral_stats(
  p_org_id   uuid,
  p_from     timestamptz,
  p_to       timestamptz,
  p_flow_ids uuid[] DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_attr_from timestamptz := p_from - INTERVAL '30 days';
BEGIN
  RETURN (
    WITH

    -- All click events in the attribution window (period + 30d lookback)
    clicks AS (
      SELECT
        COALESCE(ad_name, headline, source_id, '__none__') AS ad_label,
        phone,
        (created_at >= p_from)                             AS in_period
      FROM ad_click_logs
      WHERE organization_id = p_org_id
        AND created_at BETWEEN v_attr_from AND p_to
        AND (p_flow_ids IS NULL OR flow_id = ANY(p_flow_ids))
    ),

    -- Click event count per ad in the selected period (all events, not deduped by phone)
    click_counts AS (
      SELECT ad_label, COUNT(*) AS clicks
      FROM clicks
      WHERE in_period
      GROUP BY ad_label
    ),

    -- One row per (ad, phone): whether phone clicked in the period
    ad_phone AS (
      SELECT ad_label, phone, bool_or(in_period) AS in_period
      FROM clicks
      GROUP BY ad_label, phone
    ),

    -- Payments for attributed phones within the selected period
    pay_by_phone AS (
      SELECT p.phone, COUNT(*) AS pay_count, SUM(p.amount)::numeric AS pay_revenue
      FROM payments p
      WHERE p.organization_id = p_org_id
        AND p.state = 'validated'
        AND COALESCE(p.receipt_date, p.validated_at) BETWEEN p_from AND p_to
        AND (p_flow_ids IS NULL OR p.flow_id = ANY(p_flow_ids))
        AND p.phone IN (SELECT DISTINCT phone FROM clicks)
      GROUP BY p.phone
    ),

    -- Per-ad aggregation
    ad_agg AS (
      SELECT
        ap.ad_label,
        COALESCE(MAX(cc.clicks), 0)               AS clicks,
        COUNT(*) FILTER (WHERE ap.in_period)      AS unique_leads,
        COALESCE(SUM(pbp.pay_count),   0)         AS conversions,
        COALESCE(SUM(pbp.pay_revenue), 0)::numeric AS revenue
      FROM ad_phone ap
      LEFT JOIN click_counts  cc  ON cc.ad_label  = ap.ad_label
      LEFT JOIN pay_by_phone  pbp ON pbp.phone    = ap.phone
      GROUP BY ap.ad_label
      HAVING COALESCE(MAX(cc.clicks), 0) > 0
          OR COALESCE(SUM(pbp.pay_count), 0) > 0
    ),

    -- Items ordered by clicks desc
    items AS (
      SELECT
        CASE WHEN ad_label = '__none__' THEN NULL ELSE ad_label END AS headline,
        clicks,
        unique_leads                                                AS "uniqueLeads",
        conversions,
        revenue,
        CASE WHEN unique_leads > 0
             THEN conversions::float / unique_leads
             ELSE 0
        END                                                         AS "conversionRate"
      FROM ad_agg
      ORDER BY clicks DESC
    ),

    -- Deduplicated totals: each paying phone counted once regardless of ad count
    totals AS (
      SELECT
        COALESCE(SUM(clicks), 0)                                          AS total_clicks,
        (SELECT COUNT(DISTINCT phone) FROM ad_phone WHERE in_period)      AS total_unique_leads,
        COALESCE((SELECT SUM(pay_count)   FROM pay_by_phone), 0)          AS total_conversions,
        COALESCE((SELECT SUM(pay_revenue) FROM pay_by_phone), 0)::numeric AS total_revenue
      FROM ad_agg
    )

    SELECT jsonb_build_object(
      'items', COALESCE(
        (SELECT jsonb_agg(to_jsonb(i) ORDER BY (to_jsonb(i) ->> 'clicks')::int DESC) FROM items i),
        '[]'::jsonb
      ),
      'totals', jsonb_build_object(
        'clicks',         t.total_clicks,
        'uniqueLeads',    t.total_unique_leads,
        'conversions',    t.total_conversions,
        'revenue',        t.total_revenue,
        'conversionRate', CASE WHEN t.total_unique_leads > 0
                               THEN t.total_conversions::float / t.total_unique_leads
                               ELSE 0
                          END
      )
    )
    FROM totals t
  );
END;
$$;
