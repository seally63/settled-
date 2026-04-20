// app/(dashboard)/myquotes/request/[id].jsx
// Client view of their own request - read-only, no accept/decline actions
import {
  StyleSheet,
  View,
  ScrollView,
  Pressable,
  Alert,
  Image,
  Dimensions,
  Modal,
} from "react-native";
import ImageViewing from "react-native-image-viewing";
import { useEffect, useMemo, useState, useCallback } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useFocusEffect } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import ThemedView from "../../../../../components/ThemedView";
import ThemedText from "../../../../../components/ThemedText";
import Spacer from "../../../../../components/Spacer";
import { Colors } from "../../../../../constants/Colors";
import { useUser } from "../../../../../hooks/useUser";
import { useTheme } from "../../../../../hooks/useTheme";
import { supabase } from "../../../../../lib/supabase";
import { listRequestImagePaths, getSignedUrls } from "../../../../../lib/api/attachments";
const SCREEN_WIDTH = Dimensions.get("window").width;

// Client Request page shell — mirrors the trade-side Client Request
// screen exactly (same chrome, hero, pills, recent-activity card) so
// the two POVs feel consistent. The only difference: the client sees
// the TRADE they're enquiring with (not their own info).
const clientReqStyles = StyleSheet.create({
  stickyChevron: {
    position: "absolute",
    left: 20,
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 30,
  },
  /* hero block */
  eyebrowRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 20,
  },
  eyebrowDot: { width: 6, height: 6, borderRadius: 3 },
  eyebrow: {
    fontFamily: "PublicSans_700Bold",
    fontSize: 11,
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  pageTitle: {
    fontFamily: "PublicSans_700Bold",
    fontSize: 30,
    lineHeight: 36,
    letterSpacing: -0.8,
    paddingHorizontal: 20,
    marginTop: 10,
  },
  /* trade row (avatar · business · message icon) */
  tradeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    paddingHorizontal: 20,
    marginTop: 20,
  },
  tradeAvatar: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: "center",
    justifyContent: "center",
  },
  tradeInitials: { fontFamily: "PublicSans_700Bold", fontSize: 15 },
  tradeName: {
    fontFamily: "PublicSans_600SemiBold",
    fontSize: 15,
    letterSpacing: -0.1,
  },
  tradeMeta: { fontSize: 12, fontFamily: "DMSans_400Regular", marginTop: 2 },
  tradeMsgBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 8,
  },
  /* facts (budget · timing) */
  factsRow: {
    flexDirection: "row",
    gap: 10,
    paddingHorizontal: 16,
    marginTop: 28,
  },
  // Full-width "Job description" container — same visual family as
  // factPill (14 radius, 1px border, elevate background).
  descRow: {
    paddingHorizontal: 16,
    marginTop: 28,
  },
  descPill: {
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 14,
    borderWidth: 1,
  },
  descLabel: {
    fontFamily: "PublicSans_700Bold",
    fontSize: 10,
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  descValue: {
    fontFamily: "DMSans_400Regular",
    fontSize: 14,
    lineHeight: 20,
    marginTop: 4,
  },
  factPill: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 14,
    borderWidth: 1,
  },
  factLabel: {
    fontFamily: "PublicSans_700Bold",
    fontSize: 10,
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  factValue: {
    fontFamily: "PublicSans_700Bold",
    fontSize: 16,
    letterSpacing: -0.3,
    marginTop: 4,
  },
  /* section labels */
  sectionLabel: {
    fontFamily: "PublicSans_700Bold",
    fontSize: 11,
    letterSpacing: 1,
    textTransform: "uppercase",
    paddingHorizontal: 20,
    marginTop: 32,
    marginBottom: 8,
  },
  /* notes card */
  notesCard: {
    marginHorizontal: 20,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
  },
  notesText: {
    fontFamily: "DMSans_400Regular",
    fontSize: 14,
    lineHeight: 21,
  },
  /* photos */
  photoThumb: {
    width: 120,
    height: 120,
    borderRadius: 12,
    borderWidth: 1,
    overflow: "hidden",
  },
  /* activity card (merged appointments + quotes) */
  activityCard: {
    marginHorizontal: 16,
    borderRadius: 18,
    borderWidth: 1,
    overflow: "hidden",
  },
  activityEmpty: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 16,
    paddingHorizontal: 14,
  },
  activityEmptyText: {
    fontFamily: "DMSans_400Regular",
    fontSize: 13,
  },
  activityRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  activityIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  activityTitle: {
    fontFamily: "PublicSans_600SemiBold",
    fontSize: 14,
    letterSpacing: -0.2,
  },
  activityMeta: {
    fontFamily: "DMSans_400Regular",
    fontSize: 12,
    marginTop: 2,
  },
  activityBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
  },
  activityBadgeText: {
    fontFamily: "PublicSans_700Bold",
    fontSize: 10.5,
    letterSpacing: 0.4,
    textTransform: "uppercase",
  },
  activityDivider: { height: 1, marginLeft: 62 },
  /* sheet */
  sheetBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "flex-end",
  },
  sheetCard: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 10,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderBottomWidth: 0,
  },
  sheetHandle: {
    alignSelf: "center",
    width: 40,
    height: 4,
    borderRadius: 2,
    marginBottom: 14,
  },
  sheetTitle: {
    fontFamily: "PublicSans_700Bold",
    fontSize: 18,
    letterSpacing: -0.3,
    paddingHorizontal: 4,
  },
  sheetSubtitle: {
    fontFamily: "DMSans_400Regular",
    fontSize: 13,
    marginTop: 4,
    paddingHorizontal: 4,
  },
  sheetActions: { flexDirection: "row", gap: 10, marginTop: 18 },
  sheetGhost: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    borderRadius: 14,
    borderWidth: 1,
  },
  sheetGhostText: { fontFamily: "PublicSans_600SemiBold", fontSize: 15 },
  sheetPrimary: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    borderRadius: 14,
  },
  sheetPrimaryText: {
    fontFamily: "PublicSans_600SemiBold",
    fontSize: 15,
    color: "#fff",
  },
});

// Helper to get last 4 characters of quote ID for display
// This ensures both trade and client see the same quote identifier
function getQuoteShortId(quoteId) {
  if (!quoteId) return "0000";
  const idStr = String(quoteId);
  return idStr.slice(-4).toUpperCase();
}

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
  const { colors: c, dark } = useTheme();
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

  // Appointments for this request (survey visits)
  const [appointments, setAppointments] = useState([]);
  const [apptBusy, setApptBusy] = useState(false);

  // Quotes received for this request
  const [quotes, setQuotes] = useState([]);

  const [viewer, setViewer] = useState({ open: false, index: 0 });
  const [activitySheet, setActivitySheet] = useState(null);

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

      // Use signed URLs for secure access
      const signed = await getSignedUrls(p, 3600);
      const urls = (signed || []).map((s) => s.url).filter(Boolean);

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

      // Fetch appointments for this request using multiple methods
      // Priority: Direct query first (works in main index), then RPCs as fallback
      try {
        let appointmentsToUse = [];

        // Method 1: Direct query for ALL appointments (this works in the main index page)
        try {
          const { data: directAppts, error: directErr } = await supabase
            .from("appointments")
            .select("*")
            .eq("request_id", id)
            .order("scheduled_at", { ascending: true });

          if (!directErr && directAppts && directAppts.length > 0) {
            appointmentsToUse = directAppts;
          }
        } catch (e) {
          // Method 1 failed, will try fallback methods
        }

        // Method 2: Try rpc_client_list_appointments and filter by request_id
        if (appointmentsToUse.length === 0) {
          try {
            const { data: allAppts, error: apptErr } = await supabase.rpc(
              "rpc_client_list_appointments",
              { p_only_upcoming: false }
            );

            if (!apptErr && allAppts && allAppts.length > 0) {
              const filtered = allAppts.filter((a) => String(a.request_id) === String(id));
              if (filtered.length > 0) {
                appointmentsToUse = filtered.map((a) => ({
                  id: a.appointment_id || a.id,
                  request_id: a.request_id,
                  quote_id: a.quote_id,
                  scheduled_at: a.scheduled_at,
                  title: a.title,
                  status: a.status,
                  location: a.location,
                  tradesperson_id: a.tradesperson_id,
                }));
              }
            }
          } catch (e) {
            // Method 2 failed, will try fallback
          }
        }

        // Method 3: Try rpc_get_latest_request_appointment (only returns 1 appointment)
        if (appointmentsToUse.length === 0) {
          try {
            const { data: latestAppt, error: latestErr } = await supabase.rpc(
              "rpc_get_latest_request_appointment",
              { p_request_id: id }
            );

            if (!latestErr && latestAppt) {
              let appt = latestAppt;
              while (Array.isArray(appt)) {
                if (appt.length === 0) break;
                appt = appt[0];
              }

              if (appt && (appt.id || appt.appointment_id)) {
                appointmentsToUse = [{
                  id: appt.appointment_id || appt.id,
                  request_id: appt.request_id || id,
                  quote_id: appt.quote_id,
                  scheduled_at: appt.scheduled_at,
                  title: appt.title || "Survey visit",
                  status: appt.status,
                  location: appt.location,
                  tradesperson_id: appt.tradesperson_id,
                }];
              }
            }
          } catch (e) {
            // Method 3 failed
          }
        }

        // Sort by scheduled_at
        appointmentsToUse.sort((a, b) => new Date(a.scheduled_at) - new Date(b.scheduled_at));

        if (appointmentsToUse.length > 0) {
          // Get unique tradesperson IDs to fetch their names
          let tradeIds = [...new Set(appointmentsToUse.map(a => a.tradesperson_id).filter(Boolean))];

          // If tradesperson_id is missing from appointments, get it from request_targets
          if (tradeIds.length === 0) {
            try {
              const { data: targetsData } = await supabase
                .from("request_targets")
                .select("trade_id")
                .eq("request_id", id);

              if (targetsData && targetsData.length > 0) {
                tradeIds = [...new Set(targetsData.map(t => t.trade_id).filter(Boolean))];

                // If there's only one trade, assign it to all appointments
                if (tradeIds.length === 1) {
                  appointmentsToUse = appointmentsToUse.map(appt => ({
                    ...appt,
                    tradesperson_id: tradeIds[0],
                  }));
                }
              }
            } catch (e) {
              // Failed to fetch request_targets
            }
          }

          if (tradeIds.length > 0) {
            // Fetch trade names using RPC (bypasses RLS)
            const { data: tradeNames, error: tradeErr } = await supabase.rpc(
              "rpc_trade_public_names",
              { trade_ids: tradeIds }
            );

            // Create a map of trade_id -> business_name
            const tradeNameMap = {};
            if (!tradeErr && tradeNames) {
              tradeNames.forEach((t) => {
                tradeNameMap[t.profile_id] = t.business_name || t.full_name || "Trade";
              });
            }

            // Attach trade name to each appointment
            const appointmentsWithTrade = appointmentsToUse.map((appt) => ({
              ...appt,
              tradeName: tradeNameMap[appt.tradesperson_id] || (tradeIds.length === 1 ? tradeNameMap[tradeIds[0]] : null),
            }));
            setAppointments(appointmentsWithTrade);
          } else {
            setAppointments(appointmentsToUse);
          }
        } else {
          setAppointments([]);
        }
      } catch (apptErr) {
        console.warn("appointments/load error:", apptErr?.message || apptErr);
        setAppointments([]);
      }

      // Load quotes for this request (exclude drafts - clients should not see them)
      try {
        const { data: quotesData, error: quotesErr } = await supabase
          .from("tradify_native_app_db")
          .select("id, trade_id, project_title, grand_total, currency, status, created_at")
          .eq("request_id", id)
          .neq("status", "draft")
          .order("created_at", { ascending: false });

        if (!quotesErr && quotesData && quotesData.length > 0) {
          // Fetch trade names for each quote
          const tradeIds = [...new Set(quotesData.map(q => q.trade_id).filter(Boolean))];
          let tradeNames = {};

          if (tradeIds.length > 0) {
            const { data: tradeProfiles } = await supabase
              .from("profiles")
              .select("id, business_name, full_name")
              .in("id", tradeIds);

            if (tradeProfiles) {
              tradeProfiles.forEach(p => {
                tradeNames[p.id] = p.business_name || p.full_name || "Trade";
              });
            }
          }

          // Attach trade names to quotes
          const quotesWithNames = quotesData.map(q => ({
            ...q,
            tradeName: tradeNames[q.trade_id] || "Trade",
          }));

          setQuotes(quotesWithNames);
        } else {
          setQuotes([]);
        }
      } catch (quotesErr) {
        console.warn("quotes/load error:", quotesErr?.message || quotesErr);
        setQuotes([]);
      }
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

  // Refresh data when screen gains focus (e.g., after confirming/declining appointment)
  useFocusEffect(
    useCallback(() => {
      if (user?.id && id) {
        load();
      }
    }, [user?.id, id, load])
  );

  const status = (req?.status || "open").toLowerCase();
  const tradeName = targetTrade?.business_name || targetTrade?.full_name || parsed.directTo;

  // Appointment handlers
  const handleConfirmAppointment = async (appointmentId) => {
    if (apptBusy) return;

    Alert.alert(
      "Accept this appointment?",
      "This will confirm the appointment with the tradesperson.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Accept",
          style: "default",
          onPress: async () => {
            try {
              setApptBusy(true);

              const { error } = await supabase.rpc(
                "rpc_client_respond_appointment",
                {
                  p_appointment_id: appointmentId,
                  p_response: "accepted",
                }
              );

              if (error) {
                Alert.alert("Error", error.message || "Could not confirm appointment");
                return;
              }

              // Reload appointments
              load();
            } catch (e) {
              Alert.alert("Error", e?.message || "Something went wrong");
            } finally {
              setApptBusy(false);
            }
          },
        },
      ]
    );
  };

  const handleDeclineAppointment = async (appointmentId) => {
    if (apptBusy) return;

    Alert.alert(
      "Decline this appointment?",
      "This will notify the tradesperson that you declined this appointment.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Decline",
          style: "destructive",
          onPress: async () => {
            try {
              setApptBusy(true);

              const { error } = await supabase.rpc(
                "rpc_client_respond_appointment",
                {
                  p_appointment_id: appointmentId,
                  p_response: "declined",
                }
              );

              if (error) {
                Alert.alert("Error", error.message || "Could not decline appointment");
                return;
              }

              // Reload appointments
              load();
            } catch (e) {
              Alert.alert("Error", e?.message || "Something went wrong");
            } finally {
              setApptBusy(false);
            }
          },
        },
      ]
    );
  };

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
    <ThemedView style={[styles.container, { backgroundColor: c.background }]}>
      {/* Sticky chevron-back — matches the trade Client Request page
          layout exactly. Same position, same icon btn styling.     */}
      <Pressable
        onPress={() =>
          router.canGoBack?.() ? router.back() : router.replace("/myquotes")
        }
        hitSlop={10}
        style={[
          clientReqStyles.stickyChevron,
          {
            top: insets.top + 10,
            backgroundColor: c.elevate,
            borderColor: c.border,
          },
        ]}
      >
        <Ionicons name="chevron-back" size={18} color={c.text} />
      </Pressable>

      {err ? (
        <View style={{ paddingTop: insets.top + 80, paddingHorizontal: 20 }}>
          <ThemedText style={{ color: "#EF4444" }}>Error: {err}</ThemedText>
        </View>
      ) : !req ? (
        // No skeleton — sticky chevron is up on top already, so the
        // user can tap back instantly while data loads.
        <View style={{ paddingTop: insets.top + 80, paddingHorizontal: 20 }} />
      ) : (
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{
            paddingTop: insets.top + 56,
            paddingBottom: 140,
          }}
          contentInsetAdjustmentBehavior="never"
          keyboardShouldPersistTaps="handled"
        >
          {/* Eyebrow — status pill reflecting what's happening on the
              request. Dot colour derived from state.               */}
          {(() => {
            const hasAccepted = quotes.some(
              (q) => String(q.status || "").toLowerCase() === "accepted"
            );
            const hasSent = quotes.some(
              (q) => String(q.status || "").toLowerCase() === "sent"
            );
            const isPreparing = targetTrade && !hasSent && !hasAccepted;
            const eyebrowText = hasAccepted
              ? "QUOTE ACCEPTED"
              : hasSent
              ? "QUOTE RECEIVED"
              : isPreparing
              ? "PREPARING QUOTE"
              : "ACTIVE REQUEST";
            const eyebrowDot = hasAccepted
              ? Colors.status.accepted
              : hasSent
              ? Colors.status.quoted
              : isPreparing
              ? Colors.status.scheduled
              : Colors.status.pending;
            return (
              <View style={clientReqStyles.eyebrowRow}>
                <View style={[clientReqStyles.eyebrowDot, { backgroundColor: eyebrowDot }]} />
                <ThemedText style={[clientReqStyles.eyebrow, { color: c.textMuted }]}>
                  {eyebrowText}
                </ThemedText>
              </View>
            );
          })()}

          {/* Big title — the job they're requesting, matches the trade
              page's hero title size/letterspacing.                  */}
          <ThemedText style={[clientReqStyles.pageTitle, { color: c.text }]}>
            {req?.service_types?.name || parsed.service || parsed.main || parsed.title || "Your Request"}
          </ThemedText>

          {/* Trade row — the business they're enquiring with (the
              client's equivalent of the trade page's "client" row,
              inverted). Shows the trade's initials/name/location and a
              message icon at the far right.                        */}
          {(() => {
            const tradeBusiness = targetTrade?.business_name || targetTrade?.full_name;
            const initials = tradeBusiness
              ? tradeBusiness
                  .trim()
                  .split(/\s+/)
                  .filter(Boolean)
                  .slice(0, 2)
                  .map((s) => s[0]?.toUpperCase() || "")
                  .join("") || "T"
              : "T";
            return tradeBusiness ? (
              <View style={clientReqStyles.tradeRow}>
                <View
                  style={[
                    clientReqStyles.tradeAvatar,
                    { backgroundColor: Colors.primaryTint },
                  ]}
                >
                  <ThemedText
                    style={[clientReqStyles.tradeInitials, { color: Colors.primary }]}
                  >
                    {initials}
                  </ThemedText>
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <ThemedText
                    style={[clientReqStyles.tradeName, { color: c.text }]}
                    numberOfLines={1}
                  >
                    {tradeBusiness}
                  </ThemedText>
                  <ThemedText
                    style={[clientReqStyles.tradeMeta, { color: c.textMuted }]}
                    numberOfLines={1}
                  >
                    Verified trade · {req?.postcode ? String(req.postcode).split(" ")[0] : "Local"}
                  </ThemedText>
                </View>
                <Pressable
                  onPress={() => {
                    router.push({
                      pathname: "/(dashboard)/messages/[id]",
                      params: {
                        id: String(id),
                        name: tradeBusiness,
                        returnTo: `/myquotes/request/${id}`,
                      },
                    });
                  }}
                  hitSlop={10}
                  style={({ pressed }) => [
                    clientReqStyles.tradeMsgBtn,
                    { backgroundColor: c.elevate, borderColor: c.border },
                    pressed && { opacity: 0.7 },
                  ]}
                  accessibilityLabel="Message trade"
                >
                  <Ionicons name="chatbubble-outline" size={16} color={c.text} />
                </Pressable>
              </View>
            ) : null;
          })()}

          {/* Job description — same visual treatment as Budget /
              Timing pills below: label inside a bordered container.
              Always rendered with a placeholder when empty.         */}
          <View style={clientReqStyles.descRow}>
            <View
              style={[
                clientReqStyles.descPill,
                { backgroundColor: c.elevate, borderColor: c.border },
              ]}
            >
              <ThemedText
                style={[clientReqStyles.descLabel, { color: c.textMuted }]}
              >
                JOB DESCRIPTION
              </ThemedText>
              <ThemedText
                style={[
                  clientReqStyles.descValue,
                  {
                    color:
                      parsed.description || parsed.notes ? c.text : c.textMuted,
                    fontStyle:
                      parsed.description || parsed.notes ? "normal" : "italic",
                  },
                ]}
              >
                {parsed.description ||
                  parsed.notes ||
                  "You didn't add a description — you can message the trade for extra detail."}
              </ThemedText>
            </View>
          </View>

          {/* Facts pills — Budget + Timing. Two-line value so long
              strings don't truncate. Matches the trade page exactly. */}
          <View style={clientReqStyles.factsRow}>
            <View
              style={[
                clientReqStyles.factPill,
                { backgroundColor: c.elevate, borderColor: c.border },
              ]}
            >
              <ThemedText style={[clientReqStyles.factLabel, { color: c.textMuted }]}>
                BUDGET
              </ThemedText>
              <ThemedText
                style={[clientReqStyles.factValue, { color: c.text }]}
                numberOfLines={2}
              >
                {req?.budget_band || parsed.budget || "—"}
              </ThemedText>
            </View>
            <View
              style={[
                clientReqStyles.factPill,
                { backgroundColor: c.elevate, borderColor: c.border },
              ]}
            >
              <ThemedText style={[clientReqStyles.factLabel, { color: c.textMuted }]}>
                TIMING
              </ThemedText>
              <ThemedText
                style={[clientReqStyles.factValue, { color: c.text }]}
                numberOfLines={2}
              >
                {req?.timing_options?.name || parsed.timing || "—"}
              </ThemedText>
            </View>
          </View>

          {/* Photos — horizontal scroll of thumbnails, tap to zoom. */}
          {hasAttachments && (
            <>
              <ThemedText style={[clientReqStyles.sectionLabel, { color: c.textMuted }]}>
                PHOTOS · {attachmentsCount}
              </ThemedText>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ paddingHorizontal: 16, gap: 8 }}
              >
                {attachments.map((url, i) => (
                  <Pressable
                    key={`${url}-${i}`}
                    onPress={() => setViewer({ open: true, index: i })}
                    style={[
                      clientReqStyles.photoThumb,
                      { borderColor: c.border, backgroundColor: c.elevate },
                    ]}
                  >
                    <Image
                      source={{ uri: url }}
                      style={{ width: "100%", height: "100%" }}
                      resizeMode="cover"
                    />
                  </Pressable>
                ))}
              </ScrollView>
            </>
          )}

          {/* Recent Activity — merged appointments + quotes (no drafts,
              clients never see drafts). Newest first, tappable →
              bottom sheet with context-aware actions.              */}
          <ThemedText style={[clientReqStyles.sectionLabel, { color: c.textMuted }]}>
            RECENT ACTIVITY
          </ThemedText>
          {(() => {
            const visibleQuotes = quotes.filter(
              (q) => String(q.status || "").toLowerCase() !== "draft"
            );
            const items = [
              ...appointments.map((a) => ({
                kind: "appointment",
                id: a.id,
                ts: new Date(a.scheduled_at || a.created_at || 0).getTime(),
                data: a,
              })),
              ...visibleQuotes.map((q) => ({
                kind: "quote",
                id: q.id,
                ts: new Date(q.created_at || q.issued_at || 0).getTime(),
                data: q,
              })),
            ].sort((a, b) => b.ts - a.ts);

            return (
              <View
                style={[
                  clientReqStyles.activityCard,
                  { backgroundColor: c.elevate, borderColor: c.border },
                ]}
              >
                {items.length === 0 ? (
                  <View style={clientReqStyles.activityEmpty}>
                    <Ionicons name="time-outline" size={18} color={c.textMuted} />
                    <ThemedText
                      style={[clientReqStyles.activityEmptyText, { color: c.textMuted }]}
                    >
                      No activity yet — the trade will be in touch.
                    </ThemedText>
                  </View>
                ) : (
                  items.map((it, i) => (
                    <View key={`${it.kind}-${it.id}`}>
                      {i > 0 && (
                        <View
                          style={[
                            clientReqStyles.activityDivider,
                            { backgroundColor: c.divider },
                          ]}
                        />
                      )}
                      {(() => {
                        if (it.kind === "appointment") {
                          const scheduled = new Date(it.data.scheduled_at);
                          const dateStr = scheduled.toLocaleDateString(undefined, {
                            weekday: "short",
                            day: "numeric",
                            month: "short",
                          });
                          const timeStr = scheduled.toLocaleTimeString(undefined, {
                            hour: "2-digit",
                            minute: "2-digit",
                          });
                          const statusTone =
                            it.data.status === "confirmed"
                              ? Colors.status.scheduled
                              : it.data.status === "proposed"
                              ? Colors.status.pending
                              : Colors.status.declined;
                          const label =
                            it.data.status === "confirmed"
                              ? "Confirmed"
                              : it.data.status === "proposed"
                              ? "Review"
                              : "Cancelled";
                          return (
                            <Pressable
                              onPress={() => setActivitySheet(it)}
                              style={({ pressed }) => [
                                clientReqStyles.activityRow,
                                pressed && { opacity: 0.7 },
                              ]}
                            >
                              <View
                                style={[
                                  clientReqStyles.activityIcon,
                                  { backgroundColor: c.elevate2 ?? c.background },
                                ]}
                              >
                                <Ionicons name="calendar-outline" size={18} color={c.text} />
                              </View>
                              <View style={{ flex: 1, minWidth: 0 }}>
                                <ThemedText
                                  style={[clientReqStyles.activityTitle, { color: c.text }]}
                                  numberOfLines={1}
                                >
                                  {it.data.title || "Appointment"}
                                </ThemedText>
                                <ThemedText
                                  style={[clientReqStyles.activityMeta, { color: c.textMuted }]}
                                  numberOfLines={1}
                                >
                                  {dateStr} · {timeStr}
                                </ThemedText>
                              </View>
                              <View
                                style={[
                                  clientReqStyles.activityBadge,
                                  {
                                    backgroundColor: statusTone + "22",
                                    borderColor: statusTone,
                                  },
                                ]}
                              >
                                <ThemedText
                                  style={[
                                    clientReqStyles.activityBadgeText,
                                    { color: statusTone },
                                  ]}
                                >
                                  {label}
                                </ThemedText>
                              </View>
                            </Pressable>
                          );
                        }
                        // quote
                        const qs = String(it.data.status || "").toLowerCase();
                        const tone =
                          qs === "accepted"
                            ? Colors.status.accepted
                            : qs === "sent"
                            ? Colors.status.quoted
                            : Colors.status.declined;
                        const label =
                          qs === "accepted"
                            ? "Accepted"
                            : qs === "sent"
                            ? "Review"
                            : qs.charAt(0).toUpperCase() + qs.slice(1);
                        const total = it.data.grand_total != null
                          ? `£${Number(it.data.grand_total).toFixed(0)}`
                          : "£—";
                        return (
                          <Pressable
                            onPress={() => {
                              // Quote cards open the Quote Overview
                              // directly — no bottom sheet.
                              router.push({
                                pathname: "/(dashboard)/myquotes/[id]",
                                params: {
                                  id: String(it.data.id),
                                  returnTo: `/myquotes/request/${id}`,
                                },
                              });
                            }}
                            style={({ pressed }) => [
                              clientReqStyles.activityRow,
                              pressed && { opacity: 0.7 },
                            ]}
                          >
                            <View
                              style={[
                                clientReqStyles.activityIcon,
                                { backgroundColor: c.elevate2 ?? c.background },
                              ]}
                            >
                              <Ionicons name="document-text-outline" size={18} color={c.text} />
                            </View>
                            <View style={{ flex: 1, minWidth: 0 }}>
                              <ThemedText
                                style={[clientReqStyles.activityTitle, { color: c.text }]}
                                numberOfLines={1}
                              >
                                {(() => {
                                  const biz =
                                    targetTrade?.business_name ||
                                    targetTrade?.full_name ||
                                    null;
                                  const shortId = getQuoteShortId(it.data.id);
                                  return biz
                                    ? `Quote #${shortId} from ${biz}`
                                    : `Quote #${shortId}`;
                                })()}
                              </ThemedText>
                            </View>
                            <View
                              style={[
                                clientReqStyles.activityBadge,
                                {
                                  backgroundColor: tone + "22",
                                  borderColor: tone,
                                },
                              ]}
                            >
                              <ThemedText
                                style={[clientReqStyles.activityBadgeText, { color: tone }]}
                              >
                                {label}
                              </ThemedText>
                            </View>
                          </Pressable>
                        );
                      })()}
                    </View>
                  ))
                )}
              </View>
            );
          })()}

          <View style={{ height: 40 }} />
          {/* Legacy sections intentionally removed — content moved into
              the hero + facts pills + notes + photos + Recent Activity
              blocks above.                                           */}
          {false && <>
          {/* Appointments Section - always shown */}
          <View style={styles.sectionHeaderRow}>
            <ThemedText style={styles.sectionHeaderTitle}>Appointments</ThemedText>
          </View>

          {appointments.length > 0 ? (
            appointments.map((appt) => {
              const scheduledDate = new Date(appt.scheduled_at);
              const isProposed = appt.status === "proposed";
              const isConfirmed = appt.status === "confirmed";
              const isDeclined = appt.status === "declined";

              return (
                <View key={appt.id} style={styles.appointmentCard}>
                  {/* Trade name - shown for open requests with multiple trades */}
                  {appt.tradeName && (
                    <View style={styles.appointmentCardTradeRow}>
                      <Ionicons name="person-circle-outline" size={16} color="#6849a7" />
                      <ThemedText style={styles.appointmentCardTradeName}>
                        {appt.tradeName}
                      </ThemedText>
                    </View>
                  )}

                  {/* Appointment name prominent */}
                  <ThemedText style={styles.appointmentCardTitle}>
                    {appt.title || "Survey Visit"}
                  </ThemedText>

                  {/* Date/time on one line */}
                  <View style={styles.appointmentCardRow}>
                    <Ionicons name="calendar-outline" size={16} color="#6B7280" />
                    <ThemedText style={styles.appointmentCardText}>
                      {scheduledDate.toLocaleDateString(undefined, {
                        weekday: "short",
                        day: "numeric",
                        month: "short",
                      })}, {scheduledDate.toLocaleTimeString(undefined, {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </ThemedText>
                  </View>

                  {/* Location on separate line */}
                  {appt.location && (
                    <View style={styles.appointmentCardRow}>
                      <Ionicons name="location-outline" size={16} color="#6B7280" />
                      <ThemedText style={styles.appointmentCardText}>
                        {appt.location}
                      </ThemedText>
                    </View>
                  )}

                  {/* Accept/Decline buttons for proposed appointments */}
                  {isProposed && (
                    <View style={styles.appointmentCardActions}>
                      <Pressable
                        onPress={() => handleDeclineAppointment(appt.id)}
                        style={styles.appointmentDeclineBtn}
                        disabled={apptBusy}
                      >
                        <ThemedText style={styles.appointmentDeclineBtnText}>Decline</ThemedText>
                      </Pressable>
                      <Pressable
                        onPress={() => handleConfirmAppointment(appt.id)}
                        style={styles.appointmentAcceptBtn}
                        disabled={apptBusy}
                      >
                        <ThemedText style={styles.appointmentAcceptBtnText}>Accept</ThemedText>
                      </Pressable>
                    </View>
                  )}

                  {/* Confirmed status */}
                  {isConfirmed && (
                    <View style={styles.appointmentCardStatus}>
                      <Ionicons name="checkmark-circle" size={16} color="#10B981" />
                      <ThemedText style={styles.appointmentCardStatusText}>Confirmed</ThemedText>
                    </View>
                  )}

                  {/* Declined status */}
                  {isDeclined && (
                    <View style={styles.appointmentCardStatus}>
                      <Ionicons name="close-circle" size={16} color="#EF4444" />
                      <ThemedText style={[styles.appointmentCardStatusText, { color: "#EF4444" }]}>Declined</ThemedText>
                    </View>
                  )}
                </View>
              );
            })
          ) : (
            <View style={styles.emptyStateCard}>
              <Ionicons name="calendar-outline" size={24} color="#9CA3AF" />
              <ThemedText style={styles.emptyStateText}>No appointments yet</ThemedText>
            </View>
          )}

          {/* Quotes Section - always shown */}
          <View style={styles.sectionHeaderRow}>
            <ThemedText style={styles.sectionHeaderTitle}>Quotes</ThemedText>
            {quotes.length > 0 && (
              <ThemedText style={styles.sectionHeaderCount}>{quotes.length} received</ThemedText>
            )}
          </View>

          {quotes.length > 0 ? (
            quotes.map((quote) => {
              const quoteStatus = (quote.status || "").toLowerCase();
              const isAccepted = quoteStatus === "accepted";
              const isDeclined = quoteStatus === "declined";
              const isPending = !isAccepted && !isDeclined;

              return (
                <Pressable
                  key={quote.id}
                  style={[
                    styles.quoteCard,
                    isAccepted && styles.quoteCardAccepted,
                    isDeclined && styles.quoteCardDeclined,
                  ]}
                  onPress={() => {
                    router.push({
                      pathname: `/(dashboard)/myquotes/${quote.id}`,
                      params: { returnTo: `/(dashboard)/myquotes/request/${id}` },
                    });
                  }}
                >
                  {/* Quote ID header */}
                  <View style={styles.quoteCardHeader}>
                    <View style={styles.quoteCardTradeRow}>
                      <Ionicons name="document-text-outline" size={20} color="#6849a7" />
                      <ThemedText style={styles.quoteCardTradeName}>
                        Quote #{getQuoteShortId(quote.id)}
                      </ThemedText>
                    </View>
                    {isAccepted && (
                      <View style={styles.quoteStatusBadgeAccepted}>
                        <Ionicons name="checkmark-circle" size={14} color="#10B981" />
                        <ThemedText style={styles.quoteStatusTextAccepted}>Accepted</ThemedText>
                      </View>
                    )}
                    {isDeclined && (
                      <View style={styles.quoteStatusBadgeDeclined}>
                        <Ionicons name="close-circle" size={14} color="#EF4444" />
                        <ThemedText style={styles.quoteStatusTextDeclined}>Declined</ThemedText>
                      </View>
                    )}
                    {isPending && (
                      <View style={styles.quoteStatusBadgePending}>
                        <Ionicons name="time-outline" size={14} color="#F59E0B" />
                        <ThemedText style={styles.quoteStatusTextPending}>Review</ThemedText>
                      </View>
                    )}
                  </View>

                  {/* Quote amount */}
                  <View style={styles.quoteCardAmountRow}>
                    <ThemedText style={styles.quoteCardAmount}>
                      {quote.currency || "GBP"} {Number(quote.grand_total || 0).toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </ThemedText>
                    <Ionicons name="chevron-forward" size={20} color="#9CA3AF" />
                  </View>

                  {/* Trade business name */}
                  {quote.tradeName && (
                    <ThemedText style={styles.quoteCardProject} numberOfLines={1}>
                      {quote.tradeName}
                    </ThemedText>
                  )}
                </Pressable>
              );
            })
          ) : (
            <View style={styles.emptyStateCard}>
              <Ionicons name="document-text-outline" size={24} color="#9CA3AF" />
              <ThemedText style={styles.emptyStateText}>No quotes yet</ThemedText>
            </View>
          )}

          {/* Service Details Card */}
          <View style={styles.sectionHeaderRow}>
            <ThemedText style={styles.sectionHeaderTitle}>Service Details</ThemedText>
          </View>
          <View style={[styles.card, { marginTop: 8 }]}>
            {/* Category */}
            <View style={styles.requestDetailRow}>
              <Ionicons name="grid-outline" size={18} color="#6B7280" />
              <View style={styles.requestDetailContent}>
                <ThemedText style={styles.requestDetailLabel}>Category</ThemedText>
                <ThemedText style={styles.requestDetailValue}>
                  {req?.service_categories?.name || parsed.category || "-"}
                </ThemedText>
              </View>
            </View>

            {/* Service */}
            <View style={styles.requestDetailRow}>
              <Ionicons name="construct-outline" size={18} color="#6B7280" />
              <View style={styles.requestDetailContent}>
                <ThemedText style={styles.requestDetailLabel}>Service</ThemedText>
                <ThemedText style={styles.requestDetailValue}>
                  {req?.service_types?.name || parsed.service || parsed.main || "-"}
                </ThemedText>
              </View>
            </View>

            {/* Property */}
            <View style={styles.requestDetailRow}>
              <Ionicons name="home-outline" size={18} color="#6B7280" />
              <View style={styles.requestDetailContent}>
                <ThemedText style={styles.requestDetailLabel}>Property</ThemedText>
                <ThemedText style={styles.requestDetailValue}>
                  {req?.property_types?.name || parsed.property || "Not specified"}
                </ThemedText>
              </View>
            </View>

            {/* Timing */}
            <View style={styles.requestDetailRow}>
              <Ionicons name="time-outline" size={18} color={req?.timing_options?.is_emergency ? "#EF4444" : "#6B7280"} />
              <View style={styles.requestDetailContent}>
                <ThemedText style={styles.requestDetailLabel}>Timing</ThemedText>
                <ThemedText style={[styles.requestDetailValue, req?.timing_options?.is_emergency && { color: "#EF4444" }]}>
                  {req?.timing_options?.name || parsed.timing || "-"}
                </ThemedText>
              </View>
            </View>

            {/* Location */}
            {!!req?.postcode && (
              <View style={styles.requestDetailRow}>
                <Ionicons name="location-outline" size={18} color="#6B7280" />
                <View style={styles.requestDetailContent}>
                  <ThemedText style={styles.requestDetailLabel}>Location</ThemedText>
                  <ThemedText style={styles.requestDetailValue}>{req.postcode}</ThemedText>
                </View>
              </View>
            )}

            {/* Budget */}
            {(!!req?.budget_band || !!parsed.budget) && (
              <View style={styles.requestDetailRow}>
                <Ionicons name="cash-outline" size={18} color="#6B7280" />
                <View style={styles.requestDetailContent}>
                  <ThemedText style={styles.requestDetailLabel}>Budget</ThemedText>
                  <ThemedText style={styles.requestDetailValue}>{req?.budget_band || parsed.budget}</ThemedText>
                </View>
              </View>
            )}

            {/* Address */}
            {!!parsed.address && (
              <View style={styles.requestDetailRow}>
                <Ionicons name="navigate-outline" size={18} color="#6B7280" />
                <View style={styles.requestDetailContent}>
                  <ThemedText style={styles.requestDetailLabel}>Address</ThemedText>
                  <ThemedText style={styles.requestDetailValue}>{parsed.address}</ThemedText>
                </View>
              </View>
            )}

            {/* Description */}
            <View style={styles.divider} />
            <View style={styles.requestDetailRow}>
              <Ionicons name="document-text-outline" size={18} color="#6B7280" />
              <View style={styles.requestDetailContent}>
                <ThemedText style={styles.requestDetailLabel}>Description</ThemedText>
                <ThemedText style={[
                  styles.requestDetailValue,
                  !(parsed.description || parsed.notes) && styles.descriptionEmpty
                ]}>
                  {parsed.description || parsed.notes || "No description provided"}
                </ThemedText>
              </View>
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
          {status === "open" && appointments.length === 0 && (
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
          </>}
          {/* /legacy */}

        </ScrollView>
      )}

      {/* Activity bottom sheet (appointments + quotes) */}
      <Modal
        visible={!!activitySheet}
        transparent
        animationType="fade"
        onRequestClose={() => setActivitySheet(null)}
      >
        <Pressable
          style={clientReqStyles.sheetBackdrop}
          onPress={() => setActivitySheet(null)}
        >
          <Pressable
            onPress={(e) => e.stopPropagation?.()}
            style={[
              clientReqStyles.sheetCard,
              {
                backgroundColor: c.background,
                borderColor: c.border,
                paddingBottom: insets.bottom + 18,
              },
            ]}
          >
            <View
              style={[
                clientReqStyles.sheetHandle,
                { backgroundColor: c.borderStrong },
              ]}
            />
            {activitySheet?.kind === "appointment" && activitySheet.data && (
              <>
                <ThemedText style={[clientReqStyles.sheetTitle, { color: c.text }]}>
                  {activitySheet.data.title || "Appointment"}
                </ThemedText>
                <ThemedText
                  style={[clientReqStyles.sheetSubtitle, { color: c.textMuted }]}
                >
                  {new Date(activitySheet.data.scheduled_at).toLocaleString(undefined, {
                    weekday: "long",
                    day: "numeric",
                    month: "long",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </ThemedText>
                {activitySheet.data.status === "proposed" ? (
                  <View style={clientReqStyles.sheetActions}>
                    <Pressable
                      onPress={async () => {
                        const appt = activitySheet.data;
                        setActivitySheet(null);
                        await handleDeclineAppointment(appt.id);
                      }}
                      style={({ pressed }) => [
                        clientReqStyles.sheetGhost,
                        { backgroundColor: c.elevate, borderColor: c.border },
                        pressed && { opacity: 0.75 },
                      ]}
                    >
                      <Ionicons
                        name="close-circle-outline"
                        size={18}
                        color={Colors.status.declined}
                      />
                      <ThemedText
                        style={[
                          clientReqStyles.sheetGhostText,
                          { color: Colors.status.declined },
                        ]}
                      >
                        Decline
                      </ThemedText>
                    </Pressable>
                    <Pressable
                      onPress={async () => {
                        const appt = activitySheet.data;
                        setActivitySheet(null);
                        await handleConfirmAppointment(appt.id);
                      }}
                      style={({ pressed }) => [
                        clientReqStyles.sheetPrimary,
                        { backgroundColor: Colors.primary },
                        pressed && { opacity: 0.85 },
                      ]}
                    >
                      <Ionicons name="checkmark" size={18} color="#fff" />
                      <ThemedText style={clientReqStyles.sheetPrimaryText}>Confirm</ThemedText>
                    </Pressable>
                  </View>
                ) : (
                  <View style={clientReqStyles.sheetActions}>
                    <Pressable
                      onPress={() => setActivitySheet(null)}
                      style={({ pressed }) => [
                        clientReqStyles.sheetGhost,
                        { backgroundColor: c.elevate, borderColor: c.border },
                        pressed && { opacity: 0.75 },
                      ]}
                    >
                      <ThemedText style={[clientReqStyles.sheetGhostText, { color: c.text }]}>
                        Close
                      </ThemedText>
                    </Pressable>
                  </View>
                )}
              </>
            )}
            {activitySheet?.kind === "quote" && activitySheet.data && (
              <>
                <ThemedText style={[clientReqStyles.sheetTitle, { color: c.text }]}>
                  Quote #{getQuoteShortId(activitySheet.data.id)}
                </ThemedText>
                <ThemedText style={[clientReqStyles.sheetSubtitle, { color: c.textMuted }]}>
                  £{Number(activitySheet.data.grand_total || 0).toFixed(2)} ·{" "}
                  {(() => {
                    const s = String(activitySheet.data.status || "").toLowerCase();
                    return s.charAt(0).toUpperCase() + s.slice(1);
                  })()}
                </ThemedText>
                <View style={clientReqStyles.sheetActions}>
                  <Pressable
                    onPress={() => {
                      const q = activitySheet.data;
                      setActivitySheet(null);
                      router.push({
                        pathname: "/(dashboard)/myquotes/[id]",
                        params: { id: String(q.id), returnTo: `/myquotes/request/${id}` },
                      });
                    }}
                    style={({ pressed }) => [
                      clientReqStyles.sheetPrimary,
                      { backgroundColor: Colors.primary },
                      pressed && { opacity: 0.85 },
                    ]}
                  >
                    <Ionicons name="eye-outline" size={18} color="#fff" />
                    <ThemedText style={clientReqStyles.sheetPrimaryText}>View quote</ThemedText>
                  </Pressable>
                </View>
              </>
            )}
          </Pressable>
        </Pressable>
      </Modal>

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
    backgroundColor: "#FFFFFF",
  },
  header: {
    backgroundColor: "#FFFFFF",
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

  // Request detail row with icons (matching Quote Overview style)
  requestDetailRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    marginVertical: 8,
  },
  requestDetailContent: {
    flex: 1,
  },
  requestDetailLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: "#6B7280",
    marginBottom: 2,
  },
  requestDetailValue: {
    fontSize: 14,
    color: "#111827",
    lineHeight: 20,
  },

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
  // Section header row
  sectionHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 24,
    marginHorizontal: 16,
    marginBottom: 8,
  },
  sectionHeaderTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#111827",
  },

  // Appointment card styles - new design
  appointmentCard: {
    marginTop: 8,
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
  appointmentCardTitle: {
    fontSize: 17,
    fontWeight: "700",
    color: "#111827",
    marginBottom: 12,
  },
  appointmentCardRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 6,
  },
  appointmentCardText: {
    fontSize: 15,
    color: "#374151",
  },
  appointmentCardActions: {
    flexDirection: "row",
    gap: 12,
    marginTop: 16,
  },
  appointmentDeclineBtn: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: "#F3F4F6",
  },
  appointmentDeclineBtnText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#374151",
  },
  appointmentAcceptBtn: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: "#10B981",
  },
  appointmentAcceptBtnText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#FFFFFF",
  },
  appointmentCardStatus: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 12,
  },
  appointmentCardStatusText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#10B981",
  },
  appointmentCardTradeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 8,
  },
  appointmentCardTradeName: {
    fontSize: 14,
    fontWeight: "600",
    color: "#6849a7",
  },

  // Quote card styles
  sectionHeaderCount: {
    fontSize: 14,
    color: "#6B7280",
    fontWeight: "500",
  },
  quoteCard: {
    marginTop: 8,
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
  quoteCardAccepted: {
    borderColor: "#10B981",
    backgroundColor: "#F0FDF4",
  },
  quoteCardDeclined: {
    borderColor: "#E5E7EB",
    backgroundColor: "#F9FAFB",
    opacity: 0.7,
  },
  quoteCardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  quoteCardTradeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flex: 1,
  },
  quoteCardTradeName: {
    fontSize: 16,
    fontWeight: "600",
    color: "#111827",
  },
  quoteStatusBadgeAccepted: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#D1FAE5",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  quoteStatusTextAccepted: {
    fontSize: 12,
    fontWeight: "600",
    color: "#10B981",
  },
  quoteStatusBadgeDeclined: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#FEE2E2",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  quoteStatusTextDeclined: {
    fontSize: 12,
    fontWeight: "600",
    color: "#EF4444",
  },
  quoteStatusBadgePending: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#FEF3C7",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  quoteStatusTextPending: {
    fontSize: 12,
    fontWeight: "600",
    color: "#F59E0B",
  },
  quoteCardAmountRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  quoteCardAmount: {
    fontSize: 20,
    fontWeight: "700",
    color: "#111827",
  },
  quoteCardProject: {
    fontSize: 14,
    color: "#6B7280",
    marginTop: 8,
  },

  // Empty state styles
  emptyStateCard: {
    marginTop: 8,
    marginHorizontal: 16,
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.15)",
    borderStyle: "dashed",
    padding: 24,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  emptyStateText: {
    fontSize: 14,
    color: "#9CA3AF",
    textAlign: "center",
  },
});
