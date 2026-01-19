-- ============================================================================
-- Trade Performance Stats Migration
-- Adds tables and functions for tracking trade response time, quote rate, etc.
-- ============================================================================

-- ============================================================================
-- 1. ADD RESPONSE TRACKING COLUMNS TO REQUEST_TARGETS
-- ============================================================================
-- Track when trades first respond to requests (accept, decline, message, etc.)

ALTER TABLE request_targets
ADD COLUMN IF NOT EXISTS first_action_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS first_action_type TEXT; -- 'accepted', 'declined', 'messaged', 'quoted'

COMMENT ON COLUMN request_targets.first_action_at IS 'Timestamp of first trade action on this request';
COMMENT ON COLUMN request_targets.first_action_type IS 'Type of first action: accepted, declined, messaged, quoted';

-- ============================================================================
-- 2. TRADE PERFORMANCE STATS TABLE (Materialized View Alternative)
-- ============================================================================
-- Stores computed performance metrics for trades, updated periodically

CREATE TABLE IF NOT EXISTS trade_performance_stats (
  profile_id UUID PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,

  -- Response time metrics
  avg_response_time_hours NUMERIC(10, 2),  -- Average hours to first response
  median_response_time_hours NUMERIC(10, 2), -- Median (P50) response time
  response_time_percentile INTEGER, -- What percentile this trade is in (0-100, higher = faster)

  -- Quote rate metrics
  requests_received_count INTEGER DEFAULT 0,
  requests_accepted_count INTEGER DEFAULT 0,
  quotes_sent_count INTEGER DEFAULT 0,
  quote_rate NUMERIC(5, 2), -- Percentage (0-100)

  -- Job completion metrics
  jobs_completed_count INTEGER DEFAULT 0,
  completion_rate NUMERIC(5, 2),

  -- Review metrics (cached from reviews table)
  review_count INTEGER DEFAULT 0,
  average_rating NUMERIC(3, 2),

  -- Metadata
  period_start DATE, -- Start of measurement period (rolling 90 days)
  period_end DATE,   -- End of measurement period
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT valid_quote_rate CHECK (quote_rate IS NULL OR (quote_rate >= 0 AND quote_rate <= 100)),
  CONSTRAINT valid_completion_rate CHECK (completion_rate IS NULL OR (completion_rate >= 0 AND completion_rate <= 100)),
  CONSTRAINT valid_rating CHECK (average_rating IS NULL OR (average_rating >= 1 AND average_rating <= 5))
);

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_trade_performance_stats_updated
ON trade_performance_stats(updated_at DESC);

-- ============================================================================
-- 3. PROFILE COMPLETION TRACKING
-- ============================================================================
-- Add profile_completion_percentage to profiles table

ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS profile_completion_percentage INTEGER DEFAULT 0;

COMMENT ON COLUMN profiles.profile_completion_percentage IS 'Cached profile completion percentage (0-100)';

-- ============================================================================
-- 4. RPC FUNCTION: GET TRADE HOME STATS
-- ============================================================================
-- Returns all stats needed for the trade home screen in one call

CREATE OR REPLACE FUNCTION rpc_get_trade_home_stats()
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_trade_id UUID;
  v_result JSON;
  v_response_time NUMERIC;
  v_quote_rate NUMERIC;
  v_avg_rating NUMERIC;
  v_review_count INTEGER;
  v_requests_received INTEGER;
  v_requests_accepted INTEGER;
  v_quotes_sent INTEGER;
  v_active_jobs INTEGER;
  v_active_value NUMERIC;
  v_completed_this_month INTEGER;
  v_earned_this_month NUMERIC;
  v_scheduled_count INTEGER;
  v_profile_completion INTEGER;
BEGIN
  -- Get current user's trade ID
  v_trade_id := auth.uid();

  IF v_trade_id IS NULL THEN
    RETURN NULL;
  END IF;

  -- Get response time from performance stats (if exists)
  SELECT
    COALESCE(avg_response_time_hours, median_response_time_hours),
    quote_rate,
    average_rating,
    review_count
  INTO v_response_time, v_quote_rate, v_avg_rating, v_review_count
  FROM trade_performance_stats
  WHERE profile_id = v_trade_id;

  -- If no cached stats, calculate live (for new trades)
  IF v_avg_rating IS NULL THEN
    SELECT
      COUNT(*),
      COALESCE(AVG(rating), 0)
    INTO v_review_count, v_avg_rating
    FROM reviews
    WHERE reviewee_id = v_trade_id
      AND reviewer_type = 'client';
  END IF;

  -- Calculate quote rate live if not cached
  IF v_quote_rate IS NULL THEN
    SELECT COUNT(*) INTO v_requests_accepted
    FROM request_targets
    WHERE trade_id = v_trade_id
      AND state ILIKE '%accepted%'
      AND created_at >= NOW() - INTERVAL '90 days';

    SELECT COUNT(*) INTO v_quotes_sent
    FROM tradify_native_app_db
    WHERE trade_id = v_trade_id
      AND status IN ('sent', 'accepted', 'declined', 'expired', 'completed', 'awaiting_completion')
      AND created_at >= NOW() - INTERVAL '90 days';

    IF v_requests_accepted > 0 THEN
      v_quote_rate := ROUND((v_quotes_sent::NUMERIC / v_requests_accepted::NUMERIC) * 100, 0);
    END IF;
  END IF;

  -- Get active jobs count and value
  SELECT
    COUNT(*),
    COALESCE(SUM(grand_total), 0)
  INTO v_active_jobs, v_active_value
  FROM tradify_native_app_db
  WHERE trade_id = v_trade_id
    AND status IN ('accepted', 'awaiting_completion');

  -- Get completed this month
  SELECT
    COUNT(*),
    COALESCE(SUM(grand_total), 0)
  INTO v_completed_this_month, v_earned_this_month
  FROM tradify_native_app_db
  WHERE trade_id = v_trade_id
    AND status = 'completed'
    AND issued_at >= DATE_TRUNC('month', CURRENT_DATE);

  -- Get scheduled appointments count
  SELECT COUNT(*) INTO v_scheduled_count
  FROM appointments
  WHERE trade_id = v_trade_id
    AND scheduled_at >= NOW()
    AND status != 'cancelled';

  -- Get profile completion
  SELECT profile_completion_percentage INTO v_profile_completion
  FROM profiles
  WHERE id = v_trade_id;

  -- Build result
  v_result := json_build_object(
    'response_time_hours', v_response_time,
    'quote_rate', v_quote_rate,
    'average_rating', ROUND(v_avg_rating::NUMERIC, 1),
    'review_count', COALESCE(v_review_count, 0),
    'active_jobs', COALESCE(v_active_jobs, 0),
    'active_value', COALESCE(v_active_value, 0),
    'completed_this_month', COALESCE(v_completed_this_month, 0),
    'earned_this_month', COALESCE(v_earned_this_month, 0),
    'scheduled_count', COALESCE(v_scheduled_count, 0),
    'profile_completion', COALESCE(v_profile_completion, 0)
  );

  RETURN v_result;
END;
$$;

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION rpc_get_trade_home_stats() TO authenticated;

-- ============================================================================
-- 5. FUNCTION: CALCULATE PROFILE COMPLETION
-- ============================================================================

CREATE OR REPLACE FUNCTION calculate_profile_completion(p_profile_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_profile RECORD;
  v_total INTEGER := 0;
BEGIN
  SELECT * INTO v_profile
  FROM profiles
  WHERE id = p_profile_id;

  IF NOT FOUND THEN
    RETURN 0;
  END IF;

  -- Basic info (40%)
  IF v_profile.full_name IS NOT NULL AND v_profile.full_name != '' THEN
    v_total := v_total + 10;
  END IF;

  IF v_profile.business_name IS NOT NULL AND v_profile.business_name != '' THEN
    v_total := v_total + 10;
  END IF;

  IF v_profile.photo_url IS NOT NULL AND v_profile.photo_url != '' THEN
    v_total := v_total + 15;
  END IF;

  IF v_profile.bio IS NOT NULL AND v_profile.bio != '' THEN
    v_total := v_total + 10;
  END IF;

  IF v_profile.job_titles IS NOT NULL AND array_length(v_profile.job_titles, 1) > 0 THEN
    v_total := v_total + 10;
  END IF;

  -- Location (15%)
  IF v_profile.base_postcode IS NOT NULL AND v_profile.base_postcode != '' THEN
    v_total := v_total + 10;
  END IF;

  IF v_profile.service_radius_km IS NOT NULL THEN
    v_total := v_total + 5;
  END IF;

  -- Verification (30%)
  IF v_profile.verification IS NOT NULL THEN
    IF (v_profile.verification->>'photo_id') = 'verified' THEN
      v_total := v_total + 10;
    END IF;

    IF (v_profile.verification->>'insurance') = 'verified' THEN
      v_total := v_total + 10;
    END IF;

    IF (v_profile.verification->>'credentials') = 'verified' THEN
      v_total := v_total + 10;
    END IF;
  END IF;

  RETURN v_total;
END;
$$;

-- ============================================================================
-- 6. TRIGGER: UPDATE PROFILE COMPLETION ON CHANGE
-- ============================================================================

CREATE OR REPLACE FUNCTION trigger_update_profile_completion()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.profile_completion_percentage := calculate_profile_completion(NEW.id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_update_profile_completion ON profiles;

CREATE TRIGGER trg_update_profile_completion
BEFORE INSERT OR UPDATE ON profiles
FOR EACH ROW
EXECUTE FUNCTION trigger_update_profile_completion();

-- ============================================================================
-- 7. TRIGGER: TRACK FIRST RESPONSE TIME
-- ============================================================================

CREATE OR REPLACE FUNCTION trigger_track_first_response()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- Only update if first_action_at is NULL (first response)
  IF OLD.first_action_at IS NULL THEN
    -- Check if state changed to something actionable
    IF NEW.state IS DISTINCT FROM OLD.state THEN
      IF NEW.state ILIKE '%accepted%' THEN
        NEW.first_action_at := NOW();
        NEW.first_action_type := 'accepted';
      ELSIF NEW.state ILIKE '%declined%' THEN
        NEW.first_action_at := NOW();
        NEW.first_action_type := 'declined';
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_track_first_response ON request_targets;

CREATE TRIGGER trg_track_first_response
BEFORE UPDATE ON request_targets
FOR EACH ROW
EXECUTE FUNCTION trigger_track_first_response();

-- ============================================================================
-- 8. FUNCTION: REFRESH TRADE PERFORMANCE STATS (Run via cron)
-- ============================================================================

CREATE OR REPLACE FUNCTION refresh_trade_performance_stats(p_trade_id UUID DEFAULT NULL)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_trade RECORD;
  v_avg_response NUMERIC;
  v_median_response NUMERIC;
  v_requests_received INTEGER;
  v_requests_accepted INTEGER;
  v_quotes_sent INTEGER;
  v_quote_rate NUMERIC;
  v_review_count INTEGER;
  v_avg_rating NUMERIC;
  v_period_start DATE;
  v_period_end DATE;
BEGIN
  v_period_start := CURRENT_DATE - INTERVAL '90 days';
  v_period_end := CURRENT_DATE;

  -- Process all trades or specific trade
  FOR v_trade IN
    SELECT id FROM profiles
    WHERE role = 'trades'
      AND (p_trade_id IS NULL OR id = p_trade_id)
  LOOP
    -- Calculate average response time
    SELECT
      AVG(EXTRACT(EPOCH FROM (first_action_at - created_at)) / 3600),
      PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (first_action_at - created_at)) / 3600)
    INTO v_avg_response, v_median_response
    FROM request_targets
    WHERE trade_id = v_trade.id
      AND first_action_at IS NOT NULL
      AND created_at >= v_period_start;

    -- Calculate quote rate
    SELECT COUNT(*) INTO v_requests_received
    FROM request_targets
    WHERE trade_id = v_trade.id
      AND created_at >= v_period_start;

    SELECT COUNT(*) INTO v_requests_accepted
    FROM request_targets
    WHERE trade_id = v_trade.id
      AND state ILIKE '%accepted%'
      AND created_at >= v_period_start;

    SELECT COUNT(*) INTO v_quotes_sent
    FROM tradify_native_app_db
    WHERE trade_id = v_trade.id
      AND status IN ('sent', 'accepted', 'declined', 'expired', 'completed', 'awaiting_completion')
      AND created_at >= v_period_start;

    IF v_requests_accepted > 0 THEN
      v_quote_rate := ROUND((v_quotes_sent::NUMERIC / v_requests_accepted::NUMERIC) * 100, 0);
    ELSE
      v_quote_rate := NULL;
    END IF;

    -- Get review stats
    SELECT
      COUNT(*),
      COALESCE(AVG(rating), 0)
    INTO v_review_count, v_avg_rating
    FROM reviews
    WHERE reviewee_id = v_trade.id
      AND reviewer_type = 'client';

    -- Upsert stats
    INSERT INTO trade_performance_stats (
      profile_id,
      avg_response_time_hours,
      median_response_time_hours,
      requests_received_count,
      requests_accepted_count,
      quotes_sent_count,
      quote_rate,
      review_count,
      average_rating,
      period_start,
      period_end,
      updated_at
    ) VALUES (
      v_trade.id,
      ROUND(v_avg_response, 2),
      ROUND(v_median_response, 2),
      v_requests_received,
      v_requests_accepted,
      v_quotes_sent,
      v_quote_rate,
      v_review_count,
      ROUND(v_avg_rating, 2),
      v_period_start,
      v_period_end,
      NOW()
    )
    ON CONFLICT (profile_id) DO UPDATE SET
      avg_response_time_hours = EXCLUDED.avg_response_time_hours,
      median_response_time_hours = EXCLUDED.median_response_time_hours,
      requests_received_count = EXCLUDED.requests_received_count,
      requests_accepted_count = EXCLUDED.requests_accepted_count,
      quotes_sent_count = EXCLUDED.quotes_sent_count,
      quote_rate = EXCLUDED.quote_rate,
      review_count = EXCLUDED.review_count,
      average_rating = EXCLUDED.average_rating,
      period_start = EXCLUDED.period_start,
      period_end = EXCLUDED.period_end,
      updated_at = NOW();

  END LOOP;
END;
$$;

-- ============================================================================
-- 9. RLS POLICIES FOR TRADE_PERFORMANCE_STATS
-- ============================================================================

ALTER TABLE trade_performance_stats ENABLE ROW LEVEL SECURITY;

-- Trades can read their own stats
CREATE POLICY "Trades can view own performance stats"
ON trade_performance_stats
FOR SELECT
TO authenticated
USING (profile_id = auth.uid());

-- Service role can do everything (for cron jobs)
CREATE POLICY "Service role full access to performance stats"
ON trade_performance_stats
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- ============================================================================
-- 10. INITIAL DATA POPULATION
-- ============================================================================

-- Update all existing profiles with completion percentage
UPDATE profiles
SET profile_completion_percentage = calculate_profile_completion(id)
WHERE role = 'trades';

-- Run initial stats refresh for all trades
SELECT refresh_trade_performance_stats();

-- ============================================================================
-- NOTES:
--
-- To set up automated refresh via pg_cron (run this in Supabase SQL editor):
--
-- SELECT cron.schedule(
--   'refresh-trade-performance-stats',
--   '0 */6 * * *',  -- Every 6 hours
--   $$SELECT refresh_trade_performance_stats()$$
-- );
--
-- ============================================================================
