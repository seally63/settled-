-- ============================================================================
-- Add outside_service_area flag to request_targets
-- Date: 2026-01-23
-- Description: Track when a client requests a quote from a trade that doesn't
--              typically service their area (client is outside trade's service_radius_km)
-- ============================================================================

-- Add the column to track if client is outside trade's service area
ALTER TABLE request_targets
ADD COLUMN IF NOT EXISTS outside_service_area BOOLEAN DEFAULT FALSE;

COMMENT ON COLUMN request_targets.outside_service_area IS
  'True when the client location is outside the trade service_radius_km. Client was warned but proceeded anyway.';

-- Add distance_miles column to store the actual distance from the client to the trade
ALTER TABLE request_targets
ADD COLUMN IF NOT EXISTS distance_miles NUMERIC(6,1) DEFAULT NULL;

COMMENT ON COLUMN request_targets.distance_miles IS
  'Distance in miles from the client location to the trade base location. Stored when outside_service_area is true for display purposes.';

-- Create an index for efficient filtering
CREATE INDEX IF NOT EXISTS idx_request_targets_outside_service_area
ON request_targets(outside_service_area)
WHERE outside_service_area = TRUE;
