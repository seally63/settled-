// lib/api/directRequest.js
import { supabase, auth } from "../supabase";

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
  const budget_band = opts?.budget_band ?? null;   // '<£3k' | '£3k–£6k' | '£6k–£9k' | '£9k–£12k' | '>£12k'
  const postcode = (opts?.postcode || opts?.job_outcode || "").toUpperCase() || null; // e.g., EH48 3NN

  // 1) create the quote request
  const { data: req, error: reqErr } = await supabase
    .from("quote_requests")
    .insert([
      {
        requester_id: uid,
        status: "open",
        details,
        suggested_title,
        budget_band,
        postcode,
      },
    ])
    .select("id")
    .single();

  if (reqErr) {
    const msg = (reqErr.message || "").toLowerCase();
    if (msg.includes("3 open requests")) {
      throw new Error(
        "You already have 3 active requests. Please close one before creating another."
      );
    }
    if (msg.includes("budget_band")) {
      throw new Error("Invalid budget selection.");
    }
    if (msg.includes("postcode")) {
      throw new Error("Invalid postcode.");
    }
    throw reqErr;
  }

  // 2) invite the chosen trade
  const { error: tgtErr } = await supabase.from("request_targets").insert([
    {
      request_id: req.id,
      trade_id: tradeId,
      invited_by: "client",
      state: "invited",
    },
  ]);

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

