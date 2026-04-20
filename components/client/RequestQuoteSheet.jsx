// components/client/RequestQuoteSheet.jsx
// Self-contained 4-step wizard for requesting a quote from a specific
// trade. Renders as a pageSheet Modal so the underlying screen
// gets iOS's native zoom-out/zoom-in transition.
//
// Use it like:
//   const [open, setOpen] = useState(false);
//   <Pressable onPress={() => setOpen(true)}>...</Pressable>
//   <RequestQuoteSheet
//     visible={open}
//     onClose={() => setOpen(false)}
//     tradeId={trade.id}
//     tradeName={trade.business_name || trade.full_name}
//     isTest={false}
//   />
//
// All wizard state, RPC calls, photo upload, service-area check, and
// submission live inside the component — the parent just opens/closes.

import React, { useEffect, useMemo, useState, useRef, useCallback } from "react";
import {
  View,
  Pressable,
  Image,
  ScrollView,
  Modal,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Alert,
  ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import * as ImageManipulator from "expo-image-manipulator";
import ImageViewing from "react-native-image-viewing";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import ThemedView from "../ThemedView";
import ThemedText from "../ThemedText";
import ThemedTextInput from "../ThemedTextInput";
import { WizardHeader, SelectCard } from "../design";
import PhotoUploadThumbnail from "../PhotoUploadThumbnail";
import { KEYBOARD_DONE_ID } from "../KeyboardDoneButton";
import { Colors } from "../../constants/Colors";
import { FontFamily, Radius } from "../../constants/Typography";
import { useTheme } from "../../hooks/useTheme";

import { supabase } from "../../lib/supabase";
import {
  getServiceCategories,
  getServiceTypes,
  getPropertyTypes,
  getTimingOptions,
} from "../../lib/api/services";
import {
  requestDirectQuote,
  checkServiceAreaDistance,
} from "../../lib/api/directRequest";
import {
  uploadTempImage,
  moveTempToRequest,
  deleteTempImages,
  generateUploadSessionId,
} from "../../lib/api/attachments";
import {
  getCategoryIcon,
  getServiceTypeIcon,
  defaultCategoryIcon,
  defaultServiceTypeIcon,
} from "../../assets/icons";

// Budget options — values must match the CHECK constraint on
// quote_requests.budget_band.
const BUDGET_OPTIONS = [
  { id: "under_250", label: "Under £250", value: "<£250" },
  { id: "250_500", label: "£250 - £500", value: "£250–£500" },
  { id: "500_1000", label: "£500 - £1,000", value: "£500–£1k" },
  { id: "1000_3000", label: "£1,000 - £3,000", value: "£1k–£3k" },
  { id: "3000_7500", label: "£3,000 - £7,500", value: "£3k–£7.5k" },
  { id: "7500_15000", label: "£7,500 - £15,000", value: "£7.5k–£15k" },
  { id: "over_15000", label: "£15,000+", value: ">£15k" },
  { id: "not_sure", label: "I'm not sure yet", value: null },
];

export default function RequestQuoteSheet({
  visible,
  onClose,
  tradeId,
  tradeName,
  isTest = false,
  onSubmitted,
}) {
  const insets = useSafeAreaInsets();
  const { colors: c, dark } = useTheme();

  // === wizard step ===
  const [requestStep, setRequestStep] = useState(1);

  // === Step 1: Category ===
  const [categories, setCategories] = useState([]);
  const [loadingCategories, setLoadingCategories] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState(null);

  // === Step 2: Service ===
  const [serviceTypes, setServiceTypes] = useState([]);
  const [loadingServiceTypes, setLoadingServiceTypes] = useState(false);
  const [selectedServiceType, setSelectedServiceType] = useState(null);

  // === Step 3: Details ===
  const [description, setDescription] = useState("");
  const [postcode, setPostcode] = useState("");
  const [propertyTypes, setPropertyTypes] = useState([]);
  const [selectedPropertyType, setSelectedPropertyType] = useState(null);
  const [showPropertyDropdown, setShowPropertyDropdown] = useState(false);
  const [selectedBudget, setSelectedBudget] = useState(null);
  const [photos, setPhotos] = useState([]);
  const [uploadSessionId, setUploadSessionId] = useState(null);
  const [timingOptions, setTimingOptions] = useState([]);
  const [selectedTiming, setSelectedTiming] = useState(null);

  // === Image viewer ===
  const [viewer, setViewer] = useState({ open: false, index: 0 });

  // === Refs ===
  const isMountedRef = useRef(true);
  const retryTimeoutsRef = useRef(new Map());

  // === Submission ===
  const [submitting, setSubmitting] = useState(false);
  const [showServiceAreaWarning, setShowServiceAreaWarning] = useState(false);
  const [serviceAreaInfo, setServiceAreaInfo] = useState(null);
  const [checkingServiceArea, setCheckingServiceArea] = useState(false);

  // ─── Mount cleanup ──────────────────────────────────────
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      retryTimeoutsRef.current.forEach((t) => clearTimeout(t));
      retryTimeoutsRef.current.clear();
    };
  }, []);

  // ─── Load form data when modal opens ────────────────────
  useEffect(() => {
    if (visible) {
      loadCategories();
      loadPropertyTypes();
      loadTimingOptions();
    }
  }, [visible]);

  // ─── When category changes, reload its service types ────
  useEffect(() => {
    if (selectedCategory?.id) {
      loadServiceTypes(selectedCategory.id);
    }
  }, [selectedCategory?.id]);

  // ─── Init upload session when modal opens ───────────────
  useEffect(() => {
    if (visible && !uploadSessionId) {
      supabase.auth.getUser().then(({ data }) => {
        if (data?.user?.id) {
          setUploadSessionId(generateUploadSessionId(data.user.id));
        }
      });
    }
  }, [visible, uploadSessionId]);

  // ─── Loaders ────────────────────────────────────────────
  async function loadCategories() {
    setLoadingCategories(true);
    try {
      const data = await getServiceCategories();
      setCategories(data);
    } catch (e) {
      console.warn("loadCategories:", e.message);
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
      console.warn("loadServiceTypes:", e.message);
    } finally {
      setLoadingServiceTypes(false);
    }
  }
  async function loadPropertyTypes() {
    try {
      const data = await getPropertyTypes();
      setPropertyTypes(data);
    } catch (e) {
      console.warn("loadPropertyTypes:", e.message);
    }
  }
  async function loadTimingOptions() {
    try {
      const data = await getTimingOptions();
      setTimingOptions(data);
    } catch (e) {
      console.warn("loadTimingOptions:", e.message);
    }
  }

  // ─── Photo handling ─────────────────────────────────────
  async function uploadPhotoToTemp(photoId, uri, sessionId) {
    if (!isMountedRef.current) return;
    setPhotos((prev) =>
      prev.map((p) => (p.id === photoId ? { ...p, status: "uploading", progress: 0 } : p))
    );
    const result = await uploadTempImage(sessionId, { uri }, (progress) => {
      if (!isMountedRef.current) return;
      setPhotos((prev) => prev.map((p) => (p.id === photoId ? { ...p, progress } : p)));
    });
    if (!isMountedRef.current) return;
    if (result.success) {
      setPhotos((prev) =>
        prev.map((p) =>
          p.id === photoId
            ? { ...p, status: "uploaded", progress: 100, tempPath: result.tempPath }
            : p
        )
      );
      if (retryTimeoutsRef.current.has(photoId)) {
        clearTimeout(retryTimeoutsRef.current.get(photoId));
        retryTimeoutsRef.current.delete(photoId);
      }
    } else {
      setPhotos((prev) =>
        prev.map((p) => (p.id === photoId ? { ...p, status: "error", error: result.error } : p))
      );
      const timeoutId = setTimeout(() => {
        if (!isMountedRef.current) return;
        retryTimeoutsRef.current.delete(photoId);
        retryUpload(photoId);
      }, 3000);
      retryTimeoutsRef.current.set(photoId, timeoutId);
    }
  }

  function retryUpload(photoId) {
    if (!isMountedRef.current) return;
    const photo = photos.find((p) => p.id === photoId);
    if (!photo || photo.status !== "error") return;
    setPhotos((prev) =>
      prev.map((p) => (p.id === photoId ? { ...p, status: "retrying", error: null } : p))
    );
    uploadPhotoToTemp(photoId, photo.uri, uploadSessionId);
  }

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
      const newAssets = (result.assets || []).slice(0, remaining);
      if (!newAssets.length) return;

      for (const asset of newAssets) {
        const photoId = `photo_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        setPhotos((prev) =>
          [...prev, { id: photoId, uri: asset.uri, status: "optimizing", progress: 0, tempPath: null, error: null }].slice(0, 5)
        );
        try {
          const { uri: processedUri } = await ImageManipulator.manipulateAsync(
            asset.uri,
            [{ resize: { width: 1200 } }],
            { compress: 0.8, format: ImageManipulator.SaveFormat.JPEG, base64: false }
          );
          setPhotos((prev) =>
            prev.map((p) => (p.id === photoId ? { ...p, uri: processedUri, status: "pending" } : p))
          );
          if (uploadSessionId) uploadPhotoToTemp(photoId, processedUri, uploadSessionId);
        } catch {
          setPhotos((prev) => prev.map((p) => (p.id === photoId ? { ...p, status: "pending" } : p)));
          if (uploadSessionId) uploadPhotoToTemp(photoId, asset.uri, uploadSessionId);
        }
      }
    } catch (e) {
      console.warn("pickFromLibrary:", e?.message || e);
    }
  }

  function removePhoto(idx) {
    const photo = photos[idx];
    if (photo?.tempPath) deleteTempImages([photo.tempPath]).catch(() => {});
    setPhotos((prev) => prev.filter((_, i) => i !== idx));
  }

  async function finalizePhotos(requestId) {
    const uploadedPhotos = photos.filter((p) => p.status === "uploaded" && p.tempPath);
    if (uploadedPhotos.length === 0) return { success: true, count: 0 };
    const tempPaths = uploadedPhotos.map((p) => p.tempPath);
    const result = await moveTempToRequest(String(requestId), tempPaths);
    return { success: result.success, count: result.movedPaths.length, errors: result.errors };
  }

  function arePhotosReady() {
    if (photos.length === 0) return true;
    return photos.every((p) => p.status === "uploaded");
  }
  function getUploadingCount() {
    return photos.filter((p) =>
      ["pending", "optimizing", "uploading", "retrying"].includes(p.status)
    ).length;
  }

  // ─── Reset ──────────────────────────────────────────────
  const resetForm = useCallback(async () => {
    retryTimeoutsRef.current.forEach((t) => clearTimeout(t));
    retryTimeoutsRef.current.clear();
    if (uploadSessionId) {
      const tempPaths = photos.filter((p) => p.tempPath).map((p) => p.tempPath);
      if (tempPaths.length > 0) deleteTempImages(tempPaths).catch(() => {});
    }
    setRequestStep(1);
    setSelectedCategory(null);
    setSelectedServiceType(null);
    setDescription("");
    setPostcode("");
    setSelectedPropertyType(null);
    setSelectedBudget(null);
    setPhotos([]);
    setUploadSessionId(null);
    setSelectedTiming(null);
    setServiceAreaInfo(null);
    setShowPropertyDropdown(false);
  }, [photos, uploadSessionId]);

  function handleClose() {
    resetForm();
    onClose?.();
  }

  // ─── Submit ─────────────────────────────────────────────
  async function checkServiceAreaBeforeSubmit() {
    try {
      if (isTest) {
        Alert.alert("Demo", "This is a demo business — request not sent.");
        return;
      }
      if (!selectedCategory) return Alert.alert("Please select a category.");
      if (!selectedServiceType) return Alert.alert("Please select a service type.");
      if (!postcode?.trim()) return Alert.alert("Please enter your postcode.");
      if (!selectedTiming) return Alert.alert("Please select when you need this done.");
      setCheckingServiceArea(true);
      const normalizedPostcode = postcode.trim().toUpperCase();
      const areaCheck = await checkServiceAreaDistance(tradeId, normalizedPostcode);
      if (areaCheck.isOutsideServiceArea) {
        setServiceAreaInfo(areaCheck);
        setShowServiceAreaWarning(true);
        setCheckingServiceArea(false);
        return;
      }
      setCheckingServiceArea(false);
      await submitDirectRequest(false);
    } catch (e) {
      setCheckingServiceArea(false);
      Alert.alert("Error", e?.message || "Failed to check service area.");
    }
  }

  async function submitDirectRequest(outsideServiceArea = false) {
    try {
      if (isTest) {
        Alert.alert("Demo", "This is a demo business — request not sent.");
        return;
      }
      if (!selectedCategory || !selectedServiceType || !postcode?.trim() || !selectedTiming) {
        Alert.alert("Please fill in all required fields.");
        return;
      }
      setSubmitting(true);
      setShowServiceAreaWarning(false);
      const normalizedPostcode = postcode.trim().toUpperCase();
      const detailParts = [
        description?.trim() || null,
        `Category: ${selectedCategory.name}`,
        `Service: ${selectedServiceType.name}`,
        selectedPropertyType ? `Property: ${selectedPropertyType.name}` : null,
        `Postcode: ${normalizedPostcode}`,
        selectedBudget ? `Budget: ${selectedBudget.label}` : null,
        `Timing: ${selectedTiming.name}`,
        selectedTiming.is_emergency ? `Emergency: Yes` : null,
      ];
      if (outsideServiceArea && serviceAreaInfo) {
        detailParts.push(
          `Note: This job is ${serviceAreaInfo.distanceMiles} miles from the trade's base location (outside their usual ${serviceAreaInfo.serviceRadiusMiles} mile service area).`
        );
      }
      const details = detailParts.filter(Boolean).join("\n");
      const suggested_title = `${selectedCategory.name} - ${selectedServiceType.name}`;
      const res = await requestDirectQuote(tradeId, {
        details,
        suggested_title,
        category_id: selectedCategory.id,
        service_type_id: selectedServiceType.id,
        property_type_id: selectedPropertyType?.id || null,
        timing_option_id: selectedTiming.id,
        postcode: normalizedPostcode,
        budget_band: selectedBudget?.value || null,
        outsideServiceArea,
        distanceMiles: outsideServiceArea ? serviceAreaInfo?.distanceMiles : null,
      });
      const newRequestId =
        res?.id || res?.request_id || res?.data?.id || res?.data?.request_id || null;
      if (newRequestId && photos.length > 0) {
        const photoResult = await finalizePhotos(newRequestId);
        if (!photoResult.success && photoResult.count === 0 && photos.length > 0) {
          Alert.alert("Photos not attached", "We couldn't attach your photos, but your request was still sent.");
        }
      }
      retryTimeoutsRef.current.forEach((t) => clearTimeout(t));
      retryTimeoutsRef.current.clear();
      // reset
      setRequestStep(1);
      setSelectedCategory(null);
      setSelectedServiceType(null);
      setDescription("");
      setPostcode("");
      setSelectedPropertyType(null);
      setSelectedBudget(null);
      setPhotos([]);
      setUploadSessionId(null);
      setSelectedTiming(null);
      setServiceAreaInfo(null);
      onClose?.();
      onSubmitted?.(newRequestId);
      Alert.alert("Request sent", "Your quote request has been sent.");
    } catch (e) {
      Alert.alert("Unable to request", e?.message || "Failed to send request.");
    } finally {
      setSubmitting(false);
    }
  }

  const imageViewerImages = useMemo(() => photos.map((p) => ({ uri: p.uri })), [photos]);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={handleClose}
    >
      <ThemedView style={{ flex: 1, backgroundColor: c.background }}>
        <WizardHeader
          step={requestStep > 4 ? 4 : requestStep}
          totalSteps={4}
          title={
            requestStep === 1 ? "Category" :
            requestStep === 2 ? "Service" :
            requestStep === 3 ? "Details" : "Review"
          }
          onBack={() => {
            if (requestStep > 1) setRequestStep(requestStep - 1);
            else handleClose();
          }}
          onClose={handleClose}
        />

        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 20, paddingBottom: 120 }}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {/* ── Step 1 · Category ─────────────────────── */}
            {requestStep === 1 && (
              <>
                <ThemedText style={[wizStyles.title, { color: c.text }]}>
                  What do you need help with?
                </ThemedText>
                <ThemedText style={[wizStyles.subtitle, { color: c.textMid }]}>
                  Pick the category that best fits the job.
                </ThemedText>
                {loadingCategories ? (
                  <ActivityIndicator size="small" color={Colors.primary} style={{ marginTop: 24 }} />
                ) : (
                  <View style={wizStyles.tileGrid}>
                    {categories.map((cat) => (
                      <View key={cat.id} style={wizStyles.tileCell}>
                        <SelectCard
                          variant="tile"
                          selected={selectedCategory?.id === cat.id}
                          title={cat.name}
                          iconSource={getCategoryIcon(cat.name) || defaultCategoryIcon}
                          onPress={() => {
                            setSelectedCategory(cat);
                            setSelectedServiceType(null);
                            setTimeout(() => setRequestStep(2), 180);
                          }}
                        />
                      </View>
                    ))}
                  </View>
                )}
              </>
            )}

            {/* ── Step 2 · Service ──────────────────────── */}
            {requestStep === 2 && (
              <>
                <ThemedText style={[wizStyles.title, { color: c.text }]}>
                  Pick the job type
                </ThemedText>
                <ThemedText style={[wizStyles.subtitle, { color: c.textMid }]}>
                  {selectedCategory?.name || "Service"} — what specifically?
                </ThemedText>
                {loadingServiceTypes ? (
                  <ActivityIndicator size="small" color={Colors.primary} style={{ marginTop: 24 }} />
                ) : (
                  <View style={{ gap: 10 }}>
                    {serviceTypes.map((type) => (
                      <SelectCard
                        key={type.id}
                        variant="row"
                        selected={selectedServiceType?.id === type.id}
                        title={type.name}
                        iconSource={
                          getServiceTypeIcon(type.name) ||
                          getCategoryIcon(selectedCategory?.name) ||
                          defaultServiceTypeIcon
                        }
                        onPress={() => {
                          setSelectedServiceType(type);
                          setTimeout(() => setRequestStep(3), 180);
                        }}
                      />
                    ))}
                  </View>
                )}
              </>
            )}

            {/* ── Step 3 · Details ──────────────────────── */}
            {requestStep === 3 && (
              <>
                <ThemedText style={[wizStyles.title, { color: c.text }]}>
                  Tell us a bit more
                </ThemedText>
                <ThemedText style={[wizStyles.subtitle, { color: c.textMid }]}>
                  {selectedCategory?.name} — {selectedServiceType?.name}
                </ThemedText>

                <View style={wizStyles.field}>
                  <ThemedText style={[wizStyles.fieldLabel, { color: c.text }]}>Describe the job</ThemedText>
                  <ThemedTextInput
                    style={{ minHeight: 110, paddingTop: 14 }}
                    placeholder="e.g. Fix a leaky tap under the kitchen sink…"
                    value={description}
                    onChangeText={(t) => { if (t.length <= 500) setDescription(t); }}
                    multiline
                    textAlignVertical="top"
                    inputAccessoryViewID={Platform.OS === "ios" ? KEYBOARD_DONE_ID : undefined}
                  />
                  <ThemedText style={{ fontSize: 11, color: c.textMuted, textAlign: "right", marginTop: 4 }}>
                    {description.length}/500
                  </ThemedText>
                </View>

                <View style={wizStyles.field}>
                  <ThemedText style={[wizStyles.fieldLabel, { color: c.text }]}>Property type</ThemedText>
                  <Pressable
                    style={[wizStyles.dropdown, { backgroundColor: c.elevate, borderColor: c.border }]}
                    onPress={() => setShowPropertyDropdown(!showPropertyDropdown)}
                  >
                    <ThemedText style={{ color: selectedPropertyType ? c.text : c.textMuted, fontSize: 15 }}>
                      {selectedPropertyType?.name || "Select property type"}
                    </ThemedText>
                    <Ionicons
                      name={showPropertyDropdown ? "chevron-up" : "chevron-down"}
                      size={18}
                      color={c.textMuted}
                    />
                  </Pressable>
                  {showPropertyDropdown && (
                    <View style={[wizStyles.dropdownMenu, { backgroundColor: c.elevate, borderColor: c.border }]}>
                      {propertyTypes.map((pt) => (
                        <Pressable
                          key={pt.id}
                          style={({ pressed }) => [wizStyles.dropdownItem, pressed && { backgroundColor: c.elevate2 }]}
                          onPress={() => { setSelectedPropertyType(pt); setShowPropertyDropdown(false); }}
                        >
                          <ThemedText style={{ color: c.text, fontSize: 15 }}>{pt.name}</ThemedText>
                          {selectedPropertyType?.id === pt.id && (
                            <Ionicons name="checkmark" size={18} color={Colors.primary} />
                          )}
                        </Pressable>
                      ))}
                    </View>
                  )}
                </View>

                <View style={wizStyles.field}>
                  <ThemedText style={[wizStyles.fieldLabel, { color: c.text }]}>
                    Your postcode <ThemedText style={{ color: Colors.status.declined }}>*</ThemedText>
                  </ThemedText>
                  <ThemedTextInput
                    placeholder="e.g. EH48 3NN"
                    value={postcode}
                    onChangeText={(t) => setPostcode(t.toUpperCase())}
                    autoCapitalize="characters"
                    maxLength={10}
                  />
                </View>

                <View style={wizStyles.field}>
                  <ThemedText style={[wizStyles.fieldLabel, { color: c.text }]}>Budget</ThemedText>
                  <View style={{ gap: 8 }}>
                    {BUDGET_OPTIONS.map((option) => {
                      const on = selectedBudget?.id === option.id;
                      return (
                        <Pressable
                          key={option.id}
                          onPress={() => setSelectedBudget(option)}
                          style={({ pressed }) => [
                            wizStyles.radioRow,
                            { backgroundColor: c.elevate, borderColor: on ? Colors.primary : c.border, borderWidth: on ? 2 : 1 },
                            pressed && { backgroundColor: c.elevate2 },
                          ]}
                        >
                          <View style={[wizStyles.radioOuter, { borderColor: on ? Colors.primary : c.borderStrong }]}>
                            {on ? <View style={wizStyles.radioInner} /> : null}
                          </View>
                          <ThemedText style={{ color: c.text, fontSize: 15 }}>{option.label}</ThemedText>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>

                <View style={wizStyles.field}>
                  <ThemedText style={[wizStyles.fieldLabel, { color: c.text }]}>
                    When do you need this done?
                  </ThemedText>
                  <View style={{ gap: 8 }}>
                    {timingOptions.map((opt) => {
                      const on = selectedTiming?.id === opt.id;
                      return (
                        <Pressable
                          key={opt.id}
                          onPress={() => setSelectedTiming(opt)}
                          style={({ pressed }) => [
                            wizStyles.radioRow,
                            { backgroundColor: c.elevate, borderColor: on ? Colors.primary : c.border, borderWidth: on ? 2 : 1 },
                            pressed && { backgroundColor: c.elevate2 },
                          ]}
                        >
                          <View style={[wizStyles.radioOuter, { borderColor: on ? Colors.primary : c.borderStrong }]}>
                            {on ? <View style={wizStyles.radioInner} /> : null}
                          </View>
                          <ThemedText style={{ color: opt.is_emergency ? Colors.status.declined : c.text, fontSize: 15 }}>
                            {opt.name}
                          </ThemedText>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>

                <View style={wizStyles.field}>
                  <ThemedText style={[wizStyles.fieldLabel, { color: c.text }]}>
                    Photos <ThemedText style={{ color: c.textMuted, fontWeight: "400" }}>(optional)</ThemedText>
                  </ThemedText>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                    <View style={{ flexDirection: "row", gap: 10 }}>
                      {photos.map((p, i) => (
                        <PhotoUploadThumbnail
                          key={p.id}
                          photo={p}
                          index={i}
                          onRemove={removePhoto}
                          onPress={(idx) => setViewer({ open: true, index: idx })}
                          onRetry={(idx) => retryUpload(photos[idx]?.id)}
                        />
                      ))}
                      {photos.length < 5 && (
                        <Pressable
                          onPress={pickFromLibrary}
                          style={[wizStyles.addPhotoCell, { backgroundColor: c.elevate2, borderColor: c.border }]}
                        >
                          <Ionicons name="add" size={26} color={c.textMid} />
                          <ThemedText style={{ fontSize: 11, color: c.textMid, marginTop: 2 }}>Add</ThemedText>
                        </Pressable>
                      )}
                    </View>
                  </ScrollView>
                  {photos.length > 0 && (
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 8 }}>
                      {arePhotosReady() ? (
                        <>
                          <Ionicons name="checkmark-circle" size={15} color={Colors.status.accepted} />
                          <ThemedText style={{ fontSize: 12, color: c.textMid }}>
                            {photos.length} photo{photos.length !== 1 ? "s" : ""} ready
                          </ThemedText>
                        </>
                      ) : (
                        <>
                          <ActivityIndicator size="small" color={Colors.primary} />
                          <ThemedText style={{ fontSize: 12, color: c.textMid }}>
                            Uploading {getUploadingCount()} photo{getUploadingCount() !== 1 ? "s" : ""}…
                          </ThemedText>
                        </>
                      )}
                    </View>
                  )}
                </View>
              </>
            )}

            {/* ── Step 4 · Review ───────────────────────── */}
            {requestStep === 4 && (
              <>
                <ThemedText style={[wizStyles.title, { color: c.text }]}>Ready to send</ThemedText>
                <ThemedText style={[wizStyles.subtitle, { color: c.textMid }]}>
                  Check everything before the trade gets this.
                </ThemedText>
                <View style={[wizStyles.reviewCard, { backgroundColor: c.elevate, borderColor: c.border }]}>
                  <ReviewRow icon="business-outline" label="BUSINESS" value={tradeName} />
                  <ReviewRow icon="construct-outline" label="SERVICE"
                    value={`${selectedCategory?.name} · ${selectedServiceType?.name}`}
                    onEdit={() => setRequestStep(2)} />
                  <ReviewRow icon="document-text-outline" label="DETAILS"
                    value={description?.trim() || "No description"}
                    onEdit={() => setRequestStep(3)} />
                  <ReviewRow icon="home-outline" label="PROPERTY"
                    value={selectedPropertyType?.name || "Not specified"}
                    onEdit={() => setRequestStep(3)} />
                  <ReviewRow icon="location-outline" label="POSTCODE"
                    value={postcode?.trim() || "Not specified"}
                    onEdit={() => setRequestStep(3)} />
                  <ReviewRow icon="cash-outline" label="BUDGET"
                    value={selectedBudget?.label || "Not specified"}
                    onEdit={() => setRequestStep(3)} />
                  <ReviewRow icon="time-outline" label="TIMING"
                    value={selectedTiming?.name || "Not specified"}
                    isEmergency={selectedTiming?.is_emergency}
                    onEdit={() => setRequestStep(3)} />
                  <View style={wizStyles.reviewSection}>
                    <View style={wizStyles.reviewLabelRow}>
                      <Ionicons name="images-outline" size={16} color={c.textMid} />
                      <ThemedText style={[wizStyles.reviewLabel, { color: c.textMid }]}>PHOTOS</ThemedText>
                    </View>
                    <View style={wizStyles.reviewPhotos}>
                      {photos.length > 0 ? photos.map((p, i) => (
                        <Image key={i} source={{ uri: p.uri }} style={wizStyles.reviewPhotoThumb} />
                      )) : (
                        <ThemedText style={{ color: c.text, fontSize: 15 }}>No photos added</ThemedText>
                      )}
                    </View>
                    <Pressable onPress={() => setRequestStep(3)} style={wizStyles.reviewEditBtn}>
                      <ThemedText style={{ fontSize: 14, color: Colors.primary, fontFamily: FontFamily.headerSemibold }}>Edit</ThemedText>
                    </Pressable>
                  </View>
                </View>
                <ThemedText style={{ fontSize: 12, color: c.textMuted, textAlign: "center", marginTop: 14, paddingHorizontal: 16 }}>
                  By sending, you agree to receive a quote from this tradesperson.
                </ThemedText>
              </>
            )}
          </ScrollView>

          {/* Sticky bottom dock — only on step 3 (Continue) and 4 (Send). */}
          {(requestStep === 3 || requestStep === 4) && (
            <View
              style={[
                wizStyles.dock,
                {
                  backgroundColor: c.background,
                  borderTopColor: c.border,
                  paddingBottom: (insets.bottom || 8) + 10,
                },
              ]}
            >
              <Pressable
                onPress={() => {
                  if (requestStep === 3) {
                    if (description?.trim() && postcode?.trim() && selectedBudget && selectedTiming) {
                      setRequestStep(4);
                    }
                  } else if (requestStep === 4) {
                    checkServiceAreaBeforeSubmit();
                  }
                }}
                disabled={(() => {
                  if (requestStep === 3) {
                    return !(description?.trim() && postcode?.trim() && selectedBudget && selectedTiming);
                  }
                  return submitting || checkingServiceArea || (photos.length > 0 && !arePhotosReady());
                })()}
                style={({ pressed }) => [
                  wizStyles.dockBtn,
                  { backgroundColor: Colors.primary },
                  pressed && { opacity: 0.85 },
                  (() => {
                    if (requestStep === 3 && !(description?.trim() && postcode?.trim() && selectedBudget && selectedTiming))
                      return { opacity: 0.45 };
                    if (requestStep === 4 && (submitting || checkingServiceArea || (photos.length > 0 && !arePhotosReady())))
                      return { opacity: 0.6 };
                    return null;
                  })(),
                ]}
              >
                <ThemedText style={{ fontSize: 15, fontFamily: FontFamily.headerSemibold, color: "#FFFFFF", letterSpacing: -0.1 }}>
                  {requestStep === 4
                    ? checkingServiceArea ? "Checking area…"
                      : submitting ? "Sending…"
                      : photos.length > 0 && !arePhotosReady()
                      ? `Waiting for uploads (${getUploadingCount()})…`
                      : "Send request"
                    : "Continue"}
                </ThemedText>
              </Pressable>
            </View>
          )}
        </KeyboardAvoidingView>
      </ThemedView>

      {/* Image Viewer */}
      <ImageViewing
        images={imageViewerImages}
        imageIndex={viewer.index}
        visible={viewer.open && photos.length > 0}
        onRequestClose={() => setViewer({ open: false, index: 0 })}
        swipeToCloseEnabled
        doubleTapToZoomEnabled
      />

      {/* Service area warning */}
      <Modal
        visible={showServiceAreaWarning}
        animationType="fade"
        transparent
        onRequestClose={() => setShowServiceAreaWarning(false)}
      >
        <View style={wizStyles.warnOverlay}>
          <View style={[wizStyles.warnContent, { backgroundColor: c.elevate }]}>
            <View style={[wizStyles.warnIcon, { backgroundColor: c.elevate2 }]}>
              <Ionicons name="location-outline" size={32} color={Colors.status.pending} />
            </View>
            <ThemedText style={[wizStyles.warnTitle, { color: c.text }]}>Outside Service Area</ThemedText>
            <ThemedText style={[wizStyles.warnText, { color: c.textMid }]}>
              You're {serviceAreaInfo?.distanceMiles || "?"} miles away — this trade's usual area is {serviceAreaInfo?.serviceRadiusMiles || "?"} miles.
              They may decline. Send anyway?
            </ThemedText>
            <View style={{ flexDirection: "row", gap: 12, marginTop: 18 }}>
              <Pressable
                onPress={() => setShowServiceAreaWarning(false)}
                style={[wizStyles.warnBtn, { backgroundColor: c.elevate2 }]}
              >
                <ThemedText style={{ color: c.text, fontFamily: FontFamily.headerSemibold }}>Cancel</ThemedText>
              </Pressable>
              <Pressable
                onPress={() => submitDirectRequest(true)}
                style={[wizStyles.warnBtn, { backgroundColor: Colors.primary }]}
              >
                <ThemedText style={{ color: "#FFFFFF", fontFamily: FontFamily.headerSemibold }}>Send anyway</ThemedText>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </Modal>
  );
}

// Local row used by the review step.
function ReviewRow({ icon, label, value, isEmergency, onEdit }) {
  const { colors: c } = useTheme();
  const valueColor = isEmergency ? Colors.status.declined : c.text;
  return (
    <View style={wizStyles.reviewSection}>
      <View style={wizStyles.reviewLabelRow}>
        <Ionicons name={icon} size={16} color={isEmergency ? Colors.status.declined : c.textMid} />
        <ThemedText style={[wizStyles.reviewLabel, { color: isEmergency ? Colors.status.declined : c.textMid }]}>
          {label}
        </ThemedText>
      </View>
      <ThemedText style={[wizStyles.reviewValue, { color: valueColor }]} numberOfLines={2}>
        {value}
      </ThemedText>
      {onEdit && (
        <Pressable onPress={onEdit} style={wizStyles.reviewEditBtn}>
          <ThemedText style={{ fontSize: 14, color: Colors.primary, fontFamily: FontFamily.headerSemibold }}>
            Edit
          </ThemedText>
        </Pressable>
      )}
    </View>
  );
}

const wizStyles = StyleSheet.create({
  title: {
    fontFamily: FontFamily.headerBold,
    fontSize: 24,
    letterSpacing: -0.4,
    lineHeight: 28,
  },
  subtitle: {
    fontFamily: FontFamily.bodyRegular,
    fontSize: 14,
    marginTop: 6,
    marginBottom: 20,
    lineHeight: 20,
  },
  tileGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginHorizontal: -6,
  },
  tileCell: {
    width: "33.333%",
    paddingHorizontal: 6,
    marginBottom: 12,
  },
  field: { marginBottom: 20 },
  fieldLabel: {
    fontFamily: FontFamily.headerSemibold,
    fontSize: 13,
    marginBottom: 8,
    letterSpacing: -0.1,
  },
  radioRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderRadius: Radius.md + 2,
  },
  radioOuter: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  radioInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: Colors.primary,
  },
  dropdown: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderRadius: Radius.md,
    borderWidth: 1,
  },
  dropdownMenu: {
    marginTop: 6,
    borderRadius: Radius.md,
    borderWidth: 1,
    overflow: "hidden",
  },
  dropdownItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  addPhotoCell: {
    width: 76,
    height: 76,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderStyle: "dashed",
    alignItems: "center",
    justifyContent: "center",
  },
  reviewCard: {
    borderRadius: Radius.lg,
    borderWidth: 1,
    padding: 4,
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
    fontFamily: FontFamily.headerBold,
    letterSpacing: 0.5,
  },
  reviewValue: {
    fontSize: 15,
    lineHeight: 21,
    paddingRight: 40,
    fontFamily: FontFamily.bodyRegular,
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
  },
  reviewEditBtn: {
    position: "absolute",
    right: 16,
    top: 16,
  },
  dock: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 20,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  dockBtn: {
    height: 52,
    borderRadius: Radius.lg - 2,
    alignItems: "center",
    justifyContent: "center",
  },
  warnOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
  },
  warnContent: {
    width: "100%",
    maxWidth: 380,
    borderRadius: Radius.lg,
    padding: 24,
    alignItems: "center",
  },
  warnIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 14,
  },
  warnTitle: {
    fontFamily: FontFamily.headerBold,
    fontSize: 18,
    marginBottom: 8,
    letterSpacing: -0.3,
  },
  warnText: {
    fontFamily: FontFamily.bodyRegular,
    fontSize: 14,
    textAlign: "center",
    lineHeight: 20,
  },
  warnBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: Radius.md + 2,
    alignItems: "center",
  },
});
