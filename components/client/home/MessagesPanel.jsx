// components/client/home/MessagesPanel.jsx
// "Messages" panel on the redesigned client home — top 2-3 recent
// conversations rendered as MsgRows (avatar + name + preview + time
// + unread dot). Data: rpc_list_conversations (same RPC the Messages
// tab uses), filtered to ones with an actual last message.

import React, { useEffect, useState, useCallback } from "react";
import { View, Pressable, Image, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { useFocusEffect } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";

import { supabase } from "../../../lib/supabase";
import { useUser } from "../../../hooks/useUser";
import { useTheme } from "../../../hooks/useTheme";

import { Panel } from "../../design";
import ThemedText from "../../ThemedText";
import { Colors } from "../../../constants/Colors";
import { TypeVariants, FontFamily } from "../../../constants/Typography";

function formatWhen(iso) {
  if (!iso) return "";
  const dt = new Date(iso);
  const now = new Date();
  const diffMs = now - dt;
  const min = Math.floor(diffMs / 60000);
  if (min < 1) return "now";
  if (min < 60) return `${min}m`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}d`;
  return dt.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

function getInitials(name) {
  if (!name) return "?";
  const parts = String(name).trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return (
    parts[0].charAt(0).toUpperCase() +
    parts[parts.length - 1].charAt(0).toUpperCase()
  );
}

function MsgRow({ conversation, onPress }) {
  const { colors: c } = useTheme();
  const name =
    conversation.other_party_name ||
    (conversation.other_party_role === "trade" ? "Your trade" : "Your client");
  const preview =
    conversation.last_message_body || "No messages yet";
  const when = formatWhen(conversation.last_message_at);
  const unread = !!conversation.has_unread;
  const avatarUrl = conversation.other_party_photo_url;
  const initials = getInitials(name);

  // seed avatar tint from name
  const tints = [
    Colors.primary,
    Colors.status.scheduled,
    Colors.status.accepted,
    Colors.status.pending,
    Colors.status.declined,
  ];
  const tint = tints[name.charCodeAt(0) % tints.length];

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        pressed && { backgroundColor: c.elevate2 },
      ]}
    >
      {avatarUrl ? (
        <Image source={{ uri: avatarUrl }} style={styles.avatar} />
      ) : (
        <View style={[styles.avatar, { backgroundColor: tint + "33" }]}>
          <ThemedText
            style={{
              fontSize: 13,
              fontFamily: FontFamily.headerBold,
              color: tint,
            }}
          >
            {initials}
          </ThemedText>
        </View>
      )}
      <View style={styles.textCol}>
        <View style={styles.topRow}>
          <ThemedText
            style={{
              fontSize: 14,
              fontFamily: FontFamily.headerSemibold,
              color: c.text,
              letterSpacing: -0.1,
            }}
            numberOfLines={1}
          >
            {name}
          </ThemedText>
          {unread ? (
            <View
              style={[styles.unreadDot, { backgroundColor: Colors.primary }]}
            />
          ) : null}
          <View style={{ flex: 1 }} />
          <ThemedText style={{ fontSize: 11, color: c.textMuted }}>
            {when}
          </ThemedText>
        </View>
        <ThemedText
          style={{
            fontSize: 12.5,
            color: unread ? c.text : c.textMid,
            marginTop: 2,
            fontFamily: FontFamily.bodyRegular,
          }}
          numberOfLines={1}
        >
          {preview}
        </ThemedText>
      </View>
    </Pressable>
  );
}

export default function MessagesPanel() {
  const router = useRouter();
  const { user } = useUser();
  const { colors: c } = useTheme();
  const [conversations, setConversations] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!user?.id) return;
    try {
      const { data } = await supabase.rpc("rpc_list_conversations", {
        p_limit: 10,
      });
      const filtered = (data || []).filter(
        (c) => c.last_message_body && c.last_message_body.trim().length > 0
      );
      setConversations(filtered.slice(0, 3));
    } catch (e) {
      console.warn("MessagesPanel load error:", e.message);
      setConversations([]);
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  if (loading) {
    return (
      <Panel title="Messages" chevron>
        <View style={{ padding: 14 }}>
          <ThemedText
            style={{ ...TypeVariants.bodySm, color: c.textMuted }}
          >
            Loading…
          </ThemedText>
        </View>
      </Panel>
    );
  }

  if (conversations.length === 0) {
    return (
      <Panel title="Messages" chevron>
        <View style={{ padding: 14 }}>
          <ThemedText
            style={{ ...TypeVariants.bodySm, color: c.textMid }}
          >
            No conversations yet. Reach out to a trade to get started.
          </ThemedText>
        </View>
      </Panel>
    );
  }

  return (
    <Panel
      title="Messages"
      chevron
      onPress={() => router.push("/(dashboard)/messages")}
    >
      {conversations.map((conv, idx) => (
        <React.Fragment key={conv.conversation_id || `${conv.request_id}-${idx}`}>
          {idx > 0 ? (
            <View
              style={[styles.divider, { backgroundColor: c.divider }]}
            />
          ) : null}
          <MsgRow
            conversation={conv}
            onPress={() =>
              router.push({
                pathname: "/(dashboard)/messages/[id]",
                params: { id: String(conv.request_id) },
              })
            }
          />
        </React.Fragment>
      ))}
    </Panel>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    gap: 12,
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  textCol: {
    flex: 1,
    minWidth: 0,
  },
  topRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  unreadDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  divider: {
    height: 1,
    marginLeft: 54,
  },
});
