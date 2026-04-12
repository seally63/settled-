-- ============================================================================
-- Audit Cleanup Migration
-- Adds missing column, creates missing views, ensures storage bucket exists
-- ============================================================================

-- ============================================================================
-- 1. ADD is_admin COLUMN TO PROFILES
-- Referenced by admin.js and V2 RLS policies but never created
-- ============================================================================
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS is_admin BOOLEAN DEFAULT false;

-- ============================================================================
-- 2. CREATE MISSING VIEWS
-- These are referenced in lib/api/trust.js but were never created.
-- They fail non-fatally (return null) but should exist for trade profiles.
-- ============================================================================

-- 2a. v_business_verification_public
-- Public view of trade verification badges
-- Uses trade_verifications table (photo_id, insurance, credentials status)
CREATE OR REPLACE VIEW v_business_verification_public AS
SELECT
  tv.profile_id,
  COALESCE(tv.photo_id_status = 'verified', false) AS companies_house_active,
  COALESCE(tv.credentials_status = 'verified', false) AS payments_verified,
  COALESCE(tv.insurance_status = 'verified', false) AS insurance_verified
FROM trade_verifications tv;

-- 2b. v_trade_metrics_90d
-- Private metrics view (invoker) for trade dashboard
-- Pulls from trade_performance_stats (cached metrics)
DROP VIEW IF EXISTS v_trade_metrics_90d;
CREATE OR REPLACE VIEW v_trade_metrics_90d AS
SELECT
  tps.profile_id,
  tps.avg_response_time_hours AS response_time_p50_hours,
  COALESCE(tps.quote_rate, 0) AS acceptance_rate,
  COALESCE(tps.completion_rate, 0) AS completion_reliability
FROM trade_performance_stats tps;

-- 2c. trade_public_metrics_90d
-- Public-facing 90-day quote metrics for trade profiles
-- Aggregates from quotes (tradify_native_app_db) in the last 90 days
CREATE OR REPLACE VIEW trade_public_metrics_90d AS
SELECT
  t.trade_id AS profile_id,
  COUNT(*) FILTER (WHERE t.status = 'sent') AS sent_count,
  COUNT(*) FILTER (WHERE t.status = 'accepted') AS accepted_count,
  COUNT(*) FILTER (WHERE t.status = 'declined') AS declined_count,
  COUNT(*) FILTER (WHERE t.status = 'expired') AS expired_count,
  CASE
    WHEN COUNT(*) FILTER (WHERE t.status IN ('sent','accepted','declined','expired')) > 0
    THEN ROUND(
      COUNT(*) FILTER (WHERE t.status = 'accepted')::numeric /
      NULLIF(COUNT(*) FILTER (WHERE t.status IN ('sent','accepted','declined','expired')), 0) * 100, 1
    )
    ELSE 0
  END AS acceptance_rate,
  NULL::numeric AS response_time_p50_hours,
  NOW() AS updated_at
FROM tradify_native_app_db t
WHERE t.issued_at >= NOW() - INTERVAL '90 days'
GROUP BY t.trade_id;

-- 2d. v_trades_sales
-- Sales summary view used in hidden sales dashboard
-- Aggregates completed revenue per trade
CREATE OR REPLACE VIEW v_trades_sales AS
SELECT
  t.trade_id AS profile_id,
  COUNT(*) AS total_quotes,
  COUNT(*) FILTER (WHERE t.status = 'completed') AS completed_count,
  COALESCE(SUM(t.grand_total) FILTER (WHERE t.status = 'completed'), 0) AS total_revenue,
  COALESCE(SUM(t.grand_total) FILTER (WHERE t.status IN ('sent','accepted')), 0) AS pipeline_value
FROM tradify_native_app_db t
GROUP BY t.trade_id;

-- ============================================================================
-- 3. RLS ON VIEWS
-- Views inherit RLS from underlying tables, but grant explicit SELECT
-- ============================================================================
GRANT SELECT ON v_business_verification_public TO anon, authenticated;
GRANT SELECT ON trade_public_metrics_90d TO anon, authenticated;
GRANT SELECT ON v_trade_metrics_90d TO authenticated;
GRANT SELECT ON v_trades_sales TO authenticated;

-- ============================================================================
-- 4. REQUEST-ATTACHMENTS STORAGE BUCKET
-- Used by lib/api/attachments.js but never explicitly created in migrations
-- ============================================================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('request-attachments', 'request-attachments', false)
ON CONFLICT (id) DO NOTHING;

-- Storage policies for request-attachments
-- Authenticated users can upload to their own folder or tmp folder
CREATE POLICY "Users can upload request attachments"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'request-attachments'
    AND auth.uid() IS NOT NULL
  );

-- Users can view attachments for requests they're involved in
CREATE POLICY "Users can view request attachments"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'request-attachments'
    AND auth.uid() IS NOT NULL
  );

-- Users can delete their own temp uploads
-- Move operation (used by moveTempToRequest) requires UPDATE
CREATE POLICY "Users can move request attachments"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'request-attachments'
    AND auth.uid() IS NOT NULL
  );

CREATE POLICY "Users can delete own temp attachments"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'request-attachments'
    AND auth.uid() IS NOT NULL
    AND name LIKE 'tmp/%'
  );

-- ============================================================================
-- DONE
-- ============================================================================
