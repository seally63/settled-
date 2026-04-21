-- Migration: Work-started tracking + RPCs + notification
-- Date: 2026-04-22
-- Description:
--   Introduces an explicit "work has started" signal on tradify_native_app_db
--   so both the trade's and client's app can flip the project card from
--   "Scheduled" to "In progress" at the exact moment the trade tells us
--   they've begun. Previously the app had no server-side notion of when
--   work actually starts — only when an appointment was booked or when
--   the job was marked complete.
--
--   Design choices (discussed + signed off):
--     · One column on the quote row. Not on the appointment row — a project
--       may have multiple appointments (consultation, Day 1, follow-up),
--       but it has exactly one "start of work" moment.
--     · SECURITY DEFINER RPC so the trade can write without needing UPDATE
--       permissions on arbitrary columns; COALESCE makes it idempotent.
--     · A hard gate: the quote must be `accepted` AND it must have at
--       least one confirmed work appointment. No confirmed slot = no
--       shared timeline with the client.
--     · Soft guard (UI-layer, not DB): if the first confirmed appointment
--       is more than 7 days in the future the app confirms once more
--       before firing. Not enforced here because legitimate early-starts
--       exist and a DB error is a poor UX for a confirmation prompt.
--     · Undo window: 5 minutes after the stamp. Enforced here so a
--       misclick can be reversed without special-casing in the UI.
--     · A notification trigger fires once, on the NULL → NOT NULL flip.
--       Undo within the window clears the column; the trigger is
--       idempotent (no push queued on the backfill-NULL update).

BEGIN;

-- ============================================================================
-- 1. SCHEMA
-- ============================================================================

ALTER TABLE tradify_native_app_db
  ADD COLUMN IF NOT EXISTS work_started_at TIMESTAMPTZ;

-- Partial index — the column is NULL for the vast majority of rows
-- (nothing has started yet). Only index the non-null rows so the "find
-- all in-progress projects" filter stays fast as the table grows.
CREATE INDEX IF NOT EXISTS idx_quotes_work_started
  ON tradify_native_app_db (work_started_at)
  WHERE work_started_at IS NOT NULL;

-- ============================================================================
-- 2. rpc_trade_start_work
-- ============================================================================
--   Args:
--     p_quote_id UUID — the quote whose project is starting
--
--   Returns: the stamped timestamp (so the client can show it without a
--   follow-up fetch).
--
--   Rules:
--     · caller must be signed in (auth.uid() IS NOT NULL)
--     · caller must own the quote (trade_id = auth.uid())
--     · quote must currently be in `accepted` status
--     · quote must have at least one confirmed appointment tied to it
--       (via appointments.quote_id — we ignore request-level appointments
--       because survey visits don't count as "work")
--     · idempotent: second call returns the original timestamp

CREATE OR REPLACE FUNCTION rpc_trade_start_work(
  p_quote_id UUID
)
RETURNS TIMESTAMPTZ
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid   UUID;
  v_quote RECORD;
  v_has_confirmed_appt BOOLEAN;
  v_stamp TIMESTAMPTZ;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not signed in' USING ERRCODE = '42501';
  END IF;

  SELECT id, trade_id, status, work_started_at
  INTO v_quote
  FROM tradify_native_app_db
  WHERE id = p_quote_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Quote not found' USING ERRCODE = 'P0002';
  END IF;

  IF v_quote.trade_id IS DISTINCT FROM v_uid THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  -- Idempotent — if already started, just return the original stamp.
  IF v_quote.work_started_at IS NOT NULL THEN
    RETURN v_quote.work_started_at;
  END IF;

  IF v_quote.status <> 'accepted' THEN
    RAISE EXCEPTION 'Quote must be accepted before work can start'
      USING ERRCODE = '22023';
  END IF;

  -- Gate: at least one confirmed work appointment must exist. Survey /
  -- request-level appointments (quote_id IS NULL) don't count.
  SELECT EXISTS (
    SELECT 1
    FROM appointments
    WHERE quote_id = p_quote_id
      AND LOWER(status) IN ('confirmed', 'accepted')
  )
  INTO v_has_confirmed_appt;

  IF NOT v_has_confirmed_appt THEN
    RAISE EXCEPTION 'No confirmed appointment for this quote'
      USING ERRCODE = '22023',
            HINT = 'Schedule a work appointment and have it confirmed first.';
  END IF;

  UPDATE tradify_native_app_db
  SET work_started_at = NOW(),
      updated_at      = NOW()
  WHERE id = p_quote_id
  RETURNING work_started_at INTO v_stamp;

  RETURN v_stamp;
END;
$$;

GRANT EXECUTE ON FUNCTION rpc_trade_start_work(UUID) TO authenticated;

-- ============================================================================
-- 3. rpc_trade_undo_start_work
-- ============================================================================
--   5-minute window only. After that the action is permanent — the
--   client has almost certainly seen the notification + card update by
--   then, and quietly rolling it back would be more confusing than
--   keeping it. The cap is enforced in SQL so the UI can't widen it.

CREATE OR REPLACE FUNCTION rpc_trade_undo_start_work(
  p_quote_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid   UUID;
  v_quote RECORD;
  v_undo_window INTERVAL := INTERVAL '5 minutes';
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not signed in' USING ERRCODE = '42501';
  END IF;

  SELECT id, trade_id, work_started_at
  INTO v_quote
  FROM tradify_native_app_db
  WHERE id = p_quote_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Quote not found' USING ERRCODE = 'P0002';
  END IF;

  IF v_quote.trade_id IS DISTINCT FROM v_uid THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  IF v_quote.work_started_at IS NULL THEN
    -- Already clear — nothing to undo, but don't raise. Idempotent.
    RETURN;
  END IF;

  IF NOW() - v_quote.work_started_at > v_undo_window THEN
    RAISE EXCEPTION 'Undo window has passed'
      USING ERRCODE = '22023',
            HINT = 'Start-of-work can only be undone within 5 minutes.';
  END IF;

  UPDATE tradify_native_app_db
  SET work_started_at = NULL,
      updated_at      = NOW()
  WHERE id = p_quote_id;
END;
$$;

GRANT EXECUTE ON FUNCTION rpc_trade_undo_start_work(UUID) TO authenticated;

-- ============================================================================
-- 4. NOTIFICATION: fn_notify_work_started trigger
-- ============================================================================
--   Fires once per NULL → NOT NULL flip. Runs alongside the existing
--   fn_notify_quote_update trigger from PUSH_NOTIFICATIONS_COMBINED.sql —
--   it does NOT replace that trigger, so quote_accepted / quote_declined
--   notifications keep working exactly as before. If the queue helper
--   function isn't present (dev environments that haven't applied the
--   push-notifications combined SQL), the trigger silently no-ops so it
--   doesn't break writes.

CREATE OR REPLACE FUNCTION fn_notify_work_started()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_client_id UUID;
  v_trade_name TEXT;
  v_project_title TEXT;
  v_body TEXT;
BEGIN
  -- Only fire on the NULL → NOT NULL transition; skip the undo path.
  IF OLD.work_started_at IS NOT NULL OR NEW.work_started_at IS NULL THEN
    RETURN NEW;
  END IF;

  -- Who should we notify? The quote's client_id if populated, else the
  -- underlying request's requester_id. Keeps working on legacy rows that
  -- pre-date the client_id backfill.
  v_client_id := NEW.client_id;
  IF v_client_id IS NULL AND NEW.request_id IS NOT NULL THEN
    SELECT requester_id INTO v_client_id
    FROM quote_requests WHERE id = NEW.request_id;
  END IF;

  IF v_client_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Best-effort name + title resolution. All failures are tolerated
  -- because the trigger fires on the main write path.
  BEGIN
    SELECT COALESCE(business_name, full_name, 'Your trade')
    INTO v_trade_name
    FROM profiles WHERE id = NEW.trade_id;
  EXCEPTION WHEN OTHERS THEN
    v_trade_name := 'Your trade';
  END;

  v_project_title := COALESCE(NEW.project_title, 'your project');
  v_body := format('%s has started work on %s', v_trade_name, v_project_title);

  -- Enqueue via the combined push-notifications helper if present.
  -- Guarded so this migration doesn't hard-require the combined SQL.
  BEGIN
    PERFORM fn_queue_notification(
      v_client_id,
      'work_started',
      'Work has started',
      v_body,
      jsonb_build_object(
        'quote_id',   NEW.id,
        'request_id', NEW.request_id,
        'trade_id',   NEW.trade_id,
        'started_at', NEW.work_started_at
      )
    );
  EXCEPTION WHEN undefined_function THEN
    -- Queue helper not installed here; surface in logs but don't fail.
    RAISE NOTICE 'fn_queue_notification not found, skipping work_started push';
  WHEN OTHERS THEN
    RAISE NOTICE 'work_started push failed: %', SQLERRM;
  END;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_work_started ON tradify_native_app_db;
CREATE TRIGGER trg_notify_work_started
  AFTER UPDATE OF work_started_at ON tradify_native_app_db
  FOR EACH ROW
  EXECUTE FUNCTION fn_notify_work_started();

COMMIT;
