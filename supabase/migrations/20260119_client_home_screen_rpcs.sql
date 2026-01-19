-- Migration: Client Home Screen RPC Functions
-- Date: 2026-01-19
-- Description: Adds RPC functions for the new client home screen

-- ============================================================
-- 1. get_recent_completions
-- Returns recently completed projects for the "Recently Completed" feed
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
AS $$
BEGIN
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
    LIMIT limit_count
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

-- Grant execute permission
GRANT EXECUTE ON FUNCTION get_recent_completions(TEXT, INT) TO authenticated;

-- ============================================================
-- 2. get_client_active_requests
-- Returns client's active quote requests with quote statistics
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
AS $$
BEGIN
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

-- Grant execute permission
GRANT EXECUTE ON FUNCTION get_client_active_requests(UUID) TO authenticated;

-- ============================================================
-- COMMENTS
-- ============================================================

COMMENT ON FUNCTION get_recent_completions IS
  'Returns recently completed projects for the client home screen feed.
   Prioritizes projects from the user''s region if provided.';

COMMENT ON FUNCTION get_client_active_requests IS
  'Returns a client''s active quote requests with quote statistics
   for display on the home screen.';
