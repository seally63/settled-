-- Migration: Appointment.kind + text-only conversations
-- Date: 2026-04-28
-- Description:
--   1. Adds appointments.kind (survey / design / start_job /
--      followup / final) with a CHECK constraint. Existing rows
--      back-filled to 'survey'.
--
--   2. Replaces rpc_send_appointment_message:
--      · accepts p_kind (default 'survey')
--      · stores kind on the appointment row
--      · STOPS inserting a matching `messages` row. The
--        conversation is now text-only; appointments live on the
--        project screen's Recent Activity + bottom sheet only.
--      · hard-guards: start_job / followup / final require a
--        linked quote_id.
--
--   3. Updates rpc_list_messages_by_party +
--      rpc_list_conversations_by_party to filter out any legacy
--      `message_type='appointment'` rows that pre-date this
--      migration. Thread stays text-only going forward, and the
--      conversation preview ignores them so the "last message"
--      snippet is always an actual typed message.
--
--   4. Idempotent — safe to re-run.

BEGIN;

-- ============================================================================
-- 1. appointments.kind
-- ============================================================================

ALTER TABLE appointments
  ADD COLUMN IF NOT EXISTS kind TEXT;

UPDATE appointments
SET kind = 'survey'
WHERE kind IS NULL;

ALTER TABLE appointments DROP CONSTRAINT IF EXISTS appointments_kind_check;
ALTER TABLE appointments
  ADD CONSTRAINT appointments_kind_check
  CHECK (kind IN ('survey', 'design', 'start_job', 'followup', 'final'));

CREATE INDEX IF NOT EXISTS idx_appointments_quote_kind
  ON appointments(quote_id, kind)
  WHERE quote_id IS NOT NULL;

-- ============================================================================
-- 2. rpc_send_appointment_message — kind-aware, no message row
-- ============================================================================

DROP FUNCTION IF EXISTS rpc_send_appointment_message(UUID, UUID, TIMESTAMPTZ, TEXT, TEXT);
DROP FUNCTION IF EXISTS rpc_send_appointment_message(UUID, UUID, TIMESTAMPTZ, TEXT, TEXT, TEXT);

CREATE OR REPLACE FUNCTION rpc_send_appointment_message(
  p_request_id   UUID,
  p_quote_id     UUID DEFAULT NULL,
  p_scheduled_at TIMESTAMPTZ DEFAULT NULL,
  p_title        TEXT DEFAULT 'Appointment',
  p_location     TEXT DEFAULT NULL,
  p_kind         TEXT DEFAULT 'survey'
)
RETURNS TABLE (
  appointment_id UUID,
  message_id     UUID,
  success        BOOLEAN,
  error          TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id        UUID := auth.uid();
  v_appointment_id UUID;
  v_client_id      UUID;
  v_request        RECORD;
BEGIN
  SELECT id, requester_id INTO v_request
  FROM quote_requests
  WHERE id = p_request_id;

  IF NOT FOUND THEN
    RETURN QUERY SELECT NULL::UUID, NULL::UUID, false, 'Request not found';
    RETURN;
  END IF;

  v_client_id := v_request.requester_id;

  IF p_scheduled_at IS NULL THEN
    RETURN QUERY SELECT NULL::UUID, NULL::UUID, false, 'Scheduled time is required';
    RETURN;
  END IF;

  IF p_scheduled_at <= NOW() THEN
    RETURN QUERY SELECT NULL::UUID, NULL::UUID, false, 'Scheduled time must be in the future';
    RETURN;
  END IF;

  IF p_kind IN ('start_job', 'followup', 'final') AND p_quote_id IS NULL THEN
    RETURN QUERY SELECT NULL::UUID, NULL::UUID, false,
      'This visit type requires a linked accepted quote';
    RETURN;
  END IF;

  INSERT INTO appointments (
    trade_id, client_id, quote_id, request_id,
    title, location, scheduled_at, status, kind,
    created_at, updated_at
  )
  VALUES (
    v_user_id, v_client_id, p_quote_id, p_request_id,
    p_title, p_location, p_scheduled_at, 'proposed', p_kind,
    NOW(), NOW()
  )
  RETURNING id INTO v_appointment_id;

  RETURN QUERY SELECT v_appointment_id, NULL::UUID, true, NULL::TEXT;
END;
$$;

GRANT EXECUTE ON FUNCTION rpc_send_appointment_message(UUID, UUID, TIMESTAMPTZ, TEXT, TEXT, TEXT)
  TO authenticated;

-- ============================================================================
-- 3a. rpc_list_messages_by_party — filter appointment messages
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
  IF v_uid IS NULL OR p_other_party_id IS NULL THEN RETURN; END IF;

  RETURN QUERY
  WITH shared_requests AS (
    SELECT qr.id AS req_id
    FROM quote_requests qr
    JOIN request_targets rt ON rt.request_id = qr.id
    WHERE
      (qr.requester_id = v_uid AND rt.trade_id = p_other_party_id)
      OR (qr.requester_id = p_other_party_id AND rt.trade_id = v_uid)
  )
  SELECT
    m.id, m.request_id, m.quote_id, m.sender_id,
    m.body, m.message_type, m.appointment_id,
    m.attachment_paths, m.created_at
  FROM messages m
  WHERE m.request_id IN (SELECT sr.req_id FROM shared_requests sr)
    AND m.message_type NOT IN ('system', 'appointment')
  ORDER BY m.created_at ASC;
END;
$$;

GRANT EXECUTE ON FUNCTION rpc_list_messages_by_party(UUID) TO authenticated;

-- ============================================================================
-- 3b. rpc_list_conversations_by_party — filter appointment messages
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
  IF v_uid IS NULL THEN RETURN; END IF;

  RETURN QUERY
  WITH my_requests AS (
    SELECT
      qr.id AS request_id,
      CASE
        WHEN qr.requester_id = v_uid THEN rt.trade_id
        ELSE qr.requester_id
      END AS other_party_id
    FROM quote_requests qr
    JOIN request_targets rt ON rt.request_id = qr.id
    WHERE qr.requester_id = v_uid OR rt.trade_id = v_uid
  ),
  per_request_latest AS (
    SELECT DISTINCT ON (m.request_id)
      m.request_id, m.id AS message_id,
      m.body AS last_body, m.created_at AS last_at,
      m.sender_id
    FROM messages m
    WHERE m.request_id IN (SELECT request_id FROM my_requests)
      AND m.message_type NOT IN ('system', 'appointment')
      AND COALESCE(TRIM(m.body), '') <> ''
    ORDER BY m.request_id, m.created_at DESC
  ),
  per_party AS (
    SELECT
      mr.other_party_id,
      MAX(prl.last_at) AS last_at,
      (ARRAY_AGG(prl.last_body      ORDER BY prl.last_at DESC NULLS LAST))[1] AS last_body,
      (ARRAY_AGG(prl.request_id     ORDER BY prl.last_at DESC NULLS LAST))[1] AS last_request_id,
      (ARRAY_AGG(prl.sender_id      ORDER BY prl.last_at DESC NULLS LAST))[1] AS last_sender,
      COUNT(DISTINCT mr.request_id)::INT AS n_shared,
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
      ) AS any_unread
    FROM my_requests mr
    LEFT JOIN per_request_latest prl ON prl.request_id = mr.request_id
    WHERE mr.other_party_id IS NOT NULL
    GROUP BY mr.other_party_id
    HAVING MAX(prl.last_at) IS NOT NULL
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

COMMIT;
