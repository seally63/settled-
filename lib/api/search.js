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
    p_limit: limit,
    p_offset: offset,
  });
  if (error) throw error;
  return data || [];
}

/**
 * UK-only: geocode a postcode (no key).
 * Feed result (lat/lon) into listPublicTradesNear.
 */
export async function geocodeUkPostcode(postcode) {
  const pc = String(postcode || "").trim();
  if (!pc) throw new Error("Postcode required");
  const res = await fetch(`https://api.postcodes.io/postcodes/${encodeURIComponent(pc)}`);
  if (!res.ok) throw new Error("Postcode not found");
  const json = await res.json();
  if (!json?.result) throw new Error("Invalid postcode");
  return { lat: json.result.latitude, lon: json.result.longitude, outward: json.result.outcode };
}
