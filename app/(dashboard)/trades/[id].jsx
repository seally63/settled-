// app/(dashboard)/trades/[id].jsx
import { useEffect, useState, useCallback, useMemo } from "react";
import { StyleSheet, View, ScrollView, Image, Pressable, Alert } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";

import ThemedView from "../../../components/ThemedView";
import ThemedText from "../../../components/ThemedText";
import ThemedButton from "../../../components/ThemedButton";
import Spacer from "../../../components/Spacer";
import { Colors } from "../../../constants/Colors";

import { getTradeById, getMyRole } from "../../../lib/api/profile";
import { requestDirectQuote } from "../../../lib/api/directRequest"


function monthsSince(ts) {
  if (!ts) return null;
  const a = new Date(ts);
  const b = new Date();
  const months = (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth());
  return Math.max(0, months);
}

function Stars({ rating = 0 }) {
  // simple 0..5 stars (half-stars not implemented)
  const full = Math.round(rating);
  return (
    <View style={{ flexDirection: "row", alignItems: "center" }}>
      {Array.from({ length: 5 }).map((_, i) => (
        <Ionicons key={i} name={i < full ? "star" : "star-outline"} size={14} color="#fbbc04" style={{ marginRight: 2 }} />
      ))}
    </View>
  );
}

export default function TradeDetail() {
  const { id } = useLocalSearchParams();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [trade, setTrade] = useState(null);
  const [role, setRole] = useState(null);
  const [sending, setSending] = useState(false);

  const load = useCallback(async () => {
    try {
      const [t, r] = await Promise.all([getTradeById(id), getMyRole()]);
      setTrade(t);
      setRole(r);
    } catch (e) {
      Alert.alert("Error", e?.message || "Failed to load trade");
    }
  }, [id]);

  useEffect(() => {
    if (id) load();
  }, [id, load]);

  const monthsHosting = useMemo(() => monthsSince(trade?.created_at), [trade?.created_at]);

  async function onRequestQuote() {
    try {
      setSending(true);
      await requestDirectQuote(id, { details: null });
      Alert.alert("Request sent", "Your quote request has been sent.", [{ text: "OK", onPress: () => router.back() }]);
    } catch (e) {
      Alert.alert("Unable to request", e?.message || "Failed to send request.");
    } finally {
      setSending(false);
    }
  }

  // Combine rating + reviews like: ★★★★☆ 4.8 (30 reviews)
  const ratingText = useMemo(() => {
    const r = Number(trade?.rating_avg || 0);
    const c = Number(trade?.rating_count || 0);
    if (!r || !c) return "No reviews yet";
    return `${r.toFixed(2)} (${c} reviews)`;
  }, [trade?.rating_avg, trade?.rating_count]);

  return (
    <ThemedView style={{ flex: 1, backgroundColor: Colors.light.background }}>
      <StatusBar style="light" backgroundColor={Colors.primary} />
      <View style={[styles.header, { paddingTop: insets.top }]}>
        <Pressable onPress={() => router.back()} hitSlop={8} style={{ position: "absolute", left: 12, bottom: 14 }}>
          <Ionicons name="chevron-back" size={22} color="#fff" />
        </Pressable>
        <ThemedText style={styles.headerTitle}>Select a business</ThemedText>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
        {trade && (
          <>
            {/* Top card like your 6th screenshot */}
            <View style={styles.topCard}>
              <View style={{ alignItems: "center" }}>
                {trade.photo_url ? (
                  <Image source={{ uri: trade.photo_url }} style={styles.avatar} />
                ) : (
                  <View style={[styles.avatar, styles.avatarFallback]} />
                )}
              </View>

              <Spacer height={8} />
              <ThemedText style={styles.name}>{trade.full_name || trade.business_name || "Tradesperson"}</ThemedText>

              <View style={styles.metricsRow}>
                <Stars rating={Number(trade?.rating_avg || 0)} />
                <ThemedText style={styles.metricText}>{ratingText}</ThemedText>
                {monthsHosting != null && (
                  <ThemedText style={styles.metricText}>
                    • {monthsHosting} {monthsHosting === 1 ? "month" : "months"} on Settled
                  </ThemedText>
                )}
              </View>
            </View>

            {/* Clean info sections */}
            <View style={styles.infoCard}>
              {!!trade.business_name && (
                <>
                  <ThemedText style={styles.infoLabel}>Business name</ThemedText>
                  <ThemedText style={styles.infoValue}>{trade.business_name}</ThemedText>
                  <Spacer height={10} />
                </>
              )}

              {!!trade.trade_title && (
                <>
                  <ThemedText style={styles.infoLabel}>Trade</ThemedText>
                  <ThemedText style={styles.infoValue}>{trade.trade_title}</ThemedText>
                  <Spacer height={10} />
                </>
              )}

              {!!trade.bio && (
                <>
                  <ThemedText style={styles.infoLabel}>About</ThemedText>
                  <ThemedText style={styles.infoBody}>{trade.bio}</ThemedText>
                  <Spacer height={10} />
                </>
              )}

              {!!trade.service_areas && (
                <>
                  <ThemedText style={styles.infoLabel}>Service areas</ThemedText>
                  <ThemedText style={styles.infoBody}>{trade.service_areas}</ThemedText>
                </>
              )}
            </View>

            {/* Client-only CTA */}
            {role === "client" && (
              <>
                <Spacer height={16} />
                <ThemedButton disabled={sending} onPress={onRequestQuote}>
                  <ThemedText style={{ color: "#fff", fontWeight: "700", textAlign: "center" }}>
                    {sending ? "Sending…" : "Request a quote"}
                  </ThemedText>
                </ThemedButton>
              </>
            )}
          </>
        )}
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  header: { backgroundColor: Colors.primary, paddingBottom: 12, alignItems: "center", justifyContent: "center" },
  headerTitle: { color: "#fff", fontSize: 18, fontWeight: "700" },

  topCard: {
    borderRadius: 16,
    padding: 16,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.08)",
    alignItems: "center",
  },
  avatar: { width: 96, height: 96, borderRadius: 48, backgroundColor: "#eee" },
  avatarFallback: { borderWidth: StyleSheet.hairlineWidth, borderColor: "rgba(0,0,0,0.15)" },
  name: { fontWeight: "800", fontSize: 18, textAlign: "center" },
  metricsRow: { marginTop: 6, flexDirection: "row", alignItems: "center", flexWrap: "wrap", justifyContent: "center" },
  metricText: { marginLeft: 6, color: "#555" },

  infoCard: {
    marginTop: 14,
    borderRadius: 16,
    padding: 16,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.08)",
  },
  infoLabel: { fontSize: 12, color: "#666", fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.2 },
  infoValue: { fontSize: 16, fontWeight: "600" },
  infoBody: { fontSize: 15, lineHeight: 20 },
});
