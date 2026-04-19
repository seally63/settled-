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
import { useRouter, useFocusEffect } from "expo-router";
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
    ? item.last_message_body.length > 50
      ? item.last_message_body.slice(0, 47) + "..."
      : item.last_message_body
    : "No messages yet.";

  const when = formatWhen(item.last_message_at);
  const hasUnread = item.has_unread === true;

  const avatarUrl = item.other_party_photo_url || null;
  const initials = getInitials(title);

  // Generate a consistent color based on name
  const avatarColors = ["#6849a7", "#3B82F6", "#10B981", "#F59E0B", "#EF4444"];
  const colorIndex = title ? title.charCodeAt(0) % avatarColors.length : 0;
  const avatarBgColor = avatarColors[colorIndex];

  return (
    <Pressable onPress={onPress} style={{ flex: 1 }}>
      <ThemedView style={styles.card}>
        <View style={styles.cardRow}>
          {/* Avatar */}
          <View style={styles.avatarWrap}>
            {avatarUrl ? (
              <Image source={{ uri: avatarUrl }} style={styles.avatar} />
            ) : (
              <View style={[styles.avatar, styles.avatarFallback, { backgroundColor: avatarBgColor }]}>
                <ThemedText style={styles.avatarInitials}>
                  {initials}
                </ThemedText>
              </View>
            )}
          </View>

          {/* Text column */}
          <View style={styles.cardMain}>
            <View style={styles.cardHeaderRow}>
              <ThemedText style={[styles.cardTitle, hasUnread && styles.cardTitleUnread]} numberOfLines={1}>
                {title}
              </ThemedText>
              <View style={styles.cardTimeRow}>
                {!!when && (
                  <ThemedText style={[styles.cardTime, hasUnread && styles.cardTimeUnread]} variant="muted">
                    {when}
                  </ThemedText>
                )}
                {hasUnread && <View style={styles.unreadDot} />}
              </View>
            </View>

            <Spacer height={2} />

            <ThemedText
              numberOfLines={1}
              style={[styles.snippet, hasUnread && styles.snippetUnread]}
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
      // Filter out conversations with no actual messages
      // Only show conversations where communication has started
      const filtered = (data || []).filter(
        (conv) => conv.last_message_body && conv.last_message_body.trim().length > 0
      );
      setConversations(filtered);
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

  // Reload conversations whenever screen comes into focus
  // This ensures read status is updated after viewing a conversation
  useFocusEffect(
    useCallback(() => {
      if (!user?.id) return;
      load();
    }, [user?.id, load])
  );

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
        keyExtractor={(item, index) => item.conversation_id ? String(item.conversation_id) : `${item.request_id}-${item.other_party_id || index}`}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        contentContainerStyle={{ paddingTop: 8, paddingBottom: 130, flexGrow: 1 }}
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
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginHorizontal: 16,
    marginBottom: 10,
    backgroundColor: "#FFFFFF",
  },
  cardRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  avatarWrap: {
    marginRight: 12,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "#E5E7EB",
  },
  avatarFallback: {
    alignItems: "center",
    justifyContent: "center",
  },
  avatarInitials: {
    fontWeight: "700",
    fontSize: 17,
    color: "#FFFFFF",
  },
  cardMain: {
    flex: 1,
  },
  cardHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  cardTitle: {
    flex: 1,
    fontSize: 15,
    fontWeight: "500",
    color: "#111827",
  },
  cardTitleUnread: {
    fontWeight: "700",
  },
  cardTimeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  cardTime: {
    fontSize: 12,
    color: "#9CA3AF",
  },
  cardTimeUnread: {
    color: "#6B7280",
  },
  unreadDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: "#3B82F6",
  },
  snippet: {
    fontSize: 14,
    marginTop: 3,
    color: "#6B7280",
  },
  snippetUnread: {
    color: "#374151",
    fontWeight: "500",
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
