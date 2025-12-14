// app/(dashboard)/quotes/index.jsx
import { useCallback, useEffect, useState } from "react";
import {
  StyleSheet,
  View,
  ScrollView,
  Pressable,
  ActivityIndicator,
} from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import ThemedView from "../../../components/ThemedView";
import ThemedText from "../../../components/ThemedText";
import Spacer from "../../../components/Spacer";
import { Colors } from "../../../constants/Colors";
import { useUser } from "../../../hooks/useUser";
import { supabase } from "../../../lib/supabase";

/* ---------------- UI atoms ---------------- */
function TabBtn({ active, label, icon, count, onPress }) {
  return (
    <Pressable onPress={onPress} hitSlop={10} style={styles.tabBtn}>
      <Ionicons
        name={icon}
        size={28}
        color={active ? Colors.primary : "rgba(0,0,0,0.45)"}
      />
      <ThemedText
        style={[
          styles.tabLabel,
          { color: active ? Colors.primary : "rgba(0,0,0,0.7)" },
        ]}
      >
        {label}
      </ThemedText>
      <ThemedText
        style={[
          styles.tabCount,
          { color: active ? Colors.primary : "rgba(0,0,0,0.6)" },
        ]}
      >
        {count ?? 0}
      </ThemedText>
      <View
        style={[
          styles.tabUnderline,
          { backgroundColor: active ? Colors.primary : "transparent" },
        ]}
      />
    </Pressable>
  );
}

function StatusRibbon({ value }) {
  const map = {
    open: { text: "New", bg: "#E9F5FF", fg: "#0B74D1" },
    accepted: { text: "Accepted", bg: "#EAF8EF", fg: "#117A37" },
    declined: { text: "Declined", bg: "#FDECEC", fg: "#B42318" },
    awaiting: { text: "Awaiting response", bg: "#FEF3C7", fg: "#92400E" },
  };
  const v = map[value] || map.open;
  return (
    <View style={[styles.ribbon, { backgroundColor: v.bg }]}>
      <ThemedText style={[styles.ribbonText, { color: v.fg }]}>
        {v.text}
      </ThemedText>
    </View>
  );
}

function TypeChip({ kind }) {
  const isDirect = String(kind).toLowerCase() === "client";
  return (
    <View
      style={[
        styles.typeChip,
        {
          backgroundColor: isDirect ? "#F1F0FF" : "#F0F9FF",
          borderColor: "rgba(0,0,0,0.06)",
          marginRight: 8,
          marginTop: 6,
        },
      ]}
    >
      <ThemedText style={styles.typeChipText}>
        {isDirect ? "Direct request" : "Open request"}
      </ThemedText>
    </View>
  );
}

function BudgetChip({ band }) {
  if (!band) return null;
  return (
    <View
      style={[
        styles.typeChip,
        {
          backgroundColor: "#F8FAFC",
          borderColor: "rgba(0,0,0,0.06)",
          marginRight: 8,
          marginTop: 6,
        },
      ]}
    >
      <ThemedText style={styles.typeChipText}>{band}</ThemedText>
    </View>
  );
}

function StateChip({ label }) {
  // green accepted chip (matches your earlier design)
  return (
    <View
      style={[
        styles.typeChip,
        {
          backgroundColor: "#EAF8EF",
          borderColor: "rgba(0,0,0,0.06)",
          marginRight: 8,
          marginTop: 6,
        },
      ]}
    >
      <ThemedText
        style={[
          styles.typeChipText,
          { color: "#117A37", textTransform: "capitalize" },
        ]}
      >
        {label}
      </ThemedText>
    </View>
  );
}

/* --------------- helpers --------------- */
function parseDetails(details) {
  const out = {
    firstLine: null,
    main: null,
    refit: null,
    address: null,
    start: null,
    notes: null,
  };
  if (!details) return out;
  const lines = String(details).split("\n");
  out.firstLine = lines[0] || null;
  for (const ln of lines) {
    const [k, ...rest] = ln.split(":");
    const v = rest.join(":").trim();
    if (!v) continue;
    const key = (k || "").toLowerCase();
    if (key === "main") out.main = v;
    else if (key.includes("refit")) out.refit = v;
    else if (key.includes("address")) out.address = v;
    else if (key.includes("start")) out.start = v;
    else if (key.includes("notes")) out.notes = v;
  }
  return out;
}

function outwardFrom(r) {
  const maybe = (r?.job_outcode || "").toUpperCase();
  if (maybe) return maybe;
  const p = parseDetails(r?.details);
  const token = (p.address || "").split(/\s+/)[0].toUpperCase();
  return token || null;
}

function titleWithOutward(r) {
  const p = parseDetails(r?.details);
  const base =
    p.main && p.refit
      ? `${p.main} – ${p.refit}`
      : p.main
      ? p.main
      : p.firstLine || "Request";
  const out = outwardFrom(r);
  return out ? `${base} in ${out}` : base;
}

function fmtDateTime(s) {
  if (!s) return "—";
  try {
    const d = new Date(s);
    return d.toLocaleString(undefined, {
      year: "numeric",
      month: "short",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return String(s);
  }
}

function fmtDateOnly(s) {
  if (!s) return "—";
  try {
    const d = new Date(s);
    return d.toLocaleDateString();
  } catch {
    return String(s);
  }
}

/* --------------- screen --------------- */
export default function QuotesIndex() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useUser();
  const [activeTab, setActiveTab] = useState("inbox"); // inbox | sent
  const [loading, setLoading] = useState(true);
  const [inboxRows, setInboxRows] = useState([]);
  const [sentRows, setSentRows] = useState([]);
  const [err, setErr] = useState(null);

  const load = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    setErr(null);
    try {
      const myId = user.id;

      const { data: targets, error: tErr } = await supabase
        .from("request_targets")
        .select("request_id, state, invited_by, created_at, trade_id")
        .eq("trade_id", myId)
        .order("created_at", { ascending: false });
      if (tErr) throw tErr;

      const { data: quotes, error: qErr } = await supabase
        .from("tradify_native_app_db")
        .select(
          "id, request_id, status, issued_at, created_at, details, currency, grand_total, tax_total"
        )
        .eq("trade_id", myId)
        .order("issued_at", { ascending: false, nullsFirst: false });
      if (qErr) throw qErr;

      const quotedReqIds = new Set((quotes || []).map((q) => q.request_id));

      const reqIds = Array.from(
        new Set([
          ...(targets || []).map((t) => t.request_id),
          ...(quotes || []).map((q) => q.request_id),
        ])
      );

      // fetch request docs
      let reqById = {};
      if (reqIds.length) {
        const { data: reqs } = await supabase
          .from("quote_requests")
          .select(
            "id, details, created_at, status, job_outcode, budget_band"
          )
          .in("id", reqIds);
        (reqs || []).forEach((r) => (reqById[r.id] = r));
      }

      // batch-fetch attachment counts for visible requests (one query, aggregate client-side)
      let attachCountByReq = {};
      if (reqIds.length) {
        const { data: raRows } = await supabase
          .from("request_attachments")
          .select("request_id")
          .in("request_id", reqIds);
        (raRows || []).forEach((row) => {
          const rid = row.request_id;
          attachCountByReq[rid] = (attachCountByReq[rid] || 0) + 1;
        });
      }

      // INBOX (no quote created yet)
      const inbox = (targets || [])
        .filter((t) => !quotedReqIds.has(t.request_id))
        .map((t) => {
          const r = reqById[t.request_id];
          return {
            request_id: t.request_id,
            invited_at: t.created_at,
            request_type: t.invited_by || "system",
            ribbon:
              t.state === "accepted"
                ? "accepted"
                : t.state === "declined"
                ? "declined"
                : "open",
            title: titleWithOutward(r),
            created_at: r?.created_at,
            budget_band: r?.budget_band || null,
            attachments_count: attachCountByReq[t.request_id] || 0,
          };
        });

      // SENT (quote exists)
      const sent = (quotes || []).map((q) => {
        const r = reqById[q.request_id];
        const t = (targets || []).find(
          (tt) => tt.request_id === q.request_id && tt.trade_id === myId
        );
        return {
          id: q.id,
          request_id: q.request_id,
          status: (q.status || "").toLowerCase(),
          issued_at: q.issued_at ?? q.created_at,
          title: titleWithOutward(r),
          request_type: t?.invited_by || "system",
          budget_band: r?.budget_band || null,
          acceptedByTrade: t?.state === "accepted",
          currency: q.currency,
          grand_total: q.grand_total,
          tax_total: q.tax_total,
        };
      });

      setInboxRows(inbox);
      setSentRows(sent);
    } catch (e) {
      setErr(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    if (user?.id) load();
  }, [user?.id, load]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const inboxCount = inboxRows.length;
  const sentCount = sentRows.length;

  const goRequestDetail = (rid) => router.push(`/quotes/request/${rid}`);
  const goCreateForRequest = (rid, title) =>
    router.push({
      pathname: "/quotes/create",
      params: {
        requestId: rid,
        title: encodeURIComponent(title || ""),
        lockTitle: "1",
      },
    });

  const goOpenQuote = (qid) => router.push(`/quotes/${qid}`);

  return (
    <ThemedView
      style={{ flex: 1, backgroundColor: Colors.light.background }}
    >
      <View style={[styles.headerWrap, { paddingTop: insets.top + 6 }]}>
        <ThemedText style={styles.headerTitle}>Quotes</ThemedText>
        <View style={styles.tabsRow}>
          <TabBtn
            active={activeTab === "inbox"}
            label="Inbox"
            icon="mail-outline"
            count={inboxCount}
            onPress={() => setActiveTab("inbox")}
          />
          <TabBtn
            active={activeTab === "sent"}
            label="Sent"
            icon="paper-plane-outline"
            count={sentCount}
            onPress={() => setActiveTab("sent")}
          />
        </View>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator />
        </View>
      ) : (
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 16 }}
        >
          {activeTab === "inbox" ? (
            <InboxList
              rows={inboxRows}
              onOpen={goRequestDetail}
              onCreate={(rid) => {
                const fakeTitle =
                  inboxRows.find((x) => x.request_id === rid)?.title ||
                  "Project";
                goCreateForRequest(rid, fakeTitle);
              }}
            />
          ) : (
            <SentList rows={sentRows} onOpen={goOpenQuote} />
          )}
          {!!err && (
            <>
              <Spacer height={8} />
              <ThemedText variant="muted" style={{ fontSize: 12 }}>
                Debug: {err}
              </ThemedText>
            </>
          )}
        </ScrollView>
      )}
    </ThemedView>
  );
}

/* --------------- panes --------------- */
function InboxList({ rows, onOpen, onCreate }) {
  if (!rows?.length) {
    return (
      <View style={styles.emptyCard}>
        <ThemedText style={styles.emptyTitle}>No new requests</ThemedText>
        <ThemedText variant="muted" style={{ textAlign: "center" }}>
          You’ll see new client requests here.
        </ThemedText>
      </View>
    );
  }
  return (
    <View style={{ gap: 14 }}>
      {rows.map((r) => (
        <Pressable
          key={r.request_id}
          onPress={() => onOpen(r.request_id)}
          style={styles.card}
          hitSlop={8}
        >
          <StatusRibbon value={r.ribbon} />
          <ThemedText style={styles.cardTitle}>{r.title}</ThemedText>

          <View style={styles.chipsWrap}>
            <TypeChip kind={r.request_type} />
            <BudgetChip band={r.budget_band} />
            {r.attachments_count > 0 && (
              <View style={[styles.metaRight, styles.cameraRow]}>
                <Ionicons name="camera" size={14} color="#111" />
                <ThemedText style={styles.cameraText}>
                  x{r.attachments_count}
                </ThemedText>
              </View>
            )}
            <ThemedText
              variant="muted"
              style={[styles.metaRight, { marginTop: 6 }]}
            >
              Invited: {fmtDateTime(r.invited_at || r.created_at)}
            </ThemedText>
          </View>

          {r.ribbon === "accepted" && (
            <View style={styles.footerRow}>
              <View style={{ flex: 1 }} />
              <Pressable
                onPress={(e) => {
                  e.stopPropagation();
                  onCreate(r.request_id, r.title);
                }}
                style={styles.createBtnSmall}
                hitSlop={8}
              >
                <ThemedText style={styles.createBtnSmallText}>
                  Create quote
                </ThemedText>
              </Pressable>
            </View>
          )}
        </Pressable>
      ))}
    </View>
  );
}

function SentList({ rows, onOpen }) {
  if (!rows?.length) {
    return (
      <View style={styles.emptyCard}>
        <ThemedText style={styles.emptyTitle}>Nothing sent yet</ThemedText>
        <ThemedText variant="muted" style={{ textAlign: "center" }}>
          When you send a quote, it will appear here with the client’s
          decision.
        </ThemedText>
      </View>
    );
  }
  return (
    <View style={{ gap: 14 }}>
      {rows.map((q) => {
        const ribbon =
          q.status === "accepted"
            ? "accepted"
            : q.status === "declined"
            ? "declined"
            : "awaiting";

        const currency = q.currency || "GBP";
        const total =
          q.grand_total !== null && q.grand_total !== undefined
            ? Number(q.grand_total)
            : null;
        const includesVat =
          q.tax_total !== null &&
          q.tax_total !== undefined &&
          Number(q.tax_total) > 0;

        const showNextActionChip = q.status === "accepted";

        return (
          <Pressable
            key={q.id}
            onPress={() => onOpen(q.id)}
            style={styles.card}
            hitSlop={8}
          >
            {/* Awaiting / accepted / declined ribbon kept at top-right */}
            <StatusRibbon value={ribbon} />

            <ThemedText style={styles.cardTitle}>{q.title}</ThemedText>

            <View style={styles.chipsWrap}>
              <TypeChip kind={q.request_type} />
              {!!q.acceptedByTrade && <StateChip label="accepted" />}
              <BudgetChip band={q.budget_band} />

              {showNextActionChip && (
                <Pressable
                  onPress={(e) => {
                    e.stopPropagation();
                    onOpen(q.id);
                  }}
                  hitSlop={6}
                  style={styles.apptChip}
                >
                  <Ionicons
                    name="calendar-outline"
                    size={12}
                    color="#065F46"
                  />
                  <ThemedText style={styles.apptChipText}>
                    Schedule appointment
                  </ThemedText>
                </Pressable>
              )}
            </View>

            <View style={styles.sentAmountRow}>
              <View>
                <ThemedText style={styles.sentAmountLabel}>
                  Total quote
                </ThemedText>
                {total !== null && !Number.isNaN(total) ? (
                  <>
                    <ThemedText style={styles.sentAmount}>
                      {currency} {total.toFixed(2)}
                    </ThemedText>
                    <ThemedText style={styles.sentVat} variant="muted">
                      {includesVat ? "Includes VAT" : "No VAT added"}
                    </ThemedText>
                  </>
                ) : (
                  <ThemedText style={styles.sentVat} variant="muted">
                    Tap to view full quote
                  </ThemedText>
                )}
              </View>
              <View style={{ alignItems: "flex-end" }}>
                <ThemedText style={styles.sentMetaLabel}>Sent</ThemedText>
                <ThemedText style={styles.sentMetaValue}>
                  {fmtDateOnly(q.issued_at)}
                </ThemedText>
              </View>
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

/* --------------- styles --------------- */
const styles = StyleSheet.create({
  headerWrap: {
    paddingBottom: 8,
    alignItems: "center",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(0,0,0,0.08)",
  },
  headerTitle: { fontSize: 20, fontWeight: "800" },
  tabsRow: {
    paddingTop: 6,
    paddingBottom: 8,
    flexDirection: "row",
    justifyContent: "center",
    gap: 36,
  },
  tabBtn: { alignItems: "center", minWidth: 110 },
  tabLabel: { fontWeight: "800", fontSize: 14, marginTop: 4 },
  tabCount: { fontWeight: "700", fontSize: 12, marginTop: 2 },
  tabUnderline: { height: 2, width: 44, marginTop: 6, borderRadius: 2 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },

  emptyCard: {
    backgroundColor: "#fff",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.08)",
    padding: 20,
    alignItems: "center",
    marginHorizontal: 4,
  },
  emptyTitle: { fontWeight: "800", marginBottom: 6 },

  card: {
    backgroundColor: "#fff",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.08)",
    padding: 22,
    overflow: "hidden",
  },
  cardTitle: {
    fontWeight: "800",
    fontSize: 18,
    paddingRight: 130,
    marginBottom: 6,
  },

  ribbon: {
    position: "absolute",
    right: 12,
    top: 12,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  ribbonText: { fontWeight: "800", fontSize: 12 },

  chipsWrap: {
    marginTop: 4,
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
  },
  metaRight: { marginLeft: "auto", fontSize: 12 },

  cameraRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 6,
  },
  cameraText: { fontSize: 12, fontWeight: "800" },

  typeChip: {
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: StyleSheet.hairlineWidth,
  },
  typeChipText: { fontSize: 12, fontWeight: "700" },

  footerRow: { marginTop: 12, flexDirection: "row", alignItems: "center" },

  // small CTA
  createBtnSmall: {
    alignSelf: "flex-end",
    borderRadius: 22,
    paddingVertical: 10,
    paddingHorizontal: 16,
    backgroundColor: Colors.primary,
  },
  createBtnSmallText: { color: "#fff", fontWeight: "800" },

  // Sent tab amount row (client-style summary)
  sentAmountRow: {
    marginTop: 12,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
  },
  sentAmountLabel: {
    fontSize: 12,
    textTransform: "uppercase",
    letterSpacing: 0.4,
    color: "#6B7280",
    marginBottom: 2,
  },
  sentAmount: {
    fontSize: 20,
    fontWeight: "700",
  },
  sentVat: {
    fontSize: 12,
    marginTop: 2,
  },
  sentMetaLabel: {
    fontSize: 12,
    color: "#6B7280",
  },
  sentMetaValue: {
    fontSize: 14,
    fontWeight: "600",
  },

  // "Schedule appointment" chip for accepted quotes
  apptChip: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
    marginTop: 6,
    marginRight: 8,
    backgroundColor: "#ECFDF3",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(22,163,74,0.4)",
  },
  apptChipText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#065F46",
    marginLeft: 4,
  },
});
