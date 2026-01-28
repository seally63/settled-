-- ============================================================================
-- Job Profiles Migration
-- Adds job_profile column to service_types to enable context-aware budget/timing options
-- ============================================================================

-- Add job_profile column to service_types
-- This determines which budget and timing options are shown for each service type
ALTER TABLE service_types
ADD COLUMN IF NOT EXISTS job_profile TEXT DEFAULT 'small_standard'
CHECK (job_profile IN ('emergency_small', 'small_standard', 'medium_job', 'renovation_large'));

-- Create index for efficient filtering
CREATE INDEX IF NOT EXISTS idx_service_types_job_profile ON service_types(job_profile);

-- ============================================================================
-- Update existing service types with appropriate job profiles
-- Based on the job profile definitions provided
-- ============================================================================

-- PLUMBING
UPDATE service_types SET job_profile = 'emergency_small' WHERE name = 'Leak or drip';
UPDATE service_types SET job_profile = 'small_standard' WHERE name = 'Blocked drain';
UPDATE service_types SET job_profile = 'small_standard' WHERE name = 'Toilet problem';
UPDATE service_types SET job_profile = 'medium_job' WHERE name = 'Boiler / heating';
UPDATE service_types SET job_profile = 'medium_job' WHERE name = 'New installation' AND category_id = (SELECT id FROM service_categories WHERE name = 'Plumbing');

-- ELECTRICAL
UPDATE service_types SET job_profile = 'small_standard' WHERE name = 'Socket or switch issue';
UPDATE service_types SET job_profile = 'small_standard' WHERE name = 'Lighting problem';
UPDATE service_types SET job_profile = 'medium_job' WHERE name = 'Fuse box / consumer unit';
UPDATE service_types SET job_profile = 'renovation_large' WHERE name = 'Rewiring';
UPDATE service_types SET job_profile = 'medium_job' WHERE name = 'New installation' AND category_id = (SELECT id FROM service_categories WHERE name = 'Electrical');

-- BATHROOM (all medium_job or renovation_large)
UPDATE service_types SET job_profile = 'renovation_large' WHERE name = 'Full bathroom refit';
UPDATE service_types SET job_profile = 'medium_job' WHERE name = 'Shower installation';
UPDATE service_types SET job_profile = 'medium_job' WHERE name = 'Bath installation';
UPDATE service_types SET job_profile = 'medium_job' WHERE name = 'Tiling' AND category_id = (SELECT id FROM service_categories WHERE name = 'Bathroom');
UPDATE service_types SET job_profile = 'medium_job' WHERE name = 'Plumbing work';

-- KITCHEN (all medium_job or renovation_large)
UPDATE service_types SET job_profile = 'renovation_large' WHERE name = 'Full kitchen refit';
UPDATE service_types SET job_profile = 'medium_job' WHERE name = 'Appliance installation';
UPDATE service_types SET job_profile = 'medium_job' WHERE name = 'Worktop replacement';
UPDATE service_types SET job_profile = 'medium_job' WHERE name = 'Cabinet fitting';
UPDATE service_types SET job_profile = 'medium_job' WHERE name = 'Tiling / splashback';

-- CLEANING
UPDATE service_types SET job_profile = 'small_standard' WHERE name = 'Deep clean';
UPDATE service_types SET job_profile = 'medium_job' WHERE name = 'End of tenancy';
UPDATE service_types SET job_profile = 'small_standard' WHERE name = 'Carpet cleaning';
UPDATE service_types SET job_profile = 'small_standard' WHERE name = 'Window cleaning';
UPDATE service_types SET job_profile = 'small_standard' WHERE name = 'Regular cleaning';

-- HANDYMAN
UPDATE service_types SET job_profile = 'small_standard' WHERE name = 'Furniture assembly';
UPDATE service_types SET job_profile = 'medium_job' WHERE name = 'Painting / decorating';
UPDATE service_types SET job_profile = 'small_standard' WHERE name = 'Shelving / mounting';
UPDATE service_types SET job_profile = 'medium_job' WHERE name = 'Door / window repair';
UPDATE service_types SET job_profile = 'small_standard' WHERE name = 'General repairs';

-- "Something else" defaults to small_standard (already set as default)

-- ============================================================================
-- DONE
-- ============================================================================
