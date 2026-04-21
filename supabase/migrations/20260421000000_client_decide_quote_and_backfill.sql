-- Migration: Client decide-quote RPC + client_id backfill
-- Date: 2026-04-21
-- Description:
--   The client-facing Quote Overview page has always called
--   `supabase.rpc("rpc_client_decide_quote", ...)` to accept or decline
--   a trade's quote, but the RPC itself was never committed to the
--   migrations tree. Combined with the fact that `tradify_native_app_db`
--   rows are inserted with `client_id = NULL` (the trade builder only
--   writes `trade_id`), the RLS UPDATE policy —
--       (trade_id = auth.uid() OR client_id = auth.uid())
--   — blocks the client entirely: they are neither the trade, nor the
--   `client_id` (because it's NULL).
--
--   This migration ships three fixes:
--
--     1. `rpc_client_decide_quote` — a SECURITY DEFINER RPC so the
--        client can accept / decline by authenticating as the
--        quote_requests.requester_id regardless of whether the row's
--        `client_id` column happens to be populated. The RPC also
--        back-fills `client_id` on the row while it's there, so
--        subsequent actions (messaging, appointments) see the proper
--        ownership.
--
--     2. `trg_set_quote_client_id` — a BEFORE INSERT trigger on
--        `tradify_native_app_db` that auto-populates `client_id` from
--        `quote_requests.requester_id` when the trade omits it. New
--        quotes are therefore owned by both sides from row 0.
--
--     3. One-off back-fill: any legacy row where `client_id IS NULL`
--        but `request_id` points to a request with a known requester.
--
-- Idempotent — safe to re-run.

-- ============================================================================
-- 1. BACKFILL client_id on existing rows
-- ============================================================================

UPDATE tradify_native_app_db q
SET client_id = qr.requester_id
FROM quote_requests qr
WHERE q.request_id = qr.id
  AND q.client_id IS NULL
  AND qr.requester_id IS NOT NULL;

-- ============================================================================
-- 2. TRIGGER: auto-populate client_id on new quote rows
-- ============================================================================

CREATE OR REPLACE FUNCTION fn_set_quote_client_id()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.client_id IS NULL AND NEW.request_id IS NOT NULL THEN
    SELECT requester_id
    INTO NEW.client_id
    FROM quote_requests
    WHERE id = NEW.request_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_quote_client_id ON tradify_native_app_db;
CREATE TRIGGER trg_set_quote_client_id
  BEFORE INSERT ON tradify_native_app_db
  FOR EACH ROW
  EXECUTE FUNCTION fn_set_quote_client_id();

-- ============================================================================
-- 3. RPC: rpc_client_decide_quote
-- ============================================================================
--
--   Args:
--     p_quote_id UUID   — the quote being decided on
--     p_decision TEXT   — 'accepted' or 'declined'
--
--   Rules:
--     · caller must be logged in (auth.uid() IS NOT NULL)
--     · caller must be the quote's client — matched via either
--       tradify_native_app_db.client_id or quote_requests.requester_id
--     · quote must currently be in a decidable state
--       ('created', 'sent', 'quoted'); calls on drafts / expired /
--        already-accepted / already-declined rows are rejected
--     · side-effect: back-fills client_id on the row if it was NULL
--
--   Raises descriptive exceptions; the JS client surfaces `.message`
--   in an Alert.

CREATE OR REPLACE FUNCTION rpc_client_decide_quote(
  p_quote_id UUID,
  p_decision TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid          UUID;
  v_quote        RECORD;
  v_requester_id UUID;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not signed in' USING ERRCODE = '42501';
  END IF;

  IF p_decision NOT IN ('accepted', 'declined') THEN
    RAISE EXCEPTION 'Invalid decision: %', p_decision USING ERRCODE = '22023';
  END IF;

  -- Load the quote. Bypasses RLS because SECURITY DEFINER.
  SELECT id, trade_id, client_id, request_id, status
  INTO v_quote
  FROM tradify_native_app_db
  WHERE id = p_quote_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Quote not found' USING ERRCODE = 'P0002';
  END IF;

  -- Resolve who the client actually is — prefer the quote's own
  -- client_id; fall back to the request's requester_id.
  v_requester_id := v_quote.client_id;
  IF v_requester_id IS NULL AND v_quote.request_id IS NOT NULL THEN
    SELECT requester_id
    INTO v_requester_id
    FROM quote_requests
    WHERE id = v_quote.request_id;
  END IF;

  IF v_requester_id IS NULL OR v_requester_id <> v_uid THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  -- Only allow decisions on a quote the client can still act on.
  -- Drafts are trade-only; expired / already-decided are terminal.
  IF v_quote.status NOT IN ('created', 'sent', 'quoted') THEN
    RAISE EXCEPTION 'This quote can no longer be %', p_decision
      USING ERRCODE = '22023';
  END IF;

  UPDATE tradify_native_app_db
  SET
    status     = p_decision,
    client_id  = COALESCE(client_id, v_requester_id),
    updated_at = NOW()
  WHERE id = p_quote_id;
END;
$$;

GRANT EXECUTE ON FUNCTION rpc_client_decide_quote(UUID, TEXT) TO authenticated;
