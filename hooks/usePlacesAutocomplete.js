// hooks/usePlacesAutocomplete.js
import { useState, useCallback, useRef, useEffect } from 'react';
import { searchPlaces, getPlaceDetails } from '../lib/api/places';

/**
 * Custom hook for location autocomplete with debouncing
 * Works with Photon API (free, unlimited, no API key)
 * @param {object} options - Hook options
 * @param {number} options.debounceMs - Debounce delay in milliseconds (default: 300)
 * @param {string} options.countryCode - Country code filter (default: 'GB')
 * @param {number} options.minLength - Minimum input length to trigger search (default: 2)
 * @returns {object} Hook state and methods
 */
export function usePlacesAutocomplete(options = {}) {
  const {
    debounceMs = 300,
    countryCode = 'GB',
    minLength = 2,
  } = options;

  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedPlace, setSelectedPlace] = useState(null);

  const debounceTimeoutRef = useRef(null);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (debounceTimeoutRef.current) {
        clearTimeout(debounceTimeoutRef.current);
      }
    };
  }, []);

  // Perform the search
  const performSearch = useCallback(async (searchQuery) => {
    if (!searchQuery || searchQuery.length < minLength) {
      setResults([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);

    try {
      const predictions = await searchPlaces(searchQuery, {
        countryCode,
      });
      setResults(predictions);
    } catch (error) {
      console.log('Search error:', error);
      setResults([]);
    } finally {
      setIsLoading(false);
    }
  }, [countryCode, minLength]);

  // Handle input change with debouncing
  const handleInputChange = useCallback((text) => {
    setQuery(text);
    setSelectedPlace(null);

    // Clear existing timeout
    if (debounceTimeoutRef.current) {
      clearTimeout(debounceTimeoutRef.current);
    }

    // Set new timeout for debounced search
    debounceTimeoutRef.current = setTimeout(() => {
      performSearch(text);
    }, debounceMs);
  }, [performSearch, debounceMs]);

  // Handle place selection
  // Photon already returns full details, so no extra API call needed
  const handleSelect = useCallback(async (prediction) => {
    setIsLoading(true);
    setResults([]);
    setQuery(prediction.mainText);

    try {
      // Get place details (for Photon this just formats the data)
      const details = await getPlaceDetails(prediction);

      if (details) {
        setSelectedPlace({
          placeId: prediction.placeId,
          name: prediction.mainText,
          description: prediction.description,
          cityName: details.cityName || prediction.mainText,
          formattedAddress: details.formattedAddress,
          latitude: details.latitude || prediction.latitude,
          longitude: details.longitude || prediction.longitude,
        });
      }
    } catch (error) {
      console.log('Selection error:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Clear the search
  const clear = useCallback(() => {
    setQuery('');
    setResults([]);
    setSelectedPlace(null);
    if (debounceTimeoutRef.current) {
      clearTimeout(debounceTimeoutRef.current);
    }
  }, []);

  // Set initial value (for editing existing locations)
  const setValue = useCallback((place) => {
    if (place) {
      setSelectedPlace(place);
      setQuery(place.cityName || place.name || '');
    } else {
      clear();
    }
  }, [clear]);

  return {
    query,
    results,
    isLoading,
    selectedPlace,
    handleInputChange,
    handleSelect,
    clear,
    setValue,
    setQuery,
  };
}
