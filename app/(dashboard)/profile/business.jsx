// app/(dashboard)/profile/business.jsx
import { useState, useEffect } from "react";
import {
  StyleSheet,
  View,
  Pressable,
  TextInput,
  ScrollView,
  ActivityIndicator,
  Alert,
  Modal,
  Linking,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import ThemedView from "../../../components/ThemedView";
import ThemedText from "../../../components/ThemedText";
import Spacer from "../../../components/Spacer";
import { Colors } from "../../../constants/Colors";

import { useUser } from "../../../hooks/useUser";
import { getMyProfile, updateMyProfile } from "../../../lib/api/profile";

const PRIMARY = Colors?.light?.tint || "#7C3AED";

const SERVICE_OPTIONS = [
  "Plumbing",
  "Electrical",
  "HVAC",
  "Roofing",
  "Painting",
  "Carpentry",
  "Landscaping",
  "General Contracting",
  "Flooring",
  "Tiling",
  "Masonry",
  "Drywall",
  "Window Installation",
  "Fencing",
  "Pressure Washing",
];

export default function BusinessInfoScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useUser();

  const [businessName, setBusinessName] = useState("");
  const [bio, setBio] = useState("");
  const [selectedServices, setSelectedServices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showLockedModal, setShowLockedModal] = useState(false);

  const handleContactSupport = () => {
    setShowLockedModal(false);
    // Open email client with support email
    Linking.openURL("mailto:support@settled.app?subject=Business%20Name%20Change%20Request");
  };

  useEffect(() => {
    loadProfile();
  }, []);

  async function loadProfile() {
    try {
      const profile = await getMyProfile();
      setBusinessName(profile?.business_name || "");
      setBio(profile?.bio || "");
      setSelectedServices(profile?.services || []);
    } catch (e) {
      console.log("Error loading profile:", e);
    } finally {
      setLoading(false);
    }
  }

  function toggleService(service) {
    setSelectedServices((prev) =>
      prev.includes(service)
        ? prev.filter((s) => s !== service)
        : [...prev, service]
    );
  }

  async function handleSave() {
    try {
      setSaving(true);
      await updateMyProfile({
        bio: bio.trim(),
        services: selectedServices,
      });
      Alert.alert("Success", "Business info updated.", [
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
        <ThemedText style={styles.headerTitle}>Business info</ThemedText>
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
        {/* Business Name (Read-only, tappable) */}
        <ThemedText style={styles.label}>Business name</ThemedText>
        <Pressable
          style={styles.lockedField}
          onPress={() => setShowLockedModal(true)}
        >
          <ThemedText style={styles.lockedFieldText}>
            {businessName || "Not set"}
          </ThemedText>
          <Ionicons name="lock-closed" size={16} color={Colors.light.subtitle} />
        </Pressable>

        <Spacer height={24} />

        {/* Bio */}
        <ThemedText style={styles.label}>Bio</ThemedText>
        <TextInput
          style={styles.bioInput}
          value={bio}
          onChangeText={setBio}
          placeholder="Tell clients about your business, experience, and what makes you stand out..."
          placeholderTextColor={Colors.light.subtitle}
          multiline
          numberOfLines={4}
          textAlignVertical="top"
          maxLength={500}
        />
        <ThemedText style={styles.charCount}>{bio.length}/500</ThemedText>

        <Spacer height={24} />

        {/* Services */}
        <ThemedText style={styles.label}>Services offered</ThemedText>
        <ThemedText style={styles.servicesHint}>
          Select all services you provide
        </ThemedText>

        <Spacer height={12} />

        <View style={styles.servicesGrid}>
          {SERVICE_OPTIONS.map((service) => {
            const isSelected = selectedServices.includes(service);
            return (
              <Pressable
                key={service}
                style={[
                  styles.serviceChip,
                  isSelected && styles.serviceChipSelected,
                ]}
                onPress={() => toggleService(service)}
              >
                <ThemedText
                  style={[
                    styles.serviceChipText,
                    isSelected && styles.serviceChipTextSelected,
                  ]}
                >
                  {service}
                </ThemedText>
                {isSelected && (
                  <Ionicons name="checkmark" size={16} color="#FFFFFF" />
                )}
              </Pressable>
            );
          })}
        </View>

        <Spacer height={insets.bottom > 0 ? insets.bottom + 20 : 40} />
      </ScrollView>

      {/* Locked Business Name Modal */}
      <Modal
        visible={showLockedModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowLockedModal(false)}
      >
        <View style={styles.modalOverlay}>
          <Pressable
            style={styles.modalBackdrop}
            onPress={() => setShowLockedModal(false)}
          />
          <View style={styles.modalContent}>
            {/* Lock Icon */}
            <View style={styles.modalIconContainer}>
              <Ionicons name="lock-closed" size={32} color="#6B7280" />
            </View>

            <Spacer height={16} />

            <ThemedText style={styles.modalTitle}>
              Business name is locked
            </ThemedText>

            <Spacer height={8} />

            <ThemedText style={styles.modalText}>
              Your business name was set during registration. If you need to change it, please contact our support team.
            </ThemedText>

            <Spacer height={24} />

            {/* Contact Support Button */}
            <Pressable
              style={styles.modalPrimaryBtn}
              onPress={handleContactSupport}
            >
              <ThemedText style={styles.modalPrimaryBtnText}>
                Contact support
              </ThemedText>
            </Pressable>

            <Spacer height={12} />

            {/* Cancel Link */}
            <Pressable
              style={styles.modalCancelBtn}
              onPress={() => setShowLockedModal(false)}
            >
              <ThemedText style={styles.modalCancelBtnText}>Cancel</ThemedText>
            </Pressable>

            <Spacer height={insets.bottom > 0 ? insets.bottom : 16} />
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
  label: {
    fontSize: 14,
    fontWeight: "500",
    color: Colors.light.title,
    marginBottom: 8,
  },
  lockedField: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: Colors.light.secondaryBackground,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 12,
  },
  lockedFieldText: {
    fontSize: 16,
    color: Colors.light.subtitle,
    flex: 1,
  },
  lockedHint: {
    fontSize: 12,
    color: Colors.light.subtitle,
    marginTop: 6,
    fontStyle: "italic",
  },
  bioInput: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: Colors.light.border,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 15,
    color: Colors.light.title,
    minHeight: 120,
    lineHeight: 22,
  },
  charCount: {
    fontSize: 12,
    color: Colors.light.subtitle,
    textAlign: "right",
    marginTop: 4,
  },
  servicesHint: {
    fontSize: 13,
    color: Colors.light.subtitle,
  },
  servicesGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  serviceChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Colors.light.border,
    backgroundColor: "#FFFFFF",
  },
  serviceChipSelected: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  serviceChipText: {
    fontSize: 14,
    color: Colors.light.title,
  },
  serviceChipTextSelected: {
    color: "#FFFFFF",
  },
  // Modal styles
  modalOverlay: {
    flex: 1,
    justifyContent: "flex-end",
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.4)",
  },
  modalContent: {
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 24,
    paddingTop: 32,
    alignItems: "center",
  },
  modalIconContainer: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: "#F3F4F6",
    alignItems: "center",
    justifyContent: "center",
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#111827",
    textAlign: "center",
  },
  modalText: {
    fontSize: 14,
    color: "#6B7280",
    textAlign: "center",
    lineHeight: 20,
    paddingHorizontal: 16,
  },
  modalPrimaryBtn: {
    backgroundColor: PRIMARY,
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 24,
    width: "100%",
    alignItems: "center",
  },
  modalPrimaryBtnText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#FFFFFF",
  },
  modalCancelBtn: {
    paddingVertical: 8,
  },
  modalCancelBtnText: {
    fontSize: 14,
    color: PRIMARY,
  },
});
