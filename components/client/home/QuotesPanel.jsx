// components/client/home/QuotesPanel.jsx
// "Quotes" panel on the redesigned client home.
// Shows the client's open quote requests as status-striped rows.
// Each row shows: title, subtitle (status + responses count + posted time),
// and a chevron. Tap navigates to Projects or the specific request.
//
// Data: rpc_client_list_requests (same RPC the Projects tab uses).

import React, { useEffect, useState, useCallback } from "react";
import { View, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { useFocusEffect } from "@react-navigation/native";

import { supabase } from "../../../lib/supabase";
import { useUser } from "../../../hooks/useUser";
import { useTheme } from "../../../hooks/useTheme";

import { Panel, StripeRow } from "../../design";
import ThemedText from "../../ThemedText";
import { Colors } from "../../../constants/Colors";
import { TypeVariants } from "../../../constants/Typography";

function timeSince(iso) {
  if (!iso) return "";
  const diffMs = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diffMs / 60000);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}d ago`;
  const wk = Math.floor(day / 7);
  return `${wk}w ago`;
}

// Choose stripe colour from request/response status.
// Keep palette aligned with the redesign's semantic tokens.
function stripeForStatus(status, c) {
  switch (String(status || "").toLowerCase()) {
    case "quoted":
    case "awaiting_decision":
      return Colors.status.quoted;
    case "pending":
    case "open":
    case "awaiting":
      return Colors.status.pending;
    case "accepted":
    case "scheduled":
      return Colors.status.scheduled;
    case "completed":
      return Colors.status.accepted;
    case "declined":
    case "expired":
    case "cancelled":
      return Colors.status.declined;
    case "draft":
    default:
      return c.textFaint;
  }
}

export default function QuotesPanel() {
  const router = useRouter();
  const { user } = useUser();
  const { colors: c } = useTheme();
  const [quotes, setQuotes] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!user?.id) return;
    try {
      // Open requests
      const { data: reqData } = await supabase.rpc("rpc_client_list_requests");
      // Quote responses so we can show count + lowest price
      const { data: resData } = await supabase.rpc(
        "rpc_client_list_responses"
      );

      // group responses by request_id
      const byReq = {};
      (resData || []).forEach((r) => {
        if (!r.request_id) return;
        if (!byReq[r.request_id]) byReq[r.request_id] = [];
        byReq[r.request_id].push(r);
      });

      const list = (reqData || [])
        .filter(
          (r) => !["completed", "cancelled", "expired"].includes(r.status)
        )
        .slice(0, 3)
        .map((r) => {
          const quotesForReq = byReq[r.id] || [];
          const lowest = quotesForReq
            .map((q) => Number(q.grand_total))
            .filter((n) => Number.isFinite(n))
            .sort((a, b) => a - b)[0];

          let subtitle;
          if (quotesForReq.length > 0) {
            subtitle = `${quotesForReq.length} quote${
              quotesForReq.length === 1 ? "" : "s"
            }`;
            if (lowest != null) subtitle += ` · lowest £${lowest.toLocaleString("en-GB")}`;
            subtitle += ` · posted ${timeSince(r.created_at)}`;
          } else {
            subtitle = `Awaiting · posted ${timeSince(r.created_at)}`;
          }

          return {
            id: r.id,
            title: r.suggested_title || r.title || "Quote request",
            subtitle,
            status:
              quotesForReq.length > 0 ? "quoted" : r.status || "pending",
            muted: quotesForReq.length === 0,
          };
        });

      setQuotes(list);
    } catch (e) {
      console.warn("QuotesPanel load error:", e.message);
      setQuotes([]);
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
      <Panel title="Quotes" chevron>
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

  if (quotes.length === 0) {
    return (
      <Panel title="Quotes" chevron>
        <View style={{ padding: 14 }}>
          <ThemedText
            style={{ ...TypeVariants.bodySm, color: c.textMid }}
          >
            No open quote requests.
          </ThemedText>
        </View>
      </Panel>
    );
  }

  return (
    <Panel
      title="Quotes"
      chevron
      onPress={() => router.push("/(dashboard)/myquotes")}
    >
      {quotes.map((q, idx) => (
        <React.Fragment key={q.id}>
          {idx > 0 ? (
            <View style={[styles.divider, { backgroundColor: c.divider }]} />
          ) : null}
          <StripeRow
            stripeColor={stripeForStatus(q.status, c)}
            title={q.title}
            subtitle={q.subtitle}
            muted={q.muted}
            showChevron
            onPress={() =>
              router.push({
                pathname: "/(dashboard)/myquotes",
                params: { requestId: String(q.id) },
              })
            }
          />
        </React.Fragment>
      ))}
    </Panel>
  );
}

const styles = StyleSheet.create({
  divider: {
    height: 1,
    marginLeft: 14,
  },
});
