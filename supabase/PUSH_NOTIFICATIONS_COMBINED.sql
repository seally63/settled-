-- ============================================================================
-- PUSH NOTIFICATIONS - COMBINED MIGRATION
-- Run this in Supabase SQL Editor (Dashboard > SQL Editor > New query)
-- ============================================================================

-- ============================================================================
-- PART 1: PUSH NOTIFICATIONS INFRASTRUCTURE
-- ============================================================================

-- Add push_token column for Expo push notification tokens
ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS push_token TEXT;

-- Add notification_settings JSONB column for user preferences
ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS notification_settings JSONB DEFAULT '{
  "push_enabled": true,
  "email_enabled": true,
  "sms_enabled": false,
  "new_messages": true,
  "quote_updates": true,
  "job_reminders": true,
  "marketing": false
}'::jsonb;

-- Index for finding users with push tokens
CREATE INDEX IF NOT EXISTS idx_profiles_push_token ON profiles(push_token) WHERE push_token IS NOT NULL;

-- Notification Log Table
CREATE TABLE IF NOT EXISTS notification_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  notification_type TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT,
  data JSONB DEFAULT '{}',
  push_token TEXT,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'delivered', 'failed', 'read')),
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  sent_at TIMESTAMPTZ,
  read_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_notification_log_recipient ON notification_log(recipient_id);
CREATE INDEX IF NOT EXISTS idx_notification_log_type ON notification_log(notification_type);
CREATE INDEX IF NOT EXISTS idx_notification_log_created ON notification_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notification_log_status ON notification_log(status);

-- RLS for notification_log
ALTER TABLE notification_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own notifications" ON notification_log;
CREATE POLICY "Users can view own notifications"
  ON notification_log FOR SELECT
  TO authenticated
  USING (recipient_id = auth.uid());

DROP POLICY IF EXISTS "Service role can manage notifications" ON notification_log;
CREATE POLICY "Service role can manage notifications"
  ON notification_log FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Function to register push token
CREATE OR REPLACE FUNCTION rpc_register_push_token(p_token TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE profiles
  SET push_token = p_token,
      updated_at = NOW()
  WHERE id = auth.uid();
  RETURN FOUND;
END;
$$;

-- Function to unregister push token
CREATE OR REPLACE FUNCTION rpc_unregister_push_token()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE profiles
  SET push_token = NULL,
      updated_at = NOW()
  WHERE id = auth.uid();
  RETURN FOUND;
END;
$$;

-- Function to queue a notification
CREATE OR REPLACE FUNCTION fn_queue_notification(
  p_recipient_id UUID,
  p_notification_type TEXT,
  p_title TEXT,
  p_body TEXT,
  p_data JSONB DEFAULT '{}'
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_push_token TEXT;
  v_settings JSONB;
  v_notification_id UUID;
  v_should_send BOOLEAN := true;
BEGIN
  SELECT push_token, notification_settings
  INTO v_push_token, v_settings
  FROM profiles
  WHERE id = p_recipient_id;

  IF v_settings IS NULL OR (v_settings->>'push_enabled')::boolean IS NOT TRUE THEN
    v_should_send := false;
  END IF;

  IF v_should_send THEN
    CASE
      WHEN p_notification_type IN ('new_message') THEN
        v_should_send := COALESCE((v_settings->>'new_messages')::boolean, true);
      WHEN p_notification_type IN ('quote_sent', 'quote_accepted', 'quote_declined', 'quote_expiring', 'quote_expired', 'new_request', 'direct_request', 'request_accepted', 'request_declined') THEN
        v_should_send := COALESCE((v_settings->>'quote_updates')::boolean, true);
      WHEN p_notification_type IN ('appointment_scheduled', 'appointment_reminder', 'work_completed') THEN
        v_should_send := COALESCE((v_settings->>'job_reminders')::boolean, true);
      ELSE
        v_should_send := true;
    END CASE;
  END IF;

  IF v_push_token IS NOT NULL AND v_should_send THEN
    INSERT INTO notification_log (recipient_id, notification_type, title, body, data, push_token, status)
    VALUES (p_recipient_id, p_notification_type, p_title, p_body, p_data, v_push_token, 'pending')
    RETURNING id INTO v_notification_id;
    RETURN v_notification_id;
  END IF;

  RETURN NULL;
END;
$$;

-- Function to get pending notifications
CREATE OR REPLACE FUNCTION rpc_get_pending_notifications(p_limit INT DEFAULT 100)
RETURNS TABLE (id UUID, push_token TEXT, title TEXT, body TEXT, data JSONB, notification_type TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT nl.id, nl.push_token, nl.title, nl.body, nl.data, nl.notification_type
  FROM notification_log nl
  WHERE nl.status = 'pending' AND nl.push_token IS NOT NULL
  ORDER BY nl.created_at ASC
  LIMIT p_limit;
END;
$$;

-- Function to mark notifications as sent
CREATE OR REPLACE FUNCTION rpc_mark_notifications_sent(p_ids UUID[], p_status TEXT DEFAULT 'sent', p_error TEXT DEFAULT NULL)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INT;
BEGIN
  UPDATE notification_log
  SET status = p_status, sent_at = NOW(), error_message = p_error
  WHERE id = ANY(p_ids);
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION rpc_register_push_token(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION rpc_unregister_push_token() TO authenticated;

-- ============================================================================
-- PART 2: QUOTE AUTO-EXPIRY (7 days)
-- ============================================================================

-- Function to auto-expire quotes
CREATE OR REPLACE FUNCTION fn_expire_overdue_quotes()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  UPDATE tradify_native_app_db
  SET status = 'expired', updated_at = NOW()
  WHERE status = 'sent'
    AND valid_until IS NOT NULL
    AND valid_until < NOW();
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

-- Function to auto-expire requests
CREATE OR REPLACE FUNCTION fn_expire_overdue_requests()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  UPDATE quote_requests qr
  SET status = 'expired', updated_at = NOW()
  WHERE qr.status = 'open'
    AND qr.is_direct = false
    AND qr.created_at < NOW() - INTERVAL '14 days'
    AND NOT EXISTS (
      SELECT 1 FROM request_targets rt
      WHERE rt.request_id = qr.id AND rt.state IN ('accepted', 'client_accepted')
    );
  GET DIAGNOSTICS v_count = ROW_COUNT;

  UPDATE quote_requests qr
  SET status = 'expired', updated_at = NOW()
  WHERE qr.status = 'open'
    AND qr.is_direct = true
    AND qr.created_at < NOW() - INTERVAL '7 days'
    AND NOT EXISTS (
      SELECT 1 FROM request_targets rt
      WHERE rt.request_id = qr.id AND rt.state IN ('accepted', 'client_accepted')
    );

  UPDATE request_targets rt
  SET state = 'expired', updated_at = NOW()
  WHERE rt.state = 'invited'
    AND EXISTS (
      SELECT 1 FROM quote_requests qr
      WHERE qr.id = rt.request_id AND qr.status = 'expired'
    );

  RETURN v_count;
END;
$$;

-- Combined expiry function
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
  RETURN jsonb_build_object('quotes_expired', v_quotes_expired, 'requests_expired', v_requests_expired, 'run_at', NOW());
END;
$$;

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

-- Trigger to set valid_until when quote is sent
CREATE OR REPLACE FUNCTION fn_set_quote_valid_until()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.status = 'sent' AND NEW.valid_until IS NULL THEN
    NEW.valid_until := NOW() + INTERVAL '7 days';
  END IF;
  IF NEW.status = 'sent' AND NEW.issued_at IS NULL THEN
    NEW.issued_at := NOW();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_quote_valid_until ON tradify_native_app_db;
CREATE TRIGGER trg_set_quote_valid_until
  BEFORE INSERT ON tradify_native_app_db
  FOR EACH ROW
  EXECUTE FUNCTION fn_set_quote_valid_until();

DROP TRIGGER IF EXISTS trg_set_quote_valid_until_update ON tradify_native_app_db;
CREATE TRIGGER trg_set_quote_valid_until_update
  BEFORE UPDATE ON tradify_native_app_db
  FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM NEW.status AND NEW.status = 'sent')
  EXECUTE FUNCTION fn_set_quote_valid_until();

-- Get expiring quotes function
CREATE OR REPLACE FUNCTION rpc_get_expiring_quotes(p_days_until_expiry INTEGER DEFAULT 2)
RETURNS TABLE (quote_id UUID, client_id UUID, trade_id UUID, project_title TEXT, grand_total NUMERIC, valid_until TIMESTAMPTZ, days_remaining INTEGER)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT q.id, q.client_id, q.trade_id, q.project_title, q.grand_total, q.valid_until,
         EXTRACT(DAY FROM (q.valid_until - NOW()))::INTEGER
  FROM tradify_native_app_db q
  WHERE q.status = 'sent' AND q.valid_until IS NOT NULL
    AND q.valid_until > NOW()
    AND q.valid_until <= NOW() + (p_days_until_expiry || ' days')::INTERVAL
  ORDER BY q.valid_until ASC;
END;
$$;

-- ============================================================================
-- PART 3: NOTIFICATION TRIGGERS
-- ============================================================================

-- Helper function to get display name
CREATE OR REPLACE FUNCTION fn_get_display_name(p_user_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_name TEXT;
BEGIN
  SELECT COALESCE(business_name, full_name, 'Someone')
  INTO v_name
  FROM profiles
  WHERE id = p_user_id;
  RETURN COALESCE(v_name, 'Someone');
END;
$$;

-- TRIGGER: New Request Target (Trade notified of new request)
CREATE OR REPLACE FUNCTION fn_notify_new_request()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_request RECORD;
  v_client_name TEXT;
  v_title TEXT;
  v_body TEXT;
  v_notification_type TEXT;
BEGIN
  IF NEW.state != 'invited' THEN RETURN NEW; END IF;

  SELECT qr.id, qr.requester_id, qr.suggested_title, qr.budget_band, qr.postcode, qr.is_direct
  INTO v_request
  FROM quote_requests qr WHERE qr.id = NEW.request_id;

  IF NOT FOUND THEN RETURN NEW; END IF;

  v_client_name := fn_get_display_name(v_request.requester_id);

  IF NEW.invited_by = 'client' OR v_request.is_direct THEN
    v_notification_type := 'direct_request';
    v_title := 'New Direct Request';
    v_body := format('%s sent you a direct request: %s', v_client_name, COALESCE(v_request.suggested_title, 'New project'));
  ELSE
    v_notification_type := 'new_request';
    v_title := 'New Request Available';
    v_body := format('New request in %s: %s', COALESCE(v_request.postcode, 'your area'), COALESCE(v_request.suggested_title, 'New project'));
  END IF;

  PERFORM fn_queue_notification(NEW.trade_id, v_notification_type, v_title, v_body,
    jsonb_build_object('request_id', NEW.request_id, 'client_name', v_client_name, 'budget_band', v_request.budget_band, 'postcode', v_request.postcode, 'is_direct', v_request.is_direct));

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_new_request ON request_targets;
CREATE TRIGGER trg_notify_new_request
  AFTER INSERT ON request_targets
  FOR EACH ROW
  EXECUTE FUNCTION fn_notify_new_request();

-- TRIGGER: Request Target State Change (Client notified when trade responds)
CREATE OR REPLACE FUNCTION fn_notify_request_state_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_request RECORD;
  v_trade_name TEXT;
  v_title TEXT;
  v_body TEXT;
  v_notification_type TEXT;
BEGIN
  IF OLD.state = NEW.state THEN RETURN NEW; END IF;

  SELECT qr.id, qr.requester_id, qr.suggested_title
  INTO v_request
  FROM quote_requests qr WHERE qr.id = NEW.request_id;

  IF NOT FOUND THEN RETURN NEW; END IF;

  v_trade_name := fn_get_display_name(NEW.trade_id);

  CASE NEW.state
    WHEN 'accepted' THEN
      v_notification_type := 'request_accepted';
      v_title := 'Request Accepted';
      v_body := format('%s accepted your request: %s', v_trade_name, COALESCE(v_request.suggested_title, 'Your project'));
    WHEN 'declined' THEN
      v_notification_type := 'request_declined';
      v_title := 'Request Declined';
      v_body := format('%s is unavailable for: %s', v_trade_name, COALESCE(v_request.suggested_title, 'Your project'));
    WHEN 'expired' THEN
      v_notification_type := 'request_expired';
      v_title := 'Request Expired';
      v_body := format('Your request "%s" has expired with no responses', COALESCE(v_request.suggested_title, 'Your project'));
    ELSE
      RETURN NEW;
  END CASE;

  PERFORM fn_queue_notification(v_request.requester_id, v_notification_type, v_title, v_body,
    jsonb_build_object('request_id', NEW.request_id, 'trade_id', NEW.trade_id, 'trade_name', v_trade_name, 'state', NEW.state));

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_request_state_change ON request_targets;
CREATE TRIGGER trg_notify_request_state_change
  AFTER UPDATE ON request_targets
  FOR EACH ROW
  EXECUTE FUNCTION fn_notify_request_state_change();

-- TRIGGER: Quote Status Change
CREATE OR REPLACE FUNCTION fn_notify_quote_status_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_trade_name TEXT;
  v_client_name TEXT;
  v_client_id UUID;
  v_title TEXT;
  v_body TEXT;
  v_notification_type TEXT;
  v_recipient_id UUID;
  v_amount TEXT;
BEGIN
  IF NEW.client_id IS NOT NULL THEN
    v_client_id := NEW.client_id;
  ELSIF NEW.request_id IS NOT NULL THEN
    SELECT requester_id INTO v_client_id FROM quote_requests WHERE id = NEW.request_id;
  END IF;

  IF v_client_id IS NULL THEN RETURN NEW; END IF;

  v_trade_name := fn_get_display_name(NEW.trade_id);
  v_client_name := fn_get_display_name(v_client_id);

  IF NEW.grand_total IS NOT NULL THEN
    v_amount := format('£%s', ROUND(NEW.grand_total::NUMERIC, 2));
  ELSE
    v_amount := 'Quote';
  END IF;

  IF TG_OP = 'INSERT' AND NEW.status = 'sent' THEN
    v_notification_type := 'quote_sent';
    v_title := 'New Quote Received';
    v_body := format('%s sent you a quote: %s', v_trade_name, v_amount);
    v_recipient_id := v_client_id;
  ELSIF TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM NEW.status THEN
    CASE NEW.status
      WHEN 'sent' THEN
        v_notification_type := 'quote_sent';
        v_title := 'New Quote Received';
        v_body := format('%s sent you a quote: %s', v_trade_name, v_amount);
        v_recipient_id := v_client_id;
      WHEN 'accepted' THEN
        v_notification_type := 'quote_accepted';
        v_title := 'Quote Accepted!';
        v_body := format('%s accepted your quote for %s', v_client_name, v_amount);
        v_recipient_id := NEW.trade_id;
      WHEN 'declined' THEN
        v_notification_type := 'quote_declined';
        v_title := 'Quote Declined';
        v_body := format('%s declined your quote for %s', v_client_name, COALESCE(NEW.project_title, 'the project'));
        v_recipient_id := NEW.trade_id;
      WHEN 'expired' THEN
        v_notification_type := 'quote_expired';
        v_title := 'Quote Expired';
        v_body := format('The quote from %s has expired', v_trade_name);
        v_recipient_id := v_client_id;
      WHEN 'completed' THEN
        v_notification_type := 'work_completed';
        v_title := 'Work Completed';
        v_body := format('%s marked "%s" as complete. Leave a review!', v_trade_name, COALESCE(NEW.project_title, 'your project'));
        v_recipient_id := v_client_id;
      ELSE
        RETURN NEW;
    END CASE;
  ELSE
    RETURN NEW;
  END IF;

  IF v_recipient_id IS NOT NULL THEN
    PERFORM fn_queue_notification(v_recipient_id, v_notification_type, v_title, v_body,
      jsonb_build_object('quote_id', NEW.id, 'request_id', NEW.request_id, 'trade_id', NEW.trade_id, 'client_id', v_client_id, 'amount', NEW.grand_total, 'project_title', NEW.project_title));
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_quote_insert ON tradify_native_app_db;
CREATE TRIGGER trg_notify_quote_insert
  AFTER INSERT ON tradify_native_app_db
  FOR EACH ROW
  WHEN (NEW.status = 'sent')
  EXECUTE FUNCTION fn_notify_quote_status_change();

DROP TRIGGER IF EXISTS trg_notify_quote_update ON tradify_native_app_db;
CREATE TRIGGER trg_notify_quote_update
  AFTER UPDATE ON tradify_native_app_db
  FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION fn_notify_quote_status_change();

-- TRIGGER: New Message
CREATE OR REPLACE FUNCTION fn_notify_new_message()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sender_name TEXT;
  v_recipient_id UUID;
  v_preview TEXT;
BEGIN
  v_recipient_id := NEW.receiver_id;
  IF v_recipient_id IS NULL THEN RETURN NEW; END IF;

  v_sender_name := fn_get_display_name(NEW.sender_id);
  v_preview := LEFT(COALESCE(NEW.content, ''), 50);
  IF LENGTH(NEW.content) > 50 THEN
    v_preview := v_preview || '...';
  END IF;

  PERFORM fn_queue_notification(v_recipient_id, 'new_message', v_sender_name, v_preview,
    jsonb_build_object('conversation_id', NEW.conversation_id, 'message_id', NEW.id, 'sender_id', NEW.sender_id, 'sender_name', v_sender_name, 'request_id', NEW.request_id));

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_new_message ON messages;
CREATE TRIGGER trg_notify_new_message
  AFTER INSERT ON messages
  FOR EACH ROW
  EXECUTE FUNCTION fn_notify_new_message();

-- TRIGGER: Appointment Scheduled
CREATE OR REPLACE FUNCTION fn_notify_appointment()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_trade_name TEXT;
  v_client_id UUID;
  v_scheduled_date TEXT;
BEGIN
  IF NEW.request_id IS NOT NULL THEN
    SELECT requester_id INTO v_client_id FROM quote_requests WHERE id = NEW.request_id;
  ELSIF NEW.quote_id IS NOT NULL THEN
    SELECT client_id INTO v_client_id FROM tradify_native_app_db WHERE id = NEW.quote_id;
  END IF;

  IF v_client_id IS NULL THEN RETURN NEW; END IF;

  v_trade_name := fn_get_display_name(NEW.trade_id);
  v_scheduled_date := TO_CHAR(NEW.scheduled_at, 'Day, Mon DD at HH:MI AM');

  PERFORM fn_queue_notification(v_client_id, 'appointment_scheduled', 'Appointment Scheduled',
    format('%s scheduled an appointment for %s', v_trade_name, v_scheduled_date),
    jsonb_build_object('appointment_id', NEW.id, 'quote_id', NEW.quote_id, 'request_id', NEW.request_id, 'trade_id', NEW.trade_id, 'scheduled_at', NEW.scheduled_at));

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_appointment ON appointments;
CREATE TRIGGER trg_notify_appointment
  AFTER INSERT ON appointments
  FOR EACH ROW
  EXECUTE FUNCTION fn_notify_appointment();

-- TRIGGER: Review Received
CREATE OR REPLACE FUNCTION fn_notify_review()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_reviewer_name TEXT;
  v_rating_stars TEXT;
BEGIN
  v_reviewer_name := fn_get_display_name(NEW.reviewer_id);
  v_rating_stars := REPEAT('⭐', COALESCE(NEW.rating, 0)::INTEGER);

  PERFORM fn_queue_notification(NEW.reviewee_id, 'review_received',
    format('%s Review', v_rating_stars),
    format('%s left you a review', v_reviewer_name),
    jsonb_build_object('review_id', NEW.id, 'reviewer_id', NEW.reviewer_id, 'reviewer_name', v_reviewer_name, 'rating', NEW.rating, 'comment', LEFT(COALESCE(NEW.comment, ''), 100)));

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_review ON reviews;
CREATE TRIGGER trg_notify_review
  AFTER INSERT ON reviews
  FOR EACH ROW
  EXECUTE FUNCTION fn_notify_review();

-- Function: Response Time Nudges
CREATE OR REPLACE FUNCTION fn_send_response_time_nudges()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_trade RECORD;
  v_count INTEGER := 0;
BEGIN
  FOR v_trade IN
    SELECT rt.trade_id, COUNT(*) AS pending_count,
           EXTRACT(EPOCH FROM (NOW() - MIN(rt.created_at))) / 3600 AS oldest_hours
    FROM request_targets rt
    WHERE rt.state = 'invited' AND rt.created_at < NOW() - INTERVAL '24 hours'
    GROUP BY rt.trade_id
    HAVING COUNT(*) >= 1
  LOOP
    PERFORM fn_queue_notification(v_trade.trade_id, 'response_time_nudge', 'Requests Waiting',
      format('You have %s request%s waiting. Quick responses help you win more jobs!',
        v_trade.pending_count, CASE WHEN v_trade.pending_count = 1 THEN '' ELSE 's' END),
      jsonb_build_object('pending_count', v_trade.pending_count, 'oldest_hours', ROUND(v_trade.oldest_hours)));
    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END;
$$;

-- ============================================================================
-- DONE! All push notification infrastructure is now set up.
-- ============================================================================
