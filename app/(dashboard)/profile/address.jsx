// app/(dashboard)/profile/address.jsx
import { useState, useEffect } from "react";
import {
  StyleSheet,
  View,
  Pressable,
  TextInput,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import ThemedView from "../../../components/ThemedView";
import ThemedText from "../../../components/ThemedText";
import Spacer from "../../../components/Spacer";
import { Colors } from "../../../constants/Colors";
import { TypeVariants } from "../../../constants/Typography";

import { getMyProfile, updateMyProfile } from "../../../lib/api/profile";
import { useTheme } from "../../../hooks/useTheme";
import ThemedStatusBar from "../../../components/ThemedStatusBar";
import useHideTabBar from "../../../hooks/useHideTabBar";

export default function AddressScreen() {
  useHideTabBar();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { colors: c } = useTheme();

  const [street, setStreet] = useState("");
  const [unit, setUnit] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [zipCode, setZipCode] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadProfile();
  }, []);

  async function loadProfile() {
    try {
      const profile = await getMyProfile();
      const address = profile?.address || {};
      setStreet(address.street || "");
      setUnit(address.unit || "");
      setCity(address.city || "");
      setState(address.state || "");
      setZipCode(address.zip_code || "");
    } catch (e) {
      console.log("Error loading profile:", e);
    } finally {
      setLoading(false);
    }
  }

  async function handleSave() {
    try {
      setSaving(true);
      await updateMyProfile({
        address: {
          street: street.trim(),
          unit: unit.trim(),
          city: city.trim(),
          state: state.trim(),
          zip_code: zipCode.trim(),
        },
      });
      Alert.alert("Success", "Address updated.", [
        { text: "OK", onPress: () => router.back() },
      ]);
    } catch (e) {
      Alert.alert("Error", e.message || "Failed to save.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <ThemedView style={[styles.container, { paddingTop: insets.top }]}>
        <ThemedStatusBar />
        <View style={styles.loadingContainer}>
          <ActivityIndicator />
        </View>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={[styles.container, { paddingTop: insets.top }]}>
      <ThemedStatusBar />

      {/* Header */}
      <View style={[styles.header, { borderBottomColor: c.border }]}>
        <Pressable onPress={() => router.back()} hitSlop={10}>
          <Ionicons name="chevron-back" size={24} color={c.text} />
        </Pressable>
        <ThemedText style={[styles.headerTitle, { color: c.text }]}>
          Address
        </ThemedText>
        <Pressable onPress={handleSave} disabled={saving} hitSlop={10}>
          {saving ? (
            <ActivityIndicator size="small" color={Colors.primary} />
          ) : (
            <ThemedText style={styles.saveButton}>Save</ThemedText>
          )}
        </Pressable>
      </View>

      <KeyboardAvoidingView
        style={styles.keyboardView}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          <ThemedText style={[styles.description, { color: c.textMuted }]}>
            Your address helps trades provide accurate quotes and find your
            property for jobs.
          </ThemedText>

          <Spacer height={24} />

          {/* Street Address */}
          <ThemedText style={[styles.label, { color: c.text }]}>
            Street address
          </ThemedText>
          <TextInput
            style={[
              styles.input,
              { backgroundColor: c.elevate, borderColor: c.border, color: c.text },
            ]}
            value={street}
            onChangeText={setStreet}
            placeholder="123 Main Street"
            placeholderTextColor={c.textMuted}
            autoComplete="street-address"
          />

          <Spacer height={16} />

          {/* Unit/Apt */}
          <ThemedText style={[styles.label, { color: c.text }]}>
            Unit / Apartment (optional)
          </ThemedText>
          <TextInput
            style={[
              styles.input,
              { backgroundColor: c.elevate, borderColor: c.border, color: c.text },
            ]}
            value={unit}
            onChangeText={setUnit}
            placeholder="Apt 4B, Suite 100, etc."
            placeholderTextColor={c.textMuted}
          />

          <Spacer height={16} />

          {/* City */}
          <ThemedText style={[styles.label, { color: c.text }]}>City</ThemedText>
          <TextInput
            style={[
              styles.input,
              { backgroundColor: c.elevate, borderColor: c.border, color: c.text },
            ]}
            value={city}
            onChangeText={setCity}
            placeholder="City name"
            placeholderTextColor={c.textMuted}
            autoComplete="address-level2"
          />

          <Spacer height={16} />

          {/* State / Zip Row */}
          <View style={styles.row}>
            <View style={styles.stateContainer}>
              <ThemedText style={[styles.label, { color: c.text }]}>State</ThemedText>
              <TextInput
                style={[
                  styles.input,
                  { backgroundColor: c.elevate, borderColor: c.border, color: c.text },
                ]}
                value={state}
                onChangeText={setState}
                placeholder="State"
                placeholderTextColor={c.textMuted}
                autoComplete="address-level1"
              />
            </View>

            <View style={styles.zipContainer}>
              <ThemedText style={[styles.label, { color: c.text }]}>ZIP code</ThemedText>
              <TextInput
                style={[
                  styles.input,
                  { backgroundColor: c.elevate, borderColor: c.border, color: c.text },
                ]}
                value={zipCode}
                onChangeText={setZipCode}
                placeholder="12345"
                placeholderTextColor={c.textMuted}
                keyboardType="number-pad"
                autoComplete="postal-code"
                maxLength={10}
              />
            </View>
          </View>

          <Spacer height={insets.bottom > 0 ? insets.bottom + 20 : 40} />
        </ScrollView>
      </KeyboardAvoidingView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    // bg handled by ThemedView default + theme.
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
    borderBottomWidth: StyleSheet.hairlineWidth,
    // border + text painted inline from theme.
  },
  headerTitle: {
    ...TypeVariants.bodyStrong,
    fontSize: 18,
  },
  saveButton: {
    fontSize: 16,
    fontWeight: "600",
    color: Colors.primary,
  },
  keyboardView: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 24,
    paddingTop: 16,
  },
  description: {
    fontSize: 14,
    lineHeight: 20,
    // color painted inline from theme.
  },
  label: {
    fontSize: 14,
    fontWeight: "500",
    marginBottom: 8,
    // color painted inline from theme.
  },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    // bg + border + text color painted inline from theme.
  },
  row: {
    flexDirection: "row",
    gap: 12,
  },
  stateContainer: {
    flex: 1,
  },
  zipContainer: {
    flex: 1,
  },
});
