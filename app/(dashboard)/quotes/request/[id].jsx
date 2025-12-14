// app/(dashboard)/quotes/request/[id].jsx
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
} from "react-native";
import { useEffect, useMemo, useState, useCallback } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import ThemedView from "../../../../components/ThemedView";
import ThemedText from "../../../../components/ThemedText";
import Spacer from "../../../../components/Spacer";
import { Colors } from "../../../../constants/Colors";
import { useUser } from "../../../../hooks/useUser";
import { supabase } from "../../../../lib/supabase";

// RPC wrappers
import { acceptRequest, declineRequest } from "../../../../lib/api/requests";
import { listRequestImagePaths } from "../../../../lib/api/attachments";

const BUCKET = "request-attachments"; // change if your bucket name differs
const CELL = 96;
const SCREEN_WIDTH = Dimensions.get("window").width;

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

function Chip({ children, tone = "muted" }) {
  const tones = {
    muted: { bg: "#F1F5F9", fg: "#334155" },
    info: { bg: "#E9F5FF", fg: "#0B74D1" },
    ok: { bg: "#EAF8EF", fg: "#117A37" },
    bad: { bg: "#FDECEC", fg: "#B42318" },
    dark: { bg: "#0F172A", fg: "#fff" },
  };
  const t = tones[tone] || tones.muted;
  return (
    <View
      style={{
        backgroundColor: t.bg,
        borderRadius: 999,
        paddingVertical: 6,
        paddingHorizontal: 12,
      }}
    >
      <ThemedText style={{ color: t.fg, fontWeight: "800", fontSize: 13 }}>
        {children}
      </ThemedText>
    </View>
  );
}

export default function RequestDetails() {
  const { id } = useLocalSearchParams(); // request_id
  const router = useRouter();
  const { user } = useUser();
  const insets = useSafeAreaInsets();

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);

  const [req, setReq] = useState(null); // quote_requests row
  const [tgt, setTgt] = useState(null); // request_targets row for this trade (optional)
  const [hasQuote, setHasQuote] = useState(false);

  const [attachments, setAttachments] = useState([]); // string[] of final URLs
  const [attachmentsCount, setAttachmentsCount] = useState(0);

  // Full-screen viewer state: open + current index
  const [viewer, setViewer] = useState({ open: false, index: 0 });

  const closeViewer = useCallback(() => {
    setViewer((v) => ({ ...v, open: false }));
  }, []);

  // Pull down to dismiss: only when page is active AND zoomed out (≈1)
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

      // Build public URLs from paths (bucket must be public=true)
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
      console.warn("attachments/load error:", e?.message || e);
      setAttachments([]);
      setAttachmentsCount(0);
    }
  }, []);

  const load = useCallback(async () => {
    if (!user?.id || !id) return;
    setLoading(true);
    setErr(null);
    try {
      const myId = user.id;

      const [{ data: r, error: rErr }, { data: t }, { data: q }] =
        await Promise.all([
          supabase
            .from("quote_requests")
            .select(
              "id, details, created_at, status, claimed_by, claimed_at, budget_band, job_outcode"
            )
            .eq("id", id)
            .maybeSingle(),
          supabase
            .from("request_targets")
            .select("request_id, trade_id, state, invited_by, created_at")
            .eq("request_id", id)
            .eq("trade_id", myId)
            .maybeSingle(),
          supabase
            .from("tradify_native_app_db")
            .select("id")
            .eq("trade_id", myId)
            .eq("request_id", id)
            .limit(1),
        ]);

      if (rErr) throw rErr;
      setReq(r || null);
      setTgt(t || null);
      setHasQuote(!!(q && q.length));

      await loadAttachments(id);
    } catch (e) {
      setErr(e?.message || String(e));
      setAttachments([]);
      setAttachmentsCount(0);
    } finally {
      setLoading(false);
    }
  }, [user?.id, id, loadAttachments]);

  useEffect(() => {
    load();
  }, [load]);

  const status = (req?.status || "open").toLowerCase(); // open | claimed | declined

  function statusTone(s) {
    if (s === "claimed") return "ok";
    if (s === "declined") return "bad";
    return "muted";
  }

  async function onAccept() {
    if (!id) return;
    Alert.alert("Accept request", "Confirm you want to accept this request?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Accept",
        onPress: async () => {
          try {
            const updated = await acceptRequest(id);
            setReq((prev) => ({
              ...(prev || {}),
              ...updated,
              status: "claimed",
            }));
          } catch (e) {
            Alert.alert("Failed", e?.message || "Unable to accept this request.");
          }
        },
      },
    ]);
  }

  async function onDecline() {
    if (!id) return;
    Alert.alert("Decline request", "Are you sure you want to decline?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Decline",
        style: "destructive",
        onPress: async () => {
          try {
            const updated = await declineRequest(id);
            setReq((prev) => ({
              ...(prev || {}),
              ...updated,
              status: "declined",
            }));
            setHasQuote(false);
          } catch (e) {
            Alert.alert("Failed", e?.message || "Unable to decline this request.");
          }
        },
      },
    ]);
  }

  const canAccept = status === "open";
  const canDecline = status === "open";
  const canCreateQuote = status === "claimed" && !hasQuote;

  // Build titles
  const baseTitle =
    (parsed.main && parsed.refit && `${parsed.main} – ${parsed.refit}`) ||
    parsed.main ||
    parsed.title ||
    "Project";

  const out = (req?.job_outcode || "").toString().trim().toUpperCase();
  const derivedTitleForCreate = out ? `${baseTitle} in ${out}` : baseTitle;

  const hasAttachments = attachments.length > 0;

  return (
    <ThemedView style={styles.container}>
      {/* Header pinned below the notch using safe-area insets */}
      <View style={[styles.topRow, { paddingTop: insets.top + 4 }]}>
        <Pressable
          onPress={() =>
            router.canGoBack?.() ? router.back() : router.replace("/quotes")
          }
          hitSlop={10}
          style={{ paddingRight: 8 }}
        >
          <Ionicons name="arrow-back" size={22} color="#000" />
        </Pressable>
        <ThemedText title style={styles.topTitle}>
          Request
        </ThemedText>
        <View style={{ width: 22 }} />
      </View>

      {loading ? (
        <>
          <Spacer />
          <ThemedText>Loading…</ThemedText>
        </>
      ) : err ? (
        <>
          <Spacer />
          <ThemedText>Error: {err}</ThemedText>
        </>
      ) : !req ? (
        <>
          <Spacer />
          <ThemedText>Request not found.</ThemedText>
        </>
      ) : (
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingBottom: 140 }}
          contentInsetAdjustmentBehavior="always"
          keyboardShouldPersistTaps="handled"
        >
          <Spacer size={6} />
          <ThemedText style={styles.bigTitle}>{baseTitle}</ThemedText>

          <View style={styles.chipsRow}>
            <Chip tone="info">
              {(tgt?.invited_by || "").toLowerCase() === "client"
                ? "Direct request"
                : "Open request"}
            </Chip>
            <Chip tone={statusTone(status)}>
              {status === "open"
                ? "Open"
                : status[0].toUpperCase() + status.slice(1)}
            </Chip>
            {!!req?.budget_band && (
              <Chip tone="muted">{req.budget_band}</Chip>
            )}
            {attachmentsCount > 0 && (
              <View
                style={{ flexDirection: "row", alignItems: "center", gap: 6 }}
              >
                <Ionicons name="camera" size={16} color="#111" />
                <ThemedText style={{ fontWeight: "800" }}>
                  x{attachmentsCount}
                </ThemedText>
              </View>
            )}
          </View>

          {/* Details card WITH Photos */}
          <View style={styles.card}>
            {!!parsed.start && (
              <View style={styles.kvRow}>
                <ThemedText style={styles.kvKey}>Start</ThemedText>
                <ThemedText style={styles.kvVal}>{parsed.start}</ThemedText>
              </View>
            )}
            {!!parsed.address && (
              <View style={styles.kvRow}>
                <ThemedText style={styles.kvKey}>Address</ThemedText>
                <ThemedText style={styles.kvVal}>{parsed.address}</ThemedText>
              </View>
            )}
            {!!parsed.category && (
              <View style={styles.kvRow}>
                <ThemedText style={styles.kvKey}>Category</ThemedText>
                <ThemedText style={styles.kvVal}>{parsed.category}</ThemedText>
              </View>
            )}
            {!!parsed.main && (
              <View style={styles.kvRow}>
                <ThemedText style={styles.kvKey}>Main</ThemedText>
                <ThemedText style={styles.kvVal}>{parsed.main}</ThemedText>
              </View>
            )}
            {!!parsed.refit && (
              <View style={styles.kvRow}>
                <ThemedText style={styles.kvKey}>Refit type</ThemedText>
                <ThemedText style={styles.kvVal}>{parsed.refit}</ThemedText>
              </View>
            )}
            {!!parsed.notes && (
              <View style={styles.kvRow}>
                <ThemedText style={styles.kvKey}>Notes</ThemedText>
                <ThemedText style={styles.kvVal}>{parsed.notes}</ThemedText>
              </View>
            )}
            <View style={styles.kvRow}>
              <ThemedText style={styles.kvKey}>Requested</ThemedText>
              <ThemedText style={styles.kvVal}>
                {new Date(req.created_at).toLocaleString()}
              </ThemedText>
            </View>

            {/* Photos row */}
            <View style={styles.divider} />
            <View
              style={[
                styles.kvRow,
                { alignItems: "center", marginBottom: 8 },
              ]}
            >
              <ThemedText style={[styles.kvKey, { fontWeight: "800" }]}>
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
                    onPress={() => setViewer({ open: true, index: i })}
                    style={styles.thumbCell}
                    hitSlop={6}
                  >
                    <Image
                      source={{ uri: url }}
                      style={styles.thumbImg}
                      resizeMode="cover"
                      onError={(e) =>
                        console.warn(
                          "thumb error:",
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

          {/* Actions */}
          <View style={styles.actionsRow}>
            <Pressable
              onPress={canAccept ? onAccept : undefined}
              style={[
                styles.actionPill,
                status === "claimed" && styles.actionPillAcceptSelected,
                !canAccept &&
                  status !== "claimed" &&
                  styles.actionPillDisabled,
              ]}
              hitSlop={10}
            >
              <Ionicons
                name="checkmark-circle"
                size={40}
                color={status === "claimed" ? "#117A37" : "#9ca3af"}
              />
              <ThemedText
                style={[
                  styles.actionLabel,
                  status === "claimed" && { color: "#117A37" },
                ]}
              >
                Accept
              </ThemedText>
            </Pressable>

            <Pressable
              onPress={canDecline ? onDecline : undefined}
              style={[
                styles.actionPill,
                status === "declined" && styles.actionPillDeclineSelected,
                !canDecline &&
                  status !== "declined" &&
                  styles.actionPillDisabled,
              ]}
              hitSlop={10}
            >
              <Ionicons
                name="close-circle"
                size={40}
                color={status === "declined" ? "#B42318" : "#9ca3af"}
              />
              <ThemedText
                style={[
                  styles.actionLabel,
                  status === "declined" && { color: "#B42318" },
                ]}
              >
                Decline
              </ThemedText>
            </Pressable>
          </View>

          {canCreateQuote ? (
            <>
              <Spacer height={8} />
              <View
                style={{
                  paddingHorizontal: 16,
                  paddingTop: 10,
                  alignItems: "center",
                }}
              >
                <Pressable
                  onPress={() => {
                    router.push({
                      pathname: "/quotes/create",
                      params: {
                        requestId: String(id || ""),
                        title: encodeURIComponent(derivedTitleForCreate),
                        lockTitle: "1",
                      },
                    });
                  }}
                  style={styles.createBtnCentered}
                  hitSlop={8}
                >
                  <ThemedText style={styles.createBtnCenteredText}>
                    Create quote
                  </ThemedText>
                </Pressable>
              </View>
            </>
          ) : null}
        </ScrollView>
      )}

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
                  onScrollEndDrag={(e) => handleZoomScrollEndDrag(e, index)}
                >
                  <Image
                    source={{ uri: url }}
                    style={styles.modalImage}
                    resizeMode="contain"
                    onError={(e) =>
                      console.warn(
                        "preview error:",
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
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "stretch",
    backgroundColor: Colors.light.background,
  },
  topRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingBottom: 8,
  },
  topTitle: {
    flex: 1,
    textAlign: "center",
    fontSize: 18,
    fontWeight: "bold",
  },
  bigTitle: {
    textAlign: "center",
    fontSize: 20,
    fontWeight: "800",
  },
  chipsRow: {
    marginTop: 8,
    flexDirection: "row",
    gap: 8,
    justifyContent: "center",
    alignItems: "center",
    flexWrap: "wrap",
  },

  card: {
    marginTop: 16,
    marginHorizontal: 16,
    backgroundColor: "#fff",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.08)",
    padding: 16,
  },

  kvRow: { flexDirection: "row", gap: 10, marginVertical: 6 },
  kvKey: { width: 120, fontWeight: "700" },
  kvVal: { flex: 1 },

  divider: {
    marginTop: 10,
    marginBottom: 8,
    height: StyleSheet.hairlineWidth,
    backgroundColor: "rgba(0,0,0,0.08)",
  },

  // grid
  gridWrap: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  thumbCell: {
    width: CELL,
    height: CELL,
    backgroundColor: "#eee",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(0,0,0,0.1)",
  },
  thumbImg: { width: "100%", height: "100%", borderRadius: 10 },

  actionsRow: {
    marginTop: 18,
    marginHorizontal: 16,
    flexDirection: "row",
    gap: 32,
    justifyContent: "center",
    alignItems: "center",
  },
  actionPill: {
    alignItems: "center",
    borderRadius: 12,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(0,0,0,0.1)",
    minWidth: 96,
  },
  actionPillDisabled: { opacity: 0.3 },
  actionPillAcceptSelected: {
    backgroundColor: "#EAF8EF",
    borderColor: "#A7E2B1",
  },
  actionPillDeclineSelected: {
    backgroundColor: "#FDECEC",
    borderColor: "#F3B1AD",
  },
  actionLabel: { fontWeight: "700", marginTop: 6 },

  createBtnCentered: {
    alignSelf: "center",
    borderRadius: 22,
    paddingVertical: 12,
    paddingHorizontal: 22,
    backgroundColor: Colors.primary,
  },
  createBtnCenteredText: { color: "#fff", fontWeight: "800" },

  // modal
  modalBackdrop: {
    flex: 1,
    backgroundColor: "#000",
    alignItems: "center",
    justifyContent: "center",
  },
  modalClose: { position: "absolute", top: 48, right: 24, padding: 8 },

  // horizontal pager
  carousel: {
    flex: 1,
    width: "100%",
  },

  // zoom container per image
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
