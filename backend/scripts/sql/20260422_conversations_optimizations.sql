-- ─────────────────────────────────────────────────────────────────
-- Optimization 1: timestamp columns on conversations
--   last_inbound_at  — updated by trigger on inbound message insert
--   last_outbound_at — updated by trigger on outbound message insert
--
-- These columns turn the hasUnread filter from O(N×M) in-memory
-- computation into a pure SQL comparison with an index.
-- ─────────────────────────────────────────────────────────────────

ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS last_inbound_at  timestamptz,
  ADD COLUMN IF NOT EXISTS last_outbound_at timestamptz;

-- Backfill from existing messages
UPDATE conversations c
SET last_inbound_at = sub.max_ts
FROM (
  SELECT conversation_id, MAX(created_at) AS max_ts
  FROM messages
  WHERE direction = 'inbound'
  GROUP BY conversation_id
) sub
WHERE c.id = sub.conversation_id;

UPDATE conversations c
SET last_outbound_at = sub.max_ts
FROM (
  SELECT conversation_id, MAX(created_at) AS max_ts
  FROM messages
  WHERE direction = 'outbound'
  GROUP BY conversation_id
) sub
WHERE c.id = sub.conversation_id;

-- ─────────────────────────────────────────────────────────────────
-- Trigger: keep last_inbound_at / last_outbound_at in sync
-- ─────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION trg_sync_conversation_timestamps()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.direction = 'inbound' THEN
    UPDATE conversations
       SET last_inbound_at = NEW.created_at
     WHERE id = NEW.conversation_id
       AND (last_inbound_at IS NULL OR NEW.created_at > last_inbound_at);
  ELSIF NEW.direction = 'outbound' THEN
    UPDATE conversations
       SET last_outbound_at = NEW.created_at
     WHERE id = NEW.conversation_id
       AND (last_outbound_at IS NULL OR NEW.created_at > last_outbound_at);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_messages_sync_conversation_timestamps ON messages;
CREATE TRIGGER trg_messages_sync_conversation_timestamps
  AFTER INSERT ON messages
  FOR EACH ROW
  EXECUTE FUNCTION trg_sync_conversation_timestamps();

-- ─────────────────────────────────────────────────────────────────
-- Indexes for hasUnread filter and sorted list queries
-- ─────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_conversations_org_updated
  ON conversations (organization_id, updated_at DESC NULLS LAST);

CREATE INDEX IF NOT EXISTS idx_conversations_last_inbound
  ON conversations (organization_id, last_inbound_at DESC NULLS LAST)
  WHERE last_inbound_at IS NOT NULL;


-- ─────────────────────────────────────────────────────────────────
-- RPC: get_conversations_list
--
-- Replaces the 3-roundtrip Node.js logic (conversations + messages
-- + ad_click_logs) with a single SQL call.
-- Handles: state/search/flowId/fromAd/adSourceId/hasUnread filters,
--          pagination, last message, unread count, and ad name.
-- ─────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION get_conversations_list(
  p_org_id        uuid,
  p_state         text    DEFAULT NULL,
  p_search        text    DEFAULT NULL,
  p_flow_id       text    DEFAULT NULL,
  p_from_ad       boolean DEFAULT false,
  p_ad_source_id  text    DEFAULT NULL,
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
    -- Resolve phones when filtering by ad source or fromAd flag
    SELECT DISTINCT al.phone
    FROM   ad_click_logs al
    WHERE  al.organization_id = p_org_id
      AND  (
             (p_ad_source_id IS NOT NULL AND al.source_id = p_ad_source_id)
          OR (p_from_ad AND p_ad_source_id IS NULL)
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
        (NOT p_from_ad AND p_ad_source_id IS NULL)
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
  -- Early-exit when ad filter is active but no phones matched
  ad_count AS (
    SELECT COUNT(*)::int AS cnt FROM ad_phones
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
