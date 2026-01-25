// lib/api/places.js
// Photon Geocoding API (Free, unlimited, true autocomplete, powered by OpenStreetMap)
// No API key required - hosted by Komoot

const PHOTON_URL = 'https://photon.komoot.io/api';

/**
 * Search for places using Photon Autocomplete API
 * @param {string} input - Search query
 * @param {object} options - Search options
 * @param {string} options.countryCode - Country code filter (e.g., 'GB' for UK)
 * @param {number} options.limit - Max number of results (default: 10)
 * @returns {Promise<Array>} Array of place predictions
 */
export async function searchPlaces(input, options = {}) {
  if (!input || input.length < 2) {
    return [];
  }

  const {
    countryCode = 'GB', // Default to UK (Photon uses uppercase)
    limit = 10,
  } = options;

  try {
    // Fetch more results initially, then filter down
    const params = new URLSearchParams({
      q: input,
      limit: '20', // Fetch more to allow for filtering
      lang: 'en',
    });

    const response = await fetch(`${PHOTON_URL}?${params}`);
    const data = await response.json();

    if (data.features && data.features.length > 0) {
      return data.features
        .filter((feature) => {
          // Filter for UK results if countryCode is GB
          if (countryCode === 'GB') {
            const country = feature.properties?.country;
            return country === 'United Kingdom' ||
                   country === 'England' ||
                   country === 'Scotland' ||
                   country === 'Wales' ||
                   country === 'Northern Ireland';
          }
          return true;
        })
        .filter((feature) => {
          // Filter for place types - be more inclusive for smaller towns
          const type = feature.properties?.type;
          const osmKey = feature.properties?.osm_key;

          // Include common place types
          const validTypes = [
            'city', 'town', 'village', 'suburb', 'neighbourhood',
            'locality', 'district', 'borough', 'hamlet', 'municipality',
            'administrative', 'residential'
          ];

          // Also include if it's a place-type osm_key
          const validOsmKeys = ['place', 'boundary'];

          return validTypes.includes(type) || validOsmKeys.includes(osmKey);
        })
        .slice(0, limit)
        .map((feature) => {
          const props = feature.properties || {};
          const coords = feature.geometry?.coordinates || [];

          // Get the main place name
          const mainText = props.name || props.city || props.town || props.village || '';

          // Build secondary text from available components
          const secondaryParts = [];
          if (props.county) secondaryParts.push(props.county);
          if (props.state) secondaryParts.push(props.state);
          if (props.country && props.country !== 'United Kingdom') {
            secondaryParts.push(props.country);
          }
          const secondaryText = secondaryParts.join(', ');

          return {
            placeId: `${coords[1]}_${coords[0]}_${props.osm_id || mainText}`,
            description: [mainText, secondaryText].filter(Boolean).join(', '),
            mainText: mainText,
            secondaryText: secondaryText,
            latitude: coords[1], // Photon returns [lng, lat]
            longitude: coords[0],
            properties: props,
          };
        });
    }

    return [];
  } catch (error) {
    console.log('Photon search error:', error.message);
    return [];
  }
}

/**
 * Get detailed place information
 * Photon returns full details in search, so this just formats the data
 * @param {object} prediction - The prediction object from searchPlaces
 * @returns {Promise<object|null>} Place details with coordinates
 */
export async function getPlaceDetails(prediction) {
  if (!prediction) {
    return null;
  }

  // Photon already returns full details including coordinates
  return {
    placeId: prediction.placeId,
    name: prediction.mainText,
    formattedAddress: prediction.description,
    cityName: prediction.mainText,
    latitude: prediction.latitude,
    longitude: prediction.longitude,
  };
}

/**
 * Generate a unique session token (kept for API compatibility)
 * Photon doesn't use session tokens
 * @returns {string} UUID session token
 */
export function generateSessionToken() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

// ============================================================================
// UK Postcode Geocoding (using postcodes.io - free, no API key required)
// ============================================================================

const POSTCODES_IO_URL = 'https://api.postcodes.io';

/**
 * Geocode a UK postcode to get coordinates
 * Uses postcodes.io which is free and specifically designed for UK postcodes
 * Falls back to outcode (e.g., "G1") if full postcode doesn't exist
 * @param {string} postcode - UK postcode (e.g., "SW1A 1AA" or "SW1A1AA")
 * @returns {Promise<object|null>} Location data with coordinates
 */
export async function geocodeUKPostcode(postcode) {
  if (!postcode || postcode.length < 2) {
    return null;
  }

  // Clean the postcode (remove spaces, uppercase)
  const cleanPostcode = postcode.replace(/\s+/g, '').toUpperCase();

  try {
    // First try the full postcode
    const response = await fetch(`${POSTCODES_IO_URL}/postcodes/${encodeURIComponent(cleanPostcode)}`);
    const data = await response.json();

    if (data.status === 200 && data.result) {
      const result = data.result;
      return {
        postcode: result.postcode,
        latitude: result.latitude,
        longitude: result.longitude,
        // Additional useful data
        region: result.region,
        country: result.country,
        admin_district: result.admin_district, // e.g., "Westminster"
        parish: result.parish,
        outcode: result.outcode, // e.g., "SW1A"
        incode: result.incode,   // e.g., "1AA"
        isApproximate: false,
      };
    }

    // Full postcode not found - try outcode fallback
    // Extract outcode: UK postcodes are "OUTCODE INCODE" where outcode is 2-4 chars
    const outcodeMatch = cleanPostcode.match(/^([A-Z]{1,2}\d{1,2}[A-Z]?)/);
    if (outcodeMatch) {
      const outcode = outcodeMatch[1];
      const outcodeResponse = await fetch(`${POSTCODES_IO_URL}/outcodes/${encodeURIComponent(outcode)}`);
      const outcodeData = await outcodeResponse.json();

      if (outcodeData.status === 200 && outcodeData.result) {
        const result = outcodeData.result;
        return {
          postcode: cleanPostcode, // Keep original input
          latitude: result.latitude,
          longitude: result.longitude,
          region: result.admin_county?.[0] || null,
          country: result.country?.[0] || null,
          admin_district: result.admin_district?.[0] || null,
          parish: result.parish?.[0] || null,
          outcode: result.outcode,
          incode: null,
          isApproximate: true, // Flag that this is outcode-level accuracy
        };
      }
    }

    return null;
  } catch (error) {
    console.log('Postcode geocoding error:', error.message);
    return null;
  }
}

/**
 * Validate a UK postcode format
 * @param {string} postcode - UK postcode to validate
 * @returns {Promise<boolean>} Whether the postcode is valid
 */
export async function validateUKPostcode(postcode) {
  if (!postcode || postcode.length < 5) {
    return false;
  }

  const cleanPostcode = postcode.replace(/\s+/g, '').toUpperCase();

  try {
    const response = await fetch(`${POSTCODES_IO_URL}/postcodes/${encodeURIComponent(cleanPostcode)}/validate`);
    const data = await response.json();
    return data.status === 200 && data.result === true;
  } catch (error) {
    console.log('Postcode validation error:', error.message);
    return false;
  }
}

/**
 * Autocomplete UK postcodes (partial postcode search)
 * @param {string} partialPostcode - Partial postcode (e.g., "SW1")
 * @param {number} limit - Max results (default: 10)
 * @returns {Promise<Array>} Array of matching postcodes
 */
export async function autocompleteUKPostcode(partialPostcode, limit = 10) {
  if (!partialPostcode || partialPostcode.length < 2) {
    return [];
  }

  try {
    const response = await fetch(
      `${POSTCODES_IO_URL}/postcodes/${encodeURIComponent(partialPostcode)}/autocomplete?limit=${limit}`
    );
    const data = await response.json();

    if (data.status === 200 && data.result) {
      return data.result;
    }

    return [];
  } catch (error) {
    console.log('Postcode autocomplete error:', error.message);
    return [];
  }
}

/**
 * Bulk geocode multiple UK postcodes
 * @param {Array<string>} postcodes - Array of postcodes to geocode
 * @returns {Promise<Array>} Array of location data
 */
export async function bulkGeocodeUKPostcodes(postcodes) {
  if (!postcodes || postcodes.length === 0) {
    return [];
  }

  // postcodes.io supports bulk lookup up to 100 postcodes
  const cleanPostcodes = postcodes
    .map(p => p.replace(/\s+/g, '').toUpperCase())
    .slice(0, 100);

  try {
    const response = await fetch(`${POSTCODES_IO_URL}/postcodes`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ postcodes: cleanPostcodes }),
    });
    const data = await response.json();

    if (data.status === 200 && data.result) {
      return data.result
        .filter(item => item.result !== null)
        .map(item => ({
          postcode: item.result.postcode,
          latitude: item.result.latitude,
          longitude: item.result.longitude,
          region: item.result.region,
          country: item.result.country,
          admin_district: item.result.admin_district,
        }));
    }

    return [];
  } catch (error) {
    console.log('Bulk postcode geocoding error:', error.message);
    return [];
  }
}
