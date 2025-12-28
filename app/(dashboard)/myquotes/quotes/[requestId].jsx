// app/(dashboard)/myquotes/quotes/[requestId].jsx
// Quote list view - shows all trades/quotes for a single request
import {
  StyleSheet,
  View,
  Pressable,
  ScrollView,
  RefreshControl,
  ActivityIndicator,
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

// Avatar component
function Avatar({ name, size = 48 }) {
  const initials = getInitials(name);
  const colors = ["#6849a7", "#3B82F6", "#10B981", "#F59E0B", "#EF4444"];
  const colorIndex = name ? name.charCodeAt(0) % colors.length : 0;
  const bgColor = colors[colorIndex];

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
function StatusChip({ type }) {
  const chips = {
    QUOTE_RECEIVED: { color: "#F59E0B", bg: "#FEF3C7", text: "New Quote" },
    PREPARING: { color: "#3B82F6", bg: "#DBEAFE", text: "Preparing Quote" },
    DECLINED: { color: "#EF4444", bg: "#FEE2E2", text: "Declined" },
    ACCEPTED: { color: "#10B981", bg: "#D1FAE5", text: "Accepted" },
    EXPIRED: { color: "#6B7280", bg: "#F3F4F6", text: "Expired" },
  };

  const chip = chips[type] || chips.PREPARING;

  return (
    <View style={[styles.chip, { backgroundColor: chip.bg }]}>
      <ThemedText style={[styles.chipText, { color: chip.color }]}>
        {chip.text}
      </ThemedText>
    </View>
  );
}

// Trade row component
function TradeRow({ trade, onPress }) {
  return (
    <Pressable style={styles.tradeRow} onPress={onPress}>
      <Avatar name={trade.name} size={48} />
      <View style={styles.tradeInfo}>
        <ThemedText style={styles.tradeName} numberOfLines={1}>
          {trade.name}
        </ThemedText>
        {trade.hasQuote ? (
          <ThemedText style={styles.tradePrice}>
            £{formatNumber(trade.amount)}
          </ThemedText>
        ) : (
          <ThemedText style={styles.tradeStatus}>
            {trade.status === "declined" ? "Declined request" : "Preparing quote..."}
          </ThemedText>
        )}
      </View>
      <View style={styles.tradeRight}>
        <StatusChip
          type={
            trade.status === "declined"
              ? "DECLINED"
              : trade.status === "accepted"
              ? "ACCEPTED"
              : trade.status === "expired"
              ? "EXPIRED"
              : trade.hasQuote
              ? "QUOTE_RECEIVED"
              : "PREPARING"
          }
        />
        <Ionicons name="chevron-forward" size={20} color="#9CA3AF" />
      </View>
    </Pressable>
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
  const [trades, setTrades] = useState([]);

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
            first_name,
            last_name
          )
        `)
        .eq("request_id", requestId);

      if (targetsError) {
        console.error("[QuoteList] Error fetching targets:", targetsError);
      }

      // Fetch quotes for this request
      const { data: quotesData, error: quotesError } = await supabase
        .from("tradify_native_app_db")
        .select("id, trade_id, grand_total, currency, issued_at, status")
        .eq("request_id", requestId);

      if (quotesError) {
        console.error("[QuoteList] Error fetching quotes:", quotesError);
      }

      // Combine data
      const quotesMap = {};
      (quotesData || []).forEach((q) => {
        quotesMap[q.trade_id] = q;
      });

      const combinedTrades = (targetsData || []).map((t) => {
        const quote = quotesMap[t.trade_id];
        const profile = t.profiles;
        const name =
          profile?.business_name ||
          [profile?.first_name, profile?.last_name].filter(Boolean).join(" ") ||
          "Unknown Trade";

        return {
          id: t.trade_id,
          name,
          state: t.state,
          hasQuote: !!quote,
          quoteId: quote?.id,
          amount: quote?.grand_total,
          currency: quote?.currency || "GBP",
          issuedAt: quote?.issued_at,
          status: t.state === "declined" ? "declined" : quote?.status || null,
        };
      });

      // Sort: quotes received first, then preparing, then declined
      combinedTrades.sort((a, b) => {
        if (a.hasQuote && !b.hasQuote) return -1;
        if (!a.hasQuote && b.hasQuote) return 1;
        if (a.status === "declined" && b.status !== "declined") return 1;
        if (a.status !== "declined" && b.status === "declined") return -1;
        return 0;
      });

      setTrades(combinedTrades);
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

  const handleTradePress = (trade) => {
    if (trade.hasQuote && trade.quoteId) {
      router.push(`/myquotes/${trade.quoteId}`);
    }
    // If no quote yet, could show a modal or do nothing
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

  const quotesReceived = trades.filter((t) => t.hasQuote).length;
  const preparing = trades.filter((t) => !t.hasQuote && t.state !== "declined").length;
  const lowestPrice = trades
    .filter((t) => t.hasQuote && t.amount)
    .reduce((min, t) => (min === null || t.amount < min ? t.amount : min), null);

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
              <ThemedText style={styles.summaryValue}>{quotesReceived}</ThemedText>
              <ThemedText style={styles.summaryLabel}>
                Quote{quotesReceived !== 1 ? "s" : ""} received
              </ThemedText>
            </View>
            {preparing > 0 && (
              <View style={styles.summaryItem}>
                <ThemedText style={styles.summaryValue}>{preparing}</ThemedText>
                <ThemedText style={styles.summaryLabel}>Preparing</ThemedText>
              </View>
            )}
            {lowestPrice && (
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
          {trades.length} trade{trades.length !== 1 ? "s" : ""}
        </ThemedText>

        <Spacer height={8} />

        {/* Trade list */}
        {trades.map((trade) => (
          <TradeRow
            key={trade.id}
            trade={trade}
            onPress={() => handleTradePress(trade)}
          />
        ))}

        {trades.length === 0 && (
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
    backgroundColor: "#F9FAFB",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 12,
    backgroundColor: "#FFFFFF",
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
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
  tradeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 14,
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: "#E5E7EB",
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
  tradePrice: {
    fontSize: 18,
    fontWeight: "700",
    color: "#111827",
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
