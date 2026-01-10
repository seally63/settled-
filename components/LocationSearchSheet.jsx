// components/LocationSearchSheet.jsx
// Reusable location search bottom sheet using Google Places Autocomplete

import { useState, useEffect } from 'react';
import {
  StyleSheet,
  View,
  Modal,
  Pressable,
  TextInput,
  FlatList,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import ThemedText from './ThemedText';
import Spacer from './Spacer';
import { Colors } from '../constants/Colors';
import { usePlacesAutocomplete } from '../hooks/usePlacesAutocomplete';

const TINT = Colors.primary;

/**
 * Reusable location search bottom sheet component
 * @param {object} props
 * @param {boolean} props.visible - Whether the modal is visible
 * @param {function} props.onClose - Callback when modal is closed
 * @param {function} props.onSelect - Callback when a location is selected, receives { cityName, placeId, description, latitude, longitude }
 * @param {string} props.title - Modal title (default: "Search location")
 * @param {string} props.placeholder - Search input placeholder (default: "Search city or town...")
 * @param {string} props.types - Google Places types filter (default: "(cities)")
 * @param {string} props.components - Country filter (default: "country:gb")
 * @param {boolean} props.allowMultiple - Allow selecting multiple locations (for service areas)
 * @param {Array} props.selectedLocations - Currently selected locations (for multi-select mode)
 */
export default function LocationSearchSheet({
  visible,
  onClose,
  onSelect,
  title = 'Search location',
  placeholder = 'Search city or town...',
  types = '(cities)',
  components = 'country:gb',
  allowMultiple = false,
  selectedLocations = [],
}) {
  const {
    query,
    results,
    isLoading,
    selectedPlace,
    handleInputChange,
    handleSelect,
    clear,
  } = usePlacesAutocomplete({
    types,
    components,
    debounceMs: 300,
    minLength: 2,
  });

  // When a place is fully selected (with details), notify parent
  useEffect(() => {
    if (selectedPlace && selectedPlace.latitude) {
      onSelect({
        cityName: selectedPlace.cityName || selectedPlace.name,
        placeId: selectedPlace.placeId,
        description: selectedPlace.description,
        latitude: selectedPlace.latitude,
        longitude: selectedPlace.longitude,
      });
      clear();
      if (!allowMultiple) {
        onClose();
      }
    }
  }, [selectedPlace]);

  const handleClose = () => {
    clear();
    onClose();
  };

  const handleLocationPress = async (prediction) => {
    // Check if already selected (for multi-select)
    if (allowMultiple && selectedLocations.some(loc => loc.placeId === prediction.placeId)) {
      // Already selected, maybe remove it?
      return;
    }
    await handleSelect(prediction);
  };

  const isSelected = (placeId) => {
    return selectedLocations.some(loc => loc.placeId === placeId);
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={handleClose}
    >
      <View style={styles.sheetOverlay}>
        <Pressable style={styles.sheetBackdrop} onPress={handleClose} />
        <View style={styles.sheetContent}>
          <View style={styles.sheetHeader}>
            <ThemedText style={styles.sheetTitle}>{title}</ThemedText>
            <Pressable onPress={handleClose} hitSlop={10}>
              <Ionicons name="close" size={24} color={Colors.light.title} />
            </Pressable>
          </View>

          <Spacer height={16} />

          {/* Search Input */}
          <View style={styles.sheetSearchContainer}>
            <Ionicons name="search" size={20} color={Colors.light.subtitle} />
            <TextInput
              style={styles.sheetSearchInput}
              placeholder={placeholder}
              placeholderTextColor={Colors.light.subtitle}
              value={query}
              onChangeText={handleInputChange}
              autoCapitalize="none"
              autoFocus
            />
            {isLoading ? (
              <ActivityIndicator size="small" color={Colors.light.subtitle} />
            ) : query.length > 0 ? (
              <Pressable onPress={clear} hitSlop={10}>
                <Ionicons name="close-circle" size={20} color={Colors.light.subtitle} />
              </Pressable>
            ) : null}
          </View>

          <Spacer height={16} />

          {/* Location Results */}
          {query.length < 2 ? (
            <View style={styles.sheetEmptyState}>
              <ThemedText style={styles.sheetEmptyText}>
                Type at least 2 characters to search
              </ThemedText>
            </View>
          ) : isLoading ? (
            <View style={styles.sheetEmptyState}>
              <ActivityIndicator size="small" color={TINT} />
              <Spacer height={12} />
              <ThemedText style={styles.sheetEmptyText}>
                Searching...
              </ThemedText>
            </View>
          ) : results.length === 0 ? (
            <View style={styles.sheetEmptyState}>
              <ThemedText style={styles.sheetEmptyText}>
                No locations found
              </ThemedText>
            </View>
          ) : (
            <FlatList
              data={results}
              keyExtractor={(item) => item.placeId}
              style={styles.sheetList}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              renderItem={({ item }) => {
                const selected = isSelected(item.placeId);
                return (
                  <Pressable
                    style={[styles.sheetListItem, selected && styles.sheetListItemSelected]}
                    onPress={() => handleLocationPress(item)}
                    disabled={selected}
                  >
                    <Ionicons
                      name={selected ? "checkmark-circle" : "location-outline"}
                      size={20}
                      color={selected ? TINT : Colors.light.subtitle}
                    />
                    <View style={styles.locationItemContent}>
                      <ThemedText style={[styles.sheetListItemText, selected && styles.selectedText]}>
                        {item.mainText}
                      </ThemedText>
                      {item.secondaryText ? (
                        <ThemedText style={styles.locationSecondaryText}>
                          {item.secondaryText}
                        </ThemedText>
                      ) : null}
                    </View>
                  </Pressable>
                );
              }}
            />
          )}

          {/* Photon/OSM attribution */}
          <View style={styles.googleAttribution}>
            <ThemedText style={styles.googleAttributionText}>
              Powered by OpenStreetMap
            </ThemedText>
          </View>

          {/* Done button for multi-select mode */}
          {allowMultiple && selectedLocations.length > 0 && (
            <>
              <Spacer height={12} />
              <Pressable style={styles.doneBtn} onPress={handleClose}>
                <ThemedText style={styles.doneBtnText}>
                  Done ({selectedLocations.length} selected)
                </ThemedText>
              </Pressable>
            </>
          )}

          <Spacer height={Platform.OS === 'ios' ? 24 : 16} />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  sheetOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheetBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  sheetContent: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 24,
    paddingTop: 24,
    maxHeight: '80%',
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sheetTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: Colors.light.title,
    flex: 1,
  },
  sheetSearchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: Colors.light.secondaryBackground,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  sheetSearchInput: {
    flex: 1,
    fontSize: 16,
    color: Colors.light.title,
    padding: 0,
  },
  sheetList: {
    maxHeight: 300,
  },
  sheetListItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.light.border,
    gap: 12,
  },
  sheetListItemSelected: {
    backgroundColor: 'rgba(104, 73, 167, 0.05)',
  },
  sheetListItemText: {
    fontSize: 16,
    color: Colors.light.title,
  },
  selectedText: {
    color: TINT,
    fontWeight: '500',
  },
  locationItemContent: {
    flex: 1,
  },
  locationSecondaryText: {
    fontSize: 13,
    color: Colors.light.subtitle,
    marginTop: 2,
  },
  sheetEmptyState: {
    paddingVertical: 32,
    alignItems: 'center',
  },
  sheetEmptyText: {
    fontSize: 14,
    color: Colors.light.subtitle,
    textAlign: 'center',
  },
  googleAttribution: {
    alignItems: 'center',
    paddingVertical: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.light.border,
    marginTop: 8,
  },
  googleAttributionText: {
    fontSize: 12,
    color: Colors.light.subtitle,
  },
  doneBtn: {
    backgroundColor: TINT,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  doneBtnText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
});
