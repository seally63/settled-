-- ============================================================================
-- Allow public read access to trade_performance_stats
-- These cached stats (review_count, average_rating, response_time) are
-- already considered public-facing data shown on trade profiles. The previous
-- RLS policy only allowed trades to view their own stats, which broke
-- client-side joins on the home discovery feed.
-- ============================================================================

DROP POLICY IF EXISTS "Public can view trade stats" ON trade_performance_stats;
CREATE POLICY "Public can view trade stats"
  ON trade_performance_stats
  FOR SELECT
  USING (true);
