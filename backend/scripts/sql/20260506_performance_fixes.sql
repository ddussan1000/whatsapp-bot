-- Performance fixes for hot tables: messages and scheduled_flow_messages.
--
-- Root causes identified:
--   1. purgeOldMessages deletes without organization_id → can't use composite
--      idx_messages_org_created_at (leading column = organization_id) → full table scan
--   2. Default autovacuum too slow for high-churn tables (messages gets
--      INSERT + UPDATE + DELETE constantly) → dead tuple bloat → slow UPDATEs even by PK
--   3. scheduled_flow_messages audit updates pile up without batching → lock contention
--
-- Safe to run multiple times (IF NOT EXISTS / OR REPLACE).

-- ── 1. Index for purge DELETE (created_at only, no org_id leading column) ───
CREATE INDEX IF NOT EXISTS idx_messages_created_at
  ON messages (created_at);

-- ── 2. Autovacuum tuning for messages ────────────────────────────────────────
-- Default scale_factor=0.2 means vacuum kicks in after 20% of rows are dead.
-- For a large table this can be millions of dead tuples before vacuum runs.
-- 1% threshold keeps bloat minimal on a high-churn table.
ALTER TABLE messages SET (
  autovacuum_vacuum_scale_factor    = 0.01,
  autovacuum_analyze_scale_factor   = 0.005,
  autovacuum_vacuum_cost_delay      = 2,       -- ms, lower = faster vacuum
  autovacuum_vacuum_threshold       = 50
);

-- ── 3. Autovacuum tuning for scheduled_flow_messages ─────────────────────────
ALTER TABLE scheduled_flow_messages SET (
  autovacuum_vacuum_scale_factor    = 0.05,
  autovacuum_analyze_scale_factor   = 0.02,
  autovacuum_vacuum_cost_delay      = 2,
  autovacuum_vacuum_threshold       = 50
);

-- ── 4. Force vacuum to clear existing dead tuple bloat ───────────────────────
-- Run these manually after applying; they may take a few seconds on large tables.
-- VACUUM ANALYZE messages;
-- VACUUM ANALYZE scheduled_flow_messages;

-- ── 5. Purge runs via app cron (purgeOldMessages.ts) ────────────────────────
-- pg_cron not available on this Supabase project.
-- idx_messages_created_at (step 1) ensures the app-level DELETE uses an index
-- instead of a full table scan.

-- ── 6. Index for updateMessageDeliveryStatus fast lookup ──────────────────────
-- Replace idx_messages_org_meta_message_id (org, meta_message_id) with a
-- 3-column index that includes created_at so ORDER BY+LIMIT needs no sort.
--
-- IMPORTANT: run these two statements outside a transaction block in Supabase
-- Studio (do NOT wrap in BEGIN/COMMIT). CONCURRENTLY is not allowed inside
-- explicit transactions. Run them one at a time.
DROP INDEX CONCURRENTLY IF EXISTS idx_messages_org_meta_message_id;
CREATE INDEX CONCURRENTLY idx_messages_org_meta_msg_created
  ON messages (organization_id, meta_message_id, created_at DESC)
  WHERE meta_message_id IS NOT NULL;
