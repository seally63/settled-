// supabase/functions/match-trades/index.ts
// Deno Edge Function: auto-target trades for a quote request

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.3";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!; // service role (bypasses RLS)

const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

type Payload = {
  request_id: string;    // the quote_requests.id
  limit?: number;        // optional: how many to target (default 5)
};

// Budget band comparison for extended radius matching
// Returns true if clientBudget >= tradeBudget
function budgetMeetsMinimum(clientBudget: string | null, tradeMinBudget: string | null): boolean {
  if (!clientBudget || !tradeMinBudget) return false;

  // Budget band order (lowest to highest)
  const budgetOrder: Record<string, number> = {
    "<£3k": 1,           // Legacy value - kept for backwards compatibility
    "£3k–£5k": 2,
    "£3k–£9k": 2,        // Legacy value - maps to same level as £3k–£5k
    "£6k–£9k": 3,
    "£9k+": 4,           // Legacy value - maps to same level as £10k–£15k
    "£10k–£15k": 4,
    "£15k+": 5,
  };

  const clientLevel = budgetOrder[clientBudget] ?? 0;
  const tradeLevel = budgetOrder[tradeMinBudget] ?? 0;

  return clientLevel >= tradeLevel;
}

// Haversine formula to calculate distance between two lat/lon points in kilometers
function haversineDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
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

serve(async (req) => {
  const LOG_PREFIX = "[MATCH-TRADES-DEBUG]";

  try {
    if (req.method !== "POST") {
      return new Response(JSON.stringify({ error: "Use POST" }), { status: 405 });
    }

    const { request_id, limit } = await req.json() as Payload;
    console.log(`${LOG_PREFIX} Starting match for request_id=${request_id}, limit=${limit}`);

    if (!request_id) {
      return new Response(JSON.stringify({ error: "request_id is required" }), { status: 400 });
    }
    const maxTargets = Math.min(Math.max(limit ?? 5, 1), 5); // clamp 1..5

    // 1) Load the request (ensure it's open) including location data and budget
    const { data: reqRow, error: reqErr } = await supabaseAdmin
      .from("quote_requests")
      .select("id, requester_id, status, closed_reason, location_lat, location_lon, budget_band")
      .eq("id", request_id)
      .single();
    if (reqErr || !reqRow) {
      return new Response(JSON.stringify({ error: "Request not found" }), { status: 404 });
    }
    if (reqRow.closed_reason || reqRow.status === "closed") {
      return new Response(JSON.stringify({ error: "Request is already closed" }), { status: 409 });
    }

    const clientLat = reqRow.location_lat;
    const clientLon = reqRow.location_lon;
    const clientBudget = reqRow.budget_band;

    console.log(`${LOG_PREFIX} Client location: lat=${clientLat}, lon=${clientLon}, budget=${clientBudget}`);

    // 2) Count how many targets already exist for this request
    const { data: existingTargets, error: tgtErr } = await supabaseAdmin
      .from("request_targets")
      .select("trade_id")
      .eq("request_id", request_id);

    if (tgtErr) {
      return new Response(JSON.stringify({ error: tgtErr.message }), { status: 500 });
    }

    const alreadyTargeted = new Set((existingTargets ?? []).map((t) => t.trade_id));
    alreadyTargeted.add(reqRow.requester_id); // never target the requester

    // 3) Pick trades based on location proximity
    // Fetch trades with their base location, service radius, and extended travel settings
    const { data: candidateTrades, error: tradeErr } = await supabaseAdmin
      .from("profiles")
      .select("id, base_lat, base_lon, service_radius_km, extended_radius_km, extended_radius_min_budget")
      .eq("role", "trades");

    if (tradeErr) {
      return new Response(JSON.stringify({ error: tradeErr.message }), { status: 500 });
    }

    // Filter out already targeted trades and the requester
    let pool = (candidateTrades ?? []).filter(
      (t) => t.id && !alreadyTargeted.has(t.id)
    );

    console.log(`${LOG_PREFIX} Candidate pool size after exclusions: ${pool.length}`);

    // If client has location data, filter by distance and sort by proximity
    if (clientLat != null && clientLon != null) {
      // Calculate distance for each trade and determine match type
      const tradesWithDistance = pool
        .filter((t) => t.base_lat != null && t.base_lon != null)
        .map((t) => {
          const distance = haversineDistance(
            t.base_lat,
            t.base_lon,
            clientLat,
            clientLon
          );
          // Default service radius to 40km if not set
          const serviceRadius = t.service_radius_km ?? 40;
          const extendedRadius = t.extended_radius_km ?? null;
          const extendedMinBudget = t.extended_radius_min_budget ?? null;

          // Determine if this is a normal match or extended match
          const withinNormalRadius = distance <= serviceRadius;
          const withinExtendedRadius =
            extendedRadius != null &&
            extendedMinBudget != null &&
            distance <= extendedRadius &&
            budgetMeetsMinimum(clientBudget, extendedMinBudget);

          return {
            ...t,
            distance,
            serviceRadius,
            extendedRadius,
            extendedMinBudget,
            withinNormalRadius,
            withinExtendedRadius,
            // isExtendedMatch: true only if NOT within normal radius but IS within extended radius
            isExtendedMatch: !withinNormalRadius && withinExtendedRadius,
            isEligible: withinNormalRadius || withinExtendedRadius,
          };
        });

      console.log(`${LOG_PREFIX} Trades with valid location: ${tradesWithDistance.length}`);

      // Log each trade's distance calculation for debugging
      tradesWithDistance.forEach((t) => {
        console.log(
          `${LOG_PREFIX} Trade ${t.id}: distance=${t.distance.toFixed(2)}km, serviceRadius=${t.serviceRadius}km, ` +
          `extendedRadius=${t.extendedRadius}km, withinNormal=${t.withinNormalRadius}, ` +
          `withinExtended=${t.withinExtendedRadius}, isExtendedMatch=${t.isExtendedMatch}`
        );
      });

      // Include trades within normal OR extended radius
      const eligibleTrades = tradesWithDistance
        .filter((t) => t.isEligible)
        // Sort by distance ascending (closest first), prioritizing normal matches
        .sort((a, b) => {
          // First prioritize normal matches over extended matches
          if (a.withinNormalRadius && !b.withinNormalRadius) return -1;
          if (!a.withinNormalRadius && b.withinNormalRadius) return 1;
          // Then sort by distance
          return a.distance - b.distance;
        });

      console.log(`${LOG_PREFIX} Eligible trades (normal + extended): ${eligibleTrades.length}`);

      // Select the closest trades up to maxTargets
      const selectedTrades = eligibleTrades.slice(0, maxTargets);

      console.log(`${LOG_PREFIX} Selected ${selectedTrades.length} trades: ${selectedTrades.map(t => t.id).join(", ")}`);

      if (selectedTrades.length === 0) {
        console.log(`${LOG_PREFIX} No eligible trades found within service area`);
        return new Response(
          JSON.stringify({ targeted: 0, message: "No eligible trades found within service area" }),
          { status: 200 }
        );
      }

      // 4) Insert request_targets (invited_by='system') with extended_match flag and distance info
      const rows = selectedTrades.map((t) => ({
        request_id,
        trade_id: t.id,
        invited_by: "system",
        state: "invited",
        extended_match: t.isExtendedMatch, // Mark if this is an extended match
        distance_miles: t.distance != null ? Math.round(t.distance * 0.621371 * 10) / 10 : null, // km to miles, rounded to 1 decimal
        outside_service_area: !t.withinNormalRadius, // True if matched only via extended radius
      }));

      const { error: insErr } = await supabaseAdmin
        .from("request_targets")
        .insert(rows);

      if (insErr) {
        const msg = insErr.message || "";
        console.log(`${LOG_PREFIX} Insert error: ${msg}`);
        if (!/duplicate key value|unique/i.test(msg)) {
          return new Response(JSON.stringify({ error: insErr.message }), { status: 500 });
        }
      }

      const normalMatches = rows.filter(r => !r.extended_match).length;
      const extendedMatches = rows.filter(r => r.extended_match).length;
      console.log(`${LOG_PREFIX} Successfully targeted ${rows.length} trades (${normalMatches} normal, ${extendedMatches} extended)`);
      return new Response(JSON.stringify({ targeted: rows.length, normalMatches, extendedMatches }), { status: 200 });
    }

    // Fallback: If no client location, use random selection (original behavior)
    console.log(`${LOG_PREFIX} No client location - using random selection fallback`);
    const poolIds = pool.map((t) => t.id);

    // Fisher–Yates shuffle
    for (let i = poolIds.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [poolIds[i], poolIds[j]] = [poolIds[j], poolIds[i]];
    }

    const selected = poolIds.slice(0, maxTargets);
    console.log(`${LOG_PREFIX} Randomly selected ${selected.length} trades: ${selected.join(", ")}`);

    if (selected.length === 0) {
      return new Response(JSON.stringify({ targeted: 0, message: "No eligible trades found" }), { status: 200 });
    }

    // 4) Insert request_targets (invited_by='system')
    const rows = selected.map((trade_id) => ({
      request_id,
      trade_id,
      invited_by: "system",
      state: "invited",
    }));

    const { error: insErr } = await supabaseAdmin
      .from("request_targets")
      .insert(rows);

    if (insErr) {
      // Ignore unique violations (concurrent invocations)
      const msg = insErr.message || "";
      if (!/duplicate key value|unique/i.test(msg)) {
        return new Response(JSON.stringify({ error: insErr.message }), { status: 500 });
      }
    }

    console.log(`${LOG_PREFIX} Successfully targeted ${rows.length} trades (fallback)`);
    return new Response(JSON.stringify({ targeted: rows.length }), { status: 200 });
  } catch (e) {
    console.error(`${LOG_PREFIX} Error: ${String(e?.message || e)}`);
    return new Response(JSON.stringify({ error: String(e?.message || e) }), { status: 500 });
  }
});
