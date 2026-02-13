-- ============================================================================
-- Quote Auto-Expiry and Request Expiry Logic
-- Ensures quotes and requests expire properly in the database (not just UI)
-- ============================================================================

-- ============================================================================
-- 1. FUNCTION TO AUTO-EXPIRE QUOTES
-- Called by pg_cron or Edge Function scheduler
-- ============================================================================

CREATE OR REPLACE FUNCTION fn_expire_overdue_quotes()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  -- Update quotes where valid_until has passed and status is still 'sent'
  UPDATE tradify_native_app_db
  SET status = 'expired',
      updated_at = NOW()
  WHERE status = 'sent'
    AND valid_until IS NOT NULL
    AND valid_until < NOW();

  GET DIAGNOSTICS v_count = ROW_COUNT;

  RAISE NOTICE 'Expired % quotes', v_count;
  RETURN v_count;
END;
$$;

-- ============================================================================
-- 2. FUNCTION TO AUTO-EXPIRE REQUESTS
-- Requests expire if no trade has accepted within X days (configurable)
-- Default: 14 days for open requests, 7 days for direct requests
-- ============================================================================

CREATE OR REPLACE FUNCTION fn_expire_overdue_requests()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INTEGER;
  v_open_expiry_days INTEGER := 14;   -- Open requests expire after 14 days
  v_direct_expiry_days INTEGER := 7;  -- Direct requests expire after 7 days
BEGIN
  -- Expire open requests older than 14 days with no accepted quotes
  UPDATE quote_requests qr
  SET status = 'expired',
      updated_at = NOW()
  WHERE qr.status = 'open'
    AND qr.is_direct = false
    AND qr.created_at < NOW() - (v_open_expiry_days || ' days')::INTERVAL
    AND NOT EXISTS (
      SELECT 1 FROM request_targets rt
      WHERE rt.request_id = qr.id
        AND rt.state IN ('accepted', 'client_accepted')
    );

  GET DIAGNOSTICS v_count = ROW_COUNT;

  -- Expire direct requests older than 7 days with no response
  UPDATE quote_requests qr
  SET status = 'expired',
      updated_at = NOW()
  WHERE qr.status = 'open'
    AND qr.is_direct = true
    AND qr.created_at < NOW() - (v_direct_expiry_days || ' days')::INTERVAL
    AND NOT EXISTS (
      SELECT 1 FROM request_targets rt
      WHERE rt.request_id = qr.id
        AND rt.state IN ('accepted', 'client_accepted')
    );

  -- Also expire the corresponding request_targets
  UPDATE request_targets rt
  SET state = 'expired',
      updated_at = NOW()
  WHERE rt.state = 'invited'
    AND EXISTS (
      SELECT 1 FROM quote_requests qr
      WHERE qr.id = rt.request_id
        AND qr.status = 'expired'
    );

  RAISE NOTICE 'Expired % requests', v_count;
  RETURN v_count;
END;
$$;

-- ============================================================================
-- 3. COMBINED EXPIRY FUNCTION (for single cron call)
-- ============================================================================

CREATE OR REPLACE FUNCTION fn_run_expiry_checks()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_quotes_expired INTEGER;
  v_requests_expired INTEGER;
BEGIN
  v_quotes_expired := fn_expire_overdue_quotes();
  v_requests_expired := fn_expire_overdue_requests();

  RETURN jsonb_build_object(
    'quotes_expired', v_quotes_expired,
    'requests_expired', v_requests_expired,
    'run_at', NOW()
  );
END;
$$;

-- ============================================================================
-- 4. TRIGGER TO SET valid_until AUTOMATICALLY WHEN QUOTE IS SENT
-- Backup in case frontend doesn't set it
-- ============================================================================

CREATE OR REPLACE FUNCTION fn_set_quote_valid_until()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- If status is being set to 'sent' and valid_until is not set
  IF NEW.status = 'sent' AND NEW.valid_until IS NULL THEN
    NEW.valid_until := NOW() + INTERVAL '7 days';
  END IF;

  -- If status is being set to 'sent' and issued_at is not set
  IF NEW.status = 'sent' AND NEW.issued_at IS NULL THEN
    NEW.issued_at := NOW();
  END IF;

  RETURN NEW;
END;
$$;

-- Drop existing trigger if any
DROP TRIGGER IF EXISTS trg_set_quote_valid_until ON tradify_native_app_db;

-- Create trigger for INSERT
CREATE TRIGGER trg_set_quote_valid_until
  BEFORE INSERT ON tradify_native_app_db
  FOR EACH ROW
  EXECUTE FUNCTION fn_set_quote_valid_until();

-- Create trigger for UPDATE (when status changes to sent)
DROP TRIGGER IF EXISTS trg_set_quote_valid_until_update ON tradify_native_app_db;

CREATE TRIGGER trg_set_quote_valid_until_update
  BEFORE UPDATE ON tradify_native_app_db
  FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM NEW.status AND NEW.status = 'sent')
  EXECUTE FUNCTION fn_set_quote_valid_until();

-- ============================================================================
-- 5. RPC TO MANUALLY RUN EXPIRY (for Edge Function scheduler)
-- ============================================================================

CREATE OR REPLACE FUNCTION rpc_run_expiry_checks()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN fn_run_expiry_checks();
END;
$$;

-- Grant execute to service_role only (Edge Function will call this)
-- GRANT EXECUTE ON FUNCTION rpc_run_expiry_checks() TO service_role;

-- ============================================================================
-- 6. QUOTE EXPIRY REMINDER FUNCTION
-- Returns quotes expiring within N days (for notification scheduling)
-- ============================================================================

CREATE OR REPLACE FUNCTION rpc_get_expiring_quotes(p_days_until_expiry INTEGER DEFAULT 2)
RETURNS TABLE (
  quote_id UUID,
  client_id UUID,
  trade_id UUID,
  project_title TEXT,
  grand_total NUMERIC,
  valid_until TIMESTAMPTZ,
  days_remaining INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    q.id AS quote_id,
    q.client_id,
    q.trade_id,
    q.project_title,
    q.grand_total,
    q.valid_until,
    EXTRACT(DAY FROM (q.valid_until - NOW()))::INTEGER AS days_remaining
  FROM tradify_native_app_db q
  WHERE q.status = 'sent'
    AND q.valid_until IS NOT NULL
    AND q.valid_until > NOW()
    AND q.valid_until <= NOW() + (p_days_until_expiry || ' days')::INTERVAL
  ORDER BY q.valid_until ASC;
END;
$$;
