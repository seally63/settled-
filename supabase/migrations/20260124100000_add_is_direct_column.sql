-- Migration: Add is_direct column to quote_requests
-- Date: 2026-01-24
-- Description: Add is_direct boolean column to distinguish direct requests from open requests

-- Add is_direct column to quote_requests table
ALTER TABLE quote_requests
ADD COLUMN IF NOT EXISTS is_direct BOOLEAN DEFAULT FALSE;

COMMENT ON COLUMN quote_requests.is_direct IS
  'True when the request was made directly to a specific trade (not an open request to multiple trades)';

-- Create index for efficient filtering
CREATE INDEX IF NOT EXISTS idx_quote_requests_is_direct
ON quote_requests(is_direct)
WHERE is_direct = TRUE;

-- Update existing direct requests based on request_targets with invited_by='client'
-- This backfills the is_direct flag for requests that were created before this column existed
UPDATE quote_requests qr
SET is_direct = TRUE
WHERE EXISTS (
  SELECT 1 FROM request_targets rt
  WHERE rt.request_id = qr.id
    AND rt.invited_by = 'client'
);

-- Also update the get_client_active_requests RPC to include is_direct
DROP FUNCTION IF EXISTS get_client_active_requests(UUID);

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
  highest_quote NUMERIC,
  is_direct BOOLEAN,
  trade_business_name TEXT
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
    ) AS highest_quote,
    -- Is this a direct request? Check column OR request_targets with invited_by='client'
    COALESCE(qr.is_direct, EXISTS (
      SELECT 1 FROM request_targets rt
      WHERE rt.request_id = qr.id AND rt.invited_by = 'client'
    )) AS is_direct,
    -- Trade business name (for direct requests)
    (
      SELECT COALESCE(p.business_name, p.full_name)
      FROM request_targets rt
      JOIN profiles p ON p.id = rt.trade_id
      WHERE rt.request_id = qr.id
        AND rt.invited_by = 'client'
      LIMIT 1
    ) AS trade_business_name
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

COMMENT ON FUNCTION get_client_active_requests IS
  'Returns a client''s active quote requests with quote statistics
   for display on the home screen. Includes is_direct flag and
   trade_business_name for direct requests.';
