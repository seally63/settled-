// app/(dashboard)/myquotes/completion-response.jsx
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
import { TypeVariants, FontFamily } from "../../../../constants/Typography";
import { useTheme } from "../../../../hooks/useTheme";
import { supabase } from "../../../../lib/supabase";
import { useUser } from "../../../../hooks/useUser";

// Brand purple for the primary "Confirm" CTA. Stays consistent across modes.
const PRIMARY = Colors.primary;
// Semantic success green — same tint used on the verified banners and
// success states across the app, intentionally identical in both modes.
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

// Avatar component. Photo URL preferred; falls back to a coloured pill
// keyed by the first letter of the name. The fallback colours are
// brand-flavoured tints — kept identical across modes so each tradie
// always reads as the same avatar regardless of theme.
function Avatar({ name, photoUrl, size = 64, fallbackBg }) {
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

export default function CompletionResponse() {
  const params = useLocalSearchParams();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useUser();
  const { colors: c } = useTheme();

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

      // Fetch quote
      const { data: quoteData, error: quoteErr } = await supabase
        .from("tradify_native_app_db")
        .select(
          "id, trade_id, project_title, grand_total, currency, marked_complete_at, payment_amount, payment_method, request_id"
        )
        .eq("id", quoteId)
        .single();

      if (quoteErr) throw quoteErr;

      // Fetch request details for category/service_type/postcode
      let requestData = null;
      if (quoteData?.request_id) {
        const { data: reqData } = await supabase
          .from("quote_requests")
          .select("category, service_type, postcode, suggested_title")
          .eq("id", quoteData.request_id)
          .single();
        requestData = reqData;
      }

      setQuote({ ...quoteData, ...requestData });

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
        pathname: "/(dashboard)/myquotes/completion-success",
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
      <View
        style={[
          styles.header,
          { paddingTop: insets.top + 12, borderBottomColor: c.border },
        ]}
      >
        <Pressable onPress={() => router.back()} hitSlop={10}>
          <Ionicons name="chevron-back" size={24} color={c.text} />
        </Pressable>
        <ThemedText style={[styles.headerTitle, { color: c.text }]}>
          Job completion
        </ThemedText>
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
            fallbackBg={c.elevate2}
          />
          <Spacer size={16} />
          <ThemedText style={[styles.tradeName, { color: c.text }]}>
            {tradeName}
          </ThemedText>
          <ThemedText style={[styles.headerSubtitle, { color: c.textMid }]}>
            marked this job complete
          </ThemedText>
        </View>

        <Spacer size={24} />

        {/* Job Details Pill Card — matches the pill-card pattern used
            on the trade-side Mark-as-complete sheet (c.elevate2 bg +
            c.borderStrong border, radius 18, eyebrow + rows). */}
        <View
          style={[
            styles.detailsCard,
            { backgroundColor: c.elevate2, borderColor: c.borderStrong },
          ]}
        >
          <ThemedText style={[styles.detailsEyebrow, { color: c.textMuted }]}>
            JOB SUMMARY
          </ThemedText>

          <ThemedText style={[styles.projectTitle, { color: c.text }]}>
            {jobTitle}
          </ThemedText>

          <View style={[styles.detailRow, { borderBottomColor: c.border }]}>
            <ThemedText style={[styles.detailLabel, { color: c.textMid }]}>
              Quote
            </ThemedText>
            <ThemedText style={[styles.detailValue, { color: c.text }]}>
              {quote?.currency || "GBP"} {formatNumber(quote?.grand_total)}
            </ThemedText>
          </View>

          {quote?.payment_amount ? (
            <View style={[styles.detailRow, { borderBottomColor: c.border }]}>
              <ThemedText style={[styles.detailLabel, { color: c.textMid }]}>
                Amount paid
              </ThemedText>
              <ThemedText style={[styles.detailValue, { color: c.text }]}>
                {quote?.currency || "GBP"} {formatNumber(quote.payment_amount)}
              </ThemedText>
            </View>
          ) : null}

          {quote?.payment_method ? (
            <View style={[styles.detailRow, { borderBottomColor: c.border }]}>
              <ThemedText style={[styles.detailLabel, { color: c.textMid }]}>
                Payment method
              </ThemedText>
              <ThemedText style={[styles.detailValue, { color: c.text }]}>
                {quote.payment_method === "bank_transfer"
                  ? "Bank transfer"
                  : quote.payment_method === "cash"
                  ? "Cash"
                  : quote.payment_method === "card"
                  ? "Card"
                  : quote.payment_method}
              </ThemedText>
            </View>
          ) : null}

          <View style={[styles.detailRow, styles.detailRowLast]}>
            <ThemedText style={[styles.detailLabel, { color: c.textMid }]}>
              Marked complete
            </ThemedText>
            <ThemedText style={[styles.detailValue, { color: c.text }]}>
              {markedCompleteDate}
            </ThemedText>
          </View>
        </View>

        <Spacer size={24} />

        {/* Action buttons — primary green for the "yes, it's done" path,
            ghost button for the issue-report path. Same equal-flex
            structure used on the Quote Overview client confirmation. */}
        <Pressable
          style={({ pressed }) => [
            styles.confirmBtn,
            pressed && { opacity: 0.85 },
            busy && styles.btnDisabled,
          ]}
          onPress={confirmCompletion}
          disabled={busy}
        >
          <Ionicons
            name="checkmark"
            size={18}
            color="#FFFFFF"
            style={{ marginRight: 8 }}
          />
          <ThemedText style={styles.confirmBtnText}>
            {busy ? "Confirming…" : "Confirm job complete"}
          </ThemedText>
        </Pressable>

        <Spacer size={10} />

        <Pressable
          style={({ pressed }) => [
            styles.issueBtn,
            { backgroundColor: c.elevate, borderColor: c.borderStrong },
            pressed && { opacity: 0.75 },
            busy && styles.btnDisabled,
          ]}
          onPress={reportIssue}
          disabled={busy}
        >
          <ThemedText style={[styles.issueBtnText, { color: c.text }]}>
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
    // bg handled by ThemedView default + theme.
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    // border painted inline from theme.
  },
  headerTitle: {
    ...TypeVariants.bodyStrong,
    fontSize: 18,
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
    ...TypeVariants.h1,
    fontSize: 22,
    textAlign: "center",
  },
  headerSubtitle: {
    fontFamily: FontFamily.bodyRegular,
    fontSize: 16,
    marginTop: 4,
    // color painted inline from theme.
  },
  detailsCard: {
    borderRadius: 18,
    paddingHorizontal: 18,
    paddingTop: 14,
    paddingBottom: 6,
    borderWidth: 1,
    // bg + border painted inline from theme.
  },
  detailsEyebrow: {
    fontFamily: FontFamily.headerBold,
    fontSize: 11,
    letterSpacing: 1.2,
    textTransform: "uppercase",
    marginBottom: 10,
    // color painted inline from theme.
  },
  projectTitle: {
    fontFamily: FontFamily.headerSemibold,
    fontSize: 17,
    marginBottom: 10,
    // color painted inline from theme.
  },
  detailRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    // border painted inline from theme.
  },
  detailRowLast: {
    borderBottomWidth: 0,
  },
  detailLabel: {
    fontFamily: FontFamily.bodyMedium,
    fontSize: 14,
    // color painted inline from theme.
  },
  detailValue: {
    fontFamily: FontFamily.headerSemibold,
    fontSize: 14,
    // color painted inline from theme.
  },
  // Confirm CTA stays semantic green — "yes, the job is done" reads
  // intuitively in green across both modes. Same tone used on the
  // verified banners + success pills.
  confirmBtn: {
    backgroundColor: GREEN,
    borderRadius: 14,
    paddingVertical: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  confirmBtnText: {
    fontFamily: FontFamily.headerSemibold,
    fontSize: 16,
    color: "#FFFFFF",
    letterSpacing: -0.1,
  },
  // Ghost button for the report-issue path. Surface paints from theme.
  issueBtn: {
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    // bg + border painted inline from theme.
  },
  issueBtnText: {
    fontFamily: FontFamily.headerSemibold,
    fontSize: 16,
    letterSpacing: -0.1,
    // color painted inline from theme.
  },
  btnDisabled: {
    opacity: 0.5,
  },
});
