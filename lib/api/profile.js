// lib/api/profile.js
// Public trades list/detail + self profile helpers (+ proximity RPC helpers)
// Adjust the supabase import path if yours differs.
import { supabase } from "../supabase";
import { geocodeUKPostcode } from './places';

// Validation constants
const PROFILE_VALIDATION = {
  FULL_NAME_MAX: 100,
  BUSINESS_NAME_MAX: 150,
  BIO_MAX: 1000,
  TRADE_TITLE_MAX: 100,
  PHONE_PATTERN: /^(\+44|0)7\d{9}$/, // UK mobile: +447XXXXXXXXX or 07XXXXXXXXX
  POSTCODE_PATTERN: /^[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}$/i, // UK postcode
};

/**
 * Validate and sanitize profile fields
 * @param {Object} patch - Fields to validate
 * @returns {Object} - Validated and trimmed fields
 * @throws {Error} - If validation fails
 */
function validateProfileFields(patch) {
  const validated = {};

  if (patch.full_name !== undefined) {
    const trimmed = String(patch.full_name || "").trim();
    if (trimmed.length > PROFILE_VALIDATION.FULL_NAME_MAX) {
      throw new Error(`Full name must be ${PROFILE_VALIDATION.FULL_NAME_MAX} characters or less.`);
    }
    validated.full_name = trimmed;
  }

  if (patch.business_name !== undefined) {
    const trimmed = String(patch.business_name || "").trim();
    if (trimmed.length > PROFILE_VALIDATION.BUSINESS_NAME_MAX) {
      throw new Error(`Business name must be ${PROFILE_VALIDATION.BUSINESS_NAME_MAX} characters or less.`);
    }
    validated.business_name = trimmed;
  }

  if (patch.bio !== undefined) {
    const trimmed = String(patch.bio || "").trim();
    if (trimmed.length > PROFILE_VALIDATION.BIO_MAX) {
      throw new Error(`Bio must be ${PROFILE_VALIDATION.BIO_MAX} characters or less.`);
    }
    validated.bio = trimmed;
  }

  if (patch.trade_title !== undefined) {
    const trimmed = String(patch.trade_title || "").trim();
    if (trimmed.length > PROFILE_VALIDATION.TRADE_TITLE_MAX) {
      throw new Error(`Trade title must be ${PROFILE_VALIDATION.TRADE_TITLE_MAX} characters or less.`);
    }
    validated.trade_title = trimmed;
  }

  if (patch.phone !== undefined) {
    // Normalize phone: remove spaces and validate
    const normalized = String(patch.phone || "").replace(/\s+/g, "").trim();
    if (normalized && !PROFILE_VALIDATION.PHONE_PATTERN.test(normalized)) {
      throw new Error("Please enter a valid UK mobile number (e.g., 07123456789 or +447123456789).");
    }
    validated.phone = normalized || null;
  }

  // Pass through other allowed fields without length validation
  if (patch.service_areas !== undefined) {
    validated.service_areas = String(patch.service_areas || "").trim();
  }

  if (patch.photo_url !== undefined) {
    validated.photo_url = patch.photo_url;
  }

  if (patch.job_titles !== undefined) {
    validated.job_titles = patch.job_titles;
  }

  if (patch.service_type_ids !== undefined) {
    validated.service_type_ids = patch.service_type_ids;
  }

  return validated;
}

/** Small helper to get the current user id */
async function getUserId() {
  const { data, error } = await supabase.auth.getUser();
  if (error) throw error;
  return data?.user?.id || null;
}

/** Role of current user ("client" | "trades" | null) */
export async function getMyRole() {
  const uid = await getUserId();
  if (!uid) return null;
  const { data, error } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", uid)
    .maybeSingle();
  if (error) throw error;
  return data?.role ?? null;
}

/** Read my (private) profile with full columns (uses SECURITY DEFINER RPC) */
export async function getMyProfile() {
  const uid = await getUserId();
  if (!uid) return null;
  const { data, error } = await supabase.rpc("get_my_profile");
  if (error) throw error;
  if (!data) return null;

  // Normalize: always expose `phone` (not phone_number)
  // Note: The city column is "town_city" in the database schema
  return { ...data, phone: data.phone ?? null };
}

/** Update my profile (safe fields only). Uses RLS + column-level UPDATE grants. */
export async function updateMyProfile(patch = {}) {
  const uid = await getUserId();
  if (!uid) throw new Error("Not signed in");

  // Only allow updating whitelisted fields (keep it strict)
  // SECURITY: Explicitly exclude 'role', 'is_admin', 'id', 'created_at'
  const allowed = [
    "full_name",
    "phone",          // NOTE: DB column is `phone`
    "business_name",
    "trade_title",
    "bio",
    "service_areas",  // still supported if you want to show a sentence
    "photo_url",
    "job_titles",     // TEXT[] array of job titles (max 3)
    "service_type_ids", // INTEGER[] array of service_type IDs for matching quote requests
  ];

  // Filter to allowed fields first
  const filtered = {};
  for (const k of allowed) {
    if (patch[k] !== undefined) filtered[k] = patch[k];
  }
  if (Object.keys(filtered).length === 0) return { ok: true };

  // Validate and sanitize the filtered fields
  const clean = validateProfileFields(filtered);
  if (Object.keys(clean).length === 0) return { ok: true };

  const { data, error } = await supabase
    .from("profiles")
    .update(clean)
    .eq("id", uid)
    .select()
    .maybeSingle();

  if (error) throw error;
  return data ? { ...data, phone: data.phone ?? null } : null;
}

/* ============================================================================
   Proximity helpers (call your RPCs)
   - rpc_update_base_address_once(p_address_line1, p_town_city, p_postcode, p_lat, p_lon)
   - rpc_update_service_radius(p_km)
   ==========================================================================*/

/** One-time base address setter. Throws if already set (enforced by RPC). */
export async function setBaseAddressOnce({ addr1, city, postcode, lat, lon }) {
  const uid = await getUserId();
  if (!uid) throw new Error("Not signed in");

  const payload = {
    p_address_line1: (addr1 || "").trim(),
    p_town_city: (city || "").trim(),
    p_postcode: (postcode || "").trim(),
    p_lat: Number(lat),
    p_lon: Number(lon),
  };

  // IMPORTANT: match your SQL function name exactly
  const { data, error } = await supabase.rpc("rpc_update_base_address_once", payload);
  if (error) throw error;
  return data ?? true;
}

/** Update the service radius in km (server clamps to sensible min/max). */
export async function updateServiceRadius(km) {
  const uid = await getUserId();
  if (!uid) throw new Error("Not signed in");

  const v = Number.isFinite(Number(km)) ? Number(km) : 25;
  const { data, error } = await supabase.rpc("rpc_update_service_radius", { p_km: v });
  if (error) throw error;
  return data ?? true;
}

/**
 * Update extended travel radius settings for higher-budget jobs
 * @param {number|null} extendedRadiusKm - Extended travel radius in km (null to disable)
 * @param {string|null} minBudget - Minimum budget band: '<£3k', '£3k–£9k', '£9k+' (null to disable)
 */
export async function updateExtendedTravel(extendedRadiusKm, minBudget) {
  const uid = await getUserId();
  if (!uid) throw new Error("Not signed in");

  const radiusKm = extendedRadiusKm != null && Number.isFinite(Number(extendedRadiusKm))
    ? Number(extendedRadiusKm)
    : null;

  const { data, error } = await supabase.rpc("rpc_update_extended_travel", {
    p_extended_radius_km: radiusKm,
    p_extended_radius_min_budget: minBudget || null,
  });

  if (error) throw error;
  return data ?? true;
}

/** Small convenience helper if you need to gate flows until base is set. */
export async function hasBaseAddress() {
  const p = await getMyProfile();
  return !!(p?.base_postcode && p?.base_lat != null && p?.base_lon != null);
}

/**
 * Set or update a client's location (postcode + derived lat/lon/town).
 * Clients can update this freely (unlike trades, where base address is one-time).
 * @param {object} params
 * @param {string} params.postcode - UK postcode
 * @param {number} params.lat - Latitude
 * @param {number} params.lon - Longitude
 * @param {string} params.town - Town/city name (optional)
 */
export async function setClientLocation({ postcode, lat, lon, town = null }) {
  const uid = await getUserId();
  if (!uid) throw new Error("Not signed in");

  // Writes to the client-specific home_* columns (added in migration
  // 20260429). The legacy base_* columns are reserved for trade
  // business locations and no longer reused here. The migration
  // backfilled home_* from base_* for existing clients, so reads
  // falling through to base_* (see getClientLocation below) keep
  // working for anyone who registered before this split landed.
  const payload = {
    home_postcode: String(postcode || "").trim().toUpperCase(),
    home_lat: Number(lat),
    home_lon: Number(lon),
  };
  if (town) payload.town_city = String(town).trim();

  const { data, error } = await supabase
    .from("profiles")
    .update(payload)
    .eq("id", uid)
    .select("id, home_postcode, home_lat, home_lon, town_city")
    .maybeSingle();

  if (error) throw error;
  return data;
}

/**
 * Resolve the client's browse-feed location from a profile row.
 * Prefers the new home_* columns; falls back to base_* so legacy
 * clients who still have their postcode stored under the old
 * columns (pre-migration) keep getting a feed.
 *
 * @param {object} profile - profile row returned by getMyProfile
 * @returns {{ postcode: string|null, lat: number|null, lon: number|null }}
 */
export function getClientLocation(profile) {
  if (!profile) return { postcode: null, lat: null, lon: null };
  const postcode = profile.home_postcode || profile.base_postcode || null;
  const lat =
    profile.home_lat != null
      ? Number(profile.home_lat)
      : profile.base_lat != null
      ? Number(profile.base_lat)
      : null;
  const lon =
    profile.home_lon != null
      ? Number(profile.home_lon)
      : profile.base_lon != null
      ? Number(profile.base_lon)
      : null;
  return { postcode, lat, lon };
}

/* ===== Intro Video Status (V2) ============================================= */

/**
 * Get the intro video status for the authenticated trade
 * @returns {Promise<object>} { hasApprovedVideo, deadline, isWithinGracePeriod, daysRemaining }
 */
export async function getIntroVideoStatus() {
  const uid = await getUserId();
  if (!uid) return null;

  const { data, error } = await supabase
    .from("profiles")
    .select("has_approved_intro_video, intro_video_deadline, intro_video_post_id")
    .eq("id", uid)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  const now = new Date();
  const deadline = data.intro_video_deadline
    ? new Date(data.intro_video_deadline)
    : null;
  const isWithinGracePeriod = deadline ? deadline > now : false;
  const daysRemaining = deadline
    ? Math.max(0, Math.ceil((deadline - now) / (1000 * 60 * 60 * 24)))
    : null;

  return {
    hasApprovedVideo: data.has_approved_intro_video === true,
    deadline: data.intro_video_deadline,
    introVideoPostId: data.intro_video_post_id,
    isWithinGracePeriod,
    daysRemaining,
  };
}

/**
 * Set the intro video deadline for a trade (called during onboarding)
 * Sets deadline to 7 days from now.
 * @returns {Promise<boolean>}
 */
export async function setIntroVideoDeadline() {
  const uid = await getUserId();
  if (!uid) throw new Error("Not signed in");

  const deadline = new Date();
  deadline.setDate(deadline.getDate() + 7);

  const { error } = await supabase
    .from("profiles")
    .update({ intro_video_deadline: deadline.toISOString() })
    .eq("id", uid);

  if (error) throw error;
  return true;
}

/* ===== PUBLIC trade list/detail (unchanged) ================================= */

export async function listPublicTrades({ limit = 20, offset = 0 } = {}) {
  const columns =
    "id, full_name, business_name, trade_title, bio, service_areas, photo_url, created_at, role";
  const { data, error } = await supabase
    .from("profiles")
    .select(columns)
    .eq("role", "trades")
    .eq("approval_status", "approved")
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);
  if (error) throw error;
  return data || [];
}

export async function getTradePublicById(id) {
  // Note: verification data is fetched separately via getBusinessVerificationPublic()
  // Note: review_count and average_rating are fetched via getTradePublicMetrics90d() or reviews table
  // Note: The city column is "town_city" in the database schema
  const columns =
    "id, full_name, business_name, trade_title, bio, service_areas, photo_url, created_at, role, base_postcode, town_city, service_radius_km, job_titles, service_type_ids";
  const { data, error } = await supabase
    .from("profiles")
    .select(columns)
    .eq("id", id)
    .eq("role", "trades")
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

/* ===== Backward-compat aliases (so your existing imports keep working) ===== */

export const listTrades = listPublicTrades;
export const getTradeById = getTradePublicById;

// Search validation
const SEARCH_MAX_LENGTH = 200;

/**
 * Search trades by business name, full name, or trade title
 * @param {string} query - Search query (min 2 characters, max 200)
 * @param {number} limit - Max results (default: 10, max: 50)
 * @returns {Promise<Array>} Array of matching trades
 */
export async function searchTrades(query, limit = 10) {
  if (!query || typeof query !== "string") return [];

  // Trim and limit query length
  const normalized = query.toLowerCase().trim().slice(0, SEARCH_MAX_LENGTH);

  if (normalized.length < 2) return [];

  // Sanitize limit
  const safeLimit = Math.min(Math.max(Number(limit) || 10, 1), 50);

  const columns =
    "id, full_name, business_name, trade_title, photo_url, town_city";

  const { data, error } = await supabase
    .from("profiles")
    .select(columns)
    .eq("role", "trades")
    .eq("approval_status", "approved")
    .or(
      `business_name.ilike.%${normalized}%,full_name.ilike.%${normalized}%,trade_title.ilike.%${normalized}%`
    )
    .limit(safeLimit);

  if (error) throw error;
  return data || [];
}

/* ============================================================================
   Trade Matching - Find trades that serve a client's location
   Uses only base_lat/base_lon + service_radius_km (Option A - simplified matching)
   ==========================================================================*/

/**
 * Find trades that serve a specific postcode area
 * Uses the client's postcode to find trades within their travel radius
 *
 * @param {string} postcode - Client's UK postcode
 * @param {object} options - Search options
 * @param {string} options.tradeType - Filter by trade type (optional)
 * @param {number} options.limit - Max results (default: 50)
 * @returns {Promise<Array>} Array of matching trades with distance
 */
export async function findTradesNearPostcode(postcode, options = {}) {
  const { tradeType = null, limit = 50 } = options;

  // First, geocode the client's postcode
  const location = await geocodeUKPostcode(postcode);
  if (!location) {
    throw new Error('Invalid postcode. Please enter a valid UK postcode.');
  }

  // Call the RPC function
  const { data, error } = await supabase.rpc('find_trades_near_location', {
    p_lat: location.latitude,
    p_lon: location.longitude,
    p_trade_type: tradeType,
    p_limit: limit,
  });

  if (error) throw error;

  // Add formatted distance to results
  return (data || []).map(trade => ({
    ...trade,
    distance_miles: trade.distance_km
      ? Math.round(trade.distance_km * 0.621371 * 10) / 10 // Convert km to miles, 1 decimal
      : null,
  }));
}

/**
 * Find trades near specific coordinates
 * Use this if you already have lat/lng (e.g., from Photon search)
 *
 * @param {number} latitude - Latitude
 * @param {number} longitude - Longitude
 * @param {object} options - Search options
 * @returns {Promise<Array>} Array of matching trades with distance
 */
export async function findTradesNearLocation(latitude, longitude, options = {}) {
  const { tradeType = null, limit = 50 } = options;

  const { data, error } = await supabase.rpc('find_trades_near_location', {
    p_lat: latitude,
    p_lon: longitude,
    p_trade_type: tradeType,
    p_limit: limit,
  });

  if (error) throw error;

  return (data || []).map(trade => ({
    ...trade,
    distance_miles: trade.distance_km
      ? Math.round(trade.distance_km * 0.621371 * 10) / 10
      : null,
  }));
}






