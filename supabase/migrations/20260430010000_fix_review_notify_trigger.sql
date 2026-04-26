-- ============================================================================
-- Patch fn_notify_review to read NEW.content instead of NEW.comment
--
-- Why this migration exists
--   `fn_notify_review` (an AFTER INSERT trigger on `reviews` queueing a
--   "you got a review" push notification) was authored before the V2
--   reviews schema unify (20260416000000) split content/photos out of
--   the legacy `comment` column. After the unify migration ran on
--   environments that removed the legacy column, the trigger started
--   raising:
--     ERROR  record "new" has no field "comment"
--   on every INSERT into `reviews` — which silently broke
--   rpc_submit_review (the function inserts the row, then the trigger
--   fails, then the whole transaction rolls back).
--
-- This patch swaps `NEW.comment` for `NEW.content`. The JSONB payload
-- key stays "comment" for back-compat with any client/Notification
-- handler that may be reading it under the old name.
--
-- Idempotent — CREATE OR REPLACE just rewrites the function body.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_notify_review()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_reviewer_name TEXT;
  v_rating_stars  TEXT;
BEGIN
  v_reviewer_name := fn_get_display_name(NEW.reviewer_id);
  v_rating_stars  := REPEAT('⭐', COALESCE(NEW.rating, 0)::INTEGER);

  PERFORM fn_queue_notification(
    NEW.reviewee_id,
    'review_received',
    format('%s Review', v_rating_stars),
    format('%s left you a review', v_reviewer_name),
    jsonb_build_object(
      'review_id',     NEW.id,
      'reviewer_id',   NEW.reviewer_id,
      'reviewer_name', v_reviewer_name,
      'rating',        NEW.rating,
      -- Key stays "comment" so existing notification handlers don't
      -- have to change shape; value reads from V2 `content`.
      'comment',       LEFT(COALESCE(NEW.content, ''), 100)
    )
  );

  RETURN NEW;
END;
$function$;
