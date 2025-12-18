# Appointment Messages Implementation Plan

## Current State Analysis

### What Already Works ✅
1. **Quote Hero Card in Messages** - `QuoteHeader` component displays quote info at top of conversation
2. **Quote-Message Linking** - `quoteId` and `request_id` properly link quotes to conversations
3. **Message Infrastructure** - RPCs: `rpc_list_messages`, `rpc_send_message`, `rpc_list_conversations`
4. **Appointment Creation** - Trade can create appointments via `rpc_trade_create_survey_appointment`
5. **Client Response** - Client can accept/decline via `rpc_client_respond_appointment` on quote page

### What Needs Building 🔨

## Database Schema Changes

### Option 1: Extend Messages Table (RECOMMENDED)
Add columns to existing `messages` table:
- `message_type` TEXT (values: 'text', 'appointment', 'system')
- `appointment_id` UUID (FK to appointments table)
- `metadata` JSONB (for flexible data storage)

### Option 2: Create Appointment Messages Junction Table
Create `appointment_messages` table linking appointments to messages.

**Recommendation**: Option 1 is simpler and leverages existing message infrastructure.

## SQL Functions Needed

1. **`rpc_send_appointment_message`**
   - Creates appointment record in `appointments` table
   - Creates message record with `message_type='appointment'` and `appointment_id`
   - Returns the created message with appointment data joined

2. **`rpc_update_appointment_message`**
   - Updates appointment (scheduled_at, title, location)
   - Creates a new system message notifying of the change
   - Returns updated appointment data

3. **Update `rpc_list_messages`**
   - Join with appointments table when `message_type='appointment'`
   - Return appointment data (scheduled_at, status, title, location) with message

## UI Components

### 1. AppointmentMessageBubble Component
Location: `app/(dashboard)/messages/[id].jsx`

Features:
- Display appointment date, time, title, location
- Different visual style than regular message bubble (similar to quote card)
- Show status badge (proposed/confirmed/cancelled)
- Conditional rendering based on:
  - User role (client vs trade)
  - Appointment status
  - Is mine vs theirs

### 2. Action Buttons (Role-Based)

**For Client (when status='proposed' and !isMine):**
- Accept button (green)
- Decline button (red)
- Calls `rpc_client_respond_appointment`

**For Trade (when isMine and status='proposed'):**
- Edit button (opens date/time picker modal)
- Cancel button
- Calls `rpc_update_appointment_message`

**For Both (when status='confirmed'):**
- Read-only display with checkmark
- "Confirmed" badge

### 3. System Messages
Auto-generated messages for:
- Appointment confirmed: "You confirmed the appointment for [date/time]"
- Appointment updated: "[Trade] updated the appointment to [new date/time]"
- Appointment cancelled: "[User] cancelled the appointment"

## Implementation Steps

### Step 1: Database Schema
```sql
-- Add columns to messages table
ALTER TABLE messages
ADD COLUMN message_type TEXT DEFAULT 'text',
ADD COLUMN appointment_id UUID REFERENCES appointments(id),
ADD COLUMN metadata JSONB;

-- Create index for performance
CREATE INDEX idx_messages_appointment_id ON messages(appointment_id);
```

### Step 2: SQL Functions

#### rpc_send_appointment_message
```sql
CREATE OR REPLACE FUNCTION rpc_send_appointment_message(
  p_request_id UUID,
  p_quote_id UUID,
  p_scheduled_at TIMESTAMPTZ,
  p_title TEXT DEFAULT NULL,
  p_location TEXT DEFAULT NULL
)
RETURNS TABLE (
  message_id UUID,
  appointment_id UUID,
  scheduled_at TIMESTAMPTZ,
  title TEXT,
  location TEXT,
  status TEXT,
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_appointment_id UUID;
  v_message_id UUID;
  v_sender_id UUID;
  v_sender_role TEXT;
BEGIN
  v_sender_id := auth.uid();

  -- Get sender role
  SELECT role INTO v_sender_role FROM profiles WHERE id = v_sender_id;

  -- Only trades can initiate appointments
  IF v_sender_role != 'trades' THEN
    RAISE EXCEPTION 'Only trades can create appointment messages';
  END IF;

  -- Create appointment record
  INSERT INTO appointments (request_id, quote_id, scheduled_at, title, location, status)
  VALUES (p_request_id, p_quote_id, p_scheduled_at, p_title, p_location, 'proposed')
  RETURNING id INTO v_appointment_id;

  -- Create message record
  INSERT INTO messages (request_id, quote_id, sender_id, body, message_type, appointment_id)
  VALUES (
    p_request_id,
    p_quote_id,
    v_sender_id,
    'Appointment proposal',
    'appointment',
    v_appointment_id
  )
  RETURNING id INTO v_message_id;

  -- Return combined data
  RETURN QUERY
  SELECT
    v_message_id,
    a.id,
    a.scheduled_at,
    a.title,
    a.location,
    a.status,
    NOW()
  FROM appointments a
  WHERE a.id = v_appointment_id;
END;
$$;
```

#### Update rpc_list_messages
```sql
-- Modify to include appointment data
CREATE OR REPLACE FUNCTION rpc_list_messages(
  p_request_id UUID,
  p_quote_id UUID DEFAULT NULL
)
RETURNS TABLE (
  id UUID,
  sender_id UUID,
  body TEXT,
  created_at TIMESTAMPTZ,
  attachment_paths TEXT[],
  message_type TEXT,
  appointment_id UUID,
  appointment_scheduled_at TIMESTAMPTZ,
  appointment_title TEXT,
  appointment_location TEXT,
  appointment_status TEXT
)
-- ... implementation with LEFT JOIN appointments
```

### Step 3: React Components

#### AppointmentMessageBubble
```jsx
function AppointmentMessageBubble({ message, appointment, isMine, userRole, onRespond, onUpdate }) {
  const scheduledDate = new Date(appointment.scheduled_at);
  const isPending = appointment.status === 'proposed';
  const isConfirmed = appointment.status === 'confirmed';

  const showClientActions = !isMine && userRole === 'client' && isPending;
  const showTradeActions = isMine && userRole === 'trades' && isPending;

  return (
    <View style={styles.appointmentBubble}>
      <View style={styles.appointmentHeader}>
        <Ionicons name="calendar" size={20} color="#0ea5e9" />
        <ThemedText style={styles.appointmentTitle}>
          {appointment.title || 'Site Survey Appointment'}
        </ThemedText>
        <StatusBadge status={appointment.status} />
      </View>

      <View style={styles.appointmentDetails}>
        <View style={styles.detailRow}>
          <Ionicons name="time-outline" size={16} />
          <ThemedText>
            {scheduledDate.toLocaleDateString()} at {scheduledDate.toLocaleTimeString()}
          </ThemedText>
        </View>

        {appointment.location && (
          <View style={styles.detailRow}>
            <Ionicons name="location-outline" size={16} />
            <ThemedText>{appointment.location}</ThemedText>
          </View>
        )}
      </View>

      {showClientActions && (
        <View style={styles.actionButtons}>
          <Pressable
            style={[styles.button, styles.acceptButton]}
            onPress={() => onRespond('confirmed')}
          >
            <ThemedText style={styles.buttonText}>Accept</ThemedText>
          </Pressable>
          <Pressable
            style={[styles.button, styles.declineButton]}
            onPress={() => onRespond('cancelled')}
          >
            <ThemedText style={styles.buttonText}>Decline</ThemedText>
          </Pressable>
        </View>
      )}

      {showTradeActions && (
        <View style={styles.actionButtons}>
          <Pressable
            style={[styles.button, styles.editButton]}
            onPress={onUpdate}
          >
            <Ionicons name="create-outline" size={16} color="#FFF" />
            <ThemedText style={styles.buttonText}>Edit</ThemedText>
          </Pressable>
        </View>
      )}

      {isConfirmed && (
        <View style={styles.confirmedBanner}>
          <Ionicons name="checkmark-circle" size={18} color="#166534" />
          <ThemedText style={styles.confirmedText}>Confirmed</ThemedText>
        </View>
      )}
    </View>
  );
}
```

### Step 4: Integration Points

#### In messages/[id].jsx
1. Update `renderItem` to check `message.message_type`
2. Render `AppointmentMessageBubble` when type is 'appointment'
3. Add handlers for accept/decline/edit actions
4. Refresh messages after appointment actions

#### In quotes/[id].jsx
1. When trade creates appointment via "Schedule appointment" button
2. Call `rpc_send_appointment_message` instead of just creating appointment
3. Show success message: "Appointment sent to messages"

## User Flow

### Trade Creates Appointment
1. Trade fills out date/time/title on quote page
2. Clicks "Send appointment request"
3. System creates appointment + sends appointment message
4. Trade sees appointment in messages with "Awaiting client confirmation"
5. Client gets notification

### Client Accepts in Messages
1. Client opens messages
2. Sees appointment message bubble with date/time
3. Clicks "Accept"
4. System updates appointment status to 'confirmed'
5. System sends confirmation message to both parties
6. Both see "Appointment confirmed" message in chat

### Trade Edits Appointment in Messages
1. Trade clicks "Edit" on their appointment message
2. Date/time picker modal opens
3. Trade changes date/time
4. System updates appointment
5. System sends update message: "Appointment updated to [new date/time]"
6. Client sees updated appointment with new details

## Testing Checklist
- [ ] Trade can create appointment from quote page
- [ ] Appointment appears as special message in chat
- [ ] Client can accept appointment in messages
- [ ] Client can decline appointment in messages
- [ ] Trade can edit appointment in messages
- [ ] Both parties see confirmation messages
- [ ] Appointment status syncs between quote page and messages
- [ ] Edge cases: cancelled appointments, expired quotes, etc.

## Notes
- Keep existing quote page appointment functionality intact
- Ensure backward compatibility with existing appointments
- Consider adding push notifications for appointment updates (future enhancement)
