// app/(dashboard)/quotes/review-success.jsx
// Review submission success screen for trades
import { StyleSheet, View, Pressable } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import ThemedView from "../../../components/ThemedView";
import ThemedText from "../../../components/ThemedText";
import Spacer from "../../../components/Spacer";
import { Colors } from "../../../constants/Colors";

const PRIMARY = Colors?.light?.tint || "#6849a7";

export default function ReviewSuccess() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const handleDone = () => {
    // Navigate to Quotes tab
    router.replace("/(dashboard)/quotes");
  };

  return (
    <ThemedView style={styles.container}>
      <View style={[styles.content, { paddingBottom: insets.bottom + 24 }]}>
        {/* Success Icon */}
        <View style={styles.iconContainer}>
          <View style={styles.successCircle}>
            <Ionicons name="checkmark" size={48} color="#10B981" />
          </View>
        </View>

        <Spacer size={32} />

        {/* Title */}
        <ThemedText style={styles.title}>Thanks for your review</ThemedText>

        <Spacer size={12} />

        {/* Subtitle */}
        <ThemedText style={styles.subtitle}>
          Your feedback helps build trust in the Settled community.
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
    backgroundColor: "#FFFFFF",
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
  successCircle: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: "#D1FAE5",
    alignItems: "center",
    justifyContent: "center",
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
    lineHeight: 24,
    paddingHorizontal: 20,
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
    fontSize: 16,
    fontWeight: "600",
    color: "#FFFFFF",
  },
});
