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

/**
 * Fetch reviews for a trade profile (where trade is the reviewee).
 * Returns: Array of reviews with reviewer info
 *
 * Defensive: the reviews table was originally created with `comment` and no
 * `photos` column. A later RPC (`rpc_submit_review`) references `content` and
 * `photos`. This function handles either schema and always returns a
 * normalized shape: { id, rating, content, photos, created_at, reviewer }.
 *
 * @param {string} profileId - The trade's profile ID
 * @param {object} options - Fetch options
 * @param {number} options.limit - Max reviews to fetch (default: 10)
 * @returns {Promise<Array>} Array of reviews
 */
export async function getTradeReviews(profileId, options = {}) {
  const { limit = 10 } = options;

  if (!profileId) return [];

  const REVIEWER_JOIN = `reviewer:reviewer_id ( id, full_name, photo_url )`;

  // Attempt 1: V2 schema (content + photos columns)
  const primary = await supabase
    .from("reviews")
    .select(
      `id, rating, content, photos, created_at, ${REVIEWER_JOIN}`
    )
    .eq("reviewee_id", profileId)
    .eq("reviewer_type", "client")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (!primary.error) {
    return (primary.data || []).map((r) => ({
      id: r.id,
      rating: r.rating,
      content: r.content ?? null,
      photos: Array.isArray(r.photos) ? r.photos : [],
      created_at: r.created_at,
      reviewer: r.reviewer || null,
    }));
  }

  const msg = String(primary.error.message || "").toLowerCase();
  const schemaMismatch =
    msg.includes("content") || msg.includes("photos") || msg.includes("column");

  if (!schemaMismatch) {
    console.log("getTradeReviews error:", primary.error.message);
    return [];
  }

  // Attempt 2: original schema (comment only, no photos)
  const fallback = await supabase
    .from("reviews")
    .select(`id, rating, comment, created_at, ${REVIEWER_JOIN}`)
    .eq("reviewee_id", profileId)
    .eq("reviewer_type", "client")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (fallback.error) {
    console.log("getTradeReviews fallback error:", fallback.error.message);
    return [];
  }

  return (fallback.data || []).map((r) => ({
    id: r.id,
    rating: r.rating,
    content: r.comment ?? null,
    photos: [],
    created_at: r.created_at,
    reviewer: r.reviewer || null,
  }));
}


