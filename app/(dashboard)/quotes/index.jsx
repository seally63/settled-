// app/(dashboard)/quotes/index.jsx - Tradesman Projects (Quotes + Sales combined)
import { useCallback, useEffect, useState } from "react";
import {
  StyleSheet,
  View,
  ScrollView,
  Pressable,
  RefreshControl,
  ActivityIndicator,
} from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import ThemedView from "../../../components/ThemedView";
import ThemedText from "../../../components/ThemedText";
import Spacer from "../../../components/Spacer";
import { Colors } from "../../../constants/Colors";
import { useUser } from "../../../hooks/useUser";
import { supabase } from "../../../lib/supabase";

/* Chip components */
function Chip({ text, tone = "muted" }) {
  const tones = {
    muted: { bg: "#F1F5F9", fg: "#64748B" },
    brand: { bg: "#DBEAFE", fg: "#1E40AF" },
    success: { bg: "#D1FAE5", fg: "#065F46" },
    warning: { bg: "#FEF3C7", fg: "#92400E" },
    danger: { bg: "#FEE2E2", fg: "#991B1B" },
  };
  const c = tones[tone] || tones.muted;
  return (
    <View style={[styles.chip, { backgroundColor: c.bg }]}>
      <ThemedText style={[styles.chipText, { color: c.fg }]}>{text}</ThemedText>
    </View>
  );
}

/* Tab button */
function TabBtn({ active, label, count, onPress }) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={10}
      style={[
        styles.tabBtn,
        active && { backgroundColor: (Colors.light?.tint || "#0ea5e9") + "1A" },
      ]}
    >
      <ThemedText
        style={[
          styles.tabLabel,
          { color: active ? Colors.light?.tint || "#0ea5e9" : "#64748B" },
        ]}
      >
        {label}
        {typeof count === "number" ? ` (${count})` : ""}
      </ThemedText>
    </Pressable>
  );
}

export default function TradesmanProjects() {
  const router = useRouter();
  const { user } = useUser();

  const [activeTab, setActiveTab] = useState("active"); // active | completed | invoices
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Data
  const [inboxRows, setInboxRows] = useState([]);
  const [sentRows, setSentRows] = useState([]);
  const [invoices, setInvoices] = useState([]);

  const load = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);

    try {
      const myId = user.id;

      // Fetch request targets (inbox)
      const { data: targets, error: tErr } = await supabase
        .from("request_targets")
        .select("request_id, state, invited_by, created_at, trade_id")
        .eq("trade_id", myId)
        .order("created_at", { ascending: false });
      if (tErr) throw tErr;

      // Fetch quotes
      const { data: quotes, error: qErr } = await supabase
        .from("tradify_native_app_db")
        .select("id, request_id, status, issued_at, created_at, details, currency, grand_total, tax_total")
        .eq("trade_id", myId)
        .order("issued_at", { ascending: false, nullsFirst: false });
      if (qErr) throw qErr;

      const quotedReqIds = new Set((quotes || []).map((q) => q.request_id));

      const reqIds = Array.from(
        new Set([
          ...(targets || []).map((t) => t.request_id),
          ...(quotes || []).map((q) => q.request_id),
        ])
      );

      // Fetch request docs
      let reqById = {};
      if (reqIds.length) {
        const { data: reqs } = await supabase
          .from("quote_requests")
          .select("id, details, created_at, status, job_outcode, budget_band")
          .in("id", reqIds);
        (reqs || []).forEach((r) => (reqById[r.id] = r));
      }

      // INBOX (no quote created yet)
      const inbox = (targets || [])
        .filter((t) => !quotedReqIds.has(t.request_id))
        .map((t) => {
          const r = reqById[t.request_id];
          return {
            request_id: t.request_id,
            invited_at: t.created_at,
            request_type: t.invited_by || "system",
            state: t.state,
            title: extractTitle(r),
            created_at: r?.created_at,
            budget_band: r?.budget_band || null,
          };
        });

      // SENT (quote exists)
      const sent = (quotes || []).map((q) => {
        const r = reqById[q.request_id];
        const t = (targets || []).find(
          (tt) => tt.request_id === q.request_id && tt.trade_id === myId
        );
        return {
          id: q.id,
          request_id: q.request_id,
          status: (q.status || "").toLowerCase(),
          issued_at: q.issued_at ?? q.created_at,
          title: extractTitle(r),
          request_type: t?.invited_by || "system",
          budget_band: r?.budget_band || null,
          acceptedByTrade: t?.state === "accepted",
          currency: q.currency,
          grand_total: q.grand_total,
          tax_total: q.tax_total,
        };
      });

      setInboxRows(inbox);
      setSentRows(sent);

      // Fetch invoices from sales view
      const { data: invoiceData } = await supabase
        .from("v_trades_sales")
        .select("*")
        .eq("kind", "invoice")
        .order("issued_at", { ascending: false });
      setInvoices(invoiceData || []);
    } catch (e) {
      console.error("Load error:", e);
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

  const activeProjects = [...inboxRows, ...sentRows.filter(q => q.status !== "declined" && q.status !== "expired")];
  const completedProjects = sentRows.filter(q => q.status === "accepted" || q.status === "declined" || q.status === "expired");

  if (loading) {
    return (
      <ThemedView style={styles.container}>
        <View style={styles.center}>
          <ActivityIndicator size="large" color={Colors.light?.tint || "#0ea5e9"} />
        </View>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container} safe={true}>
      {/* Header */}
      <View style={styles.header}>
        <ThemedText style={styles.headerTitle}>Projects</ThemedText>
      </View>

      {/* Tabs */}
      <View style={styles.tabsRow}>
        <TabBtn
          active={activeTab === "active"}
          label="Active"
          count={activeProjects.length}
          onPress={() => setActiveTab("active")}
        />
        <TabBtn
          active={activeTab === "completed"}
          label="Completed"
          count={completedProjects.length}
          onPress={() => setActiveTab("completed")}
        />
        <TabBtn
          active={activeTab === "invoices"}
          label="Invoices"
          count={invoices.length}
          onPress={() => setActiveTab("invoices")}
        />
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        showsVerticalScrollIndicator={false}
      >
        {activeTab === "active" && <ActiveProjects data={activeProjects} router={router} />}
        {activeTab === "completed" && <CompletedProjects data={completedProjects} router={router} />}
        {activeTab === "invoices" && <Invoices data={invoices} router={router} />}
      </ScrollView>
    </ThemedView>
  );
}

/* Helper to extract title from request */
function extractTitle(req) {
  if (!req) return "Project";
  const lines = String(req.details || "").split("\n");
  return lines[0] || "Project";
}

/* Active Projects List */
function ActiveProjects({ data, router }) {
  if (!data.length) {
    return (
      <View style={styles.emptyState}>
        <Ionicons name="briefcase-outline" size={48} color="#D1D5DB" />
        <Spacer height={12} />
        <ThemedText style={styles.emptyTitle}>No active projects</ThemedText>
        <ThemedText style={styles.emptySubtitle}>
          New quote requests will appear here
        </ThemedText>
      </View>
    );
  }

  return (
    <View style={{ gap: 12 }}>
      {data.map((project) => {
        const isInbox = !project.id; // inbox items don't have quote id
        const chipTone = project.state === "accepted" ? "success" : project.state === "declined" ? "danger" : "brand";
        const chipLabel = isInbox
          ? project.state === "accepted"
            ? "Accepted"
            : project.state === "declined"
            ? "Declined"
            : "New request"
          : project.status === "accepted"
          ? "Accepted"
          : "Sent";

        return (
          <Pressable
            key={project.id || project.request_id}
            style={styles.projectCard}
            onPress={() => {
              if (isInbox) {
                router.push(`/quotes/request/${project.request_id}`);
              } else {
                router.push(`/quotes/${project.id}`);
              }
            }}
          >
            <View style={styles.projectHeader}>
              <ThemedText style={styles.projectTitle}>{project.title}</ThemedText>
              <Chip text={chipLabel} tone={chipTone} />
            </View>

            <Spacer height={8} />

            <View style={styles.projectMeta}>
              {project.budget_band && (
                <View style={styles.metaItem}>
                  <Ionicons name="pricetag-outline" size={14} color="#6B7280" />
                  <ThemedText style={styles.metaText}>{project.budget_band}</ThemedText>
                </View>
              )}
              {project.request_type && (
                <View style={styles.metaItem}>
                  <Ionicons name={project.request_type === "client" ? "person" : "globe"} size={14} color="#6B7280" />
                  <ThemedText style={styles.metaText}>
                    {project.request_type === "client" ? "Direct" : "Open"}
                  </ThemedText>
                </View>
              )}
            </View>

            {!isInbox && project.grand_total !== null && (
              <>
                <Spacer height={12} />
                <View style={styles.projectAmount}>
                  <ThemedText style={styles.amountLabel}>Quote total</ThemedText>
                  <ThemedText style={styles.amountValue}>
                    {project.currency || "GBP"} {Number(project.grand_total).toFixed(2)}
                  </ThemedText>
                </View>
              </>
            )}

            {isInbox && project.state === "accepted" && (
              <>
                <Spacer height={12} />
                <Pressable
                  style={styles.createQuoteBtn}
                  onPress={(e) => {
                    e.stopPropagation();
                    router.push({
                      pathname: "/quotes/create",
                      params: { requestId: project.request_id },
                    });
                  }}
                >
                  <ThemedText style={styles.createQuoteText}>Create quote</ThemedText>
                  <Ionicons name="arrow-forward" size={16} color="#FFF" />
                </Pressable>
              </>
            )}
          </Pressable>
        );
      })}
    </View>
  );
}

/* Completed Projects List */
function CompletedProjects({ data, router }) {
  if (!data.length) {
    return (
      <View style={styles.emptyState}>
        <Ionicons name="checkmark-circle-outline" size={48} color="#D1D5DB" />
        <Spacer height={12} />
        <ThemedText style={styles.emptyTitle}>No completed projects</ThemedText>
        <ThemedText style={styles.emptySubtitle}>
          Completed quotes will appear here
        </ThemedText>
      </View>
    );
  }

  return (
    <View style={{ gap: 12 }}>
      {data.map((project) => (
        <Pressable
          key={project.id}
          style={styles.projectCard}
          onPress={() => router.push(`/quotes/${project.id}`)}
        >
          <View style={styles.projectHeader}>
            <ThemedText style={styles.projectTitle}>{project.title}</ThemedText>
            <Chip
              text={project.status === "accepted" ? "Accepted" : project.status === "declined" ? "Declined" : "Expired"}
              tone={project.status === "accepted" ? "success" : "muted"}
            />
          </View>

          <Spacer height={8} />

          {project.grand_total !== null && (
            <View style={styles.projectAmount}>
              <ThemedText style={styles.amountLabel}>Quote total</ThemedText>
              <ThemedText style={styles.amountValue}>
                {project.currency || "GBP"} {Number(project.grand_total).toFixed(2)}
              </ThemedText>
            </View>
          )}
        </Pressable>
      ))}
    </View>
  );
}

/* Invoices List */
function Invoices({ data, router }) {
  if (!data.length) {
    return (
      <View style={styles.emptyState}>
        <Ionicons name="receipt-outline" size={48} color="#D1D5DB" />
        <Spacer height={12} />
        <ThemedText style={styles.emptyTitle}>No invoices</ThemedText>
        <ThemedText style={styles.emptySubtitle}>
          Create invoices for accepted projects
        </ThemedText>
      </View>
    );
  }

  return (
    <View style={{ gap: 12 }}>
      {data.map((invoice) => {
        const status = (invoice.status_norm || "").toLowerCase();
        const chipTone = status === "paid" ? "success" : status === "overdue" ? "danger" : "warning";
        const chipLabel = status === "paid" ? "Paid" : status === "overdue" ? "Overdue" : "Unpaid";

        return (
          <Pressable
            key={invoice.id}
            style={styles.projectCard}
            onPress={() => router.push(`/sales/invoice/${invoice.id}`)}
          >
            <View style={styles.projectHeader}>
              <ThemedText style={styles.projectTitle}>
                Invoice #{invoice.invoice_number || invoice.id}
              </ThemedText>
              <Chip text={chipLabel} tone={chipTone} />
            </View>

            <Spacer height={8} />

            <View style={styles.projectAmount}>
              <ThemedText style={styles.amountLabel}>Amount</ThemedText>
              <ThemedText style={styles.amountValue}>
                {invoice.currency || "GBP"} {Number(invoice.grand_total || 0).toFixed(2)}
              </ThemedText>
            </View>

            {invoice.issued_at && (
              <>
                <Spacer height={8} />
                <ThemedText style={styles.metaText}>
                  Issued: {new Date(invoice.issued_at).toLocaleDateString()}
                </ThemedText>
              </>
            )}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F9FAFB",
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 12,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: "700",
  },
  tabsRow: {
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 20,
    paddingBottom: 16,
  },
  tabBtn: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 999,
  },
  tabLabel: {
    fontSize: 14,
    fontWeight: "600",
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 40,
  },
  projectCard: {
    backgroundColor: "#FFF",
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: "#F3F4F6",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  projectHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 12,
  },
  projectTitle: {
    flex: 1,
    fontSize: 16,
    fontWeight: "600",
    lineHeight: 22,
  },
  projectMeta: {
    flexDirection: "row",
    gap: 16,
  },
  metaItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  metaText: {
    fontSize: 13,
    color: "#6B7280",
  },
  projectAmount: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  amountLabel: {
    fontSize: 13,
    color: "#6B7280",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  amountValue: {
    fontSize: 18,
    fontWeight: "700",
  },
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  chipText: {
    fontSize: 12,
    fontWeight: "600",
  },
  createQuoteBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: Colors.light?.tint || "#0ea5e9",
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
  },
  createQuoteText: {
    color: "#FFF",
    fontSize: 14,
    fontWeight: "600",
  },
  emptyState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 80,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#374151",
  },
  emptySubtitle: {
    fontSize: 14,
    color: "#6B7280",
    textAlign: "center",
    marginTop: 4,
  },
});
