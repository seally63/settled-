// lib/api/tradePosts.js
// CRUD for trade-created content: intro videos, portfolio posts, before-afters

import { supabase } from "../supabase";

const POST_VALIDATION = {
  TITLE_MAX: 150,
  DESCRIPTION_MAX: 1000,
  MAX_MEDIA: 10,
  VALID_TYPES: [
    "intro_video",
    "portfolio_photo",
    "portfolio_video",
    "before_after",
    "text_update",
  ],
};

/** Get the current authenticated user id */
async function getUserId() {
  const { data, error } = await supabase.auth.getUser();
  if (error) throw error;
  return data?.user?.id || null;
}

/**
 * Create a new trade post and auto-submit it for content moderation.
 *
 * @param {object} params
 * @param {string} params.postType - intro_video | portfolio_photo | portfolio_video | before_after | text_update
 * @param {string} params.title - Optional title
 * @param {string} params.description - Optional caption/description
 * @param {string[]} params.mediaUrls - Array of Supabase Storage URLs
 * @param {string} params.thumbnailUrl - Optional thumbnail URL for videos
 * @param {boolean} params.isIntroVideo - True if this is the pinned intro video
 * @param {boolean} params.isPinned - True to pin to top of profile
 * @returns {Promise<object>} The created post
 */
export async function createPost({
  postType,
  title = null,
  description = null,
  mediaUrls = [],
  thumbnailUrl = null,
  isIntroVideo = false,
  isPinned = false,
}) {
  const uid = await getUserId();
  if (!uid) throw new Error("Not signed in");

  // Validate post type
  if (!POST_VALIDATION.VALID_TYPES.includes(postType)) {
    throw new Error(`Invalid post type: ${postType}`);
  }

  // Validate title length
  if (title && String(title).trim().length > POST_VALIDATION.TITLE_MAX) {
    throw new Error(
      `Title must be ${POST_VALIDATION.TITLE_MAX} characters or less.`
    );
  }

  // Validate description length
  if (
    description &&
    String(description).trim().length > POST_VALIDATION.DESCRIPTION_MAX
  ) {
    throw new Error(
      `Description must be ${POST_VALIDATION.DESCRIPTION_MAX} characters or less.`
    );
  }

  // Validate media count
  if (mediaUrls.length > POST_VALIDATION.MAX_MEDIA) {
    throw new Error(`Maximum ${POST_VALIDATION.MAX_MEDIA} media files allowed.`);
  }

  // If this is an intro video, unpin any existing intro video first
  if (isIntroVideo) {
    await supabase
      .from("trade_posts")
      .update({ is_intro_video: false })
      .eq("trade_id", uid)
      .eq("is_intro_video", true);
  }

  // Insert the post
  const { data: post, error: postError } = await supabase
    .from("trade_posts")
    .insert({
      trade_id: uid,
      post_type: postType,
      title: title ? String(title).trim() : null,
      description: description ? String(description).trim() : null,
      media_urls: mediaUrls,
      thumbnail_url: thumbnailUrl || null,
      is_intro_video: isIntroVideo,
      is_pinned: isPinned,
      moderation_status: "pending",
    })
    .select()
    .single();

  if (postError) throw postError;

  // Auto-create content moderation queue entry
  const contentType =
    postType === "intro_video" ? "intro_video" : "portfolio_post";
  const { error: modError } = await supabase
    .from("content_moderation_queue")
    .insert({
      post_id: post.id,
      trade_id: uid,
      content_type: contentType,
      status: "pending",
    });

  if (modError) {
    console.warn("[tradePosts] Failed to create moderation entry:", modError.message);
  }

  return post;
}

/**
 * Get all posts by the authenticated trade (including pending/rejected)
 * @returns {Promise<object[]>}
 */
export async function getMyPosts() {
  const uid = await getUserId();
  if (!uid) throw new Error("Not signed in");

  const { data, error } = await supabase
    .from("trade_posts")
    .select("*")
    .eq("trade_id", uid)
    .order("is_pinned", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data || [];
}

/**
 * Get approved posts for a trade's public profile
 * @param {string} tradeId
 * @returns {Promise<object[]>}
 */
export async function getTradePostsPublic(tradeId) {
  if (!tradeId) return [];

  const { data, error } = await supabase
    .from("trade_posts")
    .select(
      "id, post_type, title, description, media_urls, thumbnail_url, is_intro_video, is_pinned, view_count, created_at"
    )
    .eq("trade_id", tradeId)
    .eq("moderation_status", "approved")
    .order("is_pinned", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data || [];
}

/**
 * Get approved posts across trades for the discovery feed
 * @param {object} params
 * @param {number} params.limit - Max results (default 20)
 * @param {number} params.offset - Offset for pagination (default 0)
 * @returns {Promise<object[]>}
 */
export async function getFeedPosts({ limit = 20, offset = 0 } = {}) {
  const safeLimit = Math.min(Math.max(Number(limit) || 20, 1), 50);

  const { data, error } = await supabase
    .from("trade_posts")
    .select(
      `
      id, post_type, title, description, media_urls, thumbnail_url,
      is_intro_video, view_count, created_at,
      trade:trade_id (
        id, full_name, business_name, trade_title, photo_url, town_city
      )
    `
    )
    .eq("moderation_status", "approved")
    .order("created_at", { ascending: false })
    .range(offset, offset + safeLimit - 1);

  if (error) throw error;
  return data || [];
}

/**
 * Update an existing post (trade can only edit their own, enforced by RLS)
 * @param {string} postId
 * @param {object} updates - Fields to update (title, description, isPinned)
 * @returns {Promise<object>}
 */
export async function updatePost(postId, updates = {}) {
  const allowed = ["title", "description", "is_pinned"];
  const clean = {};
  for (const k of allowed) {
    if (updates[k] !== undefined) clean[k] = updates[k];
  }

  if (Object.keys(clean).length === 0) return null;

  clean.updated_at = new Date().toISOString();

  const { data, error } = await supabase
    .from("trade_posts")
    .update(clean)
    .eq("id", postId)
    .select()
    .maybeSingle();

  if (error) throw error;
  return data;
}

/**
 * Delete a post (trade can only delete their own, enforced by RLS)
 * @param {string} postId
 * @returns {Promise<boolean>}
 */
export async function deletePost(postId) {
  const { error } = await supabase
    .from("trade_posts")
    .delete()
    .eq("id", postId);

  if (error) throw error;
  return true;
}

/**
 * Upload media (photo or video) to the trade-media storage bucket
 * Files are stored under {userId}/{uuid}.{ext}
 *
 * @param {object} file - File object with uri, type, name properties
 * @returns {Promise<string>} Public URL of the uploaded file
 */
export async function uploadTradeMedia(file) {
  const uid = await getUserId();
  if (!uid) throw new Error("Not signed in");

  if (!file?.uri) throw new Error("File is required");

  // Generate a unique filename
  const ext = file.name?.split(".").pop() || "jpg";
  const uniqueName = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const filePath = `${uid}/${uniqueName}`;

  // Read file as array buffer for upload
  const response = await fetch(file.uri);
  const blob = await response.blob();

  const { error: uploadError } = await supabase.storage
    .from("trade-media")
    .upload(filePath, blob, {
      contentType: file.type || "image/jpeg",
      upsert: false,
    });

  if (uploadError) throw uploadError;

  // Get public URL (bucket is public)
  const { data } = supabase.storage
    .from("trade-media")
    .getPublicUrl(filePath);

  return data?.publicUrl || null;
}

export default {
  createPost,
  getMyPosts,
  getTradePostsPublic,
  getFeedPosts,
  updatePost,
  deletePost,
  uploadTradeMedia,
};
