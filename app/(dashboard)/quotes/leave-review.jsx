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
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import ThemedView from "../../../components/ThemedView";
import ThemedText from "../../../components/ThemedText";
import Spacer from "../../../components/Spacer";
import { Colors } from "../../../constants/Colors";
import { supabase } from "../../../lib/supabase";

const PRIMARY = Colors?.light?.tint || "#6849a7";
const STAR_COLOR = "#F59E0B";

export default function LeaveReview() {
  const params = useLocalSearchParams();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const quoteId = params.quoteId;
  const revieweeName = params.revieweeName || "Client";
  const revieweeType = params.revieweeType || "client"; // "trade" or "client"

  const [rating, setRating] = useState(0);
  const [reviewText, setReviewText] = useState("");
  const [busy, setBusy] = useState(false);

  // Submit review
  const submitReview = async () => {
    if (rating === 0) {
      Alert.alert("Required", "Please select a star rating.");
      return;
    }

    try {
      setBusy(true);

      const { error } = await supabase.rpc("rpc_submit_review", {
        p_quote_id: quoteId,
        p_rating: rating,
        p_content: reviewText.trim() || null,
        p_reviewee_type: revieweeType,
      });

      if (error) throw error;

      Alert.alert(
        "Thank you!",
        "Your review has been submitted.",
        [
          {
            text: "OK",
            onPress: () => {
              // Go back to the quote overview
              router.back();
            },
          },
        ]
      );
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
          <Ionicons name="close" size={28} color="#6B7280" />
        </Pressable>
        <ThemedText style={styles.headerTitle}>Leave a review</ThemedText>
        <View style={{ width: 28 }} />
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
              {rating === 1 && "Poor"}
              {rating === 2 && "Fair"}
              {rating === 3 && "Good"}
              {rating === 4 && "Very good"}
              {rating === 5 && "Excellent"}
            </ThemedText>
          )}

          <Spacer size={32} />

          {/* Review Text */}
          <ThemedText style={styles.inputLabel}>
            Write a review (optional)
          </ThemedText>
          <TextInput
            style={styles.textInput}
            value={reviewText}
            onChangeText={setReviewText}
            placeholder={
              revieweeType === "client"
                ? "Great client, clear communication and paid on time..."
                : "Share your experience working with this tradesperson..."
            }
            placeholderTextColor="#9CA3AF"
            multiline
            numberOfLines={5}
            textAlignVertical="top"
            editable={!busy}
          />

          <Spacer size={8} />

          <ThemedText style={styles.publicNote}>
            Your review will be public and help build trust in the community.
          </ThemedText>

          <Spacer size={24} />

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
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F9FAFB",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingBottom: 16,
    backgroundColor: "#F9FAFB",
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#111827",
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 16,
  },
  questionText: {
    fontSize: 20,
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
    color: "#6B7280",
    textAlign: "center",
    marginTop: 8,
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
    minHeight: 140,
  },
  publicNote: {
    fontSize: 13,
    color: "#6B7280",
    fontStyle: "italic",
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
});
