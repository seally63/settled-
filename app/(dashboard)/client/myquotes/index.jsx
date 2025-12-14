// app/(dashboard)/client/myquotes/index.jsx
import {
  StyleSheet,
  View,
  Pressable,
  Alert,
  FlatList,
  RefreshControl,
  ScrollView,
} from "react-native";
import { useEffect, useMemo, useState, useCallback } from "react";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";

import { supabase } from "../../../../lib/supabase";
import { useUser } from "../../../../hooks/useUser";

import ThemedView from "../../../../components/ThemedView";
import ThemedText from "../../../../components/ThemedText";
import ThemedButton from "../../../../components/ThemedButton";
import Spacer from "../../../../components/Spacer";
import { Colors } from "../../../../constants/Colors";

const TABS = [
  { key: "requests", label: "Requests", icon: "mail-unread-outline" },
  { key: "responses", label: "Responses", icon: "chatbubbles-outline" },
  { key: "decide", label: "Decide", icon: "document-text-outline" },
];

const TINT = Colors?.light?.tint || "#0ea5e9";

function TabBtn({ active, label, icon, count = 0, onPress }) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={10}
      style={[styles.tabBtn, active && styles.tabBtnActive]}
    >
      <Ionicons
        name={icon}
        size={20}
        color={
          active
            ? Colors.light?.tint || "#0ea5e9"
            : Colors.light?.tabIconDefault || "#64748B"
        }
      />
      <ThemedText style={[styles.tabLabel, active && styles.tabLabelActive]}>
        {label}
        {typeof count === "number" ? ` (${count})` : ""}
      </ThemedText>
    </Pressable>
  );
}

function Chip({ text, tone = "muted" }) {
  const tones = {
    muted: { bg: "#F1F5F9", fg: "#334155" },
    info: { bg: "#E0F2FE", fg: "#075985" },
    ok: { bg: "#DCFCE7", fg: "#166534" },
    warn: { bg: "#FEF9C3", fg: "#854D0E" },
    danger: { bg: "#FEE2E2", fg: "#991B1B" },
    brand: {
      bg: (Colors.light?.tint || "#0ea5e9") + "22",
      fg: Colors.light?.tint || "#0ea5e9",
    },
  };
  const c = tones[tone] || tones.muted;
  return (
    <View style={[styles.chip, { backgroundColor: c.bg }]}>
      <ThemedText style={{ color: c.fg, fontSize: 12 }}>{text}</ThemedText>
    </View>
  );
}

// Find the owner field on a quote row, regardless of naming
function getTradeId(q) {
  return (
    q?.trade_id ||
    q?.userId ||
    q?.user_id ||
    q?.userid ||
    q?.owner_id ||
    null
  );
}

// Same parser as the detail screen – pulls out Main / Refit etc.
function parseDetails(details) {
  const res = {
    title: null,
    start: null,
    address: null,
    category: null,
    main: null,
    refit: null,
    notes: null,
  };
  if (!details) return res;
  const lines = String(details)
    .split("\n")
    .map((s) => s.trim());
  res.title = lines[0] || "Request";
  for (const ln of lines) {
    const [k, ...rest] = ln.split(":");
    if (!rest.length) continue;
    const key = (k || "").trim().toLowerCase();
    const v = rest.join(":").trim();
    if (key.includes("start")) res.start = v;
    else if (key.includes("address")) res.address = v;
    else if (key.includes("category")) res.category = v;
    else if (key === "main") res.main = v;
    else if (key.includes("refit")) res.refit = v;
    else if (key.includes("notes")) res.notes = v;
  }
  return res;
}

// Strip postcode / outcode from a title-like string
function stripOutcode(text, outcode) {
  if (!text || !outcode) return text;
  let res = String(text);

  const reIn = new RegExp(`\\s+in\\s+${outcode}\\b`, "i");
  res = res.replace(reIn, "");

  const reBare = new RegExp(`\\s+${outcode}\\b`, "i");
  res = res.replace(reBare, "");

  res = res.replace(/[-–|,]\s*$/, "").trim();
  return res.trim();
}

// Try to build "Bathroom refit – Supply & fit" style subtitle
function makeJobSubtitle(row) {
  if (!row) return null;

  // 1) Prefer parsing the Main / Refit lines from details
  if (row.details) {
    const parsed = parseDetails(row.details);
    if (parsed.main || parsed.refit) {
      const outcode =
        row.job_outcode ||
        row.request_job_outcode ||
        row.request_outcode ||
        row.job_out_code ||
        "";

      const main = parsed.main ? stripOutcode(parsed.main, outcode) : "";
      const refit = parsed.refit ? stripOutcode(parsed.refit, outcode) : "";
      const combined =
        main && refit ? `${main} - ${refit}` : main || refit || null;
      if (combined) return combined;
    }
  }

  // 2) Fallback to suggested / project titles
  const raw =
    row.request_suggested_title ||
    row.request_title ||
    row.project_title ||
    row.project_name ||
    row.suggested_title ||
    row.details ||
    "";
  const outcode =
    row.job_outcode ||
    row.request_job_outcode ||
    row.request_outcode ||
    row.job_out_code ||
    "";
  const cleaned = stripOutcode(raw, outcode);
  return cleaned || null;
}

// Decide card – now reused for both pending + decided
function DecideQuoteCard({ item, router, variant = "pending" }) {
  const tradeName =
    item.trade_business_name || item.trade_name || "Trade business";

  const currency = item.currency || "GBP";
  const total =
    item.grand_total !== null && item.grand_total !== undefined
      ? Number(item.grand_total)
      : null;
  const issued = item.issued_at ? new Date(item.issued_at) : null;

  const subtitle = makeJobSubtitle(item);

  const includesVat =
    item.tax_total !== null &&
    item.tax_total !== undefined &&
    Number(item.tax_total) > 0;
  const vatLabel = includesVat ? "Includes VAT" : "No VAT added";

  const status = String(item.status || "").toLowerCase();

  let tagConfig = null;
  if (variant === "pending") {
    tagConfig = {
      text: "Awaiting your decision",
      tone: "brand",
    };
  } else {
    if (status === "accepted") {
      tagConfig = { text: "You accepted", tone: "ok" };
    } else if (status === "declined") {
      tagConfig = { text: "You declined", tone: "danger" };
    } else if (status === "expired") {
      tagConfig = { text: "Expired", tone: "warn" };
    } else {
      tagConfig = { text: "Updated", tone: "muted" };
    }
  }

  const handleOpenQuote = () => {
    if (!item.quote_id) {
      Alert.alert(
        "Quote not available",
        "This quote record is missing an ID."
      );
      return;
    }
    router.push(`/myquotes/${item.quote_id}`);
  };

  return (
    <Pressable onPress={handleOpenQuote} style={{ flex: 1 }}>
      <ThemedView style={styles.decisionCard}>
        <View style={styles.decisionTopRow}>
          <View style={{ flex: 1 }}>
            <ThemedText style={styles.decisionTitle}>{tradeName}</ThemedText>
            {!!subtitle && (
              <ThemedText style={styles.decisionSubtitle} variant="muted">
                {subtitle}
              </ThemedText>
            )}
          </View>
          {tagConfig && <Chip text={tagConfig.text} tone={tagConfig.tone} />}
        </View>

        <Spacer height={10} />

        <View style={styles.decisionAmountRow}>
          <View>
            <ThemedText style={styles.decisionAmountLabel}>
              Total quote
            </ThemedText>
            {total !== null && !Number.isNaN(total) ? (
              <>
                <ThemedText style={styles.decisionAmount}>
                  {currency} {total.toFixed(2)}
                </ThemedText>
                <ThemedText style={styles.decisionSub} variant="muted">
                  {vatLabel}
                </ThemedText>
              </>
            ) : (
              <ThemedText style={styles.decisionSub} variant="muted">
                Tap to view quote details
              </ThemedText>
            )}
          </View>
          {issued && (
            <View style={{ alignItems: "flex-end" }}>
              <ThemedText style={styles.decisionMetaLabel}>Issued</ThemedText>
              <ThemedText style={styles.decisionMetaValue}>
                {issued.toLocaleDateString()}
              </ThemedText>
            </View>
          )}
        </View>

        <Spacer height={10} />

        <View style={styles.actionsRowSingle}>
          <ThemedButton onPress={handleOpenQuote} style={styles.actionButton}>
            <ThemedText style={styles.buttonTextPrimary}>View quote</ThemedText>
          </ThemedButton>
        </View>
      </ThemedView>
    </Pressable>
  );
}

function SectionHeader({ title }) {
  return (
    <View style={styles.sectionHeaderRow}>
      <ThemedText style={styles.sectionHeaderText}>{title}</ThemedText>
    </View>
  );
}

export default function MyQuotesIndex() {
  const { user } = useUser();
  const router = useRouter();

  const [activeTab, setActiveTab] = useState("requests");

  // Data
  const [requests, setRequests] = useState([]);
  const [responses, setResponses] = useState([]);
  const [decideQuotes, setDecideQuotes] = useState([]);
  const [decidedQuotes, setDecidedQuotes] = useState([]);
  const [caps, setCaps] = useState({
    direct_used: 0,
    open_used: 0,
    direct_cap: 3,
    open_cap: 5,
  });

  // Map trade_id -> business_name (kept for other uses / future)
  const [tradeMap, setTradeMap] = useState({});

  // UI state
  const [refreshing, setRefreshing] = useState(false);

  // SECURITY DEFINER RPC to bypass profiles RLS (returns id + business_name)
  const fetchTradeNames = useCallback(
    async (ids) => {
      const uniq = Array.from(new Set((ids || []).filter(Boolean)));
      if (!uniq.length) return;

      // Only fetch the ones we don't have yet
      const need = uniq.filter((id) => !tradeMap[id]);
      if (!need.length) return;

      const { data, error } = await supabase.rpc("rpc_trade_public_names", {
        trade_ids: need,
      });

      if (error) {
        // fail-soft; we'll just show "Trade business"
        return;
      }

      setTradeMap((prev) => {
        const next = { ...prev };
        (data || []).forEach((row) => {
          next[row.profile_id] = row.business_name || "Trade business";
        });
        return next;
      });
    },
    [tradeMap]
  );

  const fetchCapsAndRequests = useCallback(async () => {
    if (!user?.id) return;

    // 1) Caps (reuse existing rpc_client_request_overview)
    try {
      const { data, error } = await supabase.rpc(
        "rpc_client_request_overview",
        {}
      );
      if (!error && Array.isArray(data) && data.length) {
        const { direct_used, open_used, direct_cap, open_cap } = data[0];
        setCaps({
          direct_used: direct_used ?? 0,
          open_used: open_used ?? 0,
          direct_cap: direct_cap ?? 3,
          open_cap: open_cap ?? 5,
        });
      } else {
        setCaps({
          direct_used: 0,
          open_used: 0,
          direct_cap: 3,
          open_cap: 5,
        });
      }
    } catch {
      setCaps({ direct_used: 0, open_used: 0, direct_cap: 3, open_cap: 5 });
    }

    // 2) Requests list (no trade decision yet, no quote yet)
    const { data: reqs, error: reqErr } = await supabase.rpc(
      "rpc_client_list_requests"
    );
    if (reqErr) {
      Alert.alert("Error loading requests", reqErr.message);
      setRequests([]);
    } else {
      setRequests(reqs || []);
    }
  }, [user?.id]);

  const fetchResponses = useCallback(async () => {
    if (!user?.id) return;
    const { data, error } = await supabase.rpc("rpc_client_list_responses");
    if (error) {
      Alert.alert("Error loading responses", error.message);
      setResponses([]);
      return;
    }
    setResponses(data || []);
  }, [user?.id]);

  const fetchDecide = useCallback(
    async () => {
      if (!user?.id) return;
      const { data, error } = await supabase.rpc("rpc_client_list_decide_v2", {
        p_days: 30,
        p_limit: 50,
      });
      if (error) {
        Alert.alert("Error loading quotes to decide", error.message);
        setDecideQuotes([]);
        return;
      }
      const rows = data || [];
      setDecideQuotes(rows);

      // Collect trade ids from rows for name lookup (kept for potential reuse)
      const ids = [];
      rows.forEach((r) => {
        if (r.trade_business_id) ids.push(r.trade_business_id);
        if (r.quote_trade_id) ids.push(r.quote_trade_id);
        if (r.target_trade_id) ids.push(r.target_trade_id);
        const fallback = getTradeId(r);
        if (fallback) ids.push(fallback);
      });
      await fetchTradeNames(ids);
    },
    [user?.id, fetchTradeNames]
  );

  const fetchDecided = useCallback(async () => {
    if (!user?.id) return;
    const { data, error } = await supabase.rpc(
      "rpc_client_list_decided_quotes",
      {
        p_days: 90,
        p_limit: 50,
      }
    );
    if (error) {
      Alert.alert("Error loading past decisions", error.message);
      setDecidedQuotes([]);
      return;
    }
    setDecidedQuotes(data || []);
  }, [user?.id]);

  const onRefresh = async () => {
    try {
      setRefreshing(true);
      await Promise.all([
        fetchCapsAndRequests(),
        fetchResponses(),
        fetchDecide(),
        fetchDecided(),
      ]);
    } catch (e) {
      Alert.alert("Refresh failed", e.message);
    } finally {
      setRefreshing(false);
    }
  };

  useEffect(() => {
    if (!user?.id) return;
    (async () => {
      try {
        await Promise.all([
          fetchCapsAndRequests(),
          fetchResponses(),
          fetchDecide(),
          fetchDecided(),
        ]);
      } catch (e) {
        Alert.alert("Error", e.message);
      }
    })();

    // realtime: when requests or quotes change, refresh appropriate lists
    const chQuotes = supabase
      .channel("client-quotes-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "tradify_native_app_db" },
        async () => {
          await fetchDecide();
          await fetchDecided();
          await fetchResponses();
        }
      )
      .subscribe();

    const chReq = supabase
      .channel("client-requests-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "quote_requests" },
        async () => {
          await fetchCapsAndRequests();
          await fetchResponses();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(chQuotes);
      supabase.removeChannel(chReq);
    };
  }, [user?.id, fetchCapsAndRequests, fetchResponses, fetchDecide, fetchDecided]);

  const CapsHeader = () => (
    <View style={styles.capsRow}>
      <Chip
        text={`Direct ${caps.direct_used}/${caps.direct_cap}`}
        tone={caps.direct_used >= caps.direct_cap ? "danger" : "brand"}
      />
      <Chip
        text={`Open ${caps.open_used}/${caps.open_cap}`}
        tone={caps.open_used >= caps.open_cap ? "danger" : "brand"}
      />
    </View>
  );

  // Requests card: card for a request with no trade decision yet
  const renderRequestCard = ({ item }) => {
    const titleText = item.is_direct ? "Direct request" : "Open request";

    const chips = [];
    if (item.is_direct) {
      chips.push(<Chip key="direct" text="Direct request" tone="brand" />);
    } else {
      chips.push(<Chip key="open" text="Open request" tone="muted" />);
    }
    chips.push(<Chip key="await" text="Awaiting response" tone="info" />);
    if (item.budget_band)
      chips.push(<Chip key="budget" text={item.budget_band} tone="muted" />);
    if (item.job_outcode)
      chips.push(
        <Chip key="outcode" text={item.job_outcode} tone="muted" />
      );

    return (
      <Pressable
        onPress={() => router.push(`/myquotes/request/${item.id}`)}
        style={{ flex: 1 }}
      >
        <ThemedView style={styles.card}>
          <ThemedText style={styles.cardTitle}>{titleText}</ThemedText>
          {!!item.suggested_title && (
            <>
              <Spacer height={4} />
              <ThemedText variant="muted">
                {item.suggested_title}
              </ThemedText>
            </>
          )}
          <Spacer height={6} />
          <View style={styles.rowWrap}>{chips}</View>
          <Spacer height={6} />
          <ThemedText variant="muted">
            Created:{" "}
            {item.created_at
              ? new Date(item.created_at).toLocaleString()
              : "-"}
          </ThemedText>
        </ThemedView>
      </Pressable>
    );
  };

  // Responses cards: request where trades have accepted/declined, but no quote exists yet
  const renderResponseCard = ({ item }) => {
    const s = String(item.decision_status || "pending").toLowerCase();
    const chips = [];

    if (s === "accepted")
      chips.push(<Chip key="acc" text="A trade accepted" tone="ok" />);
    else if (s === "declined")
      chips.push(<Chip key="dec" text="All declined" tone="danger" />);
    else if (s === "expired")
      chips.push(<Chip key="exp" text="Expired" tone="warn" />);
    else
      chips.push(
        <Chip key="pend" text="Waiting on trades" tone="info" />
      );

    if (item.decisions_count > 0) {
      chips.push(
        <Chip
          key="count"
          text={`${item.decisions_count} decision${
            item.decisions_count > 1 ? "s" : ""
          }`}
          tone="muted"
        />
      );
    }

    return (
      <Pressable
        onPress={() => router.push(`/myquotes/request/${item.request_id}`)}
        style={{ flex: 1 }}
      >
        <ThemedView style={styles.card}>
          <ThemedText style={styles.cardTitle}>
            {item.suggested_title || "Request"}
          </ThemedText>
          <Spacer height={6} />
          <View style={styles.rowWrap}>{chips}</View>
          <Spacer height={6} />
          <ThemedText variant="muted">
            Created:{" "}
            {item.created_at
              ? new Date(item.created_at).toLocaleString()
              : "-"}
          </ThemedText>
        </ThemedView>
      </Pressable>
    );
  };

  const counts = useMemo(
    () => ({
      requests: requests.length,
      responses: responses.length,
      // Decide tab count = things that still need a decision (not history)
      decide: decideQuotes.length,
    }),
    [requests.length, responses.length, decideQuotes.length]
  );

  const Empty = ({ title, subtitle }) => (
    <View style={{ paddingTop: 40, paddingHorizontal: 40 }}>
      <Spacer height={12} />
      <ThemedText>{title}</ThemedText>
      <Spacer height={8} />
      <ThemedText variant="muted">{subtitle}</ThemedText>
    </View>
  );

  const renderRequestsTab = () => (
    <>
      <CapsHeader />
      <FlatList
        data={requests}
        keyExtractor={(item) => String(item.id)}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        contentContainerStyle={{ paddingTop: 8, paddingBottom: 40 }}
        contentInsetAdjustmentBehavior="automatic"
        ListEmptyComponent={
          <Empty
            title="No requests yet."
            subtitle="Create a request to receive quotes from trades."
          />
        }
        renderItem={renderRequestCard}
      />
    </>
  );

  const renderResponsesTab = () => (
    <FlatList
      data={responses}
      keyExtractor={(item) => String(item.id || item.request_id)}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
      }
      contentContainerStyle={{ paddingTop: 8, paddingBottom: 40 }}
      contentInsetAdjustmentBehavior="automatic"
      ListEmptyComponent={
        <Empty
          title="No responses yet."
          subtitle="When trades accept or decline your request, you’ll see it here."
        />
      }
      renderItem={renderResponseCard}
    />
  );

  const renderDecideTab = () => {
    const hasPending = decideQuotes.length > 0;
    const hasHistory = decidedQuotes.length > 0;

    return (
      <ScrollView
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        contentContainerStyle={{ paddingTop: 8, paddingBottom: 40 }}
      >
        {hasPending && (
          <>
            <SectionHeader title="Need your decision" />
            <Spacer height={8} />
            {decideQuotes.map((q) => (
              <DecideQuoteCard
                key={String(q.quote_id)}
                item={q}
                router={router}
                variant="pending"
              />
            ))}
          </>
        )}

        {hasHistory && (
          <>
            <Spacer height={hasPending ? 24 : 0} />
            <SectionHeader title="Your decisions" />
            <Spacer height={8} />
            {decidedQuotes.map((q) => (
              <DecideQuoteCard
                key={String(q.quote_id)}
                item={q}
                router={router}
                variant="decided"
              />
            ))}
          </>
        )}

        {!hasPending && !hasHistory && (
          <Empty
            title="No quotes here yet."
            subtitle="When a quote arrives, you can decide here and see your past decisions."
          />
        )}
      </ScrollView>
    );
  };

  const renderBody = () => {
    if (activeTab === "requests") return renderRequestsTab();
    if (activeTab === "responses") return renderResponsesTab();
    return renderDecideTab();
  };

  return (
    <ThemedView style={styles.container} safe={true}>
      {/* Tabs */}
      <View style={styles.tabsRow}>
        {TABS.map((t) => (
          <TabBtn
            key={t.key}
            active={activeTab === t.key}
            label={t.label}
            icon={t.icon}
            count={counts[t.key]}
            onPress={() => setActiveTab(t.key)}
          />
        ))}
      </View>

      {renderBody()}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: "stretch" },
  tabsRow: {
    flexDirection: "row",
    justifyContent: "space-around",
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
  },
  tabBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 12,
  },
  tabBtnActive: {
    backgroundColor: (Colors?.light?.tint || "#0ea5e9") + "1A",
  },
  tabLabel: { fontSize: 14, color: "#64748B" },
  tabLabelActive: { color: Colors?.light?.tint || "#0ea5e9" },

  card: {
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 14,
    padding: 12,
    marginHorizontal: 16,
    marginBottom: 12,
    backgroundColor: "#FFFFFF",
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 4,
  },
  cardTitle: { fontWeight: "bold", fontSize: 15 },
  cardSubtitle: {
    fontSize: 12,
    color: "#6B7280",
    marginTop: 2,
  },
  rowWrap: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  chip: {
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 999,
    marginRight: 4,
    marginBottom: 4,
  },
  capsRow: {
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 16,
    paddingBottom: 6,
  },
  cardLine: {
    fontSize: 13,
    color: "#111827",
    marginTop: 2,
  },

  // Section header (for Decide tab)
  sectionHeaderRow: {
    paddingHorizontal: 16,
    paddingVertical: 4,
  },
  sectionHeaderText: {
    fontSize: 16,
    fontWeight: "600",
  },

  // Hero-style decision card for quotes
  decisionCard: {
    marginHorizontal: 16,
    marginBottom: 12,
    padding: 14,
    borderRadius: 20,
    backgroundColor: "#FFFFFF",
    shadowColor: "#0F172A",
    shadowOpacity: 0.06,
    shadowOffset: { width: 0, height: 6 },
    shadowRadius: 12,
    elevation: 3,
  },
  decisionTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  decisionTitle: {
    fontSize: 16,
    fontWeight: "600",
  },
  decisionSubtitle: {
    fontSize: 13,
    marginTop: 2,
  },
  decisionAmountRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
  },
  decisionAmountLabel: {
    fontSize: 12,
    textTransform: "uppercase",
    letterSpacing: 0.4,
    color: "#6B7280",
    marginBottom: 2,
  },
  decisionAmount: {
    fontSize: 20,
    fontWeight: "700",
  },
  decisionSub: {
    marginTop: 2,
    fontSize: 12,
  },
  decisionMetaLabel: {
    fontSize: 12,
    color: "#6B7280",
  },
  decisionMetaValue: {
    fontSize: 14,
    fontWeight: "600",
  },

  actionsRowSingle: {
    marginTop: 10,
    flexDirection: "row",
    justifyContent: "flex-end",
    alignItems: "flex-end",
  },
  actionButton: {
    minWidth: 120,
    borderRadius: 999,
    backgroundColor: TINT,
  },
  buttonTextPrimary: {
    color: "#FFFFFF",
    fontWeight: "600",
    textAlign: "center",
    fontSize: 14,
  },
});
