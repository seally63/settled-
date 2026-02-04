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

// Validation constants
const MESSAGE_MAX_LENGTH = 5000;
const MESSAGE_MIN_LENGTH = 1;

/**
 * Send a message on a request (and optional quote).
 * `paths` is an array of storage paths for attached images.
 * Either body or paths (or both) must be provided.
 */
export async function sendMessage({ requestId, quoteId = null, body = "", paths = [] }) {
  if (!requestId) throw new Error("requestId is required");

  // Trim body
  const trimmedBody = (body || "").trim();

  // Validate: must have either text or images
  const hasBody = trimmedBody.length > 0;
  const hasPaths = Array.isArray(paths) && paths.length > 0;

  if (!hasBody && !hasPaths) {
    throw new Error("Message must have either text or images.");
  }

  // Validate body length if present
  if (hasBody && trimmedBody.length > MESSAGE_MAX_LENGTH) {
    throw new Error(`Message too long. Maximum ${MESSAGE_MAX_LENGTH} characters allowed.`);
  }

  const { data, error } = await supabase.rpc("rpc_send_message", {
    p_request_id: requestId,
    p_quote_id: quoteId,
    p_body: trimmedBody,
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
