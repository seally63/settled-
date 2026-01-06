// app/(dashboard)/client/myquotes/completion-success.jsx
// Success screen shown after client confirms job completion
import { StyleSheet, View, Pressable, Image } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import ThemedView from "../../../../components/ThemedView";
import ThemedText from "../../../../components/ThemedText";
import Spacer from "../../../../components/Spacer";
import { Colors } from "../../../../constants/Colors";

const PRIMARY = Colors?.light?.tint || "#6849a7";
const GREEN = "#16A34A";

// Get initials from a name
function getInitials(name) {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
}

// Avatar component
function Avatar({ name, photoUrl, size = 56 }) {
  const initials = getInitials(name);
  const colors = ["#6849a7", "#3B82F6", "#10B981", "#F59E0B", "#EF4444"];
  const colorIndex = name ? name.charCodeAt(0) % colors.length : 0;
  const bgColor = colors[colorIndex];

  if (photoUrl) {
    return (
      <Image
        source={{ uri: photoUrl }}
        style={{
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: "#E5E7EB",
        }}
      />
    );
  }

  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: bgColor,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <ThemedText style={{ color: "#FFF", fontSize: size * 0.4, fontWeight: "700" }}>
        {initials}
      </ThemedText>
    </View>
  );
}

export default function CompletionSuccess() {
  const params = useLocalSearchParams();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const quoteId = params.quoteId;
  const tradeName = params.tradeName || "Trade";
  const tradePhotoUrl = params.tradePhotoUrl;

  // Navigate to leave review screen
  const leaveReview = () => {
    router.push({
      pathname: "/(dashboard)/myquotes/leave-review",
      params: {
        quoteId,
        revieweeName: tradeName,
        revieweeType: "trade",
      },
    });
  };

  // Skip review and go back to projects
  const maybeLater = () => {
    router.replace("/(dashboard)/myquotes");
  };

  return (
    <ThemedView style={styles.container}>
      {/* Header with back button */}
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <Pressable onPress={() => router.replace("/(dashboard)/myquotes")} hitSlop={10}>
          <Ionicons name="arrow-back" size={24} color="#111827" />
        </Pressable>
      </View>

      <View style={styles.content}>
        {/* Success Icon */}
        <View style={styles.successIconContainer}>
          <Ionicons name="checkmark" size={48} color={GREEN} />
        </View>

        <Spacer size={12} />

        <ThemedText style={styles.title}>Job complete</ThemedText>
        <ThemedText style={styles.subtitle}>
          Thanks for confirming. This job is now closed.
        </ThemedText>

        <Spacer size={20} />

        {/* Review Card */}
        <View style={styles.reviewCard}>
          <Avatar name={tradeName} photoUrl={tradePhotoUrl} size={56} />
          <Spacer size={6} />
          <ThemedText style={styles.tradeName}>{tradeName}</ThemedText>
          <Spacer size={12} />
          <ThemedText style={styles.reviewPrompt}>
            How was your experience?
          </ThemedText>
          <ThemedText style={styles.reviewSubtext}>
            Help others find great tradespeople.
          </ThemedText>
        </View>

        <Spacer size={16} />

        {/* Review Button */}
        <Pressable style={styles.reviewBtn} onPress={leaveReview}>
          <ThemedText style={styles.reviewBtnText}>Leave a review</ThemedText>
        </Pressable>

        {/* Maybe Later */}
        <Pressable style={styles.laterBtn} onPress={maybeLater}>
          <ThemedText style={styles.laterBtnText}>Maybe later</ThemedText>
        </Pressable>
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F9FAFB",
  },
  header: {
    paddingHorizontal: 20,
    paddingBottom: 12,
  },
  content: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
  },
  successIconContainer: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: "#DCFCE7",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 4,
    borderColor: "#BBF7D0",
  },
  title: {
    fontSize: 24,
    fontWeight: "700",
    color: "#111827",
    textAlign: "center",
  },
  subtitle: {
    fontSize: 16,
    color: "#6B7280",
    textAlign: "center",
    marginTop: 8,
  },
  reviewCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 24,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    width: "100%",
  },
  tradeName: {
    fontSize: 18,
    fontWeight: "600",
    color: "#111827",
  },
  reviewPrompt: {
    fontSize: 16,
    fontWeight: "600",
    color: "#111827",
    textAlign: "center",
  },
  reviewSubtext: {
    fontSize: 14,
    color: "#6B7280",
    textAlign: "center",
    marginTop: 4,
  },
  reviewBtn: {
    backgroundColor: PRIMARY,
    borderRadius: 12,
    paddingVertical: 16,
    paddingHorizontal: 32,
    alignItems: "center",
    justifyContent: "center",
    width: "100%",
  },
  reviewBtnText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#FFFFFF",
  },
  laterBtn: {
    paddingVertical: 8,
    alignItems: "center",
  },
  laterBtnText: {
    fontSize: 15,
    color: "#6B7280",
  },
});
