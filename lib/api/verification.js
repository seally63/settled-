// lib/api/verification.js
// API helpers for verification flows (Photo ID, Insurance, Credentials)

import { supabase } from "../supabase";
import * as FileSystem from "expo-file-system/legacy";
import { decode } from "base64-arraybuffer";

const BUCKET = "verification-documents";

// ============================================================================
// Storage Helpers
// ============================================================================

/** Generate a UUID v4 for file naming */
function uuid4() {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Upload a file to the verification-documents bucket
 * @param {string} userId - User's profile ID
 * @param {string} verificationType - "photo_id" | "insurance" | "credentials"
 * @param {object} file - File object with uri, base64 (optional), mimeType
 * @returns {Promise<string>} - Storage path
 */
export async function uploadVerificationDocument(userId, verificationType, file) {
  if (!file?.uri) throw new Error("File URI is required");

  // Determine file extension
  const uriParts = file.uri.split(".");
  const ext = (uriParts[uriParts.length - 1] || "jpg").toLowerCase().split("?")[0];

  // Generate storage path: {user_id}/{verification_type}/{uuid}.{ext}
  const objectPath = `${userId}/${verificationType}/${uuid4()}.${ext}`;

  // Determine mime type
  const mimeType = file.mimeType || file.type || (ext === "pdf" ? "application/pdf" : `image/${ext === "jpg" ? "jpeg" : ext}`);

  // Get file content as ArrayBuffer
  let arrayBuffer;
  if (file.base64) {
    arrayBuffer = decode(file.base64);
  } else {
    const base64 = await FileSystem.readAsStringAsync(file.uri, {
      encoding: "base64",
    });
    arrayBuffer = decode(base64);
  }

  // Upload to Supabase Storage
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(objectPath, arrayBuffer, {
      contentType: mimeType,
      upsert: false,
    });

  if (error) throw error;

  return objectPath;
}

/**
 * Get a signed URL for a verification document
 * @param {string} path - Storage path
 * @param {number} expiresIn - Expiry time in seconds (default 3600 = 1 hour)
 * @returns {Promise<string|null>} - Signed URL or null
 */
export async function getVerificationDocumentUrl(path, expiresIn = 3600) {
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(path, expiresIn);

  if (error) {
    console.warn("Failed to create signed URL:", error.message);
    return null;
  }

  return data?.signedUrl || null;
}

// ============================================================================
// Verification Status
// ============================================================================

/**
 * Get complete verification status for current user
 * @returns {Promise<object>} - Verification status object
 */
export async function getVerificationStatus() {
  const { data, error } = await supabase.functions.invoke("get-verification-status");

  if (error) throw error;
  return data;
}

/**
 * Get verification status from profile (simpler version)
 * Uses the trade_verifications table directly
 * @returns {Promise<object>} - Basic verification status
 */
export async function getMyVerificationStatus() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from("trade_verifications")
    .select("*")
    .eq("profile_id", user.id)
    .maybeSingle();

  if (error && error.code !== "PGRST116") throw error;

  return data || {
    photo_id_status: "not_started",
    insurance_status: "not_started",
    credentials_status: "not_started",
    overall_complete: false,
  };
}

// ============================================================================
// Photo ID Verification
// ============================================================================

/**
 * Submit Photo ID for verification
 * @param {object} params
 * @param {string} params.documentType - "passport" | "driving_licence" | "national_id"
 * @param {object} params.file - File object with uri, base64, mimeType
 * @returns {Promise<object>} - Submission result
 */
export async function submitPhotoId({ documentType, file }) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  // Upload document to storage
  const documentPath = await uploadVerificationDocument(user.id, "photo_id", file);

  // Call Edge Function
  const { data, error } = await supabase.functions.invoke("submit-photo-id", {
    body: {
      document_type: documentType,
      document_path: documentPath,
    },
  });

  if (error) throw error;
  return data;
}

// ============================================================================
// Insurance Verification
// ============================================================================

/**
 * Submit Insurance for verification
 * @param {object} params
 * @param {string} params.policyProvider - Insurance provider name
 * @param {string} params.policyNumber - Policy number
 * @param {number} params.coverageAmountPence - Coverage in pence (e.g., 200000000 for £2M)
 * @param {string} params.policyExpiryDate - Expiry date (YYYY-MM-DD)
 * @param {object} params.pliFile - PLI certificate file
 * @param {boolean} params.hasEmployees - Whether user has employees
 * @param {object} params.eliFile - ELI certificate file (if hasEmployees)
 * @param {number} params.eliCoverageAmountPence - ELI coverage in pence
 * @param {string} params.eliExpiryDate - ELI expiry date
 * @returns {Promise<object>} - Submission result
 */
export async function submitInsurance({
  policyProvider,
  policyNumber,
  coverageAmountPence,
  policyExpiryDate,
  pliFile,
  hasEmployees = false,
  eliFile = null,
  eliCoverageAmountPence = null,
  eliExpiryDate = null,
}) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  // Upload PLI document
  const pliDocumentPath = await uploadVerificationDocument(user.id, "insurance", pliFile);

  // Upload ELI document if applicable
  let eliDocumentPath = null;
  if (hasEmployees && eliFile) {
    eliDocumentPath = await uploadVerificationDocument(user.id, "insurance", eliFile);
  }

  // Call Edge Function
  const { data, error } = await supabase.functions.invoke("submit-insurance", {
    body: {
      policy_provider: policyProvider,
      policy_number: policyNumber,
      coverage_amount_pence: coverageAmountPence,
      policy_expiry_date: policyExpiryDate,
      pli_document_path: pliDocumentPath,
      has_employees: hasEmployees,
      eli_document_path: eliDocumentPath,
      eli_coverage_amount_pence: eliCoverageAmountPence,
      eli_expiry_date: eliExpiryDate,
    },
  });

  if (error) throw error;
  return data;
}

// ============================================================================
// Credentials Verification
// ============================================================================

/**
 * Submit credential via API lookup (Gas Safe)
 * @param {object} params
 * @param {string} params.credentialType - e.g., "gas_safe"
 * @param {string} params.registrationNumber - Licence/registration number
 * @returns {Promise<object>} - Verification result with API data
 */
export async function submitCredentialApiLookup({ credentialType, registrationNumber }) {
  const { data, error } = await supabase.functions.invoke("submit-credential", {
    body: {
      credential_type: credentialType,
      verification_method: "api_lookup",
      registration_number: registrationNumber,
    },
  });

  if (error) throw error;
  return data;
}

/**
 * Submit credential via manual entry (NICEIC, NAPIT, OFTEC)
 * @param {object} params
 * @param {string} params.credentialType - e.g., "niceic", "napit", "oftec"
 * @param {string} params.registrationNumber - Registration number
 * @param {string} params.expiryDate - Optional expiry date
 * @returns {Promise<object>} - Submission result
 */
export async function submitCredentialManualEntry({ credentialType, registrationNumber, expiryDate = null }) {
  const { data, error } = await supabase.functions.invoke("submit-credential", {
    body: {
      credential_type: credentialType,
      verification_method: "manual_entry",
      registration_number: registrationNumber,
      expiry_date: expiryDate,
    },
  });

  if (error) throw error;
  return data;
}

/**
 * Submit credential via document upload (NVQ, City & Guilds, DBS, Other)
 * @param {object} params
 * @param {string} params.credentialType - e.g., "nvq", "city_guilds", "dbs", "other"
 * @param {object} params.file - File object with uri, base64, mimeType
 * @param {string} params.customCredentialName - Required if credentialType is "other"
 * @param {string} params.expiryDate - Optional expiry date
 * @returns {Promise<object>} - Submission result
 */
export async function submitCredentialDocumentUpload({
  credentialType,
  file,
  customCredentialName = null,
  expiryDate = null,
}) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  // Upload document
  const documentPath = await uploadVerificationDocument(user.id, "credentials", file);

  // Call Edge Function
  const { data, error } = await supabase.functions.invoke("submit-credential", {
    body: {
      credential_type: credentialType,
      verification_method: "document_upload",
      document_path: documentPath,
      custom_credential_name: customCredentialName,
      expiry_date: expiryDate,
    },
  });

  if (error) throw error;
  return data;
}

// ============================================================================
// Helper: Convert coverage amount
// ============================================================================

/**
 * Convert coverage option value to pence
 * @param {string} value - Coverage option value (e.g., "2000000" for £2M)
 * @returns {number} - Amount in pence
 */
export function coverageToPence(value) {
  return parseInt(value, 10) * 100;
}

/**
 * Format pence as currency string
 * @param {number} pence - Amount in pence
 * @returns {string} - Formatted string (e.g., "£2,000,000")
 */
export function formatCoverage(pence) {
  const pounds = pence / 100;
  return `£${pounds.toLocaleString("en-GB")}`;
}
