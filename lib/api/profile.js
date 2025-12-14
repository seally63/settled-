// lib/api/profile.js
// Public trades list/detail + self profile helpers (+ proximity RPC helpers)
// Adjust the supabase import path if yours differs.
import { supabase } from "../supabase";

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
  // Normalize: always expose `phone` (not phone_number)
  return data ? { ...data, phone: data.phone ?? null } : null;
}

/** Update my profile (safe fields only). Uses RLS + column-level UPDATE grants. */
export async function updateMyProfile(patch = {}) {
  const uid = await getUserId();
  if (!uid) throw new Error("Not signed in");

  // Only allow updating whitelisted fields (keep it strict)
  const allowed = [
    "full_name",
    "phone",          // NOTE: DB column is `phone`
    "business_name",
    "trade_title",
    "bio",
    "service_areas",  // still supported if you want to show a sentence
    "photo_url",
  ];
  const clean = {};
  for (const k of allowed) {
    if (patch[k] !== undefined) clean[k] = patch[k];
  }
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

/** Small convenience helper if you need to gate flows until base is set. */
export async function hasBaseAddress() {
  const p = await getMyProfile();
  return !!(p?.base_postcode && p?.base_lat != null && p?.base_lon != null);
}

/* ===== PUBLIC trade list/detail (unchanged) ================================= */

export async function listPublicTrades({ limit = 20, offset = 0 } = {}) {
  const columns =
    "id, full_name, business_name, trade_title, bio, service_areas, photo_url, created_at, role";
  const { data, error } = await supabase
    .from("profiles")
    .select(columns)
    .eq("role", "trades")
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);
  if (error) throw error;
  return data || [];
}

export async function getTradePublicById(id) {
  const columns =
    "id, full_name, business_name, trade_title, bio, service_areas, photo_url, created_at, role";
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






