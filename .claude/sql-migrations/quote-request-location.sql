-- SQL Migration: Add location columns to quote_requests
-- Run this in your Supabase SQL Editor
-- This enables storing client coordinates for trade matching

-- ============================================================================
-- Step 1: Add latitude and longitude columns to quote_requests
-- ============================================================================

ALTER TABLE quote_requests
ADD COLUMN IF NOT EXISTS location_lat NUMERIC,
ADD COLUMN IF NOT EXISTS location_lon NUMERIC;

-- ============================================================================
-- Step 2: Create index for faster location-based queries
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_quote_requests_location
ON quote_requests (location_lat, location_lon)
WHERE location_lat IS NOT NULL AND location_lon IS NOT NULL;

-- ============================================================================
-- Step 3: Create RPC to find quote requests near a trade's location
-- This helps trades see relevant requests in their area
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
  v_service_areas JSONB;
BEGIN
  -- Get trade's location info
  SELECT base_lat, base_lon, service_radius_km, service_areas
  INTO v_base_lat, v_base_lon, v_radius_km, v_service_areas
  FROM profiles
  WHERE id = p_trade_id AND role = 'trades';

  -- Default radius if not set
  v_radius_km := COALESCE(v_radius_km, 25);

  RETURN QUERY
  WITH request_distances AS (
    SELECT
      qr.id,
      qr.requester_id,
      qr.postcode,
      qr.details,
      qr.suggested_title,
      qr.status,
      qr.created_at,
      qr.location_lat,
      qr.location_lon,
      -- Calculate distance from trade's base to request location
      CASE
        WHEN qr.location_lat IS NOT NULL AND qr.location_lon IS NOT NULL
             AND v_base_lat IS NOT NULL AND v_base_lon IS NOT NULL
        THEN haversine_distance(v_base_lat::DOUBLE PRECISION, v_base_lon::DOUBLE PRECISION,
                                qr.location_lat::DOUBLE PRECISION, qr.location_lon::DOUBLE PRECISION)
        ELSE NULL
      END AS base_distance_km
    FROM quote_requests qr
    WHERE qr.status = p_status
  ),
  -- Requests within trade's travel radius
  base_matches AS (
    SELECT rd.*
    FROM request_distances rd
    WHERE rd.base_distance_km IS NOT NULL
      AND rd.base_distance_km <= v_radius_km
  ),
  -- Requests near trade's additional service areas
  service_area_matches AS (
    SELECT DISTINCT ON (rd.id)
      rd.id,
      rd.requester_id,
      rd.postcode,
      rd.details,
      rd.suggested_title,
      rd.status,
      rd.created_at,
      rd.location_lat,
      rd.location_lon,
      haversine_distance(
        (sa->>'latitude')::DOUBLE PRECISION,
        (sa->>'longitude')::DOUBLE PRECISION,
        rd.location_lat::DOUBLE PRECISION,
        rd.location_lon::DOUBLE PRECISION
      ) AS base_distance_km
    FROM request_distances rd
    CROSS JOIN LATERAL jsonb_array_elements(COALESCE(v_service_areas, '[]'::jsonb)) AS sa
    WHERE rd.id NOT IN (SELECT bm.id FROM base_matches bm)
      AND rd.location_lat IS NOT NULL
      AND rd.location_lon IS NOT NULL
      AND sa->>'latitude' IS NOT NULL
      AND sa->>'longitude' IS NOT NULL
      AND haversine_distance(
        (sa->>'latitude')::DOUBLE PRECISION,
        (sa->>'longitude')::DOUBLE PRECISION,
        rd.location_lat::DOUBLE PRECISION,
        rd.location_lon::DOUBLE PRECISION
      ) <= 30 -- 30km radius around service areas
    ORDER BY rd.id, haversine_distance(
      (sa->>'latitude')::DOUBLE PRECISION,
      (sa->>'longitude')::DOUBLE PRECISION,
      rd.location_lat::DOUBLE PRECISION,
      rd.location_lon::DOUBLE PRECISION
    )
  )
  -- Combine and return
  SELECT
    m.id,
    m.requester_id,
    m.postcode,
    m.details,
    m.suggested_title,
    m.status,
    m.created_at,
    m.base_distance_km AS distance_km
  FROM (
    SELECT * FROM base_matches
    UNION ALL
    SELECT * FROM service_area_matches
  ) m
  ORDER BY m.base_distance_km ASC
  LIMIT p_limit;
END;
$$;

-- ============================================================================
-- Step 4: Grant permissions
-- ============================================================================

GRANT EXECUTE ON FUNCTION find_requests_for_trade TO authenticated;

-- ============================================================================
-- Step 5: Verify setup
-- ============================================================================

SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'quote_requests'
AND column_name IN ('postcode', 'location_lat', 'location_lon');
