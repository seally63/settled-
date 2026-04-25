// app/(dashboard)/sales.jsx
import { useEffect, useState, useCallback, useMemo } from "react";
import {
  StyleSheet,
  View,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  RefreshControl,
  Pressable,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";

import ThemedView from "../../components/ThemedView";
import ThemedText from "../../components/ThemedText";
import ThemedButton from "../../components/ThemedButton";
import { LayoutGateSkeleton } from "../../components/Skeleton";
import { Colors } from "../../constants/Colors";
import { supabase } from "../../lib/supabase";
import { useUser } from "../../hooks/useUser";

/** ---------- WRAPPER: role guard keeps hook order stable ---------- */
export default function SalesScreen() {
  const { user } = useUser();
  const router = useRouter();

  const [role, setRole] = useState(null);
  const [roleLoading, setRoleLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        if (!user?.id) {
          if (alive) {
            setRole("guest");
            setRoleLoading(false);
          }
          return;
        }
        const { data, error } = await supabase
          .from("profiles")
          .select("role")
          .eq("id", user.id)
          .single();
        if (alive) {
          setRole(error ? "client" : (data?.role || "client"));
          setRoleLoading(false);
        }
      } catch {
        if (alive) {
          setRole("client");
          setRoleLoading(false);
        }
      }
    })();
    return () => {
      alive = false;
    };
  }, [user?.id]);

  // Redirect non-trades away; wrapper always renders same hooks
  useEffect(() => {
    if (roleLoading) return;
    if (role !== "trades") {
      router.replace("/client"); // or "/profile"
    }
  }, [roleLoading, role, router]);

  if (roleLoading || role !== "trades") {
    return (
      <ThemedView style={{ flex: 1 }}>
        <LayoutGateSkeleton />
      </ThemedView>
    );
  }

  // Only render the heavy Sales body for trades
  return <SalesBody />;
}

/** ---------- BODY: original Sales screen (quotes + invoices only) ---------- */
function SalesBody() {
  const { user } = useUser();
  const insets = useSafeAreaInsets();
  const router = useRouter();

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

  const quoteCounts = useMemo(
    () => countStatuses(rows, "quote", ["sent", "accepted", "declined", "expired"]),
    [rows]
  );
  const invoiceCounts = useMemo(
    () => countStatuses(rows, "invoice", ["unpaid", "overdue", "paid"]),
    [rows]
  );

  return (
    <ThemedView style={{ flex: 1, backgroundColor: "#FFFFFF" }}>
      <StatusBar style="light" backgroundColor={Colors.primary} />

      {/* Header — matches profile.jsx */}
      <View style={[styles.headerWrap, { paddingTop: insets.top, backgroundColor: Colors.primary }]}>
        <View style={styles.headerInner}>
          <ThemedText style={styles.headerTitle}>Sales</ThemedText>
        </View>
      </View>

      <KeyboardAvoidingView
        behavior={Platform.select({ ios: "padding", android: undefined })}
        style={{ flex: 1 }}
        keyboardVerticalOffset={Platform.select({ ios: 10, android: 0 })}
      >
        <ScrollView
          contentContainerStyle={styles.container}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          showsVerticalScrollIndicator={false}
        >
          {/* Quotes card (clickable + CTA) */}
          <CategoryCard
            title="Quotes"
            caption={loading ? "Loading…" : "Your quotes at a glance"}
            items={[
              { label: "Sent", value: quoteCounts.sent },
              { label: "Accepted", value: quoteCounts.accepted },
              { label: "Declined", value: quoteCounts.declined },
              { label: "Expired", value: quoteCounts.expired },
            ]}
            tone="mint"
            onPress={() => router.push("/trades/quotes-overview")}
          >
            <ThemedButton onPress={() => router.push("/trades/new-quote")}>
              <ThemedText style={styles.btnText}>New Quote</ThemedText>
            </ThemedButton>
          </CategoryCard>

          {/* Invoices card (clickable + CTA) */}
          <CategoryCard
            title="Invoices"
            caption={loading ? "Loading…" : "Your invoice status"}
            items={[
              { label: "Unpaid", value: invoiceCounts.unpaid },
              { label: "Overdue", value: invoiceCounts.overdue },
              { label: "Paid", value: invoiceCounts.paid },
            ]}
            tone="coral"
            onPress={() => router.push("/trades/invoices-overview")}
          >
            <ThemedButton onPress={() => router.push("/trades/new-invoice")}>
              <ThemedText style={styles.btnText}>New Invoice</ThemedText>
            </ThemedButton>
          </CategoryCard>

          <View style={{ height: 28 }} />
        </ScrollView>
      </KeyboardAvoidingView>
    </ThemedView>
  );
}

/* ---------- Helpers ---------- */
function countStatuses(rows, kind, keys) {
  const result = Object.fromEntries(keys.map((k) => [k, 0]));
  for (const r of rows || []) {
    if (r.kind !== kind) continue;
    const s = (r.status_norm || "").toLowerCase();
    if (Object.prototype.hasOwnProperty.call(result, s)) result[s] += 1;
  }
  return result;
}

/* ---------- Presentational ---------- */
function CategoryCard({ title, caption, items, tone = "mint", onPress, children }) {
  const colors = tone === "coral" ? coralTone : mintTone;

  return (
    <Pressable onPress={onPress} style={({ pressed }) => [{ opacity: pressed ? 0.9 : 1 }]}>
      {/* Card is now WHITE, badge keeps tone */}
      <View style={[styles.card, { backgroundColor: "#fff" }]}>
        {/* Header row */}
        <View style={styles.cardHeaderRow}>
          <View style={[styles.circleIcon, { backgroundColor: colors.badge }]} />
          <ThemedText title style={styles.cardTitle}>{title}</ThemedText>
          <View style={{ flex: 1 }} />
        </View>

        {caption ? <ThemedText variant="muted" style={styles.cardCaption}>{caption}</ThemedText> : null}

        {/* KPI grid */}
        <View style={styles.kpiRow}>
          {items.map((it) => (
            <View key={it.label} style={styles.kpiCol}>
              <ThemedText style={styles.kpiValue}>{String(it.value ?? 0)}</ThemedText>
              <ThemedText variant="muted" style={styles.kpiLabel}>{it.label}</ThemedText>
            </View>
          ))}
        </View>

        {/* CTA row */}
        <View style={{ marginTop: 12 }}>
          {children}
        </View>
      </View>
    </Pressable>
  );
}

const mintTone = { bg: "#E6F5EC", badge: "#CDECDC" };
const coralTone = { bg: "#FBE4E1", badge: "#F6C9C4" };

/* ---------- Styles ---------- */
const styles = StyleSheet.create({
  headerWrap: {},
  headerInner: {
    paddingHorizontal: 20,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: { color: "#fff", fontSize: 18, fontWeight: "700" },

  container: { padding: 20 },

  card: {
    borderRadius: 16,
    padding: 16,
    marginBottom: 14,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  cardHeaderRow: { flexDirection: "row", alignItems: "center", marginBottom: 8 },
  circleIcon: { width: 28, height: 28, borderRadius: 14, marginRight: 10 },
  cardTitle: { fontSize: 16, fontWeight: "700" },
  cardCaption: { fontSize: 12, marginTop: 2 },

  kpiRow: { flexDirection: "row", justifyContent: "space-between", marginTop: 14 },
  kpiCol: { flex: 1, alignItems: "flex-start", paddingRight: 8 },
  kpiValue: { fontSize: 22, fontWeight: "800" },
  kpiLabel: { fontSize: 12 },

  btnText: { color: "#fff", textAlign: "center", fontWeight: "700" },
});






