// lib/supabase.js
import { createClient } from '@supabase/supabase-js';
import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Environment configurations
const ENVIRONMENTS = {
  production: {
    url: 'https://ncwbkoriohrkvulvzzuw.supabase.co',
    anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5jd2Jrb3Jpb2hya3Z1bHZ6enV3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTMzNjkxMDIsImV4cCI6MjA2ODk0NTEwMn0.LgtWyYKBUWEdxDoTCOaZfyFtWc4gpNLU6FSrvn-DMuU',
  },
  local: {
    // Default local Supabase settings - update these after running `supabase start`
    url: 'http://127.0.0.1:54321',
    anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0',
  },
};

// Storage keys
const ENV_STORAGE_KEY = '@tradify_environment';
const FALLBACK_ENABLED_KEY = '@tradify_fallback_enabled';

// State
let currentEnv = 'production';
let fallbackEnabled = true;
let isUsingFallback = false;
let supabaseInstance = null;
let connectionRetryCount = 0;
const MAX_RETRIES = 2;

/**
 * Create Supabase client for a specific environment
 */
function createSupabaseClient(env) {
  const config = ENVIRONMENTS[env];
  if (!config) {
    console.error(`[Supabase] Invalid environment: ${env}`);
    return null;
  }

  console.log(`[Supabase] Creating client for ${env}: ${config.url}`);

  return createClient(config.url, config.anonKey, {
    auth: {
      storage: AsyncStorage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
  });
}

/**
 * Get or create the Supabase client
 */
function getClient() {
  if (!supabaseInstance) {
    const env = isUsingFallback ? 'local' : currentEnv;
    supabaseInstance = createSupabaseClient(env);
  }
  return supabaseInstance;
}

/**
 * Initialize environment from stored preference
 */
export async function initializeSupabase() {
  try {
    const storedEnv = await AsyncStorage.getItem(ENV_STORAGE_KEY);
    if (storedEnv && ENVIRONMENTS[storedEnv]) {
      currentEnv = storedEnv;
    }

    const storedFallback = await AsyncStorage.getItem(FALLBACK_ENABLED_KEY);
    if (storedFallback !== null) {
      fallbackEnabled = storedFallback === 'true';
    }

    console.log(`[Supabase] Initialized: env=${currentEnv}, fallback=${fallbackEnabled}`);

    // Create initial client
    supabaseInstance = createSupabaseClient(currentEnv);

    return getEnvironmentStatus();
  } catch (e) {
    console.warn('[Supabase] Failed to load preferences:', e.message);
    supabaseInstance = createSupabaseClient('production');
    return getEnvironmentStatus();
  }
}

/**
 * Get current environment status
 */
export function getEnvironmentStatus() {
  return {
    currentEnv,
    fallbackEnabled,
    isUsingFallback,
    activeEnv: isUsingFallback ? 'local' : currentEnv,
    connectionRetryCount,
  };
}

/**
 * Switch environment
 * @param {'production' | 'local'} env
 */
export async function switchEnvironment(env) {
  if (!ENVIRONMENTS[env]) {
    throw new Error(`Invalid environment: ${env}`);
  }

  console.log(`[Supabase] Switching to ${env}`);

  currentEnv = env;
  isUsingFallback = false;
  connectionRetryCount = 0;

  // Recreate client
  supabaseInstance = createSupabaseClient(env);

  try {
    await AsyncStorage.setItem(ENV_STORAGE_KEY, env);
  } catch (e) {
    console.warn('[Supabase] Failed to save environment:', e.message);
  }

  return getEnvironmentStatus();
}

/**
 * Toggle fallback setting
 * @param {boolean} enabled
 */
export async function setFallbackEnabled(enabled) {
  fallbackEnabled = enabled;

  try {
    await AsyncStorage.setItem(FALLBACK_ENABLED_KEY, enabled.toString());
  } catch (e) {
    console.warn('[Supabase] Failed to save fallback setting:', e.message);
  }

  console.log(`[Supabase] Fallback enabled: ${enabled}`);
  return getEnvironmentStatus();
}

/**
 * Handle connection failure - try fallback if enabled
 * @returns {boolean} Whether fallback was activated
 */
export function handleConnectionFailure() {
  connectionRetryCount++;

  if (fallbackEnabled && currentEnv === 'production' && !isUsingFallback && connectionRetryCount >= MAX_RETRIES) {
    console.log('[Supabase] Production failed, activating local fallback');
    isUsingFallback = true;
    supabaseInstance = createSupabaseClient('local');
    return true;
  }

  return false;
}

/**
 * Reset to primary environment
 */
export function resetToPrimary() {
  if (isUsingFallback) {
    console.log('[Supabase] Resetting to primary environment');
    isUsingFallback = false;
    connectionRetryCount = 0;
    supabaseInstance = createSupabaseClient(currentEnv);
  }
  return getEnvironmentStatus();
}

/**
 * Test connection to an environment
 * @param {'production' | 'local'} env
 */
export async function testConnection(env) {
  const config = ENVIRONMENTS[env];
  if (!config) {
    return { success: false, error: 'Invalid environment' };
  }

  const startTime = Date.now();

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    const response = await fetch(`${config.url}/rest/v1/`, {
      method: 'HEAD',
      headers: {
        apikey: config.anonKey,
        Authorization: `Bearer ${config.anonKey}`,
      },
      signal: controller.signal,
    });

    clearTimeout(timeoutId);
    const latency = Date.now() - startTime;

    // 400 is ok - server responded but no table specified
    if (response.ok || response.status === 400) {
      return { success: true, latency, status: response.status };
    }

    return { success: false, error: `HTTP ${response.status}`, latency };
  } catch (e) {
    const latency = Date.now() - startTime;
    return { success: false, error: e.message, latency };
  }
}

/**
 * Wrapper for Supabase calls with automatic fallback
 * @param {Function} operation - Async function that uses supabase
 */
export async function withFallback(operation) {
  try {
    const result = await operation(getClient());

    // Check for egress/quota errors
    if (result.error) {
      const errorMsg = (result.error.message || '').toLowerCase();
      if (
        errorMsg.includes('egress') ||
        errorMsg.includes('quota') ||
        errorMsg.includes('limit') ||
        errorMsg.includes('exceeded')
      ) {
        console.warn('[Supabase] Quota error detected:', result.error.message);
        if (handleConnectionFailure()) {
          // Retry with fallback
          return await operation(getClient());
        }
      }
    }

    return result;
  } catch (e) {
    console.error('[Supabase] Operation failed:', e.message);

    if (handleConnectionFailure()) {
      // Retry with fallback
      try {
        return await operation(getClient());
      } catch (retryError) {
        console.error('[Supabase] Fallback also failed:', retryError.message);
        throw retryError;
      }
    }

    throw e;
  }
}

// Create initial client (production by default)
supabaseInstance = createSupabaseClient('production');

// Export the client and auth
export const supabase = new Proxy({}, {
  get(target, prop) {
    const client = getClient();
    if (typeof client[prop] === 'function') {
      return client[prop].bind(client);
    }
    return client[prop];
  },
});

export const auth = new Proxy({}, {
  get(target, prop) {
    const client = getClient();
    if (typeof client.auth[prop] === 'function') {
      return client.auth[prop].bind(client.auth);
    }
    return client.auth[prop];
  },
});

export const database = (table) => getClient().from(table);

// Export environment info
export const ENV = ENVIRONMENTS;
