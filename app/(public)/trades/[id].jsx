// app/(public)/trades/[id].jsx
import { useEffect, useState, useCallback, useMemo } from "react";
import {
  StyleSheet,
  View,
  ScrollView,
  Image,
  Pressable,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";

import ThemedView from "../../../components/ThemedView";
import ThemedText from "../../../components/ThemedText";
import ThemedButton from "../../../components/ThemedButton";
import Spacer from "../../../components/Spacer";
import { ProfilePageSkeleton } from "../../../components/Skeleton";
import { Colors } from "../../../constants/Colors";

import { useUser } from "../../../hooks/useUser";
import { getTradeById } from "../../../lib/api/profile";
import {
  getBusinessVerificationPublic,
  getTradePublicMetrics90d,
} from "../../../lib/api/trust";

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

function Stars({ rating = 0 }) {
  const full = Math.round(Number(rating) || 0);
  return (
    <View style={{ flexDirection: "row", alignItems: "center" }}>
      {Array.from({ length: 5 }).map((_, i) => (
        <Ionicons
          key={i}
          name={i < full ? "star" : "star-outline"}
          size={14}
          color="#fbbc04"
          style={{ marginRight: 2 }}
        />
      ))}
    </View>
  );
}

export default function PublicTradeProfile() {
  const { id } = useLocalSearchParams(); // trade profile_id
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useUser();

  const [loading, setLoading] = useState(true);
  const [trade, setTrade] = useState(null);
  const [badges, setBadges] = useState(null);
  const [metrics, setMetrics] = useState(null);

  const isOwner = useMemo(
    () => !!user?.id && String(user.id) === String(id),
    [user?.id, id]
  );

  const load = useCallback(async () => {
    if (!id) return;
    try {
      setLoading(true);
      const [t, b, m] = await Promise.all([
        getTradeById(id).catch(() => null), // OK if RLS blocks
        getBusinessVerificationPublic(id).catch(() => null),
        getTradePublicMetrics90d(id).catch(() => null),
      ]);
      setTrade(t);
      setBadges(b);
      setMetrics(m);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <ThemedView style={{ flex: 1, backgroundColor: Colors.light.background }}>
      <StatusBar style="light" backgroundColor={Colors.primary} />

      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top }]}>
        <Pressable
          onPress={() => (router.canGoBack() ? router.back() : router.replace("/client/find-business"))}
          hitSlop={8}
          style={styles.backBtn}
        >
          <Ionicons name="chevron-back" size={22} color="#fff" />
        </Pressable>
        <ThemedText style={styles.headerTitle}>Business profile</ThemedText>
      </View>

      {loading ? (
        <ProfilePageSkeleton paddingTop={16} />
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: 16, paddingBottom: 32 + insets.bottom }}
          showsVerticalScrollIndicator={false}
        >
          {/* Identity card */}
          <View style={styles.card}>
            <View style={{ alignItems: "center" }}>
              {trade?.photo_url ? (
                <Image source={{ uri: trade.photo_url }} style={styles.avatar} />
              ) : (
                <View style={[styles.avatar, styles.avatarFallback]} />
              )}
            </View>

            <Spacer height={8} />
            <ThemedText style={styles.name}>
              {trade?.business_name || trade?.full_name || "Business"}
            </ThemedText>

            {/* Rating row if you have it */}
            {(trade?.rating_avg != null || trade?.rating_count != null) && (
              <View style={{ marginTop: 4, flexDirection: "row", gap: 6, alignItems: "center", justifyContent: "center" }}>
                <Stars rating={trade?.rating_avg || 0} />
                <ThemedText variant="muted">
                  {Number(trade?.rating_avg || 0).toFixed(2)}{" "}
                  {trade?.rating_count ? `(${trade.rating_count} reviews)` : ""}
                </ThemedText>
              </View>
            )}

            {!!trade?.trade_title && (
              <ThemedText variant="muted" style={{ marginTop: 6 }}>
                {trade.trade_title}
              </ThemedText>
            )}

            {!!trade?.bio && (
              <>
                <Spacer height={12} />
                <ThemedText style={styles.sectionLabel}>About</ThemedText>
                <ThemedText style={styles.body}>{trade.bio}</ThemedText>
              </>
            )}

            {!!trade?.service_areas && (
              <>
                <Spacer height={12} />
                <ThemedText style={styles.sectionLabel}>Service areas</ThemedText>
                <ThemedText style={styles.body}>{trade.service_areas}</ThemedText>
              </>
            )}

            {/* If this is the owner, let them jump straight to the editor */}
            {isOwner ? (
              <>
                <Spacer height={12} />
                <ThemedButton onPress={() => router.push("/profile/edit")}>
                  <ThemedText style={{ color: "#fff", fontWeight: "700", textAlign: "center" }}>
                    Edit my public info
                  </ThemedText>
                </ThemedButton>
              </>
            ) : null}
          </View>

          {/* Trust badges — only show pills that are true */}
          {badges && (badges.companies_house_active || badges.payments_verified || badges.insurance_verified) && (
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

          {/* 90-day KPIs — hide if both null */}
          {metrics && (metrics.response_time_p50_hours != null || metrics.acceptance_rate != null) && (
            <View style={styles.card}>
              <ThemedText style={styles.sectionLabel}>Performance (90 days)</ThemedText>
              <Spacer height={8} />
              <View style={styles.kpiRow}>
                <View style={styles.kpiCol}>
                  <ThemedText style={styles.kpiLabel}>Median reply</ThemedText>
                  <ThemedText style={styles.kpiValue}>
                    {fmtHours(metrics.response_time_p50_hours)}
                  </ThemedText>
                </View>
                <View style={styles.kpiCol}>
                  <ThemedText style={styles.kpiLabel}>Acceptance</ThemedText>
                  <ThemedText style={styles.kpiValue}>
                    {fmtPct(metrics.acceptance_rate)}
                  </ThemedText>
                </View>
              </View>
            </View>
          )}
        </ScrollView>
      )}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  header: {
    backgroundColor: Colors.primary,
    paddingBottom: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  backBtn: { position: "absolute", left: 12, bottom: 14 },
  headerTitle: { color: "#fff", fontSize: 18, fontWeight: "700" },

  card: {
    borderRadius: 16,
    padding: 16,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.08)",
    marginBottom: 12,
  },

  avatar: { width: 96, height: 96, borderRadius: 48, backgroundColor: "#eee" },
  avatarFallback: { borderWidth: StyleSheet.hairlineWidth, borderColor: "rgba(0,0,0,0.15)" },
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
});

