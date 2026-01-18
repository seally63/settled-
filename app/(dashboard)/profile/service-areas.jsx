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
          <Ionicons name="chevron-back" size={24} color={Colors.light.title} />
        </Pressable>
        <ThemedText style={styles.headerTitle}>Service area</ThemedText>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        {/* Hero Section */}
        <View style={styles.heroSection}>
          <View style={styles.heroIconContainer}>
            <Ionicons name="location-outline" size={32} color={Colors.light.title} />
          </View>
          <Spacer height={16} />
          <ThemedText style={styles.heroTitle}>
            Set your travel radius
          </ThemedText>
          <Spacer height={8} />
          <ThemedText style={styles.heroText}>
            Clients within this distance will find you when requesting quotes.
          </ThemedText>
        </View>

        <Spacer height={32} />

        {/* Settings Card */}
        <View style={styles.settingsCard}>
          {/* Base Location Row */}
          <View style={styles.settingsRow}>
            <View style={styles.settingsRowLeft}>
              <Ionicons name="home-outline" size={18} color={Colors.light.subtitle} style={styles.settingsIcon} />
              <ThemedText style={styles.settingsLabel}>Base location</ThemedText>
            </View>
            <View style={styles.settingsRowRight}>
              <ThemedText style={styles.settingsValue}>
                {basePostcode || "Not set"}
              </ThemedText>
              <View style={{ width: 18 }} />
            </View>
          </View>

          {/* Divider */}
          <View style={styles.cardDivider} />

          {/* Travel Radius Row */}
          <Pressable
            style={({ pressed }) => [
              styles.settingsRow,
              styles.settingsRowTappable,
              pressed && styles.settingsRowPressed,
            ]}
            onPress={() => setShowRadiusSheet(true)}
          >
            <View style={styles.settingsRowLeft}>
              <Ionicons name="navigate-outline" size={18} color={Colors.light.subtitle} style={styles.settingsIcon} />
              <ThemedText style={styles.settingsLabel}>Travel radius</ThemedText>
            </View>
            <View style={styles.settingsRowRight}>
              <ThemedText style={styles.settingsValue}>
                {travelRadius} miles
              </ThemedText>
              <Ionicons name="chevron-forward" size={18} color={Colors.light.subtitle} />
            </View>
          </Pressable>
        </View>

        <Spacer height={24} />

        {/* Info Box */}
        <View style={styles.infoBox}>
          <Ionicons name="information-circle-outline" size={20} color={Colors.light.subtitle} />
          <ThemedText style={styles.infoText}>
            Clients will see you in search results if their location is within{" "}
            <ThemedText style={styles.infoTextBold}>{travelRadius} miles</ThemedText>
            {" "}of{" "}
            <ThemedText style={styles.infoTextBold}>{basePostcode || "your base address"}</ThemedText>.
          </ThemedText>
        </View>

        <Spacer height={32} />

        {/* Save Button */}
        <Pressable
          style={({ pressed }) => [
            styles.primaryButton,
            pressed && styles.primaryButtonPressed,
            saving && styles.primaryButtonDisabled,
          ]}
          onPress={handleSave}
          disabled={saving}
        >
          {saving ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <ThemedText style={styles.primaryButtonText}>Save changes</ThemedText>
          )}
        </Pressable>

        <Spacer height={insets.bottom > 0 ? insets.bottom + 16 : 32} />
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
            {/* Handle bar */}
            <View style={styles.sheetHandle} />

            <View style={styles.sheetHeader}>
              <ThemedText style={styles.sheetTitle}>Travel radius</ThemedText>
              <Pressable onPress={() => setShowRadiusSheet(false)} hitSlop={10} style={styles.sheetCloseBtn}>
                <Ionicons name="close" size={20} color="#111827" />
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
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 24,
    paddingTop: 16,
  },
  // Hero section
  heroSection: {
    alignItems: "center",
    paddingVertical: 24,
  },
  heroIconContainer: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: Colors.light.secondaryBackground,
    alignItems: "center",
    justifyContent: "center",
  },
  heroTitle: {
    fontSize: 20,
    fontWeight: "600",
    color: Colors.light.title,
    textAlign: "center",
  },
  heroText: {
    fontSize: 15,
    color: Colors.light.subtitle,
    textAlign: "center",
    lineHeight: 22,
    paddingHorizontal: 16,
  },
  // Settings card
  settingsCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.light.border,
    overflow: "hidden",
  },
  settingsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 16,
    paddingHorizontal: 16,
  },
  settingsRowTappable: {
    // No additional styling needed, just marking it as tappable
  },
  settingsRowPressed: {
    backgroundColor: Colors.light.secondaryBackground,
  },
  settingsRowLeft: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  settingsRowRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  settingsIcon: {
    marginRight: 10,
  },
  settingsLabel: {
    fontSize: 15,
    color: Colors.light.title,
  },
  settingsValue: {
    fontSize: 15,
    fontWeight: "600",
    color: Colors.light.title,
  },
  cardDivider: {
    height: 1,
    backgroundColor: Colors.light.border,
    marginHorizontal: 16,
  },
  // Info box
  infoBox: {
    flexDirection: "row",
    gap: 12,
    padding: 16,
    backgroundColor: "#F9FAFB",
    borderRadius: 12,
    alignItems: "flex-start",
  },
  infoText: {
    flex: 1,
    fontSize: 14,
    color: Colors.light.subtitle,
    lineHeight: 20,
  },
  infoTextBold: {
    fontWeight: "600",
    color: Colors.light.title,
  },
  primaryButton: {
    backgroundColor: TINT,
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryButtonPressed: {
    opacity: 0.9,
  },
  primaryButtonDisabled: {
    opacity: 0.5,
  },
  primaryButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "700",
  },
  // Modal styles
  sheetOverlay: {
    flex: 1,
    justifyContent: "flex-end",
  },
  sheetBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.4)",
  },
  sheetContent: {
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 24,
    paddingTop: 12,
    maxHeight: "80%",
  },
  sheetHandle: {
    width: 36,
    height: 4,
    backgroundColor: "#D1D5DB",
    borderRadius: 2,
    alignSelf: "center",
    marginBottom: 20,
  },
  sheetHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  sheetTitle: {
    fontSize: 22,
    fontWeight: "700",
    color: "#111827",
    flex: 1,
  },
  sheetCloseBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#F3F4F6",
    alignItems: "center",
    justifyContent: "center",
  },
  sheetSubtitle: {
    fontSize: 14,
    color: Colors.light.subtitle,
  },
  radiusList: {
    maxHeight: 300,
  },
  radiusOption: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 16,
    paddingHorizontal: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.light.border,
  },
  radiusOptionSelected: {
    backgroundColor: "rgba(104, 73, 167, 0.05)",
  },
  radiusOptionText: {
    fontSize: 16,
    color: Colors.light.title,
  },
  radiusOptionTextSelected: {
    color: TINT,
    fontWeight: "500",
  },
});
