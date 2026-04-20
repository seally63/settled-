// lib/api/directRequest.js
import { supabase, auth } from "../supabase";
import { geocodeUKPostcode } from "./places";

// Haversine formula to calculate distance between two lat/lon points in kilometers
function haversineDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; // Earth's radius in kilometers
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) *
      Math.cos(lat2 * (Math.PI / 180)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Check if a client's postcode is within a trade's service area.
 * Returns distance info and whether the location is outside the service radius.
 *
 * @param {string} tradeId - The trade's profile ID
 * @param {string} clientPostcode - The client's postcode
 * @returns {Promise<{
 *   isOutsideServiceArea: boolean,
 *   distanceKm: number | null,
 *   distanceMiles: number | null,
 *   tradePostcode: string | null,
 *   tradeCity: string | null,
 *   serviceRadiusKm: number | null,
 *   serviceRadiusMiles: number | null,
 * }>}
 */
export async function checkServiceAreaDistance(tradeId, clientPostcode) {
  try {
    // 1) Get the trade's location and service radius
    const { data: trade, error: tradeErr } = await supabase
      .from("profiles")
      .select("base_lat, base_lon, base_postcode, town_city, service_radius_km")
      .eq("id", tradeId)
      .single();

    if (tradeErr || !trade) {
      console.log("checkServiceAreaDistance: Trade not found", tradeErr);
      return {
        isOutsideServiceArea: false,
        distanceKm: null,
        distanceMiles: null,
        tradePostcode: null,
        tradeCity: null,
        serviceRadiusKm: null,
        serviceRadiusMiles: null,
      };
    }

    // If trade has no base location, we can't check distance
    if (trade.base_lat == null || trade.base_lon == null) {
      return {
        isOutsideServiceArea: false,
        distanceKm: null,
        distanceMiles: null,
        tradePostcode: trade.base_postcode || null,
        tradeCity: trade.town_city || null,
        serviceRadiusKm: trade.service_radius_km || null,
        serviceRadiusMiles: trade.service_radius_km
          ? Math.round(trade.service_radius_km * 0.621371)
          : null,
      };
    }

    // 2) Geocode the client's postcode
    const clientLocation = await geocodeUKPostcode(clientPostcode);
    if (!clientLocation || clientLocation.latitude == null) {
      console.log("checkServiceAreaDistance: Could not geocode client postcode");
      return {
        isOutsideServiceArea: false,
        distanceKm: null,
        distanceMiles: null,
        tradePostcode: trade.base_postcode || null,
        tradeCity: trade.town_city || null,
        serviceRadiusKm: trade.service_radius_km || null,
        serviceRadiusMiles: trade.service_radius_km
          ? Math.round(trade.service_radius_km * 0.621371)
          : null,
      };
    }

    // 3) Calculate distance
    const distanceKm = haversineDistance(
      trade.base_lat,
      trade.base_lon,
      clientLocation.latitude,
      clientLocation.longitude
    );

    // Default service radius to 40km if not set
    const serviceRadiusKm = trade.service_radius_km ?? 40;
    const isOutsideServiceArea = distanceKm > serviceRadiusKm;

    return {
      isOutsideServiceArea,
      distanceKm: Math.round(distanceKm * 10) / 10, // Round to 1 decimal
      distanceMiles: Math.round(distanceKm * 0.621371 * 10) / 10,
      tradePostcode: trade.base_postcode || null,
      tradeCity: trade.town_city || null,
      serviceRadiusKm,
      serviceRadiusMiles: Math.round(serviceRadiusKm * 0.621371),
    };
  } catch (e) {
    console.log("checkServiceAreaDistance error:", e?.message || e);
    return {
      isOutsideServiceArea: false,
      distanceKm: null,
      distanceMiles: null,
      tradePostcode: null,
      tradeCity: null,
      serviceRadiusKm: null,
      serviceRadiusMiles: null,
    };
  }
}

/**
 * Create a direct quote request (client -> trade).
 * Persists: requester_id, status='open', details, suggested_title, budget_band, postcode
 * Then inserts request_targets with invited_by='client', state='invited'.
 *
 * Returns: { request_id }
 */
export async function requestDirectQuote(tradeId, opts = {}) {
  const { data: authData, error: authErr } = await auth.getUser();
  if (authErr) throw authErr;
  const uid = authData?.user?.id;
  if (!uid) throw new Error("Please sign in to request a quote.");
  if (!tradeId) throw new Error("Missing tradeId.");

  const details = opts?.details ?? null;
  const suggested_title = opts?.suggested_title ?? null;
  const budget_band = opts?.budget_band ?? null;
  const postcode = (opts?.postcode || opts?.job_outcode || "").toUpperCase() || null;
  const outsideServiceArea = opts?.outsideServiceArea ?? false;
  const distanceMiles = opts?.distanceMiles ?? null;

  // V2 wizard sends a service_type_id — persist it so the trade inbox
  // can show the proper service name + service-type icon (otherwise it
  // falls back to "Project" + the generic icon).
  // (category_id / property_type_id / timing_option_id are also sent by
  // the wizard but their columns aren't part of the legacy schema; if
  // you add them later, extend insertRow here.)
  const service_type_id = opts?.service_type_id ?? null;

  const insertRow = {
    requester_id: uid,
    status: "open",
    details,
    suggested_title,
    budget_band,
    postcode,
    is_direct: true,
  };
  if (service_type_id) insertRow.service_type_id = service_type_id;

  const { data: req, error: reqErr } = await supabase
    .from("quote_requests")
    .insert([insertRow])
    .select("id")
    .single();

  if (reqErr) {
    const msg = (reqErr.message || "");
    const msgLower = msg.toLowerCase();

    // Check for our new limit error format: LIMIT_REACHED:TYPE:message
    if (msg.includes("LIMIT_REACHED:")) {
      const parts = msg.split(":");
      const userMessage = parts.slice(2).join(":").trim();
      throw new Error(userMessage || "You've reached your request limit.");
    }

    // Legacy error format support
    if (msgLower.includes("3 open requests") || msgLower.includes("limit")) {
      throw new Error(
        "You've reached your request limit. Wait for quotes to come in or for a trade to respond."
      );
    }
    if (msgLower.includes("budget_band")) {
      throw new Error("Invalid budget selection.");
    }
    if (msgLower.includes("postcode")) {
      throw new Error("Invalid postcode.");
    }
    throw reqErr;
  }

  // 2) invite the chosen trade
  const targetRow = {
    request_id: req.id,
    trade_id: tradeId,
    invited_by: "client",
    state: "invited",
  };

  // Add outside_service_area flag and distance if the client is outside the trade's service radius
  if (outsideServiceArea) {
    targetRow.outside_service_area = true;
    if (distanceMiles != null) {
      targetRow.distance_miles = distanceMiles;
    }
  }

  const { error: tgtErr } = await supabase.from("request_targets").insert([targetRow]);

  if (tgtErr) {
    const m = (tgtErr.message || "").toLowerCase();
    if (m.includes("max 2") || m.includes("direct request")) {
      throw new Error("You already have 2 active direct requests to this trade.");
    }
    throw tgtErr;
  }

  return { request_id: req.id };
}

/** Optional legacy alias */
export const directRequestToTrade = requestDirectQuote;

