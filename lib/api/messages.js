// lib/api/messages.js
import { supabase, auth } from "../supabase";

/**
 * List messages for a given request (and optional quote).
 * Returns an array sorted by created_at ASC.
 */
export async function listMessages(requestId, quoteId = null) {
  if (!requestId) throw new Error("requestId is required");

  const { data, error } = await supabase.rpc("rpc_list_messages", {
    p_request_id: requestId,
    p_quote_id: quoteId,
  });

  if (error) throw error;

  const rows = Array.isArray(data) ? data : [];
  // Just in case, sort client-side by created_at ascending
  return rows.sort((a, b) => {
    const ta = new Date(a.created_at).getTime() || 0;
    const tb = new Date(b.created_at).getTime() || 0;
    return ta - tb;
  });
}

/**
 * Send a message on a request (and optional quote).
 * `paths` is an array of simple filenames; RPC will prefix with message_id.
 */
export async function sendMessage({ requestId, quoteId = null, body, paths = [] }) {
  if (!requestId) throw new Error("requestId is required");
  if (!body || !body.trim()) throw new Error("Message cannot be empty.");

  const { data, error } = await supabase.rpc("rpc_send_message", {
    p_request_id: requestId,
    p_quote_id: quoteId,
    p_body: body,
    p_paths: paths,
  });

  if (error) throw error;

  // rpc_send_message returns TABLE (...), so we get an array; take first row
  if (Array.isArray(data) && data[0]) {
    return data[0];
  }

  return null;
}

export default {
  listMessages,
  sendMessage,
};
