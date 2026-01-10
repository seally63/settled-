-- SQL Migration: Simplified Trade Matching (Option A)
-- Run this in your Supabase SQL Editor
-- This version ONLY uses base_lat/base_lon + service_radius_km for matching
-- (Removed additional service_areas matching for simpler, more accurate results)

-- ============================================================================
-- Step 1: Update find_trades_near_location to only use base location + radius
-- ============================================================================

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
BEGIN
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
    AND haversine_distance(p.base_lat, p.base_lon, p_lat, p_lon) <= COALESCE(p.service_radius_km, 40) -- default 40km (~25 miles)
    -- Optional trade type filter
    AND (p_trade_type IS NULL OR p.trade_title ILIKE '%' || p_trade_type || '%')
  ORDER BY distance_km ASC
  LIMIT p_limit;
END;
$$;

-- ============================================================================
-- Step 2: Update find_requests_for_trade to only use base location + radius
-- ============================================================================

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
BEGIN
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
  LIMIT p_limit;
END;
$$;

-- ============================================================================
-- Step 3: Grant permissions (in case they're not already granted)
-- ============================================================================

GRANT EXECUTE ON FUNCTION find_trades_near_location TO authenticated, anon;
GRANT EXECUTE ON FUNCTION find_requests_for_trade TO authenticated;

-- ============================================================================
-- Step 4: Verify the update
-- ============================================================================

-- Test query: Find trades near London (51.5074, -0.1278)
-- SELECT * FROM find_trades_near_location(51.5074, -0.1278, NULL, 10);

-- Check that profiles has the required columns
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'profiles'
AND column_name IN ('base_lat', 'base_lon', 'service_radius_km', 'base_postcode');
