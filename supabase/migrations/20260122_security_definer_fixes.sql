-- ============================================================================
-- Security Fix: Update SECURITY DEFINER Functions with Auth Checks
-- Date: 2026-01-22
-- Description: Add proper authentication validation to SECURITY DEFINER functions
-- ============================================================================

-- ============================================================
-- 1. FIX: get_client_active_requests
-- ISSUE: Accepts client_uuid parameter without validating against auth.uid()
-- FIX: Add auth check to ensure user can only see their own requests
-- ============================================================

CREATE OR REPLACE FUNCTION get_client_active_requests(
  client_uuid UUID
)
RETURNS TABLE (
  id UUID,
  suggested_title TEXT,
  service_type TEXT,
  category TEXT,
  status TEXT,
  created_at TIMESTAMPTZ,
  quotes_received INT,
  total_invited INT,
  lowest_quote NUMERIC,
  highest_quote NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- SECURITY: Validate that caller can only see their own requests
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF client_uuid != auth.uid() THEN
    RAISE EXCEPTION 'Unauthorized: cannot view other user requests';
  END IF;

  RETURN QUERY
  SELECT
    qr.id,
    qr.suggested_title,
    st.name AS service_type,
    sc.name AS category,
    qr.status,
    qr.created_at,
    -- Count quotes that have been sent (not draft or withdrawn)
    (
      SELECT COUNT(*)::INT
      FROM tradify_native_app_db q
      WHERE q.request_id = qr.id
        AND q.status NOT IN ('draft', 'withdrawn')
    ) AS quotes_received,
    -- Count all request targets (trades invited)
    (
      SELECT COUNT(DISTINCT rt.trade_id)::INT
      FROM request_targets rt
      WHERE rt.request_id = qr.id
    ) AS total_invited,
    -- Lowest quote total
    (
      SELECT MIN(q.grand_total)
      FROM tradify_native_app_db q
      WHERE q.request_id = qr.id
        AND q.status NOT IN ('draft', 'withdrawn')
        AND q.grand_total IS NOT NULL
    ) AS lowest_quote,
    -- Highest quote total
    (
      SELECT MAX(q.grand_total)
      FROM tradify_native_app_db q
      WHERE q.request_id = qr.id
        AND q.status NOT IN ('draft', 'withdrawn')
        AND q.grand_total IS NOT NULL
    ) AS highest_quote
  FROM quote_requests qr
  LEFT JOIN service_types st ON qr.service_type_id = st.id
  LEFT JOIN service_categories sc ON qr.category_id = sc.id
  WHERE qr.requester_id = client_uuid
    AND qr.status NOT IN ('completed', 'cancelled', 'expired')
    -- Exclude requests that have any quotes in a "done" state
    AND NOT EXISTS (
      SELECT 1 FROM tradify_native_app_db q
      WHERE q.request_id = qr.id
        AND q.status IN ('completed', 'declined', 'expired')
    )
  ORDER BY qr.created_at DESC
  LIMIT 3;
END;
$$;

-- ============================================================
-- 2. FIX: rpc_get_trade_home_stats
-- Already has auth.uid() check, but add explicit NULL check message
-- ============================================================

-- No changes needed - already validates auth.uid()

-- ============================================================
-- 3. FIX: find_trades_near_location
-- Public search function - no auth required (anonymous allowed)
-- But should validate input parameters
-- ============================================================

CREATE OR REPLACE FUNCTION find_trades_near_location(
  p_lat DOUBLE PRECISION,
  p_lon DOUBLE PRECISION,
  p_trade_type TEXT DEFAULT NULL,
  p_limit INTEGER DEFAULT 50
)
RETURNS TABLE (
  id UUID,
  full_name TEXT,
  business_name TEXT,
  trade_title TEXT,
  bio TEXT,
  photo_url TEXT,
  base_postcode TEXT,
  distance_km DOUBLE PRECISION
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_safe_limit INTEGER;
BEGIN
  -- VALIDATION: Ensure coordinates are valid
  IF p_lat IS NULL OR p_lon IS NULL THEN
    RAISE EXCEPTION 'Latitude and longitude are required';
  END IF;

  IF p_lat < -90 OR p_lat > 90 THEN
    RAISE EXCEPTION 'Invalid latitude: must be between -90 and 90';
  END IF;

  IF p_lon < -180 OR p_lon > 180 THEN
    RAISE EXCEPTION 'Invalid longitude: must be between -180 and 180';
  END IF;

  -- VALIDATION: Limit trade_type length to prevent abuse
  IF p_trade_type IS NOT NULL AND LENGTH(p_trade_type) > 100 THEN
    RAISE EXCEPTION 'Trade type search too long';
  END IF;

  -- Clamp limit to sensible range
  v_safe_limit := LEAST(GREATEST(COALESCE(p_limit, 50), 1), 100);

  RETURN QUERY
  SELECT
    p.id,
    p.full_name,
    p.business_name,
    p.trade_title,
    p.bio,
    p.photo_url,
    p.base_postcode,
    -- Calculate distance from trade's base to client
    haversine_distance(p.base_lat, p.base_lon, p_lat, p_lon) AS distance_km
  FROM profiles p
  WHERE p.role = 'trades'
    AND p.base_lat IS NOT NULL
    AND p.base_lon IS NOT NULL
    -- Check if client is within trade's travel radius
    AND haversine_distance(p.base_lat, p.base_lon, p_lat, p_lon) <= COALESCE(p.service_radius_km, 40)
    -- Optional trade type filter
    AND (p_trade_type IS NULL OR p.trade_title ILIKE '%' || p_trade_type || '%')
  ORDER BY distance_km ASC
  LIMIT v_safe_limit;
END;
$$;

-- ============================================================
-- 4. FIX: find_requests_for_trade
-- Should validate that the trade_id matches auth.uid()
-- ============================================================

CREATE OR REPLACE FUNCTION find_requests_for_trade(
  p_trade_id UUID,
  p_status TEXT DEFAULT 'open',
  p_limit INTEGER DEFAULT 50
)
RETURNS TABLE (
  id UUID,
  requester_id UUID,
  postcode TEXT,
  details TEXT,
  suggested_title TEXT,
  status TEXT,
  created_at TIMESTAMPTZ,
  distance_km DOUBLE PRECISION
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_base_lat NUMERIC;
  v_base_lon NUMERIC;
  v_radius_km NUMERIC;
  v_safe_limit INTEGER;
BEGIN
  -- SECURITY: Validate authentication
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- SECURITY: Trades can only see requests for themselves
  IF p_trade_id != auth.uid() THEN
    RAISE EXCEPTION 'Unauthorized: cannot view requests for other trades';
  END IF;

  -- Clamp limit
  v_safe_limit := LEAST(GREATEST(COALESCE(p_limit, 50), 1), 100);

  -- Get trade's location info
  SELECT base_lat, base_lon, service_radius_km
  INTO v_base_lat, v_base_lon, v_radius_km
  FROM profiles
  WHERE id = p_trade_id AND role = 'trades';

  -- Default radius if not set (40km ~= 25 miles)
  v_radius_km := COALESCE(v_radius_km, 40);

  RETURN QUERY
  SELECT
    qr.id,
    qr.requester_id,
    qr.postcode,
    qr.details,
    qr.suggested_title,
    qr.status,
    qr.created_at,
    -- Calculate distance from trade's base to request location
    CASE
      WHEN qr.location_lat IS NOT NULL AND qr.location_lon IS NOT NULL
           AND v_base_lat IS NOT NULL AND v_base_lon IS NOT NULL
      THEN haversine_distance(v_base_lat::DOUBLE PRECISION, v_base_lon::DOUBLE PRECISION,
                              qr.location_lat::DOUBLE PRECISION, qr.location_lon::DOUBLE PRECISION)
      ELSE NULL
    END AS distance_km
  FROM quote_requests qr
  WHERE qr.status = p_status
    -- Only show requests within the trade's service radius
    AND qr.location_lat IS NOT NULL
    AND qr.location_lon IS NOT NULL
    AND v_base_lat IS NOT NULL
    AND v_base_lon IS NOT NULL
    AND haversine_distance(v_base_lat::DOUBLE PRECISION, v_base_lon::DOUBLE PRECISION,
                           qr.location_lat::DOUBLE PRECISION, qr.location_lon::DOUBLE PRECISION) <= v_radius_km
  ORDER BY
    CASE
      WHEN qr.location_lat IS NOT NULL AND qr.location_lon IS NOT NULL
      THEN haversine_distance(v_base_lat::DOUBLE PRECISION, v_base_lon::DOUBLE PRECISION,
                              qr.location_lat::DOUBLE PRECISION, qr.location_lon::DOUBLE PRECISION)
      ELSE 9999
    END ASC
  LIMIT v_safe_limit;
END;
$$;

-- ============================================================
-- 5. FIX: get_recent_completions
-- Public function showing anonymized completed projects - OK as is
-- But add input validation
-- ============================================================

CREATE OR REPLACE FUNCTION get_recent_completions(
  user_region TEXT DEFAULT NULL,
  limit_count INT DEFAULT 3
)
RETURNS TABLE (
  id UUID,
  service_type TEXT,
  city TEXT,
  completed_at TIMESTAMPTZ,
  rating NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_safe_limit INT;
BEGIN
  -- VALIDATION: Limit region input length
  IF user_region IS NOT NULL AND LENGTH(user_region) > 10 THEN
    RAISE EXCEPTION 'Region code too long';
  END IF;

  -- Clamp limit
  v_safe_limit := LEAST(GREATEST(COALESCE(limit_count, 3), 1), 20);

  RETURN QUERY
  WITH completed_projects AS (
    SELECT
      q.id,
      COALESCE(st.name, q.project_title, 'Home improvement') AS service_type,
      -- Extract city from postcode (basic mapping)
      CASE
        WHEN qr.postcode LIKE 'EH%' THEN 'Edinburgh'
        WHEN qr.postcode LIKE 'G%' AND qr.postcode NOT LIKE 'GL%' THEN 'Glasgow'
        WHEN qr.postcode LIKE 'AB%' THEN 'Aberdeen'
        WHEN qr.postcode LIKE 'DD%' THEN 'Dundee'
        WHEN qr.postcode LIKE 'FK%' THEN 'Falkirk'
        WHEN qr.postcode LIKE 'KY%' THEN 'Fife'
        WHEN qr.postcode LIKE 'PA%' THEN 'Paisley'
        WHEN qr.postcode LIKE 'ML%' THEN 'Motherwell'
        WHEN qr.postcode LIKE 'M%' AND qr.postcode NOT LIKE 'ML%' THEN 'Manchester'
        WHEN qr.postcode LIKE 'L%' AND qr.postcode NOT LIKE 'LS%' THEN 'Liverpool'
        WHEN qr.postcode LIKE 'B%' AND qr.postcode NOT LIKE 'BS%' THEN 'Birmingham'
        WHEN qr.postcode LIKE 'LS%' THEN 'Leeds'
        WHEN qr.postcode LIKE 'SW%' OR qr.postcode LIKE 'SE%' OR qr.postcode LIKE 'NW%'
             OR qr.postcode LIKE 'N%' OR qr.postcode LIKE 'W%' OR qr.postcode LIKE 'E%'
             OR qr.postcode LIKE 'EC%' OR qr.postcode LIKE 'WC%' THEN 'London'
        ELSE 'UK'
      END AS city,
      q.updated_at AS completed_at,
      -- Use client rating if available, otherwise default to 5.0
      COALESCE(r.rating, 5.0) AS rating,
      -- Priority: 1 for matching region, 2 for others
      CASE
        WHEN user_region IS NOT NULL AND qr.postcode LIKE user_region || '%' THEN 1
        ELSE 2
      END AS priority
    FROM tradify_native_app_db q
    LEFT JOIN quote_requests qr ON q.request_id = qr.id
    LEFT JOIN service_types st ON qr.service_type_id = st.id
    LEFT JOIN reviews r ON r.quote_id = q.id
    WHERE q.status = 'completed'
      AND q.updated_at > NOW() - INTERVAL '30 days'
    ORDER BY priority, q.updated_at DESC
    LIMIT v_safe_limit
  )
  SELECT
    cp.id,
    cp.service_type,
    cp.city,
    cp.completed_at,
    cp.rating
  FROM completed_projects cp
  ORDER BY cp.completed_at DESC;
END;
$$;

-- ============================================================
-- GRANT PERMISSIONS
-- ============================================================

GRANT EXECUTE ON FUNCTION get_client_active_requests(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION find_trades_near_location(DOUBLE PRECISION, DOUBLE PRECISION, TEXT, INTEGER) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION find_requests_for_trade(UUID, TEXT, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION get_recent_completions(TEXT, INT) TO authenticated, anon;

-- ============================================================
-- SECURITY AUDIT NOTES
-- ============================================================

-- Functions audited and fixed:
--
-- 1. get_client_active_requests(client_uuid UUID)
--    - ISSUE: Accepted any UUID without validation
--    - FIX: Added auth.uid() check to ensure users can only see their own data
--
-- 2. find_requests_for_trade(p_trade_id UUID, ...)
--    - ISSUE: Trades could potentially view requests for other trades
--    - FIX: Added auth.uid() validation
--
-- 3. find_trades_near_location(p_lat, p_lon, ...)
--    - STATUS: Public search function (OK)
--    - FIX: Added input validation for coordinates and search terms
--
-- 4. get_recent_completions(user_region, limit_count)
--    - STATUS: Public anonymized data (OK)
--    - FIX: Added input validation
--
-- 5. rpc_get_trade_home_stats()
--    - STATUS: Already validates auth.uid() (OK)
--    - No changes needed
--
-- 6. refresh_trade_performance_stats(p_trade_id)
--    - STATUS: Admin/cron function, only service_role should call
--    - No changes needed (not granted to authenticated users)
