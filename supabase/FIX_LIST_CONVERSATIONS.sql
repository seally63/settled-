-- ============================================================================
-- FIX rpc_list_conversations FUNCTION
-- Run this in Supabase SQL Editor
-- ============================================================================

-- Drop the existing function if it exists (try different signatures)
DROP FUNCTION IF EXISTS rpc_list_conversations(INTEGER);
DROP FUNCTION IF EXISTS rpc_list_conversations(INT);
DROP FUNCTION IF EXISTS rpc_list_conversations();

-- Create the fixed function
-- Messages table has: id, sender_id, request_id, quote_id, body, message_type, attachment_paths, created_at
-- NO receiver_id column - we determine the other party from request_targets or quote_requests
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
  -- Get user's role
  SELECT role INTO v_user_role
  FROM profiles
  WHERE id = v_user_id;

  RETURN QUERY
  WITH user_requests AS (
    -- Find all request_ids where user is involved (as requester or trade target)
    SELECT DISTINCT qr.id AS request_id
    FROM quote_requests qr
    WHERE qr.requester_id = v_user_id

    UNION

    SELECT DISTINCT rt.request_id
    FROM request_targets rt
    WHERE rt.trade_id = v_user_id
  ),
  requests_with_messages AS (
    -- Only include requests that have actual messages
    SELECT DISTINCT ur.request_id
    FROM user_requests ur
    WHERE EXISTS (
      SELECT 1 FROM messages m
      WHERE m.request_id = ur.request_id
        AND m.message_type != 'system'
    )
  ),
  latest_messages AS (
    -- Get the latest message for each request
    SELECT DISTINCT ON (m.request_id)
      m.request_id,
      m.id AS message_id,
      m.body,  -- column is 'body' not 'content'
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
      -- Get quote_id if exists
      (
        SELECT q.id
        FROM tradify_native_app_db q
        WHERE q.request_id = lm.request_id
        ORDER BY q.created_at DESC
        LIMIT 1
      ) AS quote_id,
      -- Determine other party based on user role
      CASE
        WHEN v_user_role = 'trades' THEN
          -- Trade user: other party is the client (requester)
          (SELECT qr.requester_id FROM quote_requests qr WHERE qr.id = lm.request_id)
        ELSE
          -- Client user: other party is the trade from request_targets
          (SELECT rt.trade_id FROM request_targets rt WHERE rt.request_id = lm.request_id LIMIT 1)
      END AS other_party_id
    FROM latest_messages lm
  )
  SELECT
    cd.request_id AS conversation_id,
    cd.request_id,
    cd.quote_id,
    cd.other_party_id,
    COALESCE(
      CASE
        WHEN p.role = 'trades' THEN p.business_name
        ELSE NULL
      END,
      p.full_name,
      'User'
    )::TEXT AS other_party_name,
    COALESCE(p.role, 'client')::TEXT AS other_party_role,
    p.photo_url::TEXT AS other_party_photo_url,
    cd.body::TEXT AS last_message_body,
    cd.last_message_at,
    (cd.sender_id != v_user_id) AS has_unread
  FROM conversation_details cd
  LEFT JOIN profiles p ON p.id = cd.other_party_id
  WHERE cd.other_party_id IS NOT NULL
  ORDER BY cd.last_message_at DESC NULLS LAST
  LIMIT p_limit;
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION rpc_list_conversations(INTEGER) TO authenticated;

-- Test the function (optional - uncomment to test)
-- SELECT * FROM rpc_list_conversations(50);
