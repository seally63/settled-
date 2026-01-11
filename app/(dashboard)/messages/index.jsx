//app(dashboard)/messages/index.jsx

import {
  StyleSheet,
  View,
  Pressable,
  FlatList,
  RefreshControl,
  Platform,
  Image,
} from "react-native";
import { useEffect, useState, useCallback } from "react";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";

import { supabase } from "../../../lib/supabase";
import { useUser } from "../../../hooks/useUser";

import ThemedView from "../../../components/ThemedView";
import ThemedText from "../../../components/ThemedText";
import Spacer from "../../../components/Spacer";
import { MessagesPageSkeleton } from "../../../components/Skeleton";
import { Colors } from "../../../constants/Colors";

const TINT = Colors?.light?.tint || "#0ea5e9";

function formatWhen(d) {
  if (!d) return "";
  const dt = new Date(d);
  const now = new Date();

  const sameDay =
    dt.getFullYear() === now.getFullYear() &&
    dt.getMonth() === now.getMonth() &&
    dt.getDate() === now.getDate();

  if (sameDay) {
    return dt.toLocaleTimeString(undefined, {
      hour: "2-digit",
      minute: "2-digit",
    });
  }
  return dt.toLocaleDateString();
}

function getInitials(name) {
  if (!name) return "?";
  const parts = String(name)
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!parts.length) return "?";
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return (
    parts[0].charAt(0).toUpperCase() +
    parts[parts.length - 1].charAt(0).toUpperCase()
  );
}

function ConversationCard({ item, onPress }) {
  const title =
    item.other_party_name ||
    (item.other_party_role === "trade" ? "Your trade" : "Your client");

  const snippet = item.last_message_body
    ? item.last_message_body.length > 80
      ? item.last_message_body.slice(0, 77) + "..."
      : item.last_message_body
    : "No messages yet.";

  const when = formatWhen(item.last_message_at);

  const avatarUrl = item.other_party_photo_url || null;
  const initials = getInitials(title);

  return (
    <Pressable onPress={onPress} style={{ flex: 1 }}>
      <ThemedView style={styles.card}>
        <View style={styles.cardRow}>
          {/* Avatar */}
          <View style={styles.avatarWrap}>
            {avatarUrl ? (
              <Image source={{ uri: avatarUrl }} style={styles.avatar} />
            ) : (
              <View style={[styles.avatar, styles.avatarFallback]}>
                <ThemedText style={styles.avatarInitials}>
                  {initials}
                </ThemedText>
              </View>
            )}
          </View>

          {/* Text column */}
          <View style={styles.cardMain}>
            <View style={styles.cardHeaderRow}>
              <ThemedText style={styles.cardTitle} numberOfLines={1}>
                {title}
              </ThemedText>
              {!!when && (
                <ThemedText style={styles.cardTime} variant="muted">
                  {when}
                </ThemedText>
              )}
            </View>

            <Spacer height={2} />

            <ThemedText
              numberOfLines={2}
              style={styles.snippet}
              variant="muted"
            >
              {snippet}
            </ThemedText>
          </View>
        </View>
      </ThemedView>
    </Pressable>
  );
}

export default function MessagesIndex() {
  const { user } = useUser();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [conversations, setConversations] = useState([]);

  const load = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc("rpc_list_conversations", {
        p_limit: 50,
      });
      if (error) {
        console.warn("rpc_list_conversations error:", error.message);
        setConversations([]);
        return;
      }
      setConversations(data || []);
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  const onRefresh = useCallback(async () => {
    try {
      setRefreshing(true);
      await load();
    } catch (e) {
      console.warn("refresh messages failed:", e.message);
    } finally {
      setRefreshing(false);
    }
  }, [load]);

  useEffect(() => {
    if (!user?.id) return;
    load();
  }, [user?.id, load]);

  const Empty = () => (
    <View style={styles.emptyWrap}>
      <ThemedText style={styles.emptyTitle}>No messages yet.</ThemedText>
      <Spacer height={8} />
      <ThemedText variant="muted" style={styles.emptySubtitle}>
        When you and a trade start chatting about a request, it will appear
        here.
      </ThemedText>
    </View>
  );

  return (
    <ThemedView style={styles.container}>
      <StatusBar style="dark" backgroundColor="#FFFFFF" />
      {/* Header - Profile-style */}
      <View style={[styles.header, { paddingTop: insets.top + 16 }]}>
        <ThemedText style={styles.headerTitle}>Messages</ThemedText>
      </View>

      <FlatList
        data={conversations}
        keyExtractor={(item) => String(item.request_id)}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        contentContainerStyle={{ paddingTop: 8, paddingBottom: 40, flexGrow: 1 }}
        ListEmptyComponent={loading ? <MessagesPageSkeleton paddingTop={0} /> : <Empty />}
        renderItem={({ item }) => (
          <ConversationCard
            item={item}
            onPress={() =>
              router.push({
                pathname: "/(dashboard)/messages/[id]",
                params: {
                  id: String(item.request_id),
                  name:
                    item.other_party_name ||
                    (item.other_party_role === "trade"
                      ? "Your trade"
                      : "Your client"),
                  quoteId: item.quote_id ? String(item.quote_id) : "",
                  avatar: item.other_party_photo_url || "",
                },
              })
            }
          />
        )}
      />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "stretch",
    backgroundColor: "#FFFFFF",
  },
  // Profile-style header
  header: {
    paddingHorizontal: 20,
    paddingBottom: 12,
    backgroundColor: "#FFFFFF",
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: "700",
  },

  card: {
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 16,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginHorizontal: 16,
    marginBottom: 12,
    backgroundColor: "#FFFFFF",
  },
  cardRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  avatarWrap: {
    marginRight: 10,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#E5E7EB",
  },
  avatarFallback: {
    alignItems: "center",
    justifyContent: "center",
  },
  avatarInitials: {
    fontWeight: "700",
    fontSize: 16,
    color: "#4B5563",
  },
  cardMain: {
    flex: 1,
  },
  cardHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  cardTitle: {
    flex: 1,
    fontSize: 15,
    fontWeight: "600",
  },
  cardTime: {
    fontSize: 11,
    marginLeft: 8,
  },
  snippet: {
    fontSize: 13,
    marginTop: 2,
  },

  emptyWrap: {
    paddingTop: 40,
    paddingHorizontal: 40,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: "600",
  },
  emptySubtitle: {
    fontSize: 13,
  },
});
