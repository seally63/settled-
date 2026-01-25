// lib/config/environment.js
// Environment configuration with local/production switching and fallback support

import AsyncStorage from "@react-native-async-storage/async-storage";

// Environment configurations
const ENVIRONMENTS = {
  production: {
    name: "production",
    supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL,
    supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
  },
  local: {
    name: "local",
    // Default local Supabase settings (adjust port if needed)
    supabaseUrl: "http://localhost:54321",
    supabaseAnonKey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0",
  },
};

// Storage key for environment preference
const ENV_STORAGE_KEY = "@tradify_environment";
const FALLBACK_ENABLED_KEY = "@tradify_fallback_enabled";

// Current environment state
let currentEnvironment = "production";
let fallbackEnabled = true;
let isUsingFallback = false;

/**
 * Initialize environment from stored preference
 */
export async function initializeEnvironment() {
  try {
    const storedEnv = await AsyncStorage.getItem(ENV_STORAGE_KEY);
    if (storedEnv && ENVIRONMENTS[storedEnv]) {
      currentEnvironment = storedEnv;
    }

    const storedFallback = await AsyncStorage.getItem(FALLBACK_ENABLED_KEY);
    if (storedFallback !== null) {
      fallbackEnabled = storedFallback === "true";
    }

    console.log(`[ENV] Initialized: ${currentEnvironment}, fallback: ${fallbackEnabled}`);
    return getCurrentConfig();
  } catch (e) {
    console.warn("[ENV] Failed to load environment preference:", e.message);
    return getCurrentConfig();
  }
}

/**
 * Get current environment configuration
 */
export function getCurrentConfig() {
  const env = isUsingFallback ? "local" : currentEnvironment;
  return {
    ...ENVIRONMENTS[env],
    isUsingFallback,
    fallbackEnabled,
    currentEnvironment,
  };
}

/**
 * Get current environment name
 */
export function getCurrentEnvironment() {
  return currentEnvironment;
}

/**
 * Check if currently using fallback
 */
export function getIsUsingFallback() {
  return isUsingFallback;
}

/**
 * Check if fallback is enabled
 */
export function getFallbackEnabled() {
  return fallbackEnabled;
}

/**
 * Switch to a different environment
 * @param {"production" | "local"} env - Environment to switch to
 */
export async function setEnvironment(env) {
  if (!ENVIRONMENTS[env]) {
    throw new Error(`Invalid environment: ${env}`);
  }

  currentEnvironment = env;
  isUsingFallback = false;

  try {
    await AsyncStorage.setItem(ENV_STORAGE_KEY, env);
    console.log(`[ENV] Switched to: ${env}`);
  } catch (e) {
    console.warn("[ENV] Failed to save environment preference:", e.message);
  }

  return getCurrentConfig();
}

/**
 * Toggle fallback enabled/disabled
 * @param {boolean} enabled - Whether fallback should be enabled
 */
export async function setFallbackEnabled(enabled) {
  fallbackEnabled = enabled;

  try {
    await AsyncStorage.setItem(FALLBACK_ENABLED_KEY, enabled.toString());
    console.log(`[ENV] Fallback enabled: ${enabled}`);
  } catch (e) {
    console.warn("[ENV] Failed to save fallback preference:", e.message);
  }

  return getCurrentConfig();
}

/**
 * Activate fallback to local environment
 * Called when production connection fails
 */
export function activateFallback() {
  if (fallbackEnabled && currentEnvironment === "production") {
    isUsingFallback = true;
    console.log("[ENV] Activated fallback to local environment");
    return true;
  }
  return false;
}

/**
 * Reset fallback state (try production again)
 */
export function resetFallback() {
  isUsingFallback = false;
  console.log("[ENV] Reset fallback, will try production");
}

/**
 * Get Supabase configuration for current environment
 */
export function getSupabaseConfig() {
  const config = getCurrentConfig();
  return {
    url: config.supabaseUrl,
    anonKey: config.supabaseAnonKey,
  };
}

/**
 * Test connection to a specific environment
 * @param {"production" | "local"} env - Environment to test
 * @returns {Promise<{success: boolean, latency?: number, error?: string}>}
 */
export async function testConnection(env) {
  const config = ENVIRONMENTS[env];
  if (!config) {
    return { success: false, error: "Invalid environment" };
  }

  const startTime = Date.now();

  try {
    const response = await fetch(`${config.supabaseUrl}/rest/v1/`, {
      method: "HEAD",
      headers: {
        apikey: config.supabaseAnonKey,
        Authorization: `Bearer ${config.supabaseAnonKey}`,
      },
      // Short timeout for connection test
      signal: AbortSignal.timeout(5000),
    });

    const latency = Date.now() - startTime;

    if (response.ok || response.status === 400) {
      // 400 is ok - means server responded but no table specified
      return { success: true, latency };
    } else {
      return { success: false, error: `HTTP ${response.status}`, latency };
    }
  } catch (e) {
    const latency = Date.now() - startTime;
    return { success: false, error: e.message, latency };
  }
}

export default {
  initializeEnvironment,
  getCurrentConfig,
  getCurrentEnvironment,
  getIsUsingFallback,
  getFallbackEnabled,
  setEnvironment,
  setFallbackEnabled,
  activateFallback,
  resetFallback,
  getSupabaseConfig,
  testConnection,
  ENVIRONMENTS,
};
