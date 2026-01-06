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
  Modal,
  KeyboardAvoidingView,
  TextInput,
} from "react-native";
import ImageViewing from "react-native-image-viewing";
import { useEffect, useState, useCallback, useMemo } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import CustomDateTimePicker from "../../../../components/CustomDateTimePicker";

import { supabase } from "../../../../lib/supabase";
import { useUser } from "../../../../hooks/useUser";
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
const TINT = Colors?.light?.tint || "#6849a7";
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
  const { id, returnTo } = useLocalSearchParams();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useUser();

  const [quote, setQuote] = useState(null);
  const [trade, setTrade] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [clientConfirmBusy, setClientConfirmBusy] = useState(false);
  const [clientReview, setClientReview] = useState(null); // Review left by client about trade

  // Request + attachments for "Your request" block
  const [req, setReq] = useState(null);
  const [attachments, setAttachments] = useState([]); // string[] URLs
  const [attachmentsCount, setAttachmentsCount] = useState(0);

  // Appointments data (multiple appointments)
  const [appointments, setAppointments] = useState([]);
  const [expandedAppointments, setExpandedAppointments] = useState(new Set());
  const [apptBusy, setApptBusy] = useState(false);

  // Reschedule state
  const [showRescheduleSheet, setShowRescheduleSheet] = useState(false);
  const [rescheduleAppointment, setRescheduleAppointment] = useState(null);
  const [rescheduleDate, setRescheduleDate] = useState(null);
  const [rescheduleTime, setRescheduleTime] = useState(null);
  const [rescheduleReason, setRescheduleReason] = useState("");
  const [rescheduleBusy, setRescheduleBusy] = useState(false);
  const [reschedulePickerVisible, setReschedulePickerVisible] = useState(false);
  const [reschedulePickerMode, setReschedulePickerMode] = useState("date");

  // Collapsible section states
  const [quoteBreakdownExpanded, setQuoteBreakdownExpanded] = useState(true);
  const [yourRequestExpanded, setYourRequestExpanded] = useState(false);
  const [appointmentsExpanded, setAppointmentsExpanded] = useState(false);

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
            photo_url: rows[0].photo_url || null,
          });
        } else {
          setTrade(null);
        }
      } else {
        setTrade(null);
      }

      // Load appointments for this quote (can have multiple)
      // Try loading by quote_id first, then also by request_id
      const quoteId = id;
      const requestId = data?.request_id;

      let allAppointments = [];

      // Load by quote_id
      const { data: apptByQuote, error: apptQuoteErr } = await supabase
        .from("appointments")
        .select("*")
        .eq("quote_id", quoteId)
        .order("scheduled_at", { ascending: true });

      if (!apptQuoteErr && Array.isArray(apptByQuote)) {
        allAppointments = [...apptByQuote];
      }

      // Also load by request_id (in case appointments were created before quote was linked)
      if (requestId) {
        const { data: apptByRequest, error: apptReqErr } = await supabase
          .from("appointments")
          .select("*")
          .eq("request_id", requestId)
          .order("scheduled_at", { ascending: true });

        if (!apptReqErr && Array.isArray(apptByRequest)) {
          // Merge and deduplicate by id
          const existingIds = new Set(allAppointments.map(a => a.id));
          const newAppts = apptByRequest.filter(a => !existingIds.has(a.id));
          allAppointments = [...allAppointments, ...newAppts];
        }
      }

      // Sort by scheduled_at
      allAppointments.sort((a, b) => new Date(a.scheduled_at) - new Date(b.scheduled_at));

      setAppointments(allAppointments);
      // Don't auto-expand any appointment - let user expand manually
      setExpandedAppointments(new Set());

      // Load client's review for this quote (if any)
      const { data: reviewData, error: reviewErr } = await supabase.rpc(
        "rpc_get_my_review_for_quote",
        { p_quote_id: id }
      );
      // Check if reviewData is actually a valid review (has a rating)
      // RPC may return empty array/object/null when no review exists
      if (!reviewErr && reviewData && reviewData.rating) {
        setClientReview(reviewData);
      } else {
        setClientReview(null);
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

  // Handle client confirmation of completion
  const handleClientConfirmCompletion = async () => {
    if (clientConfirmBusy) return;

    try {
      setClientConfirmBusy(true);

      const { data, error } = await supabase.rpc("rpc_client_confirm_complete", {
        p_quote_id: quote?.id,
      });

      if (error) {
        console.warn("Client confirm complete error:", error.message || error);
        Alert.alert(
          "Could not confirm completion",
          error.message || "Something went wrong, please try again."
        );
        return;
      }

      // Reload the quote
      await load();

      Alert.alert(
        "Job confirmed complete!",
        "Thank you for confirming. Would you like to leave a review?"
      );
    } catch (e) {
      console.warn("Client confirm complete error:", e?.message || e);
      Alert.alert(
        "Could not confirm completion",
        e?.message || "Something went wrong, please try again."
      );
    } finally {
      setClientConfirmBusy(false);
    }
  };

  // ============ RESCHEDULE FUNCTIONS ============

  // Check if an appointment can be rescheduled
  const canRescheduleAppointment = (appt) => {
    if (!appt) return { allowed: false, reason: "" };

    // Can't reschedule if already at max reschedules (2)
    if ((appt.reschedule_count || 0) >= 2) {
      return { allowed: false, reason: `Rescheduled ${appt.reschedule_count} times` };
    }

    // Can't reschedule if there's a pending reschedule request
    if (appt.status === "reschedule_pending") {
      return { allowed: false, reason: "Pending reschedule" };
    }

    // Can't reschedule within 24 hours
    const scheduledAt = new Date(appt.scheduled_at);
    const hoursUntil = (scheduledAt - new Date()) / (1000 * 60 * 60);
    if (hoursUntil < 24) {
      return { allowed: false, reason: "Can't reschedule within 24 hours" };
    }

    // Only confirmed or proposed appointments can be rescheduled
    if (!["confirmed", "proposed", "scheduled"].includes(appt.status)) {
      return { allowed: false, reason: "" };
    }

    return { allowed: true, reason: "" };
  };

  // Check if this user requested the reschedule
  const isRescheduleRequestedByMe = (appt) => {
    return appt?.reschedule_requested_by === user?.id;
  };

  // Open reschedule sheet
  const openRescheduleSheet = (appt) => {
    setRescheduleAppointment(appt);
    setRescheduleDate(null);
    setRescheduleTime(null);
    setRescheduleReason("");
    setShowRescheduleSheet(true);
  };

  // Close reschedule sheet
  const closeRescheduleSheet = () => {
    if (rescheduleBusy) return;
    setShowRescheduleSheet(false);
    setRescheduleAppointment(null);
    setReschedulePickerVisible(false);
  };

  // Handle reschedule date picker
  const handleRescheduleDatePress = () => {
    setReschedulePickerMode("date");
    setReschedulePickerVisible(true);
  };

  // Handle reschedule time picker
  const handleRescheduleTimePress = () => {
    if (!rescheduleDate) {
      Alert.alert("Select date first", "Please pick a date before the time.");
      return;
    }
    setReschedulePickerMode("time");
    setReschedulePickerVisible(true);
  };

  // Handle reschedule picker confirm
  const handleReschedulePickerConfirm = (picked) => {
    if (!picked) {
      setReschedulePickerVisible(false);
      return;
    }

    if (reschedulePickerMode === "date") {
      setRescheduleDate(picked);
      setReschedulePickerVisible(false);
      // Auto-prompt time
      setTimeout(() => {
        setReschedulePickerMode("time");
        setReschedulePickerVisible(true);
      }, 300);
    } else {
      // Merge date and time
      const date = rescheduleDate || new Date();
      const merged = new Date(
        date.getFullYear(),
        date.getMonth(),
        date.getDate(),
        picked.getHours(),
        picked.getMinutes(),
        0,
        0
      );
      setRescheduleTime(merged);
      setReschedulePickerVisible(false);
    }
  };

  // Submit reschedule request
  const handleSubmitReschedule = async () => {
    if (rescheduleBusy || !rescheduleAppointment) return;

    if (!rescheduleDate) {
      Alert.alert("Missing date", "Please select a new date for the appointment.");
      return;
    }

    if (!rescheduleTime) {
      Alert.alert("Missing time", "Please select a new time for the appointment.");
      return;
    }

    // Combine date and time
    const newScheduledAt = new Date(
      rescheduleDate.getFullYear(),
      rescheduleDate.getMonth(),
      rescheduleDate.getDate(),
      rescheduleTime.getHours(),
      rescheduleTime.getMinutes(),
      0,
      0
    );

    if (newScheduledAt <= new Date()) {
      Alert.alert("Invalid time", "New appointment time must be in the future.");
      return;
    }

    try {
      setRescheduleBusy(true);

      const { data, error } = await supabase.rpc("rpc_request_appointment_reschedule", {
        p_appointment_id: rescheduleAppointment.id,
        p_new_scheduled_at: newScheduledAt.toISOString(),
        p_reason: rescheduleReason.trim() || null,
      });

      if (error) {
        Alert.alert("Error", error.message || "Could not request reschedule");
        return;
      }

      if (data && !data.success) {
        Alert.alert("Cannot reschedule", data.error || "Something went wrong");
        return;
      }

      Alert.alert(
        "Reschedule requested",
        `${tradeName || "The trade"} will need to confirm the new time.`
      );

      // Reload appointments
      await reloadAppointments();
      closeRescheduleSheet();
    } catch (e) {
      Alert.alert("Error", e?.message || "Something went wrong");
    } finally {
      setRescheduleBusy(false);
    }
  };

  // Accept reschedule request
  const handleAcceptReschedule = async (appt) => {
    if (apptBusy) return;

    Alert.alert(
      "Accept new time?",
      `Accept the appointment for ${new Date(appt.proposed_scheduled_at).toLocaleString()}?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Accept",
          style: "default",
          onPress: async () => {
            try {
              setApptBusy(true);

              const { data, error } = await supabase.rpc("rpc_accept_appointment_reschedule", {
                p_appointment_id: appt.id,
              });

              if (error) {
                Alert.alert("Error", error.message || "Could not accept reschedule");
                return;
              }

              if (data && !data.success) {
                Alert.alert("Error", data.error || "Something went wrong");
                return;
              }

              Alert.alert("Reschedule accepted", "The appointment has been updated to the new time.");
              await reloadAppointments();
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

  // Decline reschedule request
  const handleDeclineReschedule = async (appt) => {
    if (apptBusy) return;

    Alert.alert(
      "Decline reschedule?",
      "The appointment will keep its original time.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Decline",
          style: "destructive",
          onPress: async () => {
            try {
              setApptBusy(true);

              const { data, error } = await supabase.rpc("rpc_decline_appointment_reschedule", {
                p_appointment_id: appt.id,
              });

              if (error) {
                Alert.alert("Error", error.message || "Could not decline reschedule");
                return;
              }

              if (data && !data.success) {
                Alert.alert("Error", data.error || "Something went wrong");
                return;
              }

              Alert.alert("Reschedule declined", "The appointment remains at its original time.");
              await reloadAppointments();
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

  // Helper to reload appointments
  const reloadAppointments = async () => {
    const quoteId = id;
    const requestId = quote?.request_id;
    if (!quoteId && !requestId) return;

    try {
      let allAppointments = [];

      // Load by quote_id
      const { data: apptByQuote } = await supabase
        .from("appointments")
        .select("*")
        .eq("quote_id", quoteId)
        .order("scheduled_at", { ascending: true });

      if (apptByQuote) {
        allAppointments = [...apptByQuote];
      }

      // Also load by request_id
      if (requestId) {
        const { data: apptByRequest } = await supabase
          .from("appointments")
          .select("*")
          .eq("request_id", requestId)
          .order("scheduled_at", { ascending: true });

        if (apptByRequest) {
          const existingIds = new Set(allAppointments.map(a => a.id));
          const newAppts = apptByRequest.filter(a => !existingIds.has(a.id));
          allAppointments = [...allAppointments, ...newAppts];
        }
      }

      allAppointments.sort((a, b) => new Date(a.scheduled_at) - new Date(b.scheduled_at));
      setAppointments(allAppointments);
    } catch (e) {
      console.warn("Failed to reload appointments:", e?.message || e);
    }
  };

  // ============ END RESCHEDULE FUNCTIONS ============

  const status = useMemo(
    () => String(quote?.status || "created").toLowerCase(),
    [quote?.status]
  );
  // Clients can only accept/decline sent quotes - NOT drafts
  const canAccept = ["created", "sent", "quoted"].includes(status);
  const canDecline = ["created", "sent", "quoted"].includes(status);

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

  // Hero subtitle: prioritize suggested_title from request, then project_title
  const heroSubtitle =
    req?.suggested_title ||
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

    // Check if it's upcoming (in the future)
    if (scheduledDate > now) {
      if (apptStatus === "confirmed") return "confirmed";
      if (apptStatus === "scheduled") return "scheduled";
      if (apptStatus === "proposed") return "pending";
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
      accepted: { bg: "#E7F6EC", fg: "#166534", icon: "checkmark-circle", label: "Accepted" },
      declined: { bg: "#FEE2E2", fg: "#991B1B", icon: "close-circle", label: "Declined" },
      quoted: { bg: "#F1F5F9", fg: "#0F172A", icon: "pricetag", label: "Quoted" },
      created: { bg: "#F1F5F9", fg: "#0F172A", icon: "document-text", label: "Created" },
      draft: { bg: "#F1F5F9", fg: "#0F172A", icon: "document-text", label: "Draft" },
      expired: { bg: "#F8FAFC", fg: "#334155", icon: "time", label: "Expired" },
      awaiting_completion: { bg: "#FEF3C7", fg: "#92400E", icon: "hourglass", label: "Awaiting Completion" },
      completed: { bg: "#E7F6EC", fg: "#166534", icon: "checkmark-done-circle", label: "Completed" },
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
          {s.label || v.charAt(0).toUpperCase() + v.slice(1)}
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
    const isProposed = appointment.status === "proposed";
    const isConfirmed = appointment.status === "confirmed";
    const isReschedulePending = appointment.status === "reschedule_pending";
    const rescheduleCheck = canRescheduleAppointment(appointment);
    const iRequestedReschedule = isRescheduleRequestedByMe(appointment);

    const handlePress = () => {
      toggleAppointment(appointment.id);
    };

    // Handle confirm appointment
    const handleConfirm = async () => {
      try {
        const { error } = await supabase
          .from("appointments")
          .update({ status: "confirmed" })
          .eq("id", appointment.id);

        if (error) throw error;
        Alert.alert("Confirmed", "The appointment has been confirmed.");
        // Refresh appointments
        load();
      } catch (err) {
        console.error("Error confirming appointment:", err);
        Alert.alert("Error", "Could not confirm appointment.");
      }
    };

    // Format proposed time for reschedule
    const proposedDate = appointment.proposed_scheduled_at
      ? new Date(appointment.proposed_scheduled_at)
      : null;
    const originalDate = appointment.original_scheduled_at
      ? new Date(appointment.original_scheduled_at)
      : scheduledDate;

    return (
      <Pressable
        onPress={handlePress}
        style={[
          styles.appointmentCard,
          isProposed && styles.appointmentCardProposed,
          isReschedulePending && styles.appointmentCardReschedule,
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
            {scheduledDate && !isReschedulePending && (
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

            {/* Reschedule pending - show Was/New times */}
            {isReschedulePending && originalDate && proposedDate && (
              <View style={{ marginTop: 4 }}>
                <View style={styles.appointmentCardMetaRow}>
                  <ThemedText style={styles.rescheduleWasLabel}>Was: </ThemedText>
                  <ThemedText style={styles.rescheduleWasTime}>
                    {originalDate.toLocaleDateString(undefined, {
                      weekday: "short",
                      month: "short",
                      day: "numeric",
                    })}
                    {" at "}
                    {originalDate.toLocaleTimeString(undefined, {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </ThemedText>
                </View>
                <View style={styles.appointmentCardMetaRow}>
                  <ThemedText style={styles.rescheduleNewLabel}>New: </ThemedText>
                  <ThemedText style={styles.rescheduleNewTime}>
                    {proposedDate.toLocaleDateString(undefined, {
                      weekday: "short",
                      month: "short",
                      day: "numeric",
                    })}
                    {" at "}
                    {proposedDate.toLocaleTimeString(undefined, {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </ThemedText>
                </View>
                {appointment.reschedule_reason && (
                  <ThemedText style={styles.rescheduleReasonText}>
                    Reason: {appointment.reschedule_reason}
                  </ThemedText>
                )}
              </View>
            )}
          </View>
          <Ionicons
            name={isExpanded ? "chevron-up" : "chevron-down"}
            size={20}
            color="#9CA3AF"
          />
        </View>

        {/* Reschedule pending - show accept/decline if trade requested it */}
        {isReschedulePending && !iRequestedReschedule && (
          <View style={styles.rescheduleActions}>
            <Pressable
              style={[styles.rescheduleDeclineBtn, apptBusy && styles.btnDisabled]}
              disabled={apptBusy}
              onPress={() => handleDeclineReschedule(appointment)}
            >
              <ThemedText style={styles.rescheduleDeclineBtnText}>
                Decline
              </ThemedText>
            </Pressable>
            <Pressable
              style={[styles.rescheduleAcceptBtn, apptBusy && styles.btnDisabled]}
              disabled={apptBusy}
              onPress={() => handleAcceptReschedule(appointment)}
            >
              <ThemedText style={styles.rescheduleAcceptBtnText}>
                Accept
              </ThemedText>
            </Pressable>
          </View>
        )}

        {/* Reschedule pending - you requested it, waiting for trade */}
        {isReschedulePending && iRequestedReschedule && (
          <View style={{ paddingHorizontal: 16, paddingBottom: 16 }}>
            <ThemedText style={styles.rescheduleWaitingText}>
              Waiting for {tradeName || "trade"} to respond...
            </ThemedText>
          </View>
        )}

        {/* Proposed appointment - show confirm/suggest buttons immediately */}
        {isProposed && (
          <View style={styles.appointmentProposedActions}>
            <Pressable
              style={styles.appointmentConfirmBtn}
              onPress={handleConfirm}
            >
              <ThemedText style={styles.appointmentConfirmBtnText}>
                Confirm
              </ThemedText>
            </Pressable>
            <Pressable
              style={styles.appointmentSuggestBtn}
              onPress={() => {
                router.push({
                  pathname: "/myquotes/appointment-response",
                  params: {
                    appointmentId: String(appointment.id),
                    quoteId: String(quote?.id || id),
                    requestId: String(quote?.request_id || ""),
                  },
                });
              }}
            >
              <ThemedText style={styles.appointmentSuggestBtnText}>
                Suggest time
              </ThemedText>
            </Pressable>
          </View>
        )}

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

            {/* Reschedule link for eligible appointments */}
            {(isConfirmed || isProposed) && !isReschedulePending && (
              <>
                {rescheduleCheck.allowed ? (
                  <Pressable onPress={() => openRescheduleSheet(appointment)}>
                    <ThemedText style={styles.rescheduleLink}>
                      Reschedule appointment
                    </ThemedText>
                  </Pressable>
                ) : rescheduleCheck.reason ? (
                  <ThemedText style={styles.rescheduleDisabledText}>
                    {rescheduleCheck.reason}
                  </ThemedText>
                ) : null}
              </>
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
            onPress={() => {
              // Always try router.back() first for proper back animation
              if (router.canGoBack?.()) {
                router.back();
              } else if (returnTo) {
                router.replace(returnTo);
              } else {
                router.replace("/(dashboard)/myquotes");
              }
            }}
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
                  <ThemedText style={styles.heroTradeName}>
                    {tradeName}
                  </ThemedText>
                  <ThemedText style={styles.heroJobTitle}>
                    {heroSubtitle}
                  </ThemedText>
                </View>
                <StatusChip value={status} />
              </View>

              <Spacer size={16} />

              {/* Total and Issued date row */}
              <View style={styles.heroInfoGrid}>
                <View style={styles.heroInfoItem}>
                  <ThemedText style={styles.heroInfoLabel}>Total quote</ThemedText>
                  <ThemedText style={styles.heroInfoValue}>
                    {currency} {formatNumber(grand)}
                  </ThemedText>
                  <ThemedText style={styles.heroInfoSub}>
                    {includesVat ? "Includes VAT" : "No VAT added"}
                  </ThemedText>
                </View>
                {issuedAt && (
                  <View style={[styles.heroInfoItem, { alignItems: "flex-end" }]}>
                    <ThemedText style={styles.heroInfoLabel}>Issued</ThemedText>
                    <ThemedText style={styles.heroInfoValue}>
                      {issuedAt.toLocaleDateString('en-GB', {
                        day: '2-digit',
                        month: '2-digit',
                        year: 'numeric',
                      })}
                    </ThemedText>
                  </View>
                )}
              </View>
            </View>

            {/* Declined banner only (removed "accepted" banner as requested) */}
            {status === "declined" && <DeclinedPanel />}

            {/* Quote Decision UI - Show accept/decline for pending quotes */}
            {canAccept && (
              <View style={styles.decisionCard}>
                <ThemedText style={styles.decisionTitle}>Your decision</ThemedText>
                <ThemedText style={styles.decisionSubtitle}>
                  Happy with this quote?
                </ThemedText>
                <Spacer size={16} />

                {/* Accept button */}
                <Pressable
                  style={[styles.acceptBtn, busy && styles.btnDisabled]}
                  onPress={() => confirmAndDecide("accepted")}
                  disabled={busy}
                >
                  <Ionicons name="checkmark-circle" size={20} color="#FFFFFF" />
                  <ThemedText style={styles.acceptBtnText}>
                    {busy ? "Processing..." : "Accept quote"}
                  </ThemedText>
                </Pressable>

                {/* Decline button */}
                <Pressable
                  style={[styles.declineBtn, busy && styles.btnDisabled]}
                  onPress={() => confirmAndDecide("declined")}
                  disabled={busy}
                >
                  <Ionicons name="close-circle" size={20} color="#6B7280" />
                  <ThemedText style={styles.declineBtnText}>Decline quote</ThemedText>
                </Pressable>

                <Spacer size={8} />

                {/* Message trade button - inside decision card */}
                <Pressable
                  style={styles.messageTradeBtn}
                  onPress={() => {
                    if (!quote?.request_id) {
                      Alert.alert("Message unavailable", "This quote is not linked to a request yet.");
                      return;
                    }
                    router.push({
                      pathname: "/(dashboard)/messages/[id]",
                      params: {
                        id: String(quote.request_id),
                        name: tradeName || "",
                        quoteId: String(quote.id || id),
                        returnTo: `/myquotes/${id}`,
                      },
                    });
                  }}
                >
                  <Ionicons name="chatbubble-outline" size={18} color={PRIMARY} />
                  <ThemedText style={styles.messageTradeBtnText}>
                    Message {tradeName}
                  </ThemedText>
                </Pressable>
              </View>
            )}

            {/* Client Completion Flow UI - Awaiting Completion */}
            {status === "awaiting_completion" && (
              <View style={styles.completionCard}>
                <Ionicons name="hourglass-outline" size={32} color="#F59E0B" />
                <Spacer size={12} />
                <ThemedText style={styles.completionTitle}>
                  {tradeName || "Trade"} marked this job complete
                </ThemedText>
                <ThemedText style={styles.completionSubtitle}>
                  Please confirm if the work has been completed to your satisfaction.
                </ThemedText>
                <Spacer size={20} />
                <Pressable
                  style={styles.confirmCompleteBtn}
                  onPress={() => {
                    router.push({
                      pathname: "/(dashboard)/myquotes/completion-response",
                      params: {
                        quoteId: quote?.id || id,
                        requestId: quote?.request_id,
                      },
                    });
                  }}
                >
                  <ThemedText style={styles.confirmCompleteBtnText}>Respond</ThemedText>
                </Pressable>
              </View>
            )}

            {/* Issue Reported - Waiting for trade to respond */}
            {status === "issue_reported" && (
              <View style={styles.issueReportedCard}>
                <Ionicons name="warning" size={32} color="#EF4444" />
                <Spacer size={12} />
                <ThemedText style={styles.issueReportedTitle}>Issue reported</ThemedText>
                <ThemedText style={styles.issueReportedMeta}>
                  You reported a problem
                  {quote?.issue_reported_at
                    ? ` on ${new Date(quote.issue_reported_at).toLocaleDateString(undefined, {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })}`
                    : ""}
                </ThemedText>

                {/* Issue Details Box */}
                <View style={styles.issueDetailsBox}>
                  <ThemedText style={styles.issueDetailsReason}>
                    {quote?.issue_reason === "work_not_finished"
                      ? "Work isn't finished"
                      : quote?.issue_reason === "quality_issue"
                      ? "Quality isn't right"
                      : quote?.issue_reason === "price_changed"
                      ? "Price changed"
                      : quote?.issue_reason || "Issue with the work"}
                  </ThemedText>
                  {quote?.issue_details && (
                    <ThemedText style={styles.issueDetailsText}>
                      "{quote.issue_details}"
                    </ThemedText>
                  )}
                </View>

                <Spacer size={12} />
                <ThemedText style={styles.waitingText}>
                  Waiting for {tradeName || "the trade"} to respond
                </ThemedText>
              </View>
            )}

            {/* Issue Addressed - Trade marked issue resolved, client needs to confirm */}
            {status === "issue_resolved_pending" && (
              <View style={styles.issueAddressedCard}>
                <Ionicons name="construct" size={32} color="#F59E0B" />
                <Spacer size={12} />
                <ThemedText style={styles.issueAddressedTitle}>Issue addressed</ThemedText>
                <ThemedText style={styles.issueAddressedMeta}>
                  {tradeName || "Trade"} says they've resolved the issue
                </ThemedText>

                {/* Resolution Details Box */}
                {quote?.issue_resolution && (
                  <View style={styles.resolutionDetailsBox}>
                    <ThemedText style={styles.resolutionDetailsText}>
                      "{quote.issue_resolution}"
                    </ThemedText>
                  </View>
                )}

                <Spacer size={20} />
                <ThemedText style={styles.questionText}>Is the issue resolved?</ThemedText>
                <Spacer size={12} />
                <Pressable
                  style={styles.confirmResolvedBtn}
                  onPress={handleClientConfirmCompletion}
                  disabled={clientConfirmBusy}
                >
                  <ThemedText style={styles.confirmResolvedBtnText}>
                    {clientConfirmBusy ? "Confirming..." : "Yes, all sorted"}
                  </ThemedText>
                </Pressable>
                <Spacer size={8} />
                <Pressable
                  style={styles.notResolvedBtn}
                  onPress={() => {
                    router.push({
                      pathname: "/(dashboard)/myquotes/report-issue",
                      params: {
                        quoteId: quote?.id || id,
                        requestId: quote?.request_id,
                        tradeName: tradeName || "Trade",
                      },
                    });
                  }}
                >
                  <ThemedText style={styles.notResolvedBtnText}>
                    No, still not right
                  </ThemedText>
                </Pressable>
              </View>
            )}

            {/* Job Complete - Show review prompt or review display */}
            {status === "completed" && (
              <>
                <View style={styles.completedCard}>
                  <View style={styles.completedCheckCircle}>
                    <Ionicons name="checkmark" size={32} color="#10B981" />
                  </View>
                  <Spacer size={12} />
                  <ThemedText style={styles.completedTitle}>Job complete</ThemedText>
                  <ThemedText style={styles.completedSubtitle}>
                    Confirmed{quote?.completion_confirmed_at ? ` ${new Date(quote.completion_confirmed_at).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}` : ""}
                  </ThemedText>
                </View>

                {/* Review Prompt Card - Only show if no review left yet */}
                {(!clientReview || !clientReview.rating) && (
                  <View style={styles.reviewPromptCard}>
                    {/* Trade Avatar + Name */}
                    <View style={styles.reviewTradeRow}>
                      {trade?.photo_url ? (
                        <Image source={{ uri: trade.photo_url }} style={styles.reviewTradeAvatar} />
                      ) : (
                        <View style={styles.reviewTradeAvatarPlaceholder}>
                          <ThemedText style={styles.reviewTradeAvatarText}>
                            {(tradeName || "T").substring(0, 2).toUpperCase()}
                          </ThemedText>
                        </View>
                      )}
                      <ThemedText style={styles.reviewTradeName}>{tradeName}</ThemedText>
                    </View>
                    <Spacer size={16} />
                    <ThemedText style={styles.reviewPromptTitle}>
                      How was your experience?
                    </ThemedText>
                    <ThemedText style={styles.reviewPromptSubtitle}>
                      Help others find great tradespeople.
                    </ThemedText>
                    <Spacer size={16} />
                    <Pressable
                      style={styles.leaveReviewBtn}
                      onPress={() => {
                        router.push({
                          pathname: "/(dashboard)/myquotes/leave-review",
                          params: {
                            quoteId: quote?.id || id,
                            revieweeName: tradeName || "Trade",
                            revieweeType: "trade",
                            tradePhotoUrl: trade?.photo_url || "",
                            jobTitle: parsed?.title || "Job",
                          },
                        });
                      }}
                    >
                      <ThemedText style={styles.leaveReviewBtnText}>Leave a review</ThemedText>
                    </Pressable>
                  </View>
                )}

                {/* Review Display - Show if client has left a review */}
                {clientReview && clientReview.rating && (
                  <View style={styles.reviewDisplayCard}>
                    <ThemedText style={styles.reviewDisplayTitle}>Your review</ThemedText>
                    <Spacer size={12} />
                    <View style={styles.reviewStarsRow}>
                      {[1, 2, 3, 4, 5].map((star) => (
                        <Ionicons
                          key={star}
                          name={star <= (clientReview.rating || 0) ? "star" : "star-outline"}
                          size={24}
                          color="#F59E0B"
                        />
                      ))}
                    </View>
                    {clientReview.content && (
                      <>
                        <Spacer size={12} />
                        <ThemedText style={styles.reviewDisplayContent}>
                          "{clientReview.content}"
                        </ThemedText>
                      </>
                    )}
                    {/* Review Photos */}
                    {clientReview.photos && clientReview.photos.length > 0 && (
                      <>
                        <Spacer size={12} />
                        <View style={styles.reviewPhotosRow}>
                          {clientReview.photos.map((photoUrl, idx) => (
                            <Image
                              key={idx}
                              source={{ uri: photoUrl }}
                              style={styles.reviewPhoto}
                            />
                          ))}
                        </View>
                      </>
                    )}
                    <Spacer size={12} />
                    <ThemedText style={styles.reviewDisplayDate}>
                      {clientReview.created_at
                        ? `Posted ${new Date(clientReview.created_at).toLocaleDateString(undefined, {
                            day: "numeric",
                            month: "short",
                            year: "numeric",
                          })}`
                        : ""}
                    </ThemedText>
                  </View>
                )}
              </>
            )}

            {/* Section Divider */}
            <View style={styles.sectionDivider} />

            {/* Quote breakdown */}
            <Pressable
              style={styles.collapsibleHeader}
              onPress={() => setQuoteBreakdownExpanded(!quoteBreakdownExpanded)}
            >
              <ThemedText style={styles.sectionHeaderText}>Quote breakdown</ThemedText>
              <Ionicons
                name={quoteBreakdownExpanded ? "chevron-up" : "chevron-down"}
                size={20}
                color="#6B7280"
              />
            </Pressable>
            {quoteBreakdownExpanded && (
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
            )}

            {/* Section Divider */}
            <View style={styles.sectionDivider} />

            {/* Your request (summary + photos) */}
            {req && (
              <>
                <Pressable
                  style={styles.collapsibleHeader}
                  onPress={() => setYourRequestExpanded(!yourRequestExpanded)}
                >
                  <ThemedText style={styles.sectionHeaderText}>Your request</ThemedText>
                  <Ionicons
                    name={yourRequestExpanded ? "chevron-up" : "chevron-down"}
                    size={20}
                    color="#6B7280"
                  />
                </Pressable>
                {yourRequestExpanded && (
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
                )}
              </>
            )}

            {/* Section Divider - only show if there are appointments */}
            {appointments.length > 0 && <View style={styles.sectionDivider} />}

            {/* Appointments Section - Multiple Appointments Support */}
            {appointments.length > 0 && (
              <>
                <Pressable
                  style={styles.collapsibleHeader}
                  onPress={() => setAppointmentsExpanded(!appointmentsExpanded)}
                >
                  <ThemedText style={styles.sectionHeaderText}>Appointments</ThemedText>
                  <Ionicons
                    name={appointmentsExpanded ? "chevron-up" : "chevron-down"}
                    size={20}
                    color="#6B7280"
                  />
                </Pressable>
                {appointmentsExpanded && (
                <>

                {/* Upcoming Appointments - no "NEXT" label */}
                {categorizedAppointments.next.length > 0 && (
                  <>
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

                {/* More upcoming */}
                {categorizedAppointments.upcoming.length > 0 && (
                  <>
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

                {/* Completed - only show if there are some */}
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
              </>
            )}

            <Spacer size={20} />
          </ScrollView>
        </>
      )}

      {/* Image viewer with zoom, swipe and drag-to-dismiss - must be outside conditional */}
      <ImageViewing
        images={imageViewerData}
        imageIndex={viewer.index}
        visible={viewer.open}
        onRequestClose={closeViewer}
        swipeToCloseEnabled
        doubleTapToZoomEnabled
        presentationStyle="overFullScreen"
        animationType="fade"
      />

      {/* Reschedule Bottom Sheet Modal */}
      <Modal
        visible={showRescheduleSheet}
        animationType="slide"
        transparent
        onRequestClose={closeRescheduleSheet}
      >
        <KeyboardAvoidingView
          style={styles.rescheduleModalOverlay}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <Pressable
            style={styles.rescheduleModalBackdrop}
            onPress={closeRescheduleSheet}
          />
          <View style={styles.rescheduleSheet}>
            {/* Handle */}
            <View style={styles.rescheduleSheetHandle} />

            {/* Header */}
            <View style={styles.rescheduleSheetHeader}>
              <ThemedText style={styles.rescheduleSheetTitle}>
                Reschedule Appointment
              </ThemedText>
              <Pressable
                onPress={closeRescheduleSheet}
                hitSlop={10}
                style={styles.rescheduleSheetClose}
              >
                <Ionicons name="close" size={24} color="#6B7280" />
              </Pressable>
            </View>

            {/* Current appointment info */}
            {rescheduleAppointment && (
              <View style={styles.rescheduleCurrentInfo}>
                <ThemedText style={styles.rescheduleCurrentLabel}>
                  Current time:
                </ThemedText>
                <ThemedText style={styles.rescheduleCurrentValue}>
                  {new Date(rescheduleAppointment.scheduled_at).toLocaleString(undefined, {
                    weekday: "short",
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </ThemedText>
              </View>
            )}

            {/* Date picker */}
            <Pressable
              style={styles.reschedulePickerBtn}
              onPress={handleRescheduleDatePress}
            >
              <Ionicons name="calendar-outline" size={20} color={PRIMARY} />
              <ThemedText style={styles.reschedulePickerBtnText}>
                {rescheduleDate
                  ? rescheduleDate.toLocaleDateString(undefined, {
                      weekday: "short",
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })
                  : "Select new date"}
              </ThemedText>
            </Pressable>

            {/* Time picker */}
            <Pressable
              style={styles.reschedulePickerBtn}
              onPress={handleRescheduleTimePress}
            >
              <Ionicons name="time-outline" size={20} color={PRIMARY} />
              <ThemedText style={styles.reschedulePickerBtnText}>
                {rescheduleTime
                  ? rescheduleTime.toLocaleTimeString(undefined, {
                      hour: "2-digit",
                      minute: "2-digit",
                    })
                  : "Select new time"}
              </ThemedText>
            </Pressable>

            {/* Reason input */}
            <View style={styles.rescheduleReasonWrap}>
              <ThemedText style={styles.rescheduleReasonLabel}>
                Reason (optional)
              </ThemedText>
              <TextInput
                style={styles.rescheduleReasonInput}
                placeholder="Why do you need to reschedule?"
                placeholderTextColor="#9CA3AF"
                value={rescheduleReason}
                onChangeText={setRescheduleReason}
                multiline
                maxLength={200}
              />
            </View>

            {/* Submit button */}
            <Pressable
              style={[
                styles.rescheduleSubmitBtn,
                rescheduleBusy && styles.btnDisabled,
              ]}
              disabled={rescheduleBusy}
              onPress={handleSubmitReschedule}
            >
              <ThemedText style={styles.rescheduleSubmitBtnText}>
                {rescheduleBusy ? "Requesting..." : "Request Reschedule"}
              </ThemedText>
            </Pressable>

            <ThemedText style={styles.rescheduleNote}>
              {tradeName || "The trade"} will need to approve your new time.
            </ThemedText>
          </View>
        </KeyboardAvoidingView>

        {/* DateTime Picker */}
        <CustomDateTimePicker
          visible={reschedulePickerVisible}
          mode={reschedulePickerMode}
          value={
            reschedulePickerMode === "date"
              ? rescheduleDate || new Date()
              : rescheduleTime || new Date()
          }
          onConfirm={handleReschedulePickerConfirm}
          onCancel={() => setReschedulePickerVisible(false)}
          minimumDate={new Date()}
        />
      </Modal>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#FFFFFF",
  },

  // Profile-style header (sticky)
  header: {
    paddingHorizontal: 20,
    paddingBottom: 12,
    backgroundColor: "#FFFFFF",
    zIndex: 10,
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
  chip: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },

  // Hero card - cleaner design matching trade side
  heroCard: {
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
  heroTradeName: {
    fontSize: 20,
    fontWeight: "700",
    color: "#111827",
  },
  heroJobTitle: {
    marginTop: 4,
    fontSize: 15,
    fontWeight: "500",
    color: "#374151",
  },
  heroInfoGrid: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "#E5E7EB",
  },
  heroInfoItem: {
    flex: 1,
  },
  heroInfoLabel: {
    fontSize: 12,
    color: "#6B7280",
    marginBottom: 4,
  },
  heroInfoValue: {
    fontSize: 18,
    fontWeight: "700",
    color: "#111827",
  },
  heroInfoSub: {
    marginTop: 2,
    fontSize: 12,
    color: "#6B7280",
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
  // Collapsible section header
  collapsibleHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 24,
    marginBottom: 12,
    paddingVertical: 4,
  },
  // Message button at bottom
  messageBottomBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    backgroundColor: PRIMARY,
    borderRadius: 12,
    paddingVertical: 16,
    marginTop: 8,
  },
  messageBottomBtnText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "600",
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
  sectionDivider: {
    height: 1,
    backgroundColor: "#E5E7EB",
    marginTop: 8,
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

  // New decision section styles
  decisionTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#111827",
    marginBottom: 4,
  },
  decisionSubtitle: {
    fontSize: 15,
    marginBottom: 20,
  },
  decisionBtn: {
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  decisionBtnAccept: {
    backgroundColor: "#16A34A",
  },
  decisionBtnAcceptText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "600",
  },
  decisionBtnDecline: {
    backgroundColor: "transparent",
    borderWidth: 1.5,
    borderColor: "#9CA3AF",
  },
  decisionBtnDeclineText: {
    color: "#6B7280",
    fontSize: 16,
    fontWeight: "600",
  },
  decisionBtnMessage: {
    backgroundColor: PRIMARY,
  },
  decisionBtnMessageText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "600",
  },
  decisionBtnDisabled: {
    opacity: 0.5,
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
  appointmentCardProposed: {
    borderColor: "#F59E0B",
    borderWidth: 2,
    backgroundColor: "#FFFBEB",
  },
  appointmentProposedActions: {
    flexDirection: "row",
    gap: 10,
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  appointmentConfirmBtn: {
    flex: 1,
    backgroundColor: "#16A34A",
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: "center",
  },
  appointmentConfirmBtnText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "600",
  },
  appointmentSuggestBtn: {
    flex: 1,
    backgroundColor: "transparent",
    borderWidth: 1.5,
    borderColor: "#9CA3AF",
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: "center",
  },
  appointmentSuggestBtnText: {
    color: "#6B7280",
    fontSize: 14,
    fontWeight: "600",
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
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.08)",
  },
  appointmentActionText: {
    fontSize: 14,
    fontWeight: "600",
    color: PRIMARY,
  },

  // Quote Decision Card Styles
  decisionCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 24,
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
    marginBottom: 16,
  },
  decisionTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#111827",
    textAlign: "center",
  },
  decisionSubtitle: {
    fontSize: 15,
    color: "#6B7280",
    textAlign: "center",
    marginTop: 4,
  },
  acceptBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#10B981",
    borderRadius: 12,
    paddingVertical: 16,
    paddingHorizontal: 24,
    width: "100%",
  },
  acceptBtnText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "600",
  },
  declineBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    paddingVertical: 16,
    paddingHorizontal: 24,
    width: "100%",
    borderWidth: 1.5,
    borderColor: "#D1D5DB",
    marginTop: 8,
  },
  declineBtnText: {
    color: "#6B7280",
    fontSize: 16,
    fontWeight: "600",
  },
  messageTradeBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 12,
  },
  messageTradeBtnText: {
    color: PRIMARY,
    fontSize: 15,
    fontWeight: "600",
  },
  btnDisabled: {
    opacity: 0.6,
  },

  // Client Completion Flow Styles
  completionCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 24,
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  progressRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  progressDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: "#10B981",
  },
  progressDotEmpty: {
    backgroundColor: "#E5E7EB",
    borderWidth: 2,
    borderColor: "#10B981",
  },
  progressLine: {
    width: 40,
    height: 2,
    backgroundColor: "#10B981",
    marginHorizontal: 8,
  },
  completionTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#111827",
    textAlign: "center",
    marginBottom: 8,
  },
  completionSubtitle: {
    fontSize: 15,
    color: "#6B7280",
    textAlign: "center",
    lineHeight: 22,
  },
  confirmCompleteBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#10B981",
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 24,
    width: "100%",
    marginBottom: 12,
  },
  confirmCompleteBtnText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "600",
  },
  reportIssueBtn: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 10,
  },
  reportIssueBtnText: {
    color: "#6B7280",
    fontSize: 15,
    fontWeight: "500",
  },

  // Completed state
  completedCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 24,
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  completedCheckCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: "#D1FAE5",
    alignItems: "center",
    justifyContent: "center",
  },
  completedTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#111827",
    textAlign: "center",
  },
  completedSubtitle: {
    fontSize: 15,
    color: "#6B7280",
    textAlign: "center",
    lineHeight: 22,
  },
  reviewPromptCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 20,
    marginTop: 16,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    alignItems: "center",
  },
  reviewTradeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  reviewTradeAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
  },
  reviewTradeAvatarPlaceholder: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "#E5E7EB",
    alignItems: "center",
    justifyContent: "center",
  },
  reviewTradeAvatarText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#6B7280",
  },
  reviewTradeName: {
    fontSize: 16,
    fontWeight: "600",
    color: "#111827",
  },
  reviewPromptTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#111827",
    textAlign: "center",
    marginBottom: 4,
  },
  reviewPromptSubtitle: {
    fontSize: 14,
    color: "#6B7280",
    textAlign: "center",
    lineHeight: 20,
  },
  leaveReviewBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: PRIMARY,
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 24,
    width: "100%",
  },
  leaveReviewBtnText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "600",
  },
  maybeLaterBtn: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 10,
  },
  maybeLaterBtnText: {
    color: "#6B7280",
    fontSize: 15,
    fontWeight: "500",
  },

  // Issue Reported card (client waiting for trade to respond)
  issueReportedCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 24,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#FCA5A5",
  },
  issueReportedTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#DC2626",
  },
  issueReportedMeta: {
    fontSize: 14,
    color: "#6B7280",
    textAlign: "center",
    marginTop: 4,
  },
  issueDetailsBox: {
    marginTop: 16,
    padding: 16,
    backgroundColor: "#FEF2F2",
    borderRadius: 12,
    width: "100%",
  },
  issueDetailsReason: {
    fontSize: 15,
    fontWeight: "600",
    color: "#111827",
    marginBottom: 8,
  },
  issueDetailsText: {
    fontSize: 14,
    color: "#374151",
    fontStyle: "italic",
    lineHeight: 20,
  },
  waitingText: {
    fontSize: 14,
    color: "#6B7280",
    textAlign: "center",
  },

  // Issue Addressed card (trade resolved, client needs to confirm)
  issueAddressedCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 24,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#FCD34D",
  },
  issueAddressedTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#D97706",
  },
  issueAddressedMeta: {
    fontSize: 14,
    color: "#6B7280",
    textAlign: "center",
    marginTop: 4,
  },
  resolutionDetailsBox: {
    marginTop: 16,
    padding: 16,
    backgroundColor: "#FEF3C7",
    borderRadius: 12,
    width: "100%",
  },
  resolutionDetailsText: {
    fontSize: 14,
    color: "#374151",
    fontStyle: "italic",
    lineHeight: 20,
  },
  questionText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#111827",
  },
  confirmResolvedBtn: {
    backgroundColor: "#16A34A",
    borderRadius: 12,
    paddingVertical: 16,
    paddingHorizontal: 24,
    alignItems: "center",
    justifyContent: "center",
    width: "100%",
  },
  confirmResolvedBtnText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#FFFFFF",
  },
  notResolvedBtn: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    paddingVertical: 16,
    paddingHorizontal: 24,
    alignItems: "center",
    justifyContent: "center",
    width: "100%",
    borderWidth: 1,
    borderColor: "#D1D5DB",
  },
  notResolvedBtnText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#374151",
  },

  // Review styles
  reviewStarsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  reviewDisplayCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 20,
    marginTop: 16,
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  reviewDisplayTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#111827",
    textAlign: "center",
  },
  reviewDisplayContent: {
    fontSize: 15,
    color: "#374151",
    fontStyle: "italic",
    lineHeight: 22,
    textAlign: "center",
  },
  reviewPhotosRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    justifyContent: "center",
  },
  reviewPhoto: {
    width: 80,
    height: 80,
    borderRadius: 8,
  },
  reviewDisplayDate: {
    fontSize: 13,
    color: "#9CA3AF",
    textAlign: "center",
  },

  // ============ RESCHEDULE STYLES ============
  appointmentCardReschedule: {
    borderColor: "#3B82F6",
    borderWidth: 2,
    backgroundColor: "#EFF6FF",
  },
  rescheduleWasLabel: {
    fontSize: 13,
    color: "#6B7280",
    fontWeight: "500",
  },
  rescheduleWasTime: {
    fontSize: 13,
    color: "#9CA3AF",
    textDecorationLine: "line-through",
  },
  rescheduleNewLabel: {
    fontSize: 13,
    color: "#10B981",
    fontWeight: "500",
  },
  rescheduleNewTime: {
    fontSize: 13,
    color: "#10B981",
    fontWeight: "600",
  },
  rescheduleReasonText: {
    fontSize: 13,
    color: "#6B7280",
    fontStyle: "italic",
    marginTop: 4,
  },
  rescheduleActions: {
    flexDirection: "row",
    gap: 10,
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  rescheduleDeclineBtn: {
    flex: 1,
    paddingVertical: 12,
    backgroundColor: "#F3F4F6",
    borderRadius: 10,
    alignItems: "center",
  },
  rescheduleDeclineBtnText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#6B7280",
  },
  rescheduleAcceptBtn: {
    flex: 1,
    paddingVertical: 12,
    backgroundColor: "#10B981",
    borderRadius: 10,
    alignItems: "center",
  },
  rescheduleAcceptBtnText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#FFFFFF",
  },
  rescheduleWaitingText: {
    fontSize: 14,
    color: "#6B7280",
    fontStyle: "italic",
  },
  rescheduleLink: {
    fontSize: 14,
    color: PRIMARY,
    marginTop: 12,
    fontWeight: "500",
  },
  rescheduleDisabledText: {
    fontSize: 13,
    color: "#9CA3AF",
    marginTop: 12,
  },

  // Reschedule Modal/Sheet styles
  rescheduleModalOverlay: {
    flex: 1,
    justifyContent: "flex-end",
  },
  rescheduleModalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.4)",
  },
  rescheduleSheet: {
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingBottom: 40,
    paddingTop: 12,
  },
  rescheduleSheetHandle: {
    width: 40,
    height: 4,
    backgroundColor: "#D1D5DB",
    borderRadius: 2,
    alignSelf: "center",
    marginBottom: 16,
  },
  rescheduleSheetHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 20,
  },
  rescheduleSheetTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#111827",
  },
  rescheduleSheetClose: {
    padding: 4,
  },
  rescheduleCurrentInfo: {
    backgroundColor: "#F9FAFB",
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
  },
  rescheduleCurrentLabel: {
    fontSize: 13,
    color: "#6B7280",
    marginBottom: 4,
  },
  rescheduleCurrentValue: {
    fontSize: 16,
    fontWeight: "600",
    color: "#111827",
  },
  reschedulePickerBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: "#F9FAFB",
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  reschedulePickerBtnText: {
    fontSize: 16,
    color: "#111827",
    flex: 1,
  },
  rescheduleReasonWrap: {
    marginBottom: 20,
  },
  rescheduleReasonLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: "#374151",
    marginBottom: 8,
  },
  rescheduleReasonInput: {
    backgroundColor: "#F9FAFB",
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    fontSize: 16,
    color: "#111827",
    minHeight: 80,
    textAlignVertical: "top",
  },
  rescheduleSubmitBtn: {
    backgroundColor: PRIMARY,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: "center",
    marginBottom: 12,
  },
  rescheduleSubmitBtnText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#FFFFFF",
  },
  rescheduleNote: {
    fontSize: 13,
    color: "#6B7280",
    textAlign: "center",
  },
});
