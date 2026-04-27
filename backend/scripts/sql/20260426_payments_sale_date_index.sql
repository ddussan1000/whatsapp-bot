-- Index to support COALESCE(receipt_date, validated_at) range queries
-- used in get_reports_analytics and payments list date filters.
-- Without this, PostgreSQL falls back to seq scan on the payments table.

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_payments_sale_date
ON public.payments (organization_id, COALESCE(receipt_date, validated_at) DESC)
WHERE state = 'validated';
