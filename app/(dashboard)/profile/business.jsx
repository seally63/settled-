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
import { getServiceCategories, getServiceTypes } from "../../../lib/api/services";

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
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useUser();

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
        <StatusBar style="dark" />
        <View style={styles.loadingContainer}>
          <ActivityIndicator />
        </View>
      </ThemedView>
    );
  }

  const groupedServices = getGroupedSelectedServices();

  return (
    <ThemedView style={[styles.container, { paddingTop: insets.top }]}>
      <StatusBar style="dark" />

      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={10}>
          <Ionicons name="chevron-back" size={24} color={Colors.light.title} />
        </Pressable>
        <ThemedText style={styles.headerTitle}>Business info</ThemedText>
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

        {/* Job Titles */}
        <ThemedText style={styles.label}>Job title</ThemedText>
        <ThemedText style={styles.hintText}>Select up to 3</ThemedText>
        <Spacer height={8} />
        <Pressable
          style={styles.dropdownButton}
          onPress={() => setShowJobTitlesSheet(true)}
        >
          <ThemedText style={selectedJobTitles.length > 0 ? styles.dropdownText : styles.dropdownPlaceholder}>
            {selectedJobTitles.length > 0 ? `${selectedJobTitles.length} selected` : 'Select job titles...'}
          </ThemedText>
          <Ionicons name="chevron-down" size={20} color={Colors.light.subtitle} />
        </Pressable>

        {/* Selected Job Titles Chips */}
        {selectedJobTitles.length > 0 && (
          <View style={styles.chipsContainer}>
            {selectedJobTitles.map((title) => (
              <View key={title} style={styles.chip}>
                <ThemedText style={styles.chipText}>{title}</ThemedText>
                <Pressable
                  onPress={() => setSelectedJobTitles((prev) => prev.filter((t) => t !== title))}
                  hitSlop={8}
                >
                  <Ionicons name="close" size={16} color="#6B7280" />
                </Pressable>
              </View>
            ))}
          </View>
        )}

        <Spacer height={24} />

        {/* Services */}
        <ThemedText style={styles.label}>Services offered</ThemedText>
        <ThemedText style={styles.hintText}>Optional - helps clients find you</ThemedText>
        <Spacer height={8} />
        <Pressable
          style={styles.dropdownButton}
          onPress={() => setShowServicesSheet(true)}
        >
          <ThemedText style={selectedServiceIds.length > 0 ? styles.dropdownText : styles.dropdownPlaceholder}>
            {selectedServiceIds.length > 0 ? `${selectedServiceIds.length} selected` : 'Add services...'}
          </ThemedText>
          <Ionicons name="chevron-down" size={20} color={Colors.light.subtitle} />
        </Pressable>

        {/* Selected Services grouped by category */}
        {Object.keys(groupedServices).length > 0 && (
          <View style={styles.groupedChipsContainer}>
            {Object.entries(groupedServices).map(([categoryName, services]) => (
              <View key={categoryName} style={styles.categoryGroup}>
                <ThemedText style={styles.categoryLabel}>{categoryName}</ThemedText>
                <View style={styles.chipsContainer}>
                  {services.map((service) => (
                    <View key={service.id} style={styles.chip}>
                      <ThemedText style={styles.chipText}>{service.name}</ThemedText>
                      <Pressable
                        onPress={() => toggleService(service.id)}
                        hitSlop={8}
                      >
                        <Ionicons name="close" size={16} color="#6B7280" />
                      </Pressable>
                    </View>
                  ))}
                </View>
              </View>
            ))}
          </View>
        )}

        {selectedServiceIds.length === 0 && (
          <ThemedText style={styles.emptyServicesText}>No services added yet</ThemedText>
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
          <View style={styles.sheetContent}>
            {/* Handle bar */}
            <View style={styles.sheetHandle} />

            <View style={styles.sheetHeader}>
              <ThemedText style={styles.sheetTitle}>What's your job title?</ThemedText>
              <Pressable onPress={() => setShowJobTitlesSheet(false)} hitSlop={10} style={styles.sheetCloseBtn}>
                <Ionicons name="close" size={20} color="#111827" />
              </Pressable>
            </View>

            <ThemedText style={styles.sheetSubtitle}>Select up to 3</ThemedText>
            <Spacer height={16} />

            <ScrollView style={styles.sheetList} showsVerticalScrollIndicator={false}>
              {JOB_TITLE_OPTIONS.map((title) => {
                const isSelected = selectedJobTitles.includes(title);
                return (
                  <Pressable
                    key={title}
                    style={[styles.sheetListItem, isSelected && styles.sheetListItemSelected]}
                    onPress={() => toggleJobTitle(title)}
                  >
                    <ThemedText style={[styles.sheetListItemText, isSelected && styles.sheetListItemTextSelected]}>
                      {title}
                    </ThemedText>
                    {isSelected && (
                      <Ionicons name="checkmark" size={20} color={PRIMARY} />
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
          <View style={[styles.sheetContent, styles.servicesSheetContent]}>
            {/* Handle bar */}
            <View style={styles.sheetHandle} />

            <View style={styles.sheetHeader}>
              <ThemedText style={styles.sheetTitle}>Add services</ThemedText>
              <Pressable onPress={() => setShowServicesSheet(false)} hitSlop={10} style={styles.sheetCloseBtn}>
                <Ionicons name="close" size={20} color="#111827" />
              </Pressable>
            </View>

            <ThemedText style={styles.sheetSubtitle}>Select all that apply</ThemedText>
            <Spacer height={16} />

            {/* Search */}
            <View style={styles.searchContainer}>
              <Ionicons name="search" size={20} color={Colors.light.subtitle} />
              <TextInput
                style={styles.searchInput}
                placeholder="Search services..."
                placeholderTextColor={Colors.light.subtitle}
                value={serviceSearch}
                onChangeText={setServiceSearch}
              />
              {serviceSearch.length > 0 && (
                <Pressable onPress={() => setServiceSearch("")} hitSlop={10}>
                  <Ionicons name="close-circle" size={20} color={Colors.light.subtitle} />
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
                        style={styles.categoryHeader}
                        onPress={() => toggleCategory(category.id)}
                      >
                        <View style={styles.categoryHeaderLeft}>
                          <Ionicons
                            name={isExpanded ? "chevron-down" : "chevron-forward"}
                            size={20}
                            color={Colors.light.subtitle}
                          />
                          <ThemedText style={styles.categoryHeaderText}>
                            {category.name}
                            {selectedCount > 0 && (
                              <ThemedText style={styles.categoryCount}> ({selectedCount})</ThemedText>
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
                                  color={isSelected ? PRIMARY : Colors.light.subtitle}
                                />
                                <ThemedText style={[
                                  styles.serviceTypeText,
                                  isSelected && styles.serviceTypeTextSelected,
                                ]}>
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
          <View style={styles.modalContent}>
            {/* Handle bar */}
            <View style={styles.sheetHandle} />

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
  label: {
    fontSize: 14,
    fontWeight: "500",
    color: Colors.light.title,
    marginBottom: 4,
  },
  hintText: {
    fontSize: 12,
    color: Colors.light.subtitle,
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
  dropdownButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: Colors.light.border,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    minHeight: 52,
  },
  dropdownText: {
    fontSize: 16,
    color: Colors.light.title,
    flex: 1,
  },
  dropdownPlaceholder: {
    fontSize: 16,
    color: Colors.light.subtitle,
    flex: 1,
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
    color: Colors.light.subtitle,
    marginBottom: 6,
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: Colors.light.secondaryBackground,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 16,
  },
  chipText: {
    fontSize: 14,
    color: Colors.light.title,
  },
  emptyServicesText: {
    fontSize: 14,
    color: Colors.light.subtitle,
    textAlign: "center",
    marginTop: 16,
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
  sheetCloseBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#F3F4F6",
    alignItems: "center",
    justifyContent: "center",
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
    fontSize: 18,
    fontWeight: "600",
    color: Colors.light.title,
    flex: 1,
  },
  sheetSubtitle: {
    fontSize: 14,
    color: Colors.light.subtitle,
    marginTop: 4,
  },
  sheetList: {
    maxHeight: 400,
  },
  sheetListItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 16,
    paddingHorizontal: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.light.border,
  },
  sheetListItemSelected: {
    backgroundColor: "rgba(104, 73, 167, 0.05)",
  },
  sheetListItemText: {
    fontSize: 16,
    color: Colors.light.title,
    flex: 1,
  },
  sheetListItemTextSelected: {
    color: PRIMARY,
    fontWeight: "500",
  },
  sheetDoneBtn: {
    backgroundColor: PRIMARY,
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
    backgroundColor: Colors.light.secondaryBackground,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: Colors.light.title,
    padding: 0,
  },
  // Category accordion
  categoryHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.light.border,
  },
  categoryHeaderLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  categoryHeaderText: {
    fontSize: 16,
    fontWeight: "500",
    color: Colors.light.title,
  },
  categoryCount: {
    fontSize: 14,
    color: Colors.light.subtitle,
    fontWeight: "400",
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
    color: Colors.light.title,
  },
  serviceTypeTextSelected: {
    color: PRIMARY,
    fontWeight: "500",
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
    paddingTop: 12,
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
