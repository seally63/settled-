// app/(dashboard)/profile/index.jsx
import { useEffect, useState, useCallback } from "react";
import { StyleSheet, View, ScrollView, Image, ActivityIndicator, Alert } from "react-native";
import { StatusBar } from "expo-status-bar";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import ThemedView from "../../../components/ThemedView";
import ThemedText from "../../../components/ThemedText";
import ThemedButton from "../../../components/ThemedButton";
import Spacer from "../../../components/Spacer";
import { Colors } from "../../../constants/Colors";

import { useUser } from "../../../hooks/useUser";
import { getMyRole, getTradeById, getMyProfile } from "../../../lib/api/profile";
import { getBusinessVerificationPublic, getTradePublicMetrics90d } from "../../../lib/api/trust";

// Keep tab label + icon
export const options = {
  title: "Profile",
  tabBarIcon: ({ color, size, focused }) => (
    <Ionicons name={focused ? "person" : "person-outline"} size={size} color={color} />
  ),
};

function fmtHours(n) {
  if (n == null || isNaN(n)) return "—";
  const v = Number(n);
  if (v < 1) return `${(v * 60).toFixed(0)}m`;
  if (v < 10) return `${v.toFixed(1)}h`;
  return `${Math.round(v)}h`;
}
function fmtPct(n) {
  if (n == null || isNaN(n)) return "—";
  return `${Math.round(Number(n) * 100)}%`;
}
function normalizeRole(r) {
  if (r == null) return null;
  const s = String(r).trim().toLowerCase();
  if (["trade", "trades", "tradesman", "tradesperson", "business", "pro"].includes(s)) return "trades";
  if (["client", "customer", "homeowner", "user"].includes(s)) return "client";
  return s;
}

export default function MyProfileScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user, authChecked, logout } = useUser();

  const [role, setRole] = useState(null); // "client" | "trades" | "guest" | "unknown"
  const [roleLoading, setRoleLoading] = useState(true);

  // Data used for UI
  const [selfProfile, setSelfProfile] = useState(null); // for both roles
  const [trade, setTrade] = useState(null);             // for trades only
  const [badges, setBadges] = useState(null);           // trades
  const [metrics, setMetrics] = useState(null);         // trades
  const [loadingData, setLoadingData] = useState(true);

  const onLogout = useCallback(() => {
    Alert.alert("Log out", "Are you sure you want to log out?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Log out",
        style: "destructive",
        onPress: async () => {
          try {
            await logout?.();
          } finally {
            router.replace("/");
          }
        },
      },
    ]);
  }, [logout, router]);

  // Determine role (normalized)
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        if (!authChecked) return;
        if (!user?.id) {
          if (alive) { setRole("guest"); setRoleLoading(false); }
          return;
        }
        const r = await getMyRole();
        const norm = normalizeRole(r);
        if (alive) { setRole(norm ?? "unknown"); setRoleLoading(false); }
      } catch {
        if (alive) { setRole("unknown"); setRoleLoading(false); }
      }
    })();
    return () => { alive = false; };
  }, [user?.id, authChecked]);

  // Load profile data for both roles; for trades also load trust + KPIs
  useEffect(() => {
    let alive = true;
    (async () => {
      if (!user?.id) return;
      try {
        setLoadingData(true);
        const me = await getMyProfile();
        if (alive) setSelfProfile(me || null);

        // If trades, load public/trust/metrics
        const r = role;
        if (r === "trades") {
          const [t, b, m] = await Promise.all([
            getTradeById(user.id),
            getBusinessVerificationPublic(user.id),
            getTradePublicMetrics90d(user.id),
          ]);
          if (alive) {
            setTrade(t || null);
            setBadges(b || null);
            setMetrics(m || null);
          }
        } else {
          if (alive) {
            setTrade(null);
            setBadges(null);
            setMetrics(null);
          }
        }
      } finally {
        if (alive) setLoadingData(false);
      }
    })();
    return () => { alive = false; };
  }, [user?.id, role]);

  if (roleLoading || loadingData) {
    return (
      <ThemedView style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator />
      </ThemedView>
    );
  }

  const isTrades = role === "trades";
  const isClient = role === "client";

  // Build a single "identity" object so UI looks the same for both roles
  const identity = isTrades ? (trade || selfProfile || {}) : (selfProfile || {});

  return (
    <ThemedView style={{ flex: 1, backgroundColor: "#F9FAFB" }} safe={true}>
      {/* Header */}
      <View style={styles.header}>
        <ThemedText style={styles.headerTitle}>Profile</ThemedText>
      </View>

      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 32 + insets.bottom }}>
        {/* ===== CLIENTS: Private notice card (extra), but same overall layout ===== */}
        {isClient && (
          <View style={styles.card}>
            <ThemedText style={styles.sectionLabel}>Private profile</ThemedText>
            <Spacer height={8} />
            <ThemedText style={styles.body}>
              Your details are <ThemedText style={{ fontWeight: "800" }}>not shown publicly</ThemedText>. You can edit them to help with booking and messages via the app only.
            </ThemedText>
          </View>
        )}

        {/* Identity card — shown for both roles, same look */}
        <View style={styles.card}>
          <View style={{ alignItems: "center" }}>
            {identity?.photo_url ? (
              <Image source={{ uri: identity.photo_url }} style={styles.avatar} />
            ) : (
              <View style={[styles.avatar, styles.avatarFallback]} />
            )}
          </View>

          <Spacer height={8} />
          <ThemedText style={styles.name}>
            {identity?.business_name || identity?.full_name || "Profile"}
          </ThemedText>

          {/* Show relevant fields if present */}
          {!!identity?.trade_title && (
            <>
              <Spacer height={6} />
              <ThemedText style={styles.body}>{identity.trade_title}</ThemedText>
            </>
          )}

          {!!identity?.service_areas && (
            <>
              <Spacer height={10} />
              <ThemedText style={styles.sectionLabel}>Service areas</ThemedText>
              <ThemedText style={styles.body}>{identity.service_areas}</ThemedText>
            </>
          )}

          {!!identity?.bio && (
            <>
              <Spacer height={10} />
              <ThemedText style={styles.sectionLabel}>About</ThemedText>
              <ThemedText style={styles.body}>{identity.bio}</ThemedText>
            </>
          )}

          <Spacer height={12} />
          {user?.id ? (
            <ThemedButton onPress={() => router.push("/profile/edit")}>
              <ThemedText style={styles.buttonText}>Edit profile</ThemedText>
            </ThemedButton>
          ) : null}
        </View>

        {/* Trades-only extras: Trust + KPIs */}
        {isTrades && badges && (badges.companies_house_active || badges.payments_verified || badges.insurance_verified) && (
          <View style={styles.card}>
            <ThemedText style={styles.sectionLabel}>Trust</ThemedText>
            <Spacer height={8} />
            <View style={styles.badgeRow}>
              {badges.companies_house_active ? (
                <View style={styles.pill}>
                  <ThemedText style={styles.pillText}>✅ Companies House</ThemedText>
                </View>
              ) : null}
              {badges.payments_verified ? (
                <View style={styles.pill}>
                  <ThemedText style={styles.pillText}>✅ Payments Verified</ThemedText>
                </View>
              ) : null}
              {badges.insurance_verified ? (
                <View style={styles.pill}>
                  <ThemedText style={styles.pillText}>✅ Insurance</ThemedText>
                </View>
              ) : null}
            </View>
          </View>
        )}

        {isTrades && metrics && (metrics.response_time_p50_hours != null || metrics.acceptance_rate != null) && (
          <View style={styles.card}>
            <ThemedText style={styles.sectionLabel}>Performance (90 days)</ThemedText>
            <Spacer height={8} />
            <View style={styles.kpiRow}>
              <View style={styles.kpiCol}>
                <ThemedText style={styles.kpiLabel}>Median response</ThemedText>
                <ThemedText style={styles.kpiValue}>{fmtHours(metrics.response_time_p50_hours)}</ThemedText>
              </View>
              <View style={styles.kpiCol}>
                <ThemedText style={styles.kpiLabel}>Acceptance rate</ThemedText>
                <ThemedText style={styles.kpiValue}>{fmtPct(metrics.acceptance_rate)}</ThemedText>
              </View>
            </View>
          </View>
        )}

        {/* Bottom: Logout button (for anyone logged in) */}
        {user?.id ? (
          <>
            <Spacer height={20} />
            <ThemedButton onPress={onLogout} style={{ backgroundColor: "#ef4444" }}>
              <ThemedText style={styles.buttonText}>Log out</ThemedText>
            </ThemedButton>
          </>
        ) : null}
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 12,
  },
  headerTitle: { fontSize: 28, fontWeight: "700" },

  card: {
    borderRadius: 16,
    padding: 16,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.08)",
    marginBottom: 12,
  },

  avatar: { width: 96, height: 96, borderRadius: 48, backgroundColor: "#eee" },
  avatarFallback: { alignItems: "center", justifyContent: "center" },
  name: { fontWeight: "800", fontSize: 18, textAlign: "center" },

  sectionLabel: { fontSize: 12, color: "#666", fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.2 },
  body: { fontSize: 15, lineHeight: 20, marginTop: 4 },

  badgeRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  pill: { paddingVertical: 6, paddingHorizontal: 10, borderRadius: 999, backgroundColor: "#f1f5f9" },
  pillText: { fontWeight: "700" },

  kpiRow: { flexDirection: "row", justifyContent: "space-between" },
  kpiCol: { flex: 1, alignItems: "flex-start", paddingRight: 8 },
  kpiLabel: { fontSize: 12, color: "#666", fontWeight: "700", textTransform: "uppercase" },
  kpiValue: { fontSize: 18, fontWeight: "800", marginTop: 2 },

  buttonText: { color: "#fff", textAlign: "center", fontWeight: "700" },
});






