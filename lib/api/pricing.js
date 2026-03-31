// lib/api/pricing.js
// Pricing transparency: market price ranges by service type, region, and property type
// Seeded from UK benchmarks at launch, replaced by real platform data over time.

import { supabase } from "../supabase";

/**
 * Extract the region prefix from a UK postcode.
 * E.g. "B15 2TT" -> "B", "SW1A 1AA" -> "SW", "EC2R 8AH" -> "EC"
 *
 * @param {string} postcode
 * @returns {string} Region prefix (outward code letters)
 */
export function extractRegionFromPostcode(postcode) {
  const clean = String(postcode || "").trim().toUpperCase();
  // Match leading letters from the outward code (before any digit)
  const match = clean.match(/^([A-Z]{1,2})/);
  return match ? match[1] : "";
}

/**
 * Get the pricing benchmark for a specific service type in a region.
 * Returns null if no benchmark exists (component should not render).
 *
 * Falls back from exact region to broader match if no exact match found.
 * E.g. tries "SW" first, then checks if there's a national average.
 *
 * @param {object} params
 * @param {string} params.serviceTypeId - service_types.id
 * @param {string} params.postcode - Client postcode (used to derive region)
 * @param {string} params.propertyTypeId - Optional property_types.id for more specific pricing
 * @returns {Promise<object|null>} { price_low, price_median, price_high, sample_size, data_source } or null
 */
export async function getPricingBenchmark({
  serviceTypeId,
  postcode,
  propertyTypeId = null,
}) {
  if (!serviceTypeId || !postcode) return null;

  const region = extractRegionFromPostcode(postcode);
  if (!region) return null;

  // Try exact match with property type first
  if (propertyTypeId) {
    const { data: exact, error: exactErr } = await supabase
      .from("pricing_benchmarks")
      .select(
        "price_low, price_median, price_high, sample_size, data_source, region, last_updated"
      )
      .eq("service_type_id", serviceTypeId)
      .eq("region", region)
      .eq("property_type_id", propertyTypeId)
      .maybeSingle();

    if (!exactErr && exact) return exact;
  }

  // Try region match without property type
  const { data: regionMatch, error: regionErr } = await supabase
    .from("pricing_benchmarks")
    .select(
      "price_low, price_median, price_high, sample_size, data_source, region, last_updated"
    )
    .eq("service_type_id", serviceTypeId)
    .eq("region", region)
    .is("property_type_id", null)
    .maybeSingle();

  if (!regionErr && regionMatch) return regionMatch;

  // Fallback: try national average (region = "UK")
  const { data: national, error: nationalErr } = await supabase
    .from("pricing_benchmarks")
    .select(
      "price_low, price_median, price_high, sample_size, data_source, region, last_updated"
    )
    .eq("service_type_id", serviceTypeId)
    .eq("region", "UK")
    .is("property_type_id", null)
    .maybeSingle();

  if (!nationalErr && national) return national;

  // No benchmark found — component should not render
  return null;
}

/**
 * Admin: list all pricing benchmarks
 * @returns {Promise<object[]>}
 */
export async function getAllBenchmarks() {
  const { data, error } = await supabase
    .from("pricing_benchmarks")
    .select(
      `
      id, region, price_low, price_median, price_high, sample_size,
      data_source, last_updated, created_at,
      service_type:service_type_id (
        id, name,
        service_categories:category_id (
          id, name
        )
      ),
      property_type:property_type_id (
        id, name
      )
    `
    )
    .order("service_type_id", { ascending: true })
    .order("region", { ascending: true });

  if (error) throw error;
  return data || [];
}

/**
 * Admin: seed or update a pricing benchmark row
 * Uses upsert so it can both create and update.
 *
 * @param {object} params
 * @param {string} params.serviceTypeId
 * @param {string} params.region - Region code (e.g. "B", "SW", "UK")
 * @param {string|null} params.propertyTypeId
 * @param {number} params.priceLow - Lower bound in GBP
 * @param {number} params.priceMedian - Median price in GBP
 * @param {number} params.priceHigh - Upper bound in GBP
 * @param {number} params.sampleSize - 0 for seeded data
 * @param {string} params.dataSource - "seeded" or "platform"
 * @returns {Promise<object>}
 */
export async function upsertBenchmark({
  serviceTypeId,
  region,
  propertyTypeId = null,
  priceLow,
  priceMedian,
  priceHigh,
  sampleSize = 0,
  dataSource = "seeded",
}) {
  if (!serviceTypeId || !region) {
    throw new Error("Service type and region are required.");
  }
  if (priceLow == null || priceMedian == null || priceHigh == null) {
    throw new Error("All price values (low, median, high) are required.");
  }
  if (priceLow > priceMedian || priceMedian > priceHigh) {
    throw new Error("Prices must be in order: low <= median <= high.");
  }

  const { data, error } = await supabase
    .from("pricing_benchmarks")
    .upsert(
      {
        service_type_id: serviceTypeId,
        region: region.toUpperCase(),
        property_type_id: propertyTypeId || null,
        price_low: Math.round(Number(priceLow)),
        price_median: Math.round(Number(priceMedian)),
        price_high: Math.round(Number(priceHigh)),
        sample_size: Number(sampleSize) || 0,
        data_source: dataSource,
        last_updated: new Date().toISOString(),
      },
      {
        onConflict: "service_type_id,region,property_type_id",
        ignoreDuplicates: false,
      }
    )
    .select()
    .maybeSingle();

  if (error) throw error;
  return data;
}

export default {
  extractRegionFromPostcode,
  getPricingBenchmark,
  getAllBenchmarks,
  upsertBenchmark,
};
