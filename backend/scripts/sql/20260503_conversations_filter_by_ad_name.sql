-- 1. Función auxiliar para el filtro de anuncios en /conversations/filters.
--    Reemplaza el fetch de 50K filas + dedup en app-memory con un DISTINCT en DB.
CREATE OR REPLACE FUNCTION get_conversation_filter_ads(p_org_id uuid)
RETURNS TABLE(ad_name text, campaign_name text)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT DISTINCT ON (COALESCE(acl.ad_name, acl.headline))
    COALESCE(acl.ad_name, acl.headline)::text AS ad_name,
    acl.campaign_name::text                   AS campaign_name
  FROM ad_click_logs acl
  WHERE acl.organization_id = p_org_id
    AND (acl.ad_name IS NOT NULL OR acl.headline IS NOT NULL)
  ORDER BY COALESCE(acl.ad_name, acl.headline), acl.created_at DESC;
$$;

-- 2. Reemplaza p_ad_source_id por p_ad_name en get_conversations_list
--    para agrupar el filtro de anuncios por nombre en lugar de source_id.
CREATE OR REPLACE FUNCTION get_conversations_list(
  p_org_id        uuid,
  p_state         text    DEFAULT NULL,
  p_search        text    DEFAULT NULL,
  p_flow_id       text    DEFAULT NULL,
  p_from_ad       boolean DEFAULT false,
  p_ad_name       text    DEFAULT NULL,
  p_has_unread    boolean DEFAULT false,
  p_page          int     DEFAULT 1,
  p_page_size     int     DEFAULT 20,
  p_sort_dir      text    DEFAULT 'desc'
)
RETURNS jsonb
LANGUAGE plpgsql STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_offset int := greatest((p_page - 1) * p_page_size, 0);
  v_limit  int := greatest(p_page_size, 1);
  v_result jsonb;
BEGIN
  WITH ad_phones AS (
    -- Resolve phones when filtering by ad name or fromAd flag
    SELECT DISTINCT al.phone
    FROM   ad_click_logs al
    WHERE  al.organization_id = p_org_id
      AND  (
             (p_ad_name IS NOT NULL AND COALESCE(al.ad_name, al.headline) = p_ad_name)
          OR (p_from_ad AND p_ad_name IS NULL)
           )
  ),
  filtered AS (
    SELECT
      c.id, c.phone, c.contact_name, c.stage,
      c.flow_id, c.flow_name, c.started_at, c.updated_at,
      c.last_read_at, c.last_inbound_at, c.last_outbound_at
    FROM conversations c
    WHERE c.organization_id = p_org_id
      AND (p_state   IS NULL OR c.stage   = p_state)
      AND (p_search  IS NULL OR c.phone   ILIKE '%' || p_search || '%')
      AND (p_flow_id IS NULL OR c.flow_id::text = p_flow_id)
      -- ad filter: skip join when no ad filter is active
      AND (
        (NOT p_from_ad AND p_ad_name IS NULL)
        OR c.phone IN (SELECT phone FROM ad_phones)
      )
      -- unread filter: pure SQL comparison using indexed columns
      AND (
        NOT p_has_unread
        OR (
          c.last_inbound_at IS NOT NULL
          AND c.last_inbound_at > GREATEST(
                COALESCE(c.last_read_at,     '-infinity'::timestamptz),
                COALESCE(c.last_outbound_at, '-infinity'::timestamptz)
              )
        )
      )
  ),
  total AS (
    SELECT COUNT(*)::int AS cnt FROM filtered
  ),
  paged AS (
    SELECT * FROM filtered
    ORDER BY
      CASE WHEN p_sort_dir = 'asc'  THEN updated_at END ASC  NULLS LAST,
      CASE WHEN p_sort_dir = 'desc' THEN updated_at END DESC NULLS LAST
    LIMIT  v_limit
    OFFSET v_offset
  ),
  last_msg AS (
    SELECT DISTINCT ON (m.conversation_id)
      m.conversation_id,
      m.text_body,
      m.direction,
      m.message_type
    FROM messages m
    WHERE m.conversation_id IN (SELECT id FROM paged)
    ORDER BY m.conversation_id, m.created_at DESC
  ),
  unread AS (
    SELECT
      m.conversation_id,
      COUNT(*)::int AS cnt
    FROM messages m
    JOIN paged p ON p.id = m.conversation_id
    WHERE m.direction = 'inbound'
      AND m.created_at > GREATEST(
            COALESCE(p.last_read_at,     '-infinity'::timestamptz),
            COALESCE(p.last_outbound_at, '-infinity'::timestamptz)
          )
    GROUP BY m.conversation_id
  ),
  ad_name AS (
    SELECT DISTINCT ON (al.phone)
      al.phone,
      COALESCE(al.ad_name, al.headline) AS name
    FROM ad_click_logs al
    WHERE al.organization_id = p_org_id
      AND al.phone IN (SELECT phone FROM paged)
    ORDER BY al.phone, al.created_at DESC
  )
  SELECT jsonb_build_object(
    'items', COALESCE(
      (
        SELECT jsonb_agg(
          jsonb_build_object(
            'id',                     p.id,
            'phone',                  p.phone,
            'contact_name',           p.contact_name,
            'stage',                  p.stage,
            'flow_id',                p.flow_id,
            'flow_name',              p.flow_name,
            'started_at',             p.started_at,
            'updated_at',             p.updated_at,
            'ad_name',                an.name,
            'last_message_text',      TRIM(lm.text_body),
            'last_message_type',      lm.message_type,
            'last_message_direction', lm.direction,
            'unread_count',           COALESCE(u.cnt, 0)
          )
          ORDER BY
            CASE WHEN p_sort_dir = 'asc'  THEN p.updated_at END ASC  NULLS LAST,
            CASE WHEN p_sort_dir = 'desc' THEN p.updated_at END DESC NULLS LAST
        )
        FROM paged p
        LEFT JOIN last_msg lm ON lm.conversation_id = p.id
        LEFT JOIN unread   u  ON u.conversation_id  = p.id
        LEFT JOIN ad_name  an ON an.phone            = p.phone
      ),
      '[]'::jsonb
    ),
    'total',    (SELECT cnt FROM total),
    'page',     p_page,
    'pageSize', p_page_size
  ) INTO v_result;

  RETURN v_result;
END;
$$;
