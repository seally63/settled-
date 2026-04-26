-- ============================================================================
-- rpc_submit_review
--
-- Why this migration exists
--   The client app's leave-review screen has been calling
--     supabase.rpc("rpc_submit_review", { p_quote_id, p_rating,
--                                         p_content, p_reviewer_type,
--                                         p_photos })
--   since the V2 reviews schema unify (20260416000000), but the function
--   itself was never written — only referenced in a comment in
--   lib/api/trust.js. Every review submission failed silently / 404'd
--   from the client. This migration ships the missing RPC so reviews
--   actually land in the `reviews` table and the existing
--   `reviews_refresh_stats` trigger (20260416010000) can recompute the
--   trade's cached rating.
--
-- Behaviour
--   · Caller must be signed in (auth.uid() not null).
--   · `p_rating` must be 1..5; `p_reviewer_type` must be 'client' or
--     'trade'; `p_photos` is capped at 5 entries (matches the UI limit).
--   · The quote must be in a state where reviews make sense:
--       'awaiting_completion' or 'completed'. Drafts / sent / accepted
--       quotes can't be reviewed yet.
--   · Caller authorisation is derived from the quote row:
--       reviewer_type='client' → caller must equal client_id (or, if
--       the row's client_id is NULL, equal quote_requests.requester_id —
--       same fallback rpc_client_decide_quote uses).
--       reviewer_type='trade'  → caller must equal trade_id.
--   · Reviewee is whichever party the caller is NOT (trade_id for a
--     client review, client_id for a trade review).
--   · Duplicate reviews from the same reviewer for the same quote are
--     rejected (one review per reviewer per quote).
--   · On insert, the existing `reviews_refresh_stats` trigger fires and
--     refreshes the trade's cached rating_avg / review_count.
--
-- SECURITY DEFINER bypasses the existing RLS policy on `reviews`, but
-- the function still sets reviewer_id = auth.uid() so the policy
-- (`reviewer_id = auth.uid()`) is also satisfied if anyone ever
-- migrates this back to a direct INSERT path.
--
-- Idempotent: CREATE OR REPLACE FUNCTION + GRANT.
-- ============================================================================

CREATE OR REPLACE FUNCTION rpc_submit_review(
  p_quote_id       UUID,
  p_rating         INTEGER,
  p_content        TEXT DEFAULT NULL,
  p_reviewer_type  TEXT DEFAULT 'client',
  p_photos         TEXT[] DEFAULT '{}'::TEXT[]
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid          UUID;
  v_quote        RECORD;
  v_requester_id UUID;
  v_reviewee_id  UUID;
  v_review_id    UUID;
  v_photos       TEXT[];
BEGIN
  -- ---- Auth ------------------------------------------------------------
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not signed in' USING ERRCODE = '42501';
  END IF;

  -- ---- Argument validation --------------------------------------------
  IF p_rating IS NULL OR p_rating < 1 OR p_rating > 5 THEN
    RAISE EXCEPTION 'Rating must be between 1 and 5' USING ERRCODE = '22023';
  END IF;

  IF p_reviewer_type IS NULL OR p_reviewer_type NOT IN ('client', 'trade') THEN
    RAISE EXCEPTION 'Invalid reviewer_type: %', p_reviewer_type
      USING ERRCODE = '22023';
  END IF;

  -- Cap photos at 5 (matches the leave-review UI). NULL → empty array.
  v_photos := COALESCE(p_photos, '{}'::TEXT[]);
  IF array_length(v_photos, 1) IS NOT NULL AND array_length(v_photos, 1) > 5 THEN
    RAISE EXCEPTION 'Too many photos (max 5, got %)', array_length(v_photos, 1)
      USING ERRCODE = '22023';
  END IF;

  -- ---- Load the quote --------------------------------------------------
  -- SECURITY DEFINER bypasses RLS, so this works regardless of which
  -- side of the deal the caller is on.
  SELECT id, trade_id, client_id, request_id, status
  INTO v_quote
  FROM tradify_native_app_db
  WHERE id = p_quote_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Quote not found: %', p_quote_id USING ERRCODE = 'P0002';
  END IF;

  -- Reviews only make sense once the work is done (or the trade has
  -- claimed completion and is waiting on the client to confirm).
  IF v_quote.status NOT IN ('awaiting_completion', 'completed') THEN
    RAISE EXCEPTION 'Cannot review a quote in state %', v_quote.status
      USING ERRCODE = '22023';
  END IF;

  -- Resolve the requester via the quote_request, mirroring
  -- rpc_client_decide_quote — covers the case where the quote row was
  -- inserted with client_id = NULL.
  v_requester_id := v_quote.client_id;
  IF v_requester_id IS NULL AND v_quote.request_id IS NOT NULL THEN
    SELECT requester_id
    INTO v_requester_id
    FROM quote_requests
    WHERE id = v_quote.request_id;
  END IF;

  -- ---- Authorise + pick reviewee ---------------------------------------
  IF p_reviewer_type = 'client' THEN
    IF v_requester_id IS NULL OR v_uid <> v_requester_id THEN
      RAISE EXCEPTION 'Only the client on this quote can leave a client review'
        USING ERRCODE = '42501';
    END IF;
    v_reviewee_id := v_quote.trade_id;
  ELSE
    -- p_reviewer_type = 'trade'
    IF v_quote.trade_id IS NULL OR v_uid <> v_quote.trade_id THEN
      RAISE EXCEPTION 'Only the trade on this quote can leave a trade review'
        USING ERRCODE = '42501';
    END IF;
    v_reviewee_id := COALESCE(v_quote.client_id, v_requester_id);
  END IF;

  IF v_reviewee_id IS NULL THEN
    RAISE EXCEPTION 'Could not determine reviewee for this quote'
      USING ERRCODE = '22023';
  END IF;

  -- ---- Reject duplicates -----------------------------------------------
  -- One review per reviewer per quote. If the user wants to amend, that
  -- needs a separate `rpc_update_review` (out of scope here).
  IF EXISTS (
    SELECT 1
    FROM reviews
    WHERE quote_id = p_quote_id
      AND reviewer_id = v_uid
  ) THEN
    RAISE EXCEPTION 'You already reviewed this job' USING ERRCODE = '23505';
  END IF;

  -- ---- Insert ----------------------------------------------------------
  -- Both `content` and the legacy `comment` column are populated so
  -- older readers (lib/api/trust.js V1 fallback) keep working.
  INSERT INTO reviews (
    quote_id,
    reviewer_id,
    reviewee_id,
    reviewer_type,
    rating,
    content,
    comment,
    photos
  )
  VALUES (
    p_quote_id,
    v_uid,
    v_reviewee_id,
    p_reviewer_type,
    p_rating,
    NULLIF(TRIM(COALESCE(p_content, '')), ''),
    NULLIF(TRIM(COALESCE(p_content, '')), ''),
    v_photos
  )
  RETURNING id INTO v_review_id;

  -- The `reviews_refresh_stats` AFTER INSERT trigger
  -- (20260416010000_review_stats_trigger.sql) recalculates the trade's
  -- cached rating now — no manual call needed.

  RETURN v_review_id;
END;
$$;

-- Allow the client to call it. SECURITY DEFINER means the function
-- runs as its owner, but the EXECUTE grant still has to allow the
-- caller's role through the door.
REVOKE ALL ON FUNCTION rpc_submit_review(UUID, INTEGER, TEXT, TEXT, TEXT[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION rpc_submit_review(UUID, INTEGER, TEXT, TEXT, TEXT[])
  TO authenticated;
