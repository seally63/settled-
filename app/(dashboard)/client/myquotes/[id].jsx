// app/(dashboard)/client/myquotes/[id].jsx
import {
  StyleSheet,
  View,
  ScrollView,
  Pressable,
  Alert,
  Image,
  Modal,
  FlatList,
  Dimensions,
  Platform,
} from "react-native";
import { useEffect, useState, useCallback, useMemo } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import { supabase } from "../../../../lib/supabase";
import ThemedView from "../../../../components/ThemedView";
import ThemedText from "../../../../components/ThemedText";
import ThemedButton from "../../../../components/ThemedButton";
import Spacer from "../../../../components/Spacer";
import { Colors } from "../../../../constants/Colors";
import { listRequestImagePaths } from "../../../../lib/api/attachments";

const BUCKET = "request-attachments";
const CELL = 96;
const SCREEN_WIDTH = Dimensions.get("window").width;

const PRIMARY = Colors?.primary || "#6849a7";
const WARNING = Colors?.warning || "#cc475a";

// Same parser as trade request screen
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

export default function ClientMyQuoteDetail() {
  const { id } = useLocalSearchParams();
  const router = useRouter();

  const [quote, setQuote] = useState(null);
  const [trade, setTrade] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  // Request + attachments for "Your request" block
  const [req, setReq] = useState(null);
  const [attachments, setAttachments] = useState([]); // string[] URLs
  const [attachmentsCount, setAttachmentsCount] = useState(0);

  // Full-screen image viewer state
  const [viewer, setViewer] = useState({ open: false, index: 0 });

  const closeViewer = useCallback(() => {
    setViewer((v) => ({ ...v, open: false }));
  }, []);

  const handleZoomScrollEndDrag = useCallback(
    (e, pageIndex) => {
      if (!viewer.open || pageIndex !== viewer.index) return;
      const { contentOffset, zoomScale } = e.nativeEvent || {};
      if (zoomScale && zoomScale <= 1.01 && contentOffset?.y < -40) {
        closeViewer();
      }
    },
    [viewer.open, viewer.index, closeViewer]
  );

  const hasAttachments = attachments.length > 0;
  const parsed = useMemo(() => parseDetails(req?.details), [req?.details]);

  const loadAttachments = useCallback(async (requestId) => {
    try {
      const paths = await listRequestImagePaths(String(requestId));
      const p = Array.isArray(paths) ? paths : [];
      setAttachmentsCount(p.length);

      if (!p.length) {
        setAttachments([]);
        return;
      }

      // Build public URLs from paths (bucket is public=true in your SQL)
      const urls = p
        .map((raw) => String(raw || "").replace(/^\//, ""))
        .map(
          (cleanPath) =>
            supabase.storage.from(BUCKET).getPublicUrl(cleanPath).data
              ?.publicUrl
        )
        .filter(Boolean);

      setAttachments(urls);
    } catch (e) {
      console.warn("attachments/load error (client quote):", e?.message || e);
      setAttachments([]);
      setAttachmentsCount(0);
    }
  }, []);

  const loadRequestAndAttachments = useCallback(
    async (requestId) => {
      if (!requestId) {
        setReq(null);
        setAttachments([]);
        setAttachmentsCount(0);
        return;
      }

      try {
        const { data, error } = await supabase
          .from("quote_requests")
          .select(
            "id, details, created_at, budget_band, job_outcode, status, suggested_title"
          )
          .eq("id", requestId)
          .maybeSingle();

        if (error) throw error;
        setReq(data || null);
        await loadAttachments(requestId);
      } catch (e) {
        console.warn("loadRequestAndAttachments error:", e?.message || e);
        setReq(null);
        setAttachments([]);
        setAttachmentsCount(0);
      }
    },
    [loadAttachments]
  );

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("tradify_native_app_db")
        .select("*")
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;

      setQuote(data || null);

      // Load linked request + photos (for "Your request" section)
      if (data?.request_id) {
        await loadRequestAndAttachments(data.request_id);
      } else {
        setReq(null);
        setAttachments([]);
        setAttachmentsCount(0);
      }

      // Determine trade owner id from whichever field is present
      const tradeId =
        data?.trade_id ||
        data?.userId ||
        data?.user_id ||
        data?.userid ||
        data?.owner_id;

      if (tradeId) {
        // Use SECURITY DEFINER RPC so clients can read the public trade name
        const { data: rows, error: rpcErr } = await supabase.rpc(
          "rpc_trade_public_names",
          { trade_ids: [tradeId] }
        );
        if (!rpcErr && Array.isArray(rows) && rows[0]) {
          setTrade({
            id: rows[0].profile_id,
            business_name: rows[0].business_name,
          });
        } else {
          setTrade(null);
        }
      } else {
        setTrade(null);
      }
    } catch (e) {
      Alert.alert("Error", e.message);
      setQuote(null);
      setReq(null);
      setAttachments([]);
      setAttachmentsCount(0);
    } finally {
      setLoading(false);
    }
  }, [id, loadRequestAndAttachments]);

  useEffect(() => {
    load();
  }, [load]);

  async function decide(decision) {
    try {
      setBusy(true);
      const { error } = await supabase.rpc("rpc_client_decide_quote", {
        p_quote_id: id,
        p_decision: decision,
      });
      if (error) throw error;
      await load();
    } catch (e) {
      Alert.alert("Update failed", e.message);
    } finally {
      setBusy(false);
    }
  }

  function confirmAndDecide(decision) {
    const nice = decision === "accepted" ? "Accept" : "Decline";
    const body =
      decision === "accepted"
        ? "Are you sure you want to accept this quote? The trade will be notified."
        : "Are you sure you want to decline this quote?";
    Alert.alert(nice, body, [
      { text: "Cancel", style: "cancel" },
      {
        text: nice,
        style: decision === "accepted" ? "default" : "destructive",
        onPress: () => decide(decision),
      },
    ]);
  }

  const status = useMemo(
    () => String(quote?.status || "created").toLowerCase(),
    [quote?.status]
  );
  const canAccept = ["created", "sent", "quoted", "draft"].includes(status);
  const canDecline = ["created", "sent", "quoted", "draft"].includes(status);

  const currency = quote?.currency || "GBP";
  const subtotal = Number(quote?.subtotal ?? 0);
  const taxTotal = Number(quote?.tax_total ?? 0);
  const grand = Number(quote?.grand_total ?? quote?.quote_total ?? 0);
  const includesVat = taxTotal > 0;

  const issuedAt = quote?.issued_at
    ? new Date(quote.issued_at)
    : quote?.created_at
    ? new Date(quote.created_at)
    : null;
  const validUntil = quote?.valid_until ? new Date(quote.valid_until) : null;

  const items = Array.isArray(quote?.line_items) ? quote.line_items : [];
  const tradeName = trade?.business_name || "Trade business";

  // Hero subtitle: use main + refit from request (no postcode)
  const heroSubtitle =
    (parsed?.main && parsed?.refit
      ? `${parsed.main} - ${parsed.refit}`
      : parsed?.main || parsed?.refit) ||
    quote?.project_title ||
    quote?.project_name ||
    "Project details";

  const StatusChip = ({ value }) => {
    const v = String(value || "").toLowerCase();

    // Hide "sent" to avoid confusing the client
    if (v === "sent") return null;

    const map = {
      accepted: { bg: "#E7F6EC", fg: "#166534", icon: "checkmark-circle" },
      declined: { bg: "#FEE2E2", fg: "#991B1B", icon: "close-circle" },
      quoted: { bg: "#F1F5F9", fg: "#0F172A", icon: "pricetag" },
      created: { bg: "#F1F5F9", fg: "#0F172A", icon: "document-text" },
      draft: { bg: "#F1F5F9", fg: "#0F172A", icon: "document-text" },
      expired: { bg: "#F8FAFC", fg: "#334155", icon: "time" },
    };
    const s = map[v] || map.created;
    return (
      <View style={[styles.chip, { backgroundColor: s.bg }]}>
        <Ionicons
          name={s.icon}
          size={14}
          color={s.fg}
          style={{ marginRight: 6 }}
        />
        <ThemedText style={{ color: s.fg, fontWeight: "700" }}>
          {v.charAt(0).toUpperCase() + v.slice(1)}
        </ThemedText>
      </View>
    );
  };

  const AcceptedPanel = () => (
    <View style={styles.acceptedPanel}>
      <View style={styles.acceptedIconWrap}>
        <Ionicons name="checkmark-circle" size={28} color="#fff" />
      </View>
      <View style={{ flex: 1 }}>
        <ThemedText style={styles.acceptedTitle}>
          You accepted this quote
        </ThemedText>
        <ThemedText variant="muted" style={{ marginTop: 4 }}>
          We’ve let the trade know. They might follow up to schedule the work.
        </ThemedText>
      </View>
    </View>
  );

  const DeclinedPanel = () => (
    <View style={[styles.acceptedPanel, { backgroundColor: "#FEE2E2" }]}>
      <View style={[styles.acceptedIconWrap, { backgroundColor: "#991B1B" }]}>
        <Ionicons name="close" size={26} color="#fff" />
      </View>
      <View style={{ flex: 1 }}>
        <ThemedText style={[styles.acceptedTitle, { color: "#991B1B" }]}>
          You declined this quote
        </ThemedText>
        <ThemedText variant="muted" style={{ marginTop: 4 }}>
          If this was a mistake, contact the trade to request a fresh quote.
        </ThemedText>
      </View>
    </View>
  );

  return (
    // No `safe` prop (avoids bottom blob); manual top padding for notch
    <ThemedView style={styles.container}>
      {/* Top bar */}
      <View style={styles.topBar}>
        <Pressable
          onPress={() =>
            router.canGoBack?.() ? router.back() : router.replace("/myquotes")
          }
          hitSlop={10}
        >
          <Ionicons name="arrow-back" size={22} color="#0F172A" />
        </Pressable>
        <ThemedText title style={styles.title}>
          Quote
        </ThemedText>
        <View style={{ width: 22 }} />
      </View>

      {loading ? (
        <View style={{ padding: 16 }}>
          <ThemedText>Loading…</ThemedText>
        </View>
      ) : !quote ? (
        <View style={{ padding: 16 }}>
          <ThemedText>Quote not found.</ThemedText>
        </View>
      ) : (
        <>
          <ScrollView
            contentContainerStyle={{ paddingBottom: 40 }}
            showsVerticalScrollIndicator={false}
          >
            <Spacer height={8} />

            {/* Hero summary card */}
            <View style={styles.heroCard}>
              <View style={styles.heroTopRow}>
                <View style={{ flex: 1 }}>
                  <ThemedText style={styles.tradeHeading}>
                    {tradeName}
                  </ThemedText>
                  <ThemedText style={styles.heroProject} variant="muted">
                    {heroSubtitle}
                  </ThemedText>
                </View>
                <StatusChip value={status} />
              </View>

              <Spacer height={14} />

              <View style={styles.heroAmountRow}>
                <View>
                  <ThemedText style={styles.heroAmountLabel}>
                    Total quote
                  </ThemedText>
                  <ThemedText style={styles.heroAmount}>
                    {currency} {grand.toFixed(2)}
                  </ThemedText>
                  <ThemedText variant="muted" style={styles.heroSub}>
                    {includesVat ? "Includes VAT" : "No VAT added"}
                  </ThemedText>
                </View>
                <View style={{ alignItems: "flex-end" }}>
                  {issuedAt && (
                    <>
                      <ThemedText style={styles.heroMetaLabel}>
                        Issued
                      </ThemedText>
                      <ThemedText style={styles.heroMetaValue}>
                        {issuedAt.toLocaleDateString()}
                      </ThemedText>
                    </>
                  )}
                  {validUntil && (
                    <ThemedText variant="muted" style={styles.heroSub}>
                      Valid until {validUntil.toLocaleDateString()}
                    </ThemedText>
                  )}
                </View>
              </View>
            </View>

            {/* Accepted / declined banners */}
            {status === "accepted" && <AcceptedPanel />}
            {status === "declined" && <DeclinedPanel />}

            {/* Your request (summary + photos) */}
            {req && (
              <>
                <View style={styles.sectionHeaderRow}>
                  <ThemedText style={styles.sectionHeaderText}>
                    Your request
                  </ThemedText>
                </View>
                <View style={styles.card}>
                  {/* Short summary – more client-friendly */}
                  <ThemedText style={styles.reqTitle}>
                    {req.suggested_title || parsed.title || "Bathroom refit"}
                  </ThemedText>

                  <Spacer height={4} />

                  <ThemedText variant="muted" style={styles.reqMeta}>
                    {req.created_at
                      ? `Submitted ${new Date(
                          req.created_at
                        ).toLocaleString()}`
                      : "Submitted date not available"}
                    {req.job_outcode ? `   •   Area ${req.job_outcode}` : ""}
                  </ThemedText>

                  {!!req.budget_band && (
                    <ThemedText variant="muted" style={styles.reqMeta}>
                      Budget: {req.budget_band}
                    </ThemedText>
                  )}

                  {!!parsed.start && (
                    <ThemedText variant="muted" style={styles.reqMeta}>
                      When: {parsed.start}
                    </ThemedText>
                  )}

                  {!!parsed.refit && (
                    <ThemedText variant="muted" style={styles.reqMeta}>
                      Job type: {parsed.refit}
                    </ThemedText>
                  )}

                  {!!parsed.notes && (
                    <ThemedText variant="muted" style={styles.reqMeta}>
                      Notes: {parsed.notes}
                    </ThemedText>
                  )}

                  <View style={styles.divider} />

                  <View
                    style={[
                      styles.kvRow,
                      { alignItems: "center", marginBottom: 8 },
                    ]}
                  >
                    <ThemedText
                      style={[styles.kvKey, { fontWeight: "800" }]}
                    >
                      Photos
                    </ThemedText>
                    <ThemedText style={[styles.kvVal, { opacity: 0.7 }]}>
                      {attachmentsCount > 0
                        ? `(${attachmentsCount})`
                        : "No attachments"}
                    </ThemedText>
                  </View>

                  {hasAttachments && (
                    <View style={styles.gridWrap}>
                      {attachments.map((url, i) => (
                        <Pressable
                          key={`${url}-${i}`}
                          onPress={() =>
                            setViewer({ open: true, index: i })
                          }
                          style={styles.thumbCell}
                          hitSlop={6}
                        >
                          <Image
                            source={{ uri: url }}
                            style={styles.thumbImg}
                            resizeMode="cover"
                            onError={(e) =>
                              console.warn(
                                "thumb error (client quote):",
                                url,
                                e?.nativeEvent?.error
                              )
                            }
                          />
                        </Pressable>
                      ))}
                    </View>
                  )}
                </View>
              </>
            )}

            {/* Quote breakdown */}
            <View style={styles.sectionHeaderRow}>
              <ThemedText style={styles.sectionHeaderText}>
                Quote breakdown
              </ThemedText>
            </View>
            <View style={styles.card}>
              {/* 1) Issued (date only) + validity */}
              <View style={styles.kvRow}>
                <ThemedText style={styles.kvKey}>Issued</ThemedText>
                <ThemedText style={styles.kvVal}>
                  {issuedAt ? issuedAt.toLocaleDateString() : "-"}
                </ThemedText>
              </View>
              {!!validUntil && (
                <View style={styles.kvRow}>
                  <ThemedText style={styles.kvKey}>Valid until</ThemedText>
                  <ThemedText style={styles.kvVal}>
                    {validUntil.toLocaleDateString()}
                  </ThemedText>
                </View>
              )}

              {/* 2) Items */}
              {items.length > 0 && (
                <>
                  <View style={[styles.divider, { marginTop: 12 }]} />
                  {items.map((item, i) => {
                    const qty = Number(item?.qty ?? 0);
                    const price = Number(item?.unit_price ?? 0);
                    const line = Number.isFinite(qty * price)
                      ? (qty * price).toFixed(2)
                      : "0.00";
                    return (
                      <View
                        key={`li-${i}`}
                        style={{
                          paddingVertical: 10,
                          borderTopWidth:
                            i === 0 ? 0 : StyleSheet.hairlineWidth,
                          borderTopColor: "rgba(148,163,184,0.35)",
                          flexDirection: "row",
                          alignItems: "flex-start",
                        }}
                      >
                        <View style={{ flex: 1 }}>
                          <ThemedText style={styles.itemTitle}>
                            {item?.name || "Item"}
                          </ThemedText>
                          {!!item?.description && (
                            <ThemedText
                              variant="muted"
                              style={{ marginTop: 2 }}
                            >
                              {item.description}
                            </ThemedText>
                          )}
                          <ThemedText variant="muted">
                            Qty: {qty} • Price: {currency}{" "}
                            {price.toFixed(2)}
                          </ThemedText>
                        </View>
                        <ThemedText style={styles.lineTotal}>
                          {currency} {line}
                        </ThemedText>
                      </View>
                    );
                  })}
                </>
              )}

              {/* 3) Totals last (with and without VAT) */}
              <View style={[styles.divider, { marginTop: 12 }]} />

              <View style={styles.kvRow}>
                <ThemedText style={styles.kvKey}>Total</ThemedText>
                <ThemedText style={styles.kvValStrong}>
                  {currency} {grand.toFixed(2)}{" "}
                  {includesVat ? "(incl. VAT)" : ""}
                </ThemedText>
              </View>

              {!!subtotal && (
                <View style={styles.kvRow}>
                  <ThemedText style={styles.kvKey}>
                    {includesVat ? "Subtotal (excl. VAT)" : "Subtotal"}
                  </ThemedText>
                  <ThemedText style={styles.kvVal}>
                    {currency} {subtotal.toFixed(2)}
                  </ThemedText>
                </View>
              )}

              {!!taxTotal && (
                <View style={styles.kvRow}>
                  <ThemedText style={styles.kvKey}>VAT</ThemedText>
                  <ThemedText style={styles.kvVal}>
                    {currency} {taxTotal.toFixed(2)}
                  </ThemedText>
                </View>
              )}
            </View>

            {/* Review / decision */}
            {status !== "accepted" && status !== "declined" ? (
              <>
                <View style={styles.sectionHeaderRow}>
                  <ThemedText style={styles.sectionHeaderText}>
                    Review
                  </ThemedText>
                </View>
                <View style={styles.card}>
                  <ThemedText variant="muted" style={{ marginBottom: 10 }}>
                    Review the quote and choose whether you’d like to go ahead
                    or not. The trade will be notified of your choice.
                  </ThemedText>
                  <View style={styles.actionsRow}>
                    <Pressable
                      disabled={!canDecline || busy}
                      onPress={() => confirmAndDecide("declined")}
                      style={[
                        styles.iconDecisionBtn,
                        {
                          backgroundColor: canDecline ? WARNING : "#CBD5E1",
                        },
                      ]}
                      accessibilityLabel="Decline quote"
                    >
                      <Ionicons name="close" size={22} color="#FFFFFF" />
                    </Pressable>
                    <Pressable
                      disabled={!canAccept || busy}
                      onPress={() => confirmAndDecide("accepted")}
                      style={[
                        styles.iconDecisionBtn,
                        {
                          backgroundColor: canAccept ? PRIMARY : "#CBD5E1",
                        },
                      ]}
                      accessibilityLabel="Accept quote"
                    >
                      <Ionicons name="checkmark" size={22} color="#FFFFFF" />
                    </Pressable>
                  </View>
                </View>
              </>
            ) : (
              <>
                <View style={styles.sectionHeaderRow}>
                  <ThemedText style={styles.sectionHeaderText}>
                    What happens next
                  </ThemedText>
                </View>
                <View style={styles.card}>
                  <ThemedText variant="muted">
                    We’ll keep you updated here. You can return to My Quotes
                    anytime from the tab bar.
                  </ThemedText>
                </View>
              </>
            )}

{/* Start conversation button → messages thread for this request */}
<View style={styles.conversationBlock}>
  <ThemedButton
    onPress={() => {
      if (!quote?.request_id) {
        Alert.alert(
          "Conversation unavailable",
          "This quote is not linked to a request yet."
        );
        return;
      }

      router.push({
        pathname: "/(dashboard)/messages/[id]",
        params: {
          id: String(quote.request_id),
          name: tradeName || "",
          // this is what messages/[id].jsx uses to load the hero card
          quoteId: String(quote.id || id),
        },
      });
    }}
    style={styles.conversationBtn}
  >
    <ThemedText style={styles.conversationText}>
      {`Start a conversation with ${tradeName}`}
    </ThemedText>
  </ThemedButton>
</View>

          </ScrollView>

          {/* Image preview modal – zoom + swipe + pull-down-to-dismiss */}
          {viewer.open && hasAttachments && (
            <Modal
              visible={viewer.open}
              animationType="fade"
              onRequestClose={closeViewer}
              onDismiss={closeViewer}
            >
              <View style={styles.modalBackdrop}>
                {/* Horizontal pager of zoomable images */}
                <FlatList
                  data={attachments}
                  keyExtractor={(url, idx) => `${url}-${idx}`}
                  horizontal
                  pagingEnabled
                  showsHorizontalScrollIndicator={false}
                  style={styles.carousel}
                  initialScrollIndex={viewer.index}
                  getItemLayout={(data, index) => ({
                    length: SCREEN_WIDTH,
                    offset: SCREEN_WIDTH * index,
                    index,
                  })}
                  onMomentumScrollEnd={(e) => {
                    const newIndex = Math.round(
                      e.nativeEvent.contentOffset.x / SCREEN_WIDTH
                    );
                    if (!Number.isNaN(newIndex)) {
                      setViewer((v) => ({ ...v, index: newIndex }));
                    }
                  }}
                  renderItem={({ item: url, index }) => (
                    <ScrollView
                      style={styles.zoomScroll}
                      contentContainerStyle={styles.zoomContent}
                      maximumZoomScale={3}
                      minimumZoomScale={1}
                      showsHorizontalScrollIndicator={false}
                      showsVerticalScrollIndicator={false}
                      bounces
                      centerContent
                      scrollEventThrottle={16}
                      onScrollEndDrag={(e) =>
                        handleZoomScrollEndDrag(e, index)
                      }
                    >
                      <Image
                        source={{ uri: url }}
                        style={styles.modalImage}
                        resizeMode="contain"
                        onError={(e) =>
                          console.warn(
                            "preview error (client quote):",
                            url,
                            e?.nativeEvent?.error
                          )
                        }
                      />
                    </ScrollView>
                  )}
                />

                {/* Close button */}
                <Pressable
                  style={styles.modalClose}
                  onPress={closeViewer}
                  hitSlop={8}
                >
                  <Ionicons name="close" size={24} color="#fff" />
                </Pressable>
              </View>
            </Modal>
          )}
        </>
      )}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors?.light?.background || "#F8FAFC",
    // manual safe-area offset for iOS notch, without bottom blob
    paddingTop: Platform.OS === "ios" ? 44 : 0,
  },

  topBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 8,
    backgroundColor: Colors?.light?.background || "#F8FAFC",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(148,163,184,0.4)",
  },
  title: {
    flex: 1,
    textAlign: "center",
    fontSize: 18,
  },

  headerBlock: {
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  tradeHeading: {
    fontSize: 18,
    fontWeight: "600",
  },

  chip: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },

  // Hero card
  heroCard: {
    marginHorizontal: 16,
    marginBottom: 8,
    padding: 16,
    borderRadius: 20,
    backgroundColor: "#FFFFFF",
    shadowColor: "#0F172A",
    shadowOpacity: 0.08,
    shadowOffset: { width: 0, height: 8 },
    shadowRadius: 16,
    elevation: 4,
  },
  heroTopRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  heroProject: {
    marginTop: 2,
    fontSize: 13,
  },
  heroAmountRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
  },
  heroAmountLabel: {
    fontSize: 12,
    textTransform: "uppercase",
    letterSpacing: 0.4,
    color: "#6B7280",
    marginBottom: 2,
  },
  heroAmount: {
    fontSize: 22,
    fontWeight: "700",
  },
  heroSub: {
    marginTop: 2,
    fontSize: 12,
  },
  heroMetaLabel: {
    fontSize: 12,
    color: "#6B7280",
  },
  heroMetaValue: {
    fontSize: 14,
    fontWeight: "600",
  },

  acceptedPanel: {
    marginHorizontal: 16,
    marginVertical: 8,
    padding: 12,
    borderRadius: 12,
    backgroundColor: "#DCFCE7",
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  acceptedIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 999,
    backgroundColor: "#16A34A",
    alignItems: "center",
    justifyContent: "center",
  },
  acceptedTitle: {
    fontWeight: "600",
    fontSize: 15,
  },

  card: {
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 16,
    padding: 12,
    marginHorizontal: 16,
    marginVertical: 8,
    backgroundColor: "#FFFFFF",
  },
  sectionTitle: {
    fontWeight: "600",
    marginBottom: 4,
  },
  itemTitle: {
    fontWeight: "500",
  },
  lineTotal: {
    fontWeight: "600",
    marginLeft: 8,
  },

  // Section headers (Airbnb-style)
  sectionHeaderRow: {
    marginTop: 18,
    paddingHorizontal: 16,
    paddingBottom: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(148,163,184,0.5)",
  },
  sectionHeaderText: {
    fontSize: 19, // +4 from earlier 15
    fontWeight: "700",
  },

  // Request summary
  reqTitle: {
    fontWeight: "600",
    fontSize: 15,
  },
  reqMeta: {
    fontSize: 13,
    marginTop: 2,
  },

  // Request key/value rows
  kvRow: { flexDirection: "row", gap: 10, marginVertical: 6 },
  kvKey: { width: 120, fontWeight: "700", fontSize: 13 },
  kvVal: { flex: 1, fontSize: 13.5 },
  kvValStrong: {
    flex: 1,
    textAlign: "right",
    fontWeight: "700",
    fontSize: 14,
  },

  divider: {
    marginTop: 10,
    marginBottom: 8,
    height: StyleSheet.hairlineWidth,
    backgroundColor: "rgba(148,163,184,0.4)",
  },

  // grid for request photos
  gridWrap: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  thumbCell: {
    width: CELL,
    height: CELL,
    backgroundColor: "#eee",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(0,0,0,0.1)",
    borderRadius: 10,
    overflow: "hidden",
  },
  thumbImg: { width: "100%", height: "100%" },

  // Decision actions (icon-only)
  actionsRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 12,
    marginTop: 8,
  },
  iconDecisionBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },

  nextSteps: {
    marginHorizontal: 16,
    marginTop: 16,
  },
  nextStepsTitle: {
    fontWeight: "600",
  },

  conversationBlock: {
    marginHorizontal: 16,
    marginTop: 20,
    marginBottom: 24,
  },
  conversationBtn: {
    borderRadius: 999,
    backgroundColor: PRIMARY,
    paddingVertical: 12,
  },
  conversationText: {
    textAlign: "center",
    fontWeight: "600",
    color: "#FFFFFF",
  },

  // modal for image viewer
  modalBackdrop: {
    flex: 1,
    backgroundColor: "#000",
    alignItems: "center",
    justifyContent: "center",
  },
  modalClose: { position: "absolute", top: 48, right: 24, padding: 8 },

  carousel: {
    flex: 1,
    width: "100%",
  },
  zoomScroll: {
    flex: 1,
    width: SCREEN_WIDTH,
  },
  zoomContent: {
    flexGrow: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  modalImage: {
    width: "90%",
    height: "70%",
    resizeMode: "contain",
  },
});
