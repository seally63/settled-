-- ============================================================================
-- Migration: Fix verification tables schema
-- Adds profile_id and missing columns to existing tables so they match
-- the application code expectations.
-- Tables: trade_verifications, photo_id_submissions, insurance_submissions,
--         credential_submissions
-- ============================================================================

-- ============================================================================
-- 1. trade_verifications - Add profile_id and status tracking columns
-- ============================================================================

ALTER TABLE trade_verifications
ADD COLUMN IF NOT EXISTS profile_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
ADD COLUMN IF NOT EXISTS photo_id_status TEXT DEFAULT 'not_started',
ADD COLUMN IF NOT EXISTS photo_id_verified_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS insurance_status TEXT DEFAULT 'not_started',
ADD COLUMN IF NOT EXISTS insurance_verified_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS insurance_expires_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS credentials_status TEXT DEFAULT 'not_started',
ADD COLUMN IF NOT EXISTS credentials_verified_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS overall_complete BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

-- ============================================================================
-- 2. photo_id_submissions - Add profile_id and missing columns
-- ============================================================================

ALTER TABLE photo_id_submissions
ADD COLUMN IF NOT EXISTS profile_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
ADD COLUMN IF NOT EXISTS document_path TEXT,
ADD COLUMN IF NOT EXISTS review_status TEXT DEFAULT 'pending_review',
ADD COLUMN IF NOT EXISTS rejection_reason TEXT,
ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS reviewed_by UUID REFERENCES profiles(id);

-- ============================================================================
-- 3. insurance_submissions - Add profile_id and missing columns
-- ============================================================================

ALTER TABLE insurance_submissions
ADD COLUMN IF NOT EXISTS profile_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
ADD COLUMN IF NOT EXISTS policy_provider TEXT,
ADD COLUMN IF NOT EXISTS coverage_amount_pence BIGINT,
ADD COLUMN IF NOT EXISTS policy_expiry_date DATE,
ADD COLUMN IF NOT EXISTS pli_document_path TEXT,
ADD COLUMN IF NOT EXISTS eli_document_path TEXT,
ADD COLUMN IF NOT EXISTS eli_coverage_amount_pence BIGINT,
ADD COLUMN IF NOT EXISTS eli_expiry_date DATE,
ADD COLUMN IF NOT EXISTS review_status TEXT DEFAULT 'pending_review',
ADD COLUMN IF NOT EXISTS rejection_reason TEXT,
ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS reviewed_by UUID REFERENCES profiles(id);

-- ============================================================================
-- 4. credential_submissions - Add profile_id and missing columns
-- ============================================================================

ALTER TABLE credential_submissions
ADD COLUMN IF NOT EXISTS profile_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
ADD COLUMN IF NOT EXISTS custom_credential_name TEXT,
ADD COLUMN IF NOT EXISTS document_path TEXT,
ADD COLUMN IF NOT EXISTS verification_method TEXT DEFAULT 'document_upload',
ADD COLUMN IF NOT EXISTS api_verified BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS api_response JSONB,
ADD COLUMN IF NOT EXISTS review_status TEXT DEFAULT 'pending_review',
ADD COLUMN IF NOT EXISTS rejection_reason TEXT,
ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS reviewed_by UUID REFERENCES profiles(id);

-- ============================================================================
-- 5. RLS Policies
-- ============================================================================

ALTER TABLE trade_verifications ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Trades can view own verifications" ON trade_verifications;
CREATE POLICY "Trades can view own verifications" ON trade_verifications FOR SELECT USING (auth.uid() = profile_id);
DROP POLICY IF EXISTS "Trades can insert own verifications" ON trade_verifications;
CREATE POLICY "Trades can insert own verifications" ON trade_verifications FOR INSERT WITH CHECK (auth.uid() = profile_id);
DROP POLICY IF EXISTS "Trades can update own verifications" ON trade_verifications;
CREATE POLICY "Trades can update own verifications" ON trade_verifications FOR UPDATE USING (auth.uid() = profile_id);

ALTER TABLE photo_id_submissions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Trades can view own photo_id submissions" ON photo_id_submissions;
CREATE POLICY "Trades can view own photo_id submissions" ON photo_id_submissions FOR SELECT USING (auth.uid() = profile_id);
DROP POLICY IF EXISTS "Trades can insert own photo_id submissions" ON photo_id_submissions;
CREATE POLICY "Trades can insert own photo_id submissions" ON photo_id_submissions FOR INSERT WITH CHECK (auth.uid() = profile_id);

ALTER TABLE insurance_submissions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Trades can view own insurance submissions" ON insurance_submissions;
CREATE POLICY "Trades can view own insurance submissions" ON insurance_submissions FOR SELECT USING (auth.uid() = profile_id);
DROP POLICY IF EXISTS "Trades can insert own insurance submissions" ON insurance_submissions;
CREATE POLICY "Trades can insert own insurance submissions" ON insurance_submissions FOR INSERT WITH CHECK (auth.uid() = profile_id);

ALTER TABLE credential_submissions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Trades can view own credential submissions" ON credential_submissions;
CREATE POLICY "Trades can view own credential submissions" ON credential_submissions FOR SELECT USING (auth.uid() = profile_id);
DROP POLICY IF EXISTS "Trades can insert own credential submissions" ON credential_submissions;
CREATE POLICY "Trades can insert own credential submissions" ON credential_submissions FOR INSERT WITH CHECK (auth.uid() = profile_id);

-- ============================================================================
-- 6. Indexes
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_trade_verifications_profile_id ON trade_verifications(profile_id);
CREATE INDEX IF NOT EXISTS idx_photo_id_submissions_profile_id ON photo_id_submissions(profile_id);
CREATE INDEX IF NOT EXISTS idx_insurance_submissions_profile_id ON insurance_submissions(profile_id);
CREATE INDEX IF NOT EXISTS idx_credential_submissions_profile_id ON credential_submissions(profile_id);
