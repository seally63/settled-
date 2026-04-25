-- Migration: client home postcode columns
-- Date: 2026-04-29
-- Description:
--   1. Adds home_postcode / home_lat / home_lon to profiles. These
--      are client-specific location fields (the address the client
--      wants work done at). The existing base_postcode / base_lat /
--      base_lon columns stay as-is for trades (their business base
--      location) but are no longer reused for clients.
--
--   2. Backfills home_* from base_* for existing clients, so the
--      feed + onboarding flow keep working for anyone who signed
--      up under the previous model (postcode captured via the
--      PostcodePrompt modal on the home screen). This is a one-off
--      copy — subsequent updates flow through setClientLocation
--      which now targets home_* directly.
--
--   3. Idempotent — safe to re-run.

BEGIN;

-- ============================================================================
-- 1. Add the new columns (idempotent).
-- ============================================================================

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS home_postcode TEXT,
  ADD COLUMN IF NOT EXISTS home_lat      DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS home_lon      DOUBLE PRECISION;

COMMENT ON COLUMN profiles.home_postcode IS
  'Client-side home postcode. Collected during onboarding after role selection and used as the default location for the browse feed.';
COMMENT ON COLUMN profiles.home_lat IS
  'Latitude geocoded from home_postcode via postcodes.io. Feed proximity calculations (Haversine) read this column.';
COMMENT ON COLUMN profiles.home_lon IS
  'Longitude geocoded from home_postcode via postcodes.io.';

-- ============================================================================
-- 2. Backfill home_* from base_* for existing clients so the feed
--    keeps working without a forced re-entry.
-- ============================================================================

UPDATE profiles
SET
  home_postcode = base_postcode,
  home_lat      = base_lat,
  home_lon      = base_lon
WHERE role = 'client'
  AND home_postcode IS NULL
  AND base_postcode IS NOT NULL;

-- ============================================================================
-- 3. Helpful index for the Haversine feed RPC — same shape as the
--    trade-side base_* lookup but for clients.
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_profiles_home_location
  ON profiles (home_lat, home_lon)
  WHERE home_lat IS NOT NULL AND home_lon IS NOT NULL;

COMMIT;
