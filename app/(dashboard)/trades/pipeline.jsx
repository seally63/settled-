// app/(dashboard)/trades/pipeline.jsx - Pipeline Page
import { useEffect, useState, useCallback, useMemo } from "react";
import {
  StyleSheet,
  View,
  ScrollView,
  Pressable,
  RefreshControl,
} from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import ThemedView from "../../../components/ThemedView";
import ThemedText from "../../../components/ThemedText";
import Spacer from "../../../components/Spacer";
import { PipelinePageSkeleton } from "../../../components/Skeleton";
import { Colors } from "../../../constants/Colors";
import { useUser } from "../../../hooks/useUser";
import { supabase } from "../../../lib/supabase";
import ThemedStatusBar from "../../../components/ThemedStatusBar";

const TINT = Colors?.light?.tint || "#6849a7";

// Format currency
function formatCurrency(amount) {
  if (amount == null || isNaN(amount)) return "£0";
  return `£${Number(amount).toLocaleString("en-GB", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })}`;
}

function formatCurrencyFull(amount) {
  if (amount == null || isNaN(amount)) return "£0.00";
  return `£${Number(amount).toLocaleString("en-GB", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

// Get privacy-aware client display name
function getClientDisplayName(fullName, contactUnlocked) {
  if (!fullName) return null;
  if (contactUnlocked) return fullName;
  const parts = String(fullName).trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return null;
  if (parts.length === 1) return parts[0];
  return `${parts[0]} ${parts[parts.length - 1].charAt(0)}.`;
}

function formatDateShort(date) {
  if (!date) return "";
  const d = new Date(date);
  return d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
  });
}

// Filter options
const FILTERS = [
  { key: "all", label: "All" },
  { key: "accepted", label: "Accepted" },
  { key: "in_progress", label: "In Progress" },
  { key: "completed", label: "Completed" },
];

export default function PipelinePage() {
  const router = useRouter();
  const { user } = useUser();
  const insets = useSafeAreaInsets();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeFilter, setActiveFilter] = useState("all");
  const [pipelineData, setPipelineData] = useState([]);

  const load = useCallback(async () => {
    if (!user?.id) return;

    try {
      const myId = user.id;

      // Fetch quotes
      const { data: quotes, error: qErr } = await supabase
        .from("tradify_native_app_db")
        .select(
          "id, request_id, client_id, status, issued_at, created_at, details, currency, grand_total, tax_total, valid_until"
        )
        .eq("trade_id", myId)
        .order("issued_at", { ascending: false, nullsFirst: false });
      if (qErr) throw qErr;

      const reqIds = [...new Set((quotes || []).map((q) => q.request_id))];

      // Fetch request docs
      let reqById = {};
      if (reqIds.length) {
        const { data: reqs } = await supabase
          .from("quote_requests")
          .select("id, suggested_title, postcode")
          .in("id", reqIds);
        (reqs || []).forEach((r) => (reqById[r.id] = r));
      }

      // Fetch client names via conversations
      let clientNameByRequestId = {};
      const { data: convData } = await supabase.rpc("rpc_list_conversations", {
        p_limit: 100,
      });
      if (convData) {
        convData.forEach((conv) => {
          if (conv.request_id && conv.other_party_name) {
            clientNameByRequestId[conv.request_id] = conv.other_party_name;
          }
        });
      }

      // Fetch client contact visibility and populate names
      let clientContactByRequestId = {};
      for (const reqId of reqIds) {
        try {
          const { data: contactData } = await supabase.rpc(
            "rpc_get_client_contact_for_request",
            { p_request_id: reqId }
          );
          if (contactData) {
            clientContactByRequestId[reqId] = contactData;
            // Also populate clientNameByRequestId from contact data
            if (contactData.name && !clientNameByRequestId[reqId]) {
              clientNameByRequestId[reqId] = contactData.name;
            }
          }
        } catch {
          // Silently fail
        }
      }

      // Fallback: Fetch client names directly from profiles for any missing names
      // Get client IDs from quotes
      const clientIds = [...new Set(
        (quotes || [])
          .map((q) => q.client_id)
          .filter(Boolean)
      )];

      if (clientIds.length > 0) {
        const { data: clientProfiles } = await supabase
          .from("profiles")
          .select("id, full_name")
          .in("id", clientIds);

        if (clientProfiles) {
          const profileById = {};
          clientProfiles.forEach((p) => {
            profileById[p.id] = p.full_name;
          });

          // Map client names back to request IDs via quotes
          (quotes || []).forEach((q) => {
            if (q.client_id && profileById[q.client_id] && !clientNameByRequestId[q.request_id]) {
              clientNameByRequestId[q.request_id] = profileById[q.client_id];
            }
          });
        }
      }

      // Fetch appointments
      const { data: apptData } = await supabase.rpc(
        "rpc_trade_list_appointments",
        { p_only_upcoming: false }
      );

      let appointmentsByQuote = {};
      (apptData || []).forEach((a) => {
        if (a.quote_id) {
          if (!appointmentsByQuote[a.quote_id]) appointmentsByQuote[a.quote_id] = [];
          appointmentsByQuote[a.quote_id].push({
            id: a.appointment_id || a.id,
            scheduled_at: a.scheduled_at,
            status: a.status,
            type: a.type,
          });
        }
      });

      // Process quotes into pipeline data
      const pipeline = (quotes || [])
        .filter((q) => {
          const status = (q.status || "").toLowerCase();
          return ["accepted", "awaiting_completion", "completed"].includes(status);
        })
        .map((q) => {
          const r = reqById[q.request_id];
          const status = (q.status || "").toLowerCase();

          const contactInfo = clientContactByRequestId[q.request_id] || {};
          const clientFullName = contactInfo.name || clientNameByRequestId[q.request_id] || null;
          const contactUnlocked = contactInfo.contact_unlocked || true; // Accepted quotes have unlocked contact

          const subtotal = q.grand_total || 0;
          const taxAmount = q.tax_total || subtotal * 0.2;

          // Get next appointment
          const quoteAppts = appointmentsByQuote[q.id] || [];
          const now = new Date();
          const upcomingAppts = quoteAppts
            .filter((a) => new Date(a.scheduled_at) > now)
            .sort((a, b) => new Date(a.scheduled_at) - new Date(b.scheduled_at));
          const nextAppointment = upcomingAppts[0] || null;

          let statusLabel = "Awaiting work date";
          let statusType = "accepted";
          if (status === "completed") {
            statusLabel = "Completed";
            statusType = "completed";
          } else if (status === "awaiting_completion") {
            statusLabel = "Awaiting completion";
            statusType = "in_progress";
          } else if (nextAppointment) {
            statusLabel = `Work scheduled ${formatDateShort(nextAppointment.scheduled_at)}`;
            statusType = "in_progress";
          }

          return {
            quoteId: q.id,
            requestId: q.request_id,
            title: r?.suggested_title || "Project",
            clientName: getClientDisplayName(clientFullName, contactUnlocked) || "Client",
            postcode: r?.postcode || null,
            status,
            statusLabel,
            statusType,
            subtotal,
            taxAmount,
            total: subtotal + taxAmount,
            nextAppointment,
            completedAt: status === "completed" ? q.issued_at : null,
          };
        });

      setPipelineData(pipeline);
    } catch (e) {
      console.error("Pipeline load error:", e);
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    if (user?.id) load();
  }, [user?.id, load]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  // Filter data
  const filteredData = useMemo(() => {
    if (activeFilter === "all") return pipelineData;
    if (activeFilter === "accepted") {
      return pipelineData.filter((p) => p.status === "accepted" && !p.nextAppointment);
    }
    if (activeFilter === "in_progress") {
      return pipelineData.filter((p) =>
        p.status === "awaiting_completion" ||
        (p.status === "accepted" && p.nextAppointment)
      );
    }
    if (activeFilter === "completed") {
      return pipelineData.filter((p) => p.status === "completed");
    }
    return pipelineData;
  }, [pipelineData, activeFilter]);

  // Calculate totals
  const totals = useMemo(() => {
    const accepted = pipelineData.filter((p) => p.status === "accepted" || p.status === "awaiting_completion");
    const completed = pipelineData.filter((p) => p.status === "completed");

    return {
      activeCount: accepted.length,
      activeValue: accepted.reduce((sum, p) => sum + p.subtotal, 0),
      activeValueWithVat: accepted.reduce((sum, p) => sum + p.total, 0),
      completedCount: completed.length,
      completedValue: completed.reduce((sum, p) => sum + p.subtotal, 0),
      completedValueWithVat: completed.reduce((sum, p) => sum + p.total, 0),
      totalValue: pipelineData.reduce((sum, p) => sum + p.subtotal, 0),
      totalValueWithVat: pipelineData.reduce((sum, p) => sum + p.total, 0),
    };
  }, [pipelineData]);

  const handleItemPress = (item) => {
    router.push(`/trades/quote/${item.quoteId}`);
  };

  const getStatusColor = (statusType) => {
    switch (statusType) {
      case "completed": return "#10B981";
      case "in_progress": return "#3B82F6";
      case "accepted": return "#F59E0B";
      default: return "#6B7280";
    }
  };

  if (loading) {
    return (
      <ThemedView style={[styles.container, { paddingTop: insets.top }]}>
        <ThemedStatusBar />
        <PipelinePageSkeleton paddingTop={0} />
      </ThemedView>
    );
  }

  return (
    <ThemedView style={[styles.container, { paddingTop: insets.top }]}>
      <ThemedStatusBar />

      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={10} style={styles.backButton}>
          <Ionicons name="chevron-back" size={24} color="#111827" />
        </Pressable>
        <ThemedText style={styles.headerTitle}>Pipeline</ThemedText>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        showsVerticalScrollIndicator={false}
      >
        {/* Summary Cards */}
        <View style={styles.summarySection}>
          <View style={styles.summaryCard}>
            <View style={styles.summaryCardHeader}>
              <Ionicons name="trending-up-outline" size={20} color="#111827" />
              <ThemedText style={styles.summaryCardTitle}>Active Pipeline</ThemedText>
            </View>
            <ThemedText style={styles.summaryCardValue}>
              {formatCurrency(totals.activeValue)}
            </ThemedText>
            <ThemedText style={styles.summaryCardSubtext}>
              {totals.activeCount} job{totals.activeCount !== 1 ? "s" : ""} · {formatCurrency(totals.activeValueWithVat)} inc. VAT
            </ThemedText>
          </View>

          <View style={styles.summaryCard}>
            <View style={styles.summaryCardHeader}>
              <Ionicons name="checkmark-circle-outline" size={20} color="#111827" />
              <ThemedText style={styles.summaryCardTitle}>Completed</ThemedText>
            </View>
            <ThemedText style={styles.summaryCardValue}>
              {formatCurrency(totals.completedValue)}
            </ThemedText>
            <ThemedText style={styles.summaryCardSubtext}>
              {totals.completedCount} job{totals.completedCount !== 1 ? "s" : ""} · {formatCurrency(totals.completedValueWithVat)} inc. VAT
            </ThemedText>
          </View>
        </View>

        {/* Filter Tabs */}
        <View style={styles.filterRow}>
          {FILTERS.map((filter) => (
            <Pressable
              key={filter.key}
              style={[
                styles.filterTab,
                activeFilter === filter.key && styles.filterTabActive,
              ]}
              onPress={() => setActiveFilter(filter.key)}
            >
              <ThemedText
                style={[
                  styles.filterTabText,
                  activeFilter === filter.key && styles.filterTabTextActive,
                ]}
              >
                {filter.label}
              </ThemedText>
            </Pressable>
          ))}
        </View>

        {/* Project Cards */}
        <View style={styles.projectsList}>
          {filteredData.length === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons name="folder-open-outline" size={48} color="#D1D5DB" />
              <Spacer height={12} />
              <ThemedText style={styles.emptyStateTitle}>No projects</ThemedText>
              <ThemedText style={styles.emptyStateText}>
                {activeFilter === "all"
                  ? "You don't have any accepted or completed projects yet."
                  : `No ${activeFilter.replace("_", " ")} projects found.`}
              </ThemedText>
            </View>
          ) : (
            filteredData.map((item) => (
              <Pressable
                key={item.quoteId}
                style={styles.projectCard}
                onPress={() => handleItemPress(item)}
              >
                <View style={styles.projectCardHeader}>
                  <View style={[styles.statusBadge, { backgroundColor: getStatusColor(item.statusType) + "20" }]}>
                    <View style={[styles.statusDot, { backgroundColor: getStatusColor(item.statusType) }]} />
                    <ThemedText style={[styles.statusText, { color: getStatusColor(item.statusType) }]}>
                      {item.statusLabel}
                    </ThemedText>
                  </View>
                </View>

                <ThemedText style={styles.projectTitle} numberOfLines={1}>
                  {item.title}
                </ThemedText>

                <View style={styles.projectMeta}>
                  <ThemedText style={styles.projectClient}>{item.clientName}</ThemedText>
                  {item.postcode && (
                    <>
                      <ThemedText style={styles.projectMetaDivider}>·</ThemedText>
                      <Ionicons name="location-outline" size={12} color="#9CA3AF" />
                      <ThemedText style={styles.projectLocation}>{item.postcode}</ThemedText>
                    </>
                  )}
                </View>

                <View style={styles.projectFooter}>
                  <View style={styles.projectPricing}>
                    <ThemedText style={styles.projectPrice}>{formatCurrencyFull(item.subtotal)}</ThemedText>
                    <ThemedText style={styles.projectPriceVat}>{formatCurrencyFull(item.total)} inc. VAT</ThemedText>
                  </View>
                  <Ionicons name="chevron-forward" size={20} color="#9CA3AF" />
                </View>
              </Pressable>
            ))
          )}
        </View>

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
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  loadingText: {
    fontSize: 16,
    color: "#6B7280",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
  },
  backButton: {
    padding: 4,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#111827",
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 20,
  },

  // Summary Section
  summarySection: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 20,
  },
  summaryCard: {
    flex: 1,
    backgroundColor: "#F9FAFB",
    borderRadius: 12,
    padding: 16,
  },
  summaryCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 8,
  },
  summaryCardTitle: {
    fontSize: 13,
    fontWeight: "500",
    color: "#6B7280",
  },
  summaryCardValue: {
    fontSize: 24,
    fontWeight: "700",
    color: "#111827",
  },
  summaryCardSubtext: {
    fontSize: 12,
    color: "#9CA3AF",
    marginTop: 4,
  },

  // Filter Tabs
  filterRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 20,
  },
  filterTab: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: "#F3F4F6",
  },
  filterTabActive: {
    backgroundColor: "#111827",
  },
  filterTabText: {
    fontSize: 13,
    fontWeight: "500",
    color: "#6B7280",
  },
  filterTabTextActive: {
    color: "#FFFFFF",
  },

  // Project Cards
  projectsList: {
    gap: 12,
  },
  projectCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  projectCardHeader: {
    marginBottom: 8,
  },
  statusBadge: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 6,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statusText: {
    fontSize: 12,
    fontWeight: "600",
  },
  projectTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#111827",
    marginBottom: 4,
  },
  projectMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginBottom: 12,
  },
  projectClient: {
    fontSize: 14,
    color: "#6B7280",
  },
  projectMetaDivider: {
    fontSize: 14,
    color: "#D1D5DB",
    marginHorizontal: 4,
  },
  projectLocation: {
    fontSize: 13,
    color: "#9CA3AF",
    marginLeft: 2,
  },
  projectFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderTopWidth: 1,
    borderTopColor: "#F3F4F6",
    paddingTop: 12,
  },
  projectPricing: {},
  projectPrice: {
    fontSize: 16,
    fontWeight: "600",
    color: "#111827",
  },
  projectPriceVat: {
    fontSize: 12,
    color: "#9CA3AF",
    marginTop: 2,
  },

  // Empty State
  emptyState: {
    alignItems: "center",
    paddingVertical: 48,
  },
  emptyStateTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#374151",
  },
  emptyStateText: {
    fontSize: 14,
    color: "#6B7280",
    textAlign: "center",
    marginTop: 4,
  },
});
