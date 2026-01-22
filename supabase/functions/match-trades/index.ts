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

serve(async (req) => {
  try {
    if (req.method !== "POST") {
      return new Response(JSON.stringify({ error: "Use POST" }), { status: 405 });
    }

    const { request_id, limit } = await req.json() as Payload;
    if (!request_id) {
      return new Response(JSON.stringify({ error: "request_id is required" }), { status: 400 });
    }
    const maxTargets = Math.min(Math.max(limit ?? 5, 1), 5); // clamp 1..5

    // 1) Load the request (ensure it's open)
    const { data: reqRow, error: reqErr } = await supabaseAdmin
      .from("quote_requests")
      .select("id, requester_id, status, closed_reason")
      .eq("id", request_id)
      .single();
    if (reqErr || !reqRow) {
      return new Response(JSON.stringify({ error: "Request not found" }), { status: 404 });
    }
    if (reqRow.closed_reason || reqRow.status === "closed") {
      return new Response(JSON.stringify({ error: "Request is already closed" }), { status: 409 });
    }

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

    // 3) Pick trades
    // NOTE: This is a simple baseline: trades with role='trades', excluding already targeted,
    // ordered randomly. Replace/extend with proximity/skills once you add profile fields.
    const { data: candidateTrades, error: tradeErr } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .eq("role", "trades");

    if (tradeErr) {
      return new Response(JSON.stringify({ error: tradeErr.message }), { status: 500 });
    }

    // Filter & shuffle locally (keeps one roundtrip and avoids "NOT IN (huge list)" performance issues)
    const pool = (candidateTrades ?? [])
      .map((t) => t.id)
      .filter((id) => id && !alreadyTargeted.has(id));

    // Fisher–Yates shuffle
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }

    const selected = pool.slice(0, maxTargets);

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

    return new Response(JSON.stringify({ targeted: rows.length }), { status: 200 });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e?.message || e) }), { status: 500 });
  }
});
