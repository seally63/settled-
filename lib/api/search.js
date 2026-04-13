// lib/api/search.js
import { supabase } from "../supabase";

/**
 * Find public trade profiles near a given lat/lon.
 * Server returns only safe columns plus distance_km.
 */
export async function listPublicTradesNear({ lat, lon, maxKm = 25, limit = 20, offset = 0 }) {
  const { data, error } = await supabase.rpc("rpc_find_trades_near", {
    p_lat: lat,
    p_lon: lon,
    p_max_km: maxKm,
    p_limit: limit + offset + 20, // fetch extra to account for filtered-out unapproved trades
    p_offset: 0,
  });
  if (error) throw error;
  // Post-filter: only show approved trades
  const approved = (data || []).filter((t) => t.approval_status === "approved");
  return approved.slice(offset, offset + limit);
}

/**
 * UK-only: geocode a postcode (no key).
 * Feed result (lat/lon) into listPublicTradesNear.
 * Returns: { lat, lon, outward, city } - city is the admin_district (town/city name)
 */
/**
 * Find trades for the discovery feed with flexible sorting and filtering.
 * Uses client-side Haversine distance calculation (matching directRequest.js pattern).
 *
 * @param {object} params
 * @param {number} params.lat - Client latitude
 * @param {number} params.lon - Client longitude
 * @param {number} params.maxKm - Maximum distance in km (default 50)
 * @param {number} params.minReviews - Minimum review count (default 0)
 * @param {string} params.sortBy - "rating" | "distance" (default "distance")
 * @param {number} params.limit - Max results (default 20)
 * @param {number} params.offset - Offset for pagination (default 0)
 * @returns {Promise<object[]>}
 */
export async function listTradesForFeed({
  lat,
  lon,
  maxKm = 50,
  minReviews = 0,
  sortBy = "distance",
  limit = 20,
  offset = 0,
}) {
  const { data, error } = await supabase.rpc("rpc_find_trades_near", {
    p_lat: lat,
    p_lon: lon,
    p_max_km: maxKm,
    p_limit: limit + offset, // Fetch enough to handle offset
    p_offset: 0,
  });
  if (error) throw error;

  // Post-filter: only show approved trades
  let results = (data || []).filter((t) => t.approval_status === "approved");

  // Filter by minimum reviews if specified
  if (minReviews > 0) {
    results = results.filter((t) => (t.review_count || 0) >= minReviews);
  }

  // Sort
  if (sortBy === "rating") {
    results.sort((a, b) => (b.average_rating || 0) - (a.average_rating || 0));
  }
  // Default "distance" sort is already handled by the RPC

  // Apply offset and limit
  return results.slice(offset, offset + limit);
}

/**
 * UK-only: geocode a postcode (no key).
 * Feed result (lat/lon) into listPublicTradesNear.
 * Returns: { lat, lon, outward, city } - city is the admin_district (town/city name)
 */
export async function geocodeUkPostcode(postcode) {
  const pc = String(postcode || "").trim();
  if (!pc) throw new Error("Postcode required");
  const res = await fetch(`https://api.postcodes.io/postcodes/${encodeURIComponent(pc)}`);
  if (!res.ok) throw new Error("Postcode not found");
  const json = await res.json();
  if (!json?.result) throw new Error("Invalid postcode");
  return {
    lat: json.result.latitude,
    lon: json.result.longitude,
    outward: json.result.outcode,
    city: json.result.admin_district || json.result.parish || null, // town/city name
  };
}
