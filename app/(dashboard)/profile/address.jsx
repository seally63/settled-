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
import { StatusBar } from "expo-status-bar";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import ThemedView from "../../../components/ThemedView";
import ThemedText from "../../../components/ThemedText";
import Spacer from "../../../components/Spacer";
import { Colors } from "../../../constants/Colors";

import { getMyProfile, updateMyProfile } from "../../../lib/api/profile";

export default function AddressScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();

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
        <ThemedText style={styles.headerTitle}>Address</ThemedText>
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
          <ThemedText style={styles.description}>
            Your address helps trades provide accurate quotes and find your
            property for jobs.
          </ThemedText>

          <Spacer height={24} />

          {/* Street Address */}
          <ThemedText style={styles.label}>Street address</ThemedText>
          <TextInput
            style={styles.input}
            value={street}
            onChangeText={setStreet}
            placeholder="123 Main Street"
            placeholderTextColor={Colors.light.subtitle}
            autoComplete="street-address"
          />

          <Spacer height={16} />

          {/* Unit/Apt */}
          <ThemedText style={styles.label}>Unit / Apartment (optional)</ThemedText>
          <TextInput
            style={styles.input}
            value={unit}
            onChangeText={setUnit}
            placeholder="Apt 4B, Suite 100, etc."
            placeholderTextColor={Colors.light.subtitle}
          />

          <Spacer height={16} />

          {/* City */}
          <ThemedText style={styles.label}>City</ThemedText>
          <TextInput
            style={styles.input}
            value={city}
            onChangeText={setCity}
            placeholder="City name"
            placeholderTextColor={Colors.light.subtitle}
            autoComplete="address-level2"
          />

          <Spacer height={16} />

          {/* State / Zip Row */}
          <View style={styles.row}>
            <View style={styles.stateContainer}>
              <ThemedText style={styles.label}>State</ThemedText>
              <TextInput
                style={styles.input}
                value={state}
                onChangeText={setState}
                placeholder="State"
                placeholderTextColor={Colors.light.subtitle}
                autoComplete="address-level1"
              />
            </View>

            <View style={styles.zipContainer}>
              <ThemedText style={styles.label}>ZIP code</ThemedText>
              <TextInput
                style={styles.input}
                value={zipCode}
                onChangeText={setZipCode}
                placeholder="12345"
                placeholderTextColor={Colors.light.subtitle}
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
    color: Colors.light.subtitle,
    lineHeight: 20,
  },
  label: {
    fontSize: 14,
    fontWeight: "500",
    color: Colors.light.title,
    marginBottom: 8,
  },
  input: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: Colors.light.border,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: Colors.light.title,
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
