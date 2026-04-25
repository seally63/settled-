// app/(dashboard)/trades/quotes-overview.jsx
import { useEffect, useState, useCallback, useMemo } from "react";
import {
  StyleSheet,
  View,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  RefreshControl,
  Pressable,
  Alert,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import ThemedView from "../../../components/ThemedView";
import ThemedText from "../../../components/ThemedText";
import ThemedButton from "../../../components/ThemedButton";
import { SkeletonBox, SkeletonText } from "../../../components/Skeleton";
import { Colors } from "../../../constants/Colors";
import { supabase } from "../../../lib/supabase";
import { useUser } from "../../../hooks/useUser";
import { useTheme } from "../../../hooks/useTheme";
import { createJobFromQuote, markJobCompleted } from "../../../lib/api/trust";

const TABS = ["Draft", "Sent", "Status"];

export default function QuotesOverviewScreen() {
  const { user } = useUser();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { colors: c } = useTheme();

  const [activeTab, setActiveTab] = useState("Sent");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [rows, setRows] = useState([]);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      if (!user?.id) {
        setRows([]);
        return;
      }
      const { data, error } = await supabase
        .from("v_trades_sales")
        .select("*")
        .eq("kind", "quote")
        .order("issued_at", { ascending: false });
      if (error) throw error;
      setRows(data || []);
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    load();
  }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  // Filters for tabs
  const list = useMemo(() => {
    const norm = (s) => (s || "").toLowerCase();
    if (activeTab === "Draft") return rows.filter((r) => norm(r.status_norm) === "draft");
    if (activeTab === "Sent") return rows.filter((r) => norm(r.status_norm) === "sent");
    // Status tab: everything except draft & sent
    return rows.filter((r) => !["draft", "sent"].includes(norm(r.status_norm)));
  }, [rows, activeTab]);

  // Quick counts for Status tab (no "withdrawn")
  const statusCounts = useMemo(() => {
    const keys = ["accepted", "declined", "expired"];
    const acc = Object.fromEntries(keys.map((k) => [k, 0]));
    for (const r of rows) {
      const s = (r.status_norm || "").toLowerCase();
      if (acc.hasOwnProperty(s)) acc[s] += 1;
    }
    return acc;
  }, [rows]);

  return (
    <ThemedView style={{ flex: 1, backgroundColor: "#fff" }}>
      <StatusBar style="light" backgroundColor={Colors.primary} />

      {/* Header (purple) with BACK + centered title */}
      <View style={[styles.headerWrap, { paddingTop: insets.top, backgroundColor: Colors.primary }]}>
        <View style={styles.headerInner}>
          <Pressable
            onPress={() => router.replace("/sales")}
            hitSlop={10}
            style={{ position: "absolute", left: 16, top: 12, bottom: 12, justifyContent: "center" }}
          >
            <Ionicons name="chevron-back" size={24} color="#fff" />
          </Pressable>
          <ThemedText style={styles.headerTitle}>Quotes</ThemedText>
        </View>
      </View>

      {/* Segmented Tab Bar OUTSIDE the header */}
      <View style={styles.tabBarWrap}>
        <View style={styles.segment}>
          {TABS.map((t) => {
            const active = t === activeTab;
            return (
              <Pressable
                key={t}
                onPress={() => setActiveTab(t)}
                style={({ pressed }) => [
                  styles.tabBtn,
                  active && styles.tabBtnActive,
                  pressed && { opacity: 0.9 },
                ]}
              >
                <ThemedText style={[styles.tabText, active && styles.tabTextActive]}>{t}</ThemedText>
                {t === "Status" && (
                  <ThemedText style={styles.tabSub}>
                    {`Acc ${statusCounts.accepted}  •  Dec ${statusCounts.declined}  •  Exp ${statusCounts.expired}`}
                  </ThemedText>
                )}
              </Pressable>
            );
          })}
        </View>
      </View>

      <KeyboardAvoidingView
        behavior={Platform.select({ ios: "padding", android: undefined })}
        style={{ flex: 1 }}
        keyboardVerticalOffset={Platform.select({ ios: 10, android: 0 })}
      >
        <ScrollView
          contentContainerStyle={{ padding: 20, paddingBottom: 28 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          showsVerticalScrollIndicator={false}
        >
          {/* List */}
          {loading ? (
            // Inline list-row skeletons matching the actual QuoteRow layout
            // so the height and rhythm don't jump when data resolves.
            <>
              {[1, 2, 3].map((i) => (
                <View
                  key={i}
                  style={[
                    styles.rowCard,
                    { backgroundColor: c.elevate, borderColor: c.border, borderWidth: 1 },
                  ]}
                >
                  <SkeletonText width="55%" height={16} />
                  <SkeletonText width="80%" height={13} style={{ marginTop: 8 }} />
                  <SkeletonText width={120} height={20} style={{ marginTop: 12 }} />
                  <SkeletonText width={90} height={12} style={{ marginTop: 6 }} />
                </View>
              ))}
            </>
          ) : null}

          {!loading && list.map((r) => (
            <QuoteRow
              key={r.id}
              row={r}
              onPress={() => {
                // Wire up to your own detail screen if/when ready:
                // router.push(`/trades/quote/${r.id}`);
              }}
              onActionDone={load}
            />
          ))}

          <View style={{ height: 28 }} />
        </ScrollView>
      </KeyboardAvoidingView>
    </ThemedView>
  );
}

/* ---------- Small pieces ---------- */
function QuoteRow({ row, onPress, onActionDone }) {
  const issued = row.issued_at ? new Date(row.issued_at).toLocaleDateString() : "—";
  const due = row.due_date ? new Date(row.due_date).toLocaleDateString() : "—";
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [{ opacity: pressed ? 0.9 : 1 }]}>
      <View style={styles.rowCard}>
        <ThemedText style={styles.rowTitle}>Quote #{String(row.id).slice(0, 8)}</ThemedText>
        <ThemedText variant="muted" style={styles.rowSub}>
          Issued {issued} • Valid until {due}
        </ThemedText>
        <ThemedText style={styles.rowAmt}>{formatGBP(row.amount)}</ThemedText>
        <ThemedText variant="muted" style={styles.rowStatus}>
          {capitalize(row.status_norm || row.raw_status || "—")}
        </ThemedText>

        {/* Actions */}
        {(() => {
          const norm = (row.status_norm || "").toLowerCase();
          const canSchedule = norm === "accepted" && !row.job_id;
          const canMarkComplete = !!row.job_id && (String(row.job_status_norm || "").toLowerCase() !== "completed");
          if (!canSchedule && !canMarkComplete) return null;

          async function onSchedule() {
            try {
              await createJobFromQuote(row.id, row.title ?? null);
              Alert.alert("Job created", "A job was created from this quote.");
              onActionDone && onActionDone();
            } catch (e) {
              Alert.alert("Error", e?.message || "Failed to create job");
            }
          }

          async function onComplete() {
            try {
              await markJobCompleted(row.job_id);
              Alert.alert("Marked complete", "This job is now completed.");
              onActionDone && onActionDone();
            } catch (e) {
              Alert.alert("Error", e?.message || "Failed to mark as completed");
            }
          }

          return (
            <View style={{ flexDirection: "row", gap: 8, marginTop: 10 }}>
              {canSchedule ? (
                <ThemedButton onPress={onSchedule} style={{ paddingVertical: 12, paddingHorizontal: 14 }}>
                  <ThemedText style={{ color: "#fff", textAlign: "center", fontWeight: "700" }}>Schedule Job</ThemedText>
                </ThemedButton>
              ) : null}
              {canMarkComplete ? (
                <ThemedButton
                  onPress={onComplete}
                  style={{ paddingVertical: 12, paddingHorizontal: 14, backgroundColor: "#10b981" }}
                >
                  <ThemedText style={{ color: "#fff", textAlign: "center", fontWeight: "700" }}>Mark Completed</ThemedText>
                </ThemedButton>
              ) : null}
            </View>
          );
        })()}
      </View>
    </Pressable>
  );
}

/* ---------- Helpers ---------- */
function formatGBP(v) {
  try {
    return new Intl.NumberFormat("en-GB", {
      style: "currency",
      currency: "GBP",
      maximumFractionDigits: 2,
    }).format(v);
  } catch {
    return `£${Number(v || 0).toFixed(2)}`;
  }
}
function capitalize(s) {
  return (s || "").slice(0, 1).toUpperCase() + (s || "").slice(1);
}

/* ---------- styles ---------- */
const styles = StyleSheet.create({
  // Header
  headerWrap: {},
  headerInner: {
    paddingHorizontal: 20,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: { color: "#fff", fontSize: 18, fontWeight: "700" },

  // Segmented control container (outside header)
  tabBarWrap: {
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 6,
    backgroundColor: "#fff",
  },
  segment: {
    flexDirection: "row",
    backgroundColor: "#f1f5f9",
    borderRadius: 999,
    padding: 4,
  },
  tabBtn: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 999,
  },
  tabBtnActive: {
    backgroundColor: "#fff",
  },
  tabText: { fontWeight: "700" },
  tabTextActive: { color: Colors.primary },
  tabSub: { fontSize: 11, marginTop: 2 },

  // Summary placeholder
  summaryCard: {
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
    backgroundColor: "#F4F4F5",
  },
  summaryValue: { fontSize: 20, fontWeight: "800" },
  summaryLabel: { fontSize: 12 },

  // Quote row
  rowCard: {
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.06)",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 1,
  },
  rowTitle: { fontSize: 16, fontWeight: "700", marginBottom: 2 },
  rowSub: { fontSize: 12, marginBottom: 8 },
  rowAmt: { fontSize: 16, fontWeight: "800" },
  rowStatus: { fontSize: 12, marginTop: 4 },
});


