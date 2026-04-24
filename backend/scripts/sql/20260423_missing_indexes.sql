-- ─────────────────────────────────────────────────────────────────────────────
-- Missing indexes causing Disk IO budget exhaustion.
--
-- Root cause: get_reports_analytics and get_conversations_list do full table
-- scans on conversations, payments, messages, and ad_click_logs because the
-- most-used filter columns (started_at, validated_at, conversation_id+direction)
-- have no composite indexes with organization_id.
--
-- Run this in Supabase Studio SQL Editor.
-- All statements use IF NOT EXISTS — safe to run multiple times.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── conversations ─────────────────────────────────────────────────────────────
-- get_reports_analytics filters by (organization_id, started_at) on EVERY report
-- page load. Without this, Postgres scans the full conversations table.
CREATE INDEX IF NOT EXISTS idx_conversations_org_started_at
  ON conversations (organization_id, started_at DESC NULLS LAST);

-- Filter by stage in get_conversations_list (stage dropdown filter).
CREATE INDEX IF NOT EXISTS idx_conversations_org_stage
  ON conversations (organization_id, stage, updated_at DESC NULLS LAST);

-- Filter by flow_id in both get_conversations_list and get_reports_analytics.
CREATE INDEX IF NOT EXISTS idx_conversations_org_flow
  ON conversations (organization_id, flow_id, updated_at DESC NULLS LAST)
  WHERE flow_id IS NOT NULL;


-- ── payments ──────────────────────────────────────────────────────────────────
-- get_reports_analytics and the payments list both filter by (organization_id,
-- validated_at). This is the second most expensive sequential scan.
CREATE INDEX IF NOT EXISTS idx_payments_org_validated_at
  ON payments (organization_id, validated_at DESC NULLS LAST);

-- Payments list filters by state (pending_manual_review / validated / rejected).
CREATE INDEX IF NOT EXISTS idx_payments_org_state_validated
  ON payments (organization_id, state, validated_at DESC NULLS LAST);

-- Payments list and reports filter by flow_id.
CREATE INDEX IF NOT EXISTS idx_payments_org_flow
  ON payments (organization_id, flow_id, validated_at DESC NULLS LAST)
  WHERE flow_id IS NOT NULL;


-- ── messages ──────────────────────────────────────────────────────────────────
-- get_conversations_list uses DISTINCT ON (conversation_id) ORDER BY created_at DESC
-- to find the last message per conversation. Without this index, it sorts in memory.
CREATE INDEX IF NOT EXISTS idx_messages_conv_created_at
  ON messages (conversation_id, created_at DESC);

-- Unread count uses direction = 'inbound' + created_at comparison per conversation.
CREATE INDEX IF NOT EXISTS idx_messages_conv_direction_created
  ON messages (conversation_id, direction, created_at DESC);


-- ── ad_click_logs ─────────────────────────────────────────────────────────────
-- Ad referral stats filter by (organization_id, created_at) for the date range.
CREATE INDEX IF NOT EXISTS idx_ad_click_logs_org_created_at
  ON ad_click_logs (organization_id, created_at DESC NULLS LAST);

-- get_conversations_list and ad_referrals look up phones by organization.
CREATE INDEX IF NOT EXISTS idx_ad_click_logs_org_phone
  ON ad_click_logs (organization_id, phone, created_at DESC NULLS LAST);

-- Ad referral stats group by source_id for the "by ad" breakdown.
CREATE INDEX IF NOT EXISTS idx_ad_click_logs_org_source
  ON ad_click_logs (organization_id, source_id)
  WHERE source_id IS NOT NULL;


-- ─────────────────────────────────────────────────────────────────────────────
-- Optional: run these EXPLAIN queries in Supabase Studio after applying indexes
-- to confirm sequential scans are gone.
--
-- EXPLAIN (ANALYZE, BUFFERS)
-- SELECT * FROM conversations
-- WHERE organization_id = '<your-org-id>'
--   AND started_at >= NOW() - INTERVAL '30 days'
-- ORDER BY started_at DESC;
--
-- EXPLAIN (ANALYZE, BUFFERS)
-- SELECT * FROM payments
-- WHERE organization_id = '<your-org-id>'
--   AND validated_at >= NOW() - INTERVAL '30 days'
-- ORDER BY validated_at DESC;
-- ─────────────────────────────────────────────────────────────────────────────
