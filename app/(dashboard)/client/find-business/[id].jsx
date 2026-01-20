// app/(dashboard)/client/find-business/[id].jsx
// Client view of Trade Profile - shows trade details with Request a Quote button
import { useEffect, useState, useCallback } from "react";
import {
  StyleSheet,
  View,
  ScrollView,
  Image,
  Pressable,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Modal,
  ActivityIndicator,
  Dimensions,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import * as ImageManipulator from "expo-image-manipulator";
import ImageViewing from "react-native-image-viewing";

import ThemedView from "../../../../components/ThemedView";
import ThemedText from "../../../../components/ThemedText";
import ThemedButton from "../../../../components/ThemedButton";
import ThemedTextInput from "../../../../components/ThemedTextInput";
import Spacer from "../../../../components/Spacer";
import { ProfilePageSkeleton, SkeletonBox, SkeletonText, CategoryGridSkeleton } from "../../../../components/Skeleton";
import { Colors } from "../../../../constants/Colors";
import { getTradeById, getMyRole } from "../../../../lib/api/profile";
import { requestDirectQuote } from "../../../../lib/api/directRequest";
import { getBusinessVerificationPublic, getTradePublicMetrics90d } from "../../../../lib/api/trust";
import { uploadRequestImages } from "../../../../lib/api/attachments";
import {
  getServiceCategories,
  getServiceTypes,
  getPropertyTypes,
  getTimingOptions,
} from "../../../../lib/api/services";
import { supabase } from "../../../../lib/supabase";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const PRIMARY = Colors?.light?.tint || "#7C3AED";

const TEST_PROFILE = {
  id: "test-demo",
  full_name: "TEST Business",
  business_name: "Demo Plumbing Co.",
  trade_title: "Plumber",
  bio: "We're a demo company for testing your flow. Fast, friendly, and fictional.",
  service_areas: "Shoreditch, Hackney, Camden",
  photo_url: null,
  created_at: new Date().toISOString(),
  rating_avg: 4.9,
  rating_count: 30,
};

function getInitials(name) {
  if (!name) return "?";
  const parts = name.trim().split(" ");
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
}

function getNameWithInitial(fullName) {
  if (!fullName) return "";
  const parts = fullName.trim().split(" ");
  if (parts.length >= 2) {
    return `${parts[0]} ${parts[parts.length - 1][0]}.`;
  }
  return fullName;
}

// Safely get service areas as a displayable string
function getServiceAreasDisplay(serviceAreas) {
  if (!serviceAreas) return null;
  if (typeof serviceAreas === "string") return serviceAreas;
  if (typeof serviceAreas === "object") {
    return serviceAreas.name || serviceAreas.description || null;
  }
  return null;
}

// Helper to render icon from either Ionicons or MaterialCommunityIcons
const ServiceIcon = ({ name, size, color }) => {
  if (name && name.startsWith("mci:")) {
    const iconName = name.replace("mci:", "");
    return <MaterialCommunityIcons name={iconName} size={size} color={color} />;
  }
  return <Ionicons name={name || "help-outline"} size={size} color={color} />;
};

// Budget options for the form
const BUDGET_OPTIONS = [
  { id: "under_250", label: "Under £250", value: "<£250" },
  { id: "250_500", label: "£250 - £500", value: "£250–£500" },
  { id: "500_1000", label: "£500 - £1,000", value: "£500–£1k" },
  { id: "1000_3000", label: "£1,000 - £3,000", value: "£1k–£3k" },
  { id: "3000_7500", label: "£3,000 - £7,500", value: "£3k–£7.5k" },
  { id: "7500_15000", label: "£7,500 - £15,000", value: "£7.5k–£15k" },
  { id: "over_15000", label: "£15,000+", value: ">£15k" },
  { id: "not_sure", label: "I'm not sure yet", value: "Not specified" },
];

// Minimal image processing
async function makeThumbnails(uris) {
  const out = [];
  for (const uri of uris) {
    try {
      const { uri: processedUri } = await ImageManipulator.manipulateAsync(
        uri,
        [{ resize: { width: 1200 } }],
        { compress: 0.8, format: ImageManipulator.SaveFormat.JPEG, base64: false }
      );
      out.push({ uri: processedUri });
    } catch (e) {
      out.push({ uri });
    }
  }
  return out;
}

// Verification Badge Component - matches trade-profile.jsx exactly
function VerificationBadge({ icon, label, status }) {
  const isVerified = status === true || status === "verified";

  return (
    <View style={styles.badgeWrapper}>
      <View style={[
        styles.badgeIconContainer,
        isVerified ? styles.badgeVerified : styles.badgeNotVerified,
      ]}>
        <Ionicons
          name={icon}
          size={20}
          color={isVerified ? Colors.light.title : "#9CA3AF"}
        />
        {isVerified && (
          <View style={styles.badgeCheckmark}>
            <Ionicons name="checkmark" size={10} color="#FFFFFF" />
          </View>
        )}
      </View>
      <ThemedText style={styles.badgeLabel}>{label}</ThemedText>
    </View>
  );
}

// Review Card Component - matches trade-profile.jsx
function ReviewCard({ review }) {
  const stars = review.rating || 5;
  const timeAgo = review.created_at
    ? formatTimeAgo(new Date(review.created_at))
    : "";

  return (
    <View style={styles.reviewCard}>
      <View style={styles.reviewHeader}>
        <View style={styles.reviewAvatar}>
          {review.photo_url ? (
            <Image source={{ uri: review.photo_url }} style={styles.reviewAvatarImage} />
          ) : (
            <View style={[styles.reviewAvatarImage, styles.reviewAvatarFallback]}>
              <ThemedText style={styles.reviewAvatarInitials}>
                {getInitials(review.name)}
              </ThemedText>
            </View>
          )}
        </View>
        <View style={styles.reviewHeaderInfo}>
          <ThemedText style={styles.reviewerName}>{review.name || "Anonymous"}</ThemedText>
          <View style={styles.reviewMeta}>
            <View style={styles.starsRow}>
              {[1, 2, 3, 4, 5].map((star) => (
                <Ionicons
                  key={star}
                  name={star <= stars ? "star" : "star-outline"}
                  size={14}
                  color="#F59E0B"
                />
              ))}
            </View>
            {timeAgo && (
              <ThemedText style={styles.reviewTime}>{timeAgo}</ThemedText>
            )}
          </View>
        </View>
      </View>
      {review.comment && (
        <ThemedText style={styles.reviewComment}>"{review.comment}"</ThemedText>
      )}
    </View>
  );
}

function formatTimeAgo(date) {
  const now = new Date();
  const diff = now - date;
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));

  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days} days ago`;
  if (days < 30) return `${Math.floor(days / 7)} week${Math.floor(days / 7) > 1 ? "s" : ""} ago`;
  if (days < 365) return `${Math.floor(days / 30)} month${Math.floor(days / 30) > 1 ? "s" : ""} ago`;
  return `${Math.floor(days / 365)} year${Math.floor(days / 365) > 1 ? "s" : ""} ago`;
}

// Performance Info Modal Component (3rd person language for profile view)
function PerformanceInfoModal({ visible, onClose, insets }) {
  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
      onRequestClose={onClose}
    >
      <View style={styles.infoModalOverlay}>
        <View style={[styles.infoModalSheet, { paddingBottom: (insets?.bottom || 0) + 20 }]}>
          {/* Handle bar */}
          <View style={styles.infoModalHandle} />

          <View style={styles.infoModalHeader}>
            <ThemedText style={styles.infoModalTitle}>Performance Metrics</ThemedText>
            <Pressable onPress={onClose} hitSlop={10} style={styles.infoModalCloseBtn}>
              <Ionicons name="close" size={20} color="#111827" />
            </Pressable>
          </View>

          <ScrollView style={styles.infoModalContent} showsVerticalScrollIndicator={false}>
            {/* Response Time */}
            <View style={styles.infoSection}>
              <View style={styles.infoSectionHeader}>
                <Ionicons name="flash-outline" size={20} color="#111827" />
                <ThemedText style={styles.infoSectionTitle}>Response Time</ThemedText>
              </View>
              <ThemedText style={styles.infoSectionText}>
                This measures how quickly the business responds to new quote requests and messages from clients.
              </ThemedText>
              <View style={styles.infoTipBox}>
                <ThemedText style={styles.infoTipTitle}>Why it matters</ThemedText>
                <ThemedText style={styles.infoTipText}>
                  Clients often reach out to multiple businesses. Those who respond within a few hours are much more likely to win the job.
                </ThemedText>
              </View>
            </View>

            {/* Quote Rate */}
            <View style={styles.infoSection}>
              <View style={styles.infoSectionHeader}>
                <Ionicons name="document-text-outline" size={20} color="#111827" />
                <ThemedText style={styles.infoSectionTitle}>Quote Rate</ThemedText>
              </View>
              <ThemedText style={styles.infoSectionText}>
                This shows the percentage of accepted quote requests that received a formal quote from the business.
              </ThemedText>
              <View style={styles.infoTipBox}>
                <ThemedText style={styles.infoTipTitle}>Why it matters</ThemedText>
                <ThemedText style={styles.infoTipText}>
                  A high quote rate means the business follows through on enquiries and provides clear pricing.
                </ThemedText>
              </View>
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

export default function TradeProfileClient() {
  const { id } = useLocalSearchParams();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const isTest = id === "test-demo";

  const [trade, setTrade] = useState(isTest ? TEST_PROFILE : null);
  const [loading, setLoading] = useState(!isTest);
  const [role, setRole] = useState(null);
  const [badges, setBadges] = useState(null);
  const [metrics, setMetrics] = useState(null);
  const [serviceNames, setServiceNames] = useState({});
  const [performanceStats, setPerformanceStats] = useState({
    responseTimeHours: null,
    quoteRate: null,
  });
  const [performanceInfoVisible, setPerformanceInfoVisible] = useState(false);

  // Request modal state
  const [showRequestModal, setShowRequestModal] = useState(false);
  const [requestStep, setRequestStep] = useState(1);

  // Step 1: Category
  const [categories, setCategories] = useState([]);
  const [loadingCategories, setLoadingCategories] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState(null);

  // Step 2: Service type
  const [serviceTypes, setServiceTypes] = useState([]);
  const [loadingServiceTypes, setLoadingServiceTypes] = useState(false);
  const [selectedServiceType, setSelectedServiceType] = useState(null);

  // Step 3: Details
  const [description, setDescription] = useState("");
  const [postcode, setPostcode] = useState("");
  const [propertyTypes, setPropertyTypes] = useState([]);
  const [selectedPropertyType, setSelectedPropertyType] = useState(null);
  const [showPropertyDropdown, setShowPropertyDropdown] = useState(false);

  // Step 4: Budget
  const [selectedBudget, setSelectedBudget] = useState(null);

  // Step 5: Photos & Timing
  const [photos, setPhotos] = useState([]);
  const [timingOptions, setTimingOptions] = useState([]);
  const [selectedTiming, setSelectedTiming] = useState(null);

  // Photo preparation overlay
  const [prepVisible, setPrepVisible] = useState(false);

  // Image viewer
  const [viewer, setViewer] = useState({ open: false, index: 0 });

  // Submission
  const [submitting, setSubmitting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadIdx, setUploadIdx] = useState(0);
  const [uploadTotal, setUploadTotal] = useState(0);

  // Load service names for display
  useEffect(() => {
    async function loadServiceNames() {
      try {
        const cats = await getServiceCategories();
        const namesMap = {};
        for (const cat of cats) {
          const types = await getServiceTypes(cat.id);
          for (const type of types) {
            namesMap[type.id] = { name: type.name, category: cat.name };
          }
        }
        setServiceNames(namesMap);
      } catch (e) {
        console.log("Error loading service names:", e);
      }
    }
    loadServiceNames();
  }, []);

  // Load trade data
  useEffect(() => {
    async function load() {
      try {
        setLoading(true);
        const myRole = await getMyRole();
        setRole(myRole || null);
        if (isTest) {
          setBadges({ companies_house_active: true, payments_verified: true, insurance_verified: true });
          setMetrics({ response_time_p50_hours: 2.5, acceptance_rate: 0.78 });
          setPerformanceStats({ responseTimeHours: 2, quoteRate: 85 });
          return;
        }
        const [t, b, m] = await Promise.all([
          getTradeById(id),
          getBusinessVerificationPublic(id).catch(() => null),
          getTradePublicMetrics90d(id).catch(() => null),
        ]);
        setTrade(t);
        setBadges(b);
        setMetrics(m);

        // Load performance stats (quote rate)
        const { data: targets } = await supabase
          .from("request_targets")
          .select("request_id, state")
          .eq("trade_id", id);

        const { data: quotes } = await supabase
          .from("tradify_native_app_db")
          .select("id, request_id, status")
          .eq("trade_id", id);

        // Calculate quote rate
        const acceptedRequests = (targets || []).filter((t) =>
          t.state?.toLowerCase().includes("accepted")
        ).length;
        const requestsWithQuotes = new Set(
          (quotes || [])
            .filter((q) => ["sent", "accepted", "declined", "expired", "completed", "awaiting_completion"].includes(q.status?.toLowerCase()))
            .map((q) => q.request_id)
        ).size;
        const quoteRate = acceptedRequests > 0
          ? Math.min(100, Math.round((requestsWithQuotes / acceptedRequests) * 100))
          : null;

        setPerformanceStats({
          responseTimeHours: m?.response_time_p50_hours || null,
          quoteRate,
        });
      } catch (e) {
        Alert.alert("Error", e?.message || "Failed to load business");
      } finally {
        setLoading(false);
      }
    }
    if (id) load();
  }, [id, isTest]);

  // Load form data when modal opens
  useEffect(() => {
    if (showRequestModal) {
      loadCategories();
      loadPropertyTypes();
      loadTimingOptions();
    }
  }, [showRequestModal]);

  useEffect(() => {
    if (selectedCategory?.id) {
      loadServiceTypes(selectedCategory.id);
    }
  }, [selectedCategory?.id]);

  async function loadCategories() {
    setLoadingCategories(true);
    try {
      const data = await getServiceCategories();
      setCategories(data);
    } catch (e) {
      console.warn("Failed to load categories:", e.message);
    } finally {
      setLoadingCategories(false);
    }
  }

  async function loadServiceTypes(categoryId) {
    setLoadingServiceTypes(true);
    try {
      const data = await getServiceTypes(categoryId);
      setServiceTypes(data);
    } catch (e) {
      console.warn("Failed to load service types:", e.message);
    } finally {
      setLoadingServiceTypes(false);
    }
  }

  async function loadPropertyTypes() {
    try {
      const data = await getPropertyTypes();
      setPropertyTypes(data);
    } catch (e) {
      console.warn("Failed to load property types:", e.message);
    }
  }

  async function loadTimingOptions() {
    try {
      const data = await getTimingOptions();
      setTimingOptions(data);
    } catch (e) {
      console.warn("Failed to load timing options:", e.message);
    }
  }

  // Reset form state
  function resetForm() {
    setRequestStep(1);
    setSelectedCategory(null);
    setSelectedServiceType(null);
    setDescription("");
    setPostcode("");
    setSelectedPropertyType(null);
    setSelectedBudget(null);
    setPhotos([]);
    setSelectedTiming(null);
  }

  // Photo handling
  async function pickFromLibrary() {
    try {
      const remaining = 5 - photos.length;
      if (remaining <= 0) {
        Alert.alert("Limit reached", "You can add up to 5 photos.");
        return;
      }
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (perm.status !== "granted") {
        Alert.alert("Permission needed", "Please allow photo access to attach images.");
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        allowsMultipleSelection: true,
        selectionLimit: remaining,
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.8,
      });
      if (result.canceled) return;

      const newUris = (result.assets || []).slice(0, remaining).map((a) => a.uri);
      if (!newUris.length) return;

      setPrepVisible(true);
      try {
        const thumbs = await makeThumbnails(newUris);
        setPhotos((prev) => [...prev, ...thumbs].slice(0, 5));
      } finally {
        setTimeout(() => setPrepVisible(false), 300);
      }
    } catch (e) {
      setPrepVisible(false);
    }
  }

  function removePhoto(idx) {
    setPhotos((prev) => prev.filter((_, i) => i !== idx));
  }

  async function uploadAndAttach(requestId) {
    const totalPhotos = photos.length;
    if (totalPhotos === 0) return;

    setUploadTotal(totalPhotos);
    setUploadIdx(0);
    setUploading(true);

    let uploadedPaths = [];
    try {
      uploadedPaths = await uploadRequestImages(String(requestId), photos, (done, total) => {
        setUploadTotal(total);
        setUploadIdx(done);
      });
    } catch (e) {
      console.warn("uploadRequestImages error:", e?.message || e);
    } finally {
      setUploading(false);
    }

    if (totalPhotos && !uploadedPaths.length) {
      Alert.alert("Photos not attached", "We couldn't upload your photos, but your request was still sent.");
    }
  }

  // Submit direct request
  async function submitDirectRequest() {
    try {
      if (isTest) {
        Alert.alert("Demo", "This is a demo business — request not sent.");
        return;
      }
      if (!selectedCategory) return Alert.alert("Please select a category.");
      if (!selectedServiceType) return Alert.alert("Please select a service type.");
      if (!postcode?.trim()) return Alert.alert("Please enter your postcode.");
      if (!selectedTiming) return Alert.alert("Please select when you need this done.");

      setSubmitting(true);

      const normalizedPostcode = postcode.trim().toUpperCase();

      // Put the actual job description first so it shows in project card previews
      const details = [
        description?.trim() || null,
        `Category: ${selectedCategory.name}`,
        `Service: ${selectedServiceType.name}`,
        selectedPropertyType ? `Property: ${selectedPropertyType.name}` : null,
        `Postcode: ${normalizedPostcode}`,
        selectedBudget ? `Budget: ${selectedBudget.label}` : null,
        `Timing: ${selectedTiming.name}`,
        selectedTiming.is_emergency ? `Emergency: Yes` : null,
      ]
        .filter(Boolean)
        .join("\n");

      const suggested_title = `${selectedCategory.name} - ${selectedServiceType.name}`;

      const res = await requestDirectQuote(id, {
        details,
        suggested_title,
        category_id: selectedCategory.id,
        service_type_id: selectedServiceType.id,
        property_type_id: selectedPropertyType?.id || null,
        timing_option_id: selectedTiming.id,
        postcode: normalizedPostcode,
        budget_band: selectedBudget?.value || null,
      });

      const newRequestId = res?.id || res?.request_id || res?.data?.id || res?.data?.request_id || null;

      if (newRequestId) {
        await uploadAndAttach(String(newRequestId));
      }

      setShowRequestModal(false);
      resetForm();

      Alert.alert("Request sent", "Your quote request has been sent.", [
        { text: "OK", onPress: () => router.replace("/client") },
      ]);
    } catch (e) {
      Alert.alert("Unable to request", e?.message || "Failed to send request.");
    } finally {
      setSubmitting(false);
    }
  }

  if (role && role !== "client") {
    return (
      <ThemedView style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
        <ThemedText>Not available for your role.</ThemedText>
      </ThemedView>
    );
  }

  if (loading) {
    return (
      <ThemedView style={[styles.container, { paddingTop: insets.top }]}>
        <StatusBar style="dark" />
        <ProfilePageSkeleton paddingTop={16} />
      </ThemedView>
    );
  }

  const displayName = trade?.full_name || "User";
  const businessName = trade?.business_name || displayName;
  const photoUrl = trade?.photo_url;
  const bio = trade?.bio;
  const jobTitles = trade?.job_titles || [];
  const serviceTypeIds = trade?.service_type_ids || [];
  const basePostcode = trade?.base_postcode;
  // The database column is "town_city"
  const baseCity = trade?.town_city;
  const serviceRadiusKm = trade?.service_radius_km;
  const ratingAvg = Number(trade?.average_rating || 0);
  const ratingCount = Number(trade?.review_count || 0);
  const reviews = trade?.reviews || [];

  // Convert km to miles for display (1 km = 0.621371 miles)
  const serviceRadiusMiles = serviceRadiusKm
    ? Math.round(serviceRadiusKm * 0.621371)
    : null;

  // Format location display: "City · X mi" or just "City" or fallback to postcode
  const locationDisplay = baseCity
    ? (serviceRadiusMiles ? `${baseCity} · ${serviceRadiusMiles} mi` : baseCity)
    : basePostcode || null;

  // Use trade's verification data, or fall back to badges mapping
  const verification = trade?.verification || (badges ? {
    photo_id: badges.companies_house_active ? "verified" : "not_started",
    insurance: badges.insurance_verified ? "verified" : "not_started",
    credentials: badges.payments_verified ? "verified" : "not_started",
  } : null);

  // Group services by category
  const groupedServices = {};
  for (const serviceId of serviceTypeIds) {
    const service = serviceNames[serviceId];
    if (service) {
      if (!groupedServices[service.category]) {
        groupedServices[service.category] = [];
      }
      groupedServices[service.category].push(service.name);
    }
  }

  // Image viewer for photos
  const imageViewerImages = photos.map((p) => ({ uri: p.uri }));

  return (
    <ThemedView style={[styles.container, { paddingTop: insets.top }]}>
      <StatusBar style={showRequestModal ? "light" : "dark"} />

      {/* Header - shows business name */}
      <View style={styles.header}>
        <Pressable
          onPress={() => router.canGoBack() ? router.back() : router.replace("/client")}
          hitSlop={10}
        >
          <Ionicons name="chevron-back" size={24} color={Colors.light.title} />
        </Pressable>
        <ThemedText style={styles.headerTitle} numberOfLines={1}>{businessName}</ThemedText>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom > 0 ? insets.bottom + 24 : 40 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Hero Card - matches trade-profile.jsx */}
        <View style={styles.heroCard}>
          {/* Avatar */}
          <View style={styles.avatarContainer}>
            {photoUrl ? (
              <Image source={{ uri: photoUrl }} style={styles.avatar} />
            ) : (
              <View style={[styles.avatar, styles.avatarFallback]}>
                <ThemedText style={styles.avatarInitials}>
                  {getInitials(businessName || displayName)}
                </ThemedText>
              </View>
            )}
          </View>

          <Spacer height={16} />

          {/* Names */}
          <ThemedText style={styles.businessNameText}>{businessName}</ThemedText>
          <ThemedText style={styles.personalName}>{displayName}</ThemedText>

          <Spacer height={16} />

          {/* Verification Badges */}
          <View style={styles.badgesRow}>
            <VerificationBadge
              icon="person-outline"
              label="ID"
              status={verification?.photo_id}
            />
            <VerificationBadge
              icon="shield-outline"
              label="Insurance"
              status={verification?.insurance}
            />
            <VerificationBadge
              icon="ribbon-outline"
              label="Credentials"
              status={verification?.credentials}
            />
          </View>

          <Spacer height={16} />

          {/* Rating */}
          {ratingCount > 0 ? (
            <View style={styles.ratingRow}>
              <Ionicons name="star" size={18} color="#F59E0B" />
              <ThemedText style={styles.ratingText}>
                {ratingAvg.toFixed(1)} ({ratingCount} review{ratingCount !== 1 ? "s" : ""})
              </ThemedText>
            </View>
          ) : (
            <ThemedText style={styles.noRatingText}>No reviews yet</ThemedText>
          )}
        </View>

        {/* Performance Section */}
        <View style={styles.performanceSection}>
          <View style={styles.performanceRow}>
            {/* Response Time */}
            <View style={styles.performanceItem}>
              <View style={styles.performanceIconContainer}>
                <Ionicons name="flash-outline" size={18} color="#111827" />
              </View>
              <View>
                <ThemedText style={styles.performanceValue}>
                  {performanceStats.responseTimeHours !== null
                    ? `${performanceStats.responseTimeHours}h`
                    : "--"}
                </ThemedText>
                <ThemedText style={styles.performanceLabel}>Response</ThemedText>
              </View>
            </View>

            {/* Quote Rate */}
            <View style={styles.performanceItem}>
              <View style={styles.performanceIconContainer}>
                <Ionicons name="document-text-outline" size={18} color="#111827" />
              </View>
              <View>
                <ThemedText style={styles.performanceValue}>
                  {performanceStats.quoteRate !== null ? `${performanceStats.quoteRate}%` : "--"}
                </ThemedText>
                <ThemedText style={styles.performanceLabel}>Quote Rate</ThemedText>
              </View>
            </View>

            {/* Info Button */}
            <Pressable
              style={styles.performanceInfoButton}
              onPress={() => setPerformanceInfoVisible(true)}
              hitSlop={10}
            >
              <Ionicons name="information-circle-outline" size={20} color="#6B7280" />
            </Pressable>
          </View>
        </View>

        {/* Divider */}
        <View style={styles.sectionDivider} />

        {/* About Section */}
        <ThemedText style={styles.sectionLabel}>ABOUT</ThemedText>
        <View style={styles.sectionCard}>
          {/* Job Titles */}
          {jobTitles.length > 0 && (
            <ThemedText style={styles.jobTitlesText}>
              {jobTitles.join(" · ")}
            </ThemedText>
          )}

          {/* Location */}
          {locationDisplay && (
            <View style={styles.locationRow}>
              <Ionicons name="location-outline" size={16} color={Colors.light.subtitle} />
              <ThemedText style={styles.locationText}>{locationDisplay}</ThemedText>
            </View>
          )}

          {/* Bio */}
          {bio && (
            <>
              <Spacer height={12} />
              <ThemedText style={styles.bioText}>{bio}</ThemedText>
            </>
          )}

          {!jobTitles.length && !locationDisplay && !bio && (
            <ThemedText style={styles.emptyText}>No information added yet</ThemedText>
          )}
        </View>

        {/* Services Offered Section */}
        {Object.keys(groupedServices).length > 0 && (
          <>
            <ThemedText style={styles.sectionLabel}>SERVICES OFFERED</ThemedText>
            <View style={styles.sectionCard}>
              {Object.entries(groupedServices).map(([category, services]) => (
                <View key={category} style={styles.serviceCategoryGroup}>
                  <ThemedText style={styles.serviceCategoryLabel}>{category}</ThemedText>
                  <View style={styles.serviceChipsContainer}>
                    {services.map((service) => (
                      <View key={service} style={styles.serviceChip}>
                        <ThemedText style={styles.serviceChipText}>{service}</ThemedText>
                      </View>
                    ))}
                  </View>
                </View>
              ))}
            </View>
          </>
        )}

        {/* Reviews Section */}
        <ThemedText style={styles.sectionLabel}>REVIEWS</ThemedText>
        <View style={styles.sectionCard}>
          {reviews.length > 0 ? (
            <>
              {reviews.slice(0, 3).map((review, index) => (
                <View key={review.id || index}>
                  {index > 0 && <View style={styles.reviewDivider} />}
                  <ReviewCard review={review} />
                </View>
              ))}
              {reviews.length > 3 && (
                <Pressable style={styles.seeAllLink} onPress={() => {}}>
                  <ThemedText style={styles.seeAllText}>
                    See all {ratingCount} reviews
                  </ThemedText>
                  <Ionicons name="chevron-forward" size={16} color={Colors.primary} />
                </Pressable>
              )}
            </>
          ) : (
            <ThemedText style={styles.emptyText}>No reviews yet</ThemedText>
          )}
        </View>

        {/* Request a Quote Button */}
        <ThemedButton onPress={() => setShowRequestModal(true)} style={styles.requestButton}>
          <ThemedText style={styles.requestButtonText}>Request a Quote</ThemedText>
        </ThemedButton>

        {/* Report Link */}
        <Pressable style={styles.reportLink} onPress={() => Alert.alert("Report", "Report functionality coming soon.")}>
          <Ionicons name="flag-outline" size={18} color="#DC2626" />
          <ThemedText style={styles.reportText}>Report this trade</ThemedText>
        </Pressable>
      </ScrollView>

      {/* Performance Info Modal */}
      <PerformanceInfoModal
        visible={performanceInfoVisible}
        onClose={() => setPerformanceInfoVisible(false)}
        insets={insets}
      />

      {/* Request Modal */}
      <Modal
        visible={showRequestModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => {
          setShowRequestModal(false);
          resetForm();
        }}
      >
        <ThemedView style={styles.modalContainer}>
          {/* Modal Header */}
          <View style={styles.modalHeader}>
            <Pressable
              onPress={() => {
                if (requestStep > 1) {
                  setRequestStep(requestStep - 1);
                } else {
                  setShowRequestModal(false);
                  resetForm();
                }
              }}
              hitSlop={10}
            >
              <Ionicons name="chevron-back" size={24} color={Colors.light.title} />
            </Pressable>
            <ThemedText style={styles.modalTitle}>
              {requestStep === 1 && "Select Category"}
              {requestStep === 2 && "Select Service"}
              {requestStep === 3 && "Job Details"}
              {requestStep === 4 && "Budget"}
              {requestStep === 5 && "Photos & Timing"}
              {requestStep === 6 && "Review"}
            </ThemedText>
            <Pressable onPress={() => { setShowRequestModal(false); resetForm(); }} hitSlop={10}>
              <Ionicons name="close" size={24} color={Colors.light.title} />
            </Pressable>
          </View>

          {/* Progress Bar */}
          <View style={styles.progressBarContainer}>
            <View style={styles.progressBarTrack}>
              <View style={[styles.progressBarFill, { width: `${(requestStep / 6) * 100}%` }]} />
            </View>
          </View>

          <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
            <ScrollView
              style={{ flex: 1 }}
              contentContainerStyle={styles.modalScrollContent}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              {/* Step 1: Category */}
              {requestStep === 1 && (
                <>
                  <ThemedText style={styles.stepTitle}>What do you need help with?</ThemedText>
                  {loadingCategories ? (
                    <View style={{ marginTop: 16 }}>
                      <CategoryGridSkeleton />
                    </View>
                  ) : (
                    <View style={styles.categoryGrid}>
                      {categories.map((cat) => (
                        <Pressable
                          key={cat.id}
                          style={styles.categoryCard}
                          onPress={() => {
                            setSelectedCategory(cat);
                            setSelectedServiceType(null);
                            setRequestStep(2);
                          }}
                        >
                          <View style={styles.categoryIconWrap}>
                            <ServiceIcon name={cat.icon} size={28} color="#374151" />
                          </View>
                          <ThemedText style={styles.categoryName}>{cat.name}</ThemedText>
                        </Pressable>
                      ))}
                    </View>
                  )}
                </>
              )}

              {/* Step 2: Service Type */}
              {requestStep === 2 && (
                <>
                  <ThemedText style={styles.stepTitle}>What type of {selectedCategory?.name?.toLowerCase() || "service"}?</ThemedText>
                  {loadingServiceTypes ? (
                    <View style={{ marginTop: 16 }}>
                      {[1, 2, 3, 4, 5].map((i) => (
                        <View key={i} style={styles.serviceTypeCardSkeleton}>
                          <SkeletonBox width={40} height={40} borderRadius={20} />
                          <SkeletonText width="60%" height={16} style={{ marginLeft: 14 }} />
                        </View>
                      ))}
                    </View>
                  ) : (
                    <View style={styles.serviceTypeList}>
                      {serviceTypes.map((type) => (
                        <Pressable
                          key={type.id}
                          style={styles.serviceTypeCard}
                          onPress={() => {
                            setSelectedServiceType(type);
                            setRequestStep(3);
                          }}
                        >
                          <View style={styles.serviceTypeIcon}>
                            <ServiceIcon name={type.icon} size={20} color="#374151" />
                          </View>
                          <ThemedText style={styles.serviceTypeName}>{type.name}</ThemedText>
                          <Ionicons name="chevron-forward" size={20} color="#999" />
                        </Pressable>
                      ))}
                    </View>
                  )}
                </>
              )}

              {/* Step 3: Details */}
              {requestStep === 3 && (
                <>
                  <ThemedText style={styles.stepTitle}>Tell us more</ThemedText>
                  <ThemedText style={styles.stepSubtitle}>
                    {selectedCategory?.name} → {selectedServiceType?.name}
                  </ThemedText>

                  <View style={styles.fieldContainer}>
                    <ThemedText style={styles.fieldLabel}>Describe the job</ThemedText>
                    <ThemedTextInput
                      style={styles.textArea}
                      placeholder="e.g., Need to fix a leaky tap under the kitchen sink..."
                      placeholderTextColor="#9CA3AF"
                      value={description}
                      onChangeText={(t) => { if (t.length <= 500) setDescription(t); }}
                      multiline
                      textAlignVertical="top"
                    />
                    <ThemedText style={styles.charCount}>{description.length}/500</ThemedText>
                  </View>

                  <View style={styles.fieldContainer}>
                    <ThemedText style={styles.fieldLabel}>Property type</ThemedText>
                    <Pressable style={styles.dropdown} onPress={() => setShowPropertyDropdown(!showPropertyDropdown)}>
                      <ThemedText style={selectedPropertyType ? styles.dropdownText : styles.dropdownPlaceholder}>
                        {selectedPropertyType?.name || "Select property type"}
                      </ThemedText>
                      <Ionicons name={showPropertyDropdown ? "chevron-up" : "chevron-down"} size={20} color="#666" />
                    </Pressable>
                    {showPropertyDropdown && (
                      <View style={styles.dropdownMenu}>
                        {propertyTypes.map((pt) => (
                          <Pressable
                            key={pt.id}
                            style={[styles.dropdownItem, selectedPropertyType?.id === pt.id && styles.dropdownItemSelected]}
                            onPress={() => { setSelectedPropertyType(pt); setShowPropertyDropdown(false); }}
                          >
                            <ThemedText style={styles.dropdownItemText}>{pt.name}</ThemedText>
                            {selectedPropertyType?.id === pt.id && <Ionicons name="checkmark" size={18} color={Colors.primary} />}
                          </Pressable>
                        ))}
                      </View>
                    )}
                  </View>

                  <View style={styles.fieldContainer}>
                    <ThemedText style={styles.fieldLabel}>
                      Your postcode <ThemedText style={styles.requiredAsterisk}>*</ThemedText>
                    </ThemedText>
                    <ThemedTextInput
                      style={styles.textInput}
                      placeholder="e.g., EH48 3NN"
                      placeholderTextColor="#9CA3AF"
                      value={postcode}
                      onChangeText={(t) => setPostcode(t.toUpperCase())}
                      autoCapitalize="characters"
                      maxLength={10}
                    />
                  </View>

                  <ThemedButton
                    onPress={() => setRequestStep(4)}
                    disabled={!postcode?.trim()}
                    style={styles.continueButton}
                  >
                    <ThemedText style={styles.continueButtonText}>Continue</ThemedText>
                  </ThemedButton>
                </>
              )}

              {/* Step 4: Budget */}
              {requestStep === 4 && (
                <>
                  <ThemedText style={styles.stepTitle}>What's your budget?</ThemedText>
                  <View style={styles.budgetList}>
                    {BUDGET_OPTIONS.map((option) => (
                      <Pressable
                        key={option.id}
                        style={[styles.budgetOption, selectedBudget?.id === option.id && styles.budgetOptionSelected]}
                        onPress={() => setSelectedBudget(option)}
                      >
                        <View style={[styles.radioOuter, selectedBudget?.id === option.id && styles.radioOuterSelected]}>
                          {selectedBudget?.id === option.id && <View style={styles.radioInner} />}
                        </View>
                        <ThemedText style={styles.budgetOptionText}>{option.label}</ThemedText>
                      </Pressable>
                    ))}
                  </View>
                  <ThemedButton
                    onPress={() => setRequestStep(5)}
                    disabled={!selectedBudget}
                    style={styles.continueButton}
                  >
                    <ThemedText style={styles.continueButtonText}>Continue</ThemedText>
                  </ThemedButton>
                </>
              )}

              {/* Step 5: Photos & Timing */}
              {requestStep === 5 && (
                <>
                  <ThemedText style={styles.stepTitle}>Almost done!</ThemedText>

                  <View style={styles.sectionContainer}>
                    <ThemedText style={styles.sectionTitle}>Add photos (optional)</ThemedText>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.photoScroll}>
                      {photos.map((p, i) => (
                        <View key={`${p.uri}-${i}`} style={styles.photoCell}>
                          <Pressable style={{ flex: 1 }} onPress={() => setViewer({ open: true, index: i })}>
                            <Image source={{ uri: p.uri }} style={styles.photoImg} />
                          </Pressable>
                          <Pressable onPress={() => removePhoto(i)} style={styles.photoRemove} hitSlop={8}>
                            <Ionicons name="close" size={14} color="#fff" />
                          </Pressable>
                        </View>
                      ))}
                      {photos.length < 5 && (
                        <Pressable onPress={pickFromLibrary} style={styles.addPhotoCell}>
                          <Ionicons name="add" size={28} color="#666" />
                          <ThemedText style={styles.addPhotoText}>Add</ThemedText>
                        </Pressable>
                      )}
                    </ScrollView>
                  </View>

                  <View style={styles.sectionContainer}>
                    <ThemedText style={styles.sectionTitle}>When do you need this done?</ThemedText>
                    <View style={styles.timingList}>
                      {timingOptions.map((opt) => (
                        <Pressable
                          key={opt.id}
                          style={[styles.timingOption, selectedTiming?.id === opt.id && styles.timingOptionSelected]}
                          onPress={() => setSelectedTiming(opt)}
                        >
                          <View style={[styles.radioOuter, selectedTiming?.id === opt.id && styles.radioOuterSelected]}>
                            {selectedTiming?.id === opt.id && <View style={styles.radioInner} />}
                          </View>
                          <ThemedText style={[styles.timingText, opt.is_emergency && styles.timingTextEmergency]}>
                            {opt.name}
                          </ThemedText>
                        </Pressable>
                      ))}
                    </View>
                  </View>

                  <ThemedButton
                    onPress={() => setRequestStep(6)}
                    disabled={!selectedTiming}
                    style={styles.continueButton}
                  >
                    <ThemedText style={styles.continueButtonText}>Review Request</ThemedText>
                  </ThemedButton>
                </>
              )}

              {/* Step 6: Review */}
              {requestStep === 6 && (
                <>
                  <ThemedText style={styles.stepTitle}>Review your request</ThemedText>

                  <View style={styles.reviewCard}>
                    <ReviewRow icon="business-outline" label="BUSINESS" value={trade?.business_name || trade?.full_name} />
                    <ReviewRow icon="construct-outline" label="SERVICE" value={`${selectedCategory?.name} → ${selectedServiceType?.name}`} onEdit={() => setRequestStep(1)} />
                    <ReviewRow icon="document-text-outline" label="DETAILS" value={description?.trim() || "No description"} onEdit={() => setRequestStep(3)} />
                    <ReviewRow icon="home-outline" label="PROPERTY" value={selectedPropertyType?.name || "Not specified"} onEdit={() => setRequestStep(3)} />
                    <ReviewRow icon="location-outline" label="POSTCODE" value={postcode?.trim() || "Not specified"} onEdit={() => setRequestStep(3)} />
                    <ReviewRow icon="cash-outline" label="BUDGET" value={selectedBudget?.label || "Not specified"} onEdit={() => setRequestStep(4)} />
                    <ReviewRow
                      icon="time-outline"
                      label="TIMING"
                      value={selectedTiming?.name}
                      isEmergency={selectedTiming?.is_emergency}
                      onEdit={() => setRequestStep(5)}
                    />
                    <View style={styles.reviewSection}>
                      <View style={styles.reviewLabelRow}>
                        <Ionicons name="images-outline" size={16} color="#6B7280" />
                        <ThemedText style={styles.reviewLabel}>PHOTOS</ThemedText>
                      </View>
                      <View style={styles.reviewPhotos}>
                        {photos.length > 0 ? photos.map((p, i) => (
                          <Image key={i} source={{ uri: p.uri }} style={styles.reviewPhotoThumb} />
                        )) : (
                          <ThemedText style={styles.reviewValue}>No photos added</ThemedText>
                        )}
                      </View>
                      <Pressable onPress={() => setRequestStep(5)} style={styles.editButton}>
                        <ThemedText style={styles.editButtonText}>Edit</ThemedText>
                      </Pressable>
                    </View>
                  </View>

                  <ThemedButton
                    onPress={submitDirectRequest}
                    disabled={submitting}
                    style={styles.continueButton}
                  >
                    <ThemedText style={styles.continueButtonText}>
                      {submitting ? "Submitting…" : "Submit Request"}
                    </ThemedText>
                  </ThemedButton>

                  <ThemedText style={styles.disclaimer}>
                    By submitting, you agree to receive a quote from this tradesperson
                  </ThemedText>
                </>
              )}
            </ScrollView>
          </KeyboardAvoidingView>
        </ThemedView>

        {/* Upload Overlay */}
        {(prepVisible || uploading) && (
          <View style={styles.uploadOverlay}>
            <View style={styles.uploadCard}>
              <ActivityIndicator size="large" color={Colors.primary} />
              <ThemedText style={styles.uploadTitle}>
                {prepVisible ? "Preparing photos…" : "Uploading photos…"}
              </ThemedText>
              {uploading && uploadTotal > 0 && (
                <ThemedText style={styles.uploadSub}>{uploadIdx} of {uploadTotal}</ThemedText>
              )}
            </View>
          </View>
        )}

        {/* Image Viewer */}
        <ImageViewing
          images={imageViewerImages}
          imageIndex={viewer.index}
          visible={viewer.open && photos.length > 0}
          onRequestClose={() => setViewer({ open: false, index: 0 })}
          swipeToCloseEnabled
          doubleTapToZoomEnabled
        />
      </Modal>
    </ThemedView>
  );
}

// Review Row Component
function ReviewRow({ icon, label, value, isEmergency, onEdit }) {
  return (
    <>
      <View style={styles.reviewSection}>
        <View style={styles.reviewLabelRow}>
          <Ionicons name={icon} size={16} color={isEmergency ? "#EF4444" : "#6B7280"} />
          <ThemedText style={[styles.reviewLabel, isEmergency && { color: "#EF4444" }]}>{label}</ThemedText>
        </View>
        <ThemedText style={[styles.reviewValue, isEmergency && { color: "#EF4444" }]} numberOfLines={2}>
          {value}
        </ThemedText>
        {onEdit && (
          <Pressable onPress={onEdit} style={styles.editButton}>
            <ThemedText style={styles.editButtonText}>Edit</ThemedText>
          </Pressable>
        )}
      </View>
      <View style={styles.reviewDivider} />
    </>
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
  // Header
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
    flex: 1,
    textAlign: "center",
    marginHorizontal: 8,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
  },

  // Hero Card - matches trade-profile.jsx
  heroCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.light.border,
    padding: 24,
    alignItems: "center",
    marginBottom: 24,
  },
  avatarContainer: {},
  avatar: {
    width: 96,
    height: 96,
    borderRadius: 48,
  },
  avatarFallback: {
    backgroundColor: Colors.light.secondaryBackground,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarInitials: {
    fontSize: 32,
    fontWeight: "600",
    color: Colors.light.subtitle,
  },
  businessNameText: {
    fontSize: 24,
    fontWeight: "600",
    color: Colors.light.title,
    textAlign: "center",
  },
  personalName: {
    fontSize: 16,
    color: Colors.light.subtitle,
    marginTop: 4,
    textAlign: "center",
  },
  // Badges
  badgesRow: {
    flexDirection: "row",
    gap: 24,
  },
  badgeWrapper: {
    alignItems: "center",
  },
  badgeIconContainer: {
    width: 44,
    height: 44,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  badgeVerified: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: Colors.light.border,
  },
  badgeNotVerified: {
    backgroundColor: "#F9FAFB",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderStyle: "dashed",
  },
  badgeCheckmark: {
    position: "absolute",
    bottom: -4,
    right: -4,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: "#10B981",
    alignItems: "center",
    justifyContent: "center",
  },
  badgeLabel: {
    fontSize: 12,
    color: Colors.light.subtitle,
    marginTop: 8,
  },
  // Rating
  ratingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  ratingText: {
    fontSize: 16,
    color: Colors.light.title,
    fontWeight: "500",
  },
  noRatingText: {
    fontSize: 14,
    color: Colors.light.subtitle,
  },
  // Performance Section
  performanceSection: {
    marginBottom: 16,
  },
  performanceRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 32,
  },
  performanceItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  performanceIconContainer: {
    width: 32,
    height: 32,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#111827",
    alignItems: "center",
    justifyContent: "center",
  },
  performanceValue: {
    fontSize: 16,
    fontWeight: "600",
    color: "#111827",
  },
  performanceLabel: {
    fontSize: 12,
    color: Colors.light.subtitle,
  },
  performanceInfoButton: {
    padding: 4,
  },
  sectionDivider: {
    height: 1,
    backgroundColor: Colors.light.border,
    marginBottom: 16,
  },
  // Section
  sectionLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: Colors.light.subtitle,
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  sectionCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.light.border,
    padding: 16,
    marginBottom: 24,
  },
  // About
  jobTitlesText: {
    fontSize: 16,
    fontWeight: "500",
    color: Colors.light.title,
  },
  locationRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 8,
  },
  locationText: {
    fontSize: 14,
    color: Colors.light.subtitle,
  },
  bioText: {
    fontSize: 15,
    color: Colors.light.title,
    lineHeight: 22,
  },
  emptyText: {
    fontSize: 14,
    color: Colors.light.subtitle,
    fontStyle: "italic",
  },
  // Services
  serviceCategoryGroup: {
    marginBottom: 16,
  },
  serviceCategoryLabel: {
    fontSize: 14,
    fontWeight: "500",
    color: Colors.light.subtitle,
    marginBottom: 8,
  },
  serviceChipsContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  serviceChip: {
    backgroundColor: Colors.light.secondaryBackground,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  serviceChipText: {
    fontSize: 14,
    color: Colors.light.title,
  },
  // Reviews
  reviewDivider: {
    height: 1,
    backgroundColor: Colors.light.border,
    marginVertical: 16,
  },
  reviewCard: {},
  reviewHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
  },
  reviewAvatar: {},
  reviewAvatarImage: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  reviewAvatarFallback: {
    backgroundColor: Colors.light.secondaryBackground,
    alignItems: "center",
    justifyContent: "center",
  },
  reviewAvatarInitials: {
    fontSize: 14,
    fontWeight: "600",
    color: Colors.light.subtitle,
  },
  reviewHeaderInfo: {
    marginLeft: 12,
    flex: 1,
  },
  reviewerName: {
    fontSize: 16,
    fontWeight: "500",
    color: Colors.light.title,
  },
  reviewMeta: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 4,
    gap: 12,
  },
  starsRow: {
    flexDirection: "row",
    gap: 2,
  },
  reviewTime: {
    fontSize: 12,
    color: Colors.light.subtitle,
  },
  reviewComment: {
    fontSize: 15,
    color: Colors.light.title,
    marginTop: 12,
    lineHeight: 22,
    fontStyle: "italic",
  },
  seeAllLink: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: Colors.light.border,
    marginTop: 16,
    gap: 4,
  },
  seeAllText: {
    fontSize: 14,
    color: Colors.primary,
    fontWeight: "500",
  },

  // Request Button
  requestButton: {
    borderRadius: 28,
    paddingVertical: 16,
  },
  requestButtonText: {
    color: "#FFFFFF",
    fontSize: 17,
    fontWeight: "600",
    textAlign: "center",
  },

  // Report
  reportLink: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 16,
  },
  reportText: {
    fontSize: 14,
    color: "#DC2626",
  },

  // Info Modal (80% height bottom sheet)
  infoModalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "flex-end",
  },
  infoModalSheet: {
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    height: "80%",
    paddingTop: 12,
  },
  infoModalHandle: {
    width: 36,
    height: 4,
    backgroundColor: "#D1D5DB",
    borderRadius: 2,
    alignSelf: "center",
    marginBottom: 16,
  },
  infoModalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 24,
    paddingBottom: 16,
  },
  infoModalTitle: {
    fontSize: 22,
    fontWeight: "700",
    color: "#111827",
  },
  infoModalCloseBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#F3F4F6",
    alignItems: "center",
    justifyContent: "center",
  },
  infoModalContent: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 16,
  },
  infoSection: {
    marginBottom: 28,
  },
  infoSectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 12,
  },
  infoSectionTitle: {
    fontSize: 17,
    fontWeight: "600",
    color: "#111827",
  },
  infoSectionText: {
    fontSize: 15,
    color: "#374151",
    lineHeight: 22,
    marginBottom: 12,
  },
  infoTipBox: {
    backgroundColor: "#F9FAFB",
    borderRadius: 12,
    padding: 16,
  },
  infoTipTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: "#111827",
    marginBottom: 6,
  },
  infoTipText: {
    fontSize: 14,
    color: "#4B5563",
    lineHeight: 20,
  },

  // Modal
  modalContainer: {
    flex: 1,
    backgroundColor: "#FFFFFF",
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 12,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: Colors.light.title,
  },
  progressBarContainer: {
    paddingHorizontal: 20,
    marginBottom: 16,
  },
  progressBarTrack: {
    height: 4,
    backgroundColor: "rgba(0,0,0,0.08)",
    borderRadius: 2,
    overflow: "hidden",
  },
  progressBarFill: {
    height: "100%",
    backgroundColor: Colors.primary,
    borderRadius: 2,
  },
  modalScrollContent: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 40,
  },

  // Steps
  stepTitle: {
    fontSize: 24,
    fontWeight: "bold",
    color: Colors.light.title,
    marginBottom: 8,
  },
  stepSubtitle: {
    fontSize: 14,
    color: Colors.primary,
    fontWeight: "500",
    marginBottom: 24,
  },

  // Category grid
  categoryGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    marginTop: 16,
  },
  categoryCard: {
    width: (SCREEN_WIDTH - 52) / 2,
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 16,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.08)",
  },
  categoryIconWrap: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "#F3F4F6",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  categoryName: {
    fontSize: 14,
    fontWeight: "600",
    textAlign: "center",
  },

  // Service type list
  serviceTypeList: {},
  serviceTypeCardSkeleton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 16,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.08)",
  },
  serviceTypeCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 16,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.08)",
  },
  serviceTypeIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#F3F4F6",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 14,
  },
  serviceTypeName: {
    flex: 1,
    fontSize: 16,
    fontWeight: "500",
  },

  // Form fields
  fieldContainer: {
    marginBottom: 20,
  },
  fieldLabel: {
    fontSize: 14,
    fontWeight: "600",
    marginBottom: 8,
    color: "#333",
  },
  textArea: {
    minHeight: 100,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.15)",
    borderRadius: 12,
    padding: 14,
    fontSize: 16,
    backgroundColor: "#fff",
  },
  charCount: {
    fontSize: 12,
    color: "#999",
    textAlign: "right",
    marginTop: 4,
  },
  textInput: {
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.15)",
    borderRadius: 12,
    padding: 14,
    fontSize: 16,
    backgroundColor: "#fff",
  },
  requiredAsterisk: {
    color: "#EF4444",
  },
  dropdown: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.15)",
    borderRadius: 12,
    padding: 14,
    backgroundColor: "#fff",
  },
  dropdownText: {
    fontSize: 16,
    color: "#333",
  },
  dropdownPlaceholder: {
    fontSize: 16,
    color: "#999",
  },
  dropdownMenu: {
    marginTop: 4,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.1)",
    borderRadius: 12,
    backgroundColor: "#fff",
    overflow: "hidden",
  },
  dropdownItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 14,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(0,0,0,0.05)",
  },
  dropdownItemSelected: {
    backgroundColor: `${Colors.primary}10`,
  },
  dropdownItemText: {
    fontSize: 16,
  },

  // Budget
  budgetList: {
    marginTop: 16,
  },
  budgetOption: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 16,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.08)",
  },
  budgetOptionSelected: {
    borderColor: Colors.primary,
    backgroundColor: `${Colors.primary}08`,
  },
  budgetOptionText: {
    fontSize: 16,
    fontWeight: "500",
  },
  radioOuter: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: "#ccc",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 14,
  },
  radioOuterSelected: {
    borderColor: Colors.primary,
  },
  radioInner: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: Colors.primary,
  },

  // Photos & Timing
  sectionContainer: {
    marginBottom: 28,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 12,
  },
  photoScroll: {
    flexDirection: "row",
  },
  photoCell: {
    width: 100,
    height: 100,
    borderRadius: 12,
    overflow: "hidden",
    backgroundColor: "#eee",
    marginRight: 10,
    position: "relative",
  },
  photoImg: {
    width: "100%",
    height: "100%",
  },
  photoRemove: {
    position: "absolute",
    top: 6,
    right: 6,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: "rgba(0,0,0,0.6)",
    alignItems: "center",
    justifyContent: "center",
  },
  addPhotoCell: {
    width: 100,
    height: 100,
    borderRadius: 12,
    borderWidth: 2,
    borderStyle: "dashed",
    borderColor: "rgba(0,0,0,0.2)",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#fafafa",
  },
  addPhotoText: {
    fontSize: 12,
    color: "#666",
    marginTop: 4,
  },
  timingList: {
    marginTop: 8,
  },
  timingOption: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
  },
  timingOptionSelected: {},
  timingText: {
    fontSize: 16,
  },
  timingTextEmergency: {
    color: "#e53935",
    fontWeight: "600",
  },

  // Review
  reviewCard: {
    backgroundColor: "#fff",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.08)",
    overflow: "hidden",
    marginTop: 16,
    marginBottom: 24,
  },
  reviewSection: {
    padding: 16,
    position: "relative",
  },
  reviewLabelRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 6,
  },
  reviewLabel: {
    fontSize: 11,
    fontWeight: "600",
    color: "#999",
    letterSpacing: 0.5,
  },
  reviewValue: {
    fontSize: 15,
    lineHeight: 21,
    paddingRight: 40,
  },
  reviewDivider: {
    height: 1,
    backgroundColor: "rgba(0,0,0,0.06)",
  },
  editButton: {
    position: "absolute",
    right: 16,
    top: 16,
  },
  editButtonText: {
    fontSize: 14,
    color: Colors.primary,
    fontWeight: "500",
  },
  reviewPhotos: {
    flexDirection: "row",
    gap: 8,
    marginTop: 4,
  },
  reviewPhotoThumb: {
    width: 50,
    height: 50,
    borderRadius: 8,
    backgroundColor: "#eee",
  },

  // Continue button
  continueButton: {
    borderRadius: 28,
    paddingVertical: 16,
    marginTop: 24,
  },
  continueButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "600",
    textAlign: "center",
  },
  disclaimer: {
    fontSize: 13,
    color: "#999",
    textAlign: "center",
    marginTop: 16,
    paddingHorizontal: 20,
  },

  // Upload overlay
  uploadOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.35)",
    alignItems: "center",
    justifyContent: "center",
  },
  uploadCard: {
    width: "80%",
    maxWidth: 300,
    borderRadius: 16,
    paddingVertical: 24,
    paddingHorizontal: 20,
    backgroundColor: "#fff",
    alignItems: "center",
  },
  uploadTitle: {
    marginTop: 12,
    fontWeight: "700",
    fontSize: 16,
  },
  uploadSub: {
    marginTop: 4,
    fontSize: 13,
    color: "#666",
  },
});
