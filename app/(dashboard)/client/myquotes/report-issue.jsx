// app/(dashboard)/client/myquotes/report-issue.jsx
// Client report issue screen - select reason and provide details
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

import ThemedView from "../../../../components/ThemedView";
import ThemedText from "../../../../components/ThemedText";
import Spacer from "../../../../components/Spacer";
import { Colors } from "../../../../constants/Colors";
import { supabase } from "../../../../lib/supabase";

const PRIMARY = Colors?.light?.tint || "#6849a7";

const ISSUE_REASONS = [
  { id: "work_not_finished", label: "Work isn't finished" },
  { id: "quality_issue", label: "Quality isn't right" },
  { id: "price_changed", label: "Price changed" },
  { id: "other", label: "Other issue" },
];

export default function ReportIssue() {
  const params = useLocalSearchParams();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const quoteId = params.quoteId;
  const requestId = params.requestId;
  const tradeName = params.tradeName || "Tradesperson";

  const [selectedReason, setSelectedReason] = useState(null);
  const [details, setDetails] = useState("");
  const [busy, setBusy] = useState(false);

  // Submit issue
  const submitIssue = async () => {
    if (!selectedReason) {
      Alert.alert("Required", "Please select a reason for the issue.");
      return;
    }

    if (!details.trim()) {
      Alert.alert("Required", "Please provide more details about the issue.");
      return;
    }

    try {
      setBusy(true);

      const { error } = await supabase.rpc("rpc_client_report_issue", {
        p_quote_id: quoteId,
        p_reason: selectedReason,
        p_details: details.trim(),
      });

      if (error) throw error;

      Alert.alert(
        "Issue Reported",
        `${tradeName} has been notified and will address your concern.`,
        [
          {
            text: "OK",
            onPress: () => {
              router.replace({
                pathname: "/(dashboard)/myquotes/[id]",
                params: { id: quoteId },
              });
            },
          },
        ]
      );
    } catch (err) {
      console.error("Error reporting issue:", err);
      Alert.alert("Error", err.message || "Could not submit issue report.");
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
        <ThemedText style={styles.headerTitle}>Report an issue</ThemedText>
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
          {/* Question */}
          <ThemedText style={styles.questionText}>
            What's the problem?
          </ThemedText>

          <Spacer size={16} />

          {/* Reason Options */}
          {ISSUE_REASONS.map((reason) => (
            <Pressable
              key={reason.id}
              style={[
                styles.reasonOption,
                selectedReason === reason.id && styles.reasonOptionSelected,
              ]}
              onPress={() => setSelectedReason(reason.id)}
            >
              <View style={styles.radioContainer}>
                <View
                  style={[
                    styles.radioOuter,
                    selectedReason === reason.id && styles.radioOuterSelected,
                  ]}
                >
                  {selectedReason === reason.id && (
                    <View style={styles.radioInner} />
                  )}
                </View>
                <ThemedText style={styles.reasonLabel}>{reason.label}</ThemedText>
              </View>
            </Pressable>
          ))}

          <Spacer size={24} />

          {/* Details Input */}
          <ThemedText style={styles.inputLabel}>Tell us more</ThemedText>
          <TextInput
            style={styles.textInput}
            value={details}
            onChangeText={setDetails}
            placeholder="The tiling in the corner still needs grouting..."
            placeholderTextColor="#9CA3AF"
            multiline
            numberOfLines={4}
            textAlignVertical="top"
            editable={!busy}
          />

          <Spacer size={24} />

          {/* Submit Button */}
          <Pressable
            style={[
              styles.submitBtn,
              (!selectedReason || !details.trim() || busy) && styles.btnDisabled,
            ]}
            onPress={submitIssue}
            disabled={!selectedReason || !details.trim() || busy}
          >
            <ThemedText style={styles.submitBtnText}>
              {busy ? "Submitting..." : "Submit issue"}
            </ThemedText>
          </Pressable>

          <Spacer size={12} />

          {/* Note */}
          <ThemedText style={styles.noteText}>
            This will notify {tradeName} and open a conversation to resolve the issue.
          </ThemedText>
        </ScrollView>
      </KeyboardAvoidingView>
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
  questionText: {
    fontSize: 18,
    fontWeight: "600",
    color: "#111827",
  },
  reasonOption: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    padding: 16,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  reasonOptionSelected: {
    borderColor: PRIMARY,
    borderWidth: 2,
  },
  radioContainer: {
    flexDirection: "row",
    alignItems: "center",
  },
  radioOuter: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: "#D1D5DB",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  radioOuterSelected: {
    borderColor: PRIMARY,
  },
  radioInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: PRIMARY,
  },
  reasonLabel: {
    fontSize: 16,
    color: "#111827",
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
  noteText: {
    fontSize: 13,
    color: "#6B7280",
    textAlign: "center",
    lineHeight: 18,
  },
});
