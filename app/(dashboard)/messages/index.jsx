// app/(dashboard)/messages/index.jsx
// Messages tab — party-grouped list. One row per person the user
// has talked to, regardless of how many projects they share.
//
// Layout + typography match the Home / Projects / Profile tabs:
//   · Public-Sans-Bold 32pt "Messages" title inside the ScrollView
//     (no row wrapper, no block behind it)
//   · Dark-mode aware via useTheme — no more hardcoded #FFF / #111
//   · Pill-styled conversation rows with avatar, name, snippet, time
//     and an unread dot
//
// Data source: rpc_list_conversations_by_party (new RPC added in
// 20260425000000_party_based_conversations.sql). Falls back to the
// original rpc_list_conversations + client-side grouping if the new
// RPC isn't deployed yet, so the screen works across both states.

import {
  StyleSheet,
  View,
  Pressable,
  FlatList,
  RefreshControl,
  Image,
} from "react-native";
import { useState, useCallback } from "react";
import { useRouter, useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { supabase } from "../../../lib/supabase";
import { useUser } from "../../../hooks/useUser";
import { useTheme } from "../../../hooks/useTheme";

import ThemedView from "../../../components/ThemedView";
import ThemedText from "../../../components/ThemedText";
import Spacer from "../../../components/Spacer";
import { MessagesPageSkeleton } from "../../../components/Skeleton";
import ThemedStatusBar from "../../../components/ThemedStatusBar";
import { Colors } from "../../../constants/Colors";
import { FontFamily } from "../../../constants/Typography";

const AVATAR_TINTS = [
  Colors.primary,
  Colors.status.scheduled,
  Colors.status.accepted,
  Colors.status.pending,
  Colors.status.declined,
];

function formatWhen(iso) {
  if (!iso) return "";
  const dt = new Date(iso);
  const now = new Date();
  const sameDay =
    dt.getFullYear() === now.getFullYear() &&
    dt.getMonth() === now.getMonth() &&
    dt.getDate() === now.getDate();
  if (sameDay) {
    return dt.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  }
  const diffDays = Math.floor((now - dt) / (1000 * 60 * 60 * 24));
  if (diffDays < 7) return dt.toLocaleDateString(undefined, { weekday: "short" });
  return dt.toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

function getInitials(name) {
  if (!name) return "?";
  const parts = String(name).trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return parts[0].charAt(0).toUpperCase() + parts[parts.length - 1].charAt(0).toUpperCase();
}

function ConversationCard({ c, item, onPress }) {
  const title =
    item.other_party_name ||
    (item.other_party_role === "trade" || item.other_party_role === "trades"
      ? "Your trade"
      : "Your client");

  const snippetRaw = item.last_message_body || "No messages yet.";
  const snippet = snippetRaw.length > 60 ? snippetRaw.slice(0, 57) + "…" : snippetRaw;
  const when = formatWhen(item.last_message_at);
  const hasUnread = item.has_unread === true;

  const avatarUrl = item.other_party_photo_url || null;
  const initials = getInitials(title);
  const tint = AVATAR_TINTS[(title.charCodeAt(0) || 0) % AVATAR_TINTS.length];

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        { backgroundColor: c.elevate2, borderColor: c.border },
        pressed && { opacity: 0.75 },
      ]}
    >
      <View style={styles.cardRow}>
        {avatarUrl ? (
          <Image source={{ uri: avatarUrl }} style={styles.avatar} />
        ) : (
          <View
            style={[
              styles.avatar,
              styles.avatarFallback,
              { backgroundColor: tint + "33" },
            ]}
          >
            <ThemedText style={[styles.avatarInitials, { color: tint }]}>
              {initials}
            </ThemedText>
          </View>
        )}

        <View style={styles.cardMain}>
          <View style={styles.cardHeaderRow}>
            <ThemedText
              style={[
                styles.cardTitle,
                { color: c.text },
                hasUnread && styles.cardTitleUnread,
              ]}
              numberOfLines={1}
            >
              {title}
            </ThemedText>
            <View style={styles.cardTimeRow}>
              {!!when && (
                <ThemedText
                  style={[
                    styles.cardTime,
                    { color: hasUnread ? c.text : c.textMuted },
                  ]}
                >
                  {when}
                </ThemedText>
              )}
              {hasUnread && (
                <View style={[styles.unreadDot, { backgroundColor: Colors.primary }]} />
              )}
            </View>
          </View>
          <ThemedText
            numberOfLines={1}
            style={[
              styles.snippet,
              { color: hasUnread ? c.text : c.textMid },
              hasUnread && styles.snippetUnread,
            ]}
          >
            {snippet}
          </ThemedText>
        </View>
      </View>
    </Pressable>
  );
}

export default function MessagesIndex() {
  const { user } = useUser();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors: c } = useTheme();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [conversations, setConversations] = useState([]);

  // Client-side fallback grouping for environments where the new
  // party-based RPC isn't deployed yet. Takes the per-request rows
  // from rpc_list_conversations and collapses them to per-party.
  const groupByParty = useCallback((rows) => {
    const byParty = new Map();
    for (const row of rows || []) {
      const key = row.other_party_id;
      if (!key) continue;
      const existing = byParty.get(key);
      if (!existing) {
        byParty.set(key, {
          other_party_id: key,
          other_party_name: row.other_party_name,
          other_party_role: row.other_party_role,
          other_party_photo_url: row.other_party_photo_url,
          last_message_body: row.last_message_body,
          last_message_at: row.last_message_at,
          last_message_request_id: row.request_id,
          has_unread: row.has_unread === true,
          shared_request_count: 1,
        });
      } else {
        existing.shared_request_count += 1;
        existing.has_unread = existing.has_unread || row.has_unread === true;
        const rowAt = row.last_message_at ? new Date(row.last_message_at).getTime() : 0;
        const exAt = existing.last_message_at ? new Date(existing.last_message_at).getTime() : 0;
        if (rowAt > exAt) {
          existing.last_message_body = row.last_message_body;
          existing.last_message_at = row.last_message_at;
          existing.last_message_request_id = row.request_id;
        }
      }
    }
    return Array.from(byParty.values()).sort((a, b) => {
      const aAt = a.last_message_at ? new Date(a.last_message_at).getTime() : 0;
      const bAt = b.last_message_at ? new Date(b.last_message_at).getTime() : 0;
      return bAt - aAt;
    });
  }, []);

  const load = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    try {
      // Preferred: new party-based RPC.
      const { data, error } = await supabase.rpc("rpc_list_conversations_by_party", {
        p_limit: 100,
      });
      if (!error && Array.isArray(data)) {
        const filtered = data.filter(
          (conv) => conv.last_message_body && conv.last_message_body.trim().length > 0
        );
        setConversations(filtered);
        return;
      }

      // Fallback: old per-request RPC + client-side grouping. Keeps
      // the app usable if the new migration hasn't run yet.
      const { data: legacy, error: legacyErr } = await supabase.rpc("rpc_list_conversations", {
        p_limit: 100,
      });
      if (legacyErr) {
        console.warn("rpc_list_conversations error:", legacyErr.message);
        setConversations([]);
        return;
      }
      const filteredLegacy = (legacy || []).filter(
        (conv) => conv.last_message_body && conv.last_message_body.trim().length > 0
      );
      setConversations(groupByParty(filteredLegacy));
    } finally {
      setLoading(false);
    }
  }, [user?.id, groupByParty]);

  const onRefresh = useCallback(async () => {
    try {
      setRefreshing(true);
      await load();
    } finally {
      setRefreshing(false);
    }
  }, [load]);

  useFocusEffect(
    useCallback(() => {
      if (!user?.id) return;
      load();
    }, [user?.id, load])
  );

  const Empty = () => (
    <View style={styles.emptyWrap}>
      <ThemedText style={[styles.emptyTitle, { color: c.text }]}>
        No messages yet.
      </ThemedText>
      <Spacer height={8} />
      <ThemedText style={[styles.emptySubtitle, { color: c.textMid }]}>
        When you and a trade start chatting about a request, it will appear here.
      </ThemedText>
    </View>
  );

  return (
    <ThemedView style={[styles.container, { paddingTop: insets.top }]}>
      <ThemedStatusBar />

      <FlatList
        data={conversations}
        keyExtractor={(item, index) =>
          item.other_party_id ? String(item.other_party_id) : `p-${index}`
        }
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        contentContainerStyle={{
          paddingTop: 4,
          paddingBottom: insets.bottom + 180,
          flexGrow: 1,
        }}
        ListHeaderComponent={
          <View style={styles.titleBlock}>
            <ThemedText style={[styles.pageTitle, { color: c.text }]}>Messages</ThemedText>
          </View>
        }
        ListEmptyComponent={loading ? <MessagesPageSkeleton paddingTop={0} /> : <Empty />}
        renderItem={({ item }) => (
          <ConversationCard
            c={c}
            item={item}
            onPress={() =>
              router.push({
                pathname: "/(dashboard)/messages/[id]",
                params: {
                  id: String(item.other_party_id),
                  kind: "party",
                  name: item.other_party_name || "",
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
  container: { flex: 1 },

  titleBlock: {
    paddingTop: 12,
    paddingBottom: 14,
    paddingHorizontal: 20,
  },
  pageTitle: {
    fontFamily: FontFamily.headerBold,
    fontSize: 32,
    lineHeight: 34,
    letterSpacing: -0.8,
  },

  card: {
    borderWidth: 1,
    borderRadius: 18,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginHorizontal: 16,
    marginBottom: 10,
  },
  cardRow: { flexDirection: "row", alignItems: "center" },
  avatar: { width: 48, height: 48, borderRadius: 24 },
  avatarFallback: { alignItems: "center", justifyContent: "center" },
  avatarInitials: {
    fontFamily: FontFamily.headerBold,
    fontSize: 16,
  },
  cardMain: { flex: 1, marginLeft: 12, minWidth: 0 },
  cardHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  cardTitle: {
    flex: 1,
    fontFamily: FontFamily.headerSemibold,
    fontSize: 15,
    letterSpacing: -0.1,
  },
  cardTitleUnread: {
    fontFamily: FontFamily.headerBold,
  },
  cardTimeRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  cardTime: {
    fontFamily: FontFamily.bodyRegular,
    fontSize: 12,
  },
  unreadDot: { width: 8, height: 8, borderRadius: 4 },
  snippet: {
    fontFamily: FontFamily.bodyRegular,
    fontSize: 14,
    marginTop: 3,
  },
  snippetUnread: {
    fontFamily: FontFamily.bodyMedium,
  },

  emptyWrap: { paddingTop: 40, paddingHorizontal: 40 },
  emptyTitle: { fontFamily: FontFamily.headerSemibold, fontSize: 16 },
  emptySubtitle: { fontFamily: FontFamily.bodyRegular, fontSize: 13, lineHeight: 19 },
});
