// lib/api/contentModeration.js
// Admin content moderation for trade-posted videos and portfolio content
// Separate from the verification review queue (verification = photo ID, insurance, credentials)

import { supabase } from "../supabase";

/**
 * Fetch pending content awaiting admin review
 * @param {string|null} filterType - Optional: "intro_video" | "portfolio_post" | null for all
 * @returns {Promise<object[]>}
 */
export async function getPendingContent(filterType = null) {
  let query = supabase
    .from("content_moderation_queue")
    .select(
      `
      id, content_type, status, created_at,
      post:post_id (
        id, post_type, title, description, media_urls, thumbnail_url,
        is_intro_video, created_at
      ),
      trade:trade_id (
        id, full_name, business_name, trade_title, photo_url
      )
    `
    )
    .eq("status", "pending")
    .order("created_at", { ascending: true });

  if (filterType) {
    query = query.eq("content_type", filterType);
  }

  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

/**
 * Approve a piece of trade content
 * Updates both the moderation queue and the trade_posts table.
 * If it's an intro video, also updates the trade's profile.
 *
 * @param {string} postId - The trade_posts.id to approve
 * @returns {Promise<object>}
 */
export async function approveContent(postId) {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const now = new Date().toISOString();

  // 1. Update trade_posts moderation status
  const { data: post, error: postError } = await supabase
    .from("trade_posts")
    .update({ moderation_status: "approved", updated_at: now })
    .eq("id", postId)
    .select("id, trade_id, is_intro_video")
    .maybeSingle();

  if (postError) throw postError;
  if (!post) throw new Error("Post not found");

  // 2. Update moderation queue
  const { error: queueError } = await supabase
    .from("content_moderation_queue")
    .update({
      status: "approved",
      reviewed_by: user.id,
      reviewed_at: now,
    })
    .eq("post_id", postId);

  if (queueError) throw queueError;

  // 3. If intro video, update the trade's profile
  if (post.is_intro_video) {
    const { error: profileError } = await supabase
      .from("profiles")
      .update({
        intro_video_post_id: post.id,
        has_approved_intro_video: true,
        updated_at: now,
      })
      .eq("id", post.trade_id);

    if (profileError) {
      console.warn(
        "[contentModeration] Failed to update profile intro video:",
        profileError.message
      );
    }
  }

  return { success: true, postId: post.id, tradeId: post.trade_id };
}

/**
 * Reject a piece of trade content
 * @param {string} postId - The trade_posts.id to reject
 * @param {string} reason - Required rejection reason
 * @returns {Promise<object>}
 */
export async function rejectContent(postId, reason) {
  if (!reason?.trim()) {
    throw new Error("Rejection reason is required");
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const now = new Date().toISOString();

  // 1. Update trade_posts
  const { error: postError } = await supabase
    .from("trade_posts")
    .update({
      moderation_status: "rejected",
      rejection_reason: reason.trim(),
      updated_at: now,
    })
    .eq("id", postId);

  if (postError) throw postError;

  // 2. Update moderation queue
  const { error: queueError } = await supabase
    .from("content_moderation_queue")
    .update({
      status: "rejected",
      reviewed_by: user.id,
      reviewed_at: now,
      rejection_reason: reason.trim(),
    })
    .eq("post_id", postId);

  if (queueError) throw queueError;

  return { success: true };
}

/**
 * Get moderation history (reviewed items)
 * @param {object} params
 * @param {number} params.limit - Max results (default 20)
 * @param {number} params.offset - Offset for pagination (default 0)
 * @returns {Promise<object[]>}
 */
export async function getModerationHistory({ limit = 20, offset = 0 } = {}) {
  const safeLimit = Math.min(Math.max(Number(limit) || 20, 1), 50);

  const { data, error } = await supabase
    .from("content_moderation_queue")
    .select(
      `
      id, content_type, status, reviewed_at, rejection_reason, created_at,
      post:post_id (
        id, post_type, title, media_urls, thumbnail_url
      ),
      trade:trade_id (
        id, full_name, business_name
      ),
      reviewer:reviewed_by (
        id, full_name
      )
    `
    )
    .neq("status", "pending")
    .order("reviewed_at", { ascending: false })
    .range(offset, offset + safeLimit - 1);

  if (error) throw error;
  return data || [];
}

export default {
  getPendingContent,
  approveContent,
  rejectContent,
  getModerationHistory,
};
