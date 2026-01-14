// app/(dashboard)/quotes/[id].jsx
import {
  StyleSheet,
  View,
  ScrollView,
  Pressable,
  useColorScheme,
  Image,
  Platform,
  Alert,
  TextInput,
  Dimensions,
  Modal,
  KeyboardAvoidingView,
  Keyboard,
} from "react-native";
import ImageViewing from "react-native-image-viewing";
import { useEffect, useState, useMemo, useCallback } from "react";
import { useLocalSearchParams, useRouter, useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import CustomDateTimePicker from "../../../components/CustomDateTimePicker";

import { useQuotes } from "../../../hooks/useQuotes";
import { useUser } from "../../../hooks/useUser";
import { supabase } from "../../../lib/supabase";
import ThemedView from "../../../components/ThemedView";
import ThemedText from "../../../components/ThemedText";
import Spacer from "../../../components/Spacer";
import { QuoteOverviewSkeleton } from "../../../components/Skeleton";
import {
  listRequestImagePaths,
  getSignedUrls,
} from "../../../lib/api/attachments";

function getInitials(name) {
  if (!name) return "?";
  const parts = String(name)
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!parts.length) return "?";
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return (
    parts[0].charAt(0).toUpperCase() +
    parts[parts.length - 1].charAt(0).toUpperCase()
  );
}

function isoToDMY(s) {
  if (!s) return "";
  const d = new Date(s);
  if (isNaN(d.getTime())) return "";
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = String(d.getFullYear());
  return `${dd}-${mm}-${yyyy}`;
}

// Format number with thousand separators (commas)
function formatNumber(num) {
  if (num == null || isNaN(num)) return "0.00";
  return Number(num).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function money(n, currency = "GBP") {
  const v = Number(n ?? 0);
  const c = (currency || "GBP").toUpperCase();
  return c === "GBP" ? `£${formatNumber(v)}` : `${c} ${formatNumber(v)}`;
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

const CELL = 96;
const SCREEN_WIDTH = Dimensions.get("window").width;
const PRIMARY = "#6849a7";

// Helper to get last 4 characters of quote ID for display
// This ensures both trade and client see the same quote identifier
function getQuoteShortId(quoteId) {
  if (!quoteId) return "0000";
  const idStr = String(quoteId);
  return idStr.slice(-4).toUpperCase();
}

export default function QuoteDetails() {
  const params = useLocalSearchParams();
  const router = useRouter();
  const { user } = useUser();
  const insets = useSafeAreaInsets();

  // Params from navigation (used as very rough fallback only)
  const routeNameParam = Array.isArray(params.name)
    ? params.name[0]
    : params.name;
  const routeAvatarParam = Array.isArray(params.avatar)
    ? params.avatar[0]
    : params.avatar;
  const fromAppointments = params.fromAppointments === 'true';
  const shouldOpenSchedule = params.openSchedule === 'true';

  const scheme = useColorScheme();
  const iconColor = scheme === "dark" ? "#fff" : "#000";

  const { fetchQuoteById } = useQuotes();
  const [quote, setQuote] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);
  const fetchQuote = () => setRefreshKey((k) => k + 1);
  const [userRole, setUserRole] = useState(null);
  const [tradeBusiness, setTradeBusiness] = useState(null);

  // Request + attachments
  const [request, setRequest] = useState(null);
  const [attachments, setAttachments] = useState([]); // string[]
  const [attachmentsCount, setAttachmentsCount] = useState(0);

  // "Other user" (homeowner/client) identity for avatar + labels
  const [otherName, setOtherName] = useState(
    routeNameParam && String(routeNameParam).trim()
      ? String(routeNameParam)
      : ""
  );
  const [otherAvatar, setOtherAvatar] = useState(
    routeAvatarParam && String(routeAvatarParam).trim()
      ? String(routeAvatarParam)
      : ""
  );

  // Appointments (DB-backed) - now an array for multiple appointments
  const [appointments, setAppointments] = useState([]);
  const [apptLoading, setApptLoading] = useState(false);
  const [apptBusy, setApptBusy] = useState(false);

  // Scheduling page state
  const [scheduling, setScheduling] = useState(false);
  const [apptTitle, setApptTitle] = useState("");
  const [apptDateTime, setApptDateTime] = useState(null); // Date | null
  const [hasDate, setHasDate] = useState(false);
  const [hasTime, setHasTime] = useState(false);

  // Picker overlay state
  const [pickerVisible, setPickerVisible] = useState(false);
  const [pickerMode, setPickerMode] = useState("date"); // "date" | "time"
  const [pickerDraftDate, setPickerDraftDate] = useState(new Date());

  // Full-screen viewer state (zoomable, swipeable)
  const [viewer, setViewer] = useState({ open: false, index: 0 });

  // Mark Complete bottom sheet state
  const [showCompleteSheet, setShowCompleteSheet] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("bank_transfer");
  const [completionNotes, setCompletionNotes] = useState("");
  const [completeBusy, setCompleteBusy] = useState(false);
  const [showPaymentMethodPicker, setShowPaymentMethodPicker] = useState(false);
  const [clientConfirmBusy, setClientConfirmBusy] = useState(false);

  // Issue Resolved bottom sheet state (Trade side)
  const [showIssueResolvedSheet, setShowIssueResolvedSheet] = useState(false);
  const [issueResolution, setIssueResolution] = useState("");
  const [issueResolveBusy, setIssueResolveBusy] = useState(false);

  // Review state
  const [tradeReview, setTradeReview] = useState(null); // Review left by trade about client
  const [clientReview, setClientReview] = useState(null); // Review left by client about trade

  // Reschedule state
  const [showRescheduleSheet, setShowRescheduleSheet] = useState(false);
  const [rescheduleAppointment, setRescheduleAppointment] = useState(null); // The appointment being rescheduled
  const [rescheduleDate, setRescheduleDate] = useState(null);
  const [rescheduleTime, setRescheduleTime] = useState(null);
  const [rescheduleReason, setRescheduleReason] = useState("");
  const [rescheduleBusy, setRescheduleBusy] = useState(false);
  const [reschedulePickerVisible, setReschedulePickerVisible] = useState(false);
  const [reschedulePickerMode, setReschedulePickerMode] = useState("date"); // "date" | "time"

  // Payment method options
  const PAYMENT_METHODS = [
    { id: "bank_transfer", label: "Bank transfer" },
    { id: "cash", label: "Cash" },
    { id: "card", label: "Card" },
    { id: "paypal", label: "PayPal" },
    { id: "other", label: "Other" },
  ];

  // Get selected payment method label
  const selectedPaymentMethodLabel = PAYMENT_METHODS.find(m => m.id === paymentMethod)?.label || "Select method";

  const closeViewer = useCallback(() => {
    setViewer((v) => ({ ...v, open: false }));
  }, []);

  const hasAttachments = attachments.length > 0;

  // Convert attachments to format expected by ImageViewing
  const imageViewerData = useMemo(
    () => attachments.map((url) => ({ uri: url })),
    [attachments]
  );

  // Fetch user role
  useEffect(() => {
    let mounted = true;

    (async () => {
      if (!user?.id) {
        setUserRole('client');
        return;
      }

      const { data, error } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single();

      if (mounted) {
        setUserRole(!error ? (data?.role || 'client') : 'client');
      }
    })();

    return () => {
      mounted = false;
    };
  }, [user?.id]);

  useEffect(() => {
    let mounted = true;

    (async () => {
      try {
        setLoading(true);

        // 1) Load quote
        const row = await fetchQuoteById(
          Array.isArray(params.id) ? params.id[0] : params.id
        );
        if (!mounted) return;
        setQuote(row);

        // 1b) If client, load trade business name
        if (userRole === 'client' && row?.trade_id) {
          const { data: tradeData, error: tradeErr } = await supabase
            .from('profiles')
            .select('business_name, full_name')
            .eq('id', row.trade_id)
            .single();

          if (!tradeErr && mounted) {
            setTradeBusiness(tradeData?.business_name || tradeData?.full_name || null);
          }
        }

        const reqId = row?.request_id || row?.requestId;
        if (!reqId) {
          if (mounted) {
            setRequest(null);
            setAttachments([]);
            setAttachmentsCount(0);
            setAppointments([]);

            // Fallback name from quote if we don't already have one
            if (row?.full_name) {
              setOtherName(row.full_name);
            }
          }
          return;
        }

        // 2) Load request summary with property type and timing
        let clientIdFromRequest = null;
        try {
          const { data: reqRow, error: reqErr } = await supabase
            .from("quote_requests")
            .select(
              `id, details, created_at, budget_band, postcode, status, suggested_title, requester_id,
               property_types(id, name),
               timing_options(id, name, description, is_emergency)`
            )
            .eq("id", reqId)
            .maybeSingle();

          if (!mounted) return;
          if (reqErr) {
            console.warn(
              "trade quote request load error",
              reqErr.message || reqErr
            );
            setRequest(null);
          } else {
            setRequest(reqRow || null);
            clientIdFromRequest = reqRow?.requester_id || null;
          }
        } catch (e) {
          if (mounted) {
            console.warn("trade quote request load error", e?.message || e);
            setRequest(null);
          }
        }

        // 3) Load attachments
        try {
          const paths = await listRequestImagePaths(String(reqId));
          if (!mounted) return;
          const p = Array.isArray(paths) ? paths : [];
          setAttachmentsCount(p.length || 0);
          if (p.length) {
            const signed = await getSignedUrls(p, 3600);
            const urls = (signed || []).map((s) => s.url).filter(Boolean);
            setAttachments(urls);
          } else {
            setAttachments([]);
          }
        } catch (e) {
          console.warn("attachments load failed", e?.message || e);
          if (mounted) {
            setAttachments([]);
            setAttachmentsCount(0);
          }
        }

        // 4) Load ALL appointments for this request using RPC (same method as Client Request page)
        try {
          setApptLoading(true);
          const quoteId = row?.id;

          let finalAppointments = [];

          // Method 1: Try rpc_trade_list_appointments (this works on Client Request page)
          const { data: allAppts, error: apptErr } = await supabase.rpc(
            "rpc_trade_list_appointments",
            { p_only_upcoming: false }
          );

          if (!apptErr && allAppts && allAppts.length > 0) {
            // Filter to only appointments for this request
            const filtered = (Array.isArray(allAppts) ? allAppts : [])
              .filter((a) => a.request_id === reqId || a.quote_id === quoteId);

            // Map to the expected format
            finalAppointments = filtered.map((a) => ({
              id: a.id,
              request_id: a.request_id,
              quote_id: a.quote_id,
              scheduled_at: a.scheduled_at,
              title: a.title || "Appointment",
              status: a.status,
              location: a.location,
            }));
          } else {
            // Fallback: direct query (may not work due to RLS)
            const { data: directAppts, error: directErr } = await supabase
              .from("appointments")
              .select("id, request_id, quote_id, scheduled_at, title, status, location")
              .or(`request_id.eq.${reqId},quote_id.eq.${quoteId}`)
              .order("scheduled_at", { ascending: true });

            if (!directErr && directAppts) {
              finalAppointments = directAppts;
            }
          }

          if (!mounted) return;

          setAppointments(finalAppointments);
        } catch (e) {
          if (mounted) {
            setAppointments([]);
          }
        } finally {
          if (mounted) setApptLoading(false);
        }

        // 5) Load "other party" (homeowner/client) for avatar + name
        try {
          const fallbackName = row?.full_name || null;

          const { data: convData, error: convErr } = await supabase.rpc(
            "rpc_list_conversations",
            { p_limit: 50 }
          );
          if (!mounted) return;

          if (convErr) {
            console.warn(
              "load conversations for avatar failed:",
              convErr.message || convErr
            );
            if (fallbackName) {
              setOtherName(fallbackName);
            }
          } else {
            const convRows = Array.isArray(convData) ? convData : [];
            const match = convRows.find(
              (c) =>
                (reqId && String(c.request_id) === String(reqId)) ||
                (row?.id && String(c.quote_id) === String(row.id))
            );

            if (match) {
              const name =
                match.other_party_name ||
                (match.other_party_role === "trade"
                  ? "Your trade"
                  : "Your client");
              const avatar = match.other_party_photo_url || "";
              setOtherName(name);
              setOtherAvatar(avatar);
            } else if (fallbackName) {
              setOtherName(fallbackName);
            }
          }

          // Fallback: If no avatar found and we have a requester_id (client), fetch directly
          // This handles cases where the conversation RPC didn't return the avatar
          if (clientIdFromRequest && userRole === "trade") {
            try {
              const { data: clientProfile } = await supabase
                .from("profiles")
                .select("full_name, photo_url")
                .eq("id", clientIdFromRequest)
                .single();

              if (!mounted) return;
              if (clientProfile) {
                if (clientProfile.photo_url) {
                  setOtherAvatar(clientProfile.photo_url);
                }
                if (clientProfile.full_name) {
                  setOtherName(clientProfile.full_name);
                }
              }
            } catch (profileErr) {
              console.warn("Fallback client profile fetch failed:", profileErr);
            }
          }
        } catch (e) {
          if (!mounted) return;
          console.warn("load other party failed:", e?.message || e);
          const fallbackName = row?.full_name || null;
          if (fallbackName) {
            setOtherName(fallbackName);
          }
        }

        // 6) Load trade's review for this quote (if any)
        try {
          const { data: reviewData, error: reviewErr } = await supabase.rpc(
            "rpc_get_my_review_for_quote",
            { p_quote_id: row?.id }
          );
          if (!mounted) return;
          // Check if reviewData is actually a valid review (has a rating)
          // RPC may return empty array/object/null when no review exists
          if (!reviewErr && reviewData && reviewData.rating) {
            setTradeReview(reviewData);
          } else {
            setTradeReview(null);
          }
        } catch (e) {
          if (mounted) setTradeReview(null);
        }
      } finally {
        if (mounted) setLoading(false);
      }
    })();

    return () => {
      mounted = false;
    };
  }, [params.id, fetchQuoteById, userRole, refreshKey]);

  // Auto-open scheduling page if navigated with openSchedule=true
  useEffect(() => {
    if (shouldOpenSchedule && !loading && quote && appointments.length === 0) {
      const quoteStatus = String(quote?.status || "").toLowerCase();
      if (quoteStatus === "accepted" && userRole === "trades") {
        openSchedulePage();
      }
    }
  }, [shouldOpenSchedule, loading, quote, appointments, userRole]);

  // Real-time subscription for appointments
  useEffect(() => {
    const reqId = quote?.request_id || quote?.requestId;
    const quoteId = quote?.id;

    if (!reqId && !quoteId) return;

    // Create a channel for real-time updates
    const channel = supabase
      .channel(`appointments-quote-${quoteId || reqId}`)
      .on(
        "postgres_changes",
        {
          event: "*", // Listen to INSERT, UPDATE, DELETE
          schema: "public",
          table: "appointments",
        },
        async (payload) => {
          console.log("[REALTIME] Appointment change detected:", payload.eventType);

          // Reload appointments when any change occurs
          try {
            let finalAppointments = [];

            // Try RPC first
            const { data: allAppts, error: apptErr } = await supabase.rpc(
              "rpc_trade_list_appointments",
              { p_only_upcoming: false }
            );

            if (!apptErr && allAppts && allAppts.length > 0) {
              const filtered = (Array.isArray(allAppts) ? allAppts : [])
                .filter((a) => a.request_id === reqId || a.quote_id === quoteId);

              finalAppointments = filtered.map((a) => ({
                id: a.id,
                request_id: a.request_id,
                quote_id: a.quote_id,
                scheduled_at: a.scheduled_at,
                title: a.title || "Appointment",
                status: a.status,
                location: a.location,
              }));
            } else {
              // Fallback: direct query
              const { data: directAppts, error: directErr } = await supabase
                .from("appointments")
                .select("id, request_id, quote_id, scheduled_at, title, status, location")
                .or(`request_id.eq.${reqId},quote_id.eq.${quoteId}`)
                .order("scheduled_at", { ascending: true });

              if (!directErr && directAppts) {
                finalAppointments = directAppts;
              }
            }

            setAppointments(finalAppointments);
            console.log("[REALTIME] Appointments updated:", finalAppointments.length);
          } catch (e) {
            console.warn("[REALTIME] Failed to reload appointments:", e?.message || e);
          }
        }
      )
      .subscribe((status) => {
        console.log("[REALTIME] Subscription status:", status);
      });

    // Cleanup subscription on unmount
    return () => {
      console.log("[REALTIME] Unsubscribing from appointments channel");
      supabase.removeChannel(channel);
    };
  }, [quote?.id, quote?.request_id, quote?.requestId]);

  // Reload appointments when screen is focused (fallback for when realtime doesn't work)
  useFocusEffect(
    useCallback(() => {
      const reqId = quote?.request_id || quote?.requestId;
      const quoteId = quote?.id;

      if (!reqId && !quoteId) return;

      const reloadAppointments = async () => {
        try {
          let finalAppointments = [];

          const { data: allAppts, error: apptErr } = await supabase.rpc(
            "rpc_trade_list_appointments",
            { p_only_upcoming: false }
          );

          if (!apptErr && allAppts && allAppts.length > 0) {
            const filtered = (Array.isArray(allAppts) ? allAppts : [])
              .filter((a) => a.request_id === reqId || a.quote_id === quoteId);

            finalAppointments = filtered.map((a) => ({
              id: a.id,
              request_id: a.request_id,
              quote_id: a.quote_id,
              scheduled_at: a.scheduled_at,
              title: a.title || "Appointment",
              status: a.status,
              location: a.location,
            }));
          } else {
            const { data: directAppts, error: directErr } = await supabase
              .from("appointments")
              .select("id, request_id, quote_id, scheduled_at, title, status, location")
              .or(`request_id.eq.${reqId},quote_id.eq.${quoteId}`)
              .order("scheduled_at", { ascending: true });

            if (!directErr && directAppts) {
              finalAppointments = directAppts;
            }
          }

          setAppointments(finalAppointments);
          console.log("[FOCUS] Appointments reloaded:", finalAppointments.length);
        } catch (e) {
          console.warn("[FOCUS] Failed to reload appointments:", e?.message || e);
        }
      };

      reloadAppointments();
    }, [quote?.id, quote?.request_id, quote?.requestId])
  );

  const items = useMemo(
    () => (Array.isArray(quote?.line_items) ? quote.line_items : []),
    [quote]
  );

  const headerLine = (() => {
    const pt = quote?.project_title || "Quote";
    const cn = quote?.full_name || "";
    return cn ? `${pt} - ${cn}` : pt;
  })();

  const parsedDetails = useMemo(
    () => parseDetails(request?.details),
    [request?.details]
  );

  const grandTotal = Number(quote?.grand_total ?? quote?.quote_total ?? 0);
  const includesVat = Number(quote?.tax_total ?? 0) > 0;
  const issuedAt =
    quote?.issued_at ||
    quote?.created_at ||
    quote?.createdAt ||
    quote?.inserted_at;

  // status chip
  const status = String(quote?.status || quote?.state || "").toLowerCase();
  const isAccepted = status === "accepted";

  // Final "other person" display identity
  const displayName =
    (otherName && otherName.trim()) ||
    (quote?.full_name && String(quote.full_name)) ||
    "Customer";

  const displayAvatarUrl =
    otherAvatar && otherAvatar.trim() ? otherAvatar : null;

  const avatarInitials = getInitials(displayName);

  // Get the first (latest) appointment for hero display
  const appointment = appointments.length > 0 ? appointments[0] : null;
  const hasExistingAppointment = appointments.length > 0;
  const appointmentDateLabel =
    appointment?.scheduled_at &&
    new Date(appointment.scheduled_at).toLocaleString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });

  // Separate appointments into upcoming and past for trades view
  const now = new Date();
  const upcomingAppointments = appointments.filter(
    (a) => new Date(a.scheduled_at) > now
  ).sort((a, b) => new Date(a.scheduled_at) - new Date(b.scheduled_at));
  const pastAppointments = appointments.filter(
    (a) => new Date(a.scheduled_at) <= now
  ).sort((a, b) => new Date(b.scheduled_at) - new Date(a.scheduled_at));

  // Collapsible sections state for trades
  const [showPastAppointments, setShowPastAppointments] = useState(false);
  const [showClientRequest, setShowClientRequest] = useState(false);
  const [quoteBreakdownExpanded, setQuoteBreakdownExpanded] = useState(true);
  const [appointmentsExpanded, setAppointmentsExpanded] = useState(false);

  // Auto-expand past appointments if there are no upcoming ones (so user sees something)
  useEffect(() => {
    if (upcomingAppointments.length === 0 && pastAppointments.length > 0) {
      setShowPastAppointments(true);
    }
  }, [upcomingAppointments.length, pastAppointments.length]);

  // Scheduling helpers
  const openSchedulePage = () => {
    const reqId = quote?.request_id || quote?.requestId || request?.id || null;
    router.push({
      pathname: "/quotes/schedule",
      params: {
        requestId: reqId ? String(reqId) : "",
        quoteId: quote?.id ? String(quote.id) : "",
        title: request?.suggested_title || quote?.project_title || "",
        postcode: request?.postcode || "",
      },
    });
  };

  const closeSchedulePage = () => {
    if (apptBusy) return;
    setScheduling(false);
    setPickerVisible(false);
  };

  const handlePressDateRow = () => {
    const base = apptDateTime || new Date();
    setPickerMode("date");
    setPickerDraftDate(base);
    setPickerVisible(true);
  };

  const handlePressTimeRow = () => {
    if (!hasDate && !apptDateTime) {
      Alert.alert("Select date first", "Please pick a date before the time.");
      return;
    }
    const base = apptDateTime || new Date();
    setPickerMode("time");
    setPickerDraftDate(base);
    setPickerVisible(true);
  };

  const handlePickerConfirm = (picked) => {
    if (!picked) {
      setPickerVisible(false);
      return;
    }

    if (pickerMode === "date") {
      const prev = apptDateTime || new Date();
      const merged = new Date(
        picked.getFullYear(),
        picked.getMonth(),
        picked.getDate(),
        prev.getHours(),
        prev.getMinutes(),
        0,
        0
      );
      setApptDateTime(merged);
      setHasDate(true);
      setPickerVisible(false);

      // Auto-prompt time if not chosen yet
      if (!hasTime) {
        setTimeout(() => {
          setPickerMode("time");
          setPickerDraftDate(merged);
          setPickerVisible(true);
        }, 300);
      }
    } else {
      const prev = apptDateTime || new Date();
      const merged = new Date(
        prev.getFullYear(),
        prev.getMonth(),
        prev.getDate(),
        picked.getHours(),
        picked.getMinutes(),
        0,
        0
      );
      setApptDateTime(merged);
      setHasTime(true);
      setPickerVisible(false);
    }
  };

  const handlePickerCancel = () => {
    setPickerVisible(false);
  };

  const validateAppointment = () => {
    const trimmedTitle = apptTitle.trim();
    if (!trimmedTitle) {
      Alert.alert(
        "Missing name",
        "Please name this appointment (e.g. Bathroom survey visit)."
      );
      return { ok: false };
    }

    if (!hasDate && !hasTime) {
      Alert.alert(
        "Missing date & time",
        "Please pick both a date and a time for the appointment."
      );
      return { ok: false };
    }

    if (!hasDate) {
      Alert.alert("Missing date", "Please pick a date for the appointment.");
      return { ok: false };
    }

    if (!hasTime) {
      Alert.alert("Missing time", "Please pick a time for the appointment.");
      return { ok: false };
    }

    if (!apptDateTime) {
      Alert.alert(
        "Invalid time",
        "Appointment must be scheduled in the future."
      );
      return { ok: false };
    }

    const now = new Date();
    if (apptDateTime <= now) {
      Alert.alert(
        "Invalid time",
        "Appointment must be scheduled in the future."
      );
      return { ok: false };
    }

    return { ok: true, trimmedTitle };
  };

  const performScheduleAppointment = async (trimmedTitle) => {
    if (apptBusy) return;

    const reqId =
      quote?.request_id || quote?.requestId || request?.id || null;
    if (!reqId) {
      Alert.alert(
        "Cannot schedule appointment",
        "We couldn’t find the related request for this quote."
      );
      return;
    }

    try {
      setApptBusy(true);

      // Use the new RPC that creates appointment AND sends it to messages
      const { data, error } = await supabase.rpc(
        "rpc_send_appointment_message",
        {
          p_request_id: reqId,
          p_quote_id: quote?.id || null,
          p_scheduled_at: apptDateTime.toISOString(),
          p_title: trimmedTitle,
          p_location: parsedDetails.address || null,
        }
      );

      if (error) {
        console.warn("appointment create error", error.message || error);
        Alert.alert(
          "Could not schedule appointment",
          error.message || "Something went wrong, please try again."
        );
        return;
      }

      // Show success message
      Alert.alert(
        "Appointment sent!",
        "The appointment has been sent to messages. The client can accept or decline it in the Messages tab."
      );

      // Reload ALL appointments immediately after creation
      const { data: apptData, error: apptErr } = await supabase
        .from("appointments")
        .select("id, request_id, quote_id, scheduled_at, title, status, location")
        .eq("request_id", reqId)
        .order("scheduled_at", { ascending: true });

      if (!apptErr && apptData) {
        setAppointments(apptData || []);
      }

      setScheduling(false);
      setPickerVisible(false);
    } catch (e) {
      console.warn("appointment create error", e?.message || e);
      Alert.alert(
        "Could not schedule appointment",
        e?.message || "Something went wrong, please try again."
      );
    } finally {
      setApptBusy(false);
    }
  };

  const handleConfirmSchedule = () => {
    if (apptBusy) return;

    const { ok, trimmedTitle } = validateAppointment();
    if (!ok) return;

    const label = trimmedTitle || "Appointment";
    const whenStr = apptDateTime.toLocaleString();

    Alert.alert("Schedule this appointment?", `"${label}"\n\n${whenStr}`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Schedule",
        style: "default",
        onPress: () => performScheduleAppointment(trimmedTitle),
      },
    ]);
  };

  const handleClientConfirmAppointment = async (appointmentId) => {
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

              // Reload ALL appointments
              const reqId = quote?.request_id || quote?.requestId || request?.id || null;
              if (reqId) {
                const { data: apptData, error: apptErr } = await supabase
                  .from("appointments")
                  .select("id, request_id, quote_id, scheduled_at, title, status, location")
                  .eq("request_id", reqId)
                  .order("scheduled_at", { ascending: true });

                if (!apptErr && apptData) {
                  setAppointments(apptData || []);
                }
              }
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

  const handleClientDeclineAppointment = async (appointmentId) => {
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

              // Reload ALL appointments
              const reqId = quote?.request_id || quote?.requestId || request?.id || null;
              if (reqId) {
                const { data: apptData, error: apptErr } = await supabase
                  .from("appointments")
                  .select("id, request_id, quote_id, scheduled_at, title, status, location")
                  .eq("request_id", reqId)
                  .order("scheduled_at", { ascending: true });

                if (!apptErr && apptData) {
                  setAppointments(apptData || []);
                }
              }
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

  // Check if this user requested the reschedule (to show accept/decline buttons to the OTHER party)
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
    const base = rescheduleDate || new Date();
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
        `${displayName || "The client"} will need to confirm the new time.`
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
    const reqId = quote?.request_id || quote?.requestId || request?.id;
    const quoteId = quote?.id;
    if (!reqId && !quoteId) return;

    try {
      let finalAppointments = [];

      const { data: allAppts, error: apptErr } = await supabase.rpc(
        "rpc_trade_list_appointments",
        { p_only_upcoming: false }
      );

      if (!apptErr && allAppts && allAppts.length > 0) {
        const filtered = (Array.isArray(allAppts) ? allAppts : [])
          .filter((a) => a.request_id === reqId || a.quote_id === quoteId);

        finalAppointments = filtered.map((a) => ({
          id: a.id,
          request_id: a.request_id,
          quote_id: a.quote_id,
          scheduled_at: a.scheduled_at,
          title: a.title || "Appointment",
          status: a.status,
          location: a.location,
          reschedule_count: a.reschedule_count,
          reschedule_requested_by: a.reschedule_requested_by,
          proposed_scheduled_at: a.proposed_scheduled_at,
          reschedule_reason: a.reschedule_reason,
          original_scheduled_at: a.original_scheduled_at,
        }));
      } else {
        // Fallback: direct query
        const { data: directAppts } = await supabase
          .from("appointments")
          .select("*")
          .or(`request_id.eq.${reqId},quote_id.eq.${quoteId}`)
          .order("scheduled_at", { ascending: true });

        if (directAppts) {
          finalAppointments = directAppts;
        }
      }

      setAppointments(finalAppointments);
    } catch (e) {
      console.warn("Failed to reload appointments:", e?.message || e);
    }
  };

  // ============ END RESCHEDULE FUNCTIONS ============

  // Open mark complete sheet with pre-filled amount
  const openMarkCompleteSheet = () => {
    setPaymentAmount(String(grandTotal || ""));
    setPaymentMethod("bank_transfer");
    setCompletionNotes("");
    setShowCompleteSheet(true);
  };

  // Close mark complete sheet
  const closeMarkCompleteSheet = () => {
    if (completeBusy) return;
    setShowCompleteSheet(false);
  };

  // Handle mark complete submission
  const handleMarkComplete = async () => {
    if (completeBusy) return;

    try {
      setCompleteBusy(true);

      const amount = parseFloat(paymentAmount) || grandTotal || 0;

      const { data, error } = await supabase.rpc("rpc_trade_mark_complete", {
        p_quote_id: quote?.id,
        p_payment_received: amount,
        p_payment_method: paymentMethod,
        p_notes: completionNotes.trim() || null,
      });

      if (error) {
        console.warn("Mark complete error:", error.message || error);
        Alert.alert(
          "Could not mark complete",
          error.message || "Something went wrong, please try again."
        );
        return;
      }

      // Reload the quote to get updated status
      const row = await fetchQuoteById(quote.id);
      if (row) {
        setQuote(row);
      }

      setShowCompleteSheet(false);

      Alert.alert(
        "Job marked as complete",
        `${displayName} will be notified to confirm the work is done.`
      );
    } catch (e) {
      console.warn("Mark complete error:", e?.message || e);
      Alert.alert(
        "Could not mark complete",
        e?.message || "Something went wrong, please try again."
      );
    } finally {
      setCompleteBusy(false);
    }
  };

  // Handle client confirmation of completion (Step 3 -> Step 4)
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

      // Reload the quote to get updated status
      const row = await fetchQuoteById(quote.id);
      if (row) {
        setQuote(row);
      }

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


  if (loading) {
    return (
      <ThemedView style={[styles.container, { paddingTop: insets.top }]}>
        <QuoteOverviewSkeleton paddingTop={16} />
      </ThemedView>
    );
  }

  if (!quote) {
    return (
      <ThemedView style={styles.container}>
        <Spacer />
        <ThemedText>Quote not found.</ThemedText>
      </ThemedView>
    );
  }

  const appointmentName = appointment?.title || appointment?.notes || "Appointment";
  const locationText =
    parsedDetails.address ||
    (request?.postcode
      ? `Area ${request.postcode}`
      : "Location not provided");

  const niceDate =
    hasDate && apptDateTime
      ? apptDateTime.toLocaleDateString(undefined, {
          year: "numeric",
          month: "short",
          day: "numeric",
        })
      : "Add date";

  const niceTime =
    hasTime && apptDateTime
      ? apptDateTime.toLocaleTimeString(undefined, {
          hour: "2-digit",
          minute: "2-digit",
        })
      : "Add time";

  // Hero card content for scheduling page
  const heroTitle =
    request?.suggested_title ||
    parsedDetails.title ||
    quote?.project_title ||
    "Job";

  // --------------------------------------------------
  // Scheduling PAGE (Airbnb-style)
  // --------------------------------------------------
  if (scheduling) {
    return (
      <ThemedView style={styles.scheduleContainer}>
        {/* Header for scheduling page */}
        <View style={styles.scheduleHeader}>
          <Pressable
            onPress={closeSchedulePage}
            hitSlop={8}
            disabled={apptBusy}
          >
            <Ionicons name="close" size={22} color={iconColor} />
          </Pressable>
          <ThemedText style={styles.scheduleHeaderTitle}>
            Schedule appointment
          </ThemedText>
          <View style={{ width: 22 }} />
        </View>

        <ScrollView
          contentContainerStyle={styles.scheduleScroll}
          showsVerticalScrollIndicator={false}
        >
          {/* Airbnb-style hero card (same info as main hero) */}
          <View style={styles.scheduleHeroCard}>
            {/* Avatar from other user's profile / route params / conversations */}
            {displayAvatarUrl ? (
              <Image
                source={{ uri: displayAvatarUrl }}
                style={styles.scheduleHeroAvatarImg}
              />
            ) : (
              <View style={styles.scheduleHeroAvatarFallback}>
                <ThemedText style={styles.scheduleHeroAvatarInitials}>
                  {avatarInitials}
                </ThemedText>
              </View>
            )}

            {/* Single-line title, allow wrap */}
            <View style={{ flex: 1 }}>
              <ThemedText style={styles.scheduleHeroTitle} numberOfLines={2}>
                {heroTitle}
              </ThemedText>
              {/* Show who this appointment is with (homeowner/client) */}
              <ThemedText
                variant="muted"
                style={{ fontSize: 12, marginTop: 2 }}
              >
                With {displayName}
              </ThemedText>
            </View>

            <ThemedText style={styles.scheduleHeroAmount}>
              {money(grandTotal, quote.currency)}
            </ThemedText>
          </View>

          {/* Appointment name */}
          <View style={styles.scheduleCard}>
            <ThemedText style={styles.apptFieldLabel}>
              Appointment name
            </ThemedText>
            <TextInput
              style={styles.apptInput}
              placeholder="e.g. Bathroom survey visit"
              value={apptTitle}
              onChangeText={setApptTitle}
              editable={!apptBusy}
            />
          </View>

          {/* Details rows: location / date / time */}
          <View style={[styles.scheduleCard, { marginTop: 12 }]}>
            {/* Location row (read-only) */}
            <View style={styles.detailRow}>
              <View style={styles.detailLeft}>
                <ThemedText style={styles.detailLabel}>Location</ThemedText>
                <ThemedText
                  variant="muted"
                  style={styles.detailValue}
                  numberOfLines={2}
                >
                  {locationText}
                </ThemedText>
              </View>
            </View>

            {/* Divider */}
            <View style={styles.detailDivider} />

            {/* Date row */}
            <Pressable
              style={styles.detailRow}
              onPress={handlePressDateRow}
              disabled={apptBusy}
            >
              <View style={styles.detailLeft}>
                <ThemedText style={styles.detailLabel}>Date</ThemedText>
                <ThemedText
                  style={[
                    styles.detailValue,
                    !hasDate && { color: "#9CA3AF" },
                  ]}
                >
                  {niceDate}
                </ThemedText>
              </View>
              <View style={styles.detailPill}>
                <ThemedText style={styles.detailPillText}>
                  {hasDate ? "Change" : "Select"}
                </ThemedText>
              </View>
            </Pressable>

            {/* Divider */}
            <View style={styles.detailDivider} />

            {/* Time row */}
            <Pressable
              style={styles.detailRow}
              onPress={handlePressTimeRow}
              disabled={apptBusy}
            >
              <View style={styles.detailLeft}>
                <ThemedText style={styles.detailLabel}>Time</ThemedText>
                <ThemedText
                  style={[
                    styles.detailValue,
                    !hasTime && { color: "#9CA3AF" },
                  ]}
                >
                  {niceTime}
                </ThemedText>
              </View>
              <View style={styles.detailPill}>
                <ThemedText style={styles.detailPillText}>
                  {hasTime ? "Change" : "Select"}
                </ThemedText>
              </View>
            </Pressable>
          </View>

          <Spacer size={24} />

          {/* Bottom CTA – always clickable unless actually busy */}
          <Pressable
            onPress={handleConfirmSchedule}
            disabled={apptBusy}
            style={[
              styles.apptPrimaryBtnBig,
              { opacity: apptBusy ? 0.7 : 1 },
            ]}
          >
            <ThemedText style={styles.apptPrimaryBtnBigText}>
              {apptBusy ? "Scheduling…" : "Schedule appointment"}
            </ThemedText>
          </Pressable>

          <Spacer size={24} />
        </ScrollView>

        {/* Custom date/time picker */}
        <CustomDateTimePicker
          visible={pickerVisible}
          mode={pickerMode}
          value={pickerDraftDate}
          onConfirm={handlePickerConfirm}
          onCancel={handlePickerCancel}
          minimumDate={new Date()}
        />
      </ThemedView>
    );
  }

  // --------------------------------------------------
  // TRADES QUOTE OVERVIEW (POST-ACCEPTANCE REDESIGN)
  // --------------------------------------------------
  if (userRole === 'trades') {
    return (
      <ThemedView style={styles.container}>
        {/* Header */}
        <View style={[styles.header, { paddingTop: insets.top + 16 }]}>
          <View style={styles.headerRow}>
            <ThemedText style={styles.headerTitle}>Quote #{getQuoteShortId(Array.isArray(params.id) ? params.id[0] : params.id)}</ThemedText>
            <Pressable
              onPress={() => {
                if (fromAppointments) {
                  router.push('/appointments');
                } else if (router.canGoBack?.()) {
                  router.back();
                } else {
                  router.replace("/quotes");
                }
              }}
              hitSlop={10}
              style={styles.backButton}
            >
              <Ionicons name="close" size={28} color="#6B7280" />
            </Pressable>
          </View>
        </View>

        <ScrollView
          contentContainerStyle={styles.scrollContents}
          showsVerticalScrollIndicator={false}
        >
          {/* Hero summary card - Client name, job, location, status, total, issued */}
          <View style={styles.heroCard}>
            <View style={styles.heroTopRow}>
              <View style={{ flex: 1 }}>
                <ThemedText style={styles.heroClientName}>
                  {displayName}
                </ThemedText>
                <ThemedText style={styles.heroJobTitle}>
                  {request?.suggested_title || quote?.project_title || "Quote"}
                </ThemedText>
                {request?.postcode && (
                  <ThemedText style={styles.heroLocation} variant="muted">
                    {request.postcode}
                  </ThemedText>
                )}
              </View>

              {status === "completed" ? (
                <View style={styles.statusChipCompleted}>
                  <Ionicons name="checkmark-done-circle" size={16} color="#10B981" />
                  <ThemedText style={styles.statusChipCompletedText}>
                    Completed
                  </ThemedText>
                </View>
              ) : status === "issue_reported" ? (
                <View style={styles.statusChipIssue}>
                  <Ionicons name="alert-circle" size={16} color="#EF4444" />
                  <ThemedText style={styles.statusChipIssueText}>
                    Issue
                  </ThemedText>
                </View>
              ) : status === "awaiting_completion" ? (
                <View style={styles.statusChipAwaitingCompletion}>
                  <Ionicons name="hourglass" size={16} color="#F59E0B" />
                  <ThemedText style={styles.statusChipAwaitingText}>
                    Awaiting
                  </ThemedText>
                </View>
              ) : isAccepted && (
                <View style={styles.statusChipAccepted}>
                  <Ionicons name="checkmark-circle" size={16} color="#16A34A" />
                  <ThemedText style={styles.statusChipAcceptedText}>
                    Accepted
                  </ThemedText>
                </View>
              )}
            </View>

            <Spacer size={16} />

            {/* Total and Issued date row */}
            <View style={styles.heroInfoGrid}>
              <View style={styles.heroInfoItem}>
                <ThemedText style={styles.heroInfoLabel}>Total quote</ThemedText>
                <ThemedText style={styles.heroInfoValue}>
                  £{formatNumber(grandTotal)}
                </ThemedText>
                <ThemedText style={styles.heroInfoSub}>
                  {includesVat ? "Includes VAT" : "No VAT added"}
                </ThemedText>
              </View>
              {issuedAt && (
                <View style={[styles.heroInfoItem, { alignItems: "flex-end" }]}>
                  <ThemedText style={styles.heroInfoLabel}>Issued</ThemedText>
                  <ThemedText style={styles.heroInfoValue}>
                    {new Date(issuedAt).toLocaleDateString('en-GB', {
                      day: '2-digit',
                      month: '2-digit',
                      year: 'numeric',
                    })}
                  </ThemedText>
                </View>
              )}
            </View>
          </View>

          {/* Awaiting Completion Card - shown after hero, before sections */}
          {status === "awaiting_completion" && (
            <View style={styles.awaitingCompletionCard}>
              <Ionicons name="hourglass-outline" size={28} color="#F59E0B" />
              <Spacer size={8} />
              <ThemedText style={styles.awaitingTitle}>
                Awaiting confirmation
              </ThemedText>
              <ThemedText style={styles.awaitingMeta}>
                You marked this job complete on{" "}
                {quote?.marked_complete_at
                  ? new Date(quote.marked_complete_at).toLocaleDateString(undefined, {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })
                  : "recently"}
              </ThemedText>
              <Spacer size={2} />
              <ThemedText style={styles.awaitingSubtext}>
                Waiting for {displayName ? displayName.split(" ")[0] : "the client"} to confirm.
              </ThemedText>
              <Spacer size={16} />
              <Pressable
                style={styles.messageClientBtn}
                onPress={() => {
                  router.push({
                    pathname: "/(dashboard)/messages/conversation",
                    params: {
                      recipientId: quote?.client_id,
                      name: displayName || "Client",
                    },
                  });
                }}
              >
                <ThemedText style={styles.messageClientBtnText}>
                  Message {displayName ? displayName.split(" ")[0] : "Client"}
                </ThemedText>
              </Pressable>
            </View>
          )}

          {/* Job Complete Card - shown after hero for completed jobs */}
          {status === "completed" && (
            <View style={styles.completedCard}>
              <View style={styles.completedCheckCircle}>
                <Ionicons name="checkmark" size={32} color="#10B981" />
              </View>
              <Spacer size={12} />
              <ThemedText style={styles.completedTitle}>Job complete</ThemedText>
              {quote?.completion_confirmed_at && (
                <ThemedText style={styles.completedMeta}>
                  {displayName ? displayName.split(" ")[0] : "Client"} confirmed{" "}
                  {new Date(quote.completion_confirmed_at).toLocaleDateString(undefined, {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                  })}
                </ThemedText>
              )}
            </View>
          )}

          {/* Review Prompt Card - Only show if no review left yet */}
          {status === "completed" && (!tradeReview || !tradeReview.rating) && (
            <View style={styles.reviewPromptCard}>
              {/* Client Avatar + Name */}
              <View style={styles.reviewTradeRow}>
                <View style={styles.reviewTradeAvatarPlaceholder}>
                  <ThemedText style={styles.reviewTradeAvatarText}>
                    {getInitials(displayName || "Client")}
                  </ThemedText>
                </View>
                <ThemedText style={styles.reviewTradeName}>{displayName || "Client"}</ThemedText>
              </View>
              <Spacer size={16} />
              <ThemedText style={styles.reviewPromptTitle}>
                How was working with {displayName ? displayName.split(" ")[0] : "the client"}?
              </ThemedText>
              <ThemedText style={styles.reviewPromptSubtitle}>
                Your review helps build trust in the community.
              </ThemedText>
              <Spacer size={16} />
              <Pressable
                style={styles.leaveReviewBtn}
                onPress={() => {
                  router.push({
                    pathname: "/(dashboard)/quotes/leave-review",
                    params: {
                      quoteId: quote?.id,
                      revieweeName: displayName || "Client",
                      revieweeType: "client",
                      jobTitle: request?.suggested_title || quote?.project_title || "",
                    },
                  });
                }}
              >
                <ThemedText style={styles.leaveReviewBtnText}>Leave a review</ThemedText>
              </Pressable>
            </View>
          )}

          {/* Trade's Review Display - Show if trade has left a review */}
          {status === "completed" && tradeReview && tradeReview.rating && (
            <View style={styles.reviewDisplayCard}>
              <ThemedText style={styles.reviewDisplayTitle}>Your review</ThemedText>
              <Spacer size={12} />
              {/* Star rating */}
              <View style={styles.reviewStarsRow}>
                {[1, 2, 3, 4, 5].map((star) => (
                  <Ionicons
                    key={star}
                    name={star <= tradeReview.rating ? "star" : "star-outline"}
                    size={24}
                    color="#F59E0B"
                  />
                ))}
              </View>
              {tradeReview.content && (
                <>
                  <Spacer size={12} />
                  <ThemedText style={styles.reviewDisplayContent}>
                    "{tradeReview.content}"
                  </ThemedText>
                </>
              )}
              {/* Review Photos */}
              {tradeReview.photos && tradeReview.photos.length > 0 && (
                <>
                  <Spacer size={12} />
                  <View style={styles.reviewPhotosRow}>
                    {tradeReview.photos.map((photoUrl, idx) => (
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
                {tradeReview.created_at
                  ? `Posted ${new Date(tradeReview.created_at).toLocaleDateString(undefined, {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })}`
                  : ""}
              </ThemedText>
            </View>
          )}

          {/* Section Divider */}
          <View style={styles.sectionDivider} />

          {/* Quote breakdown section - Collapsible */}
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
                    {new Date(issuedAt).toLocaleDateString(undefined, {
                      weekday: 'short',
                      year: 'numeric',
                      month: 'short',
                      day: 'numeric'
                    })}
                  </ThemedText>
                </View>
              </View>
            )}

            {quote.valid_until && (
              <View style={styles.requestDetailRow}>
                <Ionicons name="time-outline" size={18} color="#6B7280" />
                <View style={styles.requestDetailContent}>
                  <ThemedText style={styles.requestDetailLabel}>Valid until</ThemedText>
                  <ThemedText style={styles.requestDetailValue}>
                    {new Date(quote.valid_until).toLocaleDateString(undefined, {
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
            {items.length > 0 ? (
              <>
                <View style={styles.divider} />
                <ThemedText style={styles.breakdownSectionLabel}>Line items</ThemedText>
                <Spacer size={12} />

                {items.map((item, i) => {
                  const qty = Number(item?.qty ?? 0);
                  const price = Number(item?.unit_price ?? 0);
                  const line = Number.isFinite(qty * price) ? formatNumber(qty * price) : "0.00";
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
                          Qty: {qty} • £{formatNumber(price)} each
                        </ThemedText>
                      </View>
                      <ThemedText style={styles.lineItemTotal}>
                        £{line}
                      </ThemedText>
                    </View>
                  );
                })}
              </>
            ) : (
              <>
                <View style={styles.divider} />
                <ThemedText style={styles.breakdownSectionLabel}>Line items</ThemedText>
                <Spacer size={12} />
                <ThemedText variant="muted">No items added to this quote.</ThemedText>
              </>
            )}

            {/* Totals */}
            <View style={[styles.divider, { marginTop: 12 }]} />
            <ThemedText style={styles.breakdownSectionLabel}>Summary</ThemedText>
            <Spacer size={12} />

            {!!quote.subtotal && (
              <View style={styles.totalRow}>
                <ThemedText style={styles.totalLabel}>
                  {includesVat ? "Subtotal (excl. VAT)" : "Subtotal"}
                </ThemedText>
                <ThemedText style={styles.totalValue}>
                  £{formatNumber(quote.subtotal)}
                </ThemedText>
              </View>
            )}

            {!!quote.tax_total && (
              <View style={styles.totalRow}>
                <ThemedText style={styles.totalLabel}>VAT</ThemedText>
                <ThemedText style={styles.totalValue}>
                  £{formatNumber(quote.tax_total)}
                </ThemedText>
              </View>
            )}

            <View style={[styles.totalRow, styles.totalRowFinal]}>
              <ThemedText style={styles.totalLabelFinal}>Total</ThemedText>
              <ThemedText style={styles.totalValueFinal}>
                £{formatNumber(grandTotal)}
              </ThemedText>
            </View>
            {includesVat && (
              <ThemedText style={styles.totalNote}>Includes VAT</ThemedText>
            )}
          </View>
          )}

          {/* Section Divider */}
          <View style={styles.sectionDivider} />

          {/* Client request - Collapsible (collapsed by default) */}
          {request && (
            <>
              <Pressable
                style={styles.collapsibleHeader}
                onPress={() => setShowClientRequest(!showClientRequest)}
              >
                <ThemedText style={styles.sectionHeaderText}>Client request</ThemedText>
                <Ionicons
                  name={showClientRequest ? "chevron-up" : "chevron-down"}
                  size={20}
                  color="#6B7280"
                />
              </Pressable>

              {showClientRequest && (
                <View style={styles.card}>
                  {/* Category */}
                  {parsedDetails.category && (
                    <View style={styles.requestDetailRow}>
                      <Ionicons name="grid-outline" size={18} color="#6B7280" />
                      <View style={styles.requestDetailContent}>
                        <ThemedText style={styles.requestDetailLabel}>Category</ThemedText>
                        <ThemedText style={styles.requestDetailValue}>{parsedDetails.category}</ThemedText>
                      </View>
                    </View>
                  )}

                  {/* Service */}
                  {parsedDetails.main && (
                    <View style={styles.requestDetailRow}>
                      <Ionicons name="construct-outline" size={18} color="#6B7280" />
                      <View style={styles.requestDetailContent}>
                        <ThemedText style={styles.requestDetailLabel}>Service</ThemedText>
                        <ThemedText style={styles.requestDetailValue}>{parsedDetails.main}</ThemedText>
                      </View>
                    </View>
                  )}

                  {/* Location */}
                  {request?.postcode && (
                    <View style={styles.requestDetailRow}>
                      <Ionicons name="location-outline" size={18} color="#6B7280" />
                      <View style={styles.requestDetailContent}>
                        <ThemedText style={styles.requestDetailLabel}>Area</ThemedText>
                        <ThemedText style={styles.requestDetailValue}>{request.postcode}</ThemedText>
                      </View>
                    </View>
                  )}

                  {/* Property */}
                  {(request.property_types?.name || parsedDetails.property) && (
                    <View style={styles.requestDetailRow}>
                      <Ionicons name="home-outline" size={18} color="#6B7280" />
                      <View style={styles.requestDetailContent}>
                        <ThemedText style={styles.requestDetailLabel}>Property</ThemedText>
                        <ThemedText style={styles.requestDetailValue}>
                          {request.property_types?.name || parsedDetails.property}
                        </ThemedText>
                      </View>
                    </View>
                  )}

                  {/* Timing */}
                  {(request.timing_options?.name || parsedDetails.timing) && (
                    <View style={styles.requestDetailRow}>
                      <Ionicons name="time-outline" size={18} color={request.timing_options?.is_emergency ? "#EF4444" : "#6B7280"} />
                      <View style={styles.requestDetailContent}>
                        <ThemedText style={styles.requestDetailLabel}>Timing</ThemedText>
                        <ThemedText style={[styles.requestDetailValue, request.timing_options?.is_emergency && { color: "#EF4444" }]}>
                          {request.timing_options?.name || parsedDetails.timing}
                        </ThemedText>
                      </View>
                    </View>
                  )}

                  {/* Budget */}
                  {(request.budget_band || parsedDetails.budget) && (
                    <View style={styles.requestDetailRow}>
                      <Ionicons name="cash-outline" size={18} color="#6B7280" />
                      <View style={styles.requestDetailContent}>
                        <ThemedText style={styles.requestDetailLabel}>Budget</ThemedText>
                        <ThemedText style={styles.requestDetailValue}>
                          {request.budget_band || parsedDetails.budget}
                        </ThemedText>
                      </View>
                    </View>
                  )}

                  {/* Description */}
                  {parsedDetails.description && (
                    <>
                      <View style={styles.divider} />
                      <View style={styles.requestDetailRow}>
                        <Ionicons name="document-text-outline" size={18} color="#6B7280" />
                        <View style={styles.requestDetailContent}>
                          <ThemedText style={styles.requestDetailLabel}>Details</ThemedText>
                          <ThemedText style={styles.requestDetailValue}>{parsedDetails.description}</ThemedText>
                        </View>
                      </View>
                    </>
                  )}

                  {/* Photos */}
                  {hasAttachments && (
                    <>
                      <View style={styles.divider} />
                      <View style={[styles.requestDetailRow, { marginBottom: 8 }]}>
                        <Ionicons name="images-outline" size={18} color="#6B7280" />
                        <View style={styles.requestDetailContent}>
                          <ThemedText style={styles.requestDetailLabel}>
                            Photos ({attachmentsCount})
                          </ThemedText>
                        </View>
                      </View>
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
                            />
                          </Pressable>
                        ))}
                      </View>
                    </>
                  )}
                </View>
              )}
            </>
          )}

          {/* Section Divider - only show if appointments section will be visible */}
          {(appointments.length > 0 || isAccepted) && <View style={styles.sectionDivider} />}

          {/* Appointments Section - with + Add button */}
          {(appointments.length > 0 || isAccepted) && (
            <View>
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
              {/* Add button - only show when not in completion states */}
              {status !== "awaiting_completion" && status !== "completed" && (
              <View style={{ flexDirection: "row", justifyContent: "flex-end", marginBottom: 8 }}>
                <Pressable
                  style={styles.addAppointmentTextBtn}
                  onPress={openSchedulePage}
                  hitSlop={8}
                >
                  <Ionicons name="add" size={18} color={PRIMARY} />
                  <ThemedText style={styles.addAppointmentTextBtnLabel}>Add</ThemedText>
                </Pressable>
              </View>
              )}

              {/* Upcoming Appointments - each as its own card */}
              {upcomingAppointments.length > 0 && (
                <View>
                  <ThemedText style={styles.appointmentSubheaderStandalone}>Upcoming</ThemedText>
                  {upcomingAppointments.map((appt, idx) => {
                    const scheduledDate = new Date(appt.scheduled_at);
                    const isConfirmed = appt.status === "confirmed";
                    const isProposed = appt.status === "proposed";
                    const isReschedulePending = appt.status === "reschedule_pending";
                    const rescheduleInfo = canRescheduleAppointment(appt);
                    const iRequestedReschedule = isRescheduleRequestedByMe(appt);

                    // Determine badge color and text
                    let badgeBg = "#FEF3C7";
                    let badgeColor = "#F59E0B";
                    let badgeIcon = "hourglass";
                    let badgeText = "Pending";

                    if (isReschedulePending) {
                      badgeBg = "#FEF3C7";
                      badgeColor = "#F59E0B";
                      badgeIcon = "refresh";
                      badgeText = "Reschedule";
                    } else if (isConfirmed) {
                      badgeBg = "#D1FAE5";
                      badgeColor = "#10B981";
                      badgeIcon = "checkmark-circle";
                      badgeText = "Confirmed";
                    } else if (isProposed) {
                      badgeText = "Awaiting confirmation";
                    }

                    return (
                      <View key={appt.id ?? `upcoming-${idx}`} style={styles.appointmentSingleCard}>
                        <Ionicons
                          name="calendar"
                          size={20}
                          color="#6B7280"
                        />
                        <View style={{ flex: 1 }}>
                          <View style={styles.tradeAppointmentTitleRow}>
                            <ThemedText style={styles.tradeAppointmentTitle}>
                              {appt.title || "Appointment"}
                            </ThemedText>
                            <View style={[
                              styles.tradeAppointmentBadge,
                              { backgroundColor: badgeBg }
                            ]}>
                              <Ionicons
                                name={badgeIcon}
                                size={12}
                                color={badgeColor}
                              />
                              <ThemedText style={[
                                styles.tradeAppointmentBadgeText,
                                { color: badgeColor }
                              ]}>
                                {badgeText}
                              </ThemedText>
                            </View>
                          </View>

                          {/* Show reschedule pending info */}
                          {isReschedulePending && (
                            <>
                              <ThemedText style={styles.rescheduleWasTime}>
                                Was: {new Date(appt.original_scheduled_at || appt.scheduled_at).toLocaleDateString(undefined, {
                                  weekday: "short",
                                  day: "numeric",
                                  month: "short",
                                })}, {new Date(appt.original_scheduled_at || appt.scheduled_at).toLocaleTimeString(undefined, {
                                  hour: "2-digit",
                                  minute: "2-digit",
                                })}
                              </ThemedText>
                              <ThemedText style={styles.rescheduleNewTime}>
                                New: {new Date(appt.proposed_scheduled_at).toLocaleDateString(undefined, {
                                  weekday: "short",
                                  day: "numeric",
                                  month: "short",
                                })}, {new Date(appt.proposed_scheduled_at).toLocaleTimeString(undefined, {
                                  hour: "2-digit",
                                  minute: "2-digit",
                                })}
                              </ThemedText>
                              {appt.reschedule_reason && (
                                <ThemedText style={styles.rescheduleReason}>
                                  "{appt.reschedule_reason}"
                                </ThemedText>
                              )}
                            </>
                          )}

                          {/* Normal time display when not reschedule pending */}
                          {!isReschedulePending && (
                            <ThemedText style={styles.tradeAppointmentDateTime}>
                              {scheduledDate.toLocaleDateString(undefined, {
                                weekday: "short",
                                day: "numeric",
                                month: "short",
                              })}, {scheduledDate.toLocaleTimeString(undefined, {
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </ThemedText>
                          )}

                          {appt.location && !isReschedulePending && (
                            <ThemedText style={styles.tradeAppointmentLocation}>
                              {appt.location}
                            </ThemedText>
                          )}

                          {/* Reschedule actions */}
                          {isReschedulePending && !iRequestedReschedule && (
                            <View style={styles.rescheduleActions}>
                              <Pressable
                                style={styles.rescheduleDeclineBtn}
                                onPress={() => handleDeclineReschedule(appt)}
                                disabled={apptBusy}
                              >
                                <ThemedText style={styles.rescheduleDeclineBtnText}>Decline</ThemedText>
                              </Pressable>
                              <Pressable
                                style={styles.rescheduleAcceptBtn}
                                onPress={() => handleAcceptReschedule(appt)}
                                disabled={apptBusy}
                              >
                                <ThemedText style={styles.rescheduleAcceptBtnText}>Accept</ThemedText>
                              </Pressable>
                            </View>
                          )}

                          {/* Show "waiting for response" if I requested reschedule */}
                          {isReschedulePending && iRequestedReschedule && (
                            <ThemedText style={styles.rescheduleWaitingText}>
                              Waiting for {displayName?.split(" ")[0] || "client"} to respond
                            </ThemedText>
                          )}

                          {/* Reschedule link - show if allowed */}
                          {!isReschedulePending && rescheduleInfo.allowed && (
                            <Pressable onPress={() => openRescheduleSheet(appt)} hitSlop={8}>
                              <ThemedText style={styles.rescheduleLink}>Reschedule</ThemedText>
                            </Pressable>
                          )}

                          {/* Show reason why can't reschedule */}
                          {!isReschedulePending && !rescheduleInfo.allowed && rescheduleInfo.reason && (
                            <ThemedText style={styles.rescheduleDisabledText}>
                              {rescheduleInfo.reason}
                            </ThemedText>
                          )}
                        </View>
                      </View>
                    );
                  })}
                </View>
              )}

              {/* No appointments state */}
              {upcomingAppointments.length === 0 && pastAppointments.length === 0 && (
                <View style={styles.card}>
                  <View style={styles.emptyAppointments}>
                    <Ionicons name="calendar-outline" size={32} color="#D1D5DB" />
                    <ThemedText style={styles.emptyAppointmentsText}>No appointments yet</ThemedText>
                    <Pressable style={styles.scheduleVisitBtn} onPress={openSchedulePage}>
                      <ThemedText style={styles.scheduleVisitBtnText}>Schedule a visit</ThemedText>
                    </Pressable>
                  </View>
                </View>
              )}

              {/* Past Appointments - Collapsible header, each appointment as own card */}
              {pastAppointments.length > 0 && (
                <View>
                  <Pressable
                    style={styles.pastAppointmentsHeader}
                    onPress={() => setShowPastAppointments(!showPastAppointments)}
                  >
                    <ThemedText style={styles.appointmentSubheaderStandalone}>Past</ThemedText>
                    <Ionicons
                      name={showPastAppointments ? "chevron-up" : "chevron-down"}
                      size={20}
                      color="#6B7280"
                    />
                  </Pressable>

                  {showPastAppointments && (
                    <View>
                      {pastAppointments.map((appt, idx) => {
                        const scheduledDate = new Date(appt.scheduled_at);
                        return (
                          <View key={appt.id ?? `past-${idx}`} style={styles.appointmentSingleCardPast}>
                            <Ionicons name="calendar" size={20} color="#9CA3AF" />
                            <View style={{ flex: 1 }}>
                              <View style={styles.tradeAppointmentTitleRow}>
                                <ThemedText style={[styles.tradeAppointmentTitle, { color: "#6B7280" }]}>
                                  {appt.title || "Appointment"}
                                </ThemedText>
                                <Ionicons name="checkmark" size={18} color="#9CA3AF" />
                              </View>
                              <ThemedText style={[styles.tradeAppointmentDateTime, { color: "#9CA3AF" }]}>
                                {scheduledDate.toLocaleDateString(undefined, {
                                  weekday: "short",
                                  day: "numeric",
                                  month: "short",
                                })}, {scheduledDate.toLocaleTimeString(undefined, {
                                  hour: "2-digit",
                                  minute: "2-digit",
                                })}
                              </ThemedText>
                              <ThemedText style={styles.tradeAppointmentCompleted}>
                                Completed
                              </ThemedText>
                            </View>
                          </View>
                        );
                      })}
                    </View>
                  )}
                </View>
              )}
              </>
              )}
            </View>
          )}

          <Spacer size={20} />

          {/* Issue Reported - Trade View */}
          {status === "issue_reported" && (
            <View style={styles.issueReportedCard}>
              <Ionicons name="warning" size={32} color="#EF4444" />
              <Spacer size={12} />
              <ThemedText style={styles.issueReportedTitle}>
                Issue reported
              </ThemedText>
              <Spacer size={8} />
              <ThemedText style={styles.issueReportedMeta}>
                {displayName ? displayName.split(" ")[0] : "Client"} reported a problem with this job
                {quote?.issue_reported_at
                  ? ` on ${new Date(quote.issue_reported_at).toLocaleDateString(undefined, {
                      day: "numeric",
                      month: "short",
                    })}`
                  : ""}
              </ThemedText>

              {/* Issue Details Box */}
              <View style={styles.issueDetailsBox}>
                <ThemedText style={styles.issueDetailsLabel}>REASON</ThemedText>
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
            </View>
          )}

          {/* What would you like to do? - for issue_reported status */}
          {status === "issue_reported" && (
            <View style={styles.issueActionsContainer}>
              <ThemedText style={styles.issueActionsTitle}>
                What would you like to do?
              </ThemedText>
              <Spacer size={12} />
              <Pressable
                style={styles.resolveWithClientBtn}
                onPress={() => {
                  const reqId = quote?.request_id || quote?.requestId || request?.id;
                  if (reqId) {
                    router.push({
                      pathname: "/(dashboard)/messages/[id]",
                      params: {
                        id: String(reqId),
                        name: displayName || "",
                        quoteId: quote?.id ? String(quote.id) : "",
                        returnTo: `/quotes/${quote?.id}`,
                      },
                    });
                  }
                }}
              >
                <ThemedText style={styles.resolveWithClientBtnText}>
                  Resolve with {displayName ? displayName.split(" ")[0] : "client"}
                </ThemedText>
              </Pressable>
              <Pressable
                style={styles.issueResolvedBtn}
                onPress={() => setShowIssueResolvedSheet(true)}
              >
                <ThemedText style={styles.issueResolvedBtnText}>
                  Issue resolved
                </ThemedText>
              </Pressable>
            </View>
          )}

          {/* Action Buttons - Only show for accepted status (not awaiting/completed/issue_reported) */}
          {status !== "awaiting_completion" && status !== "completed" && status !== "issue_reported" && (
            <View style={styles.actionButtonsContainer}>
              {isAccepted && (
                <Pressable
                  style={styles.markCompleteBtn}
                  onPress={openMarkCompleteSheet}
                >
                  <ThemedText style={styles.markCompleteBtnText}>Mark as complete</ThemedText>
                </Pressable>
              )}

              {/* Message client button */}
              <Pressable
                style={styles.messageClientBtn}
                onPress={() => {
                  const reqId = quote?.request_id || quote?.requestId || request?.id;
                  if (reqId) {
                    router.push({
                      pathname: "/(dashboard)/messages/[id]",
                      params: {
                        id: String(reqId),
                        name: displayName || "",
                        quoteId: quote?.id ? String(quote.id) : "",
                        returnTo: `/quotes/${quote?.id}`,
                      },
                    });
                  }
                }}
              >
                <ThemedText style={styles.messageClientBtnText}>
                  Message {displayName ? displayName.split(" ")[0] : "client"}
                </ThemedText>
              </Pressable>
            </View>
          )}

          <Spacer size={40} />
        </ScrollView>

        {/* Mark Complete Bottom Sheet */}
        <Modal
          visible={showCompleteSheet}
          animationType="slide"
          transparent
          onRequestClose={closeMarkCompleteSheet}
        >
          <View style={styles.sheetModalContainer}>
            {/* Backdrop - tap to close */}
            <Pressable style={styles.sheetBackdropArea} onPress={closeMarkCompleteSheet} />

            {/* Sheet content */}
            <KeyboardAvoidingView
              behavior={Platform.OS === "ios" ? "padding" : undefined}
              style={styles.sheetKeyboardView}
            >
              <View style={[styles.sheetContent, { paddingBottom: insets.bottom + 20 }]}>
                {/* Handle */}
                <View style={styles.sheetHandle} />

                <ScrollView
                  contentContainerStyle={styles.sheetScrollContent}
                  keyboardShouldPersistTaps="handled"
                  showsVerticalScrollIndicator={false}
                >
                  <ThemedText style={styles.sheetTitle}>Confirm completion</ThemedText>
                  <ThemedText style={styles.sheetSubtitle}>
                    Let {displayName ? displayName.split(" ")[0] : "the client"} know the work is done.
                    They'll confirm before the job closes.
                  </ThemedText>

                  <Spacer size={20} />

                  <ThemedText style={styles.sheetSectionLabel}>Payment received</ThemedText>

                  <Spacer size={12} />

                  {/* Amount */}
                  <ThemedText style={styles.sheetFieldLabel}>Amount</ThemedText>
                  <View style={styles.sheetAmountInputContainer}>
                    <ThemedText style={styles.sheetCurrencySymbol}>£</ThemedText>
                    <TextInput
                      style={styles.sheetAmountInput}
                      value={paymentAmount}
                      onChangeText={setPaymentAmount}
                      keyboardType="decimal-pad"
                      placeholder="0.00"
                      placeholderTextColor="#9CA3AF"
                      editable={!completeBusy}
                    />
                  </View>

                  <Spacer size={16} />

                  {/* Payment Method - Dropdown */}
                  <ThemedText style={styles.sheetFieldLabel}>Method</ThemedText>
                  <Pressable
                    style={styles.sheetDropdown}
                    onPress={() => setShowPaymentMethodPicker(true)}
                    disabled={completeBusy}
                  >
                    <ThemedText style={styles.sheetDropdownText}>
                      {selectedPaymentMethodLabel}
                    </ThemedText>
                    <Ionicons name="chevron-down" size={20} color="#6B7280" />
                  </Pressable>

                  <Spacer size={16} />

                  {/* Notes */}
                  <ThemedText style={styles.sheetFieldLabel}>Final notes (optional)</ThemedText>
                  <TextInput
                    style={styles.sheetNotesInput}
                    value={completionNotes}
                    onChangeText={setCompletionNotes}
                    placeholder="Any details about the work..."
                    placeholderTextColor="#9CA3AF"
                    multiline
                    numberOfLines={3}
                    textAlignVertical="top"
                    editable={!completeBusy}
                  />

                  <Spacer size={24} />

                  {/* Confirm button */}
                  <Pressable
                    style={[
                      styles.sheetConfirmBtn,
                      { opacity: completeBusy ? 0.7 : 1 },
                    ]}
                    onPress={handleMarkComplete}
                    disabled={completeBusy}
                  >
                    <ThemedText style={styles.sheetConfirmBtnText}>
                      {completeBusy ? "Confirming..." : "Mark as complete"}
                    </ThemedText>
                  </Pressable>

                  {/* Cancel */}
                  <Pressable
                    style={styles.sheetCancelBtn}
                    onPress={closeMarkCompleteSheet}
                    disabled={completeBusy}
                  >
                    <ThemedText style={styles.sheetCancelBtnText}>Cancel</ThemedText>
                  </Pressable>
                </ScrollView>
              </View>
            </KeyboardAvoidingView>
          </View>

          {/* Payment Method Picker Modal */}
          <Modal
            visible={showPaymentMethodPicker}
            animationType="fade"
            transparent
            onRequestClose={() => setShowPaymentMethodPicker(false)}
          >
            <Pressable
              style={styles.pickerBackdrop}
              onPress={() => setShowPaymentMethodPicker(false)}
            >
              <View style={styles.pickerContainer}>
                <View style={styles.pickerHeader}>
                  <ThemedText style={styles.pickerTitle}>Select payment method</ThemedText>
                  <Pressable onPress={() => setShowPaymentMethodPicker(false)} hitSlop={8}>
                    <Ionicons name="close" size={24} color="#6B7280" />
                  </Pressable>
                </View>
                {PAYMENT_METHODS.map((method, idx) => (
                  <Pressable
                    key={method.id}
                    style={[
                      styles.pickerOption,
                      idx < PAYMENT_METHODS.length - 1 && styles.pickerOptionBorder,
                    ]}
                    onPress={() => {
                      setPaymentMethod(method.id);
                      setShowPaymentMethodPicker(false);
                    }}
                  >
                    <ThemedText style={[
                      styles.pickerOptionText,
                      paymentMethod === method.id && styles.pickerOptionTextSelected,
                    ]}>
                      {method.label}
                    </ThemedText>
                    {paymentMethod === method.id && (
                      <Ionicons name="checkmark" size={20} color={PRIMARY} />
                    )}
                  </Pressable>
                ))}
              </View>
            </Pressable>
          </Modal>
        </Modal>

        {/* Issue Resolved Bottom Sheet - Trade marks issue as resolved */}
        <Modal
          visible={showIssueResolvedSheet}
          animationType="slide"
          transparent
          onRequestClose={() => setShowIssueResolvedSheet(false)}
        >
          <View style={styles.sheetModalContainer}>
            {/* Backdrop - tap to close */}
            <Pressable
              style={styles.sheetBackdropArea}
              onPress={() => setShowIssueResolvedSheet(false)}
            />

            {/* Sheet content */}
            <KeyboardAvoidingView
              behavior={Platform.OS === "ios" ? "padding" : undefined}
              style={styles.sheetKeyboardView}
            >
              <View style={[styles.sheetContent, { paddingBottom: insets.bottom + 20 }]}>
                {/* Handle */}
                <View style={styles.sheetHandle} />

                <ScrollView
                  contentContainerStyle={styles.sheetScrollContent}
                  keyboardShouldPersistTaps="handled"
                  showsVerticalScrollIndicator={false}
                >
                  <ThemedText style={styles.sheetTitle}>Confirm issue resolved</ThemedText>
                  <ThemedText style={styles.sheetSubtitle}>
                    Let {displayName ? displayName.split(" ")[0] : "the client"} know you've addressed the issue. They'll be asked to confirm.
                  </ThemedText>

                  <Spacer size={24} />

                  <ThemedText style={styles.sheetFieldLabel}>What did you do?</ThemedText>
                  <TextInput
                    style={styles.sheetNotesInput}
                    value={issueResolution}
                    onChangeText={setIssueResolution}
                    placeholder="e.g., Finished grouting in the corner as requested..."
                    placeholderTextColor="#9CA3AF"
                    multiline
                    numberOfLines={4}
                    textAlignVertical="top"
                    editable={!issueResolveBusy}
                  />

                  <Spacer size={24} />

                  {/* Submit button */}
                  <Pressable
                    style={[
                      styles.sheetConfirmBtn,
                      { opacity: issueResolveBusy || !issueResolution.trim() ? 0.7 : 1 },
                    ]}
                    onPress={async () => {
                      if (!issueResolution.trim()) return;
                      setIssueResolveBusy(true);
                      try {
                        const { error } = await supabase.rpc("rpc_trade_resolve_issue", {
                          p_quote_id: quote.id,
                          p_resolution: issueResolution.trim(),
                        });

                        if (error) throw error;

                        Alert.alert(
                          "Resolution Sent",
                          "The client has been notified and can now confirm the job is complete."
                        );
                        setShowIssueResolvedSheet(false);
                        setIssueResolution("");
                        // Refresh quote data
                        fetchQuote();
                      } catch (err) {
                        Alert.alert("Error", err.message || "Failed to submit resolution");
                      } finally {
                        setIssueResolveBusy(false);
                      }
                    }}
                    disabled={issueResolveBusy || !issueResolution.trim()}
                  >
                    <ThemedText style={styles.sheetConfirmBtnText}>
                      {issueResolveBusy ? "Submitting..." : "Submit"}
                    </ThemedText>
                  </Pressable>

                  {/* Cancel */}
                  <Pressable
                    style={styles.sheetCancelBtn}
                    onPress={() => {
                      setShowIssueResolvedSheet(false);
                      setIssueResolution("");
                    }}
                    disabled={issueResolveBusy}
                  >
                    <ThemedText style={styles.sheetCancelBtnText}>Cancel</ThemedText>
                  </Pressable>
                </ScrollView>
              </View>
            </KeyboardAvoidingView>
          </View>
        </Modal>

        {/* Reschedule Bottom Sheet */}
        <Modal
          visible={showRescheduleSheet}
          animationType="slide"
          transparent
          onRequestClose={closeRescheduleSheet}
        >
          <View style={styles.sheetModalContainer}>
            {/* Backdrop - tap to close */}
            <Pressable
              style={styles.sheetBackdropArea}
              onPress={closeRescheduleSheet}
            />

            {/* Sheet content */}
            <KeyboardAvoidingView
              behavior={Platform.OS === "ios" ? "padding" : undefined}
              style={styles.sheetKeyboardView}
            >
              <View style={[styles.sheetContent, { paddingBottom: insets.bottom + 20 }]}>
                {/* Handle */}
                <View style={styles.sheetHandle} />

                <ScrollView
                  contentContainerStyle={styles.sheetScrollContent}
                  keyboardShouldPersistTaps="handled"
                  showsVerticalScrollIndicator={false}
                >
                  <ThemedText style={styles.sheetTitle}>Reschedule appointment</ThemedText>

                  {rescheduleAppointment && (
                    <ThemedText style={styles.rescheduleCurrentTime}>
                      Current: {new Date(rescheduleAppointment.scheduled_at).toLocaleDateString(undefined, {
                        weekday: "short",
                        day: "numeric",
                        month: "short",
                      })}, {new Date(rescheduleAppointment.scheduled_at).toLocaleTimeString(undefined, {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </ThemedText>
                  )}

                  <Spacer size={24} />

                  {/* New date picker */}
                  <ThemedText style={styles.sheetFieldLabel}>New date</ThemedText>
                  <Pressable
                    style={styles.reschedulePickerRow}
                    onPress={handleRescheduleDatePress}
                  >
                    <ThemedText style={[
                      styles.reschedulePickerText,
                      !rescheduleDate && { color: "#9CA3AF" }
                    ]}>
                      {rescheduleDate
                        ? rescheduleDate.toLocaleDateString(undefined, {
                            weekday: "short",
                            day: "numeric",
                            month: "short",
                            year: "numeric",
                          })
                        : "Select date"}
                    </ThemedText>
                    <Ionicons name="calendar-outline" size={20} color="#6B7280" />
                  </Pressable>

                  <Spacer size={16} />

                  {/* New time picker */}
                  <ThemedText style={styles.sheetFieldLabel}>New time</ThemedText>
                  <Pressable
                    style={styles.reschedulePickerRow}
                    onPress={handleRescheduleTimePress}
                  >
                    <ThemedText style={[
                      styles.reschedulePickerText,
                      !rescheduleTime && { color: "#9CA3AF" }
                    ]}>
                      {rescheduleTime
                        ? rescheduleTime.toLocaleTimeString(undefined, {
                            hour: "2-digit",
                            minute: "2-digit",
                          })
                        : "Select time"}
                    </ThemedText>
                    <Ionicons name="time-outline" size={20} color="#6B7280" />
                  </Pressable>

                  <Spacer size={16} />

                  {/* Reason (optional) */}
                  <ThemedText style={styles.sheetFieldLabel}>Reason (optional)</ThemedText>
                  <TextInput
                    style={styles.rescheduleReasonInput}
                    value={rescheduleReason}
                    onChangeText={setRescheduleReason}
                    placeholder="e.g., Schedule conflict"
                    placeholderTextColor="#9CA3AF"
                    editable={!rescheduleBusy}
                  />

                  <Spacer size={24} />

                  {/* Submit button */}
                  <Pressable
                    style={[
                      styles.sheetConfirmBtn,
                      { opacity: rescheduleBusy || !rescheduleDate || !rescheduleTime ? 0.7 : 1 },
                    ]}
                    onPress={handleSubmitReschedule}
                    disabled={rescheduleBusy || !rescheduleDate || !rescheduleTime}
                  >
                    <ThemedText style={styles.sheetConfirmBtnText}>
                      {rescheduleBusy ? "Requesting..." : "Request reschedule"}
                    </ThemedText>
                  </Pressable>

                  {/* Cancel */}
                  <Pressable
                    style={styles.sheetCancelBtn}
                    onPress={closeRescheduleSheet}
                    disabled={rescheduleBusy}
                  >
                    <ThemedText style={styles.sheetCancelBtnText}>Cancel</ThemedText>
                  </Pressable>

                  <ThemedText style={styles.rescheduleHelperText}>
                    {displayName?.split(" ")[0] || "The client"} will need to confirm the new time.
                  </ThemedText>
                </ScrollView>
              </View>
            </KeyboardAvoidingView>
          </View>

          {/* Date/Time Picker for reschedule */}
          <CustomDateTimePicker
            visible={reschedulePickerVisible}
            mode={reschedulePickerMode}
            value={reschedulePickerMode === "date" ? (rescheduleDate || new Date()) : (rescheduleTime || new Date())}
            onConfirm={handleReschedulePickerConfirm}
            onCancel={() => setReschedulePickerVisible(false)}
            minimumDate={new Date()}
          />
        </Modal>

        {/* Image viewer */}
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
      </ThemedView>
    );
  }

  // --------------------------------------------------
  // CLIENT QUOTE DETAILS PAGE
  // --------------------------------------------------
  return (
    <ThemedView style={styles.container}>
      {/* Header - Profile-style like client version */}
      <View style={[styles.header, { paddingTop: insets.top + 16 }]}>
        <View style={styles.headerRow}>
          <ThemedText style={styles.headerTitle}>Quote #{getQuoteShortId(Array.isArray(params.id) ? params.id[0] : params.id)}</ThemedText>
          <Pressable
            onPress={() => {
              if (fromAppointments) {
                router.push('/appointments');
              } else if (router.canGoBack?.()) {
                router.back();
              } else {
                router.replace("/quotes");
              }
            }}
            hitSlop={10}
            style={styles.backButton}
          >
            <Ionicons name="close" size={28} color="#6B7280" />
          </Pressable>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContents}
        showsVerticalScrollIndicator
      >
        {/* Hero summary card */}
        <View style={styles.heroCard}>
          <View style={styles.heroTopRow}>
            <View style={{ flex: 1 }}>
              <ThemedText style={styles.heroTitle}>
                {tradeBusiness || "Tradesperson"}
              </ThemedText>
              <ThemedText style={styles.heroProject} variant="muted">
                {request?.suggested_title || quote?.project_title || "Project"}
              </ThemedText>
            </View>

            {/* Status chip - handles accepted, awaiting_completion, and completed */}
            {status === "completed" ? (
              <View style={styles.statusChipCompleted}>
                <Ionicons name="checkmark-done-circle" size={16} color="#10B981" />
                <ThemedText style={styles.statusChipCompletedText}>
                  Completed
                </ThemedText>
              </View>
            ) : status === "awaiting_completion" ? (
              <View style={styles.statusChipAwaitingCompletion}>
                <Ionicons name="hourglass" size={16} color="#F59E0B" />
                <ThemedText style={styles.statusChipAwaitingText}>
                  Awaiting confirmation
                </ThemedText>
              </View>
            ) : isAccepted ? (
              <View style={styles.statusChipAccepted}>
                <Ionicons name="checkmark-circle" size={16} color="#16A34A" />
                <ThemedText style={styles.statusChipAcceptedText}>
                  Accepted
                </ThemedText>
              </View>
            ) : null}
          </View>

          <Spacer size={12} />

          <View style={styles.heroAmountRow}>
            <View>
              <ThemedText style={styles.heroAmountLabel}>Total quote</ThemedText>
              <ThemedText style={styles.heroAmount}>
                {quote.currency || "GBP"} {formatNumber(grandTotal)}
              </ThemedText>
              <ThemedText variant="muted" style={styles.heroSub}>
                {includesVat ? "Includes VAT" : "No VAT added"}
              </ThemedText>
            </View>
            {issuedAt && (
              <View style={{ alignItems: "flex-end" }}>
                <ThemedText style={styles.heroMetaLabel}>Issued</ThemedText>
                <ThemedText style={styles.heroMetaValue}>
                  {new Date(issuedAt).toLocaleDateString()}
                </ThemedText>
              </View>
            )}
          </View>
        </View>

      {/* Hero-linked appointment callout (like your green block) - only show for clients */}
      {isAccepted && (
        <View style={styles.heroNoteCard}>
          <View style={styles.heroNoteRow}>
            <View style={styles.heroNoteIconWrap}>
              <Ionicons
                name={hasExistingAppointment ? "calendar-outline" : "checkmark-circle"}
                size={20}
                color={hasExistingAppointment ? "#0F766E" : "#166534"}
              />
            </View>
            <View style={{ flex: 1 }}>
              <ThemedText style={styles.heroNoteTitle}>
                {hasExistingAppointment
                  ? `${tradeBusiness || 'The tradesperson'} proposed an appointment`
                  : "Quote accepted"}
              </ThemedText>
              <ThemedText style={styles.heroNoteText} variant="muted">
                {hasExistingAppointment
                  ? `Survey visit on ${appointmentDateLabel}${appointment?.location ? ` at ${appointment.location}` : ''}`
                  : `${tradeBusiness || 'The tradesperson'} will contact you to schedule a survey visit.`}
              </ThemedText>
            </View>
          </View>

          {/* Client: Show Accept/Decline buttons if appointment is proposed */}
          {hasExistingAppointment && appointment?.status === 'proposed' && (
            <View style={styles.heroNoteActions}>
              <Pressable
                onPress={() => handleClientDeclineAppointment(appointment.id)}
                style={styles.heroDeclineBtn}
                hitSlop={6}
              >
                <Ionicons name="close-circle-outline" size={18} color="#B42318" />
                <ThemedText style={styles.heroDeclineBtnText}>
                  Decline
                </ThemedText>
              </Pressable>
              <Pressable
                onPress={() => handleClientConfirmAppointment(appointment.id)}
                style={styles.heroConfirmBtn}
                hitSlop={6}
              >
                <Ionicons name="checkmark-circle-outline" size={18} color="#FFFFFF" />
                <ThemedText style={styles.heroConfirmBtnText}>
                  Accept
                </ThemedText>
              </Pressable>
            </View>
          )}

          {/* Client: Show confirmed status if already confirmed */}
          {hasExistingAppointment && appointment?.status === 'confirmed' && (
            <View style={styles.heroNoteConfirmed}>
              <Ionicons name="checkmark-circle" size={18} color="#16A34A" />
              <ThemedText style={styles.heroNoteConfirmedText}>
                You confirmed this appointment
              </ThemedText>
            </View>
          )}
        </View>
      )}

      {/* Appointments Section - matching trade view UI */}
      {isAccepted && userRole === 'client' && (
        <View style={styles.appointmentsSection}>
          <View style={styles.sectionHeaderRow}>
            <ThemedText style={styles.sectionHeaderText}>
              Appointments
            </ThemedText>
          </View>

          {/* Upcoming appointments - each as its own card */}
          {upcomingAppointments.length > 0 && (
            <View>
              <ThemedText style={styles.appointmentSubheaderStandalone}>Upcoming</ThemedText>
              {upcomingAppointments.map((appt, idx) => {
                const scheduledDate = new Date(appt.scheduled_at);
                const isConfirmed = appt.status === "confirmed";
                const isProposed = appt.status === "proposed";

                return (
                  <View key={appt.id ?? `client-upcoming-${idx}`}>
                    <View style={styles.appointmentSingleCard}>
                      <Ionicons
                        name="calendar"
                        size={20}
                        color="#6B7280"
                      />
                      <View style={{ flex: 1 }}>
                        <View style={styles.tradeAppointmentTitleRow}>
                          <ThemedText style={styles.tradeAppointmentTitle}>
                            {appt.title || "Appointment"}
                          </ThemedText>
                          <View style={[
                            styles.tradeAppointmentBadge,
                            { backgroundColor: isConfirmed ? "#D1FAE5" : "#FEF3C7" }
                          ]}>
                            <Ionicons
                              name={isConfirmed ? "checkmark-circle" : "hourglass"}
                              size={12}
                              color={isConfirmed ? "#10B981" : "#F59E0B"}
                            />
                            <ThemedText style={[
                              styles.tradeAppointmentBadgeText,
                              { color: isConfirmed ? "#10B981" : "#F59E0B" }
                            ]}>
                              {isConfirmed ? "Confirmed" : "Awaiting confirmation"}
                            </ThemedText>
                          </View>
                        </View>
                        <ThemedText style={styles.tradeAppointmentDateTime}>
                          {scheduledDate.toLocaleDateString(undefined, {
                            weekday: "short",
                            day: "numeric",
                            month: "short",
                          })}, {scheduledDate.toLocaleTimeString(undefined, {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </ThemedText>
                        {appt.location && (
                          <ThemedText style={styles.tradeAppointmentLocation}>
                            {appt.location}
                          </ThemedText>
                        )}

                        {/* Client: Show Accept/Decline buttons for proposed appointments */}
                        {isProposed && (
                          <View style={styles.clientAppointmentActions}>
                            <Pressable
                              onPress={() => handleClientDeclineAppointment(appt.id)}
                              style={styles.heroDeclineBtn}
                              hitSlop={6}
                            >
                              <Ionicons name="close-circle-outline" size={18} color="#B42318" />
                              <ThemedText style={styles.heroDeclineBtnText}>Decline</ThemedText>
                            </Pressable>
                            <Pressable
                              onPress={() => handleClientConfirmAppointment(appt.id)}
                              style={styles.heroConfirmBtn}
                              hitSlop={6}
                            >
                              <Ionicons name="checkmark-circle-outline" size={18} color="#FFFFFF" />
                              <ThemedText style={styles.heroConfirmBtnText}>Accept</ThemedText>
                            </Pressable>
                          </View>
                        )}
                      </View>
                    </View>
                  </View>
                );
              })}
            </View>
          )}

          {/* No appointments state */}
          {appointments.length === 0 && (
            <View style={styles.card}>
              <View style={styles.emptyAppointments}>
                <Ionicons name="calendar-outline" size={32} color="#D1D5DB" />
                <ThemedText style={styles.emptyAppointmentsText}>No appointments yet</ThemedText>
                <ThemedText style={styles.emptyAppointmentsSubtext}>
                  The tradesperson will schedule a visit soon
                </ThemedText>
              </View>
            </View>
          )}

          {/* Past Appointments - Collapsible */}
          {pastAppointments.length > 0 && (
            <View>
              <Pressable
                style={styles.pastAppointmentsHeader}
                onPress={() => setShowPastAppointments(!showPastAppointments)}
              >
                <ThemedText style={styles.appointmentSubheaderStandalone}>Past</ThemedText>
                <View style={styles.collapsibleToggle}>
                  <ThemedText style={styles.collapsibleToggleText}>
                    {showPastAppointments ? "Hide" : "Show"}
                  </ThemedText>
                  <Ionicons
                    name={showPastAppointments ? "chevron-up" : "chevron-down"}
                    size={16}
                    color="#6B7280"
                  />
                </View>
              </Pressable>

              {showPastAppointments && (
                <View>
                  {pastAppointments.map((appt, idx) => {
                    const scheduledDate = new Date(appt.scheduled_at);
                    return (
                      <View key={appt.id ?? `client-past-${idx}`} style={styles.appointmentSingleCardPast}>
                        <Ionicons name="calendar" size={20} color="#9CA3AF" />
                        <View style={{ flex: 1 }}>
                          <View style={styles.tradeAppointmentTitleRow}>
                            <ThemedText style={[styles.tradeAppointmentTitle, { color: "#6B7280" }]}>
                              {appt.title || "Appointment"}
                            </ThemedText>
                            <Ionicons name="checkmark" size={18} color="#9CA3AF" />
                          </View>
                          <ThemedText style={[styles.tradeAppointmentDateTime, { color: "#9CA3AF" }]}>
                            {scheduledDate.toLocaleDateString(undefined, {
                              weekday: "short",
                              day: "numeric",
                              month: "short",
                            })}, {scheduledDate.toLocaleTimeString(undefined, {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </ThemedText>
                          <ThemedText style={styles.tradeAppointmentCompleted}>
                            Completed
                          </ThemedText>
                        </View>
                      </View>
                    );
                  })}
                </View>
              )}
            </View>
          )}
        </View>
      )}

        {/* Quote request - styled like client version */}
        {request && (
          <>
            <View style={styles.sectionHeaderRow}>
              <ThemedText style={styles.sectionHeaderText}>
                Client request
              </ThemedText>
            </View>

            <View style={styles.card}>
              {/* Title */}
              <ThemedText style={styles.requestTitle}>
                {request.suggested_title || parsedDetails.title || "Request"}
              </ThemedText>

              {/* Details Grid with icons */}
              {request.created_at && (
                <View style={styles.requestDetailRow}>
                  <Ionicons name="calendar-outline" size={18} color="#6B7280" />
                  <View style={styles.requestDetailContent}>
                    <ThemedText style={styles.requestDetailLabel}>Submitted</ThemedText>
                    <ThemedText style={styles.requestDetailValue}>
                      {new Date(request.created_at).toLocaleDateString(undefined, {
                        weekday: 'short',
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric'
                      })}
                    </ThemedText>
                  </View>
                </View>
              )}

              {!!request.postcode && (
                <View style={styles.requestDetailRow}>
                  <Ionicons name="location-outline" size={18} color="#6B7280" />
                  <View style={styles.requestDetailContent}>
                    <ThemedText style={styles.requestDetailLabel}>Area</ThemedText>
                    <ThemedText style={styles.requestDetailValue}>{request.postcode}</ThemedText>
                  </View>
                </View>
              )}

              {!!parsedDetails.description && (
                <View style={styles.requestDetailRow}>
                  <Ionicons name="document-text-outline" size={18} color="#6B7280" />
                  <View style={styles.requestDetailContent}>
                    <ThemedText style={styles.requestDetailLabel}>Details</ThemedText>
                    <ThemedText style={styles.requestDetailValue}>{parsedDetails.description}</ThemedText>
                  </View>
                </View>
              )}

              {!!(request.property_types?.name || parsedDetails.property) && (
                <View style={styles.requestDetailRow}>
                  <Ionicons name="home-outline" size={18} color="#6B7280" />
                  <View style={styles.requestDetailContent}>
                    <ThemedText style={styles.requestDetailLabel}>Property</ThemedText>
                    <ThemedText style={styles.requestDetailValue}>
                      {request.property_types?.name || parsedDetails.property}
                    </ThemedText>
                  </View>
                </View>
              )}

              {!!(request.budget_band || parsedDetails.budget) && (
                <View style={styles.requestDetailRow}>
                  <Ionicons name="cash-outline" size={18} color="#6B7280" />
                  <View style={styles.requestDetailContent}>
                    <ThemedText style={styles.requestDetailLabel}>Budget</ThemedText>
                    <ThemedText style={styles.requestDetailValue}>
                      {request.budget_band || parsedDetails.budget}
                    </ThemedText>
                  </View>
                </View>
              )}

              {!!(request.timing_options?.name || parsedDetails.timing) && (
                <View style={styles.requestDetailRow}>
                  <Ionicons name="time-outline" size={18} color={request.timing_options?.is_emergency ? "#EF4444" : "#6B7280"} />
                  <View style={styles.requestDetailContent}>
                    <ThemedText style={styles.requestDetailLabel}>Timing</ThemedText>
                    <ThemedText style={[styles.requestDetailValue, request.timing_options?.is_emergency && { color: "#EF4444" }]}>
                      {request.timing_options?.name || parsedDetails.timing}
                    </ThemedText>
                  </View>
                </View>
              )}

              {hasAttachments && (
                <>
                  <View style={styles.divider} />

                  <View style={[styles.requestDetailRow, { marginBottom: 8 }]}>
                    <Ionicons name="images-outline" size={18} color="#6B7280" />
                    <View style={styles.requestDetailContent}>
                      <ThemedText style={styles.requestDetailLabel}>
                        Photos ({attachmentsCount})
                      </ThemedText>
                    </View>
                  </View>
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
                      />
                    </Pressable>
                  ))}
                </View>
              )}
            </View>
          </>
        )}

        {/* Quote breakdown - styled like client version */}
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
                  {new Date(issuedAt).toLocaleDateString(undefined, {
                    weekday: 'short',
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric'
                  })}
                </ThemedText>
              </View>
            </View>
          )}

          {quote.valid_until && (
            <View style={styles.requestDetailRow}>
              <Ionicons name="time-outline" size={18} color="#6B7280" />
              <View style={styles.requestDetailContent}>
                <ThemedText style={styles.requestDetailLabel}>Valid until</ThemedText>
                <ThemedText style={styles.requestDetailValue}>
                  {new Date(quote.valid_until).toLocaleDateString(undefined, {
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
              <Spacer size={12} />

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
                        Qty: {qty} • {quote.currency || "GBP"} {formatNumber(price)} each
                      </ThemedText>
                    </View>
                    <ThemedText style={styles.lineItemTotal}>
                      {quote.currency || "GBP"} {line}
                    </ThemedText>
                  </View>
                );
              })}
            </>
          )}

          {items.length === 0 && (
            <>
              <View style={styles.divider} />
              <ThemedText style={styles.breakdownSectionLabel}>Line items</ThemedText>
              <Spacer size={12} />
              <ThemedText variant="muted">No items added to this quote.</ThemedText>
            </>
          )}

          {/* Totals */}
          <View style={[styles.divider, { marginTop: 12 }]} />
          <ThemedText style={styles.breakdownSectionLabel}>Summary</ThemedText>
          <Spacer size={12} />

          {!!quote.subtotal && (
            <View style={styles.totalRow}>
              <ThemedText style={styles.totalLabel}>
                {includesVat ? "Subtotal (excl. VAT)" : "Subtotal"}
              </ThemedText>
              <ThemedText style={styles.totalValue}>
                {quote.currency || "GBP"} {formatNumber(quote.subtotal)}
              </ThemedText>
            </View>
          )}

          {!!quote.tax_total && (
            <View style={styles.totalRow}>
              <ThemedText style={styles.totalLabel}>VAT</ThemedText>
              <ThemedText style={styles.totalValue}>
                {quote.currency || "GBP"} {formatNumber(quote.tax_total)}
              </ThemedText>
            </View>
          )}

          <View style={[styles.totalRow, styles.totalRowFinal]}>
            <ThemedText style={styles.totalLabelFinal}>Total</ThemedText>
            <ThemedText style={styles.totalValueFinal}>
              {quote.currency || "GBP"} {formatNumber(grandTotal)}
            </ThemedText>
          </View>
          {includesVat && (
            <ThemedText style={styles.totalNote}>Includes VAT</ThemedText>
          )}
        </View>

        {/* Appointments - styled like client version */}
        {appointment && (
          <>
            <View style={styles.sectionHeaderRow}>
              <ThemedText style={styles.sectionHeaderText}>Appointments</ThemedText>
            </View>

            <View style={styles.card}>
              <View style={styles.appointmentCardHeader}>
                <View style={{ flex: 1 }}>
                  <View style={styles.appointmentCardTitleRow}>
                    <ThemedText style={styles.appointmentCardTitle}>
                      {appointmentName}
                    </ThemedText>
                    <View style={[
                      styles.appointmentBadge,
                      { backgroundColor: appointment.status === "confirmed" ? "#D1FAE5" : "#FEF3C7" }
                    ]}>
                      <Ionicons
                        name={appointment.status === "confirmed" ? "checkmark-circle" : "hourglass"}
                        size={14}
                        color={appointment.status === "confirmed" ? "#10B981" : "#F59E0B"}
                      />
                      <ThemedText style={[
                        styles.appointmentBadgeText,
                        { color: appointment.status === "confirmed" ? "#10B981" : "#F59E0B" }
                      ]}>
                        {appointment.status === "confirmed" ? "Confirmed" :
                         appointment.status === "proposed" ? "Pending" :
                         String(appointment.status).charAt(0).toUpperCase() + String(appointment.status).slice(1)}
                      </ThemedText>
                    </View>
                  </View>
                  {!!appointment.scheduled_at && (
                    <View style={styles.appointmentCardMetaRow}>
                      <Ionicons name="calendar-outline" size={14} color="#6B7280" />
                      <ThemedText style={styles.appointmentCardMeta}>
                        {new Date(appointment.scheduled_at).toLocaleDateString(undefined, {
                          weekday: "short",
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                        })}
                        {" at "}
                        {new Date(appointment.scheduled_at).toLocaleTimeString(undefined, {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </ThemedText>
                    </View>
                  )}
                </View>
              </View>

              {/* Expandable content */}
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

                <ThemedText variant="muted" style={styles.visitCopy}>
                  {appointment.status === "proposed"
                    ? (userRole === 'client'
                        ? "Please respond to this appointment request using the buttons above."
                        : "Awaiting client confirmation."
                      )
                    : (appointment.status === "confirmed"
                        ? (userRole === 'client'
                            ? "You confirmed this appointment."
                            : "The client confirmed this appointment."
                          )
                        : `Status: ${
                            String(appointment.status).charAt(0).toUpperCase() +
                            String(appointment.status).slice(1).toLowerCase()
                          }.`
                      )}
                </ThemedText>
              </View>
            </View>
          </>
        )}

        {/* Comments */}
        {quote.comments ? (
          <>
            <View style={styles.sectionHeaderRow}>
              <ThemedText style={styles.sectionHeaderText}>
                Comments
              </ThemedText>
            </View>
            <View style={styles.card}>
              <View style={styles.requestDetailRow}>
                <Ionicons name="chatbubble-outline" size={18} color="#6B7280" />
                <View style={styles.requestDetailContent}>
                  <ThemedText style={styles.requestDetailValue}>{quote.comments}</ThemedText>
                </View>
              </View>
            </View>
          </>
        ) : null}


        {/* Client completion flow UI */}
        {status === "awaiting_completion" && (
          <View style={styles.clientCompletionCard}>
            <View style={styles.awaitingProgressRow}>
              <View style={styles.awaitingProgressDot} />
              <View style={styles.awaitingProgressLine} />
              <View style={[styles.awaitingProgressDot, styles.awaitingProgressDotEmpty]} />
            </View>
            <Spacer size={16} />
            <ThemedText style={styles.clientCompletionTitle}>
              {tradeBusiness || "The tradesperson"} has marked this job as complete
            </ThemedText>
            <ThemedText style={styles.clientCompletionSubtitle}>
              Please confirm if the work has been completed to your satisfaction.
            </ThemedText>
            <Spacer size={20} />
            <Pressable
              style={styles.confirmCompleteBtn}
              onPress={handleClientConfirmCompletion}
              disabled={clientConfirmBusy}
            >
              {clientConfirmBusy ? (
                <ThemedText style={styles.confirmCompleteBtnText}>Confirming...</ThemedText>
              ) : (
                <>
                  <Ionicons name="checkmark-circle" size={20} color="#FFFFFF" />
                  <ThemedText style={styles.confirmCompleteBtnText}>Confirm complete</ThemedText>
                </>
              )}
            </Pressable>
            <Pressable
              style={styles.reportIssueBtn}
              onPress={() => {
                const reqId = quote?.request_id || quote?.requestId || request?.id;
                if (reqId) {
                  router.push({
                    pathname: "/(dashboard)/messages/[id]",
                    params: {
                      id: String(reqId),
                      name: tradeBusiness || "",
                      quoteId: quote?.id ? String(quote.id) : "",
                      returnTo: `/quotes/${quote?.id}`,
                    },
                  });
                }
              }}
            >
              <ThemedText style={styles.reportIssueBtnText}>Report an issue</ThemedText>
            </Pressable>
          </View>
        )}

        {status === "completed" && (
          <View style={styles.clientCompletedCard}>
            <View style={styles.completedCheckCircle}>
              <Ionicons name="checkmark" size={32} color="#10B981" />
            </View>
            <Spacer size={12} />
            <ThemedText style={styles.completedTitle}>Job complete!</ThemedText>
            <ThemedText style={styles.clientCompletedSubtitle}>
              You confirmed the work on{" "}
              {quote?.completion_confirmed_at
                ? new Date(quote.completion_confirmed_at).toLocaleDateString(undefined, {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                  })
                : "recently"}
            </ThemedText>
            <Spacer size={24} />
            <View style={styles.reviewPromptCard}>
              <ThemedText style={styles.reviewPromptTitle}>
                How was your experience with {tradeBusiness || "the tradesperson"}?
              </ThemedText>
              <ThemedText style={styles.reviewPromptSubtitle}>
                Your review helps other homeowners find great tradespeople.
              </ThemedText>
            </View>
            <Spacer size={16} />
            <Pressable
              style={styles.leaveReviewBtn}
              onPress={() => {
                Alert.alert(
                  "Leave a review",
                  "Review feature coming soon!"
                );
              }}
            >
              <Ionicons name="star" size={18} color="#FFFFFF" />
              <ThemedText style={styles.leaveReviewBtnText}>Leave a review</ThemedText>
            </Pressable>
            <Pressable
              style={styles.maybeLaterBtn}
              onPress={() => {
                // Just dismiss
              }}
            >
              <ThemedText style={styles.maybeLaterBtnText}>Maybe later</ThemedText>
            </Pressable>
          </View>
        )}

        <Spacer size={20} />
      </ScrollView>

      {/* Image viewer with zoom, swipe and drag-to-dismiss */}
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
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  // main quote details container
  container: {
    flex: 1,
    alignItems: "stretch",
    backgroundColor: "#FFFFFF",
  },

  // separate container for scheduling page
  scheduleContainer: {
    flex: 1,
    alignItems: "stretch",
    backgroundColor: "#FFFFFF",
    paddingTop: Platform.OS === "ios" ? 60 : 20,
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

  scrollContents: { paddingBottom: 40, paddingHorizontal: 20, paddingTop: 8 },

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
  heroTitle: {
    fontSize: 18,
    fontWeight: "600",
  },
  heroProject: {
    marginTop: 2,
    fontSize: 13,
  },
  // New styles for trades view - client name prominent
  heroClientName: {
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
  heroLocation: {
    marginTop: 2,
    fontSize: 14,
    color: "#6B7280",
  },

  statusChipAccepted: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: "rgba(22,163,74,0.08)",
  },
  statusChipAcceptedText: {
    marginLeft: 4,
    fontSize: 13,
    fontWeight: "600",
    color: "#166534",
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

  // hero-linked appointment callout
  heroNoteCard: {
    marginBottom: 10,
    padding: 12,
    borderRadius: 16,
    backgroundColor: "#ECFDF3",
    borderWidth: 1,
    borderColor: "rgba(22,163,74,0.18)",
  },
  heroNoteRow: {
    flexDirection: "row",
    alignItems: "flex-start",
  },
  heroNoteIconWrap: {
    marginRight: 10,
    marginTop: 2,
  },
  heroNoteTitle: {
    fontSize: 14,
    fontWeight: "600",
    marginBottom: 2,
  },
  heroNoteText: {
    fontSize: 13,
  },
  heroNoteBtn: {
    marginTop: 8,
    alignSelf: "flex-start",
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: "#166534",
  },
  heroNoteBtnText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#FFFFFF",
  },
  heroNoteActions: {
    flexDirection: "row",
    gap: 10,
    marginTop: 12,
  },
  heroDeclineBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    borderRadius: 999,
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: "#FEF2F2",
    borderWidth: 1,
    borderColor: "#FCA5A5",
  },
  heroDeclineBtnText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#B42318",
  },
  heroConfirmBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    borderRadius: 999,
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: "#16A34A",
  },
  heroConfirmBtnText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#FFFFFF",
  },
  heroNoteConfirmed: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 10,
    paddingVertical: 6,
    paddingHorizontal: 10,
    backgroundColor: "rgba(22,163,74,0.08)",
    borderRadius: 999,
    alignSelf: "flex-start",
  },
  heroNoteConfirmedText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#166534",
  },

  // Section headers (Airbnb-style)
  sectionHeaderRow: {
    marginTop: 16,
    marginBottom: 8,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  sectionHeaderText: {
    fontSize: 20,
    fontWeight: "700",
    color: "#111827",
  },
  addAppointmentBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 999,
    backgroundColor: "#F3F4F6",
  },
  addAppointmentBtnText: {
    fontSize: 14,
    fontWeight: "600",
    color: PRIMARY,
  },
  addAppointmentTextBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    paddingVertical: 4,
    paddingHorizontal: 4,
  },
  addAppointmentTextBtnLabel: {
    fontSize: 15,
    fontWeight: "600",
    color: PRIMARY,
  },

  // Appointments list styles
  emptyAppointments: {
    alignItems: "center",
    paddingVertical: 24,
    gap: 8,
  },
  emptyAppointmentsText: {
    fontSize: 14,
    color: "#9CA3AF",
  },
  emptyAppointmentsSubtext: {
    fontSize: 13,
    color: "#9CA3AF",
  },
  appointmentsSection: {
    marginBottom: 8,
  },
  clientAppointmentActions: {
    flexDirection: "row",
    gap: 10,
    marginTop: 12,
  },
  scheduleVisitBtn: {
    marginTop: 8,
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 999,
    backgroundColor: PRIMARY,
  },
  scheduleVisitBtnText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#FFFFFF",
  },
  appointmentListItem: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    paddingVertical: 8,
  },
  appointmentListIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: "#F3F4F6",
    alignItems: "center",
    justifyContent: "center",
  },
  appointmentListTitle: {
    fontSize: 15,
    fontWeight: "600",
    color: "#111827",
    marginBottom: 4,
  },
  appointmentListDateTime: {
    fontSize: 14,
    color: "#374151",
  },
  appointmentListLocation: {
    fontSize: 13,
    color: "#6B7280",
    marginTop: 2,
  },
  appointmentListBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  appointmentListBadgeText: {
    fontSize: 12,
    fontWeight: "600",
  },
  appointmentListActions: {
    flexDirection: "row",
    gap: 10,
    marginTop: 8,
    marginLeft: 48,
    marginBottom: 8,
  },
  appointmentListDivider: {
    height: 1,
    backgroundColor: "#E5E7EB",
    marginVertical: 12,
  },

  // Card style (matching client version)
  card: {
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    backgroundColor: "#FFFFFF",
  },

  // Request summary (NEW STYLES)
  requestTitle: {
    fontWeight: "700",
    fontSize: 18,
    color: "#111827",
    marginBottom: 8,
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

  // Divider
  divider: {
    marginTop: 10,
    marginBottom: 8,
    height: StyleSheet.hairlineWidth,
    backgroundColor: "rgba(148,163,184,0.4)",
  },

  // OLD - can be removed eventually
  block: {
    marginTop: 14,
    marginHorizontal: 20,
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    backgroundColor: "#fff",
    borderColor: "rgba(0,0,0,0.08)",
  },
  reqTitle: {
    fontWeight: "600",
    fontSize: 15,
  },
  reqMeta: {
    fontSize: 13,
    marginTop: 2,
  },
  reqDivider: {
    marginTop: 10,
    marginBottom: 8,
    height: StyleSheet.hairlineWidth,
    backgroundColor: "rgba(148,163,184,0.4)",
  },
  reqPhotosHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 4,
  },
  reqPhotosTitle: {
    fontWeight: "700",
  },
  reqPhotosMeta: {
    marginLeft: 6,
    opacity: 0.7,
    fontSize: 13,
  },

  // Thumbnails
  gridWrap: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  thumbCell: {
    width: CELL,
    height: CELL,
    borderRadius: 10,
    overflow: "hidden",
    backgroundColor: "#eee",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(0,0,0,0.1)",
  },
  thumbImg: { width: "100%", height: "100%" },

  row: { flexDirection: "row", alignItems: "flex-start" },
  tableHead: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingBottom: 6,
    marginBottom: 4,
  },
  tableRow: {
    paddingVertical: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "rgba(127,127,127,0.3)",
  },

  cellName: { flex: 1.6, paddingRight: 8 },
  cellQty: { flex: 0.5, textAlign: "right" },
  cellPrice: { flex: 0.9, textAlign: "right" },
  cellTotal: { flex: 0.9, textAlign: "right" },
  headText: { fontWeight: "700" },

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

  // Appointments / site visit styles (NEW - matching client version)
  appointmentCardHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    padding: 0,
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

  // Appointment badge
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

  // Appointment card content (expandable)
  appointmentCardContent: {
    paddingTop: 16,
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

  // OLD visit styles - can be removed eventually
  visitTitle: {
    fontWeight: "600",
    fontSize: 15,
    marginBottom: 4,
  },
  visitCopy: {
    fontSize: 13,
    marginBottom: 8,
  },
  visitDate: {
    fontSize: 14,
    fontWeight: "600",
    marginTop: 2,
  },
  visitHint: {
    fontSize: 11,
    marginTop: 6,
    opacity: 0.7,
  },

  // Purple primary button in the card
  scheduleBtn: {
    borderRadius: 999,
    paddingHorizontal: 18,
    paddingVertical: 10,
    backgroundColor: PRIMARY,
    marginTop: 6,
  },
  scheduleBtnText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#FFFFFF",
  },

  // Scheduling page header
  scheduleHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 20,
  },
  scheduleHeaderTitle: {
    fontSize: 18,
    fontWeight: "600",
  },
  scheduleScroll: {
    paddingHorizontal: 16,
    paddingBottom: 24,
  },

  // Airbnb-style hero
  scheduleHeroCard: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    borderRadius: 16,
    backgroundColor: "#FFFFFF",
    marginBottom: 16,
    shadowColor: "#0F172A",
    shadowOpacity: 0.06,
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 10,
    elevation: 2,
  },
  // circular avatar (replaces grey stub)
  scheduleHeroAvatarImg: {
    width: 52,
    height: 52,
    borderRadius: 26,
    marginRight: 12,
  },
  scheduleHeroAvatarFallback: {
    width: 52,
    height: 52,
    borderRadius: 26,
    marginRight: 12,
    backgroundColor: "#E5E7EB",
    alignItems: "center",
    justifyContent: "center",
  },
  scheduleHeroAvatarInitials: {
    fontSize: 18,
    fontWeight: "600",
    color: "#4B5563",
  },
  scheduleHeroTitle: {
    fontSize: 15,
    fontWeight: "600",
  },
  scheduleHeroAmount: {
    marginLeft: 8,
    fontSize: 14,
    fontWeight: "600",
  },

  // Shared scheduling cards
  scheduleCard: {
    borderRadius: 16,
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: "rgba(148,163,184,0.4)",
  },

  // Appointment inputs
  apptFieldLabel: {
    fontSize: 13,
    fontWeight: "500",
    marginTop: 4,
    marginBottom: 4,
  },
  apptInput: {
    borderWidth: 1,
    borderColor: "rgba(148,163,184,0.9)",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 14,
  },

  // Detail rows (location/date/time)
  detailRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 10,
  },
  detailLeft: {
    flex: 1,
    paddingRight: 12,
  },
  detailLabel: {
    fontSize: 13,
    fontWeight: "500",
    marginBottom: 2,
  },
  detailValue: {
    fontSize: 13,
    color: "#111827",
  },
  detailDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: "rgba(148,163,184,0.5)",
  },
  detailPill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: "#F3F4F6",
  },
  detailPillText: {
    fontSize: 12,
    fontWeight: "500",
    color: "#374151",
  },

  // Big bottom CTA
  apptPrimaryBtnBig: {
    borderRadius: 999,
    paddingVertical: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: PRIMARY,
  },
  apptPrimaryBtnBigText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#FFFFFF",
  },

  // Picker overlay
  pickerOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "flex-end",
    alignItems: "stretch",
  },
  pickerScrim: {
    flex: 1,
    backgroundColor: "rgba(15,23,42,0.35)",
  },
  pickerSheet: {
    backgroundColor: "#FFFFFF",
    paddingBottom: Platform.OS === "ios" ? 24 : 16,
    paddingTop: 8,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
  },
  pickerSheetHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  pickerHeaderText: {
    fontSize: 14,
    fontWeight: "500",
    color: PRIMARY,
  },
  pickerHeaderTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: "#111827",
  },
  pickerBody: {
    alignItems: "center",
    paddingTop: 4,
    paddingBottom: Platform.OS === "ios" ? 12 : 4,
  },
  pickerControl: {
    alignSelf: "center",
  },

  // Modal + zoomable viewer
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.95)",
    alignItems: "center",
    justifyContent: "center",
  },
  modalClose: { position: "absolute", top: 48, right: 24, padding: 8 },
  modalImage: {
    width: "90%",
    height: "70%",
    resizeMode: "contain",
  },
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

  // =============================================
  // TRADES QUOTE OVERVIEW STYLES (POST-ACCEPTANCE)
  // =============================================

  // Hero info grid (Total + Issued side by side)
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

  // Appointment subheader
  appointmentSubheader: {
    fontSize: 14,
    fontWeight: "600",
    color: "#6B7280",
    marginBottom: 12,
  },
  appointmentSubheaderStandalone: {
    fontSize: 14,
    fontWeight: "600",
    color: "#6B7280",
    marginTop: 16,
    marginBottom: 8,
    marginHorizontal: 4,
  },
  // Standalone appointment card (each appointment as its own card)
  appointmentSingleCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    padding: 16,
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    marginBottom: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  appointmentSingleCardPast: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    padding: 16,
    backgroundColor: "#FAFAFA",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    marginBottom: 8,
  },
  pastAppointmentsHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 16,
    marginBottom: 8,
    marginHorizontal: 4,
  },

  // Trade appointment card styles
  tradeAppointmentCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    paddingVertical: 12,
  },
  tradeAppointmentIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: "#F0FDF4",
    alignItems: "center",
    justifyContent: "center",
  },
  tradeAppointmentTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    marginBottom: 4,
  },
  tradeAppointmentTitle: {
    fontSize: 15,
    fontWeight: "600",
    color: "#111827",
    flex: 1,
  },
  tradeAppointmentBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
  },
  tradeAppointmentBadgeText: {
    fontSize: 11,
    fontWeight: "600",
  },
  tradeAppointmentDateTime: {
    fontSize: 14,
    color: "#374151",
  },
  tradeAppointmentLocation: {
    fontSize: 13,
    color: "#6B7280",
    marginTop: 2,
  },
  tradeAppointmentCompleted: {
    fontSize: 13,
    color: "#9CA3AF",
    marginTop: 2,
  },

  // Reschedule styles
  rescheduleLink: {
    fontSize: 14,
    color: "#6B7280",
    marginTop: 8,
  },
  rescheduleDisabledText: {
    fontSize: 13,
    color: "#9CA3AF",
    marginTop: 8,
  },
  rescheduleWasTime: {
    fontSize: 14,
    color: "#9CA3AF",
    textDecorationLine: "line-through",
    marginTop: 2,
  },
  rescheduleNewTime: {
    fontSize: 14,
    color: "#10B981",
    fontWeight: "500",
    marginTop: 2,
  },
  rescheduleReason: {
    fontSize: 13,
    color: "#6B7280",
    fontStyle: "italic",
    marginTop: 4,
  },
  rescheduleActions: {
    flexDirection: "row",
    gap: 8,
    marginTop: 12,
  },
  rescheduleDeclineBtn: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 16,
    backgroundColor: "#F3F4F6",
    borderRadius: 8,
    alignItems: "center",
  },
  rescheduleDeclineBtnText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#6B7280",
  },
  rescheduleAcceptBtn: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 16,
    backgroundColor: "#10B981",
    borderRadius: 8,
    alignItems: "center",
  },
  rescheduleAcceptBtnText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#FFFFFF",
  },
  rescheduleWaitingText: {
    fontSize: 13,
    color: "#6B7280",
    fontStyle: "italic",
    marginTop: 8,
  },
  rescheduleCurrentTime: {
    fontSize: 14,
    color: "#6B7280",
    marginTop: 4,
  },
  reschedulePickerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 14,
    paddingHorizontal: 16,
    backgroundColor: "#F9FAFB",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  reschedulePickerText: {
    fontSize: 15,
    color: "#111827",
  },
  rescheduleReasonInput: {
    backgroundColor: "#F9FAFB",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 15,
    color: "#111827",
  },
  rescheduleHelperText: {
    fontSize: 13,
    color: "#9CA3AF",
    textAlign: "center",
    marginTop: 16,
  },

  // Section divider
  sectionDivider: {
    height: 1,
    backgroundColor: "#E5E7EB",
    marginTop: 8,
  },

  // Collapsible section styles
  collapsibleHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 24,
    marginBottom: 12,
  },
  collapsibleToggle: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  collapsibleToggleText: {
    fontSize: 14,
    fontWeight: "500",
    color: "#6B7280",
  },

  // Quote breakdown styles
  quoteBreakdownRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 10,
  },
  quoteBreakdownLabel: {
    fontSize: 15,
    color: "#374151",
    flex: 1,
  },
  quoteBreakdownValue: {
    fontSize: 15,
    fontWeight: "500",
    color: "#111827",
  },
  quoteBreakdownDivider: {
    height: 1,
    backgroundColor: "#E5E7EB",
    marginVertical: 8,
  },
  quoteBreakdownTotalLabel: {
    fontSize: 16,
    fontWeight: "700",
    color: "#111827",
  },
  quoteBreakdownTotalValue: {
    fontSize: 18,
    fontWeight: "700",
    color: "#111827",
  },

  // Client request collapsible styles
  clientRequestRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    paddingVertical: 8,
  },
  clientRequestLabel: {
    fontSize: 14,
    color: "#6B7280",
    width: 100,
  },
  clientRequestValue: {
    fontSize: 14,
    color: "#111827",
    flex: 1,
    textAlign: "right",
  },
  clientRequestSectionLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: "#374151",
    marginBottom: 8,
    marginTop: 4,
  },
  clientRequestDescription: {
    fontSize: 14,
    color: "#374151",
    lineHeight: 20,
  },

  // Action buttons container
  actionButtonsContainer: {
    gap: 8,
  },
  markCompleteBtn: {
    backgroundColor: PRIMARY,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  markCompleteBtnText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#FFFFFF",
  },
  messageClientBtn: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  messageClientBtnText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#374151",
  },

  // =============================================
  // AWAITING COMPLETION / COMPLETED STATES
  // =============================================
  awaitingCompletionCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 20,
    marginTop: 16,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  awaitingProgressRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
  },
  awaitingProgressDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: "#10B981",
  },
  awaitingProgressDotEmpty: {
    backgroundColor: "#E5E7EB",
    borderWidth: 2,
    borderColor: "#10B981",
  },
  awaitingProgressLine: {
    width: 40,
    height: 2,
    backgroundColor: "#10B981",
    marginHorizontal: 8,
  },
  awaitingTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#111827",
    textAlign: "center",
    marginBottom: 4,
  },
  awaitingMeta: {
    fontSize: 13,
    color: "#6B7280",
    textAlign: "center",
  },

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
  },
  completedMeta: {
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
    backgroundColor: PRIMARY,
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 24,
    width: "100%",
    alignItems: "center",
  },
  leaveReviewBtnText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#FFFFFF",
  },
  maybeLaterBtn: {
    paddingVertical: 12,
    alignItems: "center",
  },
  maybeLaterBtnText: {
    fontSize: 14,
    color: "#6B7280",
  },

  // =============================================
  // MARK COMPLETE BOTTOM SHEET
  // =============================================
  sheetModalContainer: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
  },
  sheetBackdropArea: {
    flex: 1,
  },
  sheetKeyboardView: {
    // This ensures the sheet stays at the bottom
  },
  sheetContent: {
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: 750,
  },
  sheetHandle: {
    width: 36,
    height: 4,
    backgroundColor: "#D1D5DB",
    borderRadius: 2,
    alignSelf: "center",
    marginTop: 12,
    marginBottom: 8,
  },
  sheetScrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
  sheetTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#111827",
    marginTop: 12,
  },
  sheetSubtitle: {
    fontSize: 14,
    color: "#6B7280",
    marginTop: 8,
    lineHeight: 20,
  },
  sheetSectionLabel: {
    fontSize: 15,
    fontWeight: "600",
    color: "#374151",
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
    paddingBottom: 8,
  },
  sheetFieldLabel: {
    fontSize: 13,
    fontWeight: "500",
    color: "#6B7280",
    marginBottom: 6,
  },
  sheetAmountInputContainer: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#D1D5DB",
    borderRadius: 10,
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 12,
  },
  sheetCurrencySymbol: {
    fontSize: 16,
    fontWeight: "600",
    color: "#374151",
    marginRight: 4,
  },
  sheetAmountInput: {
    flex: 1,
    fontSize: 16,
    paddingVertical: 12,
    color: "#111827",
  },
  sheetDropdown: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderWidth: 1,
    borderColor: "#D1D5DB",
    borderRadius: 10,
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  sheetDropdownText: {
    fontSize: 15,
    color: "#111827",
  },
  sheetNotesInput: {
    borderWidth: 1,
    borderColor: "#D1D5DB",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    backgroundColor: "#FFFFFF",
    minHeight: 80,
    color: "#111827",
  },
  sheetConfirmBtn: {
    backgroundColor: PRIMARY,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  sheetConfirmBtnText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#FFFFFF",
  },
  sheetCancelBtn: {
    paddingVertical: 14,
    alignItems: "center",
  },
  sheetCancelBtnText: {
    fontSize: 15,
    color: "#6B7280",
  },

  // Payment method picker modal
  pickerBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 24,
  },
  pickerContainer: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    width: "100%",
    maxWidth: 340,
    overflow: "hidden",
  },
  pickerHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#E5E7EB",
  },
  pickerTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#111827",
  },
  pickerOption: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  pickerOptionBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#E5E7EB",
  },
  pickerOptionText: {
    fontSize: 16,
    color: "#374151",
  },
  pickerOptionTextSelected: {
    color: PRIMARY,
    fontWeight: "600",
  },
  // Client completion flow styles
  statusChipCompleted: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#D1FAE5",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 4,
  },
  statusChipCompletedText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#10B981",
  },
  statusChipAwaitingCompletion: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FEF3C7",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 4,
  },
  statusChipAwaitingText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#F59E0B",
  },
  clientCompletionCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 24,
    marginHorizontal: 16,
    marginTop: 16,
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  clientCompletionTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#111827",
    textAlign: "center",
  },
  clientCompletionSubtitle: {
    fontSize: 14,
    color: "#6B7280",
    textAlign: "center",
    marginTop: 8,
  },
  confirmCompleteBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#10B981",
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 12,
    gap: 8,
    width: "100%",
  },
  confirmCompleteBtnText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#FFFFFF",
  },
  reportIssueBtn: {
    paddingVertical: 12,
    marginTop: 8,
  },
  reportIssueBtnText: {
    fontSize: 14,
    color: "#6B7280",
    textDecorationLine: "underline",
  },
  clientCompletedCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 24,
    marginHorizontal: 16,
    marginTop: 16,
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  clientCompletedSubtitle: {
    fontSize: 14,
    color: "#6B7280",
    textAlign: "center",
    marginTop: 4,
  },

  // =============================================
  // ISSUE REPORTED STYLES (Trade View)
  // =============================================
  statusChipIssue: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FEE2E2",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 4,
  },
  statusChipIssueText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#EF4444",
  },
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
  issueDetailsLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: "#991B1B",
    letterSpacing: 0.5,
    marginBottom: 4,
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
  issueActionsContainer: {
    marginTop: 16,
  },
  issueActionsTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#111827",
    marginBottom: 4,
  },
  resolveWithClientBtn: {
    backgroundColor: PRIMARY,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  resolveWithClientBtnText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#FFFFFF",
  },
  issueResolvedBtn: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    paddingVertical: 16,
    marginTop: 8,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#10B981",
  },
  issueResolvedBtnText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#10B981",
  },

  // =============================================
  // AWAITING COMPLETION STYLES (Updated)
  // =============================================
  awaitingSubtext: {
    fontSize: 14,
    color: "#6B7280",
    textAlign: "center",
  },
  messageClientBtn: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 24,
    width: "100%",
    alignItems: "center",
  },
  messageClientBtnText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#111827",
  },

  // =============================================
  // REVIEW STYLES
  // =============================================
  reviewStarsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  reviewPromptCardStandalone: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 20,
    alignItems: "center",
    marginTop: 16,
    borderWidth: 1,
    borderColor: "#E5E7EB",
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
  },
  reviewDisplayContent: {
    fontSize: 14,
    color: "#374151",
    fontStyle: "italic",
    lineHeight: 20,
  },
  reviewDisplayDate: {
    fontSize: 13,
    color: "#9CA3AF",
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
    fontSize: 17,
    fontWeight: "600",
    color: "#111827",
  },
  reviewStarsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  reviewPhotosRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  reviewPhoto: {
    width: 64,
    height: 64,
    borderRadius: 8,
  },
});
