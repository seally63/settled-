// lib/api/services.js
import { supabase } from "../supabase";

/**
 * Fetch all active service categories ordered by display_order
 */
export async function getServiceCategories() {
  const { data, error } = await supabase
    .from("service_categories")
    .select("id, name, icon, display_order")
    .eq("is_active", true)
    .order("display_order", { ascending: true });

  if (error) throw error;
  return data || [];
}

/**
 * Fetch service types for a specific category
 * Includes job_profile for context-aware budget/timing options
 */
export async function getServiceTypes(categoryId) {
  if (!categoryId) return [];

  const { data, error } = await supabase
    .from("service_types")
    .select("id, name, icon, display_order, job_profile")
    .eq("category_id", categoryId)
    .eq("is_active", true)
    .order("display_order", { ascending: true });

  if (error) throw error;
  return data || [];
}

/**
 * Fetch all property types
 */
export async function getPropertyTypes() {
  const { data, error } = await supabase
    .from("property_types")
    .select("id, name, display_order")
    .eq("is_active", true)
    .order("display_order", { ascending: true });

  if (error) throw error;
  return data || [];
}

/**
 * Fetch all timing options
 */
export async function getTimingOptions() {
  const { data, error } = await supabase
    .from("timing_options")
    .select("id, name, description, is_emergency, display_order")
    .eq("is_active", true)
    .order("display_order", { ascending: true });

  if (error) throw error;
  return data || [];
}

export default {
  getServiceCategories,
  getServiceTypes,
  getPropertyTypes,
  getTimingOptions,
};
