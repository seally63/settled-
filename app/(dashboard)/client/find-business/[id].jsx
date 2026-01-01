// app/(dashboard)/client/find-business/[id].jsx
import { useEffect, useState, useMemo } from "react";
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
import { Ionicons } from "@expo/vector-icons";
import { useColorScheme } from "react-native";
import * as ImagePicker from "expo-image-picker";
import * as ImageManipulator from "expo-image-manipulator";
import ImageViewing from "react-native-image-viewing";

import ThemedView from "../../../../components/ThemedView";
import ThemedText from "../../../../components/ThemedText";
import ThemedButton from "../../../../components/ThemedButton";
import Spacer from "../../../../components/Spacer";
import ThemedTextInput from "../../../../components/ThemedTextInput";
import { Colors } from "../../../../constants/Colors";
import { getTradeById, getMyRole } from "../../../../lib/api/profile";
import { requestDirectQuote } from "../../../../lib/api/directRequest";
import { getBusinessVerificationPublic, getTradePublicMetrics90d } from "../../../../lib/api/trust";
import { supabase } from "../../../../lib/supabase";
import { uploadRequestImages } from "../../../../lib/api/attachments";
import {
  getServiceCategories,
  getServiceTypes,
  getPropertyTypes,
  getTimingOptions,
} from "../../../../lib/api/services";

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");

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

function monthsSince(ts) {
  if (!ts) return null;
  const a = new Date(ts);
  const b = new Date();
  const months = (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth());
  return Math.max(0, months);
}

function Stars({ rating = 0 }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center" }}>
      {Array.from({ length: 5 }).map((_, i) => (
        <Ionicons
          key={i}
          name={i < Math.round(rating) ? "star" : "star-outline"}
          size={14}
          color="#fbbc04"
          style={{ marginRight: 2 }}
        />
      ))}
    </View>
  );
}

function fmtHours(n) {
  if (n == null || isNaN(n)) return "—";
  const v = Number(n);
  if (v < 1) return `${(v * 60).toFixed(0)}m`;
  if (v < 10) return `${v.toFixed(1)}h`;
  return `${Math.round(v)}h`;
}

function fmtPct(n) {
  if (n == null || isNaN(n)) return "—";
  return `${Math.round(Number(n) * 100)}%`;
}

const VerifyRow = ({ label, verified }) => (
  <View style={styles.verifyRow}>
    <Ionicons
      name={verified ? "checkmark-circle" : "checkmark-circle-outline"}
      size={18}
      color={verified ? Colors.primary : "rgba(0,0,0,0.28)"}
      style={styles.verifyIcon}
    />
    <ThemedText style={[styles.verifyLabel, !verified && styles.verifyLabelMuted]}>{label}</ThemedText>
  </View>
);

const paintFrames = (n = 2) =>
  new Promise((resolve) => {
    const step = () => (n-- <= 0 ? resolve() : requestAnimationFrame(step));
    requestAnimationFrame(step);
  });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const MIN_PREP_MS = 600;

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

// Minimal image processing - just copy to cache to get a file:// URI
// This avoids the heavy base64 encoding that causes freezes
async function makeThumbnails(uris) {
  const out = [];
  for (const uri of uris) {
    try {
      // Do minimal resize to get a file:// URI that FileSystem can read
      const { uri: processedUri } = await ImageManipulator.manipulateAsync(
        uri,
        [{ resize: { width: 1200 } }],
        {
          compress: 0.8,
          format: ImageManipulator.SaveFormat.JPEG,
          base64: false, // Don't generate base64 - this is what causes the freeze
        }
      );
      out.push({ uri: processedUri });
    } catch (e) {
      console.warn("makeThumbnails error:", e);
      // Fallback to original URI
      out.push({ uri });
    }
  }
  return out;
}

export default function BusinessDetail() {
  const { id } = useLocalSearchParams();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const scheme = useColorScheme();
  const theme = Colors[scheme] ?? Colors.light;
  const isTest = id === "test-demo";

  const [trade, setTrade] = useState(isTest ? TEST_PROFILE : null);
  const [role, setRole] = useState(null);
  const [badges, setBadges] = useState(null);
  const [metrics, setMetrics] = useState(null);

  // Multi-step form state
  const [step, setStep] = useState(0);

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
  const [prepUris, setPrepUris] = useState(new Set());
  const [prepStartedAt, setPrepStartedAt] = useState(0);
  const [prepPhase, setPrepPhase] = useState("preparing");
  const [prepDone, setPrepDone] = useState(0);
  const [prepTotal, setPrepTotal] = useState(0);

  // Image viewer
  const [viewer, setViewer] = useState({ open: false, index: 0 });

  // Submission
  const [submitting, setSubmitting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadIdx, setUploadIdx] = useState(0);
  const [uploadTotal, setUploadTotal] = useState(0);
  const [editingFromReview, setEditingFromReview] = useState(false);

  // Load trade data
  useEffect(() => {
    async function load() {
      try {
        const myRole = await getMyRole();
        setRole(myRole || null);
        if (isTest) {
          setBadges({ companies_house_active: true, payments_verified: true, insurance_verified: true });
          setMetrics({ response_time_p50_hours: 2.5, acceptance_rate: 0.78 });
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
      } catch (e) {
        Alert.alert("Error", e?.message || "Failed to load business");
      }
    }
    if (id) load();
  }, [id, isTest]);

  // Load form data
  useEffect(() => {
    loadCategories();
    loadPropertyTypes();
    loadTimingOptions();
  }, []);

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

  const monthsHosting = useMemo(() => monthsSince(trade?.created_at), [trade?.created_at]);
  const ratingText = useMemo(() => {
    const r = Number(trade?.rating_avg || 0);
    const c = Number(trade?.rating_count || 0);
    if (!r || !c) return "No reviews yet";
    return `${r.toFixed(2)} (${c} reviews)`;
  }, [trade?.rating_avg, trade?.rating_count]);

  // Photo handling
  function resetPhotoUI() {
    setPrepVisible(false);
    setPrepUris(new Set());
    setPrepPhase("preparing");
    setPrepDone(0);
    setPrepTotal(0);
    setUploading(false);
    setUploadIdx(0);
    setUploadTotal(0);
  }

  function beginPreparing(count) {
    if (!count || count <= 0) return;
    setPrepStartedAt(Date.now());
    setPrepVisible(true);
    setPrepPhase("preparing");
    setPrepDone(0);
    setPrepTotal(count);
  }

  useEffect(() => {
    if (!prepVisible) return;
    if (prepUris.size > 0) return;
    const elapsed = Date.now() - prepStartedAt;
    const remain = Math.max(0, MIN_PREP_MS - elapsed);
    const t = setTimeout(() => setPrepVisible(false), remain);
    return () => clearTimeout(t);
  }, [prepUris, prepVisible, prepStartedAt]);

  const markThumbLoaded = (uri) => {
    setPrepUris((prev) => {
      if (!prev.size) return prev;
      const next = new Set(prev);
      next.delete(uri);
      return next;
    });
  };

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

      // Show processing overlay while making thumbnails
      setPrepVisible(true);
      setPrepPhase("preparing");
      setPrepTotal(newUris.length);
      setPrepDone(0);
      setPrepStartedAt(Date.now());

      try {
        const thumbs = await makeThumbnails(newUris);
        setPhotos((prev) => [...prev, ...thumbs].slice(0, 5));
      } finally {
        // Keep overlay briefly visible for smooth UX
        const elapsed = Date.now() - Date.now();
        const remain = Math.max(0, 300 - elapsed);
        setTimeout(() => setPrepVisible(false), remain);
      }
    } catch (e) {
      setPrepVisible(false);
      console.warn("pickFromLibrary error:", e);
    }
  }

  function removePhoto(idx) {
    const removed = photos[idx];
    if (removed?.uri) {
      setPrepUris((prevSet) => {
        if (!prevSet.size) return prevSet;
        const next = new Set(prevSet);
        next.delete(removed.uri);
        return next;
      });
    }
    setPhotos((prev) => prev.filter((_, i) => i !== idx));
  }

  async function uploadAndAttach(requestId) {
    const totalPhotos = photos.length;
    if (totalPhotos === 0) {
      setUploading(false);
      return;
    }

    setUploadTotal(totalPhotos);
    setUploadIdx(0);
    setUploading(true);
    await paintFrames(2);

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
      setUploadIdx(0);
      setUploadTotal(0);
    }

    if (totalPhotos && !uploadedPaths.length) {
      Alert.alert("Photos not attached", "We couldn't upload your photos, but your request was still sent.");
    }
  }

  // Submit
  async function submitDirectRequest() {
    try {
      if (isTest) {
        resetPhotoUI();
        Alert.alert("Demo", "This is a demo business — request not sent.");
        return;
      }
      if (!selectedCategory) return Alert.alert("Please select a category.");
      if (!selectedServiceType) return Alert.alert("Please select a service type.");
      if (!postcode?.trim()) return Alert.alert("Please enter your postcode.");
      if (!selectedTiming) return Alert.alert("Please select when you need this done.");

      setSubmitting(true);

      const normalizedPostcode = postcode.trim().toUpperCase();

      const details = [
        `Direct request to: ${trade?.business_name || trade?.full_name || id}`,
        `Category: ${selectedCategory.name}`,
        `Service: ${selectedServiceType.name}`,
        description?.trim() ? `Description: ${description.trim()}` : null,
        selectedPropertyType ? `Property: ${selectedPropertyType.name}` : null,
        `Postcode: ${normalizedPostcode}`,
        selectedBudget ? `Budget: ${selectedBudget.label}` : null,
        `Timing: ${selectedTiming.name}`,
        selectedTiming.is_emergency ? `Emergency: Yes` : null,
      ]
        .filter(Boolean)
        .join("\n");

      // Build suggested title: "Category - Service" (no location for client view)
      const suggested_title = `${selectedCategory.name} - ${selectedServiceType.name}`;

      const res = await requestDirectQuote(id, {
        details,
        suggested_title,
        // budget_band temporarily null - run SQL to update constraint for new values
        category_id: selectedCategory.id,
        service_type_id: selectedServiceType.id,
        property_type_id: selectedPropertyType?.id || null,
        timing_option_id: selectedTiming.id,
        postcode: normalizedPostcode,
      });

      const newRequestId = res?.id || res?.request_id || res?.data?.id || res?.data?.request_id || null;

      if (newRequestId) {
        await uploadAndAttach(String(newRequestId));
      }

      resetPhotoUI();

      Alert.alert("Request sent", "Your quote request has been sent.", [
        { text: "OK", onPress: () => router.replace("/client") },
      ]);
    } catch (e) {
      Alert.alert("Unable to request", e?.message || "Failed to send request.");
    } finally {
      setSubmitting(false);
    }
  }

  // Navigation helpers for edit flow
  function goToStepForEdit(targetStep) {
    setEditingFromReview(true);
    setStep(targetStep);
  }

  function handleContinueOrReturnToReview(nextStep) {
    if (editingFromReview) {
      setEditingFromReview(false);
      setStep(6); // Return to review
    } else {
      setStep(nextStep);
    }
  }

  // Category/service selection (auto-advance)
  function handleCategorySelect(cat) {
    setSelectedCategory(cat);
    setSelectedServiceType(null);
    setStep(2);
  }

  function handleServiceTypeSelect(type) {
    setSelectedServiceType(type);
    // If editing from review, go back to review; otherwise advance to step 3
    if (editingFromReview) {
      setEditingFromReview(false);
      setStep(6);
    } else {
      setStep(3);
    }
  }

  if (role && role !== "client") {
    return (
      <ThemedView style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
        <ThemedText>Not available for your role.</ThemedText>
      </ThemedView>
    );
  }

  // Overlays
  const UploadOverlay = () => {
    const isVisible = prepVisible || (uploading && uploadTotal > 0);
    if (!isVisible) return null;

    const pct = uploading && uploadTotal ? Math.round((uploadIdx / uploadTotal) * 100) : 0;
    const title = prepVisible
      ? prepPhase === "preparing" ? "Preparing your photos…" : "Rendering your photos…"
      : "Uploading your photos…";

    return (
      <Modal visible transparent animationType="none" statusBarTranslucent onRequestClose={() => {}}>
        <View style={styles.uploadBackdrop}>
          <View style={styles.uploadCard}>
            <ActivityIndicator size="large" color={Colors.primary} />
            <ThemedText style={styles.uploadTitle}>{title}</ThemedText>
            {prepVisible && prepPhase === "preparing" && (
              <ThemedText style={styles.uploadSub}>{prepDone} of {prepTotal}</ThemedText>
            )}
            {!prepVisible && uploading && uploadTotal > 0 && (
              <>
                <ThemedText style={styles.uploadSub}>{uploadIdx} of {uploadTotal}</ThemedText>
                <View style={styles.uploadBar}>
                  <View style={[styles.uploadFill, { width: `${pct}%`, backgroundColor: Colors.primary }]} />
                </View>
              </>
            )}
          </View>
        </View>
      </Modal>
    );
  };

  // ===== Full-screen image viewer with zoom and swipe-to-dismiss =====
  const closeViewer = () => setViewer({ open: false, index: 0 });

  const imageViewerImages = photos.map((p) => ({ uri: p.uri }));

  const ImageViewerFooter = ({ imageIndex }) => (
    <View style={styles.viewerFooter}>
      {/* Navigation dots */}
      <View style={styles.viewerDots}>
        {photos.map((_, i) => (
          <View
            key={i}
            style={[
              styles.viewerDot,
              i === imageIndex && styles.viewerDotActive,
            ]}
          />
        ))}
      </View>
      {/* Delete button */}
      <Pressable
        style={styles.viewerDeleteBtn}
        hitSlop={10}
        onPress={() => {
          const idx = imageIndex;
          removePhoto(idx);
          const remaining = photos.length - 1;
          if (remaining <= 0) {
            setViewer({ open: false, index: 0 });
          } else {
            setViewer({ open: true, index: Math.min(idx, remaining - 1) });
          }
        }}
      >
        <Ionicons name="trash-outline" size={20} color="#fff" />
        <ThemedText style={styles.viewerDeleteText}>Delete</ThemedText>
      </Pressable>
    </View>
  );

  // Handle back navigation
  function handleBack(defaultStep) {
    if (editingFromReview) {
      setEditingFromReview(false);
      setStep(6); // Return to review
    } else {
      setStep(defaultStep);
    }
  }

  // Sub header
  const SubHeader = ({ onBack, currentStep, totalSteps = 6 }) => {
    const pct = `${(currentStep / totalSteps) * 100}%`;
    return (
      <View style={[styles.subHeader, { paddingTop: insets.top, backgroundColor: theme.uiBackground, borderBottomColor: theme.iconColor }]}>
        <Pressable onPress={onBack} style={styles.backButton} hitSlop={10}>
          <Ionicons name="chevron-back" size={24} color={theme.text} />
        </Pressable>
        <View style={styles.progressTrackContainer}>
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: pct, backgroundColor: Colors.primary }]} />
          </View>
        </View>
      </View>
    );
  };

  // About card (step 0)
  const AboutCard = (
    <ScrollView
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={{ paddingTop: insets.top + 16, paddingHorizontal: 16, paddingBottom: 16 + insets.bottom }}
      showsVerticalScrollIndicator={false}
    >
      {trade && (
        <>
          <View style={styles.topCard}>
            <View style={{ alignItems: "center" }}>
              {trade.photo_url ? (
                <Image source={{ uri: trade.photo_url }} style={styles.avatar} />
              ) : (
                <View style={[styles.avatar, styles.avatarFallback]} />
              )}
            </View>
            <Spacer height={8} />
            <ThemedText style={styles.name}>{trade.business_name || trade.full_name || "Business"}</ThemedText>

            <View style={styles.metricsRow}>
              <Stars rating={Number(trade?.rating_avg || 0)} />
              <ThemedText style={styles.metricText}>{ratingText}</ThemedText>
              {monthsHosting != null && (
                <ThemedText style={styles.metricText}>• {monthsHosting} {monthsHosting === 1 ? "month" : "months"} on Settled</ThemedText>
              )}
            </View>

            {badges && (
              <>
                <Spacer height={12} />
                <View style={styles.verifyWrap}>
                  <ThemedText style={styles.infoLabel}>Verification</ThemedText>
                  <View style={styles.verifyList}>
                    <VerifyRow label="Companies House" verified={!!badges?.companies_house_active} />
                    <VerifyRow label="Payments verified" verified={!!badges?.payments_verified} />
                    <VerifyRow label="Insurance" verified={!!badges?.insurance_verified} />
                  </View>
                </View>
              </>
            )}

            {metrics && (metrics.response_time_p50_hours != null || metrics.acceptance_rate != null) && (
              <>
                <Spacer height={12} />
                <View style={styles.kpiRow}>
                  <View style={styles.kpiCol}>
                    <ThemedText style={styles.kpiLabel}>Median reply</ThemedText>
                    <ThemedText style={styles.kpiValue}>{fmtHours(metrics.response_time_p50_hours)}</ThemedText>
                  </View>
                  <View style={styles.kpiCol}>
                    <ThemedText style={styles.kpiLabel}>Acceptance</ThemedText>
                    <ThemedText style={styles.kpiValue}>{fmtPct(metrics.acceptance_rate)}</ThemedText>
                  </View>
                </View>
              </>
            )}

            <View style={styles.divider} />

            {!!trade.business_name && (
              <>
                <ThemedText style={styles.infoLabel}>Business name</ThemedText>
                <ThemedText style={styles.infoValue}>{trade.business_name}</ThemedText>
                <Spacer height={10} />
              </>
            )}
            {!!trade.trade_title && (
              <>
                <ThemedText style={styles.infoLabel}>Trade</ThemedText>
                <ThemedText style={styles.infoValue}>{trade.trade_title}</ThemedText>
                <Spacer height={10} />
              </>
            )}
            {!!trade.bio && (
              <>
                <ThemedText style={styles.infoLabel}>About</ThemedText>
                <ThemedText style={styles.infoBody}>{trade.bio}</ThemedText>
                <Spacer height={10} />
              </>
            )}
            {!!trade.service_areas && (
              <>
                <ThemedText style={styles.infoLabel}>Service areas</ThemedText>
                <ThemedText style={styles.infoBody}>{trade.service_areas}</ThemedText>
              </>
            )}
          </View>

          <Spacer height={16} />
          <ThemedButton onPress={() => setStep(1)}>
            <ThemedText style={{ color: "#fff", fontWeight: "700", textAlign: "center" }}>Request a quote</ThemedText>
          </ThemedButton>
        </>
      )}
    </ScrollView>
  );

  // Step 1: Category selection
  const CategoryStep = (
    <ThemedView style={[styles.container, { backgroundColor: theme.background }]} safe={false}>
      <SubHeader onBack={() => handleBack(0)} currentStep={1} />
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 40 + insets.bottom }} showsVerticalScrollIndicator={false}>
        <View style={styles.questionHeader}>
          <ThemedText title style={styles.questionTitle}>What do you need help with?</ThemedText>
        </View>

        {loadingCategories ? (
          <ActivityIndicator size="large" color={Colors.primary} style={{ marginTop: 40 }} />
        ) : (
          <View style={styles.categoryGrid}>
            {categories.map((cat) => (
              <Pressable key={cat.id} style={styles.categoryCard} onPress={() => handleCategorySelect(cat)}>
                <View style={styles.categoryIconWrap}>
                  <Ionicons name={cat.icon} size={32} color={Colors.primary} />
                </View>
                <ThemedText style={styles.categoryName}>{cat.name}</ThemedText>
              </Pressable>
            ))}
          </View>
        )}
      </ScrollView>
    </ThemedView>
  );

  // Step 2: Service type selection
  const ServiceTypeStep = (
    <ThemedView style={[styles.container, { backgroundColor: theme.background }]} safe={false}>
      <SubHeader onBack={() => handleBack(1)} currentStep={2} />
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 40 + insets.bottom }} showsVerticalScrollIndicator={false}>
        <View style={styles.questionHeader}>
          <ThemedText title style={styles.questionTitle}>What do you need help with?</ThemedText>
          {selectedCategory && <ThemedText style={styles.questionSubtitle}>{selectedCategory.name}</ThemedText>}
        </View>

        {loadingServiceTypes ? (
          <ActivityIndicator size="large" color={Colors.primary} style={{ marginTop: 40 }} />
        ) : (
          <View style={styles.serviceTypeList}>
            {serviceTypes.map((type) => (
              <Pressable key={type.id} style={styles.serviceTypeCard} onPress={() => handleServiceTypeSelect(type)}>
                <View style={styles.serviceTypeIcon}>
                  <Ionicons name={type.icon} size={22} color={Colors.primary} />
                </View>
                <ThemedText style={styles.serviceTypeName}>{type.name}</ThemedText>
                <Ionicons name="chevron-forward" size={20} color="#999" />
              </Pressable>
            ))}
          </View>
        )}
      </ScrollView>
    </ThemedView>
  );

  // Step 3: Details
  const DetailsStep = (
    <ThemedView style={[styles.container, { backgroundColor: theme.background }]} safe={false}>
      <SubHeader onBack={() => handleBack(2)} currentStep={3} />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 40 + insets.bottom }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          <View style={styles.questionHeader}>
            <ThemedText title style={styles.questionTitle}>Tell us more.</ThemedText>
            {selectedCategory && selectedServiceType && (
              <ThemedText style={styles.selectionSummary}>{selectedCategory.name} → {selectedServiceType.name}</ThemedText>
            )}
          </View>

          <View style={styles.fieldContainer}>
            <ThemedText style={styles.fieldLabel}>Describe the job</ThemedText>
            <ThemedTextInput
              style={styles.textArea}
              placeholder="e.g., Need to fix a leaky tap under the kitchen sink..."
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
                    <ThemedText style={[styles.dropdownItemText, selectedPropertyType?.id === pt.id && styles.dropdownItemTextSelected]}>
                      {pt.name}
                    </ThemedText>
                    {selectedPropertyType?.id === pt.id && <Ionicons name="checkmark" size={18} color={Colors.primary} />}
                  </Pressable>
                ))}
              </View>
            )}
          </View>

          {/* Postcode - Required */}
          <View style={styles.fieldContainer}>
            <ThemedText style={styles.fieldLabel}>
              Your postcode <ThemedText style={styles.requiredAsterisk}>*</ThemedText>
            </ThemedText>
            <ThemedTextInput
              style={styles.textInput}
              placeholder="e.g., EH48 3NN"
              value={postcode}
              onChangeText={(t) => setPostcode(t.toUpperCase())}
              autoCapitalize="characters"
              maxLength={10}
            />
            <ThemedText style={styles.fieldHint}>
              This helps tradespeople know if they can service your area
            </ThemedText>
          </View>

          <View style={styles.continueButtonContainer}>
            <ThemedButton onPress={() => handleContinueOrReturnToReview(4)} style={styles.continueButton}>
              <ThemedText style={styles.continueButtonText}>
                {editingFromReview ? "Save changes" : "Continue"}
              </ThemedText>
            </ThemedButton>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </ThemedView>
  );

  // Step 4: Budget
  const BudgetStep = (
    <ThemedView style={[styles.container, { backgroundColor: theme.background }]} safe={false}>
      <SubHeader onBack={() => handleBack(3)} currentStep={4} totalSteps={6} />
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: 40 + insets.bottom }}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.questionHeader}>
          <ThemedText title style={styles.questionTitle}>What's your budget?</ThemedText>
          <ThemedText style={styles.questionSubtitle}>
            This helps tradespeople give you accurate quotes.
          </ThemedText>
        </View>

        <View style={styles.budgetList}>
          {BUDGET_OPTIONS.map((option) => (
            <Pressable
              key={option.id}
              style={[
                styles.budgetOption,
                selectedBudget?.id === option.id && styles.budgetOptionSelected,
              ]}
              onPress={() => setSelectedBudget(option)}
            >
              <View
                style={[
                  styles.radioOuter,
                  selectedBudget?.id === option.id && styles.radioOuterSelected,
                ]}
              >
                {selectedBudget?.id === option.id && <View style={styles.radioInner} />}
              </View>
              <ThemedText
                style={[
                  styles.budgetOptionText,
                  option.id === "not_sure" && styles.budgetOptionTextMuted,
                ]}
              >
                {option.label}
              </ThemedText>
            </Pressable>
          ))}
        </View>

        <View style={styles.continueButtonContainer}>
          <ThemedButton
            onPress={() => handleContinueOrReturnToReview(5)}
            disabled={!selectedBudget}
            style={styles.continueButton}
          >
            <ThemedText style={styles.continueButtonText}>
              {editingFromReview ? "Save changes" : "Continue"}
            </ThemedText>
          </ThemedButton>
        </View>
      </ScrollView>
    </ThemedView>
  );

  // Step 5: Photos & Timing
  const PhotosTimingStep = (
    <ThemedView style={[styles.container, { backgroundColor: theme.background }]} safe={false}>
      <SubHeader onBack={() => handleBack(4)} currentStep={5} totalSteps={6} />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 40 + insets.bottom }} showsVerticalScrollIndicator={false}>
          <View style={styles.questionHeader}>
            <ThemedText title style={styles.questionTitle}>Almost done!</ThemedText>
          </View>

          <View style={styles.sectionContainer}>
            <ThemedText style={styles.sectionTitle}>Add photos (optional)</ThemedText>
            <ThemedText style={styles.sectionHint}>Helps tradespeople give accurate quotes</ThemedText>

            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.photoScroll} contentContainerStyle={styles.photoScrollContent}>
              {photos.map((p, i) => (
                <View key={`${p.uri}-${i}`} style={styles.photoCell}>
                  <Pressable style={{ flex: 1 }} onPress={() => setViewer({ open: true, index: i })}>
                    <Image source={{ uri: p.uri }} style={styles.photoImg} onLoadEnd={() => markThumbLoaded(p.uri)} />
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
                  <ThemedText style={[styles.timingText, opt.is_emergency && styles.timingTextEmergency]}>{opt.name}</ThemedText>
                </Pressable>
              ))}
            </View>
          </View>

          <View style={styles.continueButtonContainer}>
            <ThemedButton onPress={() => handleContinueOrReturnToReview(6)} disabled={!selectedTiming} style={styles.continueButton}>
              <ThemedText style={styles.continueButtonText}>
                {editingFromReview ? "Save changes" : "Review request"}
              </ThemedText>
            </ThemedButton>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
      <ImageViewing
        images={imageViewerImages}
        imageIndex={viewer.index}
        visible={viewer.open && photos.length > 0}
        onRequestClose={closeViewer}
        swipeToCloseEnabled
        doubleTapToZoomEnabled
        presentationStyle="overFullScreen"
        animationType="fade"
        FooterComponent={({ imageIndex }) => <ImageViewerFooter imageIndex={imageIndex} />}
        onImageIndexChange={(index) => setViewer((v) => ({ ...v, index }))}
      />
    </ThemedView>
  );

  // Step 6: Review
  const ReviewStep = (
    <ThemedView style={[styles.container, { backgroundColor: theme.background }]} safe={false}>
      <SubHeader onBack={() => setStep(5)} currentStep={6} totalSteps={6} />
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 40 + insets.bottom }} showsVerticalScrollIndicator={false}>
        <View style={styles.questionHeader}>
          <ThemedText title style={styles.questionTitle}>Review your request.</ThemedText>
        </View>

        <View style={styles.reviewCard}>
          <View style={styles.reviewSection}>
            <View style={styles.reviewLabelRow}>
              <Ionicons name="business-outline" size={16} color="#6B7280" />
              <ThemedText style={styles.reviewLabel}>BUSINESS</ThemedText>
            </View>
            <ThemedText style={styles.reviewValue}>{trade?.business_name || trade?.full_name}</ThemedText>
          </View>

          <View style={styles.reviewDivider} />

          <View style={styles.reviewSection}>
            <View style={styles.reviewLabelRow}>
              <Ionicons name="construct-outline" size={16} color="#6B7280" />
              <ThemedText style={styles.reviewLabel}>SERVICE</ThemedText>
            </View>
            <ThemedText style={styles.reviewValue}>{selectedCategory?.name} → {selectedServiceType?.name}</ThemedText>
            <Pressable onPress={() => goToStepForEdit(1)} style={styles.editButton}>
              <ThemedText style={styles.editButtonText}>Edit</ThemedText>
            </Pressable>
          </View>

          <View style={styles.reviewDivider} />

          <View style={styles.reviewSection}>
            <View style={styles.reviewLabelRow}>
              <Ionicons name="document-text-outline" size={16} color="#6B7280" />
              <ThemedText style={styles.reviewLabel}>DETAILS</ThemedText>
            </View>
            <ThemedText style={styles.reviewValue} numberOfLines={3}>{description?.trim() || "No description provided"}</ThemedText>
            <Pressable onPress={() => goToStepForEdit(3)} style={styles.editButton}>
              <ThemedText style={styles.editButtonText}>Edit</ThemedText>
            </Pressable>
          </View>

          <View style={styles.reviewDivider} />

          <View style={styles.reviewSection}>
            <View style={styles.reviewLabelRow}>
              <Ionicons name="home-outline" size={16} color="#6B7280" />
              <ThemedText style={styles.reviewLabel}>PROPERTY</ThemedText>
            </View>
            <ThemedText style={styles.reviewValue}>{selectedPropertyType?.name || "Not specified"}</ThemedText>
            <Pressable onPress={() => goToStepForEdit(3)} style={styles.editButton}>
              <ThemedText style={styles.editButtonText}>Edit</ThemedText>
            </Pressable>
          </View>

          <View style={styles.reviewDivider} />

          <View style={styles.reviewSection}>
            <View style={styles.reviewLabelRow}>
              <Ionicons name="location-outline" size={16} color="#6B7280" />
              <ThemedText style={styles.reviewLabel}>POSTCODE</ThemedText>
            </View>
            <ThemedText style={styles.reviewValue}>{postcode?.trim() || "Not specified"}</ThemedText>
            <Pressable onPress={() => goToStepForEdit(3)} style={styles.editButton}>
              <ThemedText style={styles.editButtonText}>Edit</ThemedText>
            </Pressable>
          </View>

          <View style={styles.reviewDivider} />

          <View style={styles.reviewSection}>
            <View style={styles.reviewLabelRow}>
              <Ionicons name="cash-outline" size={16} color="#6B7280" />
              <ThemedText style={styles.reviewLabel}>BUDGET</ThemedText>
            </View>
            <ThemedText style={styles.reviewValue}>{selectedBudget?.label || "Not specified"}</ThemedText>
            <Pressable onPress={() => goToStepForEdit(4)} style={styles.editButton}>
              <ThemedText style={styles.editButtonText}>Edit</ThemedText>
            </Pressable>
          </View>

          <View style={styles.reviewDivider} />

          <View style={styles.reviewSection}>
            <View style={styles.reviewLabelRow}>
              <Ionicons name="time-outline" size={16} color={selectedTiming?.is_emergency ? "#EF4444" : "#6B7280"} />
              <ThemedText style={[styles.reviewLabel, selectedTiming?.is_emergency && { color: "#EF4444" }]}>TIMING</ThemedText>
            </View>
            <ThemedText style={[styles.reviewValue, selectedTiming?.is_emergency && { color: "#EF4444" }]}>{selectedTiming?.name}</ThemedText>
            <Pressable onPress={() => goToStepForEdit(5)} style={styles.editButton}>
              <ThemedText style={styles.editButtonText}>Edit</ThemedText>
            </Pressable>
          </View>

          <View style={styles.reviewDivider} />

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
            <Pressable onPress={() => goToStepForEdit(5)} style={styles.editButton}>
              <ThemedText style={styles.editButtonText}>Edit</ThemedText>
            </Pressable>
          </View>
        </View>

        <View style={styles.continueButtonContainer}>
          <ThemedButton onPress={submitDirectRequest} disabled={submitting} style={styles.continueButton}>
            <ThemedText style={styles.continueButtonText}>{submitting ? "Submitting…" : "Submit request"}</ThemedText>
          </ThemedButton>
        </View>

        <ThemedText style={styles.disclaimer}>By submitting, you agree to receive quotes from this tradesperson</ThemedText>
      </ScrollView>
    </ThemedView>
  );

  return (
    <ThemedView style={{ flex: 1, backgroundColor: Colors.light.background }}>
      {step === 0 && (
        <>
          <StatusBar style="light" backgroundColor={Colors.primary} />
          <View style={[styles.header, { paddingTop: insets.top }]}>
            <Pressable
              onPress={() => router.canGoBack() ? router.back() : router.replace("/client/find-business")}
              hitSlop={8}
              style={styles.backBtn}
            >
              <Ionicons name="chevron-back" size={22} color="#fff" />
            </Pressable>
            <ThemedText style={styles.headerTitle}>Select a business</ThemedText>
          </View>
          <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
            {AboutCard}
          </KeyboardAvoidingView>
        </>
      )}
      {step === 1 && CategoryStep}
      {step === 2 && ServiceTypeStep}
      {step === 3 && DetailsStep}
      {step === 4 && BudgetStep}
      {step === 5 && PhotosTimingStep}
      {step === 6 && ReviewStep}

      <UploadOverlay />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: "stretch" },
  header: { backgroundColor: Colors.primary, paddingBottom: 12, alignItems: "center", justifyContent: "center" },
  backBtn: { position: "absolute", left: 12, bottom: 14 },
  headerTitle: { color: "#fff", fontSize: 18, fontWeight: "bold" },

  subHeader: { paddingBottom: 12, paddingHorizontal: 20, borderBottomWidth: 1 },
  backButton: { flexDirection: "row", alignItems: "center", paddingVertical: 8 },
  progressTrackContainer: { marginTop: 12 },
  progressTrack: { height: 3, borderRadius: 2, backgroundColor: "rgba(0,0,0,0.08)", overflow: "hidden" },
  progressFill: { height: 3, borderRadius: 2 },

  questionHeader: { paddingHorizontal: 20, paddingVertical: 24 },
  questionTitle: { fontSize: 24, fontWeight: "bold", lineHeight: 30 },
  questionSubtitle: { fontSize: 14, color: "#666", marginTop: 4 },
  selectionSummary: { fontSize: 14, color: Colors.primary, marginTop: 8, fontWeight: "500" },

  // Category grid
  categoryGrid: { flexDirection: "row", flexWrap: "wrap", paddingHorizontal: 16, gap: 12 },
  categoryCard: {
    width: (SCREEN_WIDTH - 56) / 2,
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 20,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.08)",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  categoryIconWrap: { width: 60, height: 60, borderRadius: 30, backgroundColor: `${Colors.primary}15`, alignItems: "center", justifyContent: "center", marginBottom: 12 },
  categoryName: { fontSize: 15, fontWeight: "600", textAlign: "center" },

  // Service type list
  serviceTypeList: { paddingHorizontal: 20 },
  serviceTypeCard: { flexDirection: "row", alignItems: "center", backgroundColor: "#fff", borderRadius: 12, padding: 16, marginBottom: 10, borderWidth: 1, borderColor: "rgba(0,0,0,0.08)" },
  serviceTypeIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: `${Colors.primary}15`, alignItems: "center", justifyContent: "center", marginRight: 14 },
  serviceTypeName: { flex: 1, fontSize: 16, fontWeight: "500" },

  // Details form
  fieldContainer: { paddingHorizontal: 20, marginBottom: 20 },
  fieldLabel: { fontSize: 14, fontWeight: "600", marginBottom: 8, color: "#333" },
  textArea: { minHeight: 120, borderWidth: 1, borderColor: "rgba(0,0,0,0.15)", borderRadius: 12, padding: 14, fontSize: 16, backgroundColor: "#fff" },
  charCount: { fontSize: 12, color: "#999", textAlign: "right", marginTop: 4 },
  dropdown: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderWidth: 1, borderColor: "rgba(0,0,0,0.15)", borderRadius: 12, padding: 14, backgroundColor: "#fff" },
  dropdownText: { fontSize: 16, color: "#333" },
  dropdownPlaceholder: { fontSize: 16, color: "#999" },
  dropdownMenu: { marginTop: 4, borderWidth: 1, borderColor: "rgba(0,0,0,0.1)", borderRadius: 12, backgroundColor: "#fff", overflow: "hidden" },
  dropdownItem: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 14, borderBottomWidth: 1, borderBottomColor: "rgba(0,0,0,0.05)" },
  dropdownItemSelected: { backgroundColor: `${Colors.primary}10` },
  dropdownItemText: { fontSize: 16 },
  dropdownItemTextSelected: { color: Colors.primary, fontWeight: "500" },
  requiredAsterisk: { color: "#EF4444", fontWeight: "600" },
  textInput: { borderWidth: 1, borderColor: "rgba(0,0,0,0.15)", borderRadius: 12, padding: 14, fontSize: 16, backgroundColor: "#fff" },
  fieldHint: { fontSize: 12, color: "#6B7280", marginTop: 6 },

  // Photos & Timing
  sectionContainer: { paddingHorizontal: 20, marginBottom: 28 },
  sectionTitle: { fontSize: 16, fontWeight: "600", marginBottom: 4 },
  sectionHint: { fontSize: 13, color: "#666", marginBottom: 14 },
  photoScroll: { marginLeft: -20, marginRight: -20 },
  photoScrollContent: { paddingHorizontal: 20, gap: 10 },
  photoCell: { width: 100, height: 100, borderRadius: 12, overflow: "hidden", backgroundColor: "#eee", position: "relative" },
  photoImg: { width: "100%", height: "100%" },
  photoRemove: { position: "absolute", top: 6, right: 6, width: 24, height: 24, borderRadius: 12, backgroundColor: "rgba(0,0,0,0.6)", alignItems: "center", justifyContent: "center" },
  addPhotoCell: { width: 100, height: 100, borderRadius: 12, borderWidth: 2, borderStyle: "dashed", borderColor: "rgba(0,0,0,0.2)", alignItems: "center", justifyContent: "center", backgroundColor: "#fafafa" },
  addPhotoText: { fontSize: 12, color: "#666", marginTop: 4 },
  timingList: { marginTop: 12 },
  timingOption: { flexDirection: "row", alignItems: "center", paddingVertical: 14, paddingHorizontal: 4 },
  timingOptionSelected: {},
  radioOuter: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: "#ccc", alignItems: "center", justifyContent: "center", marginRight: 14 },
  radioOuterSelected: { borderColor: Colors.primary },
  radioInner: { width: 12, height: 12, borderRadius: 6, backgroundColor: Colors.primary },
  timingText: { fontSize: 16 },
  timingTextEmergency: { color: "#e53935", fontWeight: "600" },

  // Budget
  budgetList: { paddingHorizontal: 20 },
  budgetOption: { flexDirection: "row", alignItems: "center", backgroundColor: "#fff", borderRadius: 12, padding: 16, marginBottom: 10, borderWidth: 1, borderColor: "rgba(0,0,0,0.08)" },
  budgetOptionSelected: { borderColor: Colors.primary, backgroundColor: `${Colors.primary}08` },
  budgetOptionText: { fontSize: 16, fontWeight: "500", color: "#111827" },
  budgetOptionTextMuted: { color: "#6B7280", fontStyle: "italic" },

  // Review
  reviewCard: { marginHorizontal: 20, backgroundColor: "#fff", borderRadius: 16, borderWidth: 1, borderColor: "rgba(0,0,0,0.08)", overflow: "hidden" },
  reviewSection: { padding: 16, position: "relative" },
  reviewLabel: { fontSize: 11, fontWeight: "600", color: "#999", letterSpacing: 0.5, marginBottom: 6 },
  reviewLabelRow: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 6 },
  reviewValue: { fontSize: 15, lineHeight: 21, paddingRight: 40 },
  reviewDivider: { height: 1, backgroundColor: "rgba(0,0,0,0.06)" },
  editButton: { position: "absolute", right: 16, top: 16 },
  editButtonText: { fontSize: 14, color: Colors.primary, fontWeight: "500" },
  reviewPhotos: { flexDirection: "row", gap: 8, marginTop: 4 },
  reviewPhotoThumb: { width: 50, height: 50, borderRadius: 8, backgroundColor: "#eee" },
  disclaimer: { fontSize: 13, color: "#999", textAlign: "center", marginTop: 16, paddingHorizontal: 40 },

  continueButtonContainer: { paddingHorizontal: 20, marginTop: 24 },
  continueButton: { borderRadius: 28, paddingVertical: 14, marginVertical: 0 },
  continueButtonText: { color: "white", fontSize: 16, fontWeight: "600", textAlign: "center" },

  // About card
  topCard: { borderRadius: 16, padding: 16, backgroundColor: "#fff", borderWidth: 1, borderColor: "rgba(0,0,0,0.08)", alignItems: "stretch", margin: 16 },
  avatar: { width: 96, height: 96, borderRadius: 48, backgroundColor: "#eee", alignSelf: "center" },
  avatarFallback: { borderWidth: StyleSheet.hairlineWidth, borderColor: "rgba(0,0,0,0.15)" },
  name: { fontWeight: "800", fontSize: 18, textAlign: "center" },
  metricsRow: { marginTop: 6, flexDirection: "row", alignItems: "center", flexWrap: "wrap", justifyContent: "center" },
  metricText: { marginLeft: 6, color: "#555" },

  verifyWrap: { marginTop: 2 },
  verifyList: { marginTop: 8, paddingVertical: 8, borderRadius: 12, backgroundColor: "#f8fafc", borderWidth: 1, borderColor: "rgba(0,0,0,0.06)" },
  verifyRow: { flexDirection: "row", alignItems: "center", paddingVertical: 6, paddingHorizontal: 10 },
  verifyIcon: { marginRight: 8 },
  verifyLabel: { fontSize: 15, fontWeight: "700" },
  verifyLabelMuted: { color: "#6b7280", fontWeight: "600" },

  kpiRow: { flexDirection: "row", justifyContent: "space-between" },
  kpiCol: { flex: 1, alignItems: "flex-start", paddingRight: 8 },
  kpiLabel: { fontSize: 12, color: "#666", fontWeight: "700", textTransform: "uppercase" },
  kpiValue: { fontSize: 18, fontWeight: "800", marginTop: 2 },

  divider: { height: 1, backgroundColor: "rgba(0,0,0,0.08)", marginVertical: 12 },
  infoLabel: { fontSize: 12, color: "#666", fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.2 },
  infoValue: { fontSize: 16, fontWeight: "600" },
  infoBody: { fontSize: 15, lineHeight: 20 },

  // Upload overlay
  uploadBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.35)", alignItems: "center", justifyContent: "center", padding: 24 },
  uploadCard: { width: "86%", maxWidth: 360, borderRadius: 16, paddingVertical: 20, paddingHorizontal: 18, backgroundColor: "#fff", alignItems: "center" },
  uploadTitle: { marginTop: 12, fontWeight: "800", fontSize: 16 },
  uploadSub: { marginTop: 4, fontSize: 13, color: "#666" },
  uploadBar: { marginTop: 12, width: "100%", height: 6, borderRadius: 3, backgroundColor: "rgba(0,0,0,0.08)", overflow: "hidden" },
  uploadFill: { height: 6, borderRadius: 3 },

  // Image viewer
  viewerBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.95)", alignItems: "center", justifyContent: "center" },
  viewerImg: { width: SCREEN_WIDTH, height: SCREEN_HEIGHT * 0.7 },
  viewerClose: { position: "absolute", top: 50, right: 20, width: 40, height: 40, borderRadius: 20, backgroundColor: "rgba(255,255,255,0.18)", alignItems: "center", justifyContent: "center", zIndex: 10 },
  viewerNav: { position: "absolute", top: "50%", marginTop: -18, width: 36, height: 36, borderRadius: 18, backgroundColor: "rgba(255,255,255,0.18)", alignItems: "center", justifyContent: "center", zIndex: 10 },
  viewerDots: { flexDirection: "row", gap: 8, marginBottom: 12 },
  viewerDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: "rgba(255,255,255,0.4)" },
  viewerDotActive: { backgroundColor: "#fff" },
  viewerDelete: { position: "absolute", bottom: 40, width: 50, height: 50, borderRadius: 25, backgroundColor: "rgba(255,0,0,0.4)", alignItems: "center", justifyContent: "center" },
  viewerFooter: { alignItems: "center", paddingBottom: 40 },
  viewerDeleteBtn: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "rgba(255,0,0,0.6)", paddingVertical: 10, paddingHorizontal: 18, borderRadius: 20 },
  viewerDeleteText: { color: "#fff", fontWeight: "600", fontSize: 14 },
});
