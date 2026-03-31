// lib/api/enquiries.js
// Direct client-to-trade enquiries (V2 browse-and-choose flow)

import { supabase } from "../supabase";
import { geocodeUKPostcode } from "./places";

const ENQUIRY_VALIDATION = {
  MESSAGE_MIN: 10,
  MESSAGE_MAX: 2000,
  MAX_PHOTOS: 5,
  POSTCODE_PATTERN: /^[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}$/i,
};

/** Get the current authenticated user id */
async function getUserId() {
  const { data, error } = await supabase.auth.getUser();
  if (error) throw error;
  return data?.user?.id || null;
}

/**
 * Create a new enquiry from a client to a specific trade
 * Geocodes the postcode automatically before inserting.
 *
 * @param {object} params
 * @param {string} params.tradeId - Trade profile ID
 * @param {string} params.message - Client's description of the job
 * @param {string[]} params.photos - Optional array of photo URLs
 * @param {string} params.serviceCategoryId - Optional service category
 * @param {string} params.postcode - UK postcode for job location
 * @param {string} params.propertyTypeId - Optional property type
 * @returns {Promise<object>} The created enquiry
 */
export async function createEnquiry({
  tradeId,
  message,
  photos = [],
  serviceCategoryId = null,
  postcode,
  propertyTypeId = null,
}) {
  const uid = await getUserId();
  if (!uid) throw new Error("Not signed in");

  // Validate message
  const trimmedMessage = String(message || "").trim();
  if (trimmedMessage.length < ENQUIRY_VALIDATION.MESSAGE_MIN) {
    throw new Error(
      `Please describe what you need in at least ${ENQUIRY_VALIDATION.MESSAGE_MIN} characters.`
    );
  }
  if (trimmedMessage.length > ENQUIRY_VALIDATION.MESSAGE_MAX) {
    throw new Error(
      `Message must be ${ENQUIRY_VALIDATION.MESSAGE_MAX} characters or less.`
    );
  }

  // Validate postcode
  const cleanPostcode = String(postcode || "").trim().toUpperCase();
  if (!ENQUIRY_VALIDATION.POSTCODE_PATTERN.test(cleanPostcode)) {
    throw new Error("Please enter a valid UK postcode.");
  }

  // Validate photos count
  if (photos.length > ENQUIRY_VALIDATION.MAX_PHOTOS) {
    throw new Error(`Maximum ${ENQUIRY_VALIDATION.MAX_PHOTOS} photos allowed.`);
  }

  // Validate trade exists
  if (!tradeId) throw new Error("Trade ID is required.");

  // Geocode the postcode
  const location = await geocodeUKPostcode(cleanPostcode);
  if (!location) throw new Error("Could not find that postcode. Please check and try again.");

  const { data, error } = await supabase
    .from("enquiries")
    .insert({
      client_id: uid,
      trade_id: tradeId,
      message: trimmedMessage,
      photos: photos.length > 0 ? photos : [],
      service_category_id: serviceCategoryId || null,
      postcode: cleanPostcode,
      lat: location.latitude,
      lon: location.longitude,
      property_type_id: propertyTypeId || null,
      status: "open",
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

/**
 * Fetch enquiries received by the authenticated trade
 * @param {string|null} status - Optional status filter
 * @returns {Promise<object[]>}
 */
export async function getTradeEnquiries(status = null) {
  const uid = await getUserId();
  if (!uid) throw new Error("Not signed in");

  let query = supabase
    .from("enquiries")
    .select(
      `
      id, message, photos, postcode, lat, lon, status, created_at, updated_at,
      service_category_id,
      property_type_id,
      client:client_id (
        id, full_name, photo_url, town_city
      ),
      service_categories:service_category_id (
        id, name
      )
    `
    )
    .eq("trade_id", uid)
    .order("created_at", { ascending: false });

  if (status) {
    query = query.eq("status", status);
  }

  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

/**
 * Fetch enquiries sent by the authenticated client
 * @param {string|null} status - Optional status filter
 * @returns {Promise<object[]>}
 */
export async function getClientEnquiries(status = null) {
  const uid = await getUserId();
  if (!uid) throw new Error("Not signed in");

  let query = supabase
    .from("enquiries")
    .select(
      `
      id, message, photos, postcode, lat, lon, status, created_at, updated_at,
      service_category_id,
      property_type_id,
      trade:trade_id (
        id, full_name, business_name, trade_title, photo_url, town_city
      ),
      service_categories:service_category_id (
        id, name
      )
    `
    )
    .eq("client_id", uid)
    .order("created_at", { ascending: false });

  if (status) {
    query = query.eq("status", status);
  }

  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

/**
 * Get a single enquiry by ID with full trade and client info
 * @param {string} enquiryId
 * @returns {Promise<object|null>}
 */
export async function getEnquiryById(enquiryId) {
  if (!enquiryId) return null;

  const { data, error } = await supabase
    .from("enquiries")
    .select(
      `
      id, message, photos, postcode, lat, lon, status, created_at, updated_at,
      service_category_id,
      property_type_id,
      client:client_id (
        id, full_name, photo_url, town_city, phone
      ),
      trade:trade_id (
        id, full_name, business_name, trade_title, photo_url, town_city
      ),
      service_categories:service_category_id (
        id, name
      ),
      property_types:property_type_id (
        id, name
      )
    `
    )
    .eq("id", enquiryId)
    .maybeSingle();

  if (error) throw error;
  return data || null;
}

/**
 * Update the status of an enquiry
 * Both client and trade can update (enforced by RLS)
 *
 * @param {string} enquiryId
 * @param {string} newStatus - open | responded | quoted | hired | completed | cancelled
 * @returns {Promise<object>}
 */
export async function updateEnquiryStatus(enquiryId, newStatus) {
  const validStatuses = [
    "open",
    "responded",
    "quoted",
    "hired",
    "completed",
    "cancelled",
  ];
  if (!validStatuses.includes(newStatus)) {
    throw new Error(`Invalid status: ${newStatus}`);
  }

  const { data, error } = await supabase
    .from("enquiries")
    .update({
      status: newStatus,
      updated_at: new Date().toISOString(),
    })
    .eq("id", enquiryId)
    .select()
    .maybeSingle();

  if (error) throw error;
  return data;
}

export default {
  createEnquiry,
  getTradeEnquiries,
  getClientEnquiries,
  getEnquiryById,
  updateEnquiryStatus,
};
