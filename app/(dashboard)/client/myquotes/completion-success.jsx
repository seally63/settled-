// app/(dashboard)/client/myquotes/completion-success.jsx
// Success screen shown after client confirms job completion
import { StyleSheet, View, Pressable, Image } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";

import ThemedView from "../../../../components/ThemedView";
import ThemedText from "../../../../components/ThemedText";
import Spacer from "../../../../components/Spacer";
import { Colors } from "../../../../constants/Colors";

const PRIMARY = Colors?.light?.tint || "#6849a7";
const GREEN = "#10B981";

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
  const tradeName = params.tradeName || "Tradesperson";
  const tradeFullName = params.tradeFullName || tradeName;
  const businessName = params.businessName || "";
  const tradePhotoUrl = params.tradePhotoUrl || "";
  const jobTitle = params.jobTitle || "";

  // Navigate to leave review screen
  const leaveReview = () => {
    router.push({
      pathname: "/(dashboard)/client/myquotes/leave-review",
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
      <StatusBar style="dark" />

      <View style={styles.content}>
        {/* Success Icon */}
        <View style={styles.successIconContainer}>
          <Ionicons name="checkmark" size={32} color={GREEN} />
        </View>

        <Spacer height={20} />

        <ThemedText style={styles.title}>Job complete</ThemedText>
        <ThemedText style={styles.subtitle}>
          Thanks for confirming. This job is now closed.
        </ThemedText>

        <Spacer height={24} />

        {/* Review Card */}
        <View style={styles.reviewCard}>
          {/* Trade Info Row */}
          <View style={styles.tradeInfoRow}>
            <Avatar name={tradeName} photoUrl={tradePhotoUrl} size={48} />
            <View style={styles.tradeTextContainer}>
              <ThemedText style={styles.tradeName}>{tradeFullName}</ThemedText>
              {businessName ? (
                <ThemedText style={styles.businessName}>{businessName}</ThemedText>
              ) : null}
            </View>
          </View>

          {/* Divider */}
          <View style={styles.divider} />

          {/* Review Prompt */}
          <ThemedText style={styles.reviewPrompt}>
            How was your experience?
          </ThemedText>
          <ThemedText style={styles.reviewSubtext}>
            Help others find great tradespeople.
          </ThemedText>

          <Spacer height={16} />

          {/* Review Button - inside card */}
          <Pressable style={styles.reviewBtn} onPress={leaveReview}>
            <ThemedText style={styles.reviewBtnText}>Leave a review</ThemedText>
          </Pressable>

          <Spacer height={12} />

          {/* Maybe Later - inside card */}
          <Pressable style={styles.laterBtn} onPress={maybeLater}>
            <ThemedText style={styles.laterBtnText}>Maybe later</ThemedText>
          </Pressable>
        </View>
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
  content: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
  },
  successIconContainer: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: "#D1FAE5",
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    fontSize: 24,
    fontWeight: "600",
    color: "#111827",
    textAlign: "center",
  },
  subtitle: {
    fontSize: 14,
    color: "#6B7280",
    textAlign: "center",
    marginTop: 4,
    lineHeight: 20,
  },
  reviewCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    width: "100%",
  },
  tradeInfoRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  tradeTextContainer: {
    marginLeft: 12,
    flex: 1,
  },
  tradeName: {
    fontSize: 16,
    fontWeight: "600",
    color: "#111827",
  },
  businessName: {
    fontSize: 14,
    color: "#6B7280",
    marginTop: 2,
  },
  divider: {
    height: 1,
    backgroundColor: "#E5E7EB",
    marginVertical: 16,
  },
  reviewPrompt: {
    fontSize: 16,
    fontWeight: "600",
    color: "#111827",
  },
  reviewSubtext: {
    fontSize: 14,
    color: "#6B7280",
    marginTop: 4,
  },
  reviewBtn: {
    backgroundColor: PRIMARY,
    borderRadius: 12,
    paddingVertical: 14,
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
    fontSize: 14,
    color: PRIMARY,
  },
});
