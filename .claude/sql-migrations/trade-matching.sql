-- SQL Migration: Trade Matching with Haversine Distance
-- Run this in your Supabase SQL Editor
-- This enables matching trades to clients based on postcode/location proximity

-- ============================================================================
-- Step 1: Ensure service_areas column is JSONB type for storing array of objects
-- ============================================================================

-- Check if service_areas exists and convert if needed
DO $$
BEGIN
  -- Check if column exists
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'service_areas'
  ) THEN
    -- Check if it's already JSONB
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'profiles'
      AND column_name = 'service_areas'
      AND data_type = 'jsonb'
    ) THEN
      -- Convert TEXT to JSONB (handle existing text data gracefully)
      ALTER TABLE profiles
      ALTER COLUMN service_areas TYPE JSONB
      USING CASE
        WHEN service_areas IS NULL THEN NULL
        WHEN service_areas = '' THEN '[]'::jsonb
        WHEN service_areas ~ '^\[' THEN service_areas::jsonb
        ELSE jsonb_build_array(jsonb_build_object('name', service_areas))
      END;

      RAISE NOTICE 'Converted service_areas to JSONB';
    ELSE
      RAISE NOTICE 'service_areas is already JSONB';
    END IF;
  ELSE
    -- Create the column if it doesn't exist
    ALTER TABLE profiles ADD COLUMN service_areas JSONB DEFAULT '[]'::jsonb;
    RAISE NOTICE 'Created service_areas column as JSONB';
  END IF;
END $$;

-- ============================================================================
-- Step 2: Create Haversine distance function (returns distance in kilometers)
-- ============================================================================

CREATE OR REPLACE FUNCTION haversine_distance(
  lat1 DOUBLE PRECISION,
  lon1 DOUBLE PRECISION,
  lat2 DOUBLE PRECISION,
  lon2 DOUBLE PRECISION
)
RETURNS DOUBLE PRECISION
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  earth_radius_km CONSTANT DOUBLE PRECISION := 6371.0;
  lat1_rad DOUBLE PRECISION;
  lat2_rad DOUBLE PRECISION;
  delta_lat DOUBLE PRECISION;
  delta_lon DOUBLE PRECISION;
  a DOUBLE PRECISION;
  c DOUBLE PRECISION;
BEGIN
  -- Convert degrees to radians
  lat1_rad := radians(lat1);
  lat2_rad := radians(lat2);
  delta_lat := radians(lat2 - lat1);
  delta_lon := radians(lon2 - lon1);

  -- Haversine formula
  a := sin(delta_lat / 2) * sin(delta_lat / 2) +
       cos(lat1_rad) * cos(lat2_rad) *
       sin(delta_lon / 2) * sin(delta_lon / 2);
  c := 2 * atan2(sqrt(a), sqrt(1 - a));

  RETURN earth_radius_km * c;
END;
$$;

-- ============================================================================
-- Step 3: Create RPC to find trades matching a client's location
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
  service_areas JSONB,
  distance_km DOUBLE PRECISION,
  match_type TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH trade_distances AS (
    SELECT
      p.id,
      p.full_name,
      p.business_name,
      p.trade_title,
      p.bio,
      p.photo_url,
      p.service_areas,
      p.base_lat,
      p.base_lon,
      p.service_radius_km,
      -- Calculate distance from trade's base to client
      haversine_distance(p.base_lat, p.base_lon, p_lat, p_lon) AS base_distance_km
    FROM profiles p
    WHERE p.role = 'trades'
      AND p.base_lat IS NOT NULL
      AND p.base_lon IS NOT NULL
      AND (p_trade_type IS NULL OR p.trade_title ILIKE '%' || p_trade_type || '%')
  ),
  -- Check if client is within trade's travel radius
  base_matches AS (
    SELECT
      td.*,
      'base_radius' AS match_type
    FROM trade_distances td
    WHERE td.base_distance_km <= COALESCE(td.service_radius_km, 25) -- default 25km if not set
  ),
  -- Check if client is near any of trade's additional service areas
  service_area_matches AS (
    SELECT DISTINCT ON (td.id)
      td.id,
      td.full_name,
      td.business_name,
      td.trade_title,
      td.bio,
      td.photo_url,
      td.service_areas,
      haversine_distance(
        (sa->>'latitude')::DOUBLE PRECISION,
        (sa->>'longitude')::DOUBLE PRECISION,
        p_lat,
        p_lon
      ) AS base_distance_km,
      'service_area' AS match_type
    FROM trade_distances td
    CROSS JOIN LATERAL jsonb_array_elements(COALESCE(td.service_areas, '[]'::jsonb)) AS sa
    WHERE td.id NOT IN (SELECT bm.id FROM base_matches bm)
      AND sa->>'latitude' IS NOT NULL
      AND sa->>'longitude' IS NOT NULL
      AND haversine_distance(
        (sa->>'latitude')::DOUBLE PRECISION,
        (sa->>'longitude')::DOUBLE PRECISION,
        p_lat,
        p_lon
      ) <= 30 -- 30km radius around service areas
    ORDER BY td.id, haversine_distance(
      (sa->>'latitude')::DOUBLE PRECISION,
      (sa->>'longitude')::DOUBLE PRECISION,
      p_lat,
      p_lon
    )
  )
  -- Combine and return results
  SELECT
    m.id,
    m.full_name,
    m.business_name,
    m.trade_title,
    m.bio,
    m.photo_url,
    m.service_areas,
    m.base_distance_km AS distance_km,
    m.match_type
  FROM (
    SELECT * FROM base_matches
    UNION ALL
    SELECT
      sam.id,
      sam.full_name,
      sam.business_name,
      sam.trade_title,
      sam.bio,
      sam.photo_url,
      sam.service_areas,
      sam.base_distance_km,
      sam.match_type
    FROM service_area_matches sam
  ) m
  ORDER BY m.base_distance_km ASC
  LIMIT p_limit;
END;
$$;

-- ============================================================================
-- Step 4: Grant permissions
-- ============================================================================

GRANT EXECUTE ON FUNCTION haversine_distance TO authenticated, anon;
GRANT EXECUTE ON FUNCTION find_trades_near_location TO authenticated, anon;

-- ============================================================================
-- Step 5: Verify setup
-- ============================================================================

-- Check the service_areas column type
SELECT column_name, data_type, udt_name
FROM information_schema.columns
WHERE table_name = 'profiles'
AND column_name IN ('service_areas', 'base_lat', 'base_lon', 'service_radius_km');

-- Test the haversine function (London to Edinburgh ~534km)
SELECT haversine_distance(51.5074, -0.1278, 55.9533, -3.1883) AS london_to_edinburgh_km;
