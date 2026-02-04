-- Migration: Temp Upload Cleanup
-- Description: Creates a function and cron job to clean up abandoned temporary uploads
-- These are uploads that started but were never attached to a request (user abandoned form)

-- Function to clean up old temp files from storage
-- Deletes files in the tmp/ folder that are older than 24 hours
CREATE OR REPLACE FUNCTION cleanup_temp_uploads()
RETURNS TABLE(deleted_count integer)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_bucket_name text := 'request-attachments';
    v_temp_prefix text := 'tmp/';
    v_cutoff_time timestamptz := now() - interval '24 hours';
    v_deleted_count int := 0;
BEGIN
    -- Delete all objects in the tmp/ folder older than cutoff time
    DELETE FROM storage.objects
    WHERE storage.objects.bucket_id = v_bucket_name
      AND storage.objects.name LIKE v_temp_prefix || '%'
      AND storage.objects.created_at < v_cutoff_time;

    GET DIAGNOSTICS v_deleted_count = ROW_COUNT;

    deleted_count := v_deleted_count;
    RETURN NEXT;
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION cleanup_temp_uploads() TO service_role;

-- To run manually:
-- SELECT * FROM cleanup_temp_uploads();

-- To schedule with pg_cron (enable extension first in Supabase Dashboard):
-- SELECT cron.schedule('cleanup-temp-uploads', '0 * * * *', 'SELECT * FROM cleanup_temp_uploads()');

COMMENT ON FUNCTION cleanup_temp_uploads() IS
'Cleans up abandoned temporary image uploads from the request-attachments bucket.
Files in the tmp/ folder older than 24 hours are deleted.
Returns the count of deleted files.';
