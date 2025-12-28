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
    category: null,
    service: null,
    description: null,
    property: null,
    timing: null,
    emergency: null,
    budget: null,
    // Legacy fields for backwards compatibility
    start: null,
    address: null,
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
    // New multi-step form fields
    if (key === "category") res.category = v;
    else if (key === "service") res.service = v;
    else if (key === "description") res.description = v;
    else if (key === "property") res.property = v;
    else if (key === "timing") res.timing = v;
    else if (key === "emergency") res.emergency = v;
    else if (key === "budget") res.budget = v;
    // Legacy fields
    else if (key.includes("start")) res.start = v;
    else if (key.includes("address")) res.address = v;
    else if (key === "main") res.main = v;
    else if (key.includes("refit")) res.refit = v;
    else if (key.includes("notes")) res.notes = v;
  }
  return res;
}

// Chip color categories matching app-wide CHIP_TONES standard
// ACTION NEEDED (Orange #F59E0B): Send Quote, New Quote, Expires Soon
// WAITING (Blue #3B82F6): Request Sent, Quote Sent, Quote Pending
// ACTIVE/GOOD (Green #10B981): Quote Accepted, Scheduled, Claimed
// COMPLETED (Gray #6B7280): Completed, Neutral
// NEGATIVE (Red #EF4444): Declined, Expired, No Response
const CHIP_TONES = {
  action: { bg: "#FEF3C7", fg: "#F59E0B", icon: "alert-circle" },
  waiting: { bg: "#DBEAFE", fg: "#3B82F6", icon: "hourglass" },
  active: { bg: "#D1FAE5", fg: "#10B981", icon: "checkmark-circle" },
  completed: { bg: "#F3F4F6", fg: "#6B7280", icon: "checkmark-done" },
  negative: { bg: "#FEE2E2", fg: "#EF4444", icon: "close-circle" },
  muted: { bg: "#F1F5F9", fg: "#334155", icon: null },
};

function Chip({ children, tone = "muted", icon }) {
  const t = CHIP_TONES[tone] || CHIP_TONES.muted;
  const chipIcon = icon || t.icon;
  return (
    <View
      style={{
        backgroundColor: t.bg,
        borderRadius: 999,
        paddingVertical: 6,
        paddingHorizontal: 12,
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
      }}
    >
      {chipIcon && <Ionicons name={chipIcon} size={14} color={t.fg} />}
      <ThemedText style={{ color: t.fg, fontWeight: "700", fontSize: 13 }}>
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
  const [clientName, setClientName] = useState(null); // Client name from requester profile

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
            .select(`
              id, details, created_at, status, claimed_by, claimed_at, budget_band, postcode, requester_id,
              service_categories(id, name, icon),
              service_types(id, name, icon),
              property_types(id, name),
              timing_options(id, name, description, is_emergency)
            `)
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

      // Fetch client name from requester profile
      if (r?.requester_id) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("full_name")
          .eq("id", r.requester_id)
          .maybeSingle();
        setClientName(profile?.full_name || null);
      }

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
    if (s === "claimed") return "active";
    if (s === "declined") return "negative";
    if (s === "open") return "action"; // Open = action needed
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

  // Build titles - prioritize suggested_title for professional display
  // Skip any title that starts with "Direct request to:" as that's metadata, not a title
  const rawTitle = parsed.title || "";
  const cleanedParsedTitle = rawTitle.toLowerCase().startsWith("direct request to")
    ? null
    : rawTitle;

  const baseTitle =
    req?.suggested_title ||
    (parsed.main && parsed.refit && `${parsed.main} – ${parsed.refit}`) ||
    parsed.main ||
    cleanedParsedTitle ||
    (parsed.category && parsed.service ? `${parsed.category} - ${parsed.service}` : null) ||
    "Project";

  const out = (req?.postcode || "").toString().trim().toUpperCase();
  const derivedTitleForCreate = out ? `${baseTitle} in ${out}` : baseTitle;

  const hasAttachments = attachments.length > 0;

  return (
    <ThemedView style={styles.container}>
      {/* Header - Shows client name with close button */}
      <View style={[styles.header, { paddingTop: insets.top + 16 }]}>
        <View style={styles.headerRow}>
          <View style={{ flex: 1 }}>
            <ThemedText style={styles.headerTitle}>
              {clientName || "Client Request"}
            </ThemedText>
          </View>
          <Pressable
            onPress={() =>
              router.canGoBack?.() ? router.back() : router.replace("/quotes")
            }
            hitSlop={10}
            style={styles.closeButton}
          >
            <Ionicons name="close" size={28} color="#6B7280" />
          </Pressable>
        </View>
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
          <View style={styles.chipsRow}>
            <Chip tone="waiting" icon="information-circle">
              {(tgt?.invited_by || "").toLowerCase() === "client"
                ? "Direct request"
                : "Open request"}
            </Chip>
            <Chip tone={statusTone(status)}>
              {status === "open"
                ? "Action needed"
                : status[0].toUpperCase() + status.slice(1)}
            </Chip>
            {!!req?.budget_band && (
              <Chip tone="muted" icon="cash-outline">{req.budget_band}</Chip>
            )}
            {req?.timing_options?.is_emergency && (
              <Chip tone="negative" icon="warning">Emergency</Chip>
            )}
          </View>

          {/* Service Details Card */}
          <View style={styles.card}>
            <View style={styles.sectionHeader}>
              <Ionicons name="construct-outline" size={18} color="#6B7280" />
              <ThemedText style={styles.sectionTitle}>Service Details</ThemedText>
            </View>

            {/* Category - from joined table or parsed */}
            <View style={styles.kvRow}>
              <ThemedText style={styles.kvKey}>Category</ThemedText>
              <ThemedText style={styles.kvVal}>
                {req?.service_categories?.name || parsed.category || "—"}
              </ThemedText>
            </View>

            {/* Service Type - from joined table or parsed */}
            <View style={styles.kvRow}>
              <ThemedText style={styles.kvKey}>Service</ThemedText>
              <ThemedText style={styles.kvVal}>
                {req?.service_types?.name || parsed.service || parsed.main || "—"}
              </ThemedText>
            </View>

            {/* Property Type - from joined table or parsed */}
            <View style={styles.kvRow}>
              <ThemedText style={styles.kvKey}>Property</ThemedText>
              <ThemedText style={styles.kvVal}>
                {req?.property_types?.name || parsed.property || "Not specified"}
              </ThemedText>
            </View>

            {/* Timing - from joined table or parsed */}
            <View style={styles.kvRow}>
              <ThemedText style={styles.kvKey}>Timing</ThemedText>
              <ThemedText style={styles.kvVal}>
                {req?.timing_options?.name || parsed.timing || "—"}
              </ThemedText>
            </View>

            {/* Location if available */}
            {!!req?.postcode && (
              <View style={styles.kvRow}>
                <ThemedText style={styles.kvKey}>Location</ThemedText>
                <ThemedText style={styles.kvVal}>{req.postcode}</ThemedText>
              </View>
            )}

            {/* Budget - from database or parsed from details */}
            {(!!req?.budget_band || !!parsed.budget) && (
              <View style={styles.kvRow}>
                <ThemedText style={styles.kvKey}>Budget</ThemedText>
                <ThemedText style={styles.kvVal}>{req?.budget_band || parsed.budget}</ThemedText>
              </View>
            )}

            {/* Legacy: Address if available */}
            {!!parsed.address && (
              <View style={styles.kvRow}>
                <ThemedText style={styles.kvKey}>Address</ThemedText>
                <ThemedText style={styles.kvVal}>{parsed.address}</ThemedText>
              </View>
            )}

            {/* Legacy: Start date if available */}
            {!!parsed.start && (
              <View style={styles.kvRow}>
                <ThemedText style={styles.kvKey}>Start</ThemedText>
                <ThemedText style={styles.kvVal}>{parsed.start}</ThemedText>
              </View>
            )}

            {/* Legacy: Refit type if available */}
            {!!parsed.refit && (
              <View style={styles.kvRow}>
                <ThemedText style={styles.kvKey}>Refit type</ThemedText>
                <ThemedText style={styles.kvVal}>{parsed.refit}</ThemedText>
              </View>
            )}

            {/* Description - always show, even if empty */}
            <View style={styles.divider} />
            <View style={styles.descriptionSection}>
              <ThemedText style={styles.descriptionLabel}>Description</ThemedText>
              <ThemedText style={[
                styles.descriptionText,
                !(parsed.description || parsed.notes) && styles.descriptionEmpty
              ]}>
                {parsed.description || parsed.notes || "No description provided"}
              </ThemedText>
            </View>
          </View>

          {/* Photos Card - horizontally scrollable */}
          <View style={styles.card}>
            <View style={styles.sectionHeader}>
              <Ionicons name="images-outline" size={18} color="#6B7280" />
              <ThemedText style={styles.sectionTitle}>Photos</ThemedText>
              {attachmentsCount > 0 && (
                <View style={styles.photoCountBadge}>
                  <ThemedText style={styles.photoCountText}>{attachmentsCount}</ThemedText>
                </View>
              )}
            </View>

            {hasAttachments ? (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.photoScrollContent}
              >
                {attachments.map((url, i) => (
                  <Pressable
                    key={`${url}-${i}`}
                    onPress={() => setViewer({ open: true, index: i })}
                    style={styles.photoThumb}
                  >
                    <Image
                      source={{ uri: url }}
                      style={styles.photoImg}
                      resizeMode="cover"
                      onError={(e) =>
                        console.warn("thumb error:", url, e?.nativeEvent?.error)
                      }
                    />
                  </Pressable>
                ))}
              </ScrollView>
            ) : (
              <View style={styles.noPhotosContainer}>
                <Ionicons name="camera-outline" size={32} color="#D1D5DB" />
                <ThemedText style={styles.noPhotosText}>No photos attached</ThemedText>
              </View>
            )}
          </View>

          {/* Request Info Card */}
          <View style={styles.card}>
            <View style={styles.sectionHeader}>
              <Ionicons name="time-outline" size={18} color="#6B7280" />
              <ThemedText style={styles.sectionTitle}>Request Info</ThemedText>
            </View>
            <View style={styles.kvRow}>
              <ThemedText style={styles.kvKey}>Submitted</ThemedText>
              <ThemedText style={styles.kvVal}>
                {new Date(req.created_at).toLocaleDateString("en-GB", {
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </ThemedText>
            </View>
            {!!req?.budget_band && (
              <View style={styles.kvRow}>
                <ThemedText style={styles.kvKey}>Budget</ThemedText>
                <ThemedText style={styles.kvVal}>{req.budget_band}</ThemedText>
              </View>
            )}
          </View>

          {/* Actions - Airbnb/Notion style */}
          {status === "open" && (
            <View style={styles.actionButtonsContainer}>
              <Pressable
                onPress={onDecline}
                style={styles.declineButton}
              >
                <ThemedText style={styles.declineButtonText}>Decline</ThemedText>
              </Pressable>

              <Pressable
                onPress={onAccept}
                style={styles.acceptButton}
              >
                <ThemedText style={styles.acceptButtonText}>Accept request</ThemedText>
              </Pressable>
            </View>
          )}


          {status === "declined" && (
            <View style={[styles.statusBanner, styles.statusBannerDeclined]}>
              <View style={[styles.statusBannerIcon, styles.statusBannerIconDeclined]}>
                <Ionicons name="close-circle" size={24} color="#EF4444" />
              </View>
              <View style={styles.statusBannerContent}>
                <ThemedText style={styles.statusBannerTitle}>Request declined</ThemedText>
                <ThemedText style={styles.statusBannerSubtitle}>
                  You have declined this request
                </ThemedText>
              </View>
            </View>
          )}

          {canCreateQuote && (
            <View style={styles.createQuoteContainer}>
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
                style={styles.createQuoteButton}
                hitSlop={8}
              >
                <Ionicons name="document-text-outline" size={20} color="#fff" />
                <ThemedText style={styles.createQuoteButtonText}>
                  Create quote
                </ThemedText>
              </Pressable>
            </View>
          )}
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
    backgroundColor: "#F9FAFB",
  },
  // Header - Profile-style matching Quote Overview
  header: {
    backgroundColor: "#F9FAFB",
    paddingHorizontal: 20,
    paddingBottom: 6,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: "700",
    color: "#111827",
  },
  headerSubtitle: {
    fontSize: 15,
    fontWeight: "500",
    color: "#6B7280",
    marginTop: 4,
  },
  closeButton: {
    padding: 4,
  },
  chipsRow: {
    marginTop: 8,
    flexDirection: "row",
    gap: 8,
    justifyContent: "center",
    alignItems: "center",
    flexWrap: "wrap",
    paddingHorizontal: 16,
  },

  card: {
    marginTop: 16,
    marginHorizontal: 16,
    backgroundColor: "#fff",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    padding: 16,
    // Subtle shadow for Notion/Airbnb style
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },

  // Section headers
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: "#374151",
    flex: 1,
  },

  kvRow: { flexDirection: "row", gap: 10, marginVertical: 6 },
  kvKey: { width: 100, fontWeight: "600", color: "#6B7280", fontSize: 14 },
  kvVal: { flex: 1, color: "#111827", fontSize: 14 },

  // Description section
  descriptionSection: {
    marginTop: 4,
  },
  descriptionLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: "#6B7280",
    marginBottom: 6,
  },
  descriptionText: {
    fontSize: 14,
    lineHeight: 22,
    color: "#374151",
  },
  descriptionEmpty: {
    color: "#9CA3AF",
    fontStyle: "italic",
  },

  // Photo gallery - horizontal scroll
  photoCountBadge: {
    backgroundColor: "#E5E7EB",
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  photoCountText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#6B7280",
  },
  photoScrollContent: {
    gap: 12,
    paddingRight: 4,
  },
  photoThumb: {
    width: 120,
    height: 120,
    borderRadius: 12,
    overflow: "hidden",
    backgroundColor: "#F3F4F6",
  },
  photoImg: {
    width: "100%",
    height: "100%",
  },
  noPhotosContainer: {
    alignItems: "center",
    paddingVertical: 24,
    gap: 8,
  },
  noPhotosText: {
    fontSize: 14,
    color: "#9CA3AF",
  },

  divider: {
    marginTop: 12,
    marginBottom: 4,
    height: StyleSheet.hairlineWidth,
    backgroundColor: "#E5E7EB",
  },

  // Action buttons - Airbnb/Notion style
  actionButtonsContainer: {
    marginTop: 24,
    marginHorizontal: 16,
    flexDirection: "row",
    gap: 12,
  },
  declineButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
  },
  declineButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#374151",
  },
  acceptButton: {
    flex: 2,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: Colors.primary, // Purple primary color
    alignItems: "center",
    justifyContent: "center",
  },
  acceptButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#fff",
  },

  // Status banners (after action taken)
  statusBanner: {
    marginTop: 24,
    marginHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#D1FAE5",
    borderRadius: 12,
    padding: 16,
    gap: 12,
  },
  statusBannerDeclined: {
    backgroundColor: "#FEE2E2",
  },
  statusBannerIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
  },
  statusBannerIconDeclined: {
    backgroundColor: "#fff",
  },
  statusBannerContent: {
    flex: 1,
  },
  statusBannerTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: "#111827",
  },
  statusBannerSubtitle: {
    fontSize: 13,
    color: "#6B7280",
    marginTop: 2,
  },

  // Create quote button
  createQuoteContainer: {
    marginTop: 16,
    marginHorizontal: 16,
  },
  createQuoteButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: Colors.primary,
  },
  createQuoteButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#fff",
  },

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
