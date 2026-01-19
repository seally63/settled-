// components/client/home/ActiveRequestCard.jsx
// Card showing user's most recent active quote request
import { View, Pressable, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import ThemedText from "../../ThemedText";

// Status colors and labels
const STATUS_CONFIG = {
  open: { color: "#F97316", label: "Awaiting quotes" },
  awaiting_quotes: { color: "#F97316", label: "Awaiting quotes" },
  quotes_received: { color: "#3B82F6", label: "quotes received" },
  quote_accepted: { color: "#10B981", label: "Quote accepted" },
  in_progress: { color: "#10B981", label: "In progress" },
  issue_reported: { color: "#EF4444", label: "Issue reported" },
};

// Format price with GBP and thousand separator
function formatPrice(num) {
  if (num == null || isNaN(num)) return "£0";
  return "£" + Number(num).toLocaleString("en-GB", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
}

function StatusChip({ status, quotesReceived }) {
  const config = STATUS_CONFIG[status] || STATUS_CONFIG.open;
  const label = status === "quotes_received" && quotesReceived
    ? `${quotesReceived} ${config.label}`
    : config.label;

  return (
    <View style={[styles.statusChip, { backgroundColor: config.color + "15" }]}>
      <View style={[styles.statusDot, { backgroundColor: config.color }]} />
      <ThemedText style={[styles.statusText, { color: config.color }]}>
        {label}
      </ThemedText>
    </View>
  );
}

function QuotePill({ amount, label }) {
  return (
    <View style={styles.quotePill}>
      <ThemedText style={styles.quotePillAmount}>{formatPrice(amount)}</ThemedText>
      <ThemedText style={styles.quotePillLabel}>{label}</ThemedText>
    </View>
  );
}

export default function ActiveRequestCard({ request, onPress, onSeeAll }) {
  // Hide section if no active request
  if (!request) return null;

  const {
    id,
    suggested_title,
    service_type,
    status,
    quotes_received = 0,
    total_invited = 0,
    lowest_quote,
    highest_quote,
  } = request;

  // Parse title for display
  const displayTitle = suggested_title || service_type || "Untitled request";

  // Meta text
  const metaText = quotes_received > 0
    ? `${quotes_received} of ${total_invited} quotes received`
    : `Waiting for quotes · ${total_invited} trades invited`;

  // Determine status for chip
  const displayStatus = quotes_received > 0 ? "quotes_received" : (status || "open");

  return (
    <View style={styles.container}>
      {/* Section header */}
      <View style={styles.header}>
        <ThemedText style={styles.sectionTitle}>Your Requests</ThemedText>
        <Pressable onPress={onSeeAll} hitSlop={8}>
          <ThemedText style={styles.seeAll}>See all →</ThemedText>
        </Pressable>
      </View>

      {/* Card */}
      <Pressable
        style={({ pressed }) => [
          styles.card,
          pressed && styles.cardPressed,
        ]}
        onPress={() => onPress(id)}
        accessibilityLabel={`View ${displayTitle} request`}
        accessibilityRole="button"
      >
        {/* Status chip and title */}
        <StatusChip status={displayStatus} quotesReceived={quotes_received} />
        <ThemedText style={styles.title} numberOfLines={1}>
          {displayTitle}
        </ThemedText>
        <ThemedText style={styles.meta}>{metaText}</ThemedText>

        {/* Quote pills - only show if quotes received */}
        {quotes_received > 0 && (lowest_quote || highest_quote) && (
          <View style={styles.quotePillsContainer}>
            <View style={styles.quotePillsRow}>
              {lowest_quote && (
                <QuotePill amount={lowest_quote} label="lowest" />
              )}
              {highest_quote && lowest_quote !== highest_quote && (
                <QuotePill amount={highest_quote} label="highest" />
              )}
              {lowest_quote && highest_quote && lowest_quote === highest_quote && (
                <QuotePill amount={lowest_quote} label="quoted" />
              )}
            </View>
            <Pressable style={styles.viewQuotesBtn} onPress={() => onPress(id)}>
              <ThemedText style={styles.viewQuotesText}>View Quotes</ThemedText>
              <Ionicons name="chevron-forward" size={14} color="#6849a7" />
            </Pressable>
          </View>
        )}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 24,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#1F2937",
  },
  seeAll: {
    fontSize: 14,
    fontWeight: "500",
    color: "#6849a7",
  },
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    padding: 16,
    // Shadow
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 1,
  },
  cardPressed: {
    backgroundColor: "#F9FAFB",
  },
  statusChip: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    marginBottom: 8,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 6,
  },
  statusText: {
    fontSize: 12,
    fontWeight: "500",
  },
  title: {
    fontSize: 16,
    fontWeight: "600",
    color: "#1F2937",
    marginBottom: 4,
  },
  meta: {
    fontSize: 14,
    color: "#6B7280",
  },
  quotePillsContainer: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: "#F3F4F6",
  },
  quotePillsRow: {
    flexDirection: "row",
    gap: 8,
  },
  quotePill: {
    backgroundColor: "#F3F4F6",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    alignItems: "center",
  },
  quotePillAmount: {
    fontSize: 16,
    fontWeight: "600",
    color: "#1F2937",
  },
  quotePillLabel: {
    fontSize: 10,
    color: "#6B7280",
    marginTop: 2,
  },
  viewQuotesBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  viewQuotesText: {
    fontSize: 14,
    fontWeight: "500",
    color: "#6849a7",
  },
});
