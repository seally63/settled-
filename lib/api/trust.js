// lib/api/trust.js
import { supabase } from "../supabase";

/**
 * Public-safe trust badges for a trade profile.
 * Source: public.v_business_verification_public
 * Returns: { profile_id, companies_house_active, payments_verified, insurance_verified } | null
 * Notes: Non-fatal on error (returns null so UI can hide section).
 */
export async function getBusinessVerificationPublic(profileId) {
  if (!profileId) return null;
  const { data, error } = await supabase
    .from("v_business_verification_public")
    .select("profile_id, companies_house_active, payments_verified, insurance_verified")
    .eq("profile_id", profileId)
    .maybeSingle();

  if (error) {
    console.log("getBusinessVerificationPublic error:", error.message);
    return null;
  }
  return data || null;
}

/**
 * Public 90d KPIs for a trade profile.
 * Source: public.trade_public_metrics_90d (RLS allows anon/auth SELECT)
 * Returns: {
 *   profile_id, sent_count, accepted_count, declined_count, expired_count,
 *   acceptance_rate, response_time_p50_hours, updated_at
 * } | null
 * Notes: Non-fatal on error (returns null so UI can hide section).
 */
export async function getTradePublicMetrics90d(profileId) {
  if (!profileId) return null;
  const { data, error } = await supabase
    .from("trade_public_metrics_90d")
    .select(
      "profile_id, sent_count, accepted_count, declined_count, expired_count, acceptance_rate, response_time_p50_hours, updated_at"
    )
    .eq("profile_id", profileId)
    .maybeSingle();

  if (error) {
    console.log("getTradePublicMetrics90d error:", error.message);
    return null;
  }
  return data || null;
}

/**
 * (Existing helper kept) Private metrics view (invoker) used elsewhere.
 * Source: public.v_trade_metrics_90d
 * Returns: { profile_id, response_time_p50_hours, acceptance_rate, completion_reliability } | null
 * Notes: Non-fatal on error (returns null).
 */
export async function getTradeMetrics90d(profileId) {
  if (!profileId) return null;
  const { data, error } = await supabase
    .from("v_trade_metrics_90d")
    .select("profile_id, response_time_p50_hours, acceptance_rate, completion_reliability")
    .eq("profile_id", profileId)
    .maybeSingle();

  if (error) {
    console.log("getTradeMetrics90d error:", error.message);
    return null;
  }
  return data || null;
}

/**
 * RPC: Create a Job from a Quote (owned by current trade user).
 * Returns: job_id (uuid)
 */
export async function createJobFromQuote(quoteId, title) {
  const { data, error } = await supabase.rpc("rpc_create_job_from_quote", {
    p_quote_id: quoteId,
    p_title: title ?? null,
  });
  if (error) throw error;
  return data; // job_id
}

/**
 * RPC: Mark a Job completed (auto-issues a review token via trigger).
 * Returns: true on success
 */
export async function markJobCompleted(jobId) {
  const { error } = await supabase.rpc("rpc_mark_job_completed", {
    p_job_id: jobId,
  });
  if (error) throw error;
  return true;
}


