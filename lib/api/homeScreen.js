// lib/api/homeScreen.js
// API functions for the client home screen
import * as SecureStore from "expo-secure-store";
import { supabase } from "../supabase";

const RECENT_SEARCHES_KEY = "settled_recent_searches";
const MAX_RECENT_SEARCHES = 5;

/**
 * Get recently completed projects for the feed
 * Falls back to direct query if RPC not available
 * @param {string} userRegion - Optional user's region for prioritization
 * @param {number} limit - Number of completions to fetch (default 3)
 * @returns {Promise<Array>} Array of completions or empty array
 */
export async function getRecentCompletions(userRegion = null, limit = 3) {
  try {
    // First try RPC function if it exists
    const { data: rpcData, error: rpcError } = await supabase.rpc(
      "get_recent_completions",
      { user_region: userRegion, limit_count: limit }
    );

    if (!rpcError && rpcData) {
      return rpcData;
    }

    // Fallback: Try query with join first to get service type and location
    const { data: joinData, error: joinError } = await supabase
      .from("tradify_native_app_db")
      .select(`
        id,
        project_title,
        updated_at,
        request_id,
        quote_requests (
          postcode,
          service_type_id,
          service_types (name)
        )
      `)
      .eq("status", "completed")
      .order("updated_at", { ascending: false })
      .limit(limit);

    // If join query works, use that data
    if (!joinError && joinData && joinData.length > 0) {
      return joinData.map((item) => {
        const serviceTypeName = item.quote_requests?.service_types?.name;
        const postcode = item.quote_requests?.postcode;
        const city = extractCityFromPostcode(postcode);

        // Extract clean service type - try service_types name first
        // If not available, extract from project_title (e.g., "Full kitchen refit" from "Name: Full kitchen refit in EH48")
        let cleanServiceType = serviceTypeName;
        if (!cleanServiceType && item.project_title) {
          cleanServiceType = extractServiceTypeFromTitle(item.project_title);
        }

        return {
          id: item.id,
          service_type: cleanServiceType || "Home improvement",
          city: city,
          completed_at: item.updated_at,
          rating: 5.0,
        };
      });
    }

    // Secondary fallback: Simple query without joins
    const { data, error } = await supabase
      .from("tradify_native_app_db")
      .select("id, project_title, updated_at")
      .eq("status", "completed")
      .order("updated_at", { ascending: false })
      .limit(limit);

    if (error) {
      console.warn("getRecentCompletions fallback error:", error.message);
      return [];
    }

    // Transform to expected format with defaults
    return (data || []).map((item) => ({
      id: item.id,
      service_type: extractServiceTypeFromTitle(item.project_title) || "Home improvement",
      city: "UK",
      completed_at: item.updated_at,
      rating: 5.0,
    }));
  } catch (e) {
    console.warn("getRecentCompletions error:", e.message);
    return [];
  }
}

/**
 * Extract a clean service type from a project title
 * Handles formats like "Name's Kitchen: Full kitchen refit in EH48 3NN"
 * Returns something like "Kitchen refit" or "Full kitchen refit"
 */
function extractServiceTypeFromTitle(title) {
  if (!title) return null;

  // If title contains a colon, take the part after it
  // e.g., "Ronan's Kitchen: Full kitchen refit in EH48 3NN" -> "Full kitchen refit in EH48 3NN"
  let cleaned = title;
  if (title.includes(":")) {
    cleaned = title.split(":")[1]?.trim() || title;
  }

  // Remove postcode patterns (UK postcodes like "EH48 3NN", "SW1A 1AA")
  cleaned = cleaned.replace(/\s+in\s+[A-Z]{1,2}\d{1,2}\s*\d?[A-Z]{0,2}$/i, "");
  cleaned = cleaned.replace(/\s+[A-Z]{1,2}\d{1,2}\s*\d?[A-Z]{0,2}$/i, "");

  // Trim and capitalize first letter
  cleaned = cleaned.trim();
  if (cleaned.length > 0) {
    cleaned = cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
  }

  // If result is too short or empty, return null to use default
  if (cleaned.length < 3) return null;

  return cleaned;
}

/**
 * Extract city name from UK postcode (rough approximation)
 * In production, this would use a proper postcode lookup
 */
function extractCityFromPostcode(postcode) {
  if (!postcode) return "UK";

  // Common UK postcode area to city mappings
  const areaMap = {
    EH: "Edinburgh",
    G: "Glasgow",
    AB: "Aberdeen",
    DD: "Dundee",
    FK: "Falkirk",
    KY: "Fife",
    PA: "Paisley",
    ML: "Motherwell",
    KA: "Kilmarnock",
    DG: "Dumfries",
    TD: "Borders",
    IV: "Inverness",
    PH: "Perth",
    HS: "Western Isles",
    ZE: "Shetland",
    KW: "Caithness",
    // England
    M: "Manchester",
    L: "Liverpool",
    B: "Birmingham",
    LS: "Leeds",
    S: "Sheffield",
    NE: "Newcastle",
    BS: "Bristol",
    SW: "London",
    SE: "London",
    E: "London",
    N: "London",
    W: "London",
    NW: "London",
    EC: "London",
    WC: "London",
  };

  const area = postcode.replace(/[0-9]/g, "").trim().toUpperCase();

  for (const [prefix, city] of Object.entries(areaMap)) {
    if (area.startsWith(prefix)) {
      return city;
    }
  }

  return "UK";
}

/**
 * Get client's active quote requests
 * @param {string} clientId - Client's user ID
 * @returns {Promise<Array>} Array of active requests or empty array
 */
export async function getClientActiveRequests(clientId) {
  if (!clientId) {
    return [];
  }

  try {
    // First try RPC function if it exists
    const { data: rpcData, error: rpcError } = await supabase.rpc(
      "get_client_active_requests",
      { client_uuid: clientId }
    );

    if (!rpcError && rpcData) {
      return rpcData;
    }

    // Fallback: Direct query
    const { data: requests, error } = await supabase
      .from("quote_requests")
      .select(`
        id,
        suggested_title,
        status,
        created_at,
        service_types (id, name),
        service_categories (id, name)
      `)
      .eq("requester_id", clientId)
      .not("status", "in", "(completed,cancelled,expired)")
      .order("created_at", { ascending: false })
      .limit(3);

    if (error) {
      console.warn("getClientActiveRequests fallback error:", error.message);
      return [];
    }

    // For each request, get quote counts and filter out completed projects
    const enrichedRequests = await Promise.all(
      (requests || []).map(async (req) => {
        // Get quotes for this request
        const { data: quotes } = await supabase
          .from("tradify_native_app_db")
          .select("id, grand_total, status")
          .eq("request_id", req.id);

        // Check if any quote is in a "done" state (completed, declined, expired)
        const doneStatuses = ["completed", "declined", "expired"];
        const hasDoneQuote = (quotes || []).some(q =>
          doneStatuses.includes(q.status)
        );

        // Skip this request if it has any completed/done quotes
        if (hasDoneQuote) {
          return null;
        }

        // Get request targets count
        const { count: targetsCount } = await supabase
          .from("request_targets")
          .select("id", { count: "exact", head: true })
          .eq("request_id", req.id);

        const receivedQuotes = (quotes || []).filter(q =>
          q.status && !["draft", "withdrawn"].includes(q.status)
        );

        const quoteTotals = receivedQuotes
          .map(q => q.grand_total)
          .filter(t => t != null && !isNaN(t));

        return {
          id: req.id,
          suggested_title: req.suggested_title,
          service_type: req.service_types?.name,
          category: req.service_categories?.name,
          status: req.status,
          created_at: req.created_at,
          quotes_received: receivedQuotes.length,
          total_invited: targetsCount || 0,
          lowest_quote: quoteTotals.length > 0 ? Math.min(...quoteTotals) : null,
          highest_quote: quoteTotals.length > 0 ? Math.max(...quoteTotals) : null,
        };
      })
    );

    // Filter out null entries (completed projects) and return
    return enrichedRequests.filter(req => req !== null);
  } catch (e) {
    console.warn("getClientActiveRequests error:", e.message);
    return [];
  }
}

/**
 * Save a search term to recent searches
 * @param {string} term - Search term to save
 */
export async function saveRecentSearch(term) {
  if (!term || typeof term !== "string") return;

  const trimmed = term.trim();
  if (!trimmed) return;

  try {
    const existing = await getRecentSearches();

    // Remove if already exists (will be moved to front)
    const filtered = existing.filter(
      (s) => s.toLowerCase() !== trimmed.toLowerCase()
    );

    // Add to front and limit to max
    const updated = [trimmed, ...filtered].slice(0, MAX_RECENT_SEARCHES);

    await SecureStore.setItemAsync(RECENT_SEARCHES_KEY, JSON.stringify(updated));
  } catch (e) {
    console.warn("saveRecentSearch error:", e.message);
  }
}

/**
 * Get recent searches
 * @returns {Promise<Array>} Array of search terms or empty array
 */
export async function getRecentSearches() {
  try {
    const stored = await SecureStore.getItemAsync(RECENT_SEARCHES_KEY);
    if (!stored) return [];

    const parsed = JSON.parse(stored);
    if (!Array.isArray(parsed)) return [];

    return parsed;
  } catch (e) {
    console.warn("getRecentSearches error:", e.message);
    return [];
  }
}

/**
 * Clear all recent searches
 */
export async function clearRecentSearches() {
  try {
    await SecureStore.deleteItemAsync(RECENT_SEARCHES_KEY);
  } catch (e) {
    console.warn("clearRecentSearches error:", e.message);
  }
}

/**
 * Get user's first name from profile
 * @param {string} userId - User's ID
 * @returns {Promise<string|null>} First name or null
 */
export async function getUserFirstName(userId) {
  if (!userId) return null;

  try {
    const { data, error } = await supabase
      .from("profiles")
      .select("first_name, full_name")
      .eq("id", userId)
      .single();

    if (error || !data) return null;

    // Try first_name first, then extract from full_name
    if (data.first_name) return data.first_name;
    if (data.full_name) {
      return data.full_name.split(" ")[0];
    }

    return null;
  } catch (e) {
    console.warn("getUserFirstName error:", e.message);
    return null;
  }
}
