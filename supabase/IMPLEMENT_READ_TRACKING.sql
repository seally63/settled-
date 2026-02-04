-- ============================================================================
-- IMPLEMENT CONVERSATION READ TRACKING
-- Run this in Supabase SQL Editor
-- ============================================================================

-- 1. Create table to track when users last read each conversation
CREATE TABLE IF NOT EXISTS conversation_reads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  request_id UUID NOT NULL REFERENCES quote_requests(id) ON DELETE CASCADE,
  last_read_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, request_id)
);

-- Create index for fast lookups
CREATE INDEX IF NOT EXISTS idx_conversation_reads_user_request
  ON conversation_reads(user_id, request_id);

-- Enable RLS
ALTER TABLE conversation_reads ENABLE ROW LEVEL SECURITY;

-- Users can only see/modify their own read records
CREATE POLICY "Users can view own read records"
  ON conversation_reads FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert own read records"
  ON conversation_reads FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own read records"
  ON conversation_reads FOR UPDATE
  USING (user_id = auth.uid());

-- 2. Create function to mark a conversation as read
CREATE OR REPLACE FUNCTION rpc_mark_conversation_read(p_request_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id UUID := auth.uid();
BEGIN
  -- Upsert the read record
  INSERT INTO conversation_reads (user_id, request_id, last_read_at)
  VALUES (v_user_id, p_request_id, NOW())
  ON CONFLICT (user_id, request_id)
  DO UPDATE SET last_read_at = NOW();

  RETURN TRUE;
END;
$$;

GRANT EXECUTE ON FUNCTION rpc_mark_conversation_read(UUID) TO authenticated;

-- 3. Update rpc_list_conversations to use read tracking
DROP FUNCTION IF EXISTS rpc_list_conversations(INTEGER);
DROP FUNCTION IF EXISTS rpc_list_conversations(INT);
DROP FUNCTION IF EXISTS rpc_list_conversations();

CREATE OR REPLACE FUNCTION rpc_list_conversations(p_limit INTEGER DEFAULT 50)
RETURNS TABLE (
  conversation_id UUID,
  request_id UUID,
  quote_id UUID,
  other_party_id UUID,
  other_party_name TEXT,
  other_party_role TEXT,
  other_party_photo_url TEXT,
  last_message_body TEXT,
  last_message_at TIMESTAMPTZ,
  has_unread BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_user_role TEXT;
BEGIN
  SELECT role INTO v_user_role
  FROM profiles
  WHERE id = v_user_id;

  RETURN QUERY
  WITH user_requests AS (
    SELECT DISTINCT qr.id AS request_id
    FROM quote_requests qr
    WHERE qr.requester_id = v_user_id
    UNION
    SELECT DISTINCT rt.request_id
    FROM request_targets rt
    WHERE rt.trade_id = v_user_id
  ),
  requests_with_messages AS (
    SELECT DISTINCT ur.request_id
    FROM user_requests ur
    WHERE EXISTS (
      SELECT 1 FROM messages m
      WHERE m.request_id = ur.request_id
        AND m.message_type != 'system'
    )
  ),
  latest_messages AS (
    SELECT DISTINCT ON (m.request_id)
      m.request_id,
      m.id AS message_id,
      m.body,
      m.created_at,
      m.sender_id
    FROM messages m
    INNER JOIN requests_with_messages rwm ON m.request_id = rwm.request_id
    WHERE m.message_type != 'system'
      AND m.body IS NOT NULL
      AND TRIM(m.body) != ''
    ORDER BY m.request_id, m.created_at DESC
  ),
  conversation_details AS (
    SELECT
      lm.request_id,
      lm.body,
      lm.created_at AS last_message_at,
      lm.sender_id,
      (
        SELECT q.id
        FROM tradify_native_app_db q
        WHERE q.request_id = lm.request_id
        ORDER BY q.created_at DESC
        LIMIT 1
      ) AS quote_id,
      CASE
        WHEN v_user_role = 'trades' THEN
          (SELECT qr.requester_id FROM quote_requests qr WHERE qr.id = lm.request_id)
        ELSE
          (SELECT rt.trade_id FROM request_targets rt WHERE rt.request_id = lm.request_id LIMIT 1)
      END AS other_party_id,
      -- Get the user's last read timestamp for this conversation
      (
        SELECT cr.last_read_at
        FROM conversation_reads cr
        WHERE cr.user_id = v_user_id AND cr.request_id = lm.request_id
      ) AS last_read_at
    FROM latest_messages lm
  )
  SELECT
    cd.request_id AS conversation_id,
    cd.request_id,
    cd.quote_id,
    cd.other_party_id,
    COALESCE(
      CASE WHEN p.role = 'trades' THEN p.business_name ELSE NULL END,
      p.full_name,
      'User'
    )::TEXT AS other_party_name,
    COALESCE(p.role, 'client')::TEXT AS other_party_role,
    p.photo_url::TEXT AS other_party_photo_url,
    cd.body::TEXT AS last_message_body,
    cd.last_message_at,
    -- Has unread if: last message is from other party AND (never read OR last message is newer than last read)
    (
      cd.sender_id != v_user_id
      AND (cd.last_read_at IS NULL OR cd.last_message_at > cd.last_read_at)
    ) AS has_unread
  FROM conversation_details cd
  LEFT JOIN profiles p ON p.id = cd.other_party_id
  WHERE cd.other_party_id IS NOT NULL
  ORDER BY cd.last_message_at DESC NULLS LAST
  LIMIT p_limit;
END;
$$;

GRANT EXECUTE ON FUNCTION rpc_list_conversations(INTEGER) TO authenticated;

-- 4. Verify setup
SELECT 'conversation_reads table created' AS status
WHERE EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'conversation_reads');
