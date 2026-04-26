// app/(dashboard)/myquotes/completion-success.jsx
// Success screen shown after client confirms job completion
import { StyleSheet, View, Pressable, Image } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import ThemedView from "../../../../components/ThemedView";
import ThemedText from "../../../../components/ThemedText";
import Spacer from "../../../../components/Spacer";
import { Colors } from "../../../../constants/Colors";
import { TypeVariants, FontFamily } from "../../../../constants/Typography";
import { useTheme } from "../../../../hooks/useTheme";
import ThemedStatusBar from "../../../../components/ThemedStatusBar";

const PRIMARY = Colors.primary;
const GREEN = "#10B981";

// Get initials from a name
function getInitials(name) {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
}

// Avatar component. Photo URL preferred; falls back to a coloured pill
// keyed by the first letter of the name. The fallback colours are
// brand-flavoured tints — kept identical across modes so each tradie
// always reads as the same avatar regardless of theme.
function Avatar({ name, photoUrl, size = 48, fallbackBg }) {
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
          backgroundColor: fallbackBg,
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
      <ThemedText
        style={{
          color: "#FFF",
          fontFamily: FontFamily.headerBold,
          fontSize: size * 0.4,
        }}
      >
        {initials}
      </ThemedText>
    </View>
  );
}

export default function CompletionSuccess() {
  const params = useLocalSearchParams();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors: c } = useTheme();

  const quoteId = params.quoteId;
  const tradeName = params.tradeName || "Tradesperson";
  const tradeFullName = params.tradeFullName || tradeName;
  const businessName = params.businessName || "";
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
      <ThemedStatusBar />

      <View style={styles.content}>
        {/* Success Icon — soft-green pill with bold checkmark, sized to
            match the review-success screen so the two success states
            feel like the same family. Semantic palette is intentional
            and identical in light + dark mode. */}
        <View style={styles.successIconContainer}>
          <Ionicons name="checkmark-sharp" size={48} color={GREEN} />
        </View>

        <Spacer height={24} />

        <ThemedText style={[styles.title, { color: c.text }]}>
          Job complete
        </ThemedText>
        <ThemedText style={[styles.subtitle, { color: c.textMid }]}>
          Thanks for confirming. This job is now closed.
        </ThemedText>

        <Spacer height={24} />

        {/* Review Card */}
        <View
          style={[
            styles.reviewCard,
            { backgroundColor: c.elevate, borderColor: c.border },
          ]}
        >
          {/* Trade Info Row */}
          <View style={styles.tradeInfoRow}>
            <Avatar
              name={tradeName}
              photoUrl={tradePhotoUrl}
              size={48}
              fallbackBg={c.elevate2}
            />
            <View style={styles.tradeTextContainer}>
              <ThemedText style={[styles.tradeName, { color: c.text }]}>
                {tradeFullName}
              </ThemedText>
              {businessName ? (
                <ThemedText style={[styles.businessName, { color: c.textMid }]}>
                  {businessName}
                </ThemedText>
              ) : null}
            </View>
          </View>

          {/* Divider */}
          <View style={[styles.divider, { backgroundColor: c.border }]} />

          {/* Review Prompt */}
          <ThemedText style={[styles.reviewPrompt, { color: c.text }]}>
            How was your experience?
          </ThemedText>
          <ThemedText style={[styles.reviewSubtext, { color: c.textMid }]}>
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
    // bg handled by ThemedView default + theme.
  },
  content: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
  },
  // Soft-green pill — matches review-success (96px / 48px icon) so
  // the two success screens render at the same size and weight.
  // Semantic green: same tint as the verified banners, intentionally
  // identical in light + dark mode.
  successIconContainer: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: "#D1FAE5",
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    ...TypeVariants.h1,
    fontSize: 24,
    textAlign: "center",
  },
  subtitle: {
    fontFamily: FontFamily.bodyRegular,
    fontSize: 14,
    textAlign: "center",
    marginTop: 4,
    lineHeight: 20,
    // color painted inline from theme.
  },
  reviewCard: {
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    width: "100%",
    // bg + border painted inline from theme.
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
    fontFamily: FontFamily.headerSemibold,
    fontSize: 16,
    // color painted inline from theme.
  },
  businessName: {
    fontFamily: FontFamily.bodyRegular,
    fontSize: 14,
    marginTop: 2,
    // color painted inline from theme.
  },
  divider: {
    height: 1,
    marginVertical: 16,
    // bg painted inline from theme.
  },
  reviewPrompt: {
    fontFamily: FontFamily.headerSemibold,
    fontSize: 16,
    // color painted inline from theme.
  },
  reviewSubtext: {
    fontFamily: FontFamily.bodyRegular,
    fontSize: 14,
    marginTop: 4,
    // color painted inline from theme.
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
    fontFamily: FontFamily.headerSemibold,
    fontSize: 16,
    color: "#FFFFFF",
  },
  laterBtn: {
    paddingVertical: 8,
    alignItems: "center",
  },
  laterBtnText: {
    fontFamily: FontFamily.bodyMedium,
    fontSize: 14,
    color: PRIMARY,
  },
});
