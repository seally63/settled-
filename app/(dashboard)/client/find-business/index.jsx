// app/(dashboard)/client/find-business/index.jsx
import { useEffect, useState, useCallback, useMemo } from "react";
import {
  StyleSheet,
  View,
  FlatList,
  Pressable,
  Image,
  TextInput,
  ActivityIndicator,
  Alert,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import ThemedView from "../../../../components/ThemedView";
import ThemedText from "../../../../components/ThemedText";
import Spacer from "../../../../components/Spacer";
import { Colors } from "../../../../constants/Colors";

import { supabase } from "../../../../lib/supabase";
import { listPublicTrades, getMyRole } from "../../../../lib/api/profile";

/**
 * Behaviour:
 * - Search input at top
 * - Empty query -> Discover section (top 8–12 suggestions)
 * - With query   -> hide Discover, show filtered results
 * - Suggestions ranked by: has any verification > recent (updated_at/created_at) > small jitter
 * - One batched verification fetch (no N+1)
 * - Supports ?q=... to prefill search
 * - Role gate: clients only
 */

export default function FindBusinessIndex() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { q } = useLocalSearchParams();

  const [rows, setRows] = useState([]);
  const [verifMap, setVerifMap] = useState(new Map()); // id -> badgeCount
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [role, setRole] = useState(null);

  // prefill from ?q=
  useEffect(() => {
    if (typeof q === "string" && q.length) setQuery(q);
  }, [q]);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const [list, myRole] = await Promise.all([listPublicTrades({ limit: 50 }), getMyRole()]);
      setRows(list || []);
      setRole(myRole || null);

      // Batch verifications (ranking only)
      const ids = (list || []).map((t) => t.id).filter(Boolean);
      if (ids.length) {
        const { data, error } = await supabase
          .from("v_business_verification_public")
          .select("profile_id, companies_house_active, payments_verified, insurance_verified")
          .in("profile_id", ids);

        if (!error && Array.isArray(data)) {
          const m = new Map();
          for (const r of data) {
            const c =
              (r?.companies_house_active ? 1 : 0) +
              (r?.payments_verified ? 1 : 0) +
              (r?.insurance_verified ? 1 : 0);
            m.set(r.profile_id, c);
          }
          setVerifMap(m);
        } else {
          setVerifMap(new Map());
        }
      } else {
        setVerifMap(new Map());
      }
    } catch (e) {
      Alert.alert("Error", e?.message || "Failed to load businesses.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Only clients can use this page
  if (role && role !== "client") {
    return (
      <ThemedView style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
        <ThemedText>Not available for your role.</ThemedText>
      </ThemedView>
    );
  }

  // Stable random jitter per id
  const jitter = useMemo(() => {
    const m = new Map();
    (rows || []).forEach((r) => m.set(r.id, Math.random() * 0.01));
    return m;
  }, [rows]);

  // Suggestions scoring
  const suggestions = useMemo(() => {
    if (!rows?.length) return [];
    const scored = rows.map((t) => {
      const b = verifMap.get(t.id) || 0; // 0..3
      const verifiedBoost = b > 0 ? 100 : 0;
      const ts = Date.parse(t.updated_at || t.created_at || 0) || 0; // newer is better
      const rand = jitter.get(t.id) || 0;
      const score = verifiedBoost + b * 5 + ts / 1e11 + rand;
      return { t, score };
    });
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, 12).map((x) => x.t);
  }, [rows, verifMap, jitter]);

  // Filtered search
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const hay = (t) =>
      `${t.business_name || ""} ${t.full_name || ""} ${t.trade_title || ""}`.toLowerCase();
    return (rows || []).filter((t) => hay(t).includes(q));
  }, [rows, query]);

  const showDiscover = query.trim().length === 0;

  const renderItem = ({ item }) => (
    <Pressable style={styles.row} onPress={() => router.push(`/client/find-business/${item.id}`)}>
      <View style={styles.rowLeft}>
        {item.photo_url ? (
          <Image source={{ uri: item.photo_url }} style={styles.avatar} />
        ) : (
          <View style={[styles.avatar, styles.avatarFallback]} />
        )}
        <View style={{ marginLeft: 12 }}>
          <ThemedText style={styles.title}>
            {item.business_name || item.full_name || "Business"}
          </ThemedText>
          {!!item.trade_title && <ThemedText variant="muted">{item.trade_title}</ThemedText>}
        </View>
      </View>
      <Ionicons name="chevron-forward" size={18} color="#8a8a8a" />
    </Pressable>
  );

  return (
    <ThemedView style={{ flex: 1, backgroundColor: Colors.light.background }}>
      <StatusBar style="light" backgroundColor={Colors.primary} />
      <View style={[styles.header, { paddingTop: insets.top }]}>
        <ThemedText style={styles.headerTitle}>Find a business</ThemedText>
      </View>

      {/* Search input (kept) */}
      <View style={styles.searchWrap}>
        <View style={styles.searchBox}>
          <Ionicons name="search" size={18} color={Colors.primary} style={{ marginRight: 8 }} />
          <TextInput
            placeholder="Search by name or trade"
            placeholderTextColor="#9aa0a6"
            value={query}
            onChangeText={setQuery}
            style={styles.searchInput}
            returnKeyType="search"
          />
          {!!query && (
            <Pressable onPress={() => setQuery("")} hitSlop={8}>
              <Ionicons name="close-circle" size={18} color="#9aa0a6" />
            </Pressable>
          )}
        </View>
      </View>

      {/* Content */}
      {loading && showDiscover ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator />
        </View>
      ) : (
        <>
          {showDiscover ? (
            <FlatList
              data={suggestions}
              keyExtractor={(it) => String(it.id)}
              renderItem={renderItem}
              ItemSeparatorComponent={() => <Spacer height={6} />}
              ListHeaderComponent={
                <View style={{ paddingHorizontal: 16, paddingBottom: 8 }}>
                  <ThemedText title style={{ fontSize: 18, fontWeight: "800" }}>
                    Discover businesses
                  </ThemedText>
                  <ThemedText variant="muted" style={{ marginTop: 2 }}>
                    Suggested for you — verified first, then most recently active.
                  </ThemedText>
                </View>
              }
              contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 40 }}
              refreshing={loading}
              onRefresh={load}
              ListEmptyComponent={
                <View style={{ paddingHorizontal: 16, paddingVertical: 12 }}>
                  <ThemedText variant="muted">No suggestions right now.</ThemedText>
                </View>
              }
            />
          ) : (
            <FlatList
              data={filtered}
              keyExtractor={(it) => String(it.id)}
              renderItem={renderItem}
              ItemSeparatorComponent={() => <Spacer height={6} />}
              ListHeaderComponent={
                <View style={{ paddingHorizontal: 16, paddingBottom: 8 }}>
                  <ThemedText title style={{ fontSize: 18, fontWeight: "800" }}>
                    Search results
                  </ThemedText>
                </View>
              }
              contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 40 }}
              refreshing={loading}
              onRefresh={load}
              ListEmptyComponent={
                <View style={{ paddingHorizontal: 16, paddingVertical: 12 }}>
                  <ThemedText variant="muted">No businesses found.</ThemedText>
                </View>
              }
            />
          )}
        </>
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
  headerTitle: { color: "#fff", fontSize: 18, fontWeight: "700" },

  searchWrap: { padding: 16 },
  searchBox: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 24,
    borderWidth: 1,
    borderColor: Colors.primary,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: "#fff",
  },
  searchInput: { flex: 1, fontSize: 16 },

  row: {
    paddingVertical: 12,
    paddingHorizontal: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.08)",
    backgroundColor: "#fff",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  rowLeft: { flexDirection: "row", alignItems: "center" },
  avatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: "#eee" },
  avatarFallback: { borderWidth: StyleSheet.hairlineWidth, borderColor: "rgba(0,0,0,0.15)" },
  title: { fontWeight: "700" },
});



