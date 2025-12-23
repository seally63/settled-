// app/(dashboard)/client/clienthome.jsx
import {
  StyleSheet,
  View,
  Platform,
  KeyboardAvoidingView,
  ScrollView,
  Pressable,
  Alert,
  Image,
  Modal,
  ActivityIndicator,
  Dimensions,
} from "react-native";
import { useState, useEffect } from "react";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import * as ImagePicker from "expo-image-picker";
import * as ImageManipulator from "expo-image-manipulator";

import { supabase } from "../../../lib/supabase";
import { useUser } from "../../../hooks/useUser";

import ThemedView from "../../../components/ThemedView";
import ThemedText from "../../../components/ThemedText";
import ThemedTextInput from "../../../components/ThemedTextInput";
import ThemedButton from "../../../components/ThemedButton";
import { Colors } from "../../../constants/Colors";
import { uploadRequestImages } from "../../../lib/api/attachments";
import {
  getServiceCategories,
  getServiceTypes,
  getPropertyTypes,
  getTimingOptions,
} from "../../../lib/api/services";

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");

// Ensure at least N frames paint
const paintFrames = (n = 2) =>
  new Promise((resolve) => {
    const step = () => (n-- <= 0 ? resolve() : requestAnimationFrame(step));
    requestAnimationFrame(step);
  });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const MIN_PREP_MS = 600;
const CELL = 96;

// Create lightweight thumbnails with base64 for upload
async function makeThumbnails(uris) {
  const out = [];
  for (const uri of uris) {
    const { uri: thumb, base64 } = await ImageManipulator.manipulateAsync(
      uri,
      [{ resize: { width: 1200 } }],
      {
        compress: 0.8,
        format: ImageManipulator.SaveFormat.JPEG,
        base64: true,
      }
    );
    out.push({ uri: thumb, base64 });
  }
  return out;
}

export default function ClientHome() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useUser();

  // ===== Multi-step form state =====
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
  const [propertyTypes, setPropertyTypes] = useState([]);
  const [selectedPropertyType, setSelectedPropertyType] = useState(null);
  const [loadingPropertyTypes, setLoadingPropertyTypes] = useState(false);
  const [showPropertyDropdown, setShowPropertyDropdown] = useState(false);

  // Step 4: Photos & Timing
  const [photos, setPhotos] = useState([]);
  const [timingOptions, setTimingOptions] = useState([]);
  const [selectedTiming, setSelectedTiming] = useState(null);
  const [loadingTimingOptions, setLoadingTimingOptions] = useState(false);

  // Photo preparation overlay
  const [prepVisible, setPrepVisible] = useState(false);
  const [prepUris, setPrepUris] = useState(new Set());
  const [prepStartedAt, setPrepStartedAt] = useState(0);
  const [prepPhase, setPrepPhase] = useState("preparing");
  const [prepDone, setPrepDone] = useState(0);
  const [prepTotal, setPrepTotal] = useState(0);

  // Full-screen image viewer
  const [viewer, setViewer] = useState({ open: false, index: 0 });

  // Step 5: Review & Submit
  const [submitting, setSubmitting] = useState(false);
  const [editingFromReview, setEditingFromReview] = useState(false);

  // Upload overlay
  const [uploading, setUploading] = useState(false);
  const [uploadIdx, setUploadIdx] = useState(0);
  const [uploadTotal, setUploadTotal] = useState(0);

  // ===== Load data on mount =====
  useEffect(() => {
    loadCategories();
    loadPropertyTypes();
    loadTimingOptions();
  }, []);

  // Load service types when category changes
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
    setLoadingPropertyTypes(true);
    try {
      const data = await getPropertyTypes();
      setPropertyTypes(data);
    } catch (e) {
      console.warn("Failed to load property types:", e.message);
    } finally {
      setLoadingPropertyTypes(false);
    }
  }

  async function loadTimingOptions() {
    setLoadingTimingOptions(true);
    try {
      const data = await getTimingOptions();
      setTimingOptions(data);
    } catch (e) {
      console.warn("Failed to load timing options:", e.message);
    } finally {
      setLoadingTimingOptions(false);
    }
  }

  // ===== Photo handling =====
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
        quality: 1,
      });
      if (result.canceled) return;

      const newUris = (result.assets || []).slice(0, remaining).map((a) => a.uri);
      if (!newUris.length) return;

      beginPreparing(newUris.length);
      await paintFrames(2);

      // Process thumbnails with proper yielding to prevent UI freeze
      const thumbs = [];
      for (let i = 0; i < newUris.length; i++) {
        // Yield to UI thread before each image
        await new Promise((resolve) => setTimeout(resolve, 50));
        await paintFrames(1);

        const [thumb] = await makeThumbnails([newUris[i]]);
        thumbs.push(thumb);
        setPrepDone(i + 1);

        // Extra yield after processing
        await new Promise((resolve) => setTimeout(resolve, 10));
      }

      setPrepPhase("rendering");
      setPrepUris(new Set(thumbs.map((t) => t.uri)));
      await paintFrames(2);

      setPhotos((prev) => [...prev, ...thumbs].slice(0, 5));

      // Close prep overlay after a brief delay
      await sleep(300);
      setPrepVisible(false);
    } catch (e) {
      console.warn("pickFromLibrary error:", e);
      setPrepVisible(false);
    }
  }

  async function takePhoto() {
    try {
      if (photos.length >= 5) {
        Alert.alert("Limit reached", "You can add up to 5 photos.");
        return;
      }
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (perm.status !== "granted") {
        Alert.alert("Permission needed", "Please allow camera access to take photos.");
        return;
      }
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 1,
      });
      if (result.canceled) return;
      const asset = result.assets?.[0];
      if (!asset?.uri) return;

      beginPreparing(1);
      await paintFrames(2);
      await sleep(0);

      const [thumb] = await makeThumbnails([asset.uri]);
      setPrepDone(1);

      setPrepPhase("rendering");
      setPrepUris(new Set([thumb.uri]));
      await paintFrames(1);

      setPhotos((prev) => [...prev, thumb].slice(0, 5));
    } catch {}
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
    await new Promise((r) => requestAnimationFrame(r));
    await new Promise((r) => requestAnimationFrame(r));

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

    if (totalPhotos) {
      if (!uploadedPaths.length) {
        Alert.alert(
          "Photos not attached",
          "We couldn't upload your photos, but your request was still sent."
        );
      } else if (uploadedPaths.length !== totalPhotos) {
        Alert.alert(
          "Partial upload",
          `Attached ${uploadedPaths.length} of ${totalPhotos} photos.`
        );
      }
    }
  }

  // ===== Submit request =====
  async function submitRequest() {
    try {
      if (!user?.id) return Alert.alert("Please log in to submit a request.");
      if (!selectedCategory) return Alert.alert("Please select a category.");
      if (!selectedServiceType) return Alert.alert("Please select a service type.");
      if (!selectedTiming) return Alert.alert("Please select when you need this done.");

      setSubmitting(true);

      // Build structured details
      const details = [
        `Category: ${selectedCategory.name}`,
        `Service: ${selectedServiceType.name}`,
        description?.trim() ? `Description: ${description.trim()}` : null,
        selectedPropertyType ? `Property: ${selectedPropertyType.name}` : null,
        `Timing: ${selectedTiming.name}`,
        selectedTiming.is_emergency ? `Emergency: Yes` : null,
      ]
        .filter(Boolean)
        .join("\n");

      // Create the request
      const { data: created, error: reqError } = await supabase
        .from("quote_requests")
        .insert({
          requester_id: user.id,
          details,
          status: "open",
          category_id: selectedCategory.id,
          service_type_id: selectedServiceType.id,
          property_type_id: selectedPropertyType?.id || null,
          timing_option_id: selectedTiming.id,
        })
        .select("id")
        .single();

      if (reqError) throw reqError;

      // Upload photos
      await uploadAndAttach(created.id);
      resetPhotoUI();

      // Match trades
      try {
        await supabase.functions.invoke("match-trades", {
          body: { request_id: created.id, limit: 5 },
        });
      } catch (fnErr) {
        console.log("match-trades failed:", fnErr?.message || fnErr);
      }

      Alert.alert("Request submitted", "Your quote request was sent successfully!");

      // Reset form
      setStep(0);
      setSelectedCategory(null);
      setSelectedServiceType(null);
      setDescription("");
      setSelectedPropertyType(null);
      setPhotos([]);
      setSelectedTiming(null);
      resetPhotoUI();
    } catch (e) {
      Alert.alert("Error", e.message);
    } finally {
      setSubmitting(false);
    }
  }

  // ===== Navigation helpers =====
  function goToStepForEdit(targetStep) {
    setEditingFromReview(true);
    setStep(targetStep);
  }

  function handleContinueOrReturnToReview(nextStep) {
    if (editingFromReview) {
      setEditingFromReview(false);
      setStep(5); // Return to review
    } else {
      setStep(nextStep);
    }
  }

  // ===== Handle category selection (auto-advance) =====
  function handleCategorySelect(cat) {
    setSelectedCategory(cat);
    setSelectedServiceType(null); // Reset service type when category changes
    setStep(2); // Auto-advance to step 2
  }

  // ===== Handle service type selection (auto-advance) =====
  function handleServiceTypeSelect(type) {
    setSelectedServiceType(type);
    // If editing from review, go back to review; otherwise advance to step 3
    if (editingFromReview) {
      setEditingFromReview(false);
      setStep(5);
    } else {
      setStep(3);
    }
  }

  // ===== Overlays =====
  const UploadOverlay = () => {
    const isVisible = prepVisible || (uploading && uploadTotal > 0);
    if (!isVisible) return null;

    const pct = uploading && uploadTotal ? Math.round((uploadIdx / uploadTotal) * 100) : 0;
    const title = prepVisible
      ? prepPhase === "preparing"
        ? "Preparing your photos…"
        : "Rendering your photos…"
      : "Uploading your photos…";

    return (
      <Modal
        visible
        transparent
        animationType="none"
        statusBarTranslucent
        hardwareAccelerated
        presentationStyle="overFullScreen"
        onRequestClose={() => {}}
      >
        <View style={styles.uploadBackdrop}>
          <View style={styles.uploadCard}>
            <ActivityIndicator size="large" color={Colors.primary} />
            <ThemedText style={styles.uploadTitle}>{title}</ThemedText>
            {prepVisible && prepPhase === "preparing" ? (
              <ThemedText style={styles.uploadSub}>
                {prepDone} of {prepTotal}
              </ThemedText>
            ) : null}
            {!prepVisible && uploading && uploadTotal > 0 ? (
              <>
                <ThemedText style={styles.uploadSub}>
                  {uploadIdx} of {uploadTotal}
                </ThemedText>
                <View style={styles.uploadBar}>
                  <View style={[styles.uploadFill, { width: `${pct}%`, backgroundColor: Colors.primary }]} />
                </View>
              </>
            ) : null}
          </View>
        </View>
      </Modal>
    );
  };

  // ===== Full-screen image viewer =====
  const ImageViewer = () => {
    if (!viewer.open || photos.length === 0) return null;

    const closeViewer = () => setViewer({ open: false, index: 0 });
    const currentPhoto = photos[viewer.index];

    return (
      <Modal
        visible={viewer.open}
        transparent
        animationType="fade"
        onRequestClose={closeViewer}
        statusBarTranslucent
      >
        <View style={styles.viewerBackdrop}>
          <Pressable style={styles.viewerClose} hitSlop={8} onPress={closeViewer}>
            <Ionicons name="close" size={22} color="#fff" />
          </Pressable>

          {/* Navigation arrows */}
          {viewer.index > 0 && (
            <Pressable
              style={[styles.viewerNav, { left: 12 }]}
              hitSlop={10}
              onPress={() => setViewer((v) => ({ ...v, index: v.index - 1 }))}
            >
              <Ionicons name="chevron-back" size={28} color="#fff" />
            </Pressable>
          )}

          {currentPhoto && (
            <Image
              source={{ uri: currentPhoto.uri }}
              style={styles.viewerImg}
              resizeMode="contain"
            />
          )}

          {viewer.index < photos.length - 1 && (
            <Pressable
              style={[styles.viewerNav, { right: 12 }]}
              hitSlop={10}
              onPress={() => setViewer((v) => ({ ...v, index: v.index + 1 }))}
            >
              <Ionicons name="chevron-forward" size={28} color="#fff" />
            </Pressable>
          )}

          {/* Navigation dots */}
          <View style={styles.viewerDots}>
            {photos.map((_, i) => (
              <View
                key={i}
                style={[
                  styles.viewerDot,
                  i === viewer.index && styles.viewerDotActive,
                ]}
              />
            ))}
          </View>

          {/* Delete button */}
          <Pressable
            style={styles.viewerDelete}
            hitSlop={10}
            onPress={() => {
              const idx = viewer.index;
              removePhoto(idx);
              const remaining = photos.length - 1;
              if (remaining <= 0) {
                setViewer({ open: false, index: 0 });
              } else {
                setViewer({ open: true, index: Math.min(idx, remaining - 1) });
              }
            }}
          >
            <Ionicons name="trash-outline" size={18} color="#fff" />
          </Pressable>
        </View>
      </Modal>
    );
  };

  // ===== Handle back navigation =====
  function handleBack(defaultStep) {
    if (editingFromReview) {
      setEditingFromReview(false);
      setStep(5); // Return to review
    } else {
      setStep(defaultStep);
    }
  }

  // ===== Headers =====
  const SubHeader = ({ onBack, currentStep, totalSteps = 5 }) => {
    const pct = `${(currentStep / totalSteps) * 100}%`;

    return (
      <View style={[styles.subHeader, { paddingTop: insets.top }]}>
        <Pressable onPress={onBack} style={styles.backButton} hitSlop={10}>
          <Ionicons name="chevron-back" size={24} color="#111" />
        </Pressable>

        <View style={styles.progressTrackContainer}>
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: pct, backgroundColor: Colors.primary }]} />
          </View>
        </View>
      </View>
    );
  };

  // ===== Step 0: Landing =====
  const Landing = (
    <ThemedView style={styles.container} safe={false}>
      <View style={[styles.appHeader, { backgroundColor: Colors.primary, paddingTop: insets.top }]}>
        <StatusBar style="light" />
        <ThemedText style={styles.appTitle}>Settled</ThemedText>
      </View>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ padding: 24 }}
          showsVerticalScrollIndicator={false}
        >
          <ThemedText title style={{ fontSize: 20, fontWeight: "800", marginBottom: 12 }}>
            Get quotes from trusted tradespeople
          </ThemedText>
          <ThemedText style={{ marginBottom: 24, lineHeight: 20 }}>
            Tell us what you need and we'll match you with local professionals.
          </ThemedText>

          <ThemedButton onPress={() => setStep(1)} style={{ borderRadius: 28 }}>
            <ThemedText style={{ color: "#fff", fontWeight: "700", textAlign: "center" }}>
              Request a quote
            </ThemedText>
          </ThemedButton>

          <View style={{ marginTop: 16 }}>
            <ThemedButton
              onPress={() => router.push("/client/find-business")}
              style={{ borderRadius: 28, backgroundColor: "#f5f5f5" }}
            >
              <ThemedText style={{ color: "#333", fontWeight: "600", textAlign: "center" }}>
                Find a business
              </ThemedText>
            </ThemedButton>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
      <UploadOverlay />
    </ThemedView>
  );

  // ===== Step 1: Category Selection (Grid) =====
  const CategoryStep = (
    <ThemedView style={styles.container} safe={false}>
      <SubHeader onBack={() => handleBack(0)} currentStep={1} />
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: 40 + insets.bottom }}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.questionHeader}>
          <ThemedText title style={styles.questionTitle}>
            What do you need help with?
          </ThemedText>
        </View>

        {loadingCategories ? (
          <ActivityIndicator size="large" color={Colors.primary} style={{ marginTop: 40 }} />
        ) : (
          <View style={styles.categoryGrid}>
            {categories.map((cat) => (
              <Pressable
                key={cat.id}
                style={styles.categoryCard}
                onPress={() => handleCategorySelect(cat)}
              >
                <View style={styles.categoryIconWrap}>
                  <Ionicons name={cat.icon} size={32} color={Colors.primary} />
                </View>
                <ThemedText style={styles.categoryName}>{cat.name}</ThemedText>
              </Pressable>
            ))}
          </View>
        )}
      </ScrollView>
      <UploadOverlay />
    </ThemedView>
  );

  // ===== Step 2: Service Type Selection (List) =====
  const ServiceTypeStep = (
    <ThemedView style={styles.container} safe={false}>
      <SubHeader onBack={() => handleBack(1)} currentStep={2} />
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: 40 + insets.bottom }}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.questionHeader}>
          <ThemedText title style={styles.questionTitle}>
            What do you need help with?
          </ThemedText>
          {selectedCategory && (
            <ThemedText style={styles.questionSubtitle}>
              {selectedCategory.name}
            </ThemedText>
          )}
        </View>

        {loadingServiceTypes ? (
          <ActivityIndicator size="large" color={Colors.primary} style={{ marginTop: 40 }} />
        ) : (
          <View style={styles.serviceTypeList}>
            {serviceTypes.map((type) => (
              <Pressable
                key={type.id}
                style={styles.serviceTypeCard}
                onPress={() => handleServiceTypeSelect(type)}
              >
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
      <UploadOverlay />
    </ThemedView>
  );

  // ===== Step 3: Details Form =====
  const DetailsStep = (
    <ThemedView style={styles.container} safe={false}>
      <SubHeader onBack={() => handleBack(2)} currentStep={3} />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingBottom: 40 + insets.bottom }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.questionHeader}>
            <ThemedText title style={styles.questionTitle}>
              Tell us more.
            </ThemedText>
            {selectedCategory && selectedServiceType && (
              <ThemedText style={styles.selectionSummary}>
                {selectedCategory.name} → {selectedServiceType.name}
              </ThemedText>
            )}
          </View>

          {/* Description */}
          <View style={styles.fieldContainer}>
            <ThemedText style={styles.fieldLabel}>Describe the job</ThemedText>
            <ThemedTextInput
              style={styles.textArea}
              placeholder="e.g., Need to fix a leaky tap under the kitchen sink..."
              value={description}
              onChangeText={(t) => {
                if (t.length <= 500) setDescription(t);
              }}
              multiline
              textAlignVertical="top"
            />
            <ThemedText style={styles.charCount}>{description.length}/500</ThemedText>
          </View>

          {/* Property Type Dropdown */}
          <View style={styles.fieldContainer}>
            <ThemedText style={styles.fieldLabel}>Property type</ThemedText>
            <Pressable
              style={styles.dropdown}
              onPress={() => setShowPropertyDropdown(!showPropertyDropdown)}
            >
              <ThemedText style={selectedPropertyType ? styles.dropdownText : styles.dropdownPlaceholder}>
                {selectedPropertyType?.name || "Select property type"}
              </ThemedText>
              <Ionicons
                name={showPropertyDropdown ? "chevron-up" : "chevron-down"}
                size={20}
                color="#666"
              />
            </Pressable>

            {showPropertyDropdown && (
              <View style={styles.dropdownMenu}>
                {propertyTypes.map((pt) => (
                  <Pressable
                    key={pt.id}
                    style={[
                      styles.dropdownItem,
                      selectedPropertyType?.id === pt.id && styles.dropdownItemSelected,
                    ]}
                    onPress={() => {
                      setSelectedPropertyType(pt);
                      setShowPropertyDropdown(false);
                    }}
                  >
                    <ThemedText
                      style={[
                        styles.dropdownItemText,
                        selectedPropertyType?.id === pt.id && styles.dropdownItemTextSelected,
                      ]}
                    >
                      {pt.name}
                    </ThemedText>
                    {selectedPropertyType?.id === pt.id && (
                      <Ionicons name="checkmark" size={18} color={Colors.primary} />
                    )}
                  </Pressable>
                ))}
              </View>
            )}
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
      <UploadOverlay />
    </ThemedView>
  );

  // ===== Step 4: Photos & Timing =====
  const PhotosTimingStep = (
    <ThemedView style={styles.container} safe={false}>
      <SubHeader onBack={() => handleBack(3)} currentStep={4} />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingBottom: 40 + insets.bottom }}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.questionHeader}>
            <ThemedText title style={styles.questionTitle}>
              Almost done!
            </ThemedText>
          </View>

          {/* Photos Section */}
          <View style={styles.sectionContainer}>
            <ThemedText style={styles.sectionTitle}>Add photos (optional)</ThemedText>
            <ThemedText style={styles.sectionHint}>
              Helps tradespeople give accurate quotes
            </ThemedText>

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.photoScroll}
              contentContainerStyle={styles.photoScrollContent}
            >
              {photos.map((p, i) => (
                <View key={`${p.uri}-${i}`} style={styles.photoCell}>
                  <Pressable style={{ flex: 1 }} onPress={() => setViewer({ open: true, index: i })}>
                    <Image
                      source={{ uri: p.uri }}
                      style={styles.photoImg}
                      onLoadEnd={() => markThumbLoaded(p.uri)}
                    />
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

          {/* Timing Section */}
          <View style={styles.sectionContainer}>
            <ThemedText style={styles.sectionTitle}>When do you need this done?</ThemedText>

            {loadingTimingOptions ? (
              <ActivityIndicator size="small" color={Colors.primary} style={{ marginTop: 16 }} />
            ) : (
              <View style={styles.timingList}>
                {timingOptions.map((opt) => (
                  <Pressable
                    key={opt.id}
                    style={[
                      styles.timingOption,
                      selectedTiming?.id === opt.id && styles.timingOptionSelected,
                    ]}
                    onPress={() => setSelectedTiming(opt)}
                  >
                    <View
                      style={[
                        styles.radioOuter,
                        selectedTiming?.id === opt.id && styles.radioOuterSelected,
                      ]}
                    >
                      {selectedTiming?.id === opt.id && <View style={styles.radioInner} />}
                    </View>
                    <ThemedText
                      style={[
                        styles.timingText,
                        opt.is_emergency && styles.timingTextEmergency,
                      ]}
                    >
                      {opt.name}
                    </ThemedText>
                  </Pressable>
                ))}
              </View>
            )}
          </View>

          <View style={styles.continueButtonContainer}>
            <ThemedButton
              onPress={() => handleContinueOrReturnToReview(5)}
              disabled={!selectedTiming}
              style={styles.continueButton}
            >
              <ThemedText style={styles.continueButtonText}>
                {editingFromReview ? "Save changes" : "Review request"}
              </ThemedText>
            </ThemedButton>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
      <UploadOverlay />
      <ImageViewer />
    </ThemedView>
  );

  // ===== Step 5: Review & Submit =====
  const ReviewStep = (
    <ThemedView style={styles.container} safe={false}>
      <SubHeader onBack={() => setStep(4)} currentStep={5} />
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: 40 + insets.bottom }}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.questionHeader}>
          <ThemedText title style={styles.questionTitle}>
            Review your request.
          </ThemedText>
        </View>

        <View style={styles.reviewCard}>
          {/* Service */}
          <View style={styles.reviewSection}>
            <ThemedText style={styles.reviewLabel}>SERVICE</ThemedText>
            <ThemedText style={styles.reviewValue}>
              {selectedCategory?.name} → {selectedServiceType?.name}
            </ThemedText>
            <Pressable onPress={() => goToStepForEdit(1)} style={styles.editButton}>
              <ThemedText style={styles.editButtonText}>Edit</ThemedText>
            </Pressable>
          </View>

          <View style={styles.reviewDivider} />

          {/* Details */}
          <View style={styles.reviewSection}>
            <ThemedText style={styles.reviewLabel}>DETAILS</ThemedText>
            <ThemedText style={styles.reviewValue} numberOfLines={3}>
              {description?.trim() || "No description provided"}
            </ThemedText>
            <Pressable onPress={() => goToStepForEdit(3)} style={styles.editButton}>
              <ThemedText style={styles.editButtonText}>Edit</ThemedText>
            </Pressable>
          </View>

          <View style={styles.reviewDivider} />

          {/* Property */}
          <View style={styles.reviewSection}>
            <ThemedText style={styles.reviewLabel}>PROPERTY</ThemedText>
            <ThemedText style={styles.reviewValue}>
              {selectedPropertyType?.name || "Not specified"}
            </ThemedText>
            <Pressable onPress={() => goToStepForEdit(3)} style={styles.editButton}>
              <ThemedText style={styles.editButtonText}>Edit</ThemedText>
            </Pressable>
          </View>

          <View style={styles.reviewDivider} />

          {/* Timing */}
          <View style={styles.reviewSection}>
            <ThemedText style={styles.reviewLabel}>TIMING</ThemedText>
            <ThemedText style={styles.reviewValue}>{selectedTiming?.name}</ThemedText>
            <Pressable onPress={() => goToStepForEdit(4)} style={styles.editButton}>
              <ThemedText style={styles.editButtonText}>Edit</ThemedText>
            </Pressable>
          </View>

          <View style={styles.reviewDivider} />

          {/* Photos */}
          <View style={styles.reviewSection}>
            <ThemedText style={styles.reviewLabel}>PHOTOS</ThemedText>
            <View style={styles.reviewPhotos}>
              {photos.length > 0 ? (
                photos.map((p, i) => (
                  <Image key={i} source={{ uri: p.uri }} style={styles.reviewPhotoThumb} />
                ))
              ) : (
                <ThemedText style={styles.reviewValue}>No photos added</ThemedText>
              )}
            </View>
            <Pressable onPress={() => goToStepForEdit(4)} style={styles.editButton}>
              <ThemedText style={styles.editButtonText}>Edit</ThemedText>
            </Pressable>
          </View>
        </View>

        <View style={styles.continueButtonContainer}>
          <ThemedButton
            onPress={submitRequest}
            disabled={submitting}
            style={styles.continueButton}
          >
            <ThemedText style={styles.continueButtonText}>
              {submitting ? "Submitting…" : "Submit request"}
            </ThemedText>
          </ThemedButton>
        </View>

        <ThemedText style={styles.disclaimer}>
          By submitting, you agree to receive quotes from tradespeople
        </ThemedText>
      </ScrollView>
      <UploadOverlay />
    </ThemedView>
  );

  // ===== Render current step =====
  if (step === 0) return Landing;
  if (step === 1) return CategoryStep;
  if (step === 2) return ServiceTypeStep;
  if (step === 3) return DetailsStep;
  if (step === 4) return PhotosTimingStep;
  if (step === 5) return ReviewStep;
  return Landing;
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: "stretch" },

  // App header
  appHeader: {
    paddingBottom: 16,
    paddingHorizontal: 20,
    alignItems: "center",
  },
  appTitle: {
    fontSize: 24,
    fontWeight: "bold",
    color: "white",
    letterSpacing: 0.5,
  },

  // Sub header with progress
  subHeader: {
    paddingBottom: 12,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(0,0,0,0.08)",
    backgroundColor: "#fff",
  },
  backButton: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
  },
  progressTrackContainer: {
    marginTop: 12,
  },
  progressTrack: {
    height: 3,
    borderRadius: 2,
    backgroundColor: "rgba(0,0,0,0.08)",
    overflow: "hidden",
  },
  progressFill: { height: 3, borderRadius: 2 },

  // Question header
  questionHeader: { paddingHorizontal: 20, paddingVertical: 24 },
  questionTitle: { fontSize: 24, fontWeight: "bold", lineHeight: 30 },
  questionSubtitle: { fontSize: 14, color: "#666", marginTop: 4 },
  selectionSummary: {
    fontSize: 14,
    color: Colors.primary,
    marginTop: 8,
    fontWeight: "500",
  },

  // Category grid (Step 1)
  categoryGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    paddingHorizontal: 16,
    gap: 12,
  },
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
  categoryIconWrap: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: `${Colors.primary}15`,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  categoryName: {
    fontSize: 15,
    fontWeight: "600",
    textAlign: "center",
  },

  // Service type list (Step 2)
  serviceTypeList: {
    paddingHorizontal: 20,
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
    backgroundColor: `${Colors.primary}15`,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 14,
  },
  serviceTypeName: {
    flex: 1,
    fontSize: 16,
    fontWeight: "500",
  },

  // Details form (Step 3)
  fieldContainer: {
    paddingHorizontal: 20,
    marginBottom: 20,
  },
  fieldLabel: {
    fontSize: 14,
    fontWeight: "600",
    marginBottom: 8,
    color: "#333",
  },
  textArea: {
    minHeight: 120,
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
  dropdownItemTextSelected: {
    color: Colors.primary,
    fontWeight: "500",
  },

  // Photos & Timing (Step 4)
  sectionContainer: {
    paddingHorizontal: 20,
    marginBottom: 28,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 4,
  },
  sectionHint: {
    fontSize: 13,
    color: "#666",
    marginBottom: 14,
  },
  photoScroll: {
    marginLeft: -20,
    marginRight: -20,
  },
  photoScrollContent: {
    paddingHorizontal: 20,
    gap: 10,
  },
  photoCell: {
    width: 100,
    height: 100,
    borderRadius: 12,
    overflow: "hidden",
    backgroundColor: "#eee",
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
    marginTop: 12,
  },
  timingOption: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    paddingHorizontal: 4,
  },
  timingOptionSelected: {},
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
  timingText: {
    fontSize: 16,
  },
  timingTextEmergency: {
    color: "#e53935",
    fontWeight: "600",
  },

  // Review (Step 5)
  reviewCard: {
    marginHorizontal: 20,
    backgroundColor: "#fff",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.08)",
    overflow: "hidden",
  },
  reviewSection: {
    padding: 16,
    position: "relative",
  },
  reviewLabel: {
    fontSize: 11,
    fontWeight: "600",
    color: "#999",
    letterSpacing: 0.5,
    marginBottom: 6,
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
  disclaimer: {
    fontSize: 13,
    color: "#999",
    textAlign: "center",
    marginTop: 16,
    paddingHorizontal: 40,
  },

  // Continue button
  continueButtonContainer: { paddingHorizontal: 20, marginTop: 24 },
  continueButton: { borderRadius: 28, paddingVertical: 14, marginVertical: 0 },
  continueButtonText: { color: "white", fontSize: 16, fontWeight: "600", textAlign: "center" },

  // Upload overlay
  uploadBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.35)",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  uploadCard: {
    width: "86%",
    maxWidth: 360,
    borderRadius: 16,
    paddingVertical: 20,
    paddingHorizontal: 18,
    backgroundColor: "#fff",
    alignItems: "center",
  },
  uploadTitle: { marginTop: 12, fontWeight: "800", fontSize: 16 },
  uploadSub: { marginTop: 4, fontSize: 13, color: "#666" },
  uploadBar: {
    marginTop: 12,
    width: "100%",
    height: 6,
    borderRadius: 3,
    backgroundColor: "rgba(0,0,0,0.08)",
    overflow: "hidden",
  },
  uploadFill: { height: 6, borderRadius: 3 },

  // Image viewer
  viewerBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.95)",
    alignItems: "center",
    justifyContent: "center",
  },
  viewerImg: {
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT * 0.7,
  },
  viewerClose: {
    position: "absolute",
    top: 50,
    right: 20,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.18)",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 10,
  },
  viewerNav: {
    position: "absolute",
    top: "50%",
    marginTop: -18,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.18)",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 10,
  },
  viewerDots: {
    position: "absolute",
    bottom: 100,
    flexDirection: "row",
    gap: 8,
  },
  viewerDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "rgba(255,255,255,0.4)",
  },
  viewerDotActive: {
    backgroundColor: "#fff",
  },
  viewerDelete: {
    position: "absolute",
    bottom: 40,
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: "rgba(255,0,0,0.4)",
    alignItems: "center",
    justifyContent: "center",
  },
});
