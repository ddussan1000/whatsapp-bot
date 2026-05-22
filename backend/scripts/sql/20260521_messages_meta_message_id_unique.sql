-- Deduplicate messages.meta_message_id and add UNIQUE index.
-- Required for BullMQ retry idempotency: allows INSERT ... ON CONFLICT DO NOTHING.
--
-- Safe to run: removes only true duplicates (keeps oldest row per meta_message_id).
-- Run this before deploying the backend change that adds ON CONFLICT DO NOTHING.

-- Step 1: Remove duplicates — keep the row with the earliest created_at
DELETE FROM public.messages
WHERE id IN (
  SELECT id FROM (
    SELECT
      id,
      ROW_NUMBER() OVER (
        PARTITION BY meta_message_id
        ORDER BY created_at ASC, id ASC
      ) AS rn
    FROM public.messages
    WHERE meta_message_id IS NOT NULL
  ) ranked
  WHERE rn > 1
);

-- Step 2: Add unique index (partial — excludes NULLs, which are not deduplicated)
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS messages_meta_message_id_unique
  ON public.messages (meta_message_id)
  WHERE meta_message_id IS NOT NULL;
