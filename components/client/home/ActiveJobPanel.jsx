// components/client/home/ActiveJobPanel.jsx
// "Active job" panel on the redesigned client home.
// Shows ONE active job (top-priority upcoming appointment, or next
// accepted quote if no appointments) as a status-striped row, with
// Message + Track ghost buttons underneath.
//
// Data: reuses the same RPCs the Projects tab uses:
//   rpc_client_list_appointments (p_only_upcoming: true)
//   rpc_client_list_responses    (fallback for accepted w/ no appointment yet)
// No new backend work required.

import React, { useEffect, useState, useCallback } from "react";
import { View, Pressable, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useFocusEffect } from "@react-navigation/native";

import { supabase } from "../../../lib/supabase";
import { useUser } from "../../../hooks/useUser";
import { useTheme } from "../../../hooks/useTheme";

import { Panel, StripeRow, StatusBadge } from "../../design";
import ThemedText from "../../ThemedText";
import { Colors } from "../../../constants/Colors";
import { TypeVariants, Radius } from "../../../constants/Typography";

function formatApptDate(d) {
  if (!d) return "";
  const dt = new Date(d);
  return dt.toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

export default function ActiveJobPanel() {
  const router = useRouter();
  const { user } = useUser();
  const { colors: c } = useTheme();
  const [activeJob, setActiveJob] = useState(null);
  const [loading, setLoading] = useState(true);

  const loadActiveJob = useCallback(async () => {
    if (!user?.id) return;
    try {
      // 1) upcoming appointments first — take the soonest
      const { data: appts } = await supabase.rpc(
        "rpc_client_list_appointments",
        { p_only_upcoming: true }
      );
      if (appts && appts.length > 0) {
        const soonest = [...appts].sort(
          (a, b) => new Date(a.scheduled_at) - new Date(b.scheduled_at)
        )[0];
        setActiveJob({
          source: "appointment",
          id: soonest.id,
          requestId: soonest.request_id,
          quoteId: soonest.quote_id,
          title:
            soonest.service_name ||
            soonest.request_title ||
            "Scheduled appointment",
          subtitle: `${
            soonest.trade_name || "Trade"
          } · ${formatApptDate(soonest.scheduled_at)}`,
          statusLabel: "scheduled",
        });
        setLoading(false);
        return;
      }

      // 2) fallback — accepted quote with no scheduled appointment yet
      const { data: responses } = await supabase.rpc(
        "rpc_client_list_responses"
      );
      const accepted = (responses || []).find(
        (r) => r.status === "accepted" || r.status === "scheduled"
      );
      if (accepted) {
        setActiveJob({
          source: "quote",
          id: accepted.quote_id,
          requestId: accepted.request_id,
          title: accepted.service_name || accepted.request_title || "Accepted quote",
          subtitle: `${accepted.trade_name || "Trade"} · Awaiting schedule`,
          statusLabel: "accepted",
        });
      } else {
        setActiveJob(null);
      }
    } catch (e) {
      console.warn("ActiveJobPanel load error:", e.message);
      setActiveJob(null);
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useFocusEffect(
    useCallback(() => {
      loadActiveJob();
    }, [loadActiveJob])
  );

  const handlePress = () => {
    if (!activeJob) return;
    if (activeJob.source === "appointment" || activeJob.source === "quote") {
      router.push({
        pathname: "/(dashboard)/client/myquotes/[id]",
        params: { id: String(activeJob.id) },
      });
    }
  };

  const handleMessage = () => {
    if (!activeJob?.requestId) return;
    router.push({
      pathname: "/(dashboard)/messages/[id]",
      params: { id: String(activeJob.requestId) },
    });
  };

  const handleTrack = () => handlePress();

  if (loading) {
    return (
      <Panel title="Active job" chevron={false}>
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

  if (!activeJob) {
    return (
      <Panel title="Active job" chevron={false}>
        <View style={{ padding: 14 }}>
          <ThemedText
            style={{ ...TypeVariants.bodySm, color: c.textMid }}
          >
            No active jobs yet. Accepted quotes and scheduled appointments show up here.
          </ThemedText>
        </View>
      </Panel>
    );
  }

  const stripeColor =
    activeJob.statusLabel === "scheduled"
      ? Colors.status.scheduled
      : Colors.status.accepted;

  return (
    <Panel
      title="Active job"
      chevron
      onPress={() => router.push("/(dashboard)/myquotes")}
    >
      <StripeRow
        stripeColor={stripeColor}
        title={activeJob.title}
        subtitle={activeJob.subtitle}
        trailing={<StatusBadge state={activeJob.statusLabel} size="sm" />}
        onPress={handlePress}
      />
      <View
        style={[styles.divider, { backgroundColor: c.divider }]}
      />
      <View style={styles.actions}>
        <Pressable
          onPress={handleMessage}
          style={({ pressed }) => [
            styles.ghostBtn,
            { backgroundColor: c.elevate2, borderColor: c.border },
            pressed && { opacity: 0.7 },
          ]}
        >
          <Ionicons name="chatbubble-outline" size={14} color={c.text} />
          <ThemedText
            style={{ ...TypeVariants.buttonSm, color: c.text }}
          >
            Message
          </ThemedText>
        </Pressable>
        <Pressable
          onPress={handleTrack}
          style={({ pressed }) => [
            styles.ghostBtn,
            { backgroundColor: c.elevate2, borderColor: c.border },
            pressed && { opacity: 0.7 },
          ]}
        >
          <Ionicons name="location-outline" size={14} color={c.text} />
          <ThemedText
            style={{ ...TypeVariants.buttonSm, color: c.text }}
          >
            Track
          </ThemedText>
        </Pressable>
      </View>
    </Panel>
  );
}

const styles = StyleSheet.create({
  divider: {
    height: 1,
    marginLeft: 14,
  },
  actions: {
    flexDirection: "row",
    gap: 8,
    padding: 10,
    paddingHorizontal: 14,
  },
  ghostBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: Radius.md,
    borderWidth: 1,
  },
});
