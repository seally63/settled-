-- Migration: Request Limits System
-- Date: 2026-01-24
-- Description: Adds configurable request limits per client with test account exemptions

-- ============================================================================
-- 1. ADD COLUMNS FOR REQUEST LIMITS TO PROFILES
-- ============================================================================

-- Add columns to store custom request limits (NULL means use default)
ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS max_open_requests INTEGER DEFAULT NULL,
ADD COLUMN IF NOT EXISTS max_direct_requests INTEGER DEFAULT NULL,
ADD COLUMN IF NOT EXISTS is_test_account BOOLEAN DEFAULT FALSE;

COMMENT ON COLUMN profiles.max_open_requests IS
  'Custom limit for open requests (NULL = use default of 3)';
COMMENT ON COLUMN profiles.max_direct_requests IS
  'Custom limit for direct requests (NULL = use default of 5)';
COMMENT ON COLUMN profiles.is_test_account IS
  'Test accounts have unlimited requests';

-- Mark demo client as test account with unlimited requests
UPDATE profiles
SET is_test_account = TRUE
WHERE id = 'f58b331c-c523-4ec3-aa1c-1e0d1300cb56';

-- ============================================================================
-- 2. CREATE FUNCTION TO CHECK REQUEST LIMITS
-- ============================================================================

CREATE OR REPLACE FUNCTION check_client_request_limits()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_client_id UUID;
  v_is_test_account BOOLEAN;
  v_max_open INTEGER;
  v_max_direct INTEGER;
  v_current_open INTEGER;
  v_current_direct INTEGER;
  v_is_direct BOOLEAN;
BEGIN
  v_client_id := NEW.requester_id;
  v_is_direct := COALESCE(NEW.is_direct, FALSE);

  -- Get client's profile settings
  SELECT
    COALESCE(is_test_account, FALSE),
    COALESCE(max_open_requests, 3),  -- Default 3 open requests
    COALESCE(max_direct_requests, 5) -- Default 5 direct requests
  INTO v_is_test_account, v_max_open, v_max_direct
  FROM profiles
  WHERE id = v_client_id;

  -- Test accounts have unlimited requests
  IF v_is_test_account THEN
    RETURN NEW;
  END IF;

  IF v_is_direct THEN
    -- Count current direct requests (is_direct = true, not closed)
    SELECT COUNT(*) INTO v_current_direct
    FROM quote_requests
    WHERE requester_id = v_client_id
      AND is_direct = TRUE
      AND status NOT IN ('completed', 'cancelled', 'expired', 'closed');

    IF v_current_direct >= v_max_direct THEN
      RAISE EXCEPTION 'LIMIT_REACHED:DIRECT:You have reached your limit of % direct requests. Wait for a trade to respond or close an existing request.', v_max_direct;
    END IF;
  ELSE
    -- Count current open requests (is_direct = false, not closed)
    SELECT COUNT(*) INTO v_current_open
    FROM quote_requests
    WHERE requester_id = v_client_id
      AND (is_direct = FALSE OR is_direct IS NULL)
      AND status NOT IN ('completed', 'cancelled', 'expired', 'closed');

    IF v_current_open >= v_max_open THEN
      RAISE EXCEPTION 'LIMIT_REACHED:OPEN:You have reached your limit of % open requests. Wait for quotes to come in or close an existing request.', v_max_open;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- Drop existing trigger if exists
DROP TRIGGER IF EXISTS trg_check_request_limits ON quote_requests;

-- Create trigger to check limits before insert
CREATE TRIGGER trg_check_request_limits
BEFORE INSERT ON quote_requests
FOR EACH ROW
EXECUTE FUNCTION check_client_request_limits();

-- ============================================================================
-- 3. CREATE RPC TO GET CLIENT REQUEST USAGE
-- ============================================================================

CREATE OR REPLACE FUNCTION rpc_get_client_request_usage()
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_client_id UUID;
  v_is_test_account BOOLEAN;
  v_max_open INTEGER;
  v_max_direct INTEGER;
  v_current_open INTEGER;
  v_current_direct INTEGER;
BEGIN
  v_client_id := auth.uid();

  IF v_client_id IS NULL THEN
    RETURN NULL;
  END IF;

  -- Get client's profile settings
  SELECT
    COALESCE(is_test_account, FALSE),
    COALESCE(max_open_requests, 3),
    COALESCE(max_direct_requests, 5)
  INTO v_is_test_account, v_max_open, v_max_direct
  FROM profiles
  WHERE id = v_client_id;

  -- Count current open requests
  SELECT COUNT(*) INTO v_current_open
  FROM quote_requests
  WHERE requester_id = v_client_id
    AND (is_direct = FALSE OR is_direct IS NULL)
    AND status NOT IN ('completed', 'cancelled', 'expired', 'closed');

  -- Count current direct requests
  SELECT COUNT(*) INTO v_current_direct
  FROM quote_requests
  WHERE requester_id = v_client_id
    AND is_direct = TRUE
    AND status NOT IN ('completed', 'cancelled', 'expired', 'closed');

  RETURN json_build_object(
    'is_test_account', v_is_test_account,
    'open_requests', json_build_object(
      'current', v_current_open,
      'max', CASE WHEN v_is_test_account THEN NULL ELSE v_max_open END,
      'unlimited', v_is_test_account
    ),
    'direct_requests', json_build_object(
      'current', v_current_direct,
      'max', CASE WHEN v_is_test_account THEN NULL ELSE v_max_direct END,
      'unlimited', v_is_test_account
    )
  );
END;
$$;

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION rpc_get_client_request_usage() TO authenticated;

COMMENT ON FUNCTION rpc_get_client_request_usage IS
  'Returns client request usage: current counts and limits for open and direct requests';
