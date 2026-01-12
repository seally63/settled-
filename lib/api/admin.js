// lib/api/admin.js
// API helpers for admin review functionality

import { supabase } from "../supabase";

// ============================================================================
// Admin Access Check
// ============================================================================

/**
 * Check if the current user is an admin
 * @returns {Promise<boolean>}
 */
export async function isCurrentUserAdmin() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return false;

  const { data, error } = await supabase
    .from("profiles")
    .select("is_admin")
    .eq("id", user.id)
    .single();

  if (error) {
    console.warn("Error checking admin status:", error.message);
    return false;
  }

  return data?.is_admin === true;
}

// ============================================================================
// Review Queue
// ============================================================================

/**
 * Get all pending submissions for admin review
 * @param {string} filterType - Optional filter: "photo_id" | "insurance" | "credentials" | null for all
 * @returns {Promise<object[]>} - Array of pending submissions
 */
export async function getPendingReviews(filterType = null) {
  let query = supabase
    .from("verification_review_queue")
    .select(`
      id,
      profile_id,
      verification_type,
      submission_id,
      priority,
      created_at,
      profiles:profile_id (
        id,
        business_name,
        email,
        full_name
      )
    `)
    .eq("status", "pending")
    .order("priority", { ascending: false })
    .order("created_at", { ascending: true });

  if (filterType) {
    query = query.eq("verification_type", filterType);
  }

  const { data, error } = await query;

  if (error) throw error;

  // Fetch submission details for each item
  const enrichedData = await Promise.all(
    (data || []).map(async (item) => {
      const submissionDetails = await getSubmissionDetails(
        item.verification_type,
        item.submission_id
      );
      return {
        ...item,
        submission: submissionDetails,
      };
    })
  );

  return enrichedData;
}

/**
 * Get submission details based on verification type
 */
async function getSubmissionDetails(verificationType, submissionId) {
  if (!submissionId) return null;

  let tableName;
  switch (verificationType) {
    case "photo_id":
      tableName = "photo_id_submissions";
      break;
    case "insurance":
      tableName = "insurance_submissions";
      break;
    case "credentials":
      tableName = "credential_submissions";
      break;
    default:
      return null;
  }

  const { data, error } = await supabase
    .from(tableName)
    .select("*")
    .eq("id", submissionId)
    .single();

  if (error) {
    console.warn(`Error fetching ${tableName}:`, error.message);
    return null;
  }

  return data;
}

/**
 * Get signed URL for a verification document
 * @param {string} documentPath - Storage path
 * @returns {Promise<string|null>}
 */
export async function getDocumentSignedUrl(documentPath) {
  if (!documentPath) return null;

  const { data, error } = await supabase.storage
    .from("verification-documents")
    .createSignedUrl(documentPath, 3600); // 1 hour expiry

  if (error) {
    console.warn("Error creating signed URL:", error.message);
    return null;
  }

  return data?.signedUrl || null;
}

// ============================================================================
// Approve / Reject Actions
// ============================================================================

/**
 * Approve a verification submission
 * @param {string} queueId - Review queue item ID
 * @param {string} verificationType - "photo_id" | "insurance" | "credentials"
 * @param {string} submissionId - Submission ID
 * @param {string} profileId - User's profile ID
 * @param {string} notes - Optional approval notes
 * @returns {Promise<object>}
 */
export async function approveSubmission({ queueId, verificationType, submissionId, profileId, notes = "" }) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  // 1. Update submission status
  const tableName = getSubmissionTableName(verificationType);
  const { error: submissionError } = await supabase
    .from(tableName)
    .update({
      review_status: "approved",
      reviewed_at: new Date().toISOString(),
      reviewed_by: user.id,
      review_notes: notes,
    })
    .eq("id", submissionId);

  if (submissionError) throw submissionError;

  // 2. Update trade_verifications status
  const statusColumn = getStatusColumnName(verificationType);
  const verifiedAtColumn = getVerifiedAtColumnName(verificationType);

  const { error: verificationError } = await supabase
    .from("trade_verifications")
    .update({
      [statusColumn]: "verified",
      [verifiedAtColumn]: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("profile_id", profileId);

  if (verificationError) throw verificationError;

  // 3. Update review queue status
  const { error: queueError } = await supabase
    .from("verification_review_queue")
    .update({
      status: "completed",
      reviewed_at: new Date().toISOString(),
      reviewed_by: user.id,
    })
    .eq("id", queueId);

  if (queueError) throw queueError;

  // 4. Log status history
  await supabase.from("verification_status_history").insert({
    profile_id: profileId,
    verification_type: verificationType,
    old_status: "pending_review",
    new_status: "verified",
    changed_by: user.id,
    notes: notes || "Approved by admin",
  });

  return { success: true };
}

/**
 * Reject a verification submission
 * @param {string} queueId - Review queue item ID
 * @param {string} verificationType - "photo_id" | "insurance" | "credentials"
 * @param {string} submissionId - Submission ID
 * @param {string} profileId - User's profile ID
 * @param {string} reason - Required rejection reason
 * @returns {Promise<object>}
 */
export async function rejectSubmission({ queueId, verificationType, submissionId, profileId, reason }) {
  if (!reason?.trim()) {
    throw new Error("Rejection reason is required");
  }

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  // 1. Update submission status
  const tableName = getSubmissionTableName(verificationType);
  const { error: submissionError } = await supabase
    .from(tableName)
    .update({
      review_status: "rejected",
      reviewed_at: new Date().toISOString(),
      reviewed_by: user.id,
      review_notes: reason,
    })
    .eq("id", submissionId);

  if (submissionError) throw submissionError;

  // 2. Update trade_verifications status
  const statusColumn = getStatusColumnName(verificationType);

  const { error: verificationError } = await supabase
    .from("trade_verifications")
    .update({
      [statusColumn]: "rejected",
      updated_at: new Date().toISOString(),
    })
    .eq("profile_id", profileId);

  if (verificationError) throw verificationError;

  // 3. Update review queue status
  const { error: queueError } = await supabase
    .from("verification_review_queue")
    .update({
      status: "completed",
      reviewed_at: new Date().toISOString(),
      reviewed_by: user.id,
    })
    .eq("id", queueId);

  if (queueError) throw queueError;

  // 4. Log status history
  await supabase.from("verification_status_history").insert({
    profile_id: profileId,
    verification_type: verificationType,
    old_status: "pending_review",
    new_status: "rejected",
    changed_by: user.id,
    notes: `Rejected: ${reason}`,
  });

  return { success: true };
}

// ============================================================================
// Helpers
// ============================================================================

function getSubmissionTableName(verificationType) {
  switch (verificationType) {
    case "photo_id":
      return "photo_id_submissions";
    case "insurance":
      return "insurance_submissions";
    case "credentials":
      return "credential_submissions";
    default:
      throw new Error("Invalid verification type");
  }
}

function getStatusColumnName(verificationType) {
  switch (verificationType) {
    case "photo_id":
      return "photo_id_status";
    case "insurance":
      return "insurance_status";
    case "credentials":
      return "credentials_status";
    default:
      throw new Error("Invalid verification type");
  }
}

function getVerifiedAtColumnName(verificationType) {
  switch (verificationType) {
    case "photo_id":
      return "photo_id_verified_at";
    case "insurance":
      return "insurance_verified_at";
    case "credentials":
      return "credentials_verified_at";
    default:
      throw new Error("Invalid verification type");
  }
}
