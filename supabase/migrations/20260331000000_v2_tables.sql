-- ============================================================================
-- V2 Migration: Browse & Choose Platform
-- Creates new tables for trade content, enquiries, pricing transparency
-- and client interest-based feed personalisation.
-- Does NOT alter or remove any existing tables.
-- ============================================================================

-- ============================================================================
-- 1. TRADE POSTS
-- Stores all trade-created content: intro videos, portfolio posts, etc.
-- ============================================================================
CREATE TABLE IF NOT EXISTS trade_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trade_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  post_type TEXT NOT NULL CHECK (post_type IN ('intro_video', 'portfolio_photo', 'portfolio_video', 'before_after', 'text_update')),
  title TEXT,
  description TEXT,
  media_urls TEXT[] DEFAULT '{}',
  thumbnail_url TEXT,
  is_intro_video BOOLEAN DEFAULT false,
  is_pinned BOOLEAN DEFAULT false,
  moderation_status TEXT DEFAULT 'pending' CHECK (moderation_status IN ('pending', 'approved', 'rejected', 'flagged')),
  rejection_reason TEXT,
  view_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_trade_posts_trade_id ON trade_posts(trade_id);
CREATE INDEX IF NOT EXISTS idx_trade_posts_moderation_status ON trade_posts(moderation_status);
CREATE INDEX IF NOT EXISTS idx_trade_posts_post_type ON trade_posts(post_type);
CREATE INDEX IF NOT EXISTS idx_trade_posts_is_intro_video ON trade_posts(is_intro_video);

-- ============================================================================
-- 2. CONTENT MODERATION QUEUE
-- Admin review queue for trade-posted content (separate from verification)
-- ============================================================================
CREATE TABLE IF NOT EXISTS content_moderation_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID NOT NULL REFERENCES trade_posts(id) ON DELETE CASCADE,
  trade_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  content_type TEXT NOT NULL CHECK (content_type IN ('intro_video', 'portfolio_post')),
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  reviewed_by UUID REFERENCES profiles(id),
  reviewed_at TIMESTAMPTZ,
  rejection_reason TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_content_mod_post_id ON content_moderation_queue(post_id);
CREATE INDEX IF NOT EXISTS idx_content_mod_trade_id ON content_moderation_queue(trade_id);
CREATE INDEX IF NOT EXISTS idx_content_mod_status ON content_moderation_queue(status);

-- ============================================================================
-- 3. CLIENT INTERESTS
-- Which service categories a client cares about (for feed personalisation)
-- ============================================================================
CREATE TABLE IF NOT EXISTS client_interests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  service_category_id UUID NOT NULL REFERENCES service_categories(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(client_id, service_category_id)
);

CREATE INDEX IF NOT EXISTS idx_client_interests_client_id ON client_interests(client_id);

-- ============================================================================
-- 4. ENQUIRIES
-- Direct client-to-trade enquiries (replaces broadcast quote_requests)
-- ============================================================================
CREATE TABLE IF NOT EXISTS enquiries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  trade_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  message TEXT NOT NULL,
  photos TEXT[] DEFAULT '{}',
  service_category_id UUID REFERENCES service_categories(id),
  postcode TEXT NOT NULL,
  lat NUMERIC(10, 6),
  lon NUMERIC(10, 6),
  property_type_id UUID REFERENCES property_types(id),
  status TEXT DEFAULT 'open' CHECK (status IN ('open', 'responded', 'quoted', 'hired', 'completed', 'cancelled')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_enquiries_client_id ON enquiries(client_id);
CREATE INDEX IF NOT EXISTS idx_enquiries_trade_id ON enquiries(trade_id);
CREATE INDEX IF NOT EXISTS idx_enquiries_status ON enquiries(status);
CREATE INDEX IF NOT EXISTS idx_enquiries_service_category ON enquiries(service_category_id);

-- ============================================================================
-- 5. PRICING BENCHMARKS
-- Market price ranges by service type, region, and property type.
-- Seeded from UK industry data at launch, replaced by platform data over time.
-- ============================================================================
CREATE TABLE IF NOT EXISTS pricing_benchmarks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  service_type_id UUID NOT NULL REFERENCES service_types(id) ON DELETE CASCADE,
  region TEXT NOT NULL,
  property_type_id UUID REFERENCES property_types(id),
  price_low INTEGER NOT NULL,
  price_median INTEGER NOT NULL,
  price_high INTEGER NOT NULL,
  sample_size INTEGER DEFAULT 0,
  data_source TEXT DEFAULT 'seeded' CHECK (data_source IN ('seeded', 'platform')),
  last_updated TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pricing_service_type ON pricing_benchmarks(service_type_id);
CREATE INDEX IF NOT EXISTS idx_pricing_region ON pricing_benchmarks(region);
CREATE UNIQUE INDEX IF NOT EXISTS idx_pricing_unique_combo
  ON pricing_benchmarks(service_type_id, region, COALESCE(property_type_id, '00000000-0000-0000-0000-000000000000'));

-- ============================================================================
-- 6. PROFILES TABLE ADDITIONS
-- New columns for intro video tracking (V2 browse-and-choose)
-- ============================================================================
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS intro_video_post_id UUID REFERENCES trade_posts(id),
  ADD COLUMN IF NOT EXISTS intro_video_deadline TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS has_approved_intro_video BOOLEAN DEFAULT false;

-- ============================================================================
-- 7. STORAGE BUCKET
-- For trade videos and portfolio media
-- ============================================================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('trade-media', 'trade-media', true)
ON CONFLICT (id) DO NOTHING;

-- ============================================================================
-- 8. RLS POLICIES
-- ============================================================================

-- --- trade_posts ---
ALTER TABLE trade_posts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Trades can insert own posts"
  ON trade_posts FOR INSERT
  WITH CHECK (auth.uid() = trade_id);

CREATE POLICY "Trades can update own posts"
  ON trade_posts FOR UPDATE
  USING (auth.uid() = trade_id);

CREATE POLICY "Trades can delete own posts"
  ON trade_posts FOR DELETE
  USING (auth.uid() = trade_id);

CREATE POLICY "Anyone can view approved posts"
  ON trade_posts FOR SELECT
  USING (
    moderation_status = 'approved'
    OR trade_id = auth.uid()
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true)
  );

-- --- content_moderation_queue ---
ALTER TABLE content_moderation_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Trades can view own moderation items"
  ON content_moderation_queue FOR SELECT
  USING (trade_id = auth.uid());

CREATE POLICY "Admins can view all moderation items"
  ON content_moderation_queue FOR SELECT
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true));

CREATE POLICY "System can insert moderation items"
  ON content_moderation_queue FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Admins can update moderation items"
  ON content_moderation_queue FOR UPDATE
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true));

-- --- client_interests ---
ALTER TABLE client_interests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Clients can view own interests"
  ON client_interests FOR SELECT
  USING (auth.uid() = client_id);

CREATE POLICY "Clients can insert own interests"
  ON client_interests FOR INSERT
  WITH CHECK (auth.uid() = client_id);

CREATE POLICY "Clients can delete own interests"
  ON client_interests FOR DELETE
  USING (auth.uid() = client_id);

-- --- enquiries ---
ALTER TABLE enquiries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Clients can view own enquiries"
  ON enquiries FOR SELECT
  USING (auth.uid() = client_id);

CREATE POLICY "Trades can view received enquiries"
  ON enquiries FOR SELECT
  USING (auth.uid() = trade_id);

CREATE POLICY "Clients can create enquiries"
  ON enquiries FOR INSERT
  WITH CHECK (auth.uid() = client_id);

CREATE POLICY "Participants can update enquiries"
  ON enquiries FOR UPDATE
  USING (auth.uid() = client_id OR auth.uid() = trade_id);

-- --- pricing_benchmarks ---
ALTER TABLE pricing_benchmarks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Pricing benchmarks are public"
  ON pricing_benchmarks FOR SELECT
  USING (true);

CREATE POLICY "Admins can manage pricing benchmarks"
  ON pricing_benchmarks FOR ALL
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true));

-- --- Storage policies for trade-media bucket ---
CREATE POLICY "Trades can upload media"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'trade-media' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Anyone can view trade media"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'trade-media');

CREATE POLICY "Trades can delete own media"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'trade-media' AND auth.uid()::text = (storage.foldername(name))[1]);

-- ============================================================================
-- DONE — V2 tables ready
-- ============================================================================
