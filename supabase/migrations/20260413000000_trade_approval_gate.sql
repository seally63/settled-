-- ============================================================================
-- Trade Approval Gate Migration
-- Adds approval_status column so only admin-approved trades are visible
-- ============================================================================

-- 1. Add approval_status column to profiles
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS approval_status TEXT DEFAULT 'pending'
  CHECK (approval_status IN ('pending', 'approved', 'rejected'));

-- 2. Auto-approve all existing trades (don't hide them retroactively)
UPDATE profiles SET approval_status = 'approved' WHERE role = 'trades';

-- ============================================================================
-- DONE
-- ============================================================================
