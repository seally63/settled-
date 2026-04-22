// app/(dashboard)/quotes/[id].jsx
import {
  StyleSheet,
  View,
  ScrollView,
  Pressable,
  useColorScheme,
  Platform,
  Alert,
  TextInput,
  Dimensions,
  Modal,
  KeyboardAvoidingView,
  Keyboard,
} from "react-native";
// expo-image — memory+disk cached decodes for the attachment
// thumbnails and the avatar on this screen. Trade and client
// render paths both flow through here.
import { Image } from "expo-image";
import ImageViewing from "react-native-image-viewing";
import { useEffect, useState, useMemo, useCallback } from "react";
import { useLocalSearchParams, useRouter, useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import CustomDateTimePicker from "../../../components/CustomDateTimePicker";

import { useQuotes } from "../../../hooks/useQuotes";
import { useUser } from "../../../hooks/useUser";
import { useTheme } from "../../../hooks/useTheme";
import { supabase } from "../../../lib/supabase";
import ThemedView from "../../../components/ThemedView";
import ThemedText from "../../../components/ThemedText";
import Spacer from "../../../components/Spacer";
import { QuoteOverviewSkeleton } from "../../../components/Skeleton";
import { KeyboardDoneButton, KEYBOARD_DONE_ID } from "../../../components/KeyboardDoneButton";
import { FontFamily, Radius } from "../../../constants/Typography";
import { getRequestAttachmentUrlsCached } from "../../../lib/api/attachments";

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

// Infer appointment kind from its title string — used as a backfill
// whenever the fetch path returns an appointment row without an
// explicit `kind` column (the RPC predates the 2026-04-28 migration,
// and older direct queries used a narrow SELECT list that omitted
// it). Returning `null` when we can't tell keeps the gate for
// "Mark as complete" honest — it only fires for rows we're
// confident are Start Job appointments.
function inferKindFromTitle(title) {
  const t = String(title || "").toLowerCase();
  if (t.includes("start job") || t.includes("start work")) return "start_job";
  if (t.includes("final inspection") || t.includes("final")) return "final";
  if (t.includes("follow-up") || t.includes("follow up") || t.includes("followup")) return "followup";
  if (t.includes("design consultation") || t.includes("design")) return "design";
  if (t.includes("survey") || t.includes("assessment")) return "survey";
  return null;
}

export default function QuoteDetails() {
  const params = useLocalSearchParams();
  const router = useRouter();
  const { user } = useUser();
  const insets = useSafeAreaInsets();
  const { colors: c, dark } = useTheme();
  const styles = useMemo(() => makeStyles(c, dark), [c, dark]);

  // Params from navigation (used as very rough fallback only)
  const routeNameParam = Array.isArray(params.name)
    ? params.name[0]
    : params.name;
  const routeAvatarParam = Array.isArray(params.avatar)
    ? params.avatar[0]
    : params.avatar;
  const fromAppointments = params.fromAppointments === 'true';
  const shouldOpenSchedule = params.openSchedule === 'true';
  const returnToParam = Array.isArray(params.returnTo)
    ? params.returnTo[0]
    : params.returnTo;

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

        // 3) Load attachments (memoised — repeated entries within
        //    the 3500 s TTL skip both the path RPC and the signing
        //    round trip).
        try {
          const { paths, urls } = await getRequestAttachmentUrlsCached(
            String(reqId)
          );
          if (!mounted) return;
          setAttachmentsCount(paths.length || 0);
          setAttachments(urls);
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
            finalAppointments = filtered.map((a) => {
              const title = a.title || "Appointment";
              return {
                id: a.id,
                request_id: a.request_id,
                quote_id: a.quote_id,
                scheduled_at: a.scheduled_at,
                title,
                status: a.status,
                location: a.location,
                // Critical for the Mark-as-complete gate + bottom
                // sheet icon/title. rpc_trade_list_appointments
                // doesn't return `kind` yet, so fall back to
                // inferring it from the title string when missing.
                kind: a.kind || inferKindFromTitle(title) || null,
                reschedule_requested_by: a.reschedule_requested_by || null,
                proposed_scheduled_at: a.proposed_scheduled_at || null,
              };
            });
          } else {
            // Fallback: direct query (may not work due to RLS)
            const { data: directAppts, error: directErr } = await supabase
              .from("appointments")
              .select("id, request_id, quote_id, scheduled_at, title, status, location, kind, reschedule_requested_by, proposed_scheduled_at")
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
          if (clientIdFromRequest && userRole === "trades") {
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

              finalAppointments = filtered.map((a) => {
                const title = a.title || "Appointment";
                return {
                  id: a.id,
                  request_id: a.request_id,
                  quote_id: a.quote_id,
                  scheduled_at: a.scheduled_at,
                  title,
                  status: a.status,
                  location: a.location,
                  kind: a.kind || inferKindFromTitle(title) || null,
                  reschedule_requested_by: a.reschedule_requested_by || null,
                  proposed_scheduled_at: a.proposed_scheduled_at || null,
                };
              });
            } else {
              // Fallback: direct query
              const { data: directAppts, error: directErr } = await supabase
                .from("appointments")
                .select("id, request_id, quote_id, scheduled_at, title, status, location, kind, reschedule_requested_by, proposed_scheduled_at")
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

            finalAppointments = filtered.map((a) => {
              const title = a.title || "Appointment";
              return {
                id: a.id,
                request_id: a.request_id,
                quote_id: a.quote_id,
                scheduled_at: a.scheduled_at,
                title,
                status: a.status,
                location: a.location,
                // Critical for the Mark-as-complete gate + bottom
                // sheet icon/title. rpc_trade_list_appointments
                // doesn't return `kind` yet, so fall back to
                // inferring it from the title string when missing.
                kind: a.kind || inferKindFromTitle(title) || null,
                reschedule_requested_by: a.reschedule_requested_by || null,
                proposed_scheduled_at: a.proposed_scheduled_at || null,
              };
            });
          } else {
            const { data: directAppts, error: directErr } = await supabase
              .from("appointments")
              .select("id, request_id, quote_id, scheduled_at, title, status, location, kind, reschedule_requested_by, proposed_scheduled_at")
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

  // Mark-as-complete is only meaningful once the trade has actually
  // scheduled a Start Job on this quote. Requires at least one
  // Start Job appointment in a non-cancelled state (proposed,
  // confirmed, or reschedule_pending all qualify — they all mean
  // the job is on the books).
  const hasActiveStartJobAppt = useMemo(() => {
    if (!quote?.id) return false;
    return (appointments || []).some((a) => {
      if (a.kind !== "start_job") return false;
      if (a.quote_id && a.quote_id !== quote.id) return false;
      return String(a.status || "").toLowerCase() !== "cancelled";
    });
  }, [appointments, quote?.id]);

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
        .select("id, request_id, quote_id, scheduled_at, title, status, location, kind, reschedule_requested_by, proposed_scheduled_at")
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
                  .select("id, request_id, quote_id, scheduled_at, title, status, location, kind, reschedule_requested_by, proposed_scheduled_at")
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
                  .select("id, request_id, quote_id, scheduled_at, title, status, location, kind, reschedule_requested_by, proposed_scheduled_at")
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

        finalAppointments = filtered.map((a) => {
          const title = a.title || "Appointment";
          return {
            id: a.id,
            request_id: a.request_id,
            quote_id: a.quote_id,
            scheduled_at: a.scheduled_at,
            title,
            status: a.status,
            location: a.location,
            // Kind is the gate for Mark-as-complete — infer from
            // the title when the RPC doesn't return it directly.
            kind: a.kind || inferKindFromTitle(title) || null,
            reschedule_count: a.reschedule_count,
            reschedule_requested_by: a.reschedule_requested_by,
            proposed_scheduled_at: a.proposed_scheduled_at,
            reschedule_reason: a.reschedule_reason,
            original_scheduled_at: a.original_scheduled_at,
          };
        });
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
                contentFit="cover"
                cachePolicy="memory-disk"
                transition={120}
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
                    !hasDate && { color: c.textMuted },
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
                    !hasTime && { color: c.textMuted },
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
        {/* Sticky chevron back (no Quote # header row). */}
        <Pressable
          onPress={() => {
            // Prefer a natural stack pop whenever one's available —
            // Recent Activity → this screen is the common case and
            // `router.back()` unwinds it correctly. Using
            // `router.replace(returnTo)` first was pushing a FRESH
            // Client Request screen on top of the one underneath,
            // producing the duplicate "forward animation" on back
            // that mirror-bugged the client side.
            if (fromAppointments) {
              router.push('/appointments');
            } else if (router.canGoBack?.()) {
              router.back();
            } else if (returnToParam) {
              router.replace(returnToParam);
            } else {
              router.replace("/quotes");
            }
          }}
          hitSlop={10}
          style={[
            styles.qoStickyChevron,
            {
              top: insets.top + 10,
              backgroundColor: c.elevate,
              borderColor: c.border,
            },
          ]}
        >
          <Ionicons name="chevron-back" size={18} color={c.text} />
        </Pressable>

        <ScrollView
          contentContainerStyle={[
            styles.scrollContents,
            { paddingTop: insets.top + 56 },
          ]}
          showsVerticalScrollIndicator={false}
        >
          {/* Legacy hero block wrapped out — the new Quote Breakdown
              below carries the £ total, and the Client Request context
              is no longer shown here (users reach this page from the
              Client Request page's Recent Activity, so that info is a
              tap away). User specifically asked for this section to be
              removed entirely.                                      */}
          {false && (
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
          )}
          {/* /legacy hero */}

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


          {/* Quote breakdown — rebuilt to mirror the builder's Preview
              modal exactly: eyebrow + £ hero + indexed line rows
              (name · detail · qty×unit · line total) + subtotal / VAT
              / total totals. Not collapsible (can't edit a sent quote).
              Uses the qo* styles defined below.                    */}
          <View style={styles.qoQuoteBreakdownBlock}>
            <View style={styles.qoEyebrowRow}>
              <View style={[styles.qoEyebrowDot, { backgroundColor: "#7C5CFF" }]} />
              <ThemedText
                style={[styles.qoEyebrow, { color: c.textMuted }]}
                numberOfLines={1}
              >
                {(() => {
                  const shortId = getQuoteShortId(
                    Array.isArray(params.id) ? params.id[0] : params.id
                  );
                  const name = displayName
                    ? displayName.trim().split(/\s+/).slice(0, 2).join(" ")
                    : null;
                  return name
                    ? `QUOTE #${shortId} FOR ${name.toUpperCase()}`
                    : `QUOTE #${shortId}`;
                })()}
              </ThemedText>
            </View>

            <View style={styles.qoTotalRow}>
              <ThemedText style={[styles.qoTotalPound, { color: c.textMid }]}>£</ThemedText>
              <ThemedText style={[styles.qoTotalNumber, { color: c.text }]}>
                {Number(grandTotal || 0).toLocaleString("en-GB", {
                  minimumFractionDigits: 0,
                  maximumFractionDigits: 0,
                })}
              </ThemedText>
            </View>
            <ThemedText style={[styles.qoTotalSubtitle, { color: c.textMuted }]}>
              {items.length} item{items.length === 1 ? "" : "s"}
              {includesVat ? " · incl. 20% VAT" : ""}
            </ThemedText>

            <View style={styles.qoLedger}>
              {items.length === 0 ? (
                <ThemedText style={[styles.qoLedgerEmpty, { color: c.textMuted }]}>
                  No items added to this quote.
                </ThemedText>
              ) : (
                items.map((item, i) => {
                  const qty = Number(item?.qty || 1);
                  const price = Number(item?.unit_price || 0);
                  const lineTotal = qty * price;
                  return (
                    <View
                      key={`li-${i}`}
                      style={[
                        styles.qoLine,
                        { borderBottomColor: c.divider },
                      ]}
                    >
                      <View
                        style={[
                          styles.qoLineIndex,
                          { backgroundColor: c.elevate2 ?? c.elevate },
                        ]}
                      >
                        <ThemedText
                          style={[styles.qoLineIndexText, { color: c.textMid }]}
                        >
                          {i + 1}
                        </ThemedText>
                      </View>
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <ThemedText
                          style={[styles.qoLineTitle, { color: c.text }]}
                          numberOfLines={2}
                        >
                          {item?.name || "Untitled line"}
                        </ThemedText>
                        {!!item?.description && (
                          <ThemedText
                            style={[styles.qoLineDetail, { color: c.textMuted }]}
                            numberOfLines={2}
                          >
                            {item.description}
                          </ThemedText>
                        )}
                        {qty > 1 && (
                          <ThemedText
                            style={[styles.qoLineQty, { color: c.textMuted }]}
                          >
                            {qty} × £{formatNumber(price)}
                          </ThemedText>
                        )}
                      </View>
                      <ThemedText
                        style={[styles.qoLineAmount, { color: c.text }]}
                      >
                        £{formatNumber(lineTotal)}
                      </ThemedText>
                    </View>
                  );
                })
              )}

              {/* Totals */}
              {!!quote.subtotal && (
                <View style={[styles.qoLine, styles.qoSummaryRow]}>
                  <View style={{ flex: 1 }}>
                    <ThemedText style={[styles.qoSummaryLabel, { color: c.textMuted }]}>
                      Subtotal
                    </ThemedText>
                  </View>
                  <ThemedText style={[styles.qoLineAmount, { color: c.text }]}>
                    £{formatNumber(quote.subtotal)}
                  </ThemedText>
                </View>
              )}
              {!!quote.tax_total && (
                <View style={[styles.qoLine, styles.qoSummaryRow]}>
                  <View style={{ flex: 1 }}>
                    <ThemedText style={[styles.qoSummaryLabel, { color: c.textMuted }]}>
                      VAT (20%)
                    </ThemedText>
                  </View>
                  <ThemedText style={[styles.qoLineAmount, { color: c.text }]}>
                    £{formatNumber(quote.tax_total)}
                  </ThemedText>
                </View>
              )}
              <View
                style={[
                  styles.qoLine,
                  styles.qoGrandRow,
                  { borderTopColor: c.border },
                ]}
              >
                <View style={{ flex: 1 }}>
                  <ThemedText style={[styles.qoGrandLabel, { color: c.text }]}>
                    Total
                  </ThemedText>
                </View>
                <ThemedText style={[styles.qoGrandAmount, { color: c.text }]}>
                  £{formatNumber(grandTotal)}
                </ThemedText>
              </View>
            </View>

            {/* Terms: Earliest start · Duration · Valid until · Deposit */}
            {(quote.earliest_start ||
              quote.duration_text ||
              quote.estimated_duration_text ||
              quote.valid_until ||
              quote.deposit_percent != null) && (
              <>
                <ThemedText style={[styles.qoSectionLabel, { color: c.textMuted }]}>
                  QUOTE TERMS
                </ThemedText>
                <View
                  style={[
                    styles.qoTermsCard,
                    { backgroundColor: c.elevate, borderColor: c.border },
                  ]}
                >
                  {quote.earliest_start && (
                    <View style={styles.qoTermRow}>
                      <ThemedText style={[styles.qoTermLabel, { color: c.textMid }]}>
                        Earliest start
                      </ThemedText>
                      <ThemedText style={[styles.qoTermValue, { color: c.text }]}>
                        {new Date(quote.earliest_start).toLocaleDateString(undefined, {
                          day: "numeric",
                          month: "long",
                        })}
                      </ThemedText>
                    </View>
                  )}
                  {(quote.duration_text ||
                    quote.estimated_duration_text ||
                    quote.estimated_duration) && (
                    <>
                      <View style={[styles.qoTermsDivider, { backgroundColor: c.divider }]} />
                      <View style={styles.qoTermRow}>
                        <ThemedText style={[styles.qoTermLabel, { color: c.textMid }]}>
                          Estimated duration
                        </ThemedText>
                        <ThemedText style={[styles.qoTermValue, { color: c.text }]}>
                          {quote.duration_text ||
                            quote.estimated_duration_text ||
                            quote.estimated_duration}
                        </ThemedText>
                      </View>
                    </>
                  )}
                  {quote.valid_until && (
                    <>
                      <View style={[styles.qoTermsDivider, { backgroundColor: c.divider }]} />
                      <View style={styles.qoTermRow}>
                        <ThemedText style={[styles.qoTermLabel, { color: c.textMid }]}>
                          Valid until
                        </ThemedText>
                        <ThemedText style={[styles.qoTermValue, { color: c.text }]}>
                          {new Date(quote.valid_until).toLocaleDateString(undefined, {
                            day: "numeric",
                            month: "long",
                          })}
                        </ThemedText>
                      </View>
                    </>
                  )}
                  {quote.deposit_percent != null && (
                    <>
                      <View style={[styles.qoTermsDivider, { backgroundColor: c.divider }]} />
                      <View style={styles.qoTermRow}>
                        <ThemedText style={[styles.qoTermLabel, { color: c.textMid }]}>
                          Deposit
                        </ThemedText>
                        <ThemedText style={[styles.qoTermValue, { color: c.text }]}>
                          {Number(quote.deposit_percent)}% on acceptance
                        </ThemedText>
                      </View>
                    </>
                  )}
                </View>
              </>
            )}
          </View>

          {/* Client request section removed per redesign — users reach
              this screen from the Client Request page itself, so we
              don't re-render the request context here. Wrapped in a
              dead-code guard for clean parity.                     */}
          {false && request && (
            <View style={styles.qoClientRequestBlock}>
              <View style={styles.qoEyebrowRow}>
                <View
                  style={[styles.qoEyebrowDot, { backgroundColor: "#7C5CFF" }]}
                />
                <ThemedText style={[styles.qoEyebrow, { color: c.textMuted }]}>
                  CLIENT REQUEST
                </ThemedText>
              </View>

              <ThemedText style={[styles.qoHeroTitle, { color: c.text }]}>
                {request?.service_types?.name ||
                  parsedDetails.main ||
                  parsedDetails.service ||
                  parsedDetails.title ||
                  "Request"}
              </ThemedText>

              <View style={styles.qoFactsRow}>
                <View
                  style={[
                    styles.qoFactPill,
                    { backgroundColor: c.elevate, borderColor: c.border },
                  ]}
                >
                  <ThemedText style={[styles.qoFactLabel, { color: c.textMuted }]}>
                    BUDGET
                  </ThemedText>
                  <ThemedText
                    style={[styles.qoFactValue, { color: c.text }]}
                    numberOfLines={2}
                  >
                    {request.budget_band || parsedDetails.budget || "—"}
                  </ThemedText>
                </View>
                <View
                  style={[
                    styles.qoFactPill,
                    { backgroundColor: c.elevate, borderColor: c.border },
                  ]}
                >
                  <ThemedText style={[styles.qoFactLabel, { color: c.textMuted }]}>
                    TIMING
                  </ThemedText>
                  <ThemedText
                    style={[styles.qoFactValue, { color: c.text }]}
                    numberOfLines={2}
                  >
                    {request.timing_options?.name || parsedDetails.timing || "—"}
                  </ThemedText>
                </View>
              </View>

              {(parsedDetails.description || parsedDetails.notes) && (
                <>
                  <ThemedText style={[styles.qoSectionLabel, { color: c.textMuted }]}>
                    NOTES FROM CLIENT
                  </ThemedText>
                  <View
                    style={[
                      styles.qoNotesCard,
                      { backgroundColor: c.elevate, borderColor: c.border },
                    ]}
                  >
                    <ThemedText style={[styles.qoNotesText, { color: c.textMid }]}>
                      {parsedDetails.description || parsedDetails.notes}
                    </ThemedText>
                  </View>
                </>
              )}

              {hasAttachments && (
                <>
                  <ThemedText style={[styles.qoSectionLabel, { color: c.textMuted }]}>
                    PHOTOS · {attachmentsCount}
                  </ThemedText>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={{ paddingHorizontal: 0, gap: 8 }}
                  >
                    {attachments.map((url, i) => (
                      <Pressable
                        key={`${url}-${i}`}
                        onPress={() => setViewer({ open: true, index: i })}
                        style={[
                          styles.qoPhotoThumb,
                          { borderColor: c.border, backgroundColor: c.elevate },
                        ]}
                      >
                        <Image
                          source={{ uri: url }}
                          style={{ width: "100%", height: "100%" }}
                          contentFit="cover"
                          cachePolicy="memory-disk"
                          transition={120}
                        />
                      </Pressable>
                    ))}
                  </ScrollView>
                </>
              )}
            </View>
          )}

          {/* Appointments block + divider intentionally hidden on the
              trade Quote Overview — appointments now live on the Client
              Request page's Recent Activity, so showing them here is
              redundant (and the leading divider/line was bleeding into
              the layout). Keeping the JSX behind `{false && ...}` so
              the data-loading effects + reschedule handlers defined
              further up stay intact.                                */}
          {false && (appointments.length > 0 || isAccepted) && <View style={styles.sectionDivider} />}

          {false && (appointments.length > 0 || isAccepted) && (
            <View>
              <Pressable
                style={styles.collapsibleHeader}
                onPress={() => setAppointmentsExpanded(!appointmentsExpanded)}
              >
                <ThemedText style={styles.sectionHeaderText}>Appointments</ThemedText>
                <Ionicons
                  name={appointmentsExpanded ? "chevron-up" : "chevron-down"}
                  size={20}
                  color={c.textMid}
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
                          color={c.textMid}
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
                      color={c.textMid}
                    />
                  </Pressable>

                  {showPastAppointments && (
                    <View>
                      {pastAppointments.map((appt, idx) => {
                        const scheduledDate = new Date(appt.scheduled_at);
                        return (
                          <View key={appt.id ?? `past-${idx}`} style={styles.appointmentSingleCardPast}>
                            <Ionicons name="calendar" size={20} color={c.textMuted} />
                            <View style={{ flex: 1 }}>
                              <View style={styles.tradeAppointmentTitleRow}>
                                <ThemedText style={[styles.tradeAppointmentTitle, { color: c.textMid }]}>
                                  {appt.title || "Appointment"}
                                </ThemedText>
                                <Ionicons name="checkmark" size={18} color={c.textMuted} />
                              </View>
                              <ThemedText style={[styles.tradeAppointmentDateTime, { color: c.textMuted }]}>
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

          {/* Action Buttons — only show for accepted quotes that
              have an active Start Job appointment (proposed,
              confirmed, or reschedule_pending — anything non-
              cancelled). Before a Start Job is booked, marking
              complete makes no sense because nothing's been
              started. Covers the "don't surface destructive
              actions until the state machine is ready for them"
              principle. */}
          {status !== "awaiting_completion" && status !== "completed" && status !== "issue_reported" && (
            <View style={styles.actionButtonsContainer}>
              {isAccepted && hasActiveStartJobAppt && (
                <Pressable
                  style={styles.markCompleteBtn}
                  onPress={openMarkCompleteSheet}
                >
                  <ThemedText style={styles.markCompleteBtnText}>Mark as complete</ThemedText>
                </Pressable>
              )}
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
                  {/* Eyebrow + title — matches the pill-container pattern
                      used elsewhere (Request page, Quote Builder preview).  */}
                  <View style={styles.mcSheetHeader}>
                    <ThemedText style={styles.mcSheetEyebrow}>JOB COMPLETION</ThemedText>
                    <ThemedText style={styles.mcSheetTitle}>Mark as complete</ThemedText>
                    <ThemedText style={styles.mcSheetSubtitle}>
                      Let {displayName ? displayName.split(" ")[0] : "the client"} know the work is done.
                      They'll confirm before the job closes.
                    </ThemedText>
                  </View>

                  <Spacer size={20} />

                  {/* Payment pill-container — Amount + Method live in a
                      single bordered card, matching the Budget/Timing
                      pill style used on the Request page.              */}
                  <View style={styles.mcPillCard}>
                    <ThemedText style={styles.mcPillEyebrow}>PAYMENT</ThemedText>

                    <ThemedText style={styles.mcFieldLabel}>Amount received</ThemedText>
                    <View style={styles.mcAmountRow}>
                      <ThemedText style={styles.mcCurrency}>£</ThemedText>
                      <TextInput
                        style={styles.mcAmountInput}
                        value={paymentAmount}
                        onChangeText={setPaymentAmount}
                        keyboardType="decimal-pad"
                        placeholder="0.00"
                        placeholderTextColor={c.textMuted}
                        editable={!completeBusy}
                      />
                    </View>

                    <View style={styles.mcPillDivider} />

                    <ThemedText style={styles.mcFieldLabel}>Method</ThemedText>
                    <Pressable
                      style={styles.mcDropdown}
                      onPress={() => setShowPaymentMethodPicker(true)}
                      disabled={completeBusy}
                    >
                      <ThemedText style={styles.mcDropdownText}>
                        {selectedPaymentMethodLabel}
                      </ThemedText>
                      <Ionicons name="chevron-down" size={18} color={c.textMid} />
                    </Pressable>
                  </View>

                  <Spacer size={14} />

                  {/* Final notes pill-container. Label reads plainly so the
                      trade knows it's optional without the parenthetical.  */}
                  <View style={styles.mcPillCard}>
                    <ThemedText style={styles.mcPillEyebrow}>FINAL NOTES</ThemedText>
                    <TextInput
                      style={styles.mcNotesInput}
                      value={completionNotes}
                      onChangeText={setCompletionNotes}
                      placeholder="Optional — anything the client should know about the finished work."
                      placeholderTextColor={c.textMuted}
                      multiline
                      numberOfLines={3}
                      textAlignVertical="top"
                      editable={!completeBusy}
                      inputAccessoryViewID={Platform.OS === "ios" ? KEYBOARD_DONE_ID : undefined}
                    />
                  </View>

                  <Spacer size={22} />

                  {/* Inline actions — matches the qoInlineActions row used
                      on the Client Quote Overview (equal-flex ghost + primary,
                      52px height, Public Sans SemiBold, pill radius).       */}
                  <View style={styles.mcActionRow}>
                    <Pressable
                      onPress={closeMarkCompleteSheet}
                      disabled={completeBusy}
                      style={({ pressed }) => [
                        styles.mcActionGhost,
                        { backgroundColor: c.elevate, borderColor: c.borderStrong },
                        pressed && { opacity: 0.75 },
                        completeBusy && { opacity: 0.5 },
                      ]}
                    >
                      <ThemedText style={[styles.mcActionGhostText, { color: c.text }]}>
                        Cancel
                      </ThemedText>
                    </Pressable>

                    <Pressable
                      onPress={handleMarkComplete}
                      disabled={completeBusy}
                      style={({ pressed }) => [
                        styles.mcActionPrimary,
                        { backgroundColor: PRIMARY },
                        pressed && { opacity: 0.85 },
                        completeBusy && { opacity: 0.6 },
                      ]}
                    >
                      <Ionicons
                        name="checkmark"
                        size={18}
                        color="#FFFFFF"
                        style={{ marginRight: 8 }}
                      />
                      <ThemedText style={styles.mcActionPrimaryText}>
                        {completeBusy ? "Confirming…" : "Mark as complete"}
                      </ThemedText>
                    </Pressable>
                  </View>
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
                    <Ionicons name="close" size={24} color={c.textMid} />
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
                    placeholderTextColor={c.textMuted}
                    multiline
                    numberOfLines={4}
                    textAlignVertical="top"
                    editable={!issueResolveBusy}
                    inputAccessoryViewID={Platform.OS === "ios" ? KEYBOARD_DONE_ID : undefined}
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
                      !rescheduleDate && { color: c.textMuted }
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
                    <Ionicons name="calendar-outline" size={20} color={c.textMid} />
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
                      !rescheduleTime && { color: c.textMuted }
                    ]}>
                      {rescheduleTime
                        ? rescheduleTime.toLocaleTimeString(undefined, {
                            hour: "2-digit",
                            minute: "2-digit",
                          })
                        : "Select time"}
                    </ThemedText>
                    <Ionicons name="time-outline" size={20} color={c.textMid} />
                  </Pressable>

                  <Spacer size={16} />

                  {/* Reason (optional) */}
                  <ThemedText style={styles.sheetFieldLabel}>Reason (optional)</ThemedText>
                  <TextInput
                    style={styles.rescheduleReasonInput}
                    value={rescheduleReason}
                    onChangeText={setRescheduleReason}
                    placeholder="e.g., Schedule conflict"
                    placeholderTextColor={c.textMuted}
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
              } else if (fromPipeline) {
                router.replace('/trades/pipeline');
              } else if (router.canGoBack?.()) {
                router.back();
              } else {
                router.replace("/quotes");
              }
            }}
            hitSlop={10}
            style={styles.backButton}
          >
            <Ionicons name="close" size={28} color={c.textMid} />
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
                        color={c.textMid}
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
                    color={c.textMid}
                  />
                </View>
              </Pressable>

              {showPastAppointments && (
                <View>
                  {pastAppointments.map((appt, idx) => {
                    const scheduledDate = new Date(appt.scheduled_at);
                    return (
                      <View key={appt.id ?? `client-past-${idx}`} style={styles.appointmentSingleCardPast}>
                        <Ionicons name="calendar" size={20} color={c.textMuted} />
                        <View style={{ flex: 1 }}>
                          <View style={styles.tradeAppointmentTitleRow}>
                            <ThemedText style={[styles.tradeAppointmentTitle, { color: c.textMid }]}>
                              {appt.title || "Appointment"}
                            </ThemedText>
                            <Ionicons name="checkmark" size={18} color={c.textMuted} />
                          </View>
                          <ThemedText style={[styles.tradeAppointmentDateTime, { color: c.textMuted }]}>
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
                  <Ionicons name="calendar-outline" size={18} color={c.textMid} />
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
                  <Ionicons name="location-outline" size={18} color={c.textMid} />
                  <View style={styles.requestDetailContent}>
                    <ThemedText style={styles.requestDetailLabel}>Area</ThemedText>
                    <ThemedText style={styles.requestDetailValue}>{request.postcode}</ThemedText>
                  </View>
                </View>
              )}

              {!!parsedDetails.description && (
                <View style={styles.requestDetailRow}>
                  <Ionicons name="document-text-outline" size={18} color={c.textMid} />
                  <View style={styles.requestDetailContent}>
                    <ThemedText style={styles.requestDetailLabel}>Details</ThemedText>
                    <ThemedText style={styles.requestDetailValue}>{parsedDetails.description}</ThemedText>
                  </View>
                </View>
              )}

              {!!(request.property_types?.name || parsedDetails.property) && (
                <View style={styles.requestDetailRow}>
                  <Ionicons name="home-outline" size={18} color={c.textMid} />
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
                  <Ionicons name="cash-outline" size={18} color={c.textMid} />
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
                    <Ionicons name="images-outline" size={18} color={c.textMid} />
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
                        contentFit="cover"
                        cachePolicy="memory-disk"
                        transition={120}
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
              <Ionicons name="calendar-outline" size={18} color={c.textMid} />
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
              <Ionicons name="time-outline" size={18} color={c.textMid} />
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
                      <Ionicons name="calendar-outline" size={14} color={c.textMid} />
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
                <Ionicons name="chatbubble-outline" size={18} color={c.textMid} />
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
      <KeyboardDoneButton />
    </ThemedView>
  );
}

function makeStyles(c, dark) {
  return StyleSheet.create({
  // main quote details container
  container: {
    flex: 1,
    alignItems: "stretch",
    backgroundColor: c.background,
  },

  // separate container for scheduling page
  scheduleContainer: {
    flex: 1,
    alignItems: "stretch",
    backgroundColor: c.elevate,
    paddingTop: Platform.OS === "ios" ? 60 : 20,
  },

  // Transparent top row — no block/blob behind the title + close.
  // Typography: Public Sans (headers) / DM Sans (body).
  header: {
    paddingHorizontal: 20,
    paddingBottom: 12,
    backgroundColor: "transparent",
    zIndex: 10,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  headerTitle: {
    fontFamily: "PublicSans_700Bold",
    fontSize: 22,
    letterSpacing: -0.4,
    lineHeight: 28,
    color: c.text,
  },
  backButton: {
    padding: 4,
  },

  scrollContents: { paddingBottom: 130, paddingHorizontal: 20, paddingTop: 8 },

  heroCard: {
    marginBottom: 8,
    padding: 16,
    borderRadius: 20,
    backgroundColor: c.elevate,
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
    color: c.text,
  },
  heroJobTitle: {
    marginTop: 4,
    fontSize: 15,
    fontWeight: "500",
    color: c.textMid,
  },
  heroLocation: {
    marginTop: 2,
    fontSize: 14,
    color: c.textMid,
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
    color: c.textMid,
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
    color: c.textMid,
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
    color: c.text,
  },
  addAppointmentBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 999,
    backgroundColor: c.elevate2,
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
    color: c.textMuted,
  },
  emptyAppointmentsSubtext: {
    fontSize: 13,
    color: c.textMuted,
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
    backgroundColor: c.elevate2,
    alignItems: "center",
    justifyContent: "center",
  },
  appointmentListTitle: {
    fontSize: 15,
    fontWeight: "600",
    color: c.text,
    marginBottom: 4,
  },
  appointmentListDateTime: {
    fontSize: 14,
    color: c.textMid,
  },
  appointmentListLocation: {
    fontSize: 13,
    color: c.textMid,
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
    borderColor: c.border,
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    backgroundColor: c.elevate,
  },

  // Request summary (NEW STYLES)
  requestTitle: {
    fontWeight: "700",
    fontSize: 18,
    color: c.text,
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
    color: c.textMid,
    fontWeight: "600",
    marginBottom: 2,
  },
  requestDetailValue: {
    fontSize: 15,
    color: c.text,
    lineHeight: 22,
  },

  // Quote breakdown (NEW STYLES)
  breakdownSectionLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: c.text,
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
    color: c.text,
    marginBottom: 4,
  },
  lineItemDescription: {
    fontSize: 14,
    color: c.textMid,
    marginBottom: 4,
    lineHeight: 20,
  },
  lineItemMeta: {
    fontSize: 13,
    color: c.textMid,
  },
  lineItemTotal: {
    fontSize: 16,
    fontWeight: "700",
    color: c.text,
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
    color: c.textMid,
  },
  totalValue: {
    fontSize: 15,
    fontWeight: "600",
    color: c.text,
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
    color: c.text,
  },
  totalValueFinal: {
    fontSize: 20,
    fontWeight: "700",
    color: c.text,
  },
  totalNote: {
    fontSize: 13,
    color: c.textMid,
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
    color: c.text,
    flex: 1,
  },
  appointmentCardMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  appointmentCardMeta: {
    fontSize: 14,
    color: c.textMid,
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
    color: c.textMid,
    textTransform: "uppercase",
    letterSpacing: 0.4,
    marginBottom: 4,
  },
  appointmentDetailValue: {
    fontSize: 15,
    color: c.text,
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
    backgroundColor: c.elevate,
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
    backgroundColor: c.elevate,
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
    color: c.text,
  },
  detailDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: "rgba(148,163,184,0.5)",
  },
  detailPill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: c.elevate2,
  },
  detailPillText: {
    fontSize: 12,
    fontWeight: "500",
    color: c.textMid,
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
    backgroundColor: c.elevate,
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
    color: c.text,
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
    color: c.textMid,
    marginBottom: 4,
  },
  heroInfoValue: {
    fontSize: 18,
    fontWeight: "700",
    color: c.text,
  },
  heroInfoSub: {
    marginTop: 2,
    fontSize: 12,
    color: c.textMid,
  },

  // Appointment subheader
  appointmentSubheader: {
    fontSize: 14,
    fontWeight: "600",
    color: c.textMid,
    marginBottom: 12,
  },
  appointmentSubheaderStandalone: {
    fontSize: 14,
    fontWeight: "600",
    color: c.textMid,
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
    backgroundColor: c.elevate,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: c.border,
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
    borderColor: c.border,
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
    color: c.text,
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
    color: c.textMid,
  },
  tradeAppointmentLocation: {
    fontSize: 13,
    color: c.textMid,
    marginTop: 2,
  },
  tradeAppointmentCompleted: {
    fontSize: 13,
    color: c.textMuted,
    marginTop: 2,
  },

  // Reschedule styles
  rescheduleLink: {
    fontSize: 14,
    color: c.textMid,
    marginTop: 8,
  },
  rescheduleDisabledText: {
    fontSize: 13,
    color: c.textMuted,
    marginTop: 8,
  },
  rescheduleWasTime: {
    fontSize: 14,
    color: c.textMuted,
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
    color: c.textMid,
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
    backgroundColor: c.elevate2,
    borderRadius: 8,
    alignItems: "center",
  },
  rescheduleDeclineBtnText: {
    fontSize: 14,
    fontWeight: "600",
    color: c.textMid,
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
    color: c.textMid,
    fontStyle: "italic",
    marginTop: 8,
  },
  rescheduleCurrentTime: {
    fontSize: 14,
    color: c.textMid,
    marginTop: 4,
  },
  reschedulePickerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 14,
    paddingHorizontal: 16,
    backgroundColor: c.elevate2,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: c.border,
  },
  reschedulePickerText: {
    fontSize: 15,
    color: c.text,
  },
  rescheduleReasonInput: {
    backgroundColor: c.elevate2,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: c.border,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 15,
    color: c.text,
  },
  rescheduleHelperText: {
    fontSize: 13,
    color: c.textMuted,
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
    color: c.textMid,
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
    color: c.textMid,
    flex: 1,
  },
  quoteBreakdownValue: {
    fontSize: 15,
    fontWeight: "500",
    color: c.text,
  },
  quoteBreakdownDivider: {
    height: 1,
    backgroundColor: "#E5E7EB",
    marginVertical: 8,
  },
  quoteBreakdownTotalLabel: {
    fontSize: 16,
    fontWeight: "700",
    color: c.text,
  },
  quoteBreakdownTotalValue: {
    fontSize: 18,
    fontWeight: "700",
    color: c.text,
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
    color: c.textMid,
    width: 100,
  },
  clientRequestValue: {
    fontSize: 14,
    color: c.text,
    flex: 1,
    textAlign: "right",
  },
  clientRequestSectionLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: c.textMid,
    marginBottom: 8,
    marginTop: 4,
  },
  clientRequestDescription: {
    fontSize: 14,
    color: c.textMid,
    lineHeight: 20,
  },

  // Action buttons container
  actionButtonsContainer: {
    gap: 8,
  },
  markCompleteBtn: {
    backgroundColor: PRIMARY,
    borderRadius: 999,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  markCompleteBtnText: {
    fontFamily: FontFamily.headerSemibold,
    fontSize: 16,
    letterSpacing: -0.1,
    color: "#FFFFFF",
  },
  messageClientBtn: {
    backgroundColor: c.elevate,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: c.border,
  },
  messageClientBtnText: {
    fontSize: 16,
    fontWeight: "600",
    color: c.textMid,
  },

  // =============================================
  // AWAITING COMPLETION / COMPLETED STATES
  // =============================================
  awaitingCompletionCard: {
    backgroundColor: c.elevate,
    borderRadius: 16,
    padding: 20,
    marginTop: 16,
    alignItems: "center",
    borderWidth: 1,
    borderColor: c.border,
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
    color: c.text,
    textAlign: "center",
    marginBottom: 4,
  },
  awaitingMeta: {
    fontSize: 13,
    color: c.textMid,
    textAlign: "center",
  },

  completedCard: {
    backgroundColor: c.elevate,
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
    color: c.text,
  },
  completedMeta: {
    fontSize: 15,
    color: c.textMid,
    textAlign: "center",
    lineHeight: 22,
  },
  reviewPromptCard: {
    backgroundColor: c.elevate,
    borderRadius: 16,
    padding: 20,
    marginTop: 16,
    borderWidth: 1,
    borderColor: c.border,
    alignItems: "center",
  },
  reviewPromptTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: c.text,
    textAlign: "center",
    marginBottom: 4,
  },
  reviewPromptSubtitle: {
    fontSize: 14,
    color: c.textMid,
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
    color: c.textMid,
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
    backgroundColor: c.elevate,
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
    color: c.text,
    marginTop: 12,
  },
  sheetSubtitle: {
    fontSize: 14,
    color: c.textMid,
    marginTop: 8,
    lineHeight: 20,
  },
  sheetSectionLabel: {
    fontSize: 15,
    fontWeight: "600",
    color: c.textMid,
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
    paddingBottom: 8,
  },
  sheetFieldLabel: {
    fontSize: 13,
    fontWeight: "500",
    color: c.textMid,
    marginBottom: 6,
  },
  sheetAmountInputContainer: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#D1D5DB",
    borderRadius: 10,
    backgroundColor: c.elevate,
    paddingHorizontal: 12,
  },
  sheetCurrencySymbol: {
    fontSize: 16,
    fontWeight: "600",
    color: c.textMid,
    marginRight: 4,
  },
  sheetAmountInput: {
    flex: 1,
    fontSize: 16,
    paddingVertical: 12,
    color: c.text,
  },
  sheetDropdown: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderWidth: 1,
    borderColor: "#D1D5DB",
    borderRadius: 10,
    backgroundColor: c.elevate,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  sheetDropdownText: {
    fontSize: 15,
    color: c.text,
  },
  sheetNotesInput: {
    borderWidth: 1,
    borderColor: "#D1D5DB",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    backgroundColor: c.elevate,
    minHeight: 80,
    color: c.text,
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
    color: c.textMid,
  },

  // ---------------------------------------------------------------
  // Mark-as-complete sheet (redesigned). All typography on
  // Public Sans / DM Sans via FontFamily tokens; structure uses the
  // pill-container pattern (elevate2 bg + borderStrong, radius 18)
  // that matches the Request page / Quote Builder Preview.
  // ---------------------------------------------------------------
  mcSheetHeader: {
    marginTop: 4,
  },
  mcSheetEyebrow: {
    fontFamily: FontFamily.headerBold,
    fontSize: 11,
    letterSpacing: 1.2,
    textTransform: "uppercase",
    color: c.textMuted,
    marginBottom: 8,
  },
  mcSheetTitle: {
    fontFamily: FontFamily.headerBold,
    fontSize: 22,
    lineHeight: 26,
    letterSpacing: -0.4,
    color: c.text,
  },
  mcSheetSubtitle: {
    fontFamily: FontFamily.bodyRegular,
    fontSize: 14,
    lineHeight: 20,
    color: c.textMid,
    marginTop: 6,
  },
  mcPillCard: {
    backgroundColor: c.elevate2,
    borderWidth: 1,
    borderColor: c.borderStrong,
    borderRadius: 18,
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 16,
  },
  mcPillEyebrow: {
    fontFamily: FontFamily.headerBold,
    fontSize: 11,
    letterSpacing: 1.2,
    textTransform: "uppercase",
    color: c.textMuted,
    marginBottom: 10,
  },
  mcFieldLabel: {
    fontFamily: FontFamily.bodyMedium,
    fontSize: 13,
    color: c.textMid,
    marginBottom: 6,
  },
  mcAmountRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  mcCurrency: {
    fontFamily: FontFamily.headerSemibold,
    fontSize: 22,
    color: c.text,
  },
  mcAmountInput: {
    flex: 1,
    fontFamily: FontFamily.headerSemibold,
    fontSize: 22,
    letterSpacing: -0.3,
    color: c.text,
    paddingVertical: 6,
    // transparent — container already provides the bordered pill look
  },
  mcPillDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: c.border,
    marginVertical: 14,
  },
  mcDropdown: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 4,
  },
  mcDropdownText: {
    fontFamily: FontFamily.bodyMedium,
    fontSize: 15,
    color: c.text,
  },
  mcNotesInput: {
    fontFamily: FontFamily.bodyRegular,
    fontSize: 14,
    lineHeight: 20,
    color: c.text,
    minHeight: 72,
    padding: 0,
    // no inner border — the outer pill already reads as a container
  },
  mcActionRow: {
    flexDirection: "row",
    gap: 10,
  },
  mcActionGhost: {
    flex: 1,
    height: 52,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
  },
  mcActionGhostText: {
    fontFamily: FontFamily.headerSemibold,
    fontSize: 15,
    letterSpacing: -0.1,
  },
  mcActionPrimary: {
    flex: 1,
    height: 52,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
  },
  mcActionPrimaryText: {
    fontFamily: FontFamily.headerSemibold,
    fontSize: 15,
    color: "#FFFFFF",
    letterSpacing: -0.1,
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
    backgroundColor: c.elevate,
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
    color: c.text,
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
    color: c.textMid,
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
    backgroundColor: c.elevate,
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
    color: c.text,
    textAlign: "center",
  },
  clientCompletionSubtitle: {
    fontSize: 14,
    color: c.textMid,
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
    color: c.textMid,
    textDecorationLine: "underline",
  },
  clientCompletedCard: {
    backgroundColor: c.elevate,
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
    color: c.textMid,
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
    backgroundColor: c.elevate,
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
    color: c.textMid,
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
    color: c.text,
    marginBottom: 8,
  },
  issueDetailsText: {
    fontSize: 14,
    color: c.textMid,
    fontStyle: "italic",
    lineHeight: 20,
  },
  issueActionsContainer: {
    marginTop: 16,
  },
  issueActionsTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: c.text,
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
    backgroundColor: c.elevate,
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
    color: c.textMid,
    textAlign: "center",
  },
  messageClientBtn: {
    backgroundColor: c.elevate,
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 24,
    width: "100%",
    alignItems: "center",
  },
  messageClientBtnText: {
    fontSize: 16,
    fontWeight: "600",
    color: c.text,
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
    backgroundColor: c.elevate,
    borderRadius: 16,
    padding: 20,
    alignItems: "center",
    marginTop: 16,
    borderWidth: 1,
    borderColor: c.border,
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

  // -------- Quote Overview: sticky chevron + new blocks
  qoStickyChevron: {
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
  // Inline accept/decline row at the bottom of the Quote Overview
  // (client only) — replaces the old sticky bottom dock.
  qoInlineActions: {
    flexDirection: "row",
    gap: 10,
    marginTop: 32,
  },
  qoActionGhost: {
    width: 64,
    height: 52,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  qoActionPrimary: {
    flex: 1,
    height: 52,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
  },
  qoActionPrimaryText: {
    fontFamily: "PublicSans_600SemiBold",
    fontSize: 15,
    color: "#fff",
    letterSpacing: -0.1,
  },
  // -------- Quote Overview: new Client Request + Quote Breakdown
  // blocks. Same shape as the Client Request page + Quote Builder
  // Preview modal. All typography on DM Sans / Public Sans.
  qoClientRequestBlock: { marginBottom: 18 },
  qoEyebrowRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 8,
  },
  qoEyebrowDot: { width: 6, height: 6, borderRadius: 3 },
  qoEyebrow: {
    fontFamily: "PublicSans_700Bold",
    fontSize: 11,
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  qoHeroTitle: {
    fontFamily: "PublicSans_700Bold",
    fontSize: 30,
    lineHeight: 36,
    letterSpacing: -0.8,
    marginTop: 4,
  },
  qoFactsRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 20,
  },
  qoFactPill: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 14,
    borderWidth: 1,
  },
  qoFactLabel: {
    fontFamily: "PublicSans_700Bold",
    fontSize: 10,
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  qoFactValue: {
    fontFamily: "PublicSans_700Bold",
    fontSize: 16,
    letterSpacing: -0.3,
    marginTop: 4,
  },
  qoSectionLabel: {
    fontFamily: "PublicSans_700Bold",
    fontSize: 11,
    letterSpacing: 1,
    textTransform: "uppercase",
    marginTop: 24,
    marginBottom: 8,
  },
  qoNotesCard: {
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
  },
  qoNotesText: {
    fontFamily: "DMSans_400Regular",
    fontSize: 14,
    lineHeight: 21,
  },
  qoPhotoThumb: {
    width: 120,
    height: 120,
    borderRadius: 12,
    borderWidth: 1,
    overflow: "hidden",
  },

  // Quote Breakdown block — mirrors builder Preview
  qoQuoteBreakdownBlock: { marginTop: 12, marginBottom: 18 },
  qoTotalRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 4,
    marginTop: 8,
  },
  qoTotalPound: {
    fontFamily: "PublicSans_600SemiBold",
    fontSize: 22,
    lineHeight: 32,
  },
  qoTotalNumber: {
    fontFamily: "PublicSans_700Bold",
    fontSize: 44,
    lineHeight: 46,
    letterSpacing: -1.5,
  },
  qoTotalSubtitle: {
    fontFamily: "DMSans_400Regular",
    fontSize: 12,
    marginTop: 6,
  },
  qoLedger: { marginTop: 20 },
  qoLedgerEmpty: {
    fontFamily: "DMSans_400Regular",
    fontSize: 14,
    paddingVertical: 16,
  },
  qoLine: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    borderBottomWidth: 1,
    gap: 10,
  },
  qoLineIndex: {
    width: 22,
    height: 22,
    borderRadius: 6,
    alignItems: "center",
    justifyContent: "center",
  },
  qoLineIndexText: {
    fontFamily: "PublicSans_600SemiBold",
    fontSize: 11,
  },
  qoLineTitle: {
    fontFamily: "PublicSans_600SemiBold",
    fontSize: 15,
    letterSpacing: -0.2,
  },
  qoLineDetail: {
    fontFamily: "DMSans_400Regular",
    fontSize: 12,
    marginTop: 2,
  },
  qoLineQty: {
    fontFamily: "DMSans_400Regular",
    fontSize: 12,
    marginTop: 2,
  },
  qoLineAmount: {
    fontFamily: "PublicSans_600SemiBold",
    fontSize: 15,
    letterSpacing: -0.2,
  },
  qoSummaryRow: {
    borderBottomWidth: 0,
    paddingTop: 16,
    paddingBottom: 2,
  },
  qoSummaryLabel: {
    fontFamily: "DMSans_400Regular",
    fontSize: 13,
  },
  qoGrandRow: {
    borderBottomWidth: 0,
    borderTopWidth: 1,
    paddingTop: 10,
  },
  qoGrandLabel: {
    fontFamily: "PublicSans_700Bold",
    fontSize: 15,
  },
  qoGrandAmount: {
    fontFamily: "PublicSans_700Bold",
    fontSize: 17,
    letterSpacing: -0.2,
  },
  qoTermsCard: {
    borderRadius: 18,
    borderWidth: 1,
    overflow: "hidden",
  },
  qoTermRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    paddingHorizontal: 14,
    gap: 12,
  },
  qoTermLabel: {
    fontFamily: "DMSans_400Regular",
    fontSize: 14,
    flex: 1,
  },
  qoTermValue: {
    fontFamily: "PublicSans_600SemiBold",
    fontSize: 14,
    letterSpacing: -0.1,
    maxWidth: 200,
  },
  qoTermsDivider: {
    height: 1,
    marginLeft: 14,
  },
  });
}
