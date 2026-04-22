-- Per-instance threshold to flag high-value receipts for manual review.
-- If OCR detects an amount above this value the payment goes to
-- pending_manual_review and the conversation moves to revision_manual.
-- NULL means no threshold (all valid receipts auto-confirm as usual).
ALTER TABLE whatsapp_instances
  ADD COLUMN IF NOT EXISTS high_amount_threshold numeric;
