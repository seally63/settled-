-- Migration: Quote Rate Grace Period
-- Date: 2026-01-25
-- Description: Updates quote rate calculation to include a 3-day grace period
-- after accepting a request before it affects the trade's quote rate.
-- This prevents the rate from dropping immediately when accepting requests.

-- ============================================================================
-- 1. UPDATE RPC_GET_TRADE_HOME_STATS TO USE GRACE PERIOD
-- ============================================================================

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
  v_requests_accepted INTEGER;
  v_mature_accepted INTEGER;
  v_quotes_sent INTEGER;
  v_active_jobs INTEGER;
  v_active_value NUMERIC;
  v_completed_this_month INTEGER;
  v_earned_this_month NUMERIC;
  v_scheduled_count INTEGER;
  v_profile_completion INTEGER;
  v_grace_period INTERVAL := '3 days';
BEGIN
  -- Get current user's trade ID
  v_trade_id := auth.uid();

  IF v_trade_id IS NULL THEN
    RETURN NULL;
  END IF;

  -- Get response time from performance stats (if exists)
  SELECT
    COALESCE(avg_response_time_hours, median_response_time_hours),
    NULL, -- Will calculate quote rate fresh
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

  -- Calculate quote rate with 3-day grace period
  -- Count quotes sent
  SELECT COUNT(DISTINCT request_id) INTO v_quotes_sent
  FROM tradify_native_app_db
  WHERE trade_id = v_trade_id
    AND status IN ('sent', 'accepted', 'declined', 'expired', 'completed', 'awaiting_completion')
    AND created_at >= NOW() - INTERVAL '90 days';

  -- Count "mature" accepted requests:
  -- - Accepted more than 3 days ago, OR
  -- - Has a quote (regardless of age)
  SELECT COUNT(*) INTO v_mature_accepted
  FROM request_targets rt
  WHERE rt.trade_id = v_trade_id
    AND rt.state ILIKE '%accepted%'
    AND rt.created_at >= NOW() - INTERVAL '90 days'
    AND (
      -- Either has a quote sent
      EXISTS (
        SELECT 1 FROM tradify_native_app_db q
        WHERE q.request_id = rt.request_id
          AND q.trade_id = v_trade_id
          AND q.status IN ('sent', 'accepted', 'declined', 'expired', 'completed', 'awaiting_completion')
      )
      -- Or accepted more than 3 days ago (past grace period)
      OR (rt.first_action_at IS NOT NULL AND rt.first_action_at < NOW() - v_grace_period)
    );

  IF v_mature_accepted > 0 THEN
    v_quote_rate := ROUND((v_quotes_sent::NUMERIC / v_mature_accepted::NUMERIC) * 100, 0);
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

-- ============================================================================
-- 2. UPDATE REFRESH_TRADE_PERFORMANCE_STATS TO USE GRACE PERIOD
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
  v_mature_accepted INTEGER;
  v_quotes_sent INTEGER;
  v_quote_rate NUMERIC;
  v_review_count INTEGER;
  v_avg_rating NUMERIC;
  v_period_start DATE;
  v_period_end DATE;
  v_grace_period INTERVAL := '3 days';
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

    -- Calculate request counts
    SELECT COUNT(*) INTO v_requests_received
    FROM request_targets
    WHERE trade_id = v_trade.id
      AND created_at >= v_period_start;

    SELECT COUNT(*) INTO v_requests_accepted
    FROM request_targets
    WHERE trade_id = v_trade.id
      AND state ILIKE '%accepted%'
      AND created_at >= v_period_start;

    -- Count quotes sent
    SELECT COUNT(DISTINCT request_id) INTO v_quotes_sent
    FROM tradify_native_app_db
    WHERE trade_id = v_trade.id
      AND status IN ('sent', 'accepted', 'declined', 'expired', 'completed', 'awaiting_completion')
      AND created_at >= v_period_start;

    -- Count "mature" accepted requests (with grace period)
    SELECT COUNT(*) INTO v_mature_accepted
    FROM request_targets rt
    WHERE rt.trade_id = v_trade.id
      AND rt.state ILIKE '%accepted%'
      AND rt.created_at >= v_period_start
      AND (
        -- Either has a quote sent
        EXISTS (
          SELECT 1 FROM tradify_native_app_db q
          WHERE q.request_id = rt.request_id
            AND q.trade_id = v_trade.id
            AND q.status IN ('sent', 'accepted', 'declined', 'expired', 'completed', 'awaiting_completion')
        )
        -- Or accepted more than 3 days ago (past grace period)
        OR (rt.first_action_at IS NOT NULL AND rt.first_action_at < NOW() - v_grace_period)
      );

    IF v_mature_accepted > 0 THEN
      v_quote_rate := ROUND((v_quotes_sent::NUMERIC / v_mature_accepted::NUMERIC) * 100, 0);
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
-- 3. REFRESH STATS FOR ALL TRADES WITH NEW CALCULATION
-- ============================================================================

SELECT refresh_trade_performance_stats();
