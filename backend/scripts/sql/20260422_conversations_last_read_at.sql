-- Track when an agent last marked a conversation as read.
-- Unread count = inbound messages after MAX(last_outbound_at, last_read_at).
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS last_read_at timestamptz;
