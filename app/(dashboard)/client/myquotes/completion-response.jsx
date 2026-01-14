// app/(dashboard)/client/myquotes/completion-response.jsx
// Client completion response screen - confirm job complete or report issue
import { useState, useEffect, useCallback } from "react";
import {
  StyleSheet,
  View,
  ScrollView,
  Pressable,
  Alert,
  Image,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import ThemedView from "../../../../components/ThemedView";
import ThemedText from "../../../../components/ThemedText";
import Spacer from "../../../../components/Spacer";
import { QuoteOverviewSkeleton } from "../../../../components/Skeleton";
import { Colors } from "../../../../constants/Colors";
import { supabase } from "../../../../lib/supabase";
import { useUser } from "../../../../hooks/useUser";

const PRIMARY = Colors?.light?.tint || "#6849a7";
const GREEN = "#16A34A";

// Format number with commas
function formatNumber(num) {
  if (num == null || isNaN(num)) return "0.00";
  return Number(num).toLocaleString("en-GB", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

// Get initials from a name
function getInitials(name) {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
}

// Avatar component
function Avatar({ name, photoUrl, size = 64 }) {
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

export default function CompletionResponse() {
  const params = useLocalSearchParams();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useUser();

  const quoteId = params.quoteId;
  const requestId = params.requestId;

  const [loading, setLoading] = useState(true);
  const [quote, setQuote] = useState(null);
  const [trade, setTrade] = useState(null);
  const [busy, setBusy] = useState(false);

  // Fetch quote and trade details
  const fetchDetails = useCallback(async () => {
    if (!quoteId) return;

    try {
      setLoading(true);

      // Fetch quote with request details for category/service_type/postcode
      const { data: quoteData, error: quoteErr } = await supabase
        .from("tradify_native_app_db")
        .select(
          "id, trade_id, project_title, grand_total, currency, marked_complete_at, payment_amount, payment_method, request_id, category, service_type, postcode"
        )
        .eq("id", quoteId)
        .single();

      if (quoteErr) throw quoteErr;
      setQuote(quoteData);

      // Fetch trade info
      if (quoteData?.trade_id) {
        const { data: tradeData } = await supabase
          .from("profiles")
          .select("id, business_name, full_name, photo_url")
          .eq("id", quoteData.trade_id)
          .single();

        setTrade(tradeData);
      }
    } catch (err) {
      console.error("Error fetching quote:", err);
      Alert.alert("Error", "Could not load job details.");
    } finally {
      setLoading(false);
    }
  }, [quoteId]);

  useEffect(() => {
    fetchDetails();
  }, [fetchDetails]);

  // Confirm job completion
  const confirmCompletion = async () => {
    if (!quoteId) return;

    try {
      setBusy(true);

      // Call RPC to confirm completion
      const { error } = await supabase.rpc("rpc_client_confirm_complete", {
        p_quote_id: quoteId,
      });

      if (error) throw error;

      // Build job title from category/service_type/postcode
      const category = quote?.category;
      const serviceType = quote?.service_type;
      const postcode = quote?.postcode;
      const parts = [];
      if (category) parts.push(category);
      if (serviceType && serviceType !== category) parts.push(serviceType);
      let builtJobTitle = quote?.project_title || "Job";
      if (parts.length > 0 && postcode) {
        builtJobTitle = `${parts.join(", ")} in ${postcode}`;
      } else if (parts.length > 0) {
        builtJobTitle = parts.join(", ");
      } else if (postcode) {
        builtJobTitle = `Job in ${postcode}`;
      }

      // Navigate to success screen with review prompt
      router.replace({
        pathname: "/(dashboard)/client/myquotes/completion-success",
        params: {
          quoteId,
          tradeName: trade?.business_name || trade?.full_name || "Tradesperson",
          tradeFullName: trade?.full_name || "",
          businessName: trade?.business_name || "",
          tradePhotoUrl: trade?.photo_url || "",
          jobTitle: builtJobTitle,
        },
      });
    } catch (err) {
      console.error("Error confirming completion:", err);
      Alert.alert("Error", err.message || "Could not confirm completion.");
    } finally {
      setBusy(false);
    }
  };

  // Navigate to report issue screen
  const reportIssue = () => {
    router.push({
      pathname: "/(dashboard)/myquotes/report-issue",
      params: {
        quoteId,
        requestId,
        tradeName: trade?.business_name || trade?.full_name || "Tradesperson",
      },
    });
  };

  const tradeName = trade?.business_name || trade?.full_name || "Tradesperson";

  // Build job title from category/service_type/postcode
  const buildJobTitle = () => {
    const category = quote?.category;
    const serviceType = quote?.service_type;
    const postcode = quote?.postcode;

    const parts = [];
    if (category) parts.push(category);
    if (serviceType && serviceType !== category) parts.push(serviceType);

    if (parts.length > 0 && postcode) {
      return `${parts.join(", ")} in ${postcode}`;
    }
    if (parts.length > 0) {
      return parts.join(", ");
    }
    if (postcode) {
      return `Job in ${postcode}`;
    }
    return quote?.project_title || "Job";
  };

  const jobTitle = buildJobTitle();
  const markedCompleteDate = quote?.marked_complete_at
    ? new Date(quote.marked_complete_at).toLocaleDateString(undefined, {
        day: "numeric",
        month: "short",
        year: "numeric",
      })
    : "recently";

  if (loading) {
    return (
      <ThemedView style={[styles.container, { paddingTop: insets.top }]}>
        <QuoteOverviewSkeleton paddingTop={16} />
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <Pressable onPress={() => router.back()} hitSlop={10}>
          <Ionicons name="chevron-back" size={24} color="#111827" />
        </Pressable>
        <ThemedText style={styles.headerTitle}>Job Completion</ThemedText>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Trade Avatar and Header */}
        <View style={styles.tradeHeader}>
          <Avatar
            name={tradeName}
            photoUrl={trade?.photo_url}
            size={72}
          />
          <Spacer size={16} />
          <ThemedText style={styles.tradeName}>{tradeName}</ThemedText>
          <ThemedText style={styles.headerSubtitle}>
            marked this job complete
          </ThemedText>
        </View>

        <Spacer size={24} />

        {/* Job Details Card */}
        <View style={styles.detailsCard}>
          <ThemedText style={styles.projectTitle}>
            {quote?.project_title || "Job"}
          </ThemedText>

          <View style={styles.detailRow}>
            <ThemedText style={styles.detailLabel}>Quote</ThemedText>
            <ThemedText style={styles.detailValue}>
              {quote?.currency || "GBP"} {formatNumber(quote?.grand_total)}
            </ThemedText>
          </View>

          {quote?.payment_amount && (
            <View style={styles.detailRow}>
              <ThemedText style={styles.detailLabel}>Amount paid</ThemedText>
              <ThemedText style={styles.detailValue}>
                {quote?.currency || "GBP"} {formatNumber(quote.payment_amount)}
              </ThemedText>
            </View>
          )}

          {quote?.payment_method && (
            <View style={styles.detailRow}>
              <ThemedText style={styles.detailLabel}>Payment method</ThemedText>
              <ThemedText style={styles.detailValue}>
                {quote.payment_method === "bank_transfer"
                  ? "Bank transfer"
                  : quote.payment_method === "cash"
                  ? "Cash"
                  : quote.payment_method === "card"
                  ? "Card"
                  : quote.payment_method}
              </ThemedText>
            </View>
          )}

          <View style={[styles.detailRow, { borderBottomWidth: 0 }]}>
            <ThemedText style={styles.detailLabel}>Marked complete</ThemedText>
            <ThemedText style={styles.detailValue}>
              {markedCompleteDate}
            </ThemedText>
          </View>
        </View>

        <Spacer size={20} />

        {/* Action Buttons */}
        <Pressable
          style={[styles.confirmBtn, busy && styles.btnDisabled]}
          onPress={confirmCompletion}
          disabled={busy}
        >
          <ThemedText style={styles.confirmBtnText}>
            {busy ? "Confirming..." : "Confirm Job Complete"}
          </ThemedText>
        </Pressable>

        <Pressable
          style={styles.issueBtn}
          onPress={reportIssue}
          disabled={busy}
        >
          <ThemedText style={styles.issueBtnText}>
            There is an issue
          </ThemedText>
        </Pressable>
      </ScrollView>
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
    paddingBottom: 12,
    backgroundColor: "#FFFFFF",
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#111827",
  },
  loadingContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  content: {
    paddingHorizontal: 20,
  },
  tradeHeader: {
    alignItems: "center",
    paddingTop: 24,
  },
  tradeName: {
    fontSize: 20,
    fontWeight: "700",
    color: "#111827",
    textAlign: "center",
  },
  headerSubtitle: {
    fontSize: 16,
    color: "#6B7280",
    marginTop: 4,
  },
  detailsCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  projectTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#111827",
    marginBottom: 16,
  },
  detailRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#E5E7EB",
  },
  detailLabel: {
    fontSize: 14,
    color: "#6B7280",
  },
  detailValue: {
    fontSize: 14,
    fontWeight: "600",
    color: "#111827",
  },
  confirmBtn: {
    backgroundColor: GREEN,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  confirmBtnText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#FFFFFF",
  },
  issueBtn: {
    marginTop: 8,
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#D1D5DB",
  },
  issueBtnText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#374151",
  },
  btnDisabled: {
    opacity: 0.7,
  },
});
