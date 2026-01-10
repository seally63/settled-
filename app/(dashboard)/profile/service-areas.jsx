// app/(dashboard)/profile/service-areas.jsx
// Simplified: Only travel radius from base location (Option A)
import { useState, useEffect } from "react";
import {
  StyleSheet,
  View,
  Pressable,
  ScrollView,
  ActivityIndicator,
  Alert,
  Modal,
  FlatList,
  Platform,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import ThemedView from "../../../components/ThemedView";
import ThemedText from "../../../components/ThemedText";
import Spacer from "../../../components/Spacer";
import { Colors } from "../../../constants/Colors";

import { getMyProfile, updateServiceRadius } from "../../../lib/api/profile";

const TINT = Colors.primary;

// Miles to km conversion
const MILES_TO_KM = 1.60934;
const RADIUS_OPTIONS = [5, 10, 15, 20, 25, 30, 40, 50]; // in miles

export default function ServiceAreasScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [travelRadius, setTravelRadius] = useState(10); // in miles
  const [basePostcode, setBasePostcode] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showRadiusSheet, setShowRadiusSheet] = useState(false);

  useEffect(() => {
    loadProfile();
  }, []);

  async function loadProfile() {
    try {
      const profile = await getMyProfile();
      console.log("Profile loaded:", profile);

      // Load base postcode
      setBasePostcode(profile?.base_postcode || null);

      // Load travel radius (convert km to miles)
      if (profile?.service_radius_km) {
        const miles = Math.round(profile.service_radius_km / MILES_TO_KM);
        // Find closest option
        const closest = RADIUS_OPTIONS.reduce((prev, curr) =>
          Math.abs(curr - miles) < Math.abs(prev - miles) ? curr : prev
        );
        setTravelRadius(closest);
      }
    } catch (e) {
      console.log("Error loading profile:", e);
    } finally {
      setLoading(false);
    }
  }

  async function handleSave() {
    try {
      setSaving(true);

      // Save travel radius (convert miles to km)
      const radiusKm = Math.round(travelRadius * MILES_TO_KM);
      console.log("Saving radius:", radiusKm, "km");
      await updateServiceRadius(radiusKm);

      Alert.alert("Success", "Travel radius updated.", [
        { text: "OK", onPress: () => router.back() },
      ]);
    } catch (e) {
      console.log("Save error:", e);
      Alert.alert("Error", e.message || "Failed to save.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <ThemedView style={[styles.container, { paddingTop: insets.top }]}>
        <StatusBar style="dark" />
        <View style={styles.loadingContainer}>
          <ActivityIndicator />
        </View>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={[styles.container, { paddingTop: insets.top }]}>
      <StatusBar style="dark" />

      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={10}>
          <Ionicons name="arrow-back" size={24} color={Colors.light.title} />
        </Pressable>
        <ThemedText style={styles.headerTitle}>Service area</ThemedText>
        <Pressable onPress={handleSave} disabled={saving} hitSlop={10}>
          {saving ? (
            <ActivityIndicator size="small" color={Colors.primary} />
          ) : (
            <ThemedText style={styles.saveButton}>Save</ThemedText>
          )}
        </Pressable>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        {/* Info Section */}
        <View style={styles.infoSection}>
          <View style={styles.infoIconContainer}>
            <Ionicons name="location" size={32} color={Colors.primary} />
          </View>
          <Spacer height={16} />
          <ThemedText style={styles.infoTitle}>
            Set your travel radius
          </ThemedText>
          <Spacer height={8} />
          <ThemedText style={styles.infoText}>
            Clients within this distance from your base location will be able to find you when requesting quotes.
          </ThemedText>
        </View>

        <Spacer height={32} />

        {/* Base Location Display */}
        {basePostcode && (
          <>
            <View style={styles.section}>
              <ThemedText style={styles.sectionLabel}>Base location</ThemedText>
              <Spacer height={12} />
              <View style={styles.baseLocationCard}>
                <Ionicons name="home-outline" size={20} color={Colors.primary} />
                <ThemedText style={styles.baseLocationText}>
                  {basePostcode}
                </ThemedText>
              </View>
              <Spacer height={8} />
              <ThemedText style={styles.helperText}>
                This is your registered business address
              </ThemedText>
            </View>

            <Spacer height={24} />
          </>
        )}

        {/* Travel Radius */}
        <View style={styles.section}>
          <ThemedText style={styles.sectionLabel}>Travel radius</ThemedText>
          <ThemedText style={styles.sectionSubtext}>
            How far you're willing to travel for jobs
          </ThemedText>
          <Spacer height={12} />
          <Pressable
            style={({ pressed }) => [
              styles.radiusButton,
              pressed && styles.radiusButtonPressed,
            ]}
            onPress={() => setShowRadiusSheet(true)}
          >
            <Ionicons name="navigate-outline" size={20} color={Colors.primary} />
            <ThemedText style={styles.radiusButtonText}>
              {travelRadius} miles
            </ThemedText>
            <Ionicons name="chevron-forward" size={20} color={Colors.light.subtitle} />
          </Pressable>
        </View>

        <Spacer height={32} />

        {/* Visual Explanation */}
        <View style={styles.explanationCard}>
          <Ionicons name="information-circle-outline" size={20} color={Colors.light.subtitle} />
          <ThemedText style={styles.explanationText}>
            Clients will see you in search results if their location is within {travelRadius} miles of {basePostcode || 'your base address'}.
          </ThemedText>
        </View>

        <Spacer height={insets.bottom > 0 ? insets.bottom + 20 : 40} />
      </ScrollView>

      {/* Radius Picker Modal */}
      <Modal
        visible={showRadiusSheet}
        transparent
        animationType="slide"
        onRequestClose={() => setShowRadiusSheet(false)}
      >
        <View style={styles.sheetOverlay}>
          <Pressable style={styles.sheetBackdrop} onPress={() => setShowRadiusSheet(false)} />
          <View style={styles.sheetContent}>
            <View style={styles.sheetHeader}>
              <ThemedText style={styles.sheetTitle}>Travel radius</ThemedText>
              <Pressable onPress={() => setShowRadiusSheet(false)} hitSlop={10}>
                <Ionicons name="close" size={24} color={Colors.light.title} />
              </Pressable>
            </View>

            <Spacer height={8} />
            <ThemedText style={styles.sheetSubtitle}>
              How far are you willing to travel for jobs?
            </ThemedText>

            <Spacer height={16} />

            <FlatList
              data={RADIUS_OPTIONS}
              keyExtractor={(item) => item.toString()}
              style={styles.radiusList}
              showsVerticalScrollIndicator={false}
              renderItem={({ item }) => (
                <Pressable
                  style={[
                    styles.radiusOption,
                    travelRadius === item && styles.radiusOptionSelected,
                  ]}
                  onPress={() => {
                    setTravelRadius(item);
                    setShowRadiusSheet(false);
                  }}
                >
                  <ThemedText
                    style={[
                      styles.radiusOptionText,
                      travelRadius === item && styles.radiusOptionTextSelected,
                    ]}
                  >
                    {item} miles
                  </ThemedText>
                  {travelRadius === item && (
                    <Ionicons name="checkmark" size={20} color={TINT} />
                  )}
                </Pressable>
              )}
            />

            <Spacer height={Platform.OS === 'ios' ? 24 : 16} />
          </View>
        </View>
      </Modal>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#FFFFFF",
  },
  loadingContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: Colors.light.title,
  },
  saveButton: {
    fontSize: 16,
    fontWeight: "600",
    color: Colors.primary,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 24,
    paddingTop: 16,
  },
  infoSection: {
    alignItems: 'center',
    paddingVertical: 24,
  },
  infoIconContainer: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: `${Colors.primary}15`,
    alignItems: 'center',
    justifyContent: 'center',
  },
  infoTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: Colors.light.title,
    textAlign: 'center',
  },
  infoText: {
    fontSize: 15,
    color: Colors.light.subtitle,
    textAlign: 'center',
    lineHeight: 22,
    paddingHorizontal: 16,
  },
  section: {
    marginBottom: 8,
  },
  sectionLabel: {
    fontSize: 14,
    fontWeight: "500",
    color: Colors.light.subtitle,
  },
  sectionSubtext: {
    fontSize: 13,
    color: Colors.light.subtitle,
    marginTop: 4,
  },
  baseLocationCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    backgroundColor: Colors.light.secondaryBackground,
    borderRadius: 12,
  },
  baseLocationText: {
    flex: 1,
    fontSize: 16,
    color: Colors.light.title,
    fontWeight: '500',
  },
  helperText: {
    fontSize: 13,
    color: Colors.light.subtitle,
  },
  radiusButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    backgroundColor: Colors.light.secondaryBackground,
    borderRadius: 12,
  },
  radiusButtonPressed: {
    opacity: 0.7,
  },
  radiusButtonText: {
    flex: 1,
    fontSize: 16,
    color: Colors.light.title,
  },
  explanationCard: {
    flexDirection: 'row',
    gap: 12,
    padding: 16,
    backgroundColor: Colors.light.secondaryBackground,
    borderRadius: 12,
    alignItems: 'flex-start',
  },
  explanationText: {
    flex: 1,
    fontSize: 14,
    color: Colors.light.subtitle,
    lineHeight: 20,
  },
  // Modal styles
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
    maxHeight: '60%',
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
  sheetSubtitle: {
    fontSize: 14,
    color: Colors.light.subtitle,
  },
  radiusList: {
    maxHeight: 300,
  },
  radiusOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 16,
    paddingHorizontal: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.light.border,
  },
  radiusOptionSelected: {
    backgroundColor: 'rgba(104, 73, 167, 0.05)',
  },
  radiusOptionText: {
    fontSize: 16,
    color: Colors.light.title,
  },
  radiusOptionTextSelected: {
    color: TINT,
    fontWeight: '500',
  },
});
