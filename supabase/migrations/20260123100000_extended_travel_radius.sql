-- ============================================================================
-- Add "Willing to Travel Further" settings for trades
-- Date: 2026-01-23
-- Description: Allow trades to specify an extended travel radius for higher-budget jobs
-- ============================================================================

-- Add extended_radius_km column (optional extended travel distance in km)
ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS extended_radius_km INTEGER DEFAULT NULL;

COMMENT ON COLUMN profiles.extended_radius_km IS
  'Optional extended travel radius in km for higher-budget jobs. NULL means not enabled.';

-- Add extended_radius_min_budget column (minimum budget band required for extended travel)
-- Uses same budget bands as quote_requests: '<£3k', '£3k–£9k', '£9k+'
ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS extended_radius_min_budget TEXT DEFAULT NULL;

COMMENT ON COLUMN profiles.extended_radius_min_budget IS
  'Minimum budget band required to use extended_radius_km. Budget bands: <£3k, £3k–£9k, £9k+';

-- Add constraint to ensure valid budget bands
ALTER TABLE profiles
ADD CONSTRAINT chk_extended_radius_min_budget
CHECK (extended_radius_min_budget IS NULL OR extended_radius_min_budget IN ('<£3k', '£3k–£9k', '£9k+'));

-- Add extended_match flag to request_targets to mark trades matched via extended radius
ALTER TABLE request_targets
ADD COLUMN IF NOT EXISTS extended_match BOOLEAN DEFAULT FALSE;

COMMENT ON COLUMN request_targets.extended_match IS
  'True when the trade was matched via their extended_radius_km (for higher budget jobs). Used for UI display.';

-- Create index for efficient filtering of extended matches
CREATE INDEX IF NOT EXISTS idx_request_targets_extended_match
ON request_targets(extended_match)
WHERE extended_match = TRUE;

-- ============================================================================
-- RPC function to update extended travel settings
-- ============================================================================

CREATE OR REPLACE FUNCTION rpc_update_extended_travel(
  p_extended_radius_km INTEGER,
  p_extended_radius_min_budget TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Validate caller is authenticated
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Validate extended_radius_km if provided
  IF p_extended_radius_km IS NOT NULL THEN
    -- Must be between 10 and 200 km (reasonable limits)
    IF p_extended_radius_km < 10 OR p_extended_radius_km > 320 THEN
      RAISE EXCEPTION 'Extended radius must be between 10 and 320 km (approx 6-200 miles)';
    END IF;
  END IF;

  -- Validate budget band if provided
  IF p_extended_radius_min_budget IS NOT NULL AND
     p_extended_radius_min_budget NOT IN ('<£3k', '£3k–£9k', '£9k+') THEN
    RAISE EXCEPTION 'Invalid budget band. Must be one of: <£3k, £3k–£9k, £9k+';
  END IF;

  -- If setting extended radius, must also set budget
  IF p_extended_radius_km IS NOT NULL AND p_extended_radius_min_budget IS NULL THEN
    RAISE EXCEPTION 'Must specify minimum budget when enabling extended travel';
  END IF;

  -- Update the profile
  UPDATE profiles
  SET
    extended_radius_km = p_extended_radius_km,
    extended_radius_min_budget = p_extended_radius_min_budget,
    updated_at = now()
  WHERE id = auth.uid();

  RETURN TRUE;
END;
$$;
