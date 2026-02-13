-- ============================================================================
-- Push Notifications Infrastructure
-- Adds push token storage, notification settings, and notification logging
-- ============================================================================

-- ============================================================================
-- 1. ADD PUSH TOKEN AND NOTIFICATION SETTINGS TO PROFILES
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

-- ============================================================================
-- 2. NOTIFICATION LOG TABLE
-- Track sent notifications for analytics and debugging
-- ============================================================================

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

-- ============================================================================
-- 3. NOTIFICATION TYPES ENUM (for reference)
-- ============================================================================
-- Supported notification types:
-- - new_request: New quote request available (trade)
-- - direct_request: Direct request from client (trade)
-- - request_accepted: Trade accepted request (client)
-- - request_declined: Trade declined request (client)
-- - request_expired: Request expired with no response (client)
-- - quote_sent: Quote sent to client (client)
-- - quote_accepted: Client accepted quote (trade)
-- - quote_declined: Client declined quote (trade)
-- - quote_expiring: Quote expiring soon (client)
-- - quote_expired: Quote expired (client)
-- - new_message: New message received (both)
-- - appointment_scheduled: Appointment scheduled (client)
-- - appointment_reminder: Appointment reminder (both)
-- - work_completed: Work marked complete (client)
-- - review_received: Review received (trade)
-- - response_time_nudge: Response time reminder (trade)

-- ============================================================================
-- 4. FUNCTION TO REGISTER PUSH TOKEN
-- ============================================================================

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

-- ============================================================================
-- 5. FUNCTION TO UNREGISTER PUSH TOKEN (logout/disable)
-- ============================================================================

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

-- ============================================================================
-- 6. FUNCTION TO QUEUE A NOTIFICATION
-- This function is called by triggers to queue notifications for sending
-- ============================================================================

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
  -- Get recipient's push token and notification settings
  SELECT push_token, notification_settings
  INTO v_push_token, v_settings
  FROM profiles
  WHERE id = p_recipient_id;

  -- Check if push notifications are enabled
  IF v_settings IS NULL OR (v_settings->>'push_enabled')::boolean IS NOT TRUE THEN
    v_should_send := false;
  END IF;

  -- Check notification type preferences
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

  -- Only queue if user has a push token and notifications are enabled
  IF v_push_token IS NOT NULL AND v_should_send THEN
    INSERT INTO notification_log (
      recipient_id,
      notification_type,
      title,
      body,
      data,
      push_token,
      status
    ) VALUES (
      p_recipient_id,
      p_notification_type,
      p_title,
      p_body,
      p_data,
      v_push_token,
      'pending'
    )
    RETURNING id INTO v_notification_id;

    RETURN v_notification_id;
  END IF;

  RETURN NULL;
END;
$$;

-- ============================================================================
-- 7. FUNCTION TO GET PENDING NOTIFICATIONS (for Edge Function to process)
-- ============================================================================

CREATE OR REPLACE FUNCTION rpc_get_pending_notifications(p_limit INT DEFAULT 100)
RETURNS TABLE (
  id UUID,
  push_token TEXT,
  title TEXT,
  body TEXT,
  data JSONB,
  notification_type TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    nl.id,
    nl.push_token,
    nl.title,
    nl.body,
    nl.data,
    nl.notification_type
  FROM notification_log nl
  WHERE nl.status = 'pending'
    AND nl.push_token IS NOT NULL
  ORDER BY nl.created_at ASC
  LIMIT p_limit;
END;
$$;

-- ============================================================================
-- 8. FUNCTION TO MARK NOTIFICATIONS AS SENT
-- ============================================================================

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
  SET status = p_status,
      sent_at = NOW(),
      error_message = p_error
  WHERE id = ANY(p_ids);

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

-- ============================================================================
-- 9. GRANT PERMISSIONS
-- ============================================================================

GRANT EXECUTE ON FUNCTION rpc_register_push_token(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION rpc_unregister_push_token() TO authenticated;
-- Note: rpc_get_pending_notifications and rpc_mark_notifications_sent
-- should only be called by service role (Edge Function)

-- ============================================================================
-- 10. RLS POLICIES FOR NOTIFICATION LOG
-- ============================================================================

ALTER TABLE notification_log ENABLE ROW LEVEL SECURITY;

-- Users can only see their own notifications
CREATE POLICY "Users can view own notifications"
  ON notification_log FOR SELECT
  TO authenticated
  USING (recipient_id = auth.uid());

-- Only service role can insert/update (via triggers and Edge Functions)
CREATE POLICY "Service role can manage notifications"
  ON notification_log FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
