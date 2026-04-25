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
  Keyboard,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import ThemedView from "../../../../components/ThemedView";
import ThemedText from "../../../../components/ThemedText";
import Spacer from "../../../../components/Spacer";
import { Colors } from "../../../../constants/Colors";
import { useTheme } from "../../../../hooks/useTheme";

import { supabase } from "../../../../lib/supabase";
import { listPublicTrades, getMyRole } from "../../../../lib/api/profile";
import ThemedStatusBar from "../../../../components/ThemedStatusBar";

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
  const { colors: c } = useTheme();
  const { q, category, service } = useLocalSearchParams();

  const [rows, setRows] = useState([]);
  const [verifMap, setVerifMap] = useState(new Map()); // id -> badgeCount
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [role, setRole] = useState(null);

  // Category/service filter from navigation params
  const categoryFilter = typeof category === "string" ? category : null;
  const serviceFilter = typeof service === "string" ? service : null;

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

  // Apply category filter to rows (trade_title or job_titles contains the category term)
  const categoryFilteredRows = useMemo(() => {
    if (!categoryFilter) return rows || [];
    const catLower = categoryFilter.toLowerCase();
    return (rows || []).filter((t) => {
      const hay = `${t.trade_title || ""} ${(t.job_titles || []).join(" ")}`.toLowerCase();
      return hay.includes(catLower);
    });
  }, [rows, categoryFilter]);

  // Suggestions scoring
  const suggestions = useMemo(() => {
    const source = categoryFilteredRows;
    if (!source?.length) return [];
    const scored = source.map((t) => {
      const b = verifMap.get(t.id) || 0; // 0..3
      const verifiedBoost = b > 0 ? 100 : 0;
      const ts = Date.parse(t.updated_at || t.created_at || 0) || 0; // newer is better
      const rand = jitter.get(t.id) || 0;
      const score = verifiedBoost + b * 5 + ts / 1e11 + rand;
      return { t, score };
    });
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, 50).map((x) => x.t);
  }, [categoryFilteredRows, verifMap, jitter]);

  // Filtered search (respects category filter too)
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const hay = (t) =>
      `${t.business_name || ""} ${t.full_name || ""} ${t.trade_title || ""}`.toLowerCase();
    return categoryFilteredRows.filter((t) => hay(t).includes(q));
  }, [categoryFilteredRows, query]);

  const showDiscover = query.trim().length === 0;

  const renderItem = ({ item }) => (
    <Pressable
      style={[
        styles.row,
        { backgroundColor: c.elevate, borderColor: c.border },
      ]}
      onPress={() =>
        router.push({
          pathname: "/client/trade-profile",
          params: { tradeId: item.id },
        })
      }
    >
      <View style={styles.rowLeft}>
        {item.photo_url ? (
          <Image source={{ uri: item.photo_url }} style={[styles.avatar, { backgroundColor: c.elevate2 }]} />
        ) : (
          <View style={[styles.avatar, { backgroundColor: c.elevate2, borderColor: c.border, borderWidth: StyleSheet.hairlineWidth }]} />
        )}
        <View style={{ marginLeft: 12, flex: 1 }}>
          <ThemedText style={[styles.title, { color: c.text }]} numberOfLines={1}>
            {item.business_name || item.full_name || "Business"}
          </ThemedText>
          {!!item.trade_title && (
            <ThemedText style={{ fontSize: 13, color: c.textMuted, marginTop: 2 }} numberOfLines={1}>
              {item.trade_title}
            </ThemedText>
          )}
        </View>
      </View>
      <Ionicons name="chevron-forward" size={18} color={c.textMuted} />
    </Pressable>
  );

  return (
    <ThemedView style={{ flex: 1 }}>
      <ThemedStatusBar />

      {/* Clean header with back button */}
      <View
        style={[
          styles.header,
          { paddingTop: insets.top, backgroundColor: c.background, borderBottomColor: c.border },
        ]}
      >
        <View style={styles.headerRow}>
          <Pressable
            onPress={() => (router.canGoBack() ? router.back() : router.replace("/client"))}
            hitSlop={10}
            style={styles.backBtn}
          >
            <Ionicons name="chevron-back" size={24} color={c.text} />
          </Pressable>
          <View style={{ flex: 1, alignItems: "center" }}>
            <ThemedText style={[styles.headerTitle, { color: c.text }]} numberOfLines={1}>
              {categoryFilter ? categoryFilter : "Find a business"}
            </ThemedText>
            {!!serviceFilter && (
              <ThemedText style={[styles.headerSubtitle, { color: c.textMuted }]} numberOfLines={1}>
                for {serviceFilter}
              </ThemedText>
            )}
          </View>
          <View style={{ width: 24 }} />
        </View>
      </View>

      {/* Active category filter chip (read-only — use back button to change) */}
      {categoryFilter && (
        <View style={styles.filterChipRow}>
          <View
            style={[
              styles.filterChip,
              { backgroundColor: c.elevate, borderColor: c.border },
            ]}
          >
            <ThemedText style={[styles.filterChipText, { color: c.text }]}>
              {categoryFilter}
            </ThemedText>
          </View>
        </View>
      )}

      {/* Search input */}
      <View style={styles.searchWrap}>
        <View
          style={[
            styles.searchBox,
            { backgroundColor: c.elevate, borderColor: c.border },
          ]}
        >
          <Ionicons name="search" size={18} color={c.textMuted} style={{ marginRight: 8 }} />
          <TextInput
            placeholder="Search by name or trade"
            placeholderTextColor={c.textMuted}
            value={query}
            onChangeText={setQuery}
            style={[styles.searchInput, { color: c.text }]}
            returnKeyType="search"
            onSubmitEditing={() => Keyboard.dismiss()}
          />
          {!!query && (
            <Pressable onPress={() => { setQuery(""); Keyboard.dismiss(); }} hitSlop={8}>
              <Ionicons name="close-circle" size={18} color={c.textMuted} />
            </Pressable>
          )}
        </View>
      </View>

      {/* Content */}
      {loading && showDiscover ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator color={Colors.primary} />
        </View>
      ) : (
        <>
          {showDiscover ? (
            <FlatList
              data={suggestions}
              keyExtractor={(it) => String(it.id)}
              renderItem={renderItem}
              ItemSeparatorComponent={() => <Spacer height={6} />}
              keyboardShouldPersistTaps="handled"
              onScrollBeginDrag={() => Keyboard.dismiss()}
              ListHeaderComponent={
                <View style={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 10 }}>
                  <ThemedText style={{ fontSize: 16, fontWeight: "600", color: c.text }}>
                    {categoryFilter ? `${categoryFilter} trades` : "Discover businesses"}
                  </ThemedText>
                  <ThemedText style={{ marginTop: 4, fontSize: 13, color: c.textMuted }}>
                    {categoryFilter
                      ? `Verified ${categoryFilter.toLowerCase()} trades in your area.`
                      : "Verified trades, ranked by credentials and activity."}
                  </ThemedText>
                </View>
              }
              contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 40 }}
              refreshing={loading}
              onRefresh={load}
              ListEmptyComponent={
                <View style={{ paddingHorizontal: 16, paddingVertical: 12 }}>
                  <ThemedText variant="muted">
                    {categoryFilter
                      ? `No ${categoryFilter.toLowerCase()} trades available right now.`
                      : "No suggestions right now."}
                  </ThemedText>
                </View>
              }
            />
          ) : (
            <FlatList
              data={filtered}
              keyExtractor={(it) => String(it.id)}
              renderItem={renderItem}
              ItemSeparatorComponent={() => <Spacer height={6} />}
              keyboardShouldPersistTaps="handled"
              onScrollBeginDrag={() => Keyboard.dismiss()}
              ListHeaderComponent={
                <View style={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 10 }}>
                  <ThemedText style={{ fontSize: 16, fontWeight: "600", color: c.text }}>
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
    // bg + border painted inline from theme at the render site.
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 8,
  },
  backBtn: {
    width: 24,
    alignItems: "flex-start",
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: "600",
  },
  headerSubtitle: {
    fontSize: 12,
    marginTop: 2,
  },

  filterChipRow: {
    flexDirection: "row",
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  filterChip: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 5,
    // bg + border painted inline from theme at render site.
  },
  filterChipText: {
    fontSize: 13,
    fontWeight: "500",
    // color painted inline from theme at render site.
  },

  searchWrap: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8 },
  searchBox: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
    // bg + border painted inline from theme at render site.
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    // color painted inline from theme at render site.
  },

  row: {
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    // bg + border painted inline from theme at render site.
  },
  rowLeft: { flexDirection: "row", alignItems: "center" },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    // bg painted inline from theme at render site.
  },
  title: {
    fontWeight: "600",
    fontSize: 15,
    // color painted inline from theme at render site.
  },
});



