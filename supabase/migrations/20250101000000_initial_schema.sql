-- ============================================================================
-- Initial Schema Migration
-- Creates all base tables required for the Tradify app
-- ============================================================================

-- ============================================================================
-- 1. SERVICE CATEGORIES
-- ============================================================================
CREATE TABLE IF NOT EXISTS service_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  icon TEXT,
  display_order INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- 2. SERVICE TYPES
-- ============================================================================
CREATE TABLE IF NOT EXISTS service_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id UUID REFERENCES service_categories(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  icon TEXT,
  display_order INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_service_types_category ON service_types(category_id);

-- ============================================================================
-- 3. PROPERTY TYPES
-- ============================================================================
CREATE TABLE IF NOT EXISTS property_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  display_order INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true
);

-- ============================================================================
-- 4. TIMING OPTIONS
-- ============================================================================
CREATE TABLE IF NOT EXISTS timing_options (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  display_order INTEGER DEFAULT 0,
  is_emergency BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true
);

-- ============================================================================
-- 5. PROFILES (Users)
-- ============================================================================
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('client', 'trades', 'admin')),
  full_name TEXT,
  email TEXT,
  business_name TEXT,
  trade_title TEXT,
  bio TEXT,
  phone TEXT,
  photo_url TEXT,
  base_postcode TEXT,
  base_lat NUMERIC(10, 6),
  base_lon NUMERIC(10, 6),
  service_radius_km NUMERIC(6, 2) DEFAULT 25.00,
  town_city TEXT,
  service_type_ids UUID[] DEFAULT '{}',
  job_titles TEXT[],
  profile_completion_percentage INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_profiles_role ON profiles(role);
CREATE INDEX IF NOT EXISTS idx_profiles_postcode ON profiles(base_postcode);

-- ============================================================================
-- 6. QUOTE REQUESTS
-- ============================================================================
CREATE TABLE IF NOT EXISTS quote_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  service_type_id UUID REFERENCES service_types(id),
  service_category_id UUID REFERENCES service_categories(id),
  property_type_id UUID REFERENCES property_types(id),
  timing_option_id UUID REFERENCES timing_options(id),
  status TEXT DEFAULT 'open' CHECK (status IN ('open', 'claimed', 'completed', 'cancelled', 'expired')),
  suggested_title TEXT,
  details TEXT,
  postcode TEXT,
  lat NUMERIC(10, 6),
  lon NUMERIC(10, 6),
  budget_band TEXT,
  photo_urls TEXT[],
  is_direct BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_quote_requests_requester ON quote_requests(requester_id);
CREATE INDEX IF NOT EXISTS idx_quote_requests_status ON quote_requests(status);
CREATE INDEX IF NOT EXISTS idx_quote_requests_service_type ON quote_requests(service_type_id);

-- ============================================================================
-- 7. REQUEST TARGETS (Trades invited to quote on requests)
-- ============================================================================
CREATE TABLE IF NOT EXISTS request_targets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id UUID REFERENCES quote_requests(id) ON DELETE CASCADE,
  trade_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  invited_by TEXT DEFAULT 'system' CHECK (invited_by IN ('system', 'client', 'trade')),
  state TEXT DEFAULT 'invited' CHECK (state IN ('invited', 'accepted', 'declined', 'client_accepted', 'expired')),
  outside_service_area BOOLEAN DEFAULT false,
  distance_miles NUMERIC(8, 2),
  extended_match BOOLEAN DEFAULT false,
  first_action_at TIMESTAMPTZ,
  first_action_type TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(request_id, trade_id)
);

CREATE INDEX IF NOT EXISTS idx_request_targets_request ON request_targets(request_id);
CREATE INDEX IF NOT EXISTS idx_request_targets_trade ON request_targets(trade_id);
CREATE INDEX IF NOT EXISTS idx_request_targets_state ON request_targets(state);

-- ============================================================================
-- 8. QUOTES / JOBS (tradify_native_app_db)
-- ============================================================================
CREATE TABLE IF NOT EXISTS tradify_native_app_db (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trade_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  client_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  request_id UUID REFERENCES quote_requests(id) ON DELETE SET NULL,
  project_title TEXT,
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'sent', 'accepted', 'declined', 'expired', 'completed', 'awaiting_completion', 'withdrawn')),
  grand_total NUMERIC(12, 2),
  currency TEXT DEFAULT 'GBP',
  issued_at TIMESTAMPTZ,
  valid_until TIMESTAMPTZ,
  notes TEXT,
  line_items JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_quotes_trade ON tradify_native_app_db(trade_id);
CREATE INDEX IF NOT EXISTS idx_quotes_client ON tradify_native_app_db(client_id);
CREATE INDEX IF NOT EXISTS idx_quotes_request ON tradify_native_app_db(request_id);
CREATE INDEX IF NOT EXISTS idx_quotes_status ON tradify_native_app_db(status);

-- ============================================================================
-- 9. REVIEWS
-- ============================================================================
CREATE TABLE IF NOT EXISTS reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id UUID REFERENCES tradify_native_app_db(id) ON DELETE CASCADE,
  reviewer_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  reviewee_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  reviewer_type TEXT CHECK (reviewer_type IN ('client', 'trade')),
  rating INTEGER CHECK (rating >= 1 AND rating <= 5),
  comment TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_reviews_reviewee ON reviews(reviewee_id);
CREATE INDEX IF NOT EXISTS idx_reviews_reviewer ON reviews(reviewer_id);

-- ============================================================================
-- 10. APPOINTMENTS
-- ============================================================================
CREATE TABLE IF NOT EXISTS appointments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trade_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  client_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  quote_id UUID REFERENCES tradify_native_app_db(id) ON DELETE SET NULL,
  title TEXT,
  description TEXT,
  scheduled_at TIMESTAMPTZ,
  duration_minutes INTEGER DEFAULT 60,
  status TEXT DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'completed', 'cancelled', 'rescheduled')),
  location TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_appointments_trade ON appointments(trade_id);
CREATE INDEX IF NOT EXISTS idx_appointments_scheduled ON appointments(scheduled_at);

-- ============================================================================
-- 11. MESSAGES
-- ============================================================================
CREATE TABLE IF NOT EXISTS messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID,
  sender_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  receiver_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  quote_id UUID REFERENCES tradify_native_app_db(id) ON DELETE SET NULL,
  request_id UUID REFERENCES quote_requests(id) ON DELETE SET NULL,
  content TEXT,
  message_type TEXT DEFAULT 'text' CHECK (message_type IN ('text', 'image', 'system', 'appointment')),
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_messages_sender ON messages(sender_id);
CREATE INDEX IF NOT EXISTS idx_messages_receiver ON messages(receiver_id);

-- ============================================================================
-- 12. TRADE PERFORMANCE STATS (for caching performance metrics)
-- ============================================================================
CREATE TABLE IF NOT EXISTS trade_performance_stats (
  profile_id UUID PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  avg_response_time_hours NUMERIC(10, 2),
  median_response_time_hours NUMERIC(10, 2),
  response_time_percentile INTEGER,
  requests_received_count INTEGER DEFAULT 0,
  requests_accepted_count INTEGER DEFAULT 0,
  quotes_sent_count INTEGER DEFAULT 0,
  quote_rate NUMERIC(5, 2),
  jobs_completed_count INTEGER DEFAULT 0,
  completion_rate NUMERIC(5, 2),
  review_count INTEGER DEFAULT 0,
  average_rating NUMERIC(3, 2),
  period_start DATE,
  period_end DATE,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT valid_quote_rate CHECK (quote_rate IS NULL OR (quote_rate >= 0 AND quote_rate <= 100)),
  CONSTRAINT valid_completion_rate CHECK (completion_rate IS NULL OR (completion_rate >= 0 AND completion_rate <= 100)),
  CONSTRAINT valid_rating CHECK (average_rating IS NULL OR (average_rating >= 0 AND average_rating <= 5))
);

-- ============================================================================
-- 13. RLS POLICIES (Basic)
-- ============================================================================

-- Enable RLS on all tables
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE quote_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE request_targets ENABLE ROW LEVEL SECURITY;
ALTER TABLE tradify_native_app_db ENABLE ROW LEVEL SECURITY;
ALTER TABLE reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE appointments ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE trade_performance_stats ENABLE ROW LEVEL SECURITY;

-- Profiles: Users can read all profiles, update their own
CREATE POLICY "Profiles are viewable by everyone" ON profiles FOR SELECT USING (true);
CREATE POLICY "Users can update own profile" ON profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Users can insert own profile" ON profiles FOR INSERT WITH CHECK (auth.uid() = id);

-- Quote Requests: Clients can CRUD their own, trades can view
CREATE POLICY "Clients can view own requests" ON quote_requests FOR SELECT USING (requester_id = auth.uid() OR EXISTS (SELECT 1 FROM request_targets WHERE request_id = quote_requests.id AND trade_id = auth.uid()));
CREATE POLICY "Clients can create requests" ON quote_requests FOR INSERT WITH CHECK (requester_id = auth.uid());
CREATE POLICY "Clients can update own requests" ON quote_requests FOR UPDATE USING (requester_id = auth.uid());

-- Request Targets: Trades can view/update their targets
CREATE POLICY "Trades can view their targets" ON request_targets FOR SELECT USING (trade_id = auth.uid() OR EXISTS (SELECT 1 FROM quote_requests WHERE id = request_targets.request_id AND requester_id = auth.uid()));
CREATE POLICY "System can insert targets" ON request_targets FOR INSERT WITH CHECK (true);
CREATE POLICY "Trades can update their targets" ON request_targets FOR UPDATE USING (trade_id = auth.uid());

-- Quotes: Trades can CRUD their own, clients can view quotes sent to them
CREATE POLICY "Users can view relevant quotes" ON tradify_native_app_db FOR SELECT USING (trade_id = auth.uid() OR client_id = auth.uid());
CREATE POLICY "Trades can create quotes" ON tradify_native_app_db FOR INSERT WITH CHECK (trade_id = auth.uid());
CREATE POLICY "Trades can update own quotes" ON tradify_native_app_db FOR UPDATE USING (trade_id = auth.uid() OR client_id = auth.uid());

-- Reviews: Anyone can read, participants can create
CREATE POLICY "Reviews are viewable by everyone" ON reviews FOR SELECT USING (true);
CREATE POLICY "Users can create reviews" ON reviews FOR INSERT WITH CHECK (reviewer_id = auth.uid());

-- Appointments: Participants can view/manage
CREATE POLICY "Participants can view appointments" ON appointments FOR SELECT USING (trade_id = auth.uid() OR client_id = auth.uid());
CREATE POLICY "Trades can create appointments" ON appointments FOR INSERT WITH CHECK (trade_id = auth.uid());
CREATE POLICY "Participants can update appointments" ON appointments FOR UPDATE USING (trade_id = auth.uid() OR client_id = auth.uid());

-- Messages: Participants can view/send
CREATE POLICY "Users can view own messages" ON messages FOR SELECT USING (sender_id = auth.uid() OR receiver_id = auth.uid());
CREATE POLICY "Users can send messages" ON messages FOR INSERT WITH CHECK (sender_id = auth.uid());
CREATE POLICY "Users can update own messages" ON messages FOR UPDATE USING (sender_id = auth.uid() OR receiver_id = auth.uid());

-- Trade Performance Stats: Trades can view their own
CREATE POLICY "Trades can view own stats" ON trade_performance_stats FOR SELECT USING (profile_id = auth.uid());

-- Service Categories, Types, Property Types, Timing Options are public read
ALTER TABLE service_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE service_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE property_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE timing_options ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service categories are public" ON service_categories FOR SELECT USING (true);
CREATE POLICY "Service types are public" ON service_types FOR SELECT USING (true);
CREATE POLICY "Property types are public" ON property_types FOR SELECT USING (true);
CREATE POLICY "Timing options are public" ON timing_options FOR SELECT USING (true);

-- ============================================================================
-- DONE
-- ============================================================================
