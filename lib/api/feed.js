// lib/api/feed.js
// Client discovery feed: fetch trades for each section of the home screen
// Uses Haversine distance (matching existing search.js / directRequest.js patterns)

import { supabase } from "../supabase";

/**
 * Haversine distance in km between two lat/lon points
 * Matches the implementation in directRequest.js
 */
function haversineDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; // Earth's radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Fetch the client's interest category IDs (if any)
 * @param {string} clientId
 * @returns {Promise<string[]>} Array of service_category_ids
 */
async function getClientInterestIds(clientId) {
  if (!clientId) return [];

  const { data, error } = await supabase
    .from("client_interests")
    .select("service_category_id")
    .eq("client_id", clientId);

  if (error) {
    console.warn("[feed] Error fetching interests:", error.message);
    return [];
  }

  return (data || []).map((row) => row.service_category_id);
}

/**
 * Core query: fetch trade profiles with stats, filter by video status and interests.
 * Returns raw rows — caller handles distance filtering and sorting.
 *
 * @param {object} params
 * @param {string[]} interests - Service category IDs to filter by (empty = no filter)
 * @param {number} limit - Max rows to fetch from DB (fetch more than needed, filter client-side)
 * @returns {Promise<object[]>}
 */
async function fetchTradesWithStats({ interests = [], limit = 100 } = {}) {
  let query = supabase
    .from("profiles")
    .select(
      `
      id, full_name, business_name, trade_title, photo_url, town_city,
      base_lat, base_lon, service_radius_km, service_type_ids,
      has_approved_intro_video, intro_video_deadline,
      trade_performance_stats (
        average_rating, review_count, jobs_completed_count
      )
    `
    )
    .eq("role", "trades")
    .or(
      "has_approved_intro_video.eq.true,intro_video_deadline.gt." +
        new Date().toISOString()
    )
    .limit(limit);

  const { data, error } = await query;
  if (error) throw error;

  let trades = data || [];

  // Filter by client interests if any
  if (interests.length > 0) {
    // We need to check if the trade's service_type_ids relate to the client's interested categories
    // For now, we include all trades and let the UI handle further filtering
    // This will be refined when we add an RPC for server-side interest matching
  }

  return trades;
}

/**
 * Enrich trade rows with distance from client location and intro video thumbnail
 */
function enrichWithDistance(trades, clientLat, clientLon) {
  return trades
    .filter((t) => t.base_lat != null && t.base_lon != null)
    .map((t) => {
      const distanceKm = haversineDistance(
        clientLat,
        clientLon,
        Number(t.base_lat),
        Number(t.base_lon)
      );
      return {
        ...t,
        distance_km: Math.round(distanceKm * 10) / 10,
        distance_miles:
          Math.round(distanceKm * 0.621371 * 10) / 10,
        stats: t.trade_performance_stats?.[0] || null,
      };
    });
}

/**
 * Section 1: Highest Rated Near You
 * Trades within their service radius of the client, with 3+ reviews, sorted by rating.
 *
 * @param {object} params
 * @param {number} params.lat - Client latitude
 * @param {number} params.lon - Client longitude
 * @param {string[]} params.interests - Client interest category IDs
 * @param {number} params.limit - Max results (default 10)
 * @returns {Promise<object[]>}
 */
export async function getHighestRatedNearby({
  lat,
  lon,
  interests = [],
  limit = 10,
}) {
  const trades = await fetchTradesWithStats({ interests, limit: 200 });
  const enriched = enrichWithDistance(trades, lat, lon);

  return enriched
    .filter((t) => {
      const radius = Number(t.service_radius_km) || 25;
      return t.distance_km <= radius;
    })
    .filter((t) => (t.stats?.review_count || 0) >= 3)
    .sort((a, b) => (b.stats?.average_rating || 0) - (a.stats?.average_rating || 0))
    .slice(0, limit);
}

/**
 * Section 2: Closest to You
 * Trades within their service radius, sorted by distance (helps surface newer trades).
 *
 * @param {object} params
 * @param {number} params.lat - Client latitude
 * @param {number} params.lon - Client longitude
 * @param {string[]} params.interests - Client interest category IDs
 * @param {number} params.limit - Max results (default 10)
 * @returns {Promise<object[]>}
 */
export async function getClosestTrades({
  lat,
  lon,
  interests = [],
  limit = 10,
}) {
  const trades = await fetchTradesWithStats({ interests, limit: 200 });
  const enriched = enrichWithDistance(trades, lat, lon);

  return enriched
    .filter((t) => {
      const radius = Number(t.service_radius_km) || 25;
      return t.distance_km <= radius;
    })
    .sort((a, b) => a.distance_km - b.distance_km)
    .slice(0, limit);
}

/**
 * Section 3: Willing to Travel
 * Trades outside normal service radius but within extended_radius_km.
 * Sorted by rating.
 *
 * @param {object} params
 * @param {number} params.lat - Client latitude
 * @param {number} params.lon - Client longitude
 * @param {string[]} params.interests - Client interest category IDs
 * @param {number} params.limit - Max results (default 10)
 * @returns {Promise<object[]>}
 */
export async function getWillingToTravel({
  lat,
  lon,
  interests = [],
  limit = 10,
}) {
  // Need to fetch trades that have extended radius set
  let query = supabase
    .from("profiles")
    .select(
      `
      id, full_name, business_name, trade_title, photo_url, town_city,
      base_lat, base_lon, service_radius_km, extended_radius_km, service_type_ids,
      has_approved_intro_video, intro_video_deadline,
      trade_performance_stats (
        average_rating, review_count, jobs_completed_count
      )
    `
    )
    .eq("role", "trades")
    .not("extended_radius_km", "is", null)
    .or(
      "has_approved_intro_video.eq.true,intro_video_deadline.gt." +
        new Date().toISOString()
    )
    .limit(200);

  const { data, error } = await query;
  if (error) throw error;

  const enriched = enrichWithDistance(data || [], lat, lon);

  return enriched
    .filter((t) => {
      const normalRadius = Number(t.service_radius_km) || 25;
      const extendedRadius = Number(t.extended_radius_km) || normalRadius;
      return t.distance_km > normalRadius && t.distance_km <= extendedRadius;
    })
    .sort((a, b) => (b.stats?.average_rating || 0) - (a.stats?.average_rating || 0))
    .slice(0, limit);
}

/**
 * Save or update client interests (service categories)
 * Replaces all existing interests with the new set.
 *
 * @param {string[]} serviceCategoryIds - Array of service_category_id UUIDs
 * @returns {Promise<boolean>}
 */
export async function setClientInterests(serviceCategoryIds = []) {
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError) throw authError;
  const uid = authData?.user?.id;
  if (!uid) throw new Error("Not signed in");

  // Delete existing interests
  const { error: deleteError } = await supabase
    .from("client_interests")
    .delete()
    .eq("client_id", uid);

  if (deleteError) throw deleteError;

  // Insert new interests
  if (serviceCategoryIds.length > 0) {
    const rows = serviceCategoryIds.map((catId) => ({
      client_id: uid,
      service_category_id: catId,
    }));

    const { error: insertError } = await supabase
      .from("client_interests")
      .insert(rows);

    if (insertError) throw insertError;
  }

  return true;
}

/**
 * Get the authenticated client's interest category IDs
 * @returns {Promise<string[]>}
 */
export async function getMyInterests() {
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError) throw authError;
  const uid = authData?.user?.id;
  if (!uid) return [];

  return getClientInterestIds(uid);
}

export default {
  getHighestRatedNearby,
  getClosestTrades,
  getWillingToTravel,
  setClientInterests,
  getMyInterests,
};
