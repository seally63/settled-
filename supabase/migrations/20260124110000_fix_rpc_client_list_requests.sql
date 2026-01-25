-- Migration: Fix rpc_client_list_requests to include is_direct
-- Date: 2026-01-24
-- Description: Update rpc_client_list_requests to return is_direct flag and trade_business_name

-- Drop and recreate the function with updated return type
DROP FUNCTION IF EXISTS rpc_client_list_requests();

CREATE OR REPLACE FUNCTION rpc_client_list_requests()
RETURNS TABLE (
  id UUID,
  created_at TIMESTAMPTZ,
  status TEXT,
  suggested_title TEXT,
  postcode TEXT,
  budget_band TEXT,
  is_direct BOOLEAN,
  trade_business_name TEXT,
  target_count INT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- SECURITY: Validate authentication
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  RETURN QUERY
  SELECT
    qr.id,
    qr.created_at,
    qr.status,
    qr.suggested_title,
    qr.postcode,
    qr.budget_band,
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
    ) AS trade_business_name,
    -- Count of request targets
    (
      SELECT COUNT(*)::INT
      FROM request_targets rt
      WHERE rt.request_id = qr.id
    ) AS target_count
  FROM quote_requests qr
  WHERE qr.requester_id = auth.uid()
    AND qr.status IN ('open', 'pending')
    -- Exclude requests that already have quotes (those go to rpc_client_list_responses)
    AND NOT EXISTS (
      SELECT 1 FROM tradify_native_app_db q
      WHERE q.request_id = qr.id
        AND q.status NOT IN ('draft', 'withdrawn')
    )
  ORDER BY qr.created_at DESC
  LIMIT 20;
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION rpc_client_list_requests() TO authenticated;

COMMENT ON FUNCTION rpc_client_list_requests IS
  'Returns client''s open quote requests that have no quotes yet.
   Includes is_direct flag to distinguish direct vs open requests.';
