// app/(dashboard)/trades/index.jsx
import { useEffect, useState, useCallback } from "react";
import { StyleSheet, View, FlatList, Pressable, Image, Alert, TextInput } from "react-native";
import { StatusBar } from "expo-status-bar";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import ThemedView from "../../../components/ThemedView";
import ThemedText from "../../../components/ThemedText";
import Spacer from "../../../components/Spacer";
import { Colors } from "../../../constants/Colors";

import { listTrades } from "../../../lib/api/profile";

export default function TradesIndex() {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [allTrades, setAllTrades] = useState([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const rows = await listTrades();
      setAllTrades(rows || []);
    } catch (e) {
      Alert.alert("Error", e?.message || "Failed to load trades.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = (allTrades || []).filter((t) => {
    const hay = `${t.full_name || ""} ${t.business_name || ""} ${t.trade_title || ""}`.toLowerCase();
    return hay.includes(query.trim().toLowerCase());
  });

  const renderItem = ({ item }) => (
    <Pressable style={styles.row} onPress={() => router.push(`/trades/${item.id}`)}>
      <View style={styles.rowLeft}>
        {item.photo_url ? (
          <Image source={{ uri: item.photo_url }} style={styles.avatar} />
        ) : (
          <View style={[styles.avatar, styles.avatarFallback]} />
        )}
        <View style={{ marginLeft: 12 }}>
          <ThemedText style={styles.title}>{item.full_name || "Unnamed trade"}</ThemedText>
          {!!item.business_name && <ThemedText variant="muted">{item.business_name}</ThemedText>}
          {!!item.trade_title && <ThemedText variant="muted">{item.trade_title}</ThemedText>}
        </View>
      </View>
      <Ionicons name="chevron-forward" size={18} color="#8a8a8a" />
    </Pressable>
  );

  return (
    <ThemedView style={{ flex: 1, backgroundColor: Colors.light.background }}>
      <StatusBar style="light" backgroundColor={Colors.primary} />
      {/* Header like screenshot: back + title space */}
      <View style={[styles.header, { paddingTop: insets.top }]}>
        <Pressable onPress={() => router.back()} hitSlop={8} style={{ position: "absolute", left: 12, bottom: 14 }}>
          <Ionicons name="chevron-back" size={22} color="#fff" />
        </Pressable>
        <ThemedText style={styles.headerTitle}>Select a business</ThemedText>
      </View>

      {/* Search bar */}
      <View style={styles.searchWrap}>
        <View style={styles.searchBox}>
          <Ionicons name="search" size={18} color={Colors.primary} style={{ marginRight: 8 }} />
          <TextInput
            placeholder="Search"
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

      <FlatList
        data={filtered}
        keyExtractor={(it) => it.id}
        renderItem={renderItem}
        ItemSeparatorComponent={() => <Spacer height={6} />}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 40 }}
        ListHeaderComponent={
          filtered.length > 0 ? (
            <ThemedText variant="muted" style={{ marginTop: 8, marginBottom: 8 }}>
              Suggested tradespersons
            </ThemedText>
          ) : null
        }
        refreshing={loading}
        onRefresh={load}
      />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  header: { backgroundColor: Colors.primary, paddingBottom: 12, alignItems: "center", justifyContent: "center" },
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
