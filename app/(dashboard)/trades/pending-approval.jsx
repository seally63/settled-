// app/(dashboard)/trades/pending-approval.jsx
// Shown to trades whose approval_status is not yet 'approved'

import { StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";

import ThemedView from "../../../components/ThemedView";
import ThemedText from "../../../components/ThemedText";
import { Colors } from "../../../constants/Colors";

const PRIMARY = Colors?.primary || "#6849a7";

export default function PendingApprovalScreen({ status }) {
  const insets = useSafeAreaInsets();
  const isRejected = status === "rejected";

  return (
    <ThemedView style={[styles.container, { paddingTop: insets.top + 40 }]}>
      <View style={styles.iconWrap}>
        <Ionicons
          name={isRejected ? "close-circle-outline" : "hourglass-outline"}
          size={64}
          color={isRejected ? Colors.warning : PRIMARY}
        />
      </View>

      <ThemedText style={styles.title}>
        {isRejected ? "Application Not Approved" : "Application Under Review"}
      </ThemedText>

      <ThemedText style={styles.body}>
        {isRejected
          ? "Unfortunately, your application to join Settled was not approved at this time. If you believe this is an error, please contact our support team."
          : "Thanks for applying to join Settled. We're reviewing your credentials and will notify you once your profile has been approved."}
      </ThemedText>

      {!isRejected && (
        <View style={styles.infoCard}>
          <Ionicons name="shield-checkmark-outline" size={20} color={PRIMARY} />
          <ThemedText style={styles.infoText}>
            We review every application to ensure only verified, quality trades are part of Settled.
          </ThemedText>
        </View>
      )}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 32,
    alignItems: "center",
    justifyContent: "center",
  },
  iconWrap: {
    marginBottom: 24,
  },
  title: {
    fontSize: 22,
    fontWeight: "700",
    textAlign: "center",
    marginBottom: 12,
  },
  body: {
    fontSize: 15,
    lineHeight: 22,
    textAlign: "center",
    color: Colors.light.subtitle,
    marginBottom: 32,
  },
  infoCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: "rgba(104, 73, 167, 0.06)",
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: "rgba(104, 73, 167, 0.1)",
  },
  infoText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 19,
    color: Colors.light.subtitle,
  },
});
