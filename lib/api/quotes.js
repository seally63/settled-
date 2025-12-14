// lib/api/quotes.js
// Helpers for Trades "Quotes Inbox" (pagination + updates)
import { supabase, auth } from "../supabase";

const STATUS_MAP = {
  new: ["created", "draft"],   // "New" tab
  sent: ["sent"],
  accepted: ["accepted"],
  declined: ["declined"],
  expired: ["expired"],
};

// Cursor "issued_at|id"
function buildCursor(row) {
  if (!row?.issued_at || !row?.id) return null;
  return `${row.issued_at}|${row.id}`;
}
function parseCursor(cursor) {
  if (!cursor) return null;
  const [issued_at, id] = cursor.split("|");
  return { issued_at, id };
}

/**
 * List quotes owned by the authenticated trade with status filter.
 * issued_at DESC, id DESC cursor pagination.
 */
export async function listMyTradeQuotes({ status, limit = 20, cursor } = {}) {
  const { data: authData, error: authErr } = await auth.getUser();
  if (authErr) throw authErr;
  const uid = authData?.user?.id;
  if (!uid) throw new Error("Not signed in.");

  const dbStatuses = STATUS_MAP[status] || STATUS_MAP.new;
  const pageSize = Math.min(Math.max(limit, 1), 50);

  let q = supabase
    .from("tradify_native_app_db")
    .select("id, request_id, client_id, trade_id, status, issued_at, details, quote_total")
    .eq("trade_id", uid)
    .order("issued_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(pageSize + 1);

  if (dbStatuses.length === 1) q = q.eq("status", dbStatuses[0]);
  else q = q.in("status", dbStatuses);

  const c = parseCursor(cursor);
  if (c?.issued_at && c?.id) {
    q = q.or(`issued_at.lt.${c.issued_at},and(issued_at.eq.${c.issued_at},id.lt.${c.id})`);
  }

  const { data, error } = await q;
  if (error) throw error;

  let items = data || [];
  let nextCursor;
  if (items.length > pageSize) {
    const last = items[pageSize - 1];
    nextCursor = buildCursor(last);
    items = items.slice(0, pageSize);
  }

  items = items.map((row) => ({
    ...row,
    _title: (row.details || "").split("\n")[0]?.slice(0, 60) || "Quote request",
  }));

  return { items, nextCursor };
}

/** Update status (RLS enforces trade ownership). */
export async function updateQuoteStatus(quoteId, nextStatus) {
  if (!quoteId) throw new Error("quoteId is required");
  const allowed = new Set(["sent", "accepted", "declined", "expired", "withdrawn"]);
  if (!allowed.has(nextStatus)) throw new Error("Invalid status");

  const { data, error } = await supabase
    .from("tradify_native_app_db")
    .update({ status: nextStatus, updated_at: new Date().toISOString() })
    .eq("id", quoteId)
    .select("id, status")
    .single();

  if (error) throw error;
  return data;
}

/** Small fetch by id (used by create screen prefill, detail, etc.) */
export async function getQuoteById(quoteId) {
  if (!quoteId) throw new Error("quoteId is required");
  const { data, error } = await supabase
    .from("tradify_native_app_db")
    .select("id, request_id, client_id, trade_id, status, issued_at, details, quote_total")
    .eq("id", quoteId)
    .single();
  if (error) throw error;
  return data;
}

/**
 * Create a new quote skeleton from a request (owned by current trade).
 * Returns: quote_id (uuid)
 */
export async function createQuoteFromRequest(requestId, payload = {}) {
  if (!requestId) throw new Error("requestId is required");
  const { project_name = null, details = null } = payload || {};
  const { data, error } = await supabase
    .rpc("rpc_create_quote_from_request", {
      p_request_id: requestId,
      p_project_name: project_name,
      p_details: details,
    })
    .single();
  if (error) throw error;
  return data?.quote_id;
}

export default {
  listMyTradeQuotes,
  updateQuoteStatus,
  getQuoteById,
  createQuoteFromRequest,
};
