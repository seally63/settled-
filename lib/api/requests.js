// lib/api/requests.js
import { supabase } from "../supabase";

/**
 * Trade accepts (claims) an open request.
 * Returns: { id, status, claimed_by, claimed_at }
 */
export async function acceptRequest(requestId) {
  if (!requestId) throw new Error("requestId is required");
  const { data, error } = await supabase
    .rpc("rpc_trade_accept_request", { p_request_id: requestId })
    .single();
  if (error) throw error;
  return data;
}

/**
 * Trade declines a request (still respects RLS eligibility).
 * Returns: { id, status, declined_at }
 */
export async function declineRequest(requestId) {
  if (!requestId) throw new Error("requestId is required");
  const { data, error } = await supabase
    .rpc("rpc_trade_decline_request", { p_request_id: requestId })
    .single();
  if (error) throw error;
  return data;
}

export default { acceptRequest, declineRequest };
