// app/(dashboard)/myquotes/quotes/[requestId].jsx
// Quote list view - shows all trades/quotes for a single request
import {
  StyleSheet,
  View,
  Pressable,
  ScrollView,
  RefreshControl,
  ActivityIndicator,
  Image,
} from "react-native";
import { useEffect, useState, useCallback } from "react";
import { Ionicons } from "@expo/vector-icons";
import { useRouter, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { supabase } from "../../../../lib/supabase";
import { useUser } from "../../../../hooks/useUser";

import ThemedView from "../../../../components/ThemedView";
import ThemedText from "../../../../components/ThemedText";
import Spacer from "../../../../components/Spacer";
import { Colors } from "../../../../constants/Colors";

const TINT = Colors?.light?.tint || "#6849a7";

// Format number with thousand separators
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

// Avatar component with photo support
function Avatar({ name, size = 48, photoUrl }) {
  const initials = getInitials(name);
  const colors = ["#6849a7", "#3B82F6", "#10B981", "#F59E0B", "#EF4444"];
  const colorIndex = name ? name.charCodeAt(0) % colors.length : 0;
  const bgColor = colors[colorIndex];

  // If we have a photo URL, show the image
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

  // Fallback to initials
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
          color: "#FFFFFF",
          fontSize: size * 0.4,
          fontWeight: "700",
        }}
      >
        {initials}
      </ThemedText>
    </View>
  );
}

// Status chip component
function StatusChip({ type, small = false }) {
  const chips = {
    QUOTE_RECEIVED: { color: "#F59E0B", bg: "#FEF3C7", text: "New Quote" },
    PREPARING: { color: "#3B82F6", bg: "#DBEAFE", text: "Preparing Quote" },
    DECLINED: { color: "#EF4444", bg: "#FEE2E2", text: "Declined" },
    ACCEPTED: { color: "#10B981", bg: "#D1FAE5", text: "Accepted" },
    EXPIRED: { color: "#6B7280", bg: "#F3F4F6", text: "Expired" },
    SENT: { color: "#3B82F6", bg: "#DBEAFE", text: "Sent" },
    DRAFT: { color: "#F59E0B", bg: "#FEF3C7", text: "Draft" },
  };

  const chip = chips[type] || chips.PREPARING;

  return (
    <View style={[styles.chip, { backgroundColor: chip.bg }, small && { paddingVertical: 2, paddingHorizontal: 8 }]}>
      <ThemedText style={[styles.chipText, { color: chip.color }, small && { fontSize: 11 }]}>
        {chip.text}
      </ThemedText>
    </View>
  );
}

// Get quote status chip type
function getQuoteChipType(quote, targetState) {
  if (targetState === "declined") return "DECLINED";
  if (!quote) return "PREPARING";
  if (quote.status === "accepted") return "ACCEPTED";
  if (quote.status === "declined") return "DECLINED";
  if (quote.status === "draft") return "DRAFT";
  if (quote.status === "sent") return "SENT";
  return "QUOTE_RECEIVED";
}

// Individual quote row within a trade group
function QuoteRow({ quote, quoteNumber, onPress }) {
  const chipType = quote.status === "accepted" ? "ACCEPTED" :
                   quote.status === "declined" ? "DECLINED" :
                   quote.status === "draft" ? "DRAFT" : "SENT";

  return (
    <Pressable style={styles.quoteRow} onPress={onPress}>
      <View style={styles.quoteRowLeft}>
        <View style={styles.quoteNumberBadge}>
          <ThemedText style={styles.quoteNumberText}>#{quoteNumber}</ThemedText>
        </View>
        <View style={styles.quoteRowInfo}>
          <ThemedText style={styles.quoteRowPrice}>
            £{formatNumber(quote.grand_total)}
          </ThemedText>
          <ThemedText style={styles.quoteRowDate}>
            {quote.created_at ? new Date(quote.created_at).toLocaleDateString() : ""}
          </ThemedText>
        </View>
      </View>
      <View style={styles.quoteRowRight}>
        <StatusChip type={chipType} small />
        <Ionicons name="chevron-forward" size={18} color="#9CA3AF" />
      </View>
    </Pressable>
  );
}

// Trade group component - shows trade info and all their quotes
function TradeGroup({ trade, quotes, onQuotePress, expanded, onToggle }) {
  const hasQuotes = quotes.length > 0;
  const hasMultipleQuotes = quotes.length > 1;
  const latestQuote = quotes[0]; // quotes are sorted by date desc

  // Get the best status to show on the trade row
  const getBestStatus = () => {
    if (trade.state === "declined") return "DECLINED";
    const acceptedQuote = quotes.find(q => q.status === "accepted");
    if (acceptedQuote) return "ACCEPTED";
    if (!hasQuotes) return "PREPARING";
    return "QUOTE_RECEIVED";
  };

  return (
    <View style={styles.tradeGroup}>
      {/* Trade header row */}
      <Pressable
        style={styles.tradeRow}
        onPress={hasMultipleQuotes ? onToggle : () => hasQuotes && onQuotePress(latestQuote.id)}
      >
        <Avatar name={trade.name} size={48} photoUrl={trade.photoUrl} />
        <View style={styles.tradeInfo}>
          <ThemedText style={styles.tradeName} numberOfLines={1}>
            {trade.name}
          </ThemedText>
          {hasQuotes ? (
            <View style={styles.tradeQuoteInfo}>
              <ThemedText style={styles.tradePrice}>
                £{formatNumber(latestQuote.grand_total)}
              </ThemedText>
              {hasMultipleQuotes && (
                <ThemedText style={styles.tradeQuoteCount}>
                  · {quotes.length} quotes
                </ThemedText>
              )}
            </View>
          ) : (
            <ThemedText style={styles.tradeStatus}>
              {trade.state === "declined" ? "Declined request" : "Preparing quote..."}
            </ThemedText>
          )}
        </View>
        <View style={styles.tradeRight}>
          <StatusChip type={getBestStatus()} />
          <Ionicons
            name={hasMultipleQuotes ? (expanded ? "chevron-up" : "chevron-down") : "chevron-forward"}
            size={20}
            color="#9CA3AF"
          />
        </View>
      </Pressable>

      {/* Expanded quote list */}
      {expanded && hasMultipleQuotes && (
        <View style={styles.quotesList}>
          {quotes.map((quote, idx) => (
            <QuoteRow
              key={quote.id}
              quote={quote}
              quoteNumber={quotes.length - idx}
              onPress={() => onQuotePress(quote.id)}
            />
          ))}
        </View>
      )}
    </View>
  );
}

export default function QuoteListScreen() {
  const { requestId } = useLocalSearchParams();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useUser();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [request, setRequest] = useState(null);
  const [tradeGroups, setTradeGroups] = useState([]); // Array of { trade, quotes }
  const [expandedTrades, setExpandedTrades] = useState({}); // { tradeId: boolean }

  const fetchData = useCallback(async () => {
    if (!requestId || !user?.id) return;

    try {
      // Fetch request details
      const { data: reqData, error: reqError } = await supabase
        .from("quote_requests")
        .select("id, suggested_title, postcode, created_at, status")
        .eq("id", requestId)
        .single();

      if (reqError) {
        console.error("[QuoteList] Error fetching request:", reqError);
      } else {
        setRequest(reqData);
      }

      // Fetch all targets (trades matched to this request)
      const { data: targetsData, error: targetsError } = await supabase
        .from("request_targets")
        .select(`
          id,
          trade_id,
          state,
          created_at,
          profiles:trade_id (
            id,
            business_name,
            full_name,
            photo_url
          )
        `)
        .eq("request_id", requestId);

      if (targetsError) {
        console.error("[QuoteList] Error fetching targets:", targetsError);
      }

      // Fetch ALL quotes for this request (up to 3 per trade)
      // Filter out drafts - clients should only see sent/quoted/accepted/declined quotes
      const { data: quotesData, error: quotesError } = await supabase
        .from("tradify_native_app_db")
        .select("id, trade_id, grand_total, currency, issued_at, status, created_at")
        .eq("request_id", requestId)
        .neq("status", "draft")
        .order("created_at", { ascending: false });

      if (quotesError) {
        console.error("[QuoteList] Error fetching quotes:", quotesError);
      }

      // Group quotes by trade_id
      const quotesByTrade = {};
      (quotesData || []).forEach((q) => {
        if (!quotesByTrade[q.trade_id]) {
          quotesByTrade[q.trade_id] = [];
        }
        quotesByTrade[q.trade_id].push(q);
      });

      // Build trade groups from targets
      const groups = (targetsData || []).map((t) => {
        const profile = t.profiles;
        const name =
          profile?.business_name ||
          profile?.full_name ||
          "Unknown Trade";

        const tradeQuotes = quotesByTrade[t.trade_id] || [];

        return {
          trade: {
            id: t.trade_id,
            name,
            state: t.state,
            photoUrl: profile?.photo_url || null,
          },
          quotes: tradeQuotes,
        };
      });

      // Sort: trades with accepted quotes first, then with quotes, then preparing, then declined
      groups.sort((a, b) => {
        const aHasAccepted = a.quotes.some(q => q.status === "accepted");
        const bHasAccepted = b.quotes.some(q => q.status === "accepted");
        if (aHasAccepted && !bHasAccepted) return -1;
        if (!aHasAccepted && bHasAccepted) return 1;

        const aHasQuotes = a.quotes.length > 0;
        const bHasQuotes = b.quotes.length > 0;
        if (aHasQuotes && !bHasQuotes) return -1;
        if (!aHasQuotes && bHasQuotes) return 1;

        if (a.trade.state === "declined" && b.trade.state !== "declined") return 1;
        if (a.trade.state !== "declined" && b.trade.state === "declined") return -1;

        return 0;
      });

      setTradeGroups(groups);

      // Auto-expand if there's only 1 trade with multiple quotes
      if (groups.length === 1 && groups[0].quotes.length > 1) {
        setExpandedTrades({ [groups[0].trade.id]: true });
      }
    } catch (err) {
      console.error("[QuoteList] Error:", err);
    } finally {
      setLoading(false);
    }
  }, [requestId, user?.id]);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchData();
    setRefreshing(false);
  };

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleClose = () => {
    router.canGoBack?.() ? router.back() : router.replace("/myquotes");
  };

  const handleViewRequest = () => {
    router.push(`/myquotes/request/${requestId}`);
  };

  const handleQuotePress = (quoteId) => {
    router.push(`/myquotes/${quoteId}`);
  };

  const toggleTradeExpand = (tradeId) => {
    setExpandedTrades(prev => ({
      ...prev,
      [tradeId]: !prev[tradeId],
    }));
  };

  if (loading) {
    return (
      <ThemedView style={styles.container}>
        <View style={[styles.header, { paddingTop: insets.top }]}>
          <Pressable onPress={handleClose} style={styles.closeBtn}>
            <Ionicons name="close" size={24} color="#111827" />
          </Pressable>
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={TINT} />
        </View>
      </ThemedView>
    );
  }

  // Calculate summary stats from trade groups
  const totalQuotes = tradeGroups.reduce((sum, g) => sum + g.quotes.length, 0);
  const tradesWithQuotes = tradeGroups.filter(g => g.quotes.length > 0).length;
  const preparing = tradeGroups.filter(g => g.quotes.length === 0 && g.trade.state !== "declined").length;
  const allQuotes = tradeGroups.flatMap(g => g.quotes);
  const lowestPrice = allQuotes
    .filter(q => q.grand_total != null)
    .reduce((min, q) => (min === null || q.grand_total < min ? q.grand_total : min), null);

  return (
    <ThemedView style={styles.container}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top }]}>
        <Pressable onPress={handleClose} style={styles.closeBtn}>
          <Ionicons name="close" size={24} color="#111827" />
        </Pressable>
        <ThemedText style={styles.headerTitle}>Compare Quotes</ThemedText>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        contentContainerStyle={styles.scrollContent}
      >
        {/* Job info card */}
        <View style={styles.jobCard}>
          <ThemedText style={styles.jobTitle}>
            {request?.suggested_title || "Untitled Job"}
          </ThemedText>
          {request?.postcode && (
            <View style={styles.locationRow}>
              <Ionicons name="location-outline" size={16} color="#6B7280" />
              <ThemedText style={styles.locationText}>{request.postcode}</ThemedText>
            </View>
          )}
          <Spacer height={12} />
          <View style={styles.summaryRow}>
            <View style={styles.summaryItem}>
              <ThemedText style={styles.summaryValue}>{totalQuotes}</ThemedText>
              <ThemedText style={styles.summaryLabel}>
                Quote{totalQuotes !== 1 ? "s" : ""} received
              </ThemedText>
            </View>
            <View style={styles.summaryItem}>
              <ThemedText style={styles.summaryValue}>{tradesWithQuotes}</ThemedText>
              <ThemedText style={styles.summaryLabel}>
                Trade{tradesWithQuotes !== 1 ? "s" : ""}
              </ThemedText>
            </View>
            {preparing > 0 && (
              <View style={styles.summaryItem}>
                <ThemedText style={styles.summaryValue}>{preparing}</ThemedText>
                <ThemedText style={styles.summaryLabel}>Preparing</ThemedText>
              </View>
            )}
            {lowestPrice != null && (
              <View style={styles.summaryItem}>
                <ThemedText style={styles.summaryValue}>
                  £{formatNumber(lowestPrice)}
                </ThemedText>
                <ThemedText style={styles.summaryLabel}>Lowest price</ThemedText>
              </View>
            )}
          </View>
        </View>

        <Spacer height={8} />

        {/* View original request link */}
        <Pressable style={styles.viewRequestBtn} onPress={handleViewRequest}>
          <Ionicons name="document-text-outline" size={18} color={TINT} />
          <ThemedText style={styles.viewRequestText}>View original request</ThemedText>
          <Ionicons name="chevron-forward" size={18} color={TINT} />
        </Pressable>

        <Spacer height={16} />

        {/* Section header */}
        <ThemedText style={styles.sectionTitle}>
          {tradeGroups.length} trade{tradeGroups.length !== 1 ? "s" : ""}
        </ThemedText>

        <Spacer height={8} />

        {/* Trade groups list */}
        {tradeGroups.map(({ trade, quotes }) => (
          <TradeGroup
            key={trade.id}
            trade={trade}
            quotes={quotes}
            onQuotePress={handleQuotePress}
            expanded={!!expandedTrades[trade.id]}
            onToggle={() => toggleTradeExpand(trade.id)}
          />
        ))}

        {tradeGroups.length === 0 && (
          <View style={styles.emptyState}>
            <Ionicons name="people-outline" size={48} color="#9CA3AF" />
            <ThemedText style={styles.emptyText}>No trades yet</ThemedText>
            <ThemedText style={styles.emptySubtext}>
              Trades will appear here once they respond to your request.
            </ThemedText>
          </View>
        )}

        <Spacer height={40} />
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
    paddingHorizontal: 16,
    paddingBottom: 12,
    backgroundColor: "#FFFFFF",
  },
  closeBtn: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: "600",
    color: "#111827",
  },
  loadingContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  scrollContent: {
    padding: 16,
  },
  jobCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  jobTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#111827",
  },
  locationRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 6,
  },
  locationText: {
    fontSize: 14,
    color: "#6B7280",
  },
  summaryRow: {
    flexDirection: "row",
    gap: 24,
  },
  summaryItem: {
    alignItems: "flex-start",
  },
  summaryValue: {
    fontSize: 20,
    fontWeight: "700",
    color: "#111827",
  },
  summaryLabel: {
    fontSize: 12,
    color: "#6B7280",
    marginTop: 2,
  },
  viewRequestBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: "#FFFFFF",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  viewRequestText: {
    flex: 1,
    fontSize: 14,
    fontWeight: "500",
    color: TINT,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: "#6B7280",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  tradeGroup: {
    marginBottom: 8,
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    overflow: "hidden",
  },
  tradeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 14,
  },
  tradeInfo: {
    flex: 1,
    gap: 4,
  },
  tradeName: {
    fontSize: 16,
    fontWeight: "600",
    color: "#111827",
  },
  tradeQuoteInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  tradePrice: {
    fontSize: 18,
    fontWeight: "700",
    color: "#111827",
  },
  tradeQuoteCount: {
    fontSize: 14,
    color: "#6B7280",
  },
  tradeStatus: {
    fontSize: 14,
    color: "#6B7280",
  },
  tradeRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  quotesList: {
    borderTopWidth: 1,
    borderTopColor: "#E5E7EB",
    backgroundColor: "#FFFFFF",
  },
  quoteRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
  },
  quoteRowLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  quoteNumberBadge: {
    backgroundColor: "#E5E7EB",
    borderRadius: 6,
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  quoteNumberText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#374151",
  },
  quoteRowInfo: {
    gap: 2,
  },
  quoteRowPrice: {
    fontSize: 16,
    fontWeight: "600",
    color: "#111827",
  },
  quoteRowDate: {
    fontSize: 12,
    color: "#6B7280",
  },
  quoteRowRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  chip: {
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 12,
  },
  chipText: {
    fontSize: 12,
    fontWeight: "600",
  },
  emptyState: {
    alignItems: "center",
    paddingVertical: 40,
  },
  emptyText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#374151",
    marginTop: 12,
  },
  emptySubtext: {
    fontSize: 14,
    color: "#6B7280",
    textAlign: "center",
    marginTop: 4,
  },
});
