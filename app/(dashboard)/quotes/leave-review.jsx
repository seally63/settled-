// app/(dashboard)/quotes/leave-review.jsx
// Leave a review screen - trade reviews client
import { useState } from "react";
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
  Modal,
  ActivityIndicator,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as ImagePicker from "expo-image-picker";
import ImageViewing from "react-native-image-viewing";

import ThemedView from "../../../components/ThemedView";
import ThemedText from "../../../components/ThemedText";
import Spacer from "../../../components/Spacer";
import { Colors } from "../../../constants/Colors";
import { supabase } from "../../../lib/supabase";

const PRIMARY = Colors?.light?.tint || "#6849a7";
const STAR_COLOR = "#F59E0B";

const RATING_LABELS = {
  1: "Terrible",
  2: "Poor",
  3: "Okay",
  4: "Great",
  5: "Excellent",
};

export default function LeaveReview() {
  const params = useLocalSearchParams();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const quoteId = params.quoteId;
  const revieweeName = params.revieweeName || "Client";
  const revieweeType = params.revieweeType || "client"; // "trade" or "client"
  const clientPhotoUrl = params.clientPhotoUrl || "";
  const jobTitle = params.jobTitle || "";

  const [rating, setRating] = useState(0);
  const [reviewText, setReviewText] = useState("");
  const [photos, setPhotos] = useState([]); // Array of { uri, uploading }
  const [busy, setBusy] = useState(false);

  // Full-screen image viewer
  const [viewer, setViewer] = useState({ open: false, index: 0 });

  // Upload overlay state
  const [uploading, setUploading] = useState(false);
  const [uploadIdx, setUploadIdx] = useState(0);
  const [uploadTotal, setUploadTotal] = useState(0);

  // Get initials for avatar placeholder
  const getInitials = (name) => {
    if (!name) return "?";
    return name.substring(0, 2).toUpperCase();
  };

  // Pick images from gallery
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

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsMultipleSelection: true,
      selectionLimit: 5 - photos.length,
      quality: 0.8,
    });

    if (!result.canceled && result.assets) {
      const newPhotos = result.assets.map((asset) => ({
        uri: asset.uri,
        uploading: false,
      }));
      setPhotos((prev) => [...prev, ...newPhotos].slice(0, 5));
    }
  };

  // Remove a photo
  const removePhoto = (index) => {
    setPhotos((prev) => prev.filter((_, i) => i !== index));
  };

  // Upload photos to storage and return URLs
  const uploadPhotos = async () => {
    const uploadedUrls = [];
    setUploadTotal(photos.length);
    setUploadIdx(0);
    setUploading(true);

    for (let i = 0; i < photos.length; i++) {
      const photo = photos[i];
      setUploadIdx(i + 1);

      try {
        const filename = `review_${quoteId}_${Date.now()}_${Math.random().toString(36).substring(7)}.jpg`;
        const path = `reviews/${filename}`;

        // Fetch the image as blob
        const response = await fetch(photo.uri);
        const blob = await response.blob();

        // Convert blob to ArrayBuffer for upload
        const arrayBuffer = await new Response(blob).arrayBuffer();

        const { data, error } = await supabase.storage
          .from("review-photos")
          .upload(path, arrayBuffer, {
            contentType: "image/jpeg",
            upsert: false,
          });

        if (error) {
          console.error("Photo upload error:", error);
          continue;
        }

        // Get public URL
        const { data: urlData } = supabase.storage
          .from("review-photos")
          .getPublicUrl(path);

        if (urlData?.publicUrl) {
          uploadedUrls.push(urlData.publicUrl);
        }
      } catch (err) {
        console.error("Error uploading photo:", err);
      }
    }

    setUploading(false);
    return uploadedUrls;
  };

  // Submit review
  const submitReview = async () => {
    if (rating === 0) {
      Alert.alert("Required", "Please select a star rating.");
      return;
    }

    try {
      setBusy(true);

      // Upload photos first (if any)
      let photoUrls = [];
      if (photos.length > 0) {
        photoUrls = await uploadPhotos();
      }

      const { error } = await supabase.rpc("rpc_submit_review", {
        p_quote_id: quoteId,
        p_rating: rating,
        p_content: reviewText.trim() || null,
        p_reviewee_type: revieweeType,
        p_photos: photoUrls,
      });

      if (error) throw error;

      // Navigate to success screen
      router.replace({
        pathname: "/(dashboard)/quotes/review-success",
        params: { returnTo: "quotes" },
      });
    } catch (err) {
      console.error("Error submitting review:", err);
      Alert.alert("Error", err.message || "Could not submit review.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <ThemedView style={styles.container}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <Pressable onPress={() => router.back()} hitSlop={10}>
          <Ionicons name="chevron-back" size={24} color="#111827" />
        </Pressable>
        <ThemedText style={styles.headerTitle}>Leave a review</ThemedText>
        <View style={{ width: 24 }} />
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView
          contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Client Card */}
          <View style={styles.revieweeCard}>
            {clientPhotoUrl ? (
              <Image source={{ uri: clientPhotoUrl }} style={styles.avatar} />
            ) : (
              <View style={styles.avatarPlaceholder}>
                <ThemedText style={styles.avatarText}>
                  {getInitials(revieweeName)}
                </ThemedText>
              </View>
            )}
            <ThemedText style={styles.revieweeName}>{revieweeName}</ThemedText>
            {jobTitle ? (
              <ThemedText style={styles.jobTitle}>{jobTitle}</ThemedText>
            ) : null}
          </View>

          <Spacer size={24} />

          {/* Rating Question */}
          <ThemedText style={styles.questionText}>
            How was working with {revieweeName}?
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
            <ThemedText style={styles.ratingLabel}>
              {RATING_LABELS[rating]}
            </ThemedText>
          )}

          <Spacer size={32} />

          {/* Review Text */}
          <ThemedText style={styles.inputLabel}>Write a review</ThemedText>
          <TextInput
            style={styles.textInput}
            value={reviewText}
            onChangeText={setReviewText}
            placeholder="Tell others about your experience..."
            placeholderTextColor="#9CA3AF"
            multiline
            numberOfLines={5}
            textAlignVertical="top"
            editable={!busy}
          />

          <Spacer size={24} />

          {/* Photo Upload */}
          <ThemedText style={styles.inputLabel}>Add photos (optional)</ThemedText>
          <Spacer size={8} />
          <View style={styles.photosContainer}>
            {photos.map((photo, index) => (
              <Pressable
                key={index}
                style={styles.photoWrapper}
                onPress={() => setViewer({ open: true, index })}
              >
                <Image source={{ uri: photo.uri }} style={styles.photoPreview} />
                <Pressable
                  style={styles.removePhotoBtn}
                  onPress={(e) => {
                    e.stopPropagation();
                    removePhoto(index);
                  }}
                  hitSlop={8}
                >
                  <Ionicons name="close-circle" size={24} color="#EF4444" />
                </Pressable>
              </Pressable>
            ))}
            {photos.length < 5 && (
              <Pressable style={styles.addPhotoBtn} onPress={pickImages}>
                <Ionicons name="add" size={32} color="#6B7280" />
                <ThemedText style={styles.addPhotoText}>Add</ThemedText>
              </Pressable>
            )}
          </View>
          <ThemedText style={styles.photoCountText}>
            {photos.length > 0 ? `${photos.length} of 5 photos · Tap to preview` : "Up to 5 photos"}
          </ThemedText>

          <Spacer size={32} />

          {/* Submit Button */}
          <Pressable
            style={[styles.submitBtn, (rating === 0 || busy) && styles.btnDisabled]}
            onPress={submitReview}
            disabled={rating === 0 || busy}
          >
            <ThemedText style={styles.submitBtnText}>
              {busy ? "Submitting..." : "Submit review"}
            </ThemedText>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Full-screen Image Viewer */}
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

      {/* Upload Overlay */}
      {(uploading || busy) && (
        <Modal
          visible
          transparent
          animationType="fade"
          statusBarTranslucent
          onRequestClose={() => {}}
        >
          <View style={styles.uploadBackdrop}>
            <View style={styles.uploadCard}>
              <ActivityIndicator size="large" color={PRIMARY} />
              <ThemedText style={styles.uploadTitle}>
                {uploading ? "Uploading photos..." : "Submitting review..."}
              </ThemedText>
              {uploading && uploadTotal > 0 && (
                <>
                  <ThemedText style={styles.uploadSub}>
                    {uploadIdx} of {uploadTotal}
                  </ThemedText>
                  <View style={styles.uploadBar}>
                    <View
                      style={[
                        styles.uploadFill,
                        { width: `${Math.round((uploadIdx / uploadTotal) * 100)}%` },
                      ]}
                    />
                  </View>
                </>
              )}
            </View>
          </View>
        </Modal>
      )}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#FFFFFF",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingBottom: 16,
    backgroundColor: "#FFFFFF",
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#111827",
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 8,
  },
  revieweeCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 20,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#E5E7EB",
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
    backgroundColor: "#E5E7EB",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  avatarText: {
    fontSize: 20,
    fontWeight: "600",
    color: "#6B7280",
  },
  revieweeName: {
    fontSize: 18,
    fontWeight: "600",
    color: "#111827",
  },
  jobTitle: {
    fontSize: 14,
    color: "#6B7280",
    marginTop: 4,
  },
  questionText: {
    fontSize: 18,
    fontWeight: "600",
    color: "#111827",
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
    fontSize: 16,
    fontWeight: "500",
    color: "#6B7280",
    textAlign: "center",
    marginTop: 12,
  },
  inputLabel: {
    fontSize: 16,
    fontWeight: "600",
    color: "#111827",
    marginBottom: 8,
  },
  textInput: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    fontSize: 15,
    color: "#111827",
    minHeight: 120,
  },
  photosContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  photoWrapper: {
    position: "relative",
  },
  photoPreview: {
    width: 80,
    height: 80,
    borderRadius: 12,
  },
  removePhotoBtn: {
    position: "absolute",
    top: -8,
    right: -8,
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
  },
  addPhotoBtn: {
    width: 80,
    height: 80,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: "#E5E7EB",
    borderStyle: "dashed",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F9FAFB",
  },
  addPhotoText: {
    fontSize: 12,
    color: "#6B7280",
    marginTop: 2,
  },
  photoCountText: {
    fontSize: 13,
    color: "#6B7280",
    marginTop: 8,
  },
  submitBtn: {
    backgroundColor: PRIMARY,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  submitBtnText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#FFFFFF",
  },
  btnDisabled: {
    opacity: 0.7,
  },
  // Image viewer styles
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
    fontSize: 15,
    fontWeight: "600",
  },
  // Upload overlay styles
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
    paddingVertical: 24,
    paddingHorizontal: 20,
    backgroundColor: "#fff",
    alignItems: "center",
  },
  uploadTitle: {
    marginTop: 16,
    fontWeight: "600",
    fontSize: 17,
    color: "#111827",
  },
  uploadSub: {
    marginTop: 8,
    fontSize: 14,
    color: "#6B7280",
  },
  uploadBar: {
    marginTop: 16,
    width: "100%",
    height: 6,
    borderRadius: 3,
    backgroundColor: "rgba(0,0,0,0.08)",
    overflow: "hidden",
  },
  uploadFill: {
    height: 6,
    borderRadius: 3,
    backgroundColor: PRIMARY,
  },
});
