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
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import ThemedView from "../../../components/ThemedView";
import ThemedText from "../../../components/ThemedText";
import Spacer from "../../../components/Spacer";
import { KeyboardDoneButton, KEYBOARD_DONE_ID } from "../../../components/KeyboardDoneButton";
import { SettingsFormSkeleton } from "../../../components/Skeleton";
import { Colors } from "../../../constants/Colors";
import { TypeVariants } from "../../../constants/Typography";

import { useUser } from "../../../hooks/useUser";
import { useTheme } from "../../../hooks/useTheme";
import { getMyProfile, updateMyProfile } from "../../../lib/api/profile";
import { getServiceCategories, getServiceTypes } from "../../../lib/api/services";
import ThemedStatusBar from "../../../components/ThemedStatusBar";
import useHideTabBar from "../../../hooks/useHideTabBar";

const PRIMARY = Colors?.light?.tint || "#7C3AED";

// Trade job titles options (same as registration)
const JOB_TITLE_OPTIONS = [
  "Plumber",
  "Electrician",
  "Heating Engineer",
  "Roofer",
  "Painter & Decorator",
  "Carpenter",
  "Tiler",
  "Landscaper",
  "General Builder",
  "Locksmith",
  "Window Fitter",
  "Flooring Specialist",
  "Plasterer",
  "Bricklayer",
  "HVAC Technician",
  "Fencer",
  "Driveway Specialist",
  "Cleaner",
  "Handyman",
];

export default function BusinessInfoScreen() {
  useHideTabBar();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useUser();
  const { colors: c } = useTheme();

  const [businessName, setBusinessName] = useState("");
  const [bio, setBio] = useState("");
  const [selectedJobTitles, setSelectedJobTitles] = useState([]);
  const [selectedServiceIds, setSelectedServiceIds] = useState([]); // Array of service_type IDs
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showLockedModal, setShowLockedModal] = useState(false);
  const [showJobTitlesSheet, setShowJobTitlesSheet] = useState(false);
  const [showServicesSheet, setShowServicesSheet] = useState(false);

  // Categories and service types from database
  const [categories, setCategories] = useState([]);
  const [serviceTypesByCategory, setServiceTypesByCategory] = useState({});
  const [expandedCategories, setExpandedCategories] = useState({});
  const [loadingServices, setLoadingServices] = useState(false);
  const [serviceSearch, setServiceSearch] = useState("");

  const handleContactSupport = () => {
    setShowLockedModal(false);
    Linking.openURL("mailto:support@settled.app?subject=Business%20Name%20Change%20Request");
  };

  useEffect(() => {
    loadProfile();
    loadCategories();
  }, []);

  async function loadProfile() {
    try {
      const profile = await getMyProfile();
      setBusinessName(profile?.business_name || "");
      setBio(profile?.bio || "");
      setSelectedJobTitles(profile?.job_titles || []);
      setSelectedServiceIds(profile?.service_type_ids || []);
    } catch (e) {
      console.log("Error loading profile:", e);
    } finally {
      setLoading(false);
    }
  }

  async function loadCategories() {
    try {
      setLoadingServices(true);
      const cats = await getServiceCategories();
      setCategories(cats);

      // Load service types for each category
      const typesByCategory = {};
      for (const cat of cats) {
        const types = await getServiceTypes(cat.id);
        typesByCategory[cat.id] = types;
      }
      setServiceTypesByCategory(typesByCategory);
    } catch (e) {
      console.log("Error loading categories:", e);
    } finally {
      setLoadingServices(false);
    }
  }

  function toggleCategory(categoryId) {
    setExpandedCategories((prev) => ({
      ...prev,
      [categoryId]: !prev[categoryId],
    }));
  }

  function toggleService(serviceId) {
    setSelectedServiceIds((prev) =>
      prev.includes(serviceId)
        ? prev.filter((id) => id !== serviceId)
        : [...prev, serviceId]
    );
  }

  function toggleJobTitle(title) {
    setSelectedJobTitles((prev) => {
      if (prev.includes(title)) {
        return prev.filter((t) => t !== title);
      }
      if (prev.length >= 3) {
        Alert.alert("Limit reached", "You can select up to 3 job titles.");
        return prev;
      }
      return [...prev, title];
    });
  }

  // Get count of selected services per category
  function getSelectedCountForCategory(categoryId) {
    const types = serviceTypesByCategory[categoryId] || [];
    return types.filter((t) => selectedServiceIds.includes(t.id)).length;
  }

  // Group selected services by category for display (returns {categoryName: [{id, name}, ...], ...})
  function getGroupedSelectedServices() {
    const grouped = {};
    for (const cat of categories) {
      const types = serviceTypesByCategory[cat.id] || [];
      const selected = types.filter((t) => selectedServiceIds.includes(t.id));
      if (selected.length > 0) {
        grouped[cat.name] = selected; // Keep full objects for id and name
      }
    }
    return grouped;
  }

  // Filter services by search
  function getFilteredCategories() {
    if (!serviceSearch.trim()) return categories;

    const search = serviceSearch.toLowerCase();
    return categories.filter((cat) => {
      const types = serviceTypesByCategory[cat.id] || [];
      return (
        cat.name.toLowerCase().includes(search) ||
        types.some((t) => t.name.toLowerCase().includes(search))
      );
    });
  }

  async function handleSave() {
    try {
      setSaving(true);
      await updateMyProfile({
        bio: bio.trim(),
        job_titles: selectedJobTitles,
        service_type_ids: selectedServiceIds,
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
        <ThemedStatusBar />
        <SettingsFormSkeleton paddingTop={16} />
      </ThemedView>
    );
  }

  const groupedServices = getGroupedSelectedServices();

  return (
    <ThemedView style={[styles.container, { paddingTop: insets.top }]}>
      <ThemedStatusBar />

      {/* Header */}
      <View style={[styles.header, { borderBottomColor: c.border }]}>
        <Pressable onPress={() => router.back()} hitSlop={10}>
          <Ionicons name="chevron-back" size={24} color={c.text} />
        </Pressable>
        <ThemedText style={[styles.headerTitle, { color: c.text }]}>
          Business info
        </ThemedText>
        <View style={{ width: 24 }} />
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
        {/* Business Name (Read-only, tappable) */}
        <ThemedText style={[styles.label, { color: c.text }]}>Business name</ThemedText>
        <Pressable
          style={[styles.lockedField, { backgroundColor: c.elevate, borderColor: c.border }]}
          onPress={() => setShowLockedModal(true)}
        >
          <ThemedText style={[styles.lockedFieldText, { color: c.textMuted }]}>
            {businessName || "Not set"}
          </ThemedText>
          <Ionicons name="lock-closed" size={16} color={c.textMuted} />
        </Pressable>

        <Spacer height={24} />

        {/* Bio */}
        <ThemedText style={[styles.label, { color: c.text }]}>Bio</ThemedText>
        <TextInput
          style={[
            styles.bioInput,
            { backgroundColor: c.elevate, borderColor: c.border, color: c.text },
          ]}
          value={bio}
          onChangeText={setBio}
          placeholder="Tell clients about your business, experience, and what makes you stand out..."
          placeholderTextColor={c.textMuted}
          multiline
          numberOfLines={4}
          textAlignVertical="top"
          maxLength={500}
          inputAccessoryViewID={Platform.OS === "ios" ? KEYBOARD_DONE_ID : undefined}
        />
        <ThemedText style={[styles.charCount, { color: c.textMuted }]}>
          {bio.length}/500
        </ThemedText>

        <Spacer height={24} />

        {/* Job Titles */}
        <ThemedText style={[styles.label, { color: c.text }]}>Job title</ThemedText>
        <ThemedText style={[styles.hintText, { color: c.textMuted }]}>
          Select up to 3
        </ThemedText>
        <Spacer height={8} />
        <Pressable
          style={[styles.dropdownButton, { backgroundColor: c.elevate, borderColor: c.border }]}
          onPress={() => setShowJobTitlesSheet(true)}
        >
          <ThemedText
            style={[
              selectedJobTitles.length > 0 ? styles.dropdownText : styles.dropdownPlaceholder,
              { color: selectedJobTitles.length > 0 ? c.text : c.textMuted },
            ]}
          >
            {selectedJobTitles.length > 0 ? `${selectedJobTitles.length} selected` : 'Select job titles...'}
          </ThemedText>
          <Ionicons name="chevron-down" size={20} color={c.textMuted} />
        </Pressable>

        {/* Selected Job Titles Chips */}
        {selectedJobTitles.length > 0 && (
          <View style={styles.chipsContainer}>
            {selectedJobTitles.map((title) => (
              <View
                key={title}
                style={[styles.chip, { backgroundColor: c.elevate, borderColor: c.border }]}
              >
                <ThemedText style={[styles.chipText, { color: c.text }]}>{title}</ThemedText>
                <Pressable
                  onPress={() => setSelectedJobTitles((prev) => prev.filter((t) => t !== title))}
                  hitSlop={8}
                >
                  <Ionicons name="close" size={16} color={c.textMuted} />
                </Pressable>
              </View>
            ))}
          </View>
        )}

        <Spacer height={24} />

        {/* Services */}
        <ThemedText style={[styles.label, { color: c.text }]}>Services offered</ThemedText>
        <ThemedText style={[styles.hintText, { color: c.textMuted }]}>
          Optional - helps clients find you
        </ThemedText>
        <Spacer height={8} />
        <Pressable
          style={[styles.dropdownButton, { backgroundColor: c.elevate, borderColor: c.border }]}
          onPress={() => setShowServicesSheet(true)}
        >
          <ThemedText
            style={[
              selectedServiceIds.length > 0 ? styles.dropdownText : styles.dropdownPlaceholder,
              { color: selectedServiceIds.length > 0 ? c.text : c.textMuted },
            ]}
          >
            {selectedServiceIds.length > 0 ? `${selectedServiceIds.length} selected` : 'Add services...'}
          </ThemedText>
          <Ionicons name="chevron-down" size={20} color={c.textMuted} />
        </Pressable>

        {/* Selected Services grouped by category */}
        {Object.keys(groupedServices).length > 0 && (
          <View style={styles.groupedChipsContainer}>
            {Object.entries(groupedServices).map(([categoryName, services]) => (
              <View key={categoryName} style={styles.categoryGroup}>
                <ThemedText style={[styles.categoryLabel, { color: c.textMuted }]}>
                  {categoryName}
                </ThemedText>
                <View style={styles.chipsContainer}>
                  {services.map((service) => (
                    <View
                      key={service.id}
                      style={[styles.chip, { backgroundColor: c.elevate, borderColor: c.border }]}
                    >
                      <ThemedText style={[styles.chipText, { color: c.text }]}>
                        {service.name}
                      </ThemedText>
                      <Pressable
                        onPress={() => toggleService(service.id)}
                        hitSlop={8}
                      >
                        <Ionicons name="close" size={16} color={c.textMuted} />
                      </Pressable>
                    </View>
                  ))}
                </View>
              </View>
            ))}
          </View>
        )}

        {selectedServiceIds.length === 0 && (
          <ThemedText style={[styles.emptyServicesText, { color: c.textMuted }]}>
            No services added yet
          </ThemedText>
        )}

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
      </KeyboardAvoidingView>

      {/* Job Titles Bottom Sheet */}
      <Modal
        visible={showJobTitlesSheet}
        transparent
        animationType="slide"
        onRequestClose={() => setShowJobTitlesSheet(false)}
      >
        <View style={styles.sheetOverlay}>
          <Pressable
            style={styles.sheetBackdrop}
            onPress={() => setShowJobTitlesSheet(false)}
          />
          <View
            style={[
              styles.sheetContent,
              { backgroundColor: c.background, borderTopColor: c.border, borderTopWidth: 1 },
            ]}
          >
            {/* Handle bar */}
            <View style={[styles.sheetHandle, { backgroundColor: c.border }]} />

            <View style={styles.sheetHeader}>
              <ThemedText style={[styles.sheetTitle, { color: c.text }]}>
                What's your job title?
              </ThemedText>
              <Pressable
                onPress={() => setShowJobTitlesSheet(false)}
                hitSlop={10}
                style={[styles.sheetCloseBtn, { backgroundColor: c.elevate2 }]}
              >
                <Ionicons name="close" size={20} color={c.text} />
              </Pressable>
            </View>

            <ThemedText style={[styles.sheetSubtitle, { color: c.textMuted }]}>
              Select up to 3
            </ThemedText>
            <Spacer height={16} />

            <ScrollView style={styles.sheetList} showsVerticalScrollIndicator={false}>
              {JOB_TITLE_OPTIONS.map((title) => {
                const isSelected = selectedJobTitles.includes(title);
                return (
                  <Pressable
                    key={title}
                    style={[
                      styles.sheetListItem,
                      { borderBottomColor: c.border },
                      isSelected && { backgroundColor: Colors.primaryTint },
                    ]}
                    onPress={() => toggleJobTitle(title)}
                  >
                    <ThemedText
                      style={[
                        styles.sheetListItemText,
                        { color: isSelected ? Colors.primary : c.text },
                        isSelected && { fontWeight: "500" },
                      ]}
                    >
                      {title}
                    </ThemedText>
                    {isSelected && (
                      <Ionicons name="checkmark" size={20} color={Colors.primary} />
                    )}
                  </Pressable>
                );
              })}
            </ScrollView>

            <Spacer height={16} />

            <Pressable
              style={styles.sheetDoneBtn}
              onPress={() => setShowJobTitlesSheet(false)}
            >
              <ThemedText style={styles.sheetDoneBtnText}>
                Done {selectedJobTitles.length > 0 ? `(${selectedJobTitles.length})` : ''}
              </ThemedText>
            </Pressable>

            <Spacer height={insets.bottom > 0 ? insets.bottom : 16} />
          </View>
        </View>
      </Modal>

      {/* Services Bottom Sheet with Categories */}
      <Modal
        visible={showServicesSheet}
        transparent
        animationType="slide"
        onRequestClose={() => setShowServicesSheet(false)}
      >
        <View style={styles.sheetOverlay}>
          <Pressable
            style={styles.sheetBackdrop}
            onPress={() => setShowServicesSheet(false)}
          />
          <View
            style={[
              styles.sheetContent,
              styles.servicesSheetContent,
              { backgroundColor: c.background, borderTopColor: c.border, borderTopWidth: 1 },
            ]}
          >
            {/* Handle bar */}
            <View style={[styles.sheetHandle, { backgroundColor: c.border }]} />

            <View style={styles.sheetHeader}>
              <ThemedText style={[styles.sheetTitle, { color: c.text }]}>
                Add services
              </ThemedText>
              <Pressable
                onPress={() => setShowServicesSheet(false)}
                hitSlop={10}
                style={[styles.sheetCloseBtn, { backgroundColor: c.elevate2 }]}
              >
                <Ionicons name="close" size={20} color={c.text} />
              </Pressable>
            </View>

            <ThemedText style={[styles.sheetSubtitle, { color: c.textMuted }]}>
              Select all that apply
            </ThemedText>
            <Spacer height={16} />

            {/* Search */}
            <View
              style={[
                styles.searchContainer,
                { backgroundColor: c.elevate, borderColor: c.border, borderWidth: 1 },
              ]}
            >
              <Ionicons name="search" size={20} color={c.textMuted} />
              <TextInput
                style={[styles.searchInput, { color: c.text }]}
                placeholder="Search services..."
                placeholderTextColor={c.textMuted}
                value={serviceSearch}
                onChangeText={setServiceSearch}
              />
              {serviceSearch.length > 0 && (
                <Pressable onPress={() => setServiceSearch("")} hitSlop={10}>
                  <Ionicons name="close-circle" size={20} color={c.textMuted} />
                </Pressable>
              )}
            </View>

            <Spacer height={16} />

            {loadingServices ? (
              <View style={styles.loadingContainer}>
                <ActivityIndicator />
              </View>
            ) : (
              <ScrollView style={styles.sheetList} showsVerticalScrollIndicator={false}>
                {getFilteredCategories().map((category) => {
                  const isExpanded = expandedCategories[category.id];
                  const types = serviceTypesByCategory[category.id] || [];
                  const selectedCount = getSelectedCountForCategory(category.id);

                  // Filter types by search
                  const filteredTypes = serviceSearch.trim()
                    ? types.filter((t) => t.name.toLowerCase().includes(serviceSearch.toLowerCase()))
                    : types;

                  if (serviceSearch.trim() && filteredTypes.length === 0) return null;

                  return (
                    <View key={category.id}>
                      {/* Category Header */}
                      <Pressable
                        style={[styles.categoryHeader, { borderBottomColor: c.border }]}
                        onPress={() => toggleCategory(category.id)}
                      >
                        <View style={styles.categoryHeaderLeft}>
                          <Ionicons
                            name={isExpanded ? "chevron-down" : "chevron-forward"}
                            size={20}
                            color={c.textMuted}
                          />
                          <ThemedText style={[styles.categoryHeaderText, { color: c.text }]}>
                            {category.name}
                            {selectedCount > 0 && (
                              <ThemedText style={[styles.categoryCount, { color: c.textMuted }]}>
                                {' '}({selectedCount})
                              </ThemedText>
                            )}
                          </ThemedText>
                        </View>
                      </Pressable>

                      {/* Service Types (when expanded or searching) */}
                      {(isExpanded || serviceSearch.trim()) && (
                        <View style={styles.serviceTypesContainer}>
                          {filteredTypes.map((type) => {
                            const isSelected = selectedServiceIds.includes(type.id);
                            return (
                              <Pressable
                                key={type.id}
                                style={styles.serviceTypeItem}
                                onPress={() => toggleService(type.id)}
                              >
                                <Ionicons
                                  name={isSelected ? "checkbox" : "square-outline"}
                                  size={22}
                                  color={isSelected ? Colors.primary : c.textMuted}
                                />
                                <ThemedText
                                  style={[
                                    styles.serviceTypeText,
                                    { color: isSelected ? Colors.primary : c.text },
                                    isSelected && { fontWeight: "500" },
                                  ]}
                                >
                                  {type.name}
                                </ThemedText>
                              </Pressable>
                            );
                          })}
                        </View>
                      )}
                    </View>
                  );
                })}
              </ScrollView>
            )}

            <Spacer height={16} />

            <Pressable
              style={styles.sheetDoneBtn}
              onPress={() => setShowServicesSheet(false)}
            >
              <ThemedText style={styles.sheetDoneBtnText}>
                Done {selectedServiceIds.length > 0 ? `(${selectedServiceIds.length} selected)` : ''}
              </ThemedText>
            </Pressable>

            <Spacer height={insets.bottom > 0 ? insets.bottom : 16} />
          </View>
        </View>
      </Modal>

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
          <View
            style={[
              styles.modalContent,
              { backgroundColor: c.background, borderTopColor: c.border, borderTopWidth: 1 },
            ]}
          >
            {/* Handle bar */}
            <View style={[styles.sheetHandle, { backgroundColor: c.border }]} />

            <View style={[styles.modalIconContainer, { backgroundColor: c.elevate2 }]}>
              <Ionicons name="lock-closed" size={32} color={c.textMuted} />
            </View>

            <Spacer height={16} />

            <ThemedText style={[styles.modalTitle, { color: c.text }]}>
              Business name is locked
            </ThemedText>

            <Spacer height={8} />

            <ThemedText style={[styles.modalText, { color: c.textMuted }]}>
              Your business name was set during registration. If you need to change it, please contact our support team.
            </ThemedText>

            <Spacer height={24} />

            <Pressable
              style={styles.modalPrimaryBtn}
              onPress={handleContactSupport}
            >
              <ThemedText style={styles.modalPrimaryBtnText}>
                Contact support
              </ThemedText>
            </Pressable>

            <Spacer height={12} />

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
      <KeyboardDoneButton />
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
    marginBottom: 4,
    // color painted inline from theme.
  },
  hintText: {
    fontSize: 12,
    marginBottom: 8,
    // color painted inline from theme.
  },
  lockedField: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
    // bg + border painted inline from theme.
  },
  lockedFieldText: {
    fontSize: 16,
    flex: 1,
    // color painted inline from theme.
  },
  bioInput: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 15,
    minHeight: 120,
    lineHeight: 22,
    // bg + border + text color painted inline from theme.
  },
  charCount: {
    fontSize: 12,
    textAlign: "right",
    marginTop: 4,
    // color painted inline from theme.
  },
  dropdownButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    minHeight: 52,
    // bg + border painted inline from theme.
  },
  dropdownText: {
    fontSize: 16,
    flex: 1,
    // color painted inline from theme.
  },
  dropdownPlaceholder: {
    fontSize: 16,
    flex: 1,
    // color painted inline from theme.
  },
  chipsContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 8,
  },
  groupedChipsContainer: {
    marginTop: 12,
  },
  categoryGroup: {
    marginBottom: 12,
  },
  categoryLabel: {
    fontSize: 12,
    marginBottom: 6,
    // color painted inline from theme.
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 16,
    borderWidth: 1,
    // bg + border painted inline from theme.
  },
  chipText: {
    fontSize: 14,
    // color painted inline from theme.
  },
  emptyServicesText: {
    fontSize: 14,
    textAlign: "center",
    marginTop: 16,
    // color painted inline from theme.
  },
  primaryButton: {
    backgroundColor: PRIMARY,
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
  // Sheet styles
  sheetOverlay: {
    flex: 1,
    justifyContent: "flex-end",
  },
  sheetBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.4)",
  },
  sheetContent: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 24,
    paddingTop: 12,
    maxHeight: "80%",
    // bg + top border painted inline from theme.
  },
  sheetHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    alignSelf: "center",
    marginBottom: 20,
    // bg painted inline from theme.
  },
  sheetCloseBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    // bg painted inline from theme.
  },
  servicesSheetContent: {
    maxHeight: "85%",
  },
  sheetHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  sheetTitle: {
    ...TypeVariants.bodyStrong,
    fontSize: 18,
    flex: 1,
    // color painted inline from theme.
  },
  sheetSubtitle: {
    fontSize: 14,
    marginTop: 4,
    // color painted inline from theme.
  },
  sheetList: {
    maxHeight: 400,
  },
  sheetListItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 16,
    paddingHorizontal: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderRadius: 8,
    // bg painted inline when selected. border painted inline from theme.
  },
  sheetListItemText: {
    fontSize: 16,
    flex: 1,
    // color + weight painted inline from theme.
  },
  sheetDoneBtn: {
    backgroundColor: Colors.primary,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  sheetDoneBtnText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#FFFFFF",
  },
  // Search
  searchContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    // bg + border painted inline from theme.
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    padding: 0,
    // color painted inline from theme.
  },
  // Category accordion
  categoryHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    // border painted inline from theme.
  },
  categoryHeaderLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  categoryHeaderText: {
    fontSize: 16,
    fontWeight: "500",
    // color painted inline from theme.
  },
  categoryCount: {
    fontSize: 14,
    fontWeight: "400",
    // color painted inline from theme.
  },
  serviceTypesContainer: {
    paddingLeft: 28,
  },
  serviceTypeItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 12,
  },
  serviceTypeText: {
    fontSize: 15,
    // color + weight painted inline from theme.
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
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 24,
    paddingTop: 12,
    alignItems: "center",
    // bg + top border painted inline from theme.
  },
  modalIconContainer: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: "center",
    justifyContent: "center",
    // bg painted inline from theme.
  },
  modalTitle: {
    ...TypeVariants.bodyStrong,
    fontSize: 18,
    textAlign: "center",
    // color painted inline from theme.
  },
  modalText: {
    fontSize: 14,
    textAlign: "center",
    lineHeight: 20,
    paddingHorizontal: 16,
    // color painted inline from theme.
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
