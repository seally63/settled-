// app/(dashboard)/client/myquotes/[id].jsx
import {
  StyleSheet,
  View,
  ScrollView,
  Pressable,
  Alert,
  Image,
  Dimensions,
  Platform,
} from "react-native";
import ImageViewing from "react-native-image-viewing";
import { useEffect, useState, useCallback, useMemo } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";

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

// Format number with thousand separators (commas)
function formatNumber(num) {
  if (num == null || isNaN(num)) return "0.00";
  return Number(num).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// Parse the details string to extract individual fields
// Details format: "Category: X\nService: Y\nDescription: Z\nProperty: W\n..."
function parseDetails(details) {
  const res = {
    title: null,
    start: null,
    address: null,
    category: null,
    main: null,
    refit: null,
    notes: null,
    description: null,
    property: null,
    budget: null,
    timing: null,
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
    else if (key === "category") res.category = v;
    else if (key === "main") res.main = v;
    else if (key.includes("refit")) res.refit = v;
    else if (key.includes("notes")) res.notes = v;
    else if (key === "description") res.description = v;
    else if (key === "property") res.property = v;
    else if (key === "budget") res.budget = v;
    else if (key === "timing") res.timing = v;
  }
  return res;
}

export default function ClientMyQuoteDetail() {
  const { id } = useLocalSearchParams();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [quote, setQuote] = useState(null);
  const [trade, setTrade] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  // Request + attachments for "Your request" block
  const [req, setReq] = useState(null);
  const [attachments, setAttachments] = useState([]); // string[] URLs
  const [attachmentsCount, setAttachmentsCount] = useState(0);

  // Appointments data (multiple appointments)
  const [appointments, setAppointments] = useState([]);
  const [expandedAppointments, setExpandedAppointments] = useState(new Set());

  // Full-screen image viewer state
  const [viewer, setViewer] = useState({ open: false, index: 0 });

  const closeViewer = useCallback(() => {
    setViewer((v) => ({ ...v, open: false }));
  }, []);

  const hasAttachments = attachments.length > 0;

  // Convert attachments to format expected by ImageViewing
  const imageViewerData = useMemo(
    () => attachments.map((url) => ({ uri: url })),
    [attachments]
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
            `id, details, created_at, budget_band, postcode, status, suggested_title,
             property_types(id, name),
             timing_options(id, name, description, is_emergency)`
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

      // Load appointments for this quote (can have multiple)
      const { data: apptData, error: apptErr } = await supabase
        .from("appointments")
        .select("*")
        .eq("quote_id", id)
        .order("scheduled_at", { ascending: true });

      if (!apptErr && Array.isArray(apptData)) {
        setAppointments(apptData);
        // Auto-expand the next (first) appointment
        if (apptData.length > 0) {
          setExpandedAppointments(new Set([apptData[0].id]));
        }
      } else {
        setAppointments([]);
      }
    } catch (e) {
      Alert.alert("Error", e.message);
      setQuote(null);
      setReq(null);
      setAttachments([]);
      setAttachmentsCount(0);
      setAppointments([]);
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

  // Helper functions for appointments
  const toggleAppointment = useCallback((appointmentId) => {
    setExpandedAppointments(prev => {
      const newSet = new Set(prev);
      if (newSet.has(appointmentId)) {
        newSet.delete(appointmentId);
      } else {
        newSet.add(appointmentId);
      }
      return newSet;
    });
  }, []);

  const getAppointmentStatus = useCallback((appt) => {
    if (!appt.scheduled_at) return "pending";
    const now = new Date();
    const scheduledDate = new Date(appt.scheduled_at);

    const apptStatus = String(appt.status || "").toLowerCase();

    // Completed takes priority
    if (apptStatus === "completed") return "completed";
    if (apptStatus === "cancelled") return "cancelled";
    if (apptStatus === "rescheduled") return "rescheduled";

    // Check if it's next (upcoming and not started)
    if (scheduledDate > now) {
      if (apptStatus === "confirmed") return "next";
      if (apptStatus === "scheduled") return "scheduled";
      return "pending";
    }

    // Check if it's in progress (scheduled time has passed but not completed)
    if (scheduledDate <= now && apptStatus !== "completed") {
      return "in_progress";
    }

    return apptStatus || "pending";
  }, []);

  // Categorize appointments
  const categorizedAppointments = useMemo(() => {
    const now = new Date();

    const next = [];
    const upcoming = [];
    const completed = [];

    appointments.forEach(appt => {
      const status = getAppointmentStatus(appt);
      const scheduledDate = appt.scheduled_at ? new Date(appt.scheduled_at) : null;

      if (status === "completed" || status === "cancelled") {
        completed.push(appt);
      } else if (scheduledDate && scheduledDate > now) {
        if (next.length === 0 && status !== "rescheduled") {
          next.push(appt);
        } else {
          upcoming.push(appt);
        }
      } else {
        upcoming.push(appt);
      }
    });

    return { next, upcoming, completed };
  }, [appointments, getAppointmentStatus]);

  // Appointment Status Badge Component
  const AppointmentStatusBadge = ({ status }) => {
    const badges = {
      next: { icon: "arrow-forward-circle", color: "#10B981", bg: "#D1FAE5", text: "Next" },
      confirmed: { icon: "checkmark-circle", color: "#10B981", bg: "#D1FAE5", text: "Confirmed" },
      pending: { icon: "hourglass", color: "#F59E0B", bg: "#FEF3C7", text: "Pending" },
      scheduled: { icon: "calendar", color: "#3B82F6", bg: "#DBEAFE", text: "Scheduled" },
      in_progress: { icon: "time", color: "#F59E0B", bg: "#FEF3C7", text: "In Progress" },
      completed: { icon: "checkmark-done", color: "#6B7280", bg: "#F3F4F6", text: "Completed" },
      cancelled: { icon: "close-circle", color: "#EF4444", bg: "#FEE2E2", text: "Cancelled" },
      rescheduled: { icon: "refresh", color: "#F59E0B", bg: "#FEF3C7", text: "Rescheduled" },
    };

    const badge = badges[status] || badges.pending;

    return (
      <View style={[styles.appointmentBadge, { backgroundColor: badge.bg }]}>
        <Ionicons name={badge.icon} size={14} color={badge.color} />
        <ThemedText style={[styles.appointmentBadgeText, { color: badge.color }]}>
          {badge.text}
        </ThemedText>
      </View>
    );
  };

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

  // Appointment Card Component (collapsible)
  const AppointmentCard = ({ appointment, isExpanded, isNext }) => {
    const status = getAppointmentStatus(appointment);
    const scheduledDate = appointment.scheduled_at ? new Date(appointment.scheduled_at) : null;

    const handlePress = () => {
      toggleAppointment(appointment.id);
    };

    return (
      <Pressable
        onPress={handlePress}
        style={[
          styles.appointmentCard,
          isNext && styles.appointmentCardNext,
        ]}
      >
        {/* Header - always visible */}
        <View style={styles.appointmentCardHeader}>
          <View style={{ flex: 1 }}>
            <View style={styles.appointmentCardTitleRow}>
              <ThemedText style={styles.appointmentCardTitle}>
                {appointment.title || "Appointment"}
              </ThemedText>
              <AppointmentStatusBadge status={status} />
            </View>
            {scheduledDate && (
              <View style={styles.appointmentCardMetaRow}>
                <Ionicons name="calendar-outline" size={14} color="#6B7280" />
                <ThemedText style={styles.appointmentCardMeta}>
                  {scheduledDate.toLocaleDateString(undefined, {
                    weekday: "short",
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })}
                  {" at "}
                  {scheduledDate.toLocaleTimeString(undefined, {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </ThemedText>
              </View>
            )}
          </View>
          <Ionicons
            name={isExpanded ? "chevron-up" : "chevron-down"}
            size={20}
            color="#9CA3AF"
          />
        </View>

        {/* Expandable content */}
        {isExpanded && (
          <View style={styles.appointmentCardContent}>
            <View style={styles.appointmentDivider} />

            {appointment.location && (
              <View style={styles.appointmentDetailRow}>
                <Ionicons name="location" size={18} color={PRIMARY} />
                <View style={{ flex: 1, marginLeft: 10 }}>
                  <ThemedText style={styles.appointmentDetailLabel}>
                    Location
                  </ThemedText>
                  <ThemedText style={styles.appointmentDetailValue}>
                    {appointment.location}
                  </ThemedText>
                </View>
              </View>
            )}

            {appointment.notes && (
              <View style={styles.appointmentDetailRow}>
                <Ionicons name="document-text" size={18} color={PRIMARY} />
                <View style={{ flex: 1, marginLeft: 10 }}>
                  <ThemedText style={styles.appointmentDetailLabel}>
                    Notes
                  </ThemedText>
                  <ThemedText style={styles.appointmentDetailValue}>
                    {appointment.notes}
                  </ThemedText>
                </View>
              </View>
            )}

            {/* Action buttons */}
            {isNext && status !== "completed" && status !== "cancelled" && (
              <View style={styles.appointmentActions}>
                <Pressable
                  style={styles.appointmentActionBtn}
                  onPress={() => {
                    // TODO: Add to calendar
                    Alert.alert("Add to Calendar", "This feature will be implemented soon.");
                  }}
                >
                  <Ionicons name="calendar-outline" size={18} color={PRIMARY} />
                  <ThemedText style={styles.appointmentActionText}>
                    Add to Calendar
                  </ThemedText>
                </Pressable>

                {appointment.location && (
                  <Pressable
                    style={styles.appointmentActionBtn}
                    onPress={() => {
                      // TODO: Open directions
                      Alert.alert("Get Directions", "This feature will be implemented soon.");
                    }}
                  >
                    <Ionicons name="navigate-outline" size={18} color={PRIMARY} />
                    <ThemedText style={styles.appointmentActionText}>
                      Directions
                    </ThemedText>
                  </Pressable>
                )}

                <Pressable
                  style={styles.appointmentActionBtn}
                  onPress={() => {
                    // Navigate to messages
                    if (!quote?.request_id) {
                      Alert.alert(
                        "Message unavailable",
                        "This quote is not linked to a request yet."
                      );
                      return;
                    }

                    router.push({
                      pathname: "/(dashboard)/messages/[id]",
                      params: {
                        id: String(quote.request_id),
                        name: tradeName || "",
                        quoteId: String(quote.id || id),
                        returnTo: `/myquotes/${id}`, // Return to this quote detail page
                      },
                    });
                  }}
                >
                  <Ionicons name="chatbubble-outline" size={18} color={PRIMARY} />
                  <ThemedText style={styles.appointmentActionText}>
                    Message
                  </ThemedText>
                </Pressable>
              </View>
            )}
          </View>
        )}
      </Pressable>
    );
  };

  return (
    <ThemedView style={styles.container}>
      {/* Header - Profile-style */}
      <View style={[styles.header, { paddingTop: insets.top + 16 }]}>
        <View style={styles.headerRow}>
          <ThemedText style={styles.headerTitle}>Quote Overview</ThemedText>
          <Pressable
            onPress={() =>
              router.canGoBack?.() ? router.back() : router.replace("/myquotes")
            }
            hitSlop={10}
            style={styles.backButton}
          >
            <Ionicons name="close" size={28} color="#6B7280" />
          </Pressable>
        </View>
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
            contentContainerStyle={{ padding: 20, paddingBottom: 40 }}
            showsVerticalScrollIndicator={false}
          >
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
                    {currency} {formatNumber(grand)}
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

            {/* Declined banner only (removed "accepted" banner as requested) */}
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
                  {/* Title */}
                  <ThemedText style={styles.requestTitle}>
                    {req.suggested_title || parsed.title || "Bathroom refit"}
                  </ThemedText>

                  <Spacer height={16} />

                  {/* Details Grid */}
                  {req.created_at && (
                    <View style={styles.requestDetailRow}>
                      <Ionicons name="calendar-outline" size={18} color="#6B7280" />
                      <View style={styles.requestDetailContent}>
                        <ThemedText style={styles.requestDetailLabel}>Submitted</ThemedText>
                        <ThemedText style={styles.requestDetailValue}>
                          {new Date(req.created_at).toLocaleDateString(undefined, {
                            weekday: 'short',
                            year: 'numeric',
                            month: 'short',
                            day: 'numeric'
                          })}
                        </ThemedText>
                      </View>
                    </View>
                  )}

                  {!!req.postcode && (
                    <View style={styles.requestDetailRow}>
                      <Ionicons name="location-outline" size={18} color="#6B7280" />
                      <View style={styles.requestDetailContent}>
                        <ThemedText style={styles.requestDetailLabel}>Area</ThemedText>
                        <ThemedText style={styles.requestDetailValue}>{req.postcode}</ThemedText>
                      </View>
                    </View>
                  )}

                  {!!parsed.description && (
                    <View style={styles.requestDetailRow}>
                      <Ionicons name="document-text-outline" size={18} color="#6B7280" />
                      <View style={styles.requestDetailContent}>
                        <ThemedText style={styles.requestDetailLabel}>Details</ThemedText>
                        <ThemedText style={styles.requestDetailValue}>{parsed.description}</ThemedText>
                      </View>
                    </View>
                  )}

                  {!!(req.property_types?.name || parsed.property) && (
                    <View style={styles.requestDetailRow}>
                      <Ionicons name="home-outline" size={18} color="#6B7280" />
                      <View style={styles.requestDetailContent}>
                        <ThemedText style={styles.requestDetailLabel}>Property</ThemedText>
                        <ThemedText style={styles.requestDetailValue}>
                          {req.property_types?.name || parsed.property}
                        </ThemedText>
                      </View>
                    </View>
                  )}

                  {!!(req.budget_band || parsed.budget) && (
                    <View style={styles.requestDetailRow}>
                      <Ionicons name="cash-outline" size={18} color="#6B7280" />
                      <View style={styles.requestDetailContent}>
                        <ThemedText style={styles.requestDetailLabel}>Budget</ThemedText>
                        <ThemedText style={styles.requestDetailValue}>
                          {req.budget_band || parsed.budget}
                        </ThemedText>
                      </View>
                    </View>
                  )}

                  {!!(req.timing_options?.name || parsed.timing) && (
                    <View style={styles.requestDetailRow}>
                      <Ionicons name="time-outline" size={18} color={req.timing_options?.is_emergency ? "#EF4444" : "#6B7280"} />
                      <View style={styles.requestDetailContent}>
                        <ThemedText style={styles.requestDetailLabel}>Timing</ThemedText>
                        <ThemedText style={[styles.requestDetailValue, req.timing_options?.is_emergency && { color: "#EF4444" }]}>
                          {req.timing_options?.name || parsed.timing}
                        </ThemedText>
                      </View>
                    </View>
                  )}

                  {hasAttachments && (
                    <>
                      <View style={styles.divider} />

                      <View style={styles.requestDetailRow}>
                        <Ionicons name="images-outline" size={18} color="#6B7280" />
                        <View style={styles.requestDetailContent}>
                          <ThemedText style={styles.requestDetailLabel}>
                            Photos ({attachmentsCount})
                          </ThemedText>
                        </View>
                      </View>

                      <Spacer height={12} />
                    </>
                  )}

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
              {/* Meta information */}
              {issuedAt && (
                <View style={styles.requestDetailRow}>
                  <Ionicons name="calendar-outline" size={18} color="#6B7280" />
                  <View style={styles.requestDetailContent}>
                    <ThemedText style={styles.requestDetailLabel}>Issued</ThemedText>
                    <ThemedText style={styles.requestDetailValue}>
                      {issuedAt.toLocaleDateString(undefined, {
                        weekday: 'short',
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric'
                      })}
                    </ThemedText>
                  </View>
                </View>
              )}

              {!!validUntil && (
                <View style={styles.requestDetailRow}>
                  <Ionicons name="time-outline" size={18} color="#6B7280" />
                  <View style={styles.requestDetailContent}>
                    <ThemedText style={styles.requestDetailLabel}>Valid until</ThemedText>
                    <ThemedText style={styles.requestDetailValue}>
                      {validUntil.toLocaleDateString(undefined, {
                        weekday: 'short',
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric'
                      })}
                    </ThemedText>
                  </View>
                </View>
              )}

              {/* Line items */}
              {items.length > 0 && (
                <>
                  <View style={styles.divider} />
                  <ThemedText style={styles.breakdownSectionLabel}>Line items</ThemedText>
                  <Spacer height={12} />

                  {items.map((item, i) => {
                    const qty = Number(item?.qty ?? 0);
                    const price = Number(item?.unit_price ?? 0);
                    const line = Number.isFinite(qty * price)
                      ? formatNumber(qty * price)
                      : "0.00";
                    return (
                      <View key={`li-${i}`} style={styles.lineItemRow}>
                        <View style={styles.lineItemNumberBadge}>
                          <ThemedText style={styles.lineItemNumberText}>{i + 1}</ThemedText>
                        </View>
                        <View style={{ flex: 1 }}>
                          <ThemedText style={styles.lineItemName}>
                            {item?.name || "Item"}
                          </ThemedText>
                          {!!item?.description && (
                            <ThemedText style={styles.lineItemDescription}>
                              {item.description}
                            </ThemedText>
                          )}
                          <ThemedText style={styles.lineItemMeta}>
                            Qty: {qty} • {currency} {formatNumber(price)} each
                          </ThemedText>
                        </View>
                        <ThemedText style={styles.lineItemTotal}>
                          {currency} {line}
                        </ThemedText>
                      </View>
                    );
                  })}
                </>
              )}

              {/* 3) Totals */}
              <View style={[styles.divider, { marginTop: 12 }]} />
              <ThemedText style={styles.breakdownSectionLabel}>Summary</ThemedText>
              <Spacer height={12} />

              {!!subtotal && (
                <View style={styles.totalRow}>
                  <ThemedText style={styles.totalLabel}>
                    {includesVat ? "Subtotal (excl. VAT)" : "Subtotal"}
                  </ThemedText>
                  <ThemedText style={styles.totalValue}>
                    {currency} {formatNumber(subtotal)}
                  </ThemedText>
                </View>
              )}

              {!!taxTotal && (
                <View style={styles.totalRow}>
                  <ThemedText style={styles.totalLabel}>VAT</ThemedText>
                  <ThemedText style={styles.totalValue}>
                    {currency} {formatNumber(taxTotal)}
                  </ThemedText>
                </View>
              )}

              <View style={[styles.totalRow, styles.totalRowFinal]}>
                <ThemedText style={styles.totalLabelFinal}>Total</ThemedText>
                <ThemedText style={styles.totalValueFinal}>
                  {currency} {formatNumber(grand)}
                </ThemedText>
              </View>
              {includesVat && (
                <ThemedText style={styles.totalNote}>Includes VAT</ThemedText>
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
            ) : null}

            {/* Appointments Section - Multiple Appointments Support */}
            {appointments.length > 0 && (
              <>
                <View style={styles.sectionHeaderRow}>
                  <ThemedText style={styles.sectionHeaderText}>
                    Appointments
                  </ThemedText>
                </View>

                {/* NEXT Appointment(s) - Expanded by default */}
                {categorizedAppointments.next.length > 0 && (
                  <>
                    <View style={styles.appointmentSectionLabel}>
                      <ThemedText style={styles.appointmentSectionLabelText}>
                        NEXT
                      </ThemedText>
                    </View>
                    {categorizedAppointments.next.map((appt) => (
                      <AppointmentCard
                        key={appt.id}
                        appointment={appt}
                        isExpanded={expandedAppointments.has(appt.id)}
                        isNext={true}
                      />
                    ))}
                  </>
                )}

                {/* UPCOMING Appointments - Collapsed by default */}
                {categorizedAppointments.upcoming.length > 0 && (
                  <>
                    <View style={styles.appointmentSectionLabel}>
                      <ThemedText style={styles.appointmentSectionLabelText}>
                        UPCOMING
                      </ThemedText>
                    </View>
                    {categorizedAppointments.upcoming.map((appt) => (
                      <AppointmentCard
                        key={appt.id}
                        appointment={appt}
                        isExpanded={expandedAppointments.has(appt.id)}
                        isNext={false}
                      />
                    ))}
                  </>
                )}

                {/* COMPLETED Appointments - Minimized */}
                {categorizedAppointments.completed.length > 0 && (
                  <>
                    <View style={styles.appointmentSectionLabel}>
                      <ThemedText style={styles.appointmentSectionLabelText}>
                        COMPLETED
                      </ThemedText>
                    </View>
                    {categorizedAppointments.completed.map((appt) => (
                      <AppointmentCard
                        key={appt.id}
                        appointment={appt}
                        isExpanded={expandedAppointments.has(appt.id)}
                        isNext={false}
                      />
                    ))}
                  </>
                )}
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
          returnTo: `/myquotes/${id}`, // Return to this quote detail page
        },
      });
    }}
    style={styles.conversationBtn}
  >
    <ThemedText style={styles.conversationText}>
      {`Message ${tradeName}`}
    </ThemedText>
  </ThemedButton>
</View>

          </ScrollView>

          {/* Image viewer with zoom, swipe and drag-to-dismiss */}
          <ImageViewing
            images={imageViewerData}
            imageIndex={viewer.index}
            visible={viewer.open}
            onRequestClose={closeViewer}
            swipeToCloseEnabled={true}
            doubleTapToZoomEnabled={true}
          />
        </>
      )}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F9FAFB",
  },

  // Profile-style header
  header: {
    paddingHorizontal: 20,
    paddingBottom: 12,
    backgroundColor: "#F9FAFB",
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: "700",
  },
  backButton: {
    padding: 4,
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
    marginBottom: 16,
    padding: 16,
    borderRadius: 16,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.08)",
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
    marginBottom: 16,
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
    padding: 16,
    marginBottom: 16,
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
    marginTop: 24,
    marginBottom: 12,
  },
  sectionHeaderText: {
    fontSize: 20,
    fontWeight: "700",
    color: "#111827",
  },

  // Request summary (NEW STYLES)
  requestTitle: {
    fontWeight: "700",
    fontSize: 18,
    color: "#111827",
  },
  requestDetailRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: 16,
  },
  requestDetailContent: {
    flex: 1,
    marginLeft: 12,
  },
  requestDetailLabel: {
    fontSize: 12,
    color: "#6B7280",
    fontWeight: "600",
    marginBottom: 2,
  },
  requestDetailValue: {
    fontSize: 15,
    color: "#111827",
    lineHeight: 22,
  },

  // Quote breakdown (NEW STYLES)
  breakdownSectionLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: "#111827",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  lineItemRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: 16,
    paddingBottom: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#E5E7EB",
  },
  lineItemNumberBadge: {
    backgroundColor: PRIMARY,
    borderRadius: 10,
    width: 20,
    height: 20,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
    marginTop: 2,
  },
  lineItemNumberText: {
    color: "#FFFFFF",
    fontSize: 11,
    fontWeight: "700",
  },
  lineItemName: {
    fontSize: 15,
    fontWeight: "600",
    color: "#111827",
    marginBottom: 4,
  },
  lineItemDescription: {
    fontSize: 14,
    color: "#6B7280",
    marginBottom: 4,
    lineHeight: 20,
  },
  lineItemMeta: {
    fontSize: 13,
    color: "#6B7280",
  },
  lineItemTotal: {
    fontSize: 16,
    fontWeight: "700",
    color: "#111827",
    marginLeft: 12,
  },
  totalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  totalLabel: {
    fontSize: 15,
    color: "#6B7280",
  },
  totalValue: {
    fontSize: 15,
    fontWeight: "600",
    color: "#111827",
  },
  totalRowFinal: {
    marginTop: 8,
    paddingTop: 16,
    borderTopWidth: 2,
    borderTopColor: "#E5E7EB",
    marginBottom: 4,
  },
  totalLabelFinal: {
    fontSize: 17,
    fontWeight: "700",
    color: "#111827",
  },
  totalValueFinal: {
    fontSize: 20,
    fontWeight: "700",
    color: "#111827",
  },
  totalNote: {
    fontSize: 13,
    color: "#6B7280",
    textAlign: "right",
    fontStyle: "italic",
  },

  // OLD - can be removed
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
    marginTop: 16,
  },
  nextStepsTitle: {
    fontWeight: "600",
  },

  conversationBlock: {
    marginTop: 20,
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

  // Appointment section styles (old - can be removed if not used elsewhere)
  appointmentRow: {
    flexDirection: "row",
    alignItems: "flex-start",
  },
  appointmentLabel: {
    fontSize: 12,
    color: "#6B7280",
    textTransform: "uppercase",
    letterSpacing: 0.4,
    marginBottom: 4,
  },
  appointmentValue: {
    fontSize: 15,
    color: "#111827",
    fontWeight: "500",
  },

  // NEW: Appointment section label (NEXT, UPCOMING, COMPLETED)
  appointmentSectionLabel: {
    paddingTop: 16,
    paddingBottom: 8,
  },
  appointmentSectionLabelText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#6B7280",
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },

  // NEW: Appointment card (collapsible)
  appointmentCard: {
    marginBottom: 12,
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    overflow: "hidden",
  },
  appointmentCardNext: {
    borderColor: PRIMARY,
    borderWidth: 2,
    shadowColor: PRIMARY,
    shadowOpacity: 0.1,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 8,
    elevation: 3,
  },
  appointmentCardHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    padding: 16,
    gap: 12,
  },
  appointmentCardTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 6,
  },
  appointmentCardTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#111827",
    flex: 1,
  },
  appointmentCardMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  appointmentCardMeta: {
    fontSize: 14,
    color: "#6B7280",
  },

  // NEW: Appointment badge
  appointmentBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  appointmentBadgeText: {
    fontSize: 12,
    fontWeight: "600",
  },

  // NEW: Appointment card content (expandable)
  appointmentCardContent: {
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  appointmentDivider: {
    height: 1,
    backgroundColor: "#E5E7EB",
    marginBottom: 16,
  },
  appointmentDetailRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: 14,
  },
  appointmentDetailLabel: {
    fontSize: 12,
    color: "#6B7280",
    textTransform: "uppercase",
    letterSpacing: 0.4,
    marginBottom: 4,
  },
  appointmentDetailValue: {
    fontSize: 15,
    color: "#111827",
    fontWeight: "500",
    lineHeight: 22,
  },

  // NEW: Appointment actions (buttons in expanded state)
  appointmentActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 16,
  },
  appointmentActionBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: "#F9FAFB",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  appointmentActionText: {
    fontSize: 14,
    fontWeight: "600",
    color: PRIMARY,
  },
});
