-- ============================================================================
-- Web Directory — Backend Prep
--
-- Adds the columns + RLS plumbing the web-directory project needs to host
-- enquiry conversations for visitors who don't (or can't) sign in via
-- Supabase Auth. Token-based access lives alongside the existing
-- auth.uid() policies — neither shadows the other.
--
-- Schema (additive only — no DROP, no column-type changes):
--   · enquiries.conversation_token  UUID  NOT NULL  DEFAULT gen_random_uuid()
--   · enquiries.budget_range        TEXT
--   · profiles.typical_project_minimum  INTEGER
--   · messages.enquiry_id           UUID  REFERENCES enquiries(id) ON DELETE CASCADE
--
-- The `messages.enquiry_id` column is added because the existing `messages`
-- table only links to `quote_requests.id` via `request_id` — without
-- `enquiry_id`, a token policy on messages has nothing to join through.
-- It is nullable so every existing message keeps working.
--
-- Auth flow:
--   The web client sends `X-Conversation-Token: <uuid>` on each request.
--   PostgREST exposes that as `current_setting('request.headers', true)`,
--   which the helper `current_conversation_token()` parses into a UUID
--   (returns NULL on missing/invalid). The new policies USE that helper —
--   if the header is absent the policies simply don't match, so signed-in
--   users keep flowing through the existing auth.uid() policies untouched.
--
-- Idempotent: re-runnable safely. Every change uses IF NOT EXISTS, every
-- policy is dropped before recreation, the conversation_token NOT NULL
-- step is preceded by a defensive backfill UPDATE.
-- ============================================================================


-- ============================================================================
-- 1. SCHEMA — column additions
-- ============================================================================

-- enquiries.conversation_token --------------------------------------------------
-- Per-conversation secret a visitor exchanges for read/write access without
-- a Supabase Auth session. Default + NOT NULL together would force a table
-- rewrite on big tables (gen_random_uuid is VOLATILE), so we add the column
-- nullable, backfill, then promote to NOT NULL.

ALTER TABLE enquiries
  ADD COLUMN IF NOT EXISTS conversation_token UUID DEFAULT gen_random_uuid();

UPDATE enquiries
SET conversation_token = gen_random_uuid()
WHERE conversation_token IS NULL;

ALTER TABLE enquiries
  ALTER COLUMN conversation_token SET NOT NULL;

-- A unique index doubles as a fast lookup path for the policy join AND
-- prevents a leaked token from ever being reused if the cron / admin
-- ever bulk-rotates them.
CREATE UNIQUE INDEX IF NOT EXISTS idx_enquiries_conversation_token
  ON enquiries(conversation_token);


-- enquiries.budget_range -------------------------------------------------------
-- Free-form-ish budget label submitted alongside the enquiry. The mobile
-- app uses the v1 quote_requests.budget_band TEXT pattern; matching the
-- column type keeps both sides interchangeable.

ALTER TABLE enquiries
  ADD COLUMN IF NOT EXISTS budget_range TEXT;


-- profiles.typical_project_minimum ---------------------------------------------
-- Optional minimum job size (whole pounds, NULL = no minimum). The directory
-- surfaces this on trade cards so visitors self-qualify before sending an
-- enquiry. Stored as INTEGER so client-side formatting handles currency.

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS typical_project_minimum INTEGER;


-- messages.enquiry_id ----------------------------------------------------------
-- New optional link from a message to its parent enquiry. Required for the
-- token policies below (the existing schema only routes messages through
-- request_id, but enquiries are a v2 surface that lives outside the
-- quote_requests fan-out). NULL on every legacy row — the existing
-- request_id-based policies keep applying to those untouched.

ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS enquiry_id UUID
  REFERENCES enquiries(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_messages_enquiry ON messages(enquiry_id);


-- ============================================================================
-- 2. HELPER FUNCTION — current_conversation_token()
-- ============================================================================
--
-- PostgREST stuffs the incoming HTTP request headers into a per-request
-- GUC named `request.headers`, JSON-encoded with all header names
-- lowercased. We pull `x-conversation-token` out of it, parse to UUID,
-- and hand it back to the policies. Three failure modes are folded into
-- "no token presented":
--   · header missing entirely
--   · header present but empty string
--   · header present but not a valid UUID
--
-- STABLE so the planner can hoist the call out of policy expressions.
-- SECURITY DEFINER is NOT used here — current_setting reads its own
-- session GUC and works regardless of the calling role's privileges.
-- ============================================================================

CREATE OR REPLACE FUNCTION current_conversation_token()
RETURNS UUID
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_raw TEXT;
BEGIN
  -- `current_setting(name, missing_ok)` — the second arg avoids raising
  -- when no PostgREST request is in flight (e.g. running this in psql).
  v_raw := nullif(
    current_setting('request.headers', true)::json ->> 'x-conversation-token',
    ''
  );

  IF v_raw IS NULL THEN
    RETURN NULL;
  END IF;

  RETURN v_raw::uuid;

EXCEPTION
  -- Bad UUID, malformed JSON, missing setting, anything else → no token.
  -- Returning NULL means the new "token holder" policies simply don't
  -- match, which is the correct fail-closed behaviour.
  WHEN OTHERS THEN
    RETURN NULL;
END;
$$;

GRANT EXECUTE ON FUNCTION current_conversation_token() TO anon, authenticated;


-- ============================================================================
-- 3. ENQUIRIES — token-based RLS (additive)
-- ============================================================================
--
-- These policies coexist with the existing v2 enquiries policies (in
-- 20260331000000_v2_tables.sql):
--   · "Clients can view own enquiries"      — auth.uid() = client_id
--   · "Trades can view received enquiries"  — auth.uid() = trade_id
--   · "Clients can create enquiries"        — INSERT, auth.uid() = client_id
--   · "Participants can update enquiries"   — auth.uid() in {client_id, trade_id}
--
-- Postgres OR-combines policies for the same { table, command, role } —
-- a row qualifies if ANY policy says yes. So token holders gain read +
-- update access without disturbing the auth-based path.
--
-- INSERT is intentionally NOT covered by token auth here. Creating an
-- enquiry is the moment the token is minted, so a token policy would be
-- circular. The directory should INSERT either via the existing
-- "Clients can create enquiries" path (after a sign-in) or via a
-- SECURITY DEFINER RPC that captchas / rate-limits anonymous submissions.
-- ============================================================================

DROP POLICY IF EXISTS "Token holders can view enquiries" ON enquiries;
CREATE POLICY "Token holders can view enquiries"
  ON enquiries
  FOR SELECT
  USING (conversation_token = current_conversation_token());

DROP POLICY IF EXISTS "Token holders can update enquiries" ON enquiries;
CREATE POLICY "Token holders can update enquiries"
  ON enquiries
  FOR UPDATE
  USING (conversation_token = current_conversation_token())
  WITH CHECK (conversation_token = current_conversation_token());


-- ============================================================================
-- 4. MESSAGES — token-based RLS (additive)
-- ============================================================================
--
-- Coexists with the existing v1 messages policies (in
-- 20260122_security_rls_policies.sql.applied):
--   · "Users can view messages in their conversations"
--       — sender_id = auth.uid() OR is_request_participant(request_id)
--   · "Users can send messages in their conversations"
--       — sender_id = auth.uid() AND is_request_participant(request_id)
--
-- The new policies fire ONLY for messages whose enquiry_id matches an
-- enquiry the caller holds the token for. enquiry_id IS NOT NULL is
-- required so legacy messages (request_id-only) keep flowing through
-- the existing policies — they aren't affected at all.
-- ============================================================================

DROP POLICY IF EXISTS "Token holders can view enquiry messages" ON messages;
CREATE POLICY "Token holders can view enquiry messages"
  ON messages
  FOR SELECT
  USING (
    enquiry_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM enquiries
      WHERE enquiries.id = messages.enquiry_id
        AND enquiries.conversation_token = current_conversation_token()
    )
  );

DROP POLICY IF EXISTS "Token holders can send enquiry messages" ON messages;
CREATE POLICY "Token holders can send enquiry messages"
  ON messages
  FOR INSERT
  WITH CHECK (
    enquiry_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM enquiries
      WHERE enquiries.id = messages.enquiry_id
        AND enquiries.conversation_token = current_conversation_token()
    )
  );

-- An UPDATE policy is intentionally omitted: messages are append-only on
-- this surface. If the directory needs read-receipts (`read_at`), add a
-- narrowly-scoped UPDATE policy here later — don't widen this one.


-- ============================================================================
-- DONE
-- ============================================================================
