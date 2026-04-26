// app/(dashboard)/client/myquotes/review-success.jsx
// Review submission success screen
import { StyleSheet, View, Pressable } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import ThemedView from "../../../../components/ThemedView";
import ThemedText from "../../../../components/ThemedText";
import Spacer from "../../../../components/Spacer";
import { Colors } from "../../../../constants/Colors";
import { TypeVariants, FontFamily } from "../../../../constants/Typography";
import { useTheme } from "../../../../hooks/useTheme";

const PRIMARY = Colors.primary;

export default function ReviewSuccess() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors: c } = useTheme();

  const handleDone = () => {
    // Navigate to client home page (not Projects tab)
    // Using reset to clear the navigation stack and prevent going back to review flow
    router.dismissAll();
    router.replace("/(dashboard)/client");
  };

  return (
    <ThemedView style={styles.container}>
      <View
        style={[
          styles.content,
          // Minimum 16 px of "fake" bottom inset on top of the actual
          // 24 px breathing room. The iOS simulator reports
          // insets.bottom = 0 for non-notched device profiles which
          // pinned the Done button 24 px from the screen edge — fine
          // on a real phone with a home-indicator inset but
          // un-tappable in the simulator. The Math.max keeps the
          // button comfortably reachable on every profile.
          { paddingBottom: Math.max(insets.bottom, 16) + 40 },
        ]}
      >
        {/* Success Icon — soft-green pill with bold checkmark. Matches
            the completion-success screen so the two success states feel
            like the same family. Semantic palette is intentional and
            identical in light + dark mode. */}
        <View style={styles.iconContainer}>
          <View style={styles.successCircle}>
            <Ionicons name="checkmark-sharp" size={48} color="#10B981" />
          </View>
        </View>

        <Spacer size={32} />

        {/* Title */}
        <ThemedText style={[styles.title, { color: c.text }]}>
          Thanks for your review
        </ThemedText>

        <Spacer size={12} />

        {/* Subtitle. Wording deliberately avoids "build trust" because
            Settled is invite-only and the trades on the platform are
            already vetted — reviews here exist to help fellow
            homeowners pick the right fit, not to gate trust. */}
        <ThemedText style={[styles.subtitle, { color: c.textMid }]}>
          Your feedback helps fellow homeowners pick the right trade for the job.
        </ThemedText>

        <View style={styles.spacer} />

        {/* Done Button */}
        <Pressable style={styles.doneBtn} onPress={handleDone}>
          <ThemedText style={styles.doneBtnText}>Done</ThemedText>
        </Pressable>
      </View>
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
    paddingHorizontal: 24,
    paddingTop: 100,
    alignItems: "center",
  },
  iconContainer: {
    alignItems: "center",
    justifyContent: "center",
  },
  // Semantic green pill — D1FAE5 is the soft tint shipped on every
  // success state in the app (verified banner, completion banners),
  // intentionally identical in light + dark mode.
  successCircle: {
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
    fontSize: 16,
    textAlign: "center",
    lineHeight: 24,
    paddingHorizontal: 20,
    // color painted inline from theme.
  },
  spacer: {
    flex: 1,
  },
  doneBtn: {
    backgroundColor: PRIMARY,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: "center",
    justifyContent: "center",
    width: "100%",
  },
  doneBtnText: {
    fontFamily: FontFamily.headerSemibold,
    fontSize: 16,
    color: "#FFFFFF",
  },
});
