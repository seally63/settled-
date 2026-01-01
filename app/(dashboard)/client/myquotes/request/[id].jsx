// app/(dashboard)/client/myquotes/request/[id].jsx
// Client view of their own request - read-only, no accept/decline actions
import {
  StyleSheet,
  View,
  ScrollView,
  Pressable,
  Alert,
  Image,
  Dimensions,
} from "react-native";
import ImageViewing from "react-native-image-viewing";
import { useEffect, useMemo, useState, useCallback } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import ThemedView from "../../../../../components/ThemedView";
import ThemedText from "../../../../../components/ThemedText";
import Spacer from "../../../../../components/Spacer";
import { Colors } from "../../../../../constants/Colors";
import { useUser } from "../../../../../hooks/useUser";
import { supabase } from "../../../../../lib/supabase";
import { listRequestImagePaths } from "../../../../../lib/api/attachments";

const BUCKET = "request-attachments";
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
    directTo: null, // "Direct request to: Business Name"
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
    if (key === "category") res.category = v;
    else if (key === "service") res.service = v;
    else if (key === "description") res.description = v;
    else if (key === "property") res.property = v;
    else if (key === "timing") res.timing = v;
    else if (key === "emergency") res.emergency = v;
    else if (key === "budget") res.budget = v;
    else if (key === "direct request to") res.directTo = v;
    else if (key.includes("start")) res.start = v;
    else if (key.includes("address")) res.address = v;
    else if (key === "main") res.main = v;
    else if (key.includes("refit")) res.refit = v;
    else if (key.includes("notes")) res.notes = v;
  }
  return res;
}

// Chip tones
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

export default function ClientRequestDetails() {
  const { id } = useLocalSearchParams();
  const router = useRouter();
  const { user } = useUser();
  const insets = useSafeAreaInsets();

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);

  const [req, setReq] = useState(null);
  const [targetTrade, setTargetTrade] = useState(null); // Trade business info for direct requests
  const [isDirectRequest, setIsDirectRequest] = useState(false); // Whether this is a direct request
  const [responseCount, setResponseCount] = useState(0);

  const [attachments, setAttachments] = useState([]);
  const [attachmentsCount, setAttachmentsCount] = useState(0);

  const [viewer, setViewer] = useState({ open: false, index: 0 });

  const closeViewer = useCallback(() => {
    setViewer((v) => ({ ...v, open: false }));
  }, []);

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

      const urls = p
        .map((raw) => String(raw || "").replace(/^\//, ""))
        .map(
          (cleanPath) =>
            supabase.storage.from(BUCKET).getPublicUrl(cleanPath).data?.publicUrl
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
      // Fetch request details
      const { data: r, error: rErr } = await supabase
        .from("quote_requests")
        .select(`
          id, details, created_at, status, budget_band, postcode, requester_id,
          service_categories(id, name, icon),
          service_types(id, name, icon),
          property_types(id, name),
          timing_options(id, name, description, is_emergency)
        `)
        .eq("id", id)
        .eq("requester_id", user.id) // Only fetch if client owns this request
        .maybeSingle();

      if (rErr) throw rErr;
      if (!r) throw new Error("Request not found or you don't have access.");

      setReq(r);

      // Check for direct request target
      const { data: targets, error: targetsError } = await supabase
        .from("request_targets")
        .select("trade_id, invited_by, state")
        .eq("request_id", id);

      // Check for client-invited target (case-insensitive)
      const directTarget = targets?.find((t) =>
        (t.invited_by || "").toLowerCase() === "client"
      );

      setIsDirectRequest(!!directTarget); // Set based on whether a client-invited target exists
      setResponseCount(targets?.length || 0);

      // If direct request, fetch trade business name
      if (directTarget?.trade_id) {
        const { data: tradeProfile } = await supabase
          .from("profiles")
          .select("business_name, full_name")
          .eq("id", directTarget.trade_id)
          .maybeSingle();
        setTargetTrade(tradeProfile);
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

  const status = (req?.status || "open").toLowerCase();
  const tradeName = targetTrade?.business_name || targetTrade?.full_name || parsed.directTo;

  function statusTone(s) {
    if (s === "claimed") return "active";
    if (s === "declined") return "negative";
    if (s === "open") return "waiting"; // For client view, open = waiting for response
    return "muted";
  }

  function statusText(s) {
    if (s === "open") return "Awaiting Response";
    if (s === "claimed") return "Trade Accepted";
    if (s === "declined") return "Declined";
    return s.charAt(0).toUpperCase() + s.slice(1);
  }

  const hasAttachments = attachments.length > 0;

  return (
    <ThemedView style={styles.container}>
      {/* Header - "Your Request" title with close button */}
      <View style={[styles.header, { paddingTop: insets.top + 16 }]}>
        <View style={styles.headerRow}>
          <ThemedText style={styles.headerTitle}>Your Request</ThemedText>
          <Pressable
            onPress={() =>
              router.canGoBack?.() ? router.back() : router.replace("/myquotes")
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
          <ThemedText style={{ textAlign: "center" }}>Loading...</ThemedText>
        </>
      ) : err ? (
        <>
          <Spacer />
          <ThemedText style={{ textAlign: "center", color: "#EF4444" }}>Error: {err}</ThemedText>
        </>
      ) : !req ? (
        <>
          <Spacer />
          <ThemedText style={{ textAlign: "center" }}>Request not found.</ThemedText>
        </>
      ) : (
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingBottom: 140 }}
          contentInsetAdjustmentBehavior="always"
          keyboardShouldPersistTaps="handled"
        >
          {/* Status chips */}
          <View style={styles.chipsRow}>
            <Chip tone="muted" icon="information-circle">
              {isDirectRequest ? "Direct request" : "Open request"}
            </Chip>
            <Chip tone={statusTone(status)}>
              {statusText(status)}
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

            <View style={styles.kvRow}>
              <ThemedText style={styles.kvKey}>Category</ThemedText>
              <ThemedText style={styles.kvVal}>
                {req?.service_categories?.name || parsed.category || "-"}
              </ThemedText>
            </View>

            <View style={styles.kvRow}>
              <ThemedText style={styles.kvKey}>Service</ThemedText>
              <ThemedText style={styles.kvVal}>
                {req?.service_types?.name || parsed.service || parsed.main || "-"}
              </ThemedText>
            </View>

            <View style={styles.kvRow}>
              <ThemedText style={styles.kvKey}>Property</ThemedText>
              <ThemedText style={styles.kvVal}>
                {req?.property_types?.name || parsed.property || "Not specified"}
              </ThemedText>
            </View>

            <View style={styles.kvRow}>
              <ThemedText style={styles.kvKey}>Timing</ThemedText>
              <ThemedText style={styles.kvVal}>
                {req?.timing_options?.name || parsed.timing || "-"}
              </ThemedText>
            </View>

            {!!req?.postcode && (
              <View style={styles.kvRow}>
                <ThemedText style={styles.kvKey}>Location</ThemedText>
                <ThemedText style={styles.kvVal}>{req.postcode}</ThemedText>
              </View>
            )}

            {(!!req?.budget_band || !!parsed.budget) && (
              <View style={styles.kvRow}>
                <ThemedText style={styles.kvKey}>Budget</ThemedText>
                <ThemedText style={styles.kvVal}>{req?.budget_band || parsed.budget}</ThemedText>
              </View>
            )}

            {!!parsed.address && (
              <View style={styles.kvRow}>
                <ThemedText style={styles.kvKey}>Address</ThemedText>
                <ThemedText style={styles.kvVal}>{parsed.address}</ThemedText>
              </View>
            )}

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

          {/* Photos Card */}
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
            {responseCount > 0 && (
              <View style={styles.kvRow}>
                <ThemedText style={styles.kvKey}>Responses</ThemedText>
                <ThemedText style={styles.kvVal}>
                  {isDirectRequest && tradeName ? tradeName : `${responseCount} trade${responseCount !== 1 ? 's' : ''}`}
                </ThemedText>
              </View>
            )}
          </View>

          {/* Status info banner */}
          {status === "open" && (
            <View style={styles.statusBanner}>
              <View style={styles.statusBannerIcon}>
                <Ionicons name="hourglass" size={24} color="#3B82F6" />
              </View>
              <View style={styles.statusBannerContent}>
                <ThemedText style={styles.statusBannerTitle}>Waiting for response</ThemedText>
                <ThemedText style={styles.statusBannerSubtitle}>
                  {isDirectRequest
                    ? `Waiting for ${tradeName || 'the trade'} to respond`
                    : "Waiting for tradespeople to respond to your request"}
                </ThemedText>
              </View>
            </View>
          )}

        </ScrollView>
      )}

      {/* Image viewer with zoom, swipe and drag-to-dismiss */}
      <ImageViewing
        images={attachments.map((url) => ({ uri: url }))}
        imageIndex={viewer.index}
        visible={viewer.open}
        onRequestClose={closeViewer}
        swipeToCloseEnabled
        doubleTapToZoomEnabled
        presentationStyle="overFullScreen"
        animationType="fade"
      />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "stretch",
    backgroundColor: "#F9FAFB",
  },
  header: {
    backgroundColor: "#F9FAFB",
    paddingHorizontal: 20,
    paddingBottom: 12,
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
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
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
  statusBanner: {
    marginTop: 24,
    marginHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#DBEAFE",
    borderRadius: 12,
    padding: 16,
    gap: 12,
  },
  statusBannerIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
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
});
