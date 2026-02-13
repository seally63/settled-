-- ============================================================================
-- Notification Triggers
-- Automatically queue notifications when key events occur
-- ============================================================================

-- ============================================================================
-- 1. HELPER FUNCTION: Get user's name for notifications
-- ============================================================================

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

-- ============================================================================
-- 2. TRIGGER: New Request Target (Trade gets notified of new request)
-- ============================================================================

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
  -- Only notify on new invitations
  IF NEW.state != 'invited' THEN
    RETURN NEW;
  END IF;

  -- Get request details
  SELECT
    qr.id,
    qr.requester_id,
    qr.suggested_title,
    qr.budget_band,
    qr.postcode,
    qr.is_direct
  INTO v_request
  FROM quote_requests qr
  WHERE qr.id = NEW.request_id;

  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  -- Get client name
  v_client_name := fn_get_display_name(v_request.requester_id);

  -- Determine notification type based on how they were invited
  IF NEW.invited_by = 'client' OR v_request.is_direct THEN
    v_notification_type := 'direct_request';
    v_title := 'New Direct Request';
    v_body := format('%s sent you a direct request: %s',
      v_client_name,
      COALESCE(v_request.suggested_title, 'New project')
    );
  ELSE
    v_notification_type := 'new_request';
    v_title := 'New Request Available';
    v_body := format('New request in %s: %s',
      COALESCE(v_request.postcode, 'your area'),
      COALESCE(v_request.suggested_title, 'New project')
    );
  END IF;

  -- Queue notification for the trade
  PERFORM fn_queue_notification(
    NEW.trade_id,
    v_notification_type,
    v_title,
    v_body,
    jsonb_build_object(
      'request_id', NEW.request_id,
      'client_name', v_client_name,
      'budget_band', v_request.budget_band,
      'postcode', v_request.postcode,
      'is_direct', v_request.is_direct
    )
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_new_request ON request_targets;
CREATE TRIGGER trg_notify_new_request
  AFTER INSERT ON request_targets
  FOR EACH ROW
  EXECUTE FUNCTION fn_notify_new_request();

-- ============================================================================
-- 3. TRIGGER: Request Target State Change (Client notified when trade responds)
-- ============================================================================

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
  -- Only trigger on state changes
  IF OLD.state = NEW.state THEN
    RETURN NEW;
  END IF;

  -- Get request details
  SELECT
    qr.id,
    qr.requester_id,
    qr.suggested_title
  INTO v_request
  FROM quote_requests qr
  WHERE qr.id = NEW.request_id;

  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  -- Get trade name
  v_trade_name := fn_get_display_name(NEW.trade_id);

  -- Determine notification based on new state
  CASE NEW.state
    WHEN 'accepted' THEN
      v_notification_type := 'request_accepted';
      v_title := 'Request Accepted';
      v_body := format('%s accepted your request: %s',
        v_trade_name,
        COALESCE(v_request.suggested_title, 'Your project')
      );

    WHEN 'declined' THEN
      v_notification_type := 'request_declined';
      v_title := 'Request Declined';
      v_body := format('%s is unavailable for: %s',
        v_trade_name,
        COALESCE(v_request.suggested_title, 'Your project')
      );

    WHEN 'expired' THEN
      v_notification_type := 'request_expired';
      v_title := 'Request Expired';
      v_body := format('Your request "%s" has expired with no responses',
        COALESCE(v_request.suggested_title, 'Your project')
      );

    ELSE
      -- No notification for other state changes
      RETURN NEW;
  END CASE;

  -- Queue notification for the client
  PERFORM fn_queue_notification(
    v_request.requester_id,
    v_notification_type,
    v_title,
    v_body,
    jsonb_build_object(
      'request_id', NEW.request_id,
      'trade_id', NEW.trade_id,
      'trade_name', v_trade_name,
      'state', NEW.state
    )
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_request_state_change ON request_targets;
CREATE TRIGGER trg_notify_request_state_change
  AFTER UPDATE ON request_targets
  FOR EACH ROW
  EXECUTE FUNCTION fn_notify_request_state_change();

-- ============================================================================
-- 4. TRIGGER: Quote Sent/Accepted/Declined
-- ============================================================================

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
  -- Determine client_id from the quote or request
  IF NEW.client_id IS NOT NULL THEN
    v_client_id := NEW.client_id;
  ELSIF NEW.request_id IS NOT NULL THEN
    SELECT requester_id INTO v_client_id
    FROM quote_requests WHERE id = NEW.request_id;
  END IF;

  -- Skip if no client found
  IF v_client_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Get names
  v_trade_name := fn_get_display_name(NEW.trade_id);
  v_client_name := fn_get_display_name(v_client_id);

  -- Format amount if available
  IF NEW.grand_total IS NOT NULL THEN
    v_amount := format('£%s', ROUND(NEW.grand_total::NUMERIC, 2));
  ELSE
    v_amount := 'Quote';
  END IF;

  -- Handle INSERT (new quote sent)
  IF TG_OP = 'INSERT' AND NEW.status = 'sent' THEN
    v_notification_type := 'quote_sent';
    v_title := 'New Quote Received';
    v_body := format('%s sent you a quote: %s',
      v_trade_name,
      v_amount
    );
    v_recipient_id := v_client_id;

  -- Handle UPDATE (status change)
  ELSIF TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM NEW.status THEN
    CASE NEW.status
      WHEN 'sent' THEN
        -- Draft sent as quote
        v_notification_type := 'quote_sent';
        v_title := 'New Quote Received';
        v_body := format('%s sent you a quote: %s',
          v_trade_name,
          v_amount
        );
        v_recipient_id := v_client_id;

      WHEN 'accepted' THEN
        -- Client accepted the quote - notify trade
        v_notification_type := 'quote_accepted';
        v_title := 'Quote Accepted!';
        v_body := format('%s accepted your quote for %s',
          v_client_name,
          v_amount
        );
        v_recipient_id := NEW.trade_id;

      WHEN 'declined' THEN
        -- Client declined the quote - notify trade
        v_notification_type := 'quote_declined';
        v_title := 'Quote Declined';
        v_body := format('%s declined your quote for %s',
          v_client_name,
          COALESCE(NEW.project_title, 'the project')
        );
        v_recipient_id := NEW.trade_id;

      WHEN 'expired' THEN
        -- Quote expired - notify client
        v_notification_type := 'quote_expired';
        v_title := 'Quote Expired';
        v_body := format('The quote from %s has expired',
          v_trade_name
        );
        v_recipient_id := v_client_id;

      WHEN 'completed' THEN
        -- Work completed - notify client
        v_notification_type := 'work_completed';
        v_title := 'Work Completed';
        v_body := format('%s marked "%s" as complete. Leave a review!',
          v_trade_name,
          COALESCE(NEW.project_title, 'your project')
        );
        v_recipient_id := v_client_id;

      ELSE
        -- No notification for other status changes
        RETURN NEW;
    END CASE;
  ELSE
    RETURN NEW;
  END IF;

  -- Queue the notification
  IF v_recipient_id IS NOT NULL THEN
    PERFORM fn_queue_notification(
      v_recipient_id,
      v_notification_type,
      v_title,
      v_body,
      jsonb_build_object(
        'quote_id', NEW.id,
        'request_id', NEW.request_id,
        'trade_id', NEW.trade_id,
        'client_id', v_client_id,
        'amount', NEW.grand_total,
        'project_title', NEW.project_title
      )
    );
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

-- ============================================================================
-- 5. TRIGGER: New Message
-- ============================================================================

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
  -- The receiver is the notification recipient
  v_recipient_id := NEW.receiver_id;

  -- Skip if no recipient
  IF v_recipient_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Get sender name
  v_sender_name := fn_get_display_name(NEW.sender_id);

  -- Create message preview (first 50 chars)
  v_preview := LEFT(COALESCE(NEW.content, ''), 50);
  IF LENGTH(NEW.content) > 50 THEN
    v_preview := v_preview || '...';
  END IF;

  -- Queue notification
  PERFORM fn_queue_notification(
    v_recipient_id,
    'new_message',
    v_sender_name,
    v_preview,
    jsonb_build_object(
      'conversation_id', NEW.conversation_id,
      'message_id', NEW.id,
      'sender_id', NEW.sender_id,
      'sender_name', v_sender_name,
      'request_id', NEW.request_id
    )
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_new_message ON messages;
CREATE TRIGGER trg_notify_new_message
  AFTER INSERT ON messages
  FOR EACH ROW
  EXECUTE FUNCTION fn_notify_new_message();

-- ============================================================================
-- 6. TRIGGER: Appointment Scheduled
-- ============================================================================

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
  -- Get client from the related request or quote
  IF NEW.request_id IS NOT NULL THEN
    SELECT requester_id INTO v_client_id
    FROM quote_requests WHERE id = NEW.request_id;
  ELSIF NEW.quote_id IS NOT NULL THEN
    SELECT client_id INTO v_client_id
    FROM tradify_native_app_db WHERE id = NEW.quote_id;
  END IF;

  -- Skip if no client
  IF v_client_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Get trade name
  v_trade_name := fn_get_display_name(NEW.trade_id);

  -- Format the scheduled date
  v_scheduled_date := TO_CHAR(NEW.scheduled_at, 'Day, Mon DD at HH:MI AM');

  -- Queue notification for client
  PERFORM fn_queue_notification(
    v_client_id,
    'appointment_scheduled',
    'Appointment Scheduled',
    format('%s scheduled an appointment for %s', v_trade_name, v_scheduled_date),
    jsonb_build_object(
      'appointment_id', NEW.id,
      'quote_id', NEW.quote_id,
      'request_id', NEW.request_id,
      'trade_id', NEW.trade_id,
      'scheduled_at', NEW.scheduled_at
    )
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_appointment ON appointments;
CREATE TRIGGER trg_notify_appointment
  AFTER INSERT ON appointments
  FOR EACH ROW
  EXECUTE FUNCTION fn_notify_appointment();

-- ============================================================================
-- 7. TRIGGER: Review Received
-- ============================================================================

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
  -- Get reviewer name
  v_reviewer_name := fn_get_display_name(NEW.reviewer_id);

  -- Format rating as stars
  v_rating_stars := REPEAT('⭐', COALESCE(NEW.rating, 0)::INTEGER);

  -- Queue notification for the trade
  PERFORM fn_queue_notification(
    NEW.reviewee_id,
    'review_received',
    format('%s Review', v_rating_stars),
    format('%s left you a review', v_reviewer_name),
    jsonb_build_object(
      'review_id', NEW.id,
      'reviewer_id', NEW.reviewer_id,
      'reviewer_name', v_reviewer_name,
      'rating', NEW.rating,
      'comment', LEFT(COALESCE(NEW.comment, ''), 100)
    )
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_review ON reviews;
CREATE TRIGGER trg_notify_review
  AFTER INSERT ON reviews
  FOR EACH ROW
  EXECUTE FUNCTION fn_notify_review();

-- ============================================================================
-- 8. FUNCTION: Send Response Time Nudge (called by scheduler)
-- ============================================================================

CREATE OR REPLACE FUNCTION fn_send_response_time_nudges()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_trade RECORD;
  v_count INTEGER := 0;
  v_pending_count INTEGER;
  v_oldest_hours INTEGER;
BEGIN
  -- Find trades with pending requests older than 24 hours
  FOR v_trade IN
    SELECT
      rt.trade_id,
      COUNT(*) AS pending_count,
      EXTRACT(EPOCH FROM (NOW() - MIN(rt.created_at))) / 3600 AS oldest_hours
    FROM request_targets rt
    WHERE rt.state = 'invited'
      AND rt.created_at < NOW() - INTERVAL '24 hours'
    GROUP BY rt.trade_id
    HAVING COUNT(*) >= 1
  LOOP
    v_pending_count := v_trade.pending_count;
    v_oldest_hours := ROUND(v_trade.oldest_hours);

    PERFORM fn_queue_notification(
      v_trade.trade_id,
      'response_time_nudge',
      'Requests Waiting',
      format('You have %s request%s waiting. Quick responses help you win more jobs!',
        v_pending_count,
        CASE WHEN v_pending_count = 1 THEN '' ELSE 's' END
      ),
      jsonb_build_object(
        'pending_count', v_pending_count,
        'oldest_hours', v_oldest_hours
      )
    );

    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;
