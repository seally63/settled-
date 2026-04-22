-- Migration: Party-based conversation RPCs
-- Date: 2026-04-25
-- Description:
--   Adds three RPCs that pivot the messaging layer from
--   per-request_id conversations to per-other-party conversations.
--   A "conversation" now groups ALL messages between me and the same
--   person across ALL shared projects — matches the UX pattern most
--   messaging apps (Messenger, iMessage, WhatsApp) use.
--
--   Non-breaking: existing rpc_list_conversations / rpc_list_messages
--   / rpc_send_message stay exactly as they were so any screen that
--   still calls them keeps working. This migration purely ADDS.
--
--   New RPCs:
--     · rpc_list_conversations_by_party(p_limit)
--         → one row per (me, other_party) with the most recent
--           message across any shared request and an aggregated
--           has_unread flag.
--
--     · rpc_list_messages_by_party(p_other_party_id)
--         → every message exchanged between me and the given
--           other party, spanning all shared requests, ordered
--           oldest → newest. Includes the request_id on each row
--           so the UI can still render per-project context (e.g.
--           a small "[Project X]" chip if we ever want it).
--
--     · rpc_send_message_to_party(p_other_party_id, p_body, p_paths)
--         → finds the most recent shared request between me and
--           them, then inserts a message on it. Returns the new
--           message row. Errors if no shared request exists (a
--           conversation can only exist where a request has linked
--           them).
--
--     · rpc_mark_party_read(p_other_party_id)
--         → marks last_read_at = NOW() for the caller across every
--           shared request. Used when the party-based conversation
--           screen mounts. Reuses the existing conversation_reads
--           table (per-request), so existing read tracking keeps
--           working.

BEGIN;

-- ============================================================================
-- 1. rpc_list_conversations_by_party
-- ============================================================================

DROP FUNCTION IF EXISTS rpc_list_conversations_by_party(INTEGER);
DROP FUNCTION IF EXISTS rpc_list_conversations_by_party(INT);
DROP FUNCTION IF EXISTS rpc_list_conversations_by_party();

CREATE OR REPLACE FUNCTION rpc_list_conversations_by_party(p_limit INTEGER DEFAULT 50)
RETURNS TABLE (
  other_party_id        UUID,
  other_party_name      TEXT,
  other_party_role      TEXT,
  other_party_photo_url TEXT,
  last_message_body     TEXT,
  last_message_at       TIMESTAMPTZ,
  last_message_request_id UUID,
  has_unread            BOOLEAN,
  shared_request_count  INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH my_requests AS (
    -- Every request I'm a participant on, tagged with the other
    -- party's user id. A client request has a single trade target
    -- (invited_by='client') or a broadcast to many; for the
    -- per-party rollup we pair each request_target row as its
    -- own (me, trade) edge.
    SELECT
      qr.id                 AS request_id,
      qr.requester_id       AS client_id,
      rt.trade_id           AS trade_id,
      CASE
        WHEN qr.requester_id = v_uid THEN rt.trade_id
        ELSE qr.requester_id
      END                   AS other_party_id
    FROM quote_requests qr
    JOIN request_targets rt ON rt.request_id = qr.id
    WHERE qr.requester_id = v_uid OR rt.trade_id = v_uid
  ),
  per_request_latest AS (
    -- Latest non-system, non-empty message per (request_id).
    SELECT DISTINCT ON (m.request_id)
      m.request_id,
      m.id             AS message_id,
      m.body           AS last_body,
      m.created_at     AS last_at,
      m.sender_id
    FROM messages m
    WHERE m.request_id IN (SELECT request_id FROM my_requests)
      AND m.message_type IS DISTINCT FROM 'system'
      AND COALESCE(TRIM(m.body), '') <> ''
    ORDER BY m.request_id, m.created_at DESC
  ),
  per_party AS (
    -- For each distinct other-party, roll up: latest message, all
    -- request_ids that share that party (for read tracking), and
    -- an unread flag that's TRUE if any shared request has an
    -- unread message from the other party.
    SELECT
      mr.other_party_id,
      (ARRAY_AGG(DISTINCT mr.request_id))                                  AS request_ids,
      MAX(prl.last_at)                                                     AS last_at,
      (ARRAY_AGG(prl.last_body ORDER BY prl.last_at DESC NULLS LAST))[1]   AS last_body,
      (ARRAY_AGG(prl.request_id ORDER BY prl.last_at DESC NULLS LAST))[1]  AS last_request_id,
      (ARRAY_AGG(prl.sender_id ORDER BY prl.last_at DESC NULLS LAST))[1]   AS last_sender,
      COUNT(DISTINCT mr.request_id)::INT                                   AS n_shared,
      BOOL_OR(
        prl.sender_id IS NOT NULL
        AND prl.sender_id <> v_uid
        AND (
          SELECT (cr.last_read_at IS NULL OR prl.last_at > cr.last_read_at)
          FROM conversation_reads cr
          WHERE cr.user_id = v_uid AND cr.request_id = mr.request_id
          UNION ALL SELECT TRUE
          LIMIT 1
        )
      )                                                                    AS any_unread
    FROM my_requests mr
    LEFT JOIN per_request_latest prl ON prl.request_id = mr.request_id
    WHERE mr.other_party_id IS NOT NULL
    GROUP BY mr.other_party_id
    HAVING MAX(prl.last_at) IS NOT NULL  -- only surface parties with at least one real message
  )
  SELECT
    pp.other_party_id,
    COALESCE(p.business_name, p.full_name, 'Your ' || COALESCE(p.role, 'contact'))::TEXT,
    COALESCE(p.role, '')::TEXT,
    p.photo_url,
    pp.last_body,
    pp.last_at,
    pp.last_request_id,
    COALESCE(pp.any_unread, FALSE),
    pp.n_shared
  FROM per_party pp
  JOIN profiles p ON p.id = pp.other_party_id
  ORDER BY pp.last_at DESC NULLS LAST
  LIMIT GREATEST(1, p_limit);
END;
$$;

GRANT EXECUTE ON FUNCTION rpc_list_conversations_by_party(INTEGER) TO authenticated;

-- ============================================================================
-- 2. rpc_list_messages_by_party
-- ============================================================================

DROP FUNCTION IF EXISTS rpc_list_messages_by_party(UUID);

CREATE OR REPLACE FUNCTION rpc_list_messages_by_party(p_other_party_id UUID)
RETURNS TABLE (
  id                UUID,
  request_id        UUID,
  quote_id          UUID,
  sender_id         UUID,
  body              TEXT,
  message_type      TEXT,
  appointment_id    UUID,
  attachment_paths  TEXT[],
  created_at        TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
BEGIN
  IF v_uid IS NULL OR p_other_party_id IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH shared_requests AS (
    -- All request_ids where the caller and the other party are
    -- paired (requester ↔ trade_target). Either direction. Column
    -- aliased to `req_id` so the downstream IN (...) subquery
    -- isn't ambiguous against messages.request_id.
    SELECT qr.id AS req_id
    FROM quote_requests qr
    JOIN request_targets rt ON rt.request_id = qr.id
    WHERE
      (qr.requester_id = v_uid AND rt.trade_id = p_other_party_id)
      OR (qr.requester_id = p_other_party_id AND rt.trade_id = v_uid)
  )
  SELECT
    m.id,
    m.request_id,
    m.quote_id,
    m.sender_id,
    m.body,
    m.message_type,
    m.appointment_id,
    m.attachment_paths,
    m.created_at
  FROM messages m
  WHERE m.request_id IN (SELECT sr.req_id FROM shared_requests sr)
    AND m.message_type IS DISTINCT FROM 'system'
  ORDER BY m.created_at ASC;
END;
$$;

GRANT EXECUTE ON FUNCTION rpc_list_messages_by_party(UUID) TO authenticated;

-- ============================================================================
-- 3. rpc_send_message_to_party
-- ============================================================================

DROP FUNCTION IF EXISTS rpc_send_message_to_party(UUID, TEXT, TEXT[]);
DROP FUNCTION IF EXISTS rpc_send_message_to_party(UUID, TEXT, TEXT[], UUID);

CREATE OR REPLACE FUNCTION rpc_send_message_to_party(
  p_other_party_id UUID,
  p_body           TEXT,
  p_paths          TEXT[] DEFAULT NULL,
  p_quote_id       UUID   DEFAULT NULL
)
RETURNS TABLE (
  id               UUID,
  request_id       UUID,
  quote_id         UUID,
  sender_id        UUID,
  body             TEXT,
  message_type     TEXT,
  attachment_paths TEXT[],
  created_at       TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid         UUID := auth.uid();
  v_request_id  UUID;
  v_type        TEXT;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not signed in' USING ERRCODE = '42501';
  END IF;
  IF p_other_party_id IS NULL THEN
    RAISE EXCEPTION 'Missing other party id' USING ERRCODE = '22023';
  END IF;
  IF COALESCE(TRIM(p_body), '') = '' AND (p_paths IS NULL OR array_length(p_paths, 1) IS NULL) THEN
    RAISE EXCEPTION 'Message must have body or attachments' USING ERRCODE = '22023';
  END IF;

  -- Find the most recent shared request between me and the other
  -- party. Messages always attach to a request; this picks the
  -- freshest one so the message lands in the right project
  -- context.
  SELECT qr.id
  INTO v_request_id
  FROM quote_requests qr
  JOIN request_targets rt ON rt.request_id = qr.id
  WHERE
    (qr.requester_id = v_uid AND rt.trade_id = p_other_party_id)
    OR (qr.requester_id = p_other_party_id AND rt.trade_id = v_uid)
  ORDER BY qr.created_at DESC
  LIMIT 1;

  IF v_request_id IS NULL THEN
    RAISE EXCEPTION 'No shared project between you and this user'
      USING ERRCODE = '42501',
            HINT = 'Send a quote request first to start a conversation.';
  END IF;

  v_type := CASE
    WHEN p_paths IS NOT NULL AND array_length(p_paths, 1) IS NOT NULL THEN 'image'
    ELSE 'text'
  END;

  RETURN QUERY
  INSERT INTO messages (request_id, quote_id, sender_id, body, message_type, attachment_paths)
  VALUES (v_request_id, p_quote_id, v_uid, COALESCE(TRIM(p_body), ''), v_type, p_paths)
  RETURNING
    messages.id,
    messages.request_id,
    messages.quote_id,
    messages.sender_id,
    messages.body,
    messages.message_type,
    messages.attachment_paths,
    messages.created_at;
END;
$$;

GRANT EXECUTE ON FUNCTION rpc_send_message_to_party(UUID, TEXT, TEXT[], UUID) TO authenticated;

-- ============================================================================
-- 4. rpc_mark_party_read
-- ============================================================================
-- Sets last_read_at = NOW() for every shared request between me and
-- the other party. Idempotent upsert per request.

DROP FUNCTION IF EXISTS rpc_mark_party_read(UUID);

CREATE OR REPLACE FUNCTION rpc_mark_party_read(p_other_party_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
BEGIN
  IF v_uid IS NULL OR p_other_party_id IS NULL THEN RETURN; END IF;

  INSERT INTO conversation_reads (user_id, request_id, last_read_at)
  SELECT v_uid, qr.id, NOW()
  FROM quote_requests qr
  JOIN request_targets rt ON rt.request_id = qr.id
  WHERE
    (qr.requester_id = v_uid AND rt.trade_id = p_other_party_id)
    OR (qr.requester_id = p_other_party_id AND rt.trade_id = v_uid)
  ON CONFLICT (user_id, request_id)
  DO UPDATE SET last_read_at = EXCLUDED.last_read_at;
END;
$$;

GRANT EXECUTE ON FUNCTION rpc_mark_party_read(UUID) TO authenticated;

COMMIT;
