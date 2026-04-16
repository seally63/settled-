-- ============================================================================
-- Auto-refresh trade_performance_stats whenever reviews change
-- Without this, the cached review_count / average_rating never updates,
-- so client-facing feeds keep showing "No reviews yet".
-- ============================================================================

-- Trigger function: refresh stats for the affected trade
CREATE OR REPLACE FUNCTION trg_refresh_stats_on_review_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_trade_id UUID;
BEGIN
  -- On INSERT/UPDATE use NEW; on DELETE use OLD
  IF (TG_OP = 'DELETE') THEN
    v_trade_id := OLD.reviewee_id;
  ELSE
    v_trade_id := NEW.reviewee_id;
  END IF;

  IF v_trade_id IS NOT NULL THEN
    PERFORM refresh_trade_performance_stats(v_trade_id);
  END IF;

  IF (TG_OP = 'DELETE') THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

-- Replace any pre-existing trigger with the same name
DROP TRIGGER IF EXISTS reviews_refresh_stats ON reviews;

CREATE TRIGGER reviews_refresh_stats
  AFTER INSERT OR UPDATE OR DELETE ON reviews
  FOR EACH ROW
  EXECUTE FUNCTION trg_refresh_stats_on_review_change();

-- Backfill: refresh stats for every trade that already has at least one review,
-- so existing reviews start showing on profiles/feeds immediately.
DO $$
DECLARE
  v_trade_id UUID;
BEGIN
  FOR v_trade_id IN
    SELECT DISTINCT reviewee_id
    FROM reviews
    WHERE reviewer_type = 'client'
      AND reviewee_id IS NOT NULL
  LOOP
    PERFORM refresh_trade_performance_stats(v_trade_id);
  END LOOP;
END
$$;
