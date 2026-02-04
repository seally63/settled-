-- ============================================================================
-- FIX APPOINTMENTS SCHEMA
-- Add request_id column and fix fn_notify_appointment trigger
-- Run this in Supabase SQL Editor
-- ============================================================================

-- 1. Add request_id column to appointments table (if not exists)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'appointments' AND column_name = 'request_id'
  ) THEN
    ALTER TABLE appointments
    ADD COLUMN request_id UUID REFERENCES quote_requests(id) ON DELETE SET NULL;

    CREATE INDEX IF NOT EXISTS idx_appointments_request ON appointments(request_id);
  END IF;
END $$;

-- 2. Update status check constraint to include 'proposed' and 'confirmed' statuses
-- First drop the existing constraint and recreate with new values
ALTER TABLE appointments DROP CONSTRAINT IF EXISTS appointments_status_check;
ALTER TABLE appointments ADD CONSTRAINT appointments_status_check
  CHECK (status IN ('scheduled', 'completed', 'cancelled', 'rescheduled', 'proposed', 'confirmed', 'reschedule_pending'));

-- 3. Fix fn_notify_appointment trigger to handle missing request_id gracefully
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
  -- Get client from various sources
  -- 1. Try direct request_id on appointment
  IF NEW.request_id IS NOT NULL THEN
    SELECT requester_id INTO v_client_id
    FROM quote_requests WHERE id = NEW.request_id;
  END IF;

  -- 2. Fall back to quote_id -> client_id
  IF v_client_id IS NULL AND NEW.quote_id IS NOT NULL THEN
    SELECT client_id INTO v_client_id
    FROM tradify_native_app_db WHERE id = NEW.quote_id;
  END IF;

  -- 3. Fall back to quote_id -> request_id -> requester_id
  IF v_client_id IS NULL AND NEW.quote_id IS NOT NULL THEN
    SELECT qr.requester_id INTO v_client_id
    FROM tradify_native_app_db q
    JOIN quote_requests qr ON qr.id = q.request_id
    WHERE q.id = NEW.quote_id;
  END IF;

  -- 4. Fall back to direct client_id on appointment
  IF v_client_id IS NULL AND NEW.client_id IS NOT NULL THEN
    v_client_id := NEW.client_id;
  END IF;

  -- Skip if no client found
  IF v_client_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Get trade name (only if trade_id exists)
  IF NEW.trade_id IS NOT NULL THEN
    v_trade_name := fn_get_display_name(NEW.trade_id);
  ELSE
    v_trade_name := 'A tradesperson';
  END IF;

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

-- Recreate the trigger
DROP TRIGGER IF EXISTS trg_notify_appointment ON appointments;
CREATE TRIGGER trg_notify_appointment
  AFTER INSERT ON appointments
  FOR EACH ROW
  EXECUTE FUNCTION fn_notify_appointment();

-- 4. Create or replace the rpc_send_appointment_message function
-- This creates an appointment AND sends a message notification
CREATE OR REPLACE FUNCTION rpc_send_appointment_message(
  p_request_id UUID,
  p_quote_id UUID DEFAULT NULL,
  p_scheduled_at TIMESTAMPTZ DEFAULT NULL,
  p_title TEXT DEFAULT 'Site Survey',
  p_location TEXT DEFAULT NULL
)
RETURNS TABLE (
  appointment_id UUID,
  message_id UUID,
  success BOOLEAN,
  error TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_appointment_id UUID;
  v_message_id UUID;
  v_client_id UUID;
  v_request RECORD;
BEGIN
  -- Validate request exists and get client
  SELECT id, requester_id INTO v_request
  FROM quote_requests
  WHERE id = p_request_id;

  IF NOT FOUND THEN
    RETURN QUERY SELECT NULL::UUID, NULL::UUID, false, 'Request not found';
    RETURN;
  END IF;

  v_client_id := v_request.requester_id;

  -- Validate scheduled_at is provided and in the future
  IF p_scheduled_at IS NULL THEN
    RETURN QUERY SELECT NULL::UUID, NULL::UUID, false, 'Scheduled time is required';
    RETURN;
  END IF;

  IF p_scheduled_at <= NOW() THEN
    RETURN QUERY SELECT NULL::UUID, NULL::UUID, false, 'Scheduled time must be in the future';
    RETURN;
  END IF;

  -- Create the appointment
  INSERT INTO appointments (
    trade_id,
    client_id,
    quote_id,
    request_id,
    title,
    location,
    scheduled_at,
    status,
    created_at,
    updated_at
  )
  VALUES (
    v_user_id,
    v_client_id,
    p_quote_id,
    p_request_id,
    p_title,
    p_location,
    p_scheduled_at,
    'proposed',  -- Client needs to accept/decline
    NOW(),
    NOW()
  )
  RETURNING id INTO v_appointment_id;

  -- Create a message of type 'appointment' to notify in conversation
  INSERT INTO messages (
    request_id,
    quote_id,
    sender_id,
    receiver_id,
    body,
    message_type,
    appointment_id,
    created_at
  )
  VALUES (
    p_request_id,
    p_quote_id,
    v_user_id,
    v_client_id,
    format('Appointment scheduled: %s', p_title),
    'appointment',
    v_appointment_id,
    NOW()
  )
  RETURNING id INTO v_message_id;

  RETURN QUERY SELECT v_appointment_id, v_message_id, true, NULL::TEXT;
END;
$$;

GRANT EXECUTE ON FUNCTION rpc_send_appointment_message(UUID, UUID, TIMESTAMPTZ, TEXT, TEXT) TO authenticated;

-- 5. Create rpc_client_respond_appointment for clients to accept/decline
CREATE OR REPLACE FUNCTION rpc_client_respond_appointment(
  p_appointment_id UUID,
  p_response TEXT  -- 'accepted' or 'declined'
)
RETURNS TABLE (
  success BOOLEAN,
  error TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_appointment RECORD;
  v_new_status TEXT;
BEGIN
  -- Get appointment
  SELECT * INTO v_appointment
  FROM appointments
  WHERE id = p_appointment_id;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 'Appointment not found';
    RETURN;
  END IF;

  -- Verify caller is the client
  IF v_appointment.client_id != v_user_id THEN
    RETURN QUERY SELECT false, 'You are not authorized to respond to this appointment';
    RETURN;
  END IF;

  -- Verify appointment is in proposed state
  IF v_appointment.status != 'proposed' THEN
    RETURN QUERY SELECT false, 'This appointment has already been responded to';
    RETURN;
  END IF;

  -- Map response to status
  IF p_response = 'accepted' THEN
    v_new_status := 'confirmed';
  ELSIF p_response = 'declined' THEN
    v_new_status := 'cancelled';
  ELSE
    RETURN QUERY SELECT false, 'Invalid response. Use "accepted" or "declined"';
    RETURN;
  END IF;

  -- Update appointment status
  UPDATE appointments
  SET status = v_new_status,
      updated_at = NOW()
  WHERE id = p_appointment_id;

  RETURN QUERY SELECT true, NULL::TEXT;
END;
$$;

GRANT EXECUTE ON FUNCTION rpc_client_respond_appointment(UUID, TEXT) TO authenticated;

-- 6. Ensure messages table has appointment_id column
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'messages' AND column_name = 'appointment_id'
  ) THEN
    ALTER TABLE messages
    ADD COLUMN appointment_id UUID REFERENCES appointments(id) ON DELETE SET NULL;

    CREATE INDEX IF NOT EXISTS idx_messages_appointment ON messages(appointment_id);
  END IF;
END $$;

-- 7. Update messages message_type constraint to include 'appointment'
ALTER TABLE messages DROP CONSTRAINT IF EXISTS messages_message_type_check;
ALTER TABLE messages ADD CONSTRAINT messages_message_type_check
  CHECK (message_type IN ('text', 'image', 'system', 'appointment'));
