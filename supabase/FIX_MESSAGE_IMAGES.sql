-- ============================================================================
-- FIX MESSAGE IMAGES - Ensure rpc_send_message stores attachment_paths
-- and rpc_list_messages returns them correctly
-- Run this in Supabase SQL Editor
-- ============================================================================

-- 1. Ensure message-photos bucket exists (private bucket)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'message-photos',
  'message-photos',
  false,
  5242880, -- 5MB limit
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
ON CONFLICT (id) DO UPDATE SET
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- 2. Storage policies for message-photos bucket
-- Allow authenticated users to upload to their own folder
DROP POLICY IF EXISTS "message_photos_insert_own" ON storage.objects;
CREATE POLICY "message_photos_insert_own" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'message-photos' AND
    (storage.foldername(name))[1] = auth.uid()::text
  );

-- Allow authenticated users to read any message photos (they need signed URLs anyway)
DROP POLICY IF EXISTS "message_photos_select_authenticated" ON storage.objects;
CREATE POLICY "message_photos_select_authenticated" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'message-photos');

-- Allow users to delete their own uploads
DROP POLICY IF EXISTS "message_photos_delete_own" ON storage.objects;
CREATE POLICY "message_photos_delete_own" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'message-photos' AND
    (storage.foldername(name))[1] = auth.uid()::text
  );

-- 3. Allow NULL body in messages table (for image-only messages)
ALTER TABLE messages ALTER COLUMN body DROP NOT NULL;

-- Drop and recreate rpc_send_message to ensure it stores attachment_paths
DROP FUNCTION IF EXISTS rpc_send_message(UUID, UUID, TEXT, TEXT[]);

CREATE OR REPLACE FUNCTION rpc_send_message(
  p_request_id UUID,
  p_quote_id UUID DEFAULT NULL,
  p_body TEXT DEFAULT '',
  p_paths TEXT[] DEFAULT '{}'
)
RETURNS TABLE (
  id UUID,
  request_id UUID,
  quote_id UUID,
  sender_id UUID,
  body TEXT,
  message_type TEXT,
  attachment_paths TEXT[],
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_message_id UUID;
  v_body TEXT;
  v_paths TEXT[];
BEGIN
  -- Normalize body (empty string becomes NULL)
  v_body := NULLIF(TRIM(COALESCE(p_body, '')), '');

  -- Normalize paths (empty array becomes NULL)
  v_paths := CASE WHEN array_length(p_paths, 1) > 0 THEN p_paths ELSE NULL END;

  -- Must have either body or paths
  IF v_body IS NULL AND v_paths IS NULL THEN
    RAISE EXCEPTION 'Message must have either text or images';
  END IF;

  -- Insert the message with attachment_paths
  INSERT INTO messages (
    request_id,
    quote_id,
    sender_id,
    body,
    message_type,
    attachment_paths,
    created_at
  )
  VALUES (
    p_request_id,
    p_quote_id,
    v_user_id,
    v_body,
    'text',
    v_paths,
    NOW()
  )
  RETURNING messages.id INTO v_message_id;

  -- Return the created message
  RETURN QUERY
  SELECT
    m.id,
    m.request_id,
    m.quote_id,
    m.sender_id,
    m.body,
    m.message_type,
    m.attachment_paths,
    m.created_at
  FROM messages m
  WHERE m.id = v_message_id;
END;
$$;

GRANT EXECUTE ON FUNCTION rpc_send_message(UUID, UUID, TEXT, TEXT[]) TO authenticated;

-- Drop and recreate rpc_list_messages to return attachment_paths as 'paths'
DROP FUNCTION IF EXISTS rpc_list_messages(UUID, UUID);

CREATE OR REPLACE FUNCTION rpc_list_messages(
  p_request_id UUID,
  p_quote_id UUID DEFAULT NULL
)
RETURNS TABLE (
  id UUID,
  request_id UUID,
  quote_id UUID,
  sender_id UUID,
  body TEXT,
  message_type TEXT,
  paths TEXT[],
  appointment_id UUID,
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    m.id,
    m.request_id,
    m.quote_id,
    m.sender_id,
    m.body,
    m.message_type,
    m.attachment_paths AS paths,
    m.appointment_id,
    m.created_at
  FROM messages m
  WHERE m.request_id = p_request_id
    AND (p_quote_id IS NULL OR m.quote_id = p_quote_id)
  ORDER BY m.created_at ASC;
END;
$$;

GRANT EXECUTE ON FUNCTION rpc_list_messages(UUID, UUID) TO authenticated;
