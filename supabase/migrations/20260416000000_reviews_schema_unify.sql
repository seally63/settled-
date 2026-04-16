-- ============================================================================
-- Unify reviews table schema + ensure review-photos storage bucket exists
-- ============================================================================

-- 1. Add `content` column if missing
ALTER TABLE reviews ADD COLUMN IF NOT EXISTS content TEXT;

-- 2. Add `photos` column (TEXT[] of URLs) if missing
ALTER TABLE reviews ADD COLUMN IF NOT EXISTS photos TEXT[] DEFAULT '{}';

-- 3. Backfill content from legacy `comment` column only if it still exists
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'reviews'
      AND column_name = 'comment'
  ) THEN
    EXECUTE 'UPDATE reviews SET content = comment WHERE content IS NULL AND comment IS NOT NULL';
  END IF;
END
$$;

-- ============================================================================
-- review-photos storage bucket
-- Public read (anyone can view review photos attached by clients)
-- Authenticated users can INSERT into 'reviews/' folder (limited)
-- ============================================================================

INSERT INTO storage.buckets (id, name, public)
VALUES ('review-photos', 'review-photos', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- Allow authenticated users to upload review photos
DROP POLICY IF EXISTS "Authenticated can upload review photos" ON storage.objects;
CREATE POLICY "Authenticated can upload review photos"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'review-photos'
    AND (storage.foldername(name))[1] = 'reviews'
  );

-- Anyone (including anon) can view review photos (public bucket)
DROP POLICY IF EXISTS "Anyone can view review photos" ON storage.objects;
CREATE POLICY "Anyone can view review photos"
  ON storage.objects
  FOR SELECT
  USING (bucket_id = 'review-photos');

-- Reviewers can delete their own uploads (best-effort; object name carries reviewer id is not enforced here)
DROP POLICY IF EXISTS "Authenticated can delete own review photos" ON storage.objects;
CREATE POLICY "Authenticated can delete own review photos"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (bucket_id = 'review-photos' AND owner = auth.uid());
