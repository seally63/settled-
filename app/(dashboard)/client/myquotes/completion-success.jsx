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
function Avatar({ name, photoUrl, size = 48 }) {
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
  const tradePhotoUrl = params.tradePhotoUrl || "";
  const jobTitle = params.jobTitle || "";

  // Navigate to leave review screen
  const leaveReview = () => {
    router.push({
      pathname: "/(dashboard)/myquotes/leave-review",
      params: {
        quoteId,
        revieweeName: tradeName,
        revieweeType: "trade",
        tradePhotoUrl: tradePhotoUrl,
        jobTitle: jobTitle,
      },
    });
  };

  // Skip review and go back to projects
  const maybeLater = () => {
    router.replace("/(dashboard)/myquotes");
  };

  return (
    <ThemedView style={styles.container}>
      {/* No header - clean success screen */}
      <View style={[styles.topSpacer, { paddingTop: insets.top + 24 }]} />

      <View style={styles.content}>
        {/* Success Icon - smaller */}
        <View style={styles.successIconContainer}>
          <Ionicons name="checkmark" size={36} color={GREEN} />
        </View>

        <Spacer size={16} />

        <ThemedText style={styles.title}>Job complete</ThemedText>
        <ThemedText style={styles.subtitle}>
          Thanks for confirming. This job is now closed.
        </ThemedText>

        <Spacer size={24} />

        {/* Review Card */}
        <View style={styles.reviewCard}>
          <Avatar name={tradeName} photoUrl={tradePhotoUrl} size={48} />
          <Spacer size={12} />
          <ThemedText style={styles.tradeName}>{tradeName}</ThemedText>
          <Spacer size={16} />
          <ThemedText style={styles.reviewPrompt}>
            How was your experience?
          </ThemedText>
          <Spacer size={4} />
          <ThemedText style={styles.reviewSubtext}>
            Help others find great tradespeople.
          </ThemedText>
        </View>

        <Spacer size={20} />

        {/* Review Button */}
        <Pressable style={styles.reviewBtn} onPress={leaveReview}>
          <ThemedText style={styles.reviewBtnText}>Leave a review</ThemedText>
        </Pressable>

        <Spacer size={16} />

        {/* Maybe Later */}
        <Pressable style={styles.laterBtn} onPress={maybeLater}>
          <ThemedText style={styles.laterBtnText}>Maybe later</ThemedText>
        </Pressable>
      </View>

      <View style={{ height: insets.bottom + 24 }} />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#FFFFFF",
  },
  topSpacer: {
    // Just for safe area padding
  },
  content: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
  },
  successIconContainer: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: "#DCFCE7",
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    fontSize: 22,
    fontWeight: "700",
    color: "#111827",
    textAlign: "center",
  },
  subtitle: {
    fontSize: 15,
    color: "#6B7280",
    textAlign: "center",
    marginTop: 6,
  },
  reviewCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 20,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    width: "100%",
  },
  tradeName: {
    fontSize: 17,
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
    paddingVertical: 12,
    alignItems: "center",
  },
  laterBtnText: {
    fontSize: 15,
    color: "#6B7280",
  },
});
