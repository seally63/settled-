// app/(dashboard)/client/myquotes/leave-review.jsx
// Leave a review screen - client reviews trade
//
// Photo flow mirrors the request-form (clienthome) flow exactly:
//   · Each picked photo gets its own per-thumbnail state.
//   · Thumbnails upload progressively to the `review-photos` bucket
//     as soon as they're picked — no full-screen modal blocking the
//     screen during upload.
//   · `PhotoUploadThumbnail` renders inline status badges + a
//     bottom progress bar on each tile while it uploads, so the UX
//     reads identically to the quote-request form.
import { useState, useRef, useEffect } from "react";
import {
  StyleSheet,
  View,
  ScrollView,
  Pressable,
  Alert,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Image,
  ActivityIndicator,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as ImagePicker from "expo-image-picker";
import * as ImageManipulator from "expo-image-manipulator";
import ImageViewing from "react-native-image-viewing";

import ThemedView from "../../../../components/ThemedView";
import ThemedText from "../../../../components/ThemedText";
import Spacer from "../../../../components/Spacer";
import PhotoUploadThumbnail from "../../../../components/PhotoUploadThumbnail";
import { KeyboardDoneButton, KEYBOARD_DONE_ID } from "../../../../components/KeyboardDoneButton";
import { Colors } from "../../../../constants/Colors";
import { TypeVariants, FontFamily } from "../../../../constants/Typography";
import { useTheme } from "../../../../hooks/useTheme";
import { supabase } from "../../../../lib/supabase";
// Single-photo helper that mirrors `uploadTempImage` for the
// request-form flow — milestone progress callbacks (10/30/100) so
// each thumbnail can render its own progress bar inline.
import { uploadSingleReviewImage } from "../../../../lib/api/attachments";

// Brand purple for the primary submit CTA. Stays consistent across modes.
const PRIMARY = Colors.primary;
// Amber star — semantic across both modes.
const STAR_COLOR = "#F59E0B";

// Process a single image - resize to a reasonable size before upload.
// Returns a uri (or the original on failure).
async function makeThumbnail(uri) {
  try {
    const { uri: processedUri } = await ImageManipulator.manipulateAsync(
      uri,
      [{ resize: { width: 1200 } }],
      {
        compress: 0.8,
        format: ImageManipulator.SaveFormat.JPEG,
        base64: false, // base64 encoding here freezes the JS thread
      }
    );
    return processedUri;
  } catch (e) {
    console.warn("makeThumbnail error:", e);
    return uri; // best-effort fallback
  }
}

const RATING_LABELS = {
  1: "Terrible",
  2: "Poor",
  3: "Okay",
  4: "Great",
  5: "Excellent",
};

// Generate a small client-only id for tracking each thumbnail through
// its lifecycle. Doesn't need to be globally unique — just stable
// across re-renders inside this component.
function newPhotoId() {
  return `p_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
}

export default function LeaveReview() {
  const params = useLocalSearchParams();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors: c } = useTheme();

  const quoteId = params.quoteId;
  const revieweeName = params.revieweeName || "User";
  const revieweeType = params.revieweeType || "trade"; // "trade" or "client"
  const tradePhotoUrl = params.tradePhotoUrl || "";
  const jobTitle = params.jobTitle || "";

  const [rating, setRating] = useState(0);
  const [reviewText, setReviewText] = useState("");
  // Per-thumbnail state. Each entry:
  //   { id, uri, status, progress, url, error }
  // status: "optimizing" | "uploading" | "uploaded" | "error" | "retrying"
  const [photos, setPhotos] = useState([]);
  const [busy, setBusy] = useState(false);

  // Full-screen image viewer
  const [viewer, setViewer] = useState({ open: false, index: 0 });

  // Mount tracking — guards against setState after unmount when a
  // background upload finishes after the user navigates away.
  const isMountedRef = useRef(true);
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // ScrollView ref for keyboard handling
  const scrollViewRef = useRef(null);

  // Scroll to input when focused
  const handleInputFocus = (yOffset) => {
    setTimeout(() => {
      scrollViewRef.current?.scrollTo({ y: yOffset, animated: true });
    }, 300);
  };

  // ===== Photo handling — Progressive upload =====

  // Update a single photo entry by id, no-op if it's already gone.
  const updatePhoto = (photoId, patch) => {
    if (!isMountedRef.current) return;
    setPhotos((prev) =>
      prev.map((p) => (p.id === photoId ? { ...p, ...patch } : p))
    );
  };

  // Optimise + upload a single photo. Sets the entry's status as it
  // goes, so the per-thumbnail progress badge stays in sync.
  const optimiseAndUpload = async (photoId, originalUri) => {
    // Optimise (resize + compress) — matches the request form's pre-upload step.
    updatePhoto(photoId, { status: "optimizing", progress: 0 });
    const optimisedUri = await makeThumbnail(originalUri);
    if (!isMountedRef.current) return;
    updatePhoto(photoId, { uri: optimisedUri, status: "uploading", progress: 0 });

    // Upload — same milestone progress contract as `uploadTempImage`.
    const result = await uploadSingleReviewImage(
      quoteId,
      { uri: optimisedUri },
      (progress) => updatePhoto(photoId, { progress })
    );

    if (!isMountedRef.current) return;

    if (result.success) {
      updatePhoto(photoId, {
        status: "uploaded",
        progress: 100,
        url: result.url || null,
        error: null,
      });
    } else {
      updatePhoto(photoId, {
        status: "error",
        error: result.error || "Upload failed",
      });
    }
  };

  // Retry a failed thumbnail.
  const retryUpload = (index) => {
    const photo = photos[index];
    if (!photo) return;
    optimiseAndUpload(photo.id, photo.uri);
  };

  // Pick photos — appends optimistic entries and kicks off uploads
  // for each one in parallel. Tab bar / submit button stay reachable
  // while uploads run in the background.
  const pickImages = async () => {
    if (photos.length >= 5) {
      Alert.alert("Limit reached", "You can add up to 5 photos.");
      return;
    }

    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Permission required", "Please allow access to your photos.");
      return;
    }

    const remaining = 5 - photos.length;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsMultipleSelection: true,
      selectionLimit: remaining,
      quality: 0.8,
    });

    if (result.canceled) return;

    const newAssets = (result.assets || []).slice(0, remaining);
    if (!newAssets.length) return;

    // Append optimistic entries, then fire each upload.
    const queued = newAssets.map((a) => ({
      id: newPhotoId(),
      uri: a.uri,
      status: "optimizing",
      progress: 0,
      url: null,
      error: null,
    }));

    setPhotos((prev) => [...prev, ...queued].slice(0, 5));

    queued.forEach((p) => {
      optimiseAndUpload(p.id, p.uri);
    });
  };

  // Remove a photo (no orphan cleanup yet — the bucket auto-expires
  // tmp uploads via lifecycle policy if configured. For now we
  // accept a small leak when a user removes a photo before submit).
  const removePhoto = (index) => {
    setPhotos((prev) => prev.filter((_, i) => i !== index));
  };

  // Submit-button gating helpers.
  const uploadingCount = photos.filter((p) =>
    ["pending", "optimizing", "uploading", "retrying"].includes(p.status)
  ).length;
  const arePhotosReady = uploadingCount === 0;
  const hasErrors = photos.some((p) => p.status === "error");

  // Submit review
  const submitReview = async () => {
    if (rating === 0) {
      Alert.alert("Required", "Please select a star rating.");
      return;
    }
    if (!arePhotosReady) {
      Alert.alert("Hold on", "Wait for your photos to finish uploading.");
      return;
    }

    try {
      setBusy(true);

      // Photos are already uploaded; just collect the URLs.
      const photoUrls = photos
        .filter((p) => p.status === "uploaded" && p.url)
        .map((p) => p.url);

      const { error } = await supabase.rpc("rpc_submit_review", {
        p_quote_id: quoteId,
        p_rating: rating,
        p_content: reviewText.trim() || null,
        p_reviewer_type: revieweeType === "trade" ? "client" : "trade",
        p_photos: photoUrls,
      });

      if (error) throw error;

      // Navigate to success screen
      router.replace({
        pathname: "/(dashboard)/myquotes/review-success",
        params: { returnTo: "projects" },
      });
    } catch (err) {
      console.error("Error submitting review:", err);
      Alert.alert("Error", err.message || "Could not submit review.");
    } finally {
      setBusy(false);
    }
  };

  // Get initials for avatar placeholder
  const getInitials = (name) => {
    if (!name) return "?";
    return name.substring(0, 2).toUpperCase();
  };

  return (
    <ThemedView style={styles.container}>
      {/* Header */}
      <View
        style={[
          styles.header,
          { paddingTop: insets.top + 12, borderBottomColor: c.border },
        ]}
      >
        <Pressable onPress={() => router.back()} hitSlop={10}>
          <Ionicons name="chevron-back" size={24} color={c.text} />
        </Pressable>
        <ThemedText style={[styles.headerTitle, { color: c.text }]}>
          Leave a review
        </ThemedText>
        <View style={{ width: 24 }} />
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView
          ref={scrollViewRef}
          // Generous bottom padding so the Submit button is never
          // pinned against the home indicator / floating tab bar.
          contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 96 }]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
        >
          {/* Trade/User Card */}
          <View
            style={[
              styles.revieweeCard,
              { backgroundColor: c.elevate, borderColor: c.border },
            ]}
          >
            {tradePhotoUrl ? (
              <Image source={{ uri: tradePhotoUrl }} style={styles.avatar} />
            ) : (
              <View style={[styles.avatarPlaceholder, { backgroundColor: c.elevate2 }]}>
                <ThemedText style={[styles.avatarText, { color: c.textMid }]}>
                  {getInitials(revieweeName)}
                </ThemedText>
              </View>
            )}
            <ThemedText style={[styles.revieweeName, { color: c.text }]}>
              {revieweeName}
            </ThemedText>
            {jobTitle ? (
              <ThemedText style={[styles.jobTitle, { color: c.textMid }]}>
                {jobTitle}
              </ThemedText>
            ) : null}
          </View>

          <Spacer size={24} />

          {/* Rating Question */}
          <ThemedText style={[styles.questionText, { color: c.text }]}>
            {revieweeType === "trade"
              ? "How would you rate your experience?"
              : `How was working with ${revieweeName}?`}
          </ThemedText>

          <Spacer size={20} />

          {/* Star Rating */}
          <View style={styles.starsContainer}>
            {[1, 2, 3, 4, 5].map((star) => (
              <Pressable
                key={star}
                onPress={() => setRating(star)}
                style={styles.starBtn}
              >
                <Ionicons
                  name={star <= rating ? "star" : "star-outline"}
                  size={40}
                  color={STAR_COLOR}
                />
              </Pressable>
            ))}
          </View>

          {rating > 0 && (
            <ThemedText style={[styles.ratingLabel, { color: c.textMid }]}>
              {RATING_LABELS[rating]}
            </ThemedText>
          )}

          <Spacer size={32} />

          {/* Review Text */}
          <ThemedText style={[styles.inputLabel, { color: c.text }]}>
            Write a review
          </ThemedText>
          <TextInput
            style={[
              styles.textInput,
              { backgroundColor: c.elevate, borderColor: c.border, color: c.text },
            ]}
            value={reviewText}
            onChangeText={setReviewText}
            placeholder="Tell others about your experience..."
            placeholderTextColor={c.textMuted}
            multiline
            numberOfLines={5}
            textAlignVertical="top"
            editable={!busy}
            onFocus={() => handleInputFocus(280)}
            inputAccessoryViewID={Platform.OS === "ios" ? KEYBOARD_DONE_ID : undefined}
          />

          <Spacer size={24} />

          {/* Photo Upload — horizontal strip with inline progress per
              thumbnail, mirroring the request-form layout. */}
          <ThemedText style={[styles.inputLabel, { color: c.text }]}>
            Add photos (optional)
          </ThemedText>
          <Spacer size={8} />
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.photoScroll}
            contentContainerStyle={styles.photoScrollContent}
          >
            {photos.map((p, i) => (
              <PhotoUploadThumbnail
                key={p.id}
                photo={p}
                index={i}
                onRemove={removePhoto}
                onPress={(idx) => setViewer({ open: true, index: idx })}
                onRetry={retryUpload}
              />
            ))}
            {photos.length < 5 && (
              <Pressable
                style={[
                  styles.addPhotoCell,
                  { backgroundColor: c.elevate, borderColor: c.borderStrong },
                ]}
                onPress={pickImages}
              >
                <Ionicons name="add" size={28} color={c.textMid} />
                <ThemedText style={[styles.addPhotoText, { color: c.textMid }]}>
                  Add
                </ThemedText>
              </Pressable>
            )}
          </ScrollView>

          {/* Inline upload status — same row pattern as the request form. */}
          {photos.length > 0 && (
            <View style={styles.uploadStatusRow}>
              {arePhotosReady ? (
                <View style={styles.uploadStatusReady}>
                  <Ionicons name="checkmark-circle" size={16} color="#10B981" />
                  <ThemedText style={[styles.uploadStatusText, { color: c.textMid }]}>
                    {photos.length} photo{photos.length !== 1 ? "s" : ""} ready
                  </ThemedText>
                </View>
              ) : (
                <View style={styles.uploadStatusPending}>
                  <ActivityIndicator size="small" color={PRIMARY} />
                  <ThemedText style={[styles.uploadStatusText, { color: c.textMid }]}>
                    Uploading {uploadingCount} photo{uploadingCount !== 1 ? "s" : ""}…
                  </ThemedText>
                </View>
              )}
            </View>
          )}

          <Spacer size={32} />

          {/* Submit Button */}
          <Pressable
            style={[
              styles.submitBtn,
              (rating === 0 || busy || !arePhotosReady) && styles.btnDisabled,
            ]}
            onPress={submitReview}
            disabled={rating === 0 || busy || !arePhotosReady}
          >
            <ThemedText style={styles.submitBtnText}>
              {busy ? "Submitting…" : "Submit review"}
            </ThemedText>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Full-screen Image Viewer — only shows photos that have a uri
          (every photo has one optimistically). Tap delete to remove. */}
      <ImageViewing
        images={photos.map((p) => ({ uri: p.uri }))}
        imageIndex={viewer.index}
        visible={viewer.open}
        onRequestClose={() => setViewer({ open: false, index: 0 })}
        FooterComponent={({ imageIndex }) => (
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
                  setViewer((prev) => ({
                    ...prev,
                    index: Math.min(idx, remaining - 1),
                  }));
                }
              }}
            >
              <Ionicons name="trash-outline" size={20} color="#FFF" />
              <ThemedText style={styles.viewerDeleteText}>Delete</ThemedText>
            </Pressable>
          </View>
        )}
      />

      <KeyboardDoneButton />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    // bg handled by ThemedView default + theme.
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingBottom: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    // border + bg painted inline from theme.
  },
  headerTitle: {
    ...TypeVariants.bodyStrong,
    fontSize: 18,
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 8,
  },
  revieweeCard: {
    borderRadius: 16,
    padding: 20,
    alignItems: "center",
    borderWidth: 1,
    // bg + border painted inline from theme.
  },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    marginBottom: 12,
  },
  avatarPlaceholder: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
    // bg painted inline from theme.
  },
  avatarText: {
    fontFamily: FontFamily.headerSemibold,
    fontSize: 20,
    // color painted inline from theme.
  },
  revieweeName: {
    ...TypeVariants.bodyStrong,
    fontSize: 18,
  },
  jobTitle: {
    fontFamily: FontFamily.bodyRegular,
    fontSize: 14,
    marginTop: 4,
    // color painted inline from theme.
  },
  questionText: {
    ...TypeVariants.bodyStrong,
    fontSize: 18,
    textAlign: "center",
  },
  starsContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  starBtn: {
    padding: 4,
  },
  ratingLabel: {
    fontFamily: FontFamily.bodyMedium,
    fontSize: 16,
    textAlign: "center",
    marginTop: 12,
    // color painted inline from theme.
  },
  inputLabel: {
    ...TypeVariants.bodyStrong,
    fontSize: 16,
    marginBottom: 8,
  },
  textInput: {
    fontFamily: FontFamily.bodyRegular,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    fontSize: 15,
    minHeight: 120,
    // bg + border + text color painted inline from theme.
  },
  // Horizontal photo strip — matches the request-form layout.
  photoScroll: {
    flexGrow: 0,
  },
  photoScrollContent: {
    paddingVertical: 4,
    paddingRight: 4,
  },
  addPhotoCell: {
    width: 100,
    height: 100,
    borderRadius: 12,
    borderWidth: 2,
    borderStyle: "dashed",
    alignItems: "center",
    justifyContent: "center",
    // bg + border painted inline from theme.
  },
  addPhotoText: {
    fontFamily: FontFamily.bodyMedium,
    fontSize: 12,
    marginTop: 2,
    // color painted inline from theme.
  },
  uploadStatusRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 10,
  },
  uploadStatusReady: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  uploadStatusPending: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  uploadStatusText: {
    fontFamily: FontFamily.bodyMedium,
    fontSize: 13,
    // color painted inline from theme.
  },
  submitBtn: {
    backgroundColor: PRIMARY,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  submitBtnText: {
    fontFamily: FontFamily.headerSemibold,
    fontSize: 16,
    color: "#FFFFFF",
  },
  btnDisabled: {
    opacity: 0.7,
  },
  // Image viewer styles — viewer renders on a black backdrop, so the
  // copy here is intentionally white in both modes.
  viewerFooter: {
    alignItems: "center",
    paddingBottom: 40,
  },
  viewerDots: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 20,
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
  viewerDeleteBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 20,
    backgroundColor: "rgba(239,68,68,0.9)",
    borderRadius: 24,
  },
  viewerDeleteText: {
    color: "#FFF",
    fontFamily: FontFamily.headerSemibold,
    fontSize: 15,
  },
});
