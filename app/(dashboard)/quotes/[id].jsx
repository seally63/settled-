// app/(dashboard)/quotes/[id].jsx
import {
  StyleSheet,
  View,
  ScrollView,
  Pressable,
  useColorScheme,
  Image,
  Modal,
  Platform,
  Alert,
  TextInput,
  FlatList,
  Dimensions,
} from "react-native";
import { useEffect, useState, useMemo, useCallback } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import CustomDateTimePicker from "../../../components/CustomDateTimePicker";

import { useQuotes } from "../../../hooks/useQuotes";
import { useUser } from "../../../hooks/useUser";
import { supabase } from "../../../lib/supabase";
import ThemedView from "../../../components/ThemedView";
import ThemedText from "../../../components/ThemedText";
import Spacer from "../../../components/Spacer";
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

// Same parser we used on the client "Your request" screen
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

const CELL = 96;
const SCREEN_WIDTH = Dimensions.get("window").width;
const PRIMARY = "#684477";

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

  const scheme = useColorScheme();
  const iconColor = scheme === "dark" ? "#fff" : "#000";

  const { fetchQuoteById } = useQuotes();
  const [quote, setQuote] = useState(null);
  const [loading, setLoading] = useState(true);
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

  // Appointment (DB-backed)
  const [appointment, setAppointment] = useState(null);
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

  const closeViewer = useCallback(() => {
    setViewer((v) => ({ ...v, open: false }));
  }, []);

  const handleZoomScrollEndDrag = (e) => {
    const native = e?.nativeEvent || {};
    const contentOffset = native.contentOffset || {};
    const zoomScale = native.zoomScale;

    // If user pulled down while at min zoom, close the viewer
    if (zoomScale && zoomScale <= 1.01 && contentOffset.y < -40) {
      closeViewer();
    }
  };

  const hasAttachments = attachments.length > 0;

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
            setAppointment(null);

            // Fallback name from quote if we don't already have one
            if (row?.full_name) {
              setOtherName(row.full_name);
            }
          }
          return;
        }

        // 2) Load request summary
        try {
          const { data: reqRow, error: reqErr } = await supabase
            .from("quote_requests")
            .select(
              "id, details, created_at, budget_band, job_outcode, status, suggested_title"
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

        // 4) Load latest appointment (RPC)
        try {
          setApptLoading(true);
          const { data: apptData, error: apptErr } =
            await supabase.rpc("rpc_get_latest_request_appointment", {
              p_request_id: reqId,
            });

          if (!mounted) return;

          if (apptErr) {
            console.warn(
              "appointment load error",
              apptErr.message || apptErr
            );
            setAppointment(null);
          } else {
            const appt = Array.isArray(apptData) ? apptData[0] : apptData;
            setAppointment(appt || null);
          }
        } catch (e) {
          if (mounted) {
            console.warn("appointment load error", e?.message || e);
            setAppointment(null);
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
  }, [params.id, fetchQuoteById, userRole]);

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

  // Scheduling helpers
  const openSchedulePage = () => {
    // Reset form each time
    setApptTitle("");
    setApptDateTime(null);
    setHasDate(false);
    setHasTime(false);
    setPickerVisible(false);
    setPickerMode("date");
    setPickerDraftDate(new Date());
    setScheduling(true);
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

      // Reload the appointment immediately after creation
      const { data: apptData, error: apptErr } = await supabase.rpc(
        "rpc_get_latest_request_appointment",
        { p_request_id: reqId }
      );

      if (!apptErr && apptData) {
        const appt = Array.isArray(apptData) ? apptData[0] : apptData;
        setAppointment(appt || null);
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

              // Reload the appointment
              const reqId = quote?.request_id || quote?.requestId || request?.id || null;
              if (reqId) {
                const { data: apptData, error: apptErr } = await supabase.rpc(
                  "rpc_get_latest_request_appointment",
                  { p_request_id: reqId }
                );

                if (!apptErr && apptData) {
                  const appt = Array.isArray(apptData) ? apptData[0] : apptData;
                  setAppointment(appt || null);
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

              // Reload the appointment
              const reqId = quote?.request_id || quote?.requestId || request?.id || null;
              if (reqId) {
                const { data: apptData, error: apptErr } = await supabase.rpc(
                  "rpc_get_latest_request_appointment",
                  { p_request_id: reqId }
                );

                if (!apptErr && apptData) {
                  const appt = Array.isArray(apptData) ? apptData[0] : apptData;
                  setAppointment(appt || null);
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

  if (loading) {
    return (
      <ThemedView style={styles.container}>
        <Spacer />
        <ThemedText>Loading…</ThemedText>
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

  const appointmentName = appointment?.notes || "Appointment";
  const locationText =
    parsedDetails.address ||
    (request?.job_outcode
      ? `Area ${request.job_outcode}`
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

  const hasExistingAppointment = !!appointment?.id;
  const appointmentDateLabel =
    appointment?.scheduled_at &&
    new Date(appointment.scheduled_at).toLocaleString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });

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
  // ORIGINAL QUOTE DETAILS PAGE
  // --------------------------------------------------
  return (
    <ThemedView style={styles.container}>
      {/* Header - Profile-style like client version */}
      <View style={[styles.header, { paddingTop: insets.top + 16 }]}>
        <View style={styles.headerRow}>
          <ThemedText style={styles.headerTitle}>Quote Overview</ThemedText>
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

      {/* Hero summary card */}
      <View style={styles.heroCard}>
        <View style={styles.heroTopRow}>
          <View style={{ flex: 1 }}>
            {/* For trades: show client name prominently, then job title, then location */}
            {userRole === 'trades' ? (
              <>
                <ThemedText style={styles.heroClientName}>
                  {displayName}
                </ThemedText>
                <ThemedText style={styles.heroJobTitle}>
                  {quote.project_title || parsedDetails.title || "Quote"}
                </ThemedText>
                {request?.job_outcode && (
                  <ThemedText style={styles.heroLocation} variant="muted">
                    {request.job_outcode}
                  </ThemedText>
                )}
              </>
            ) : (
              <>
                <ThemedText style={styles.heroTitle}>
                  {tradeBusiness || "Tradesperson"}
                </ThemedText>
                <ThemedText style={styles.heroProject} variant="muted">
                  {quote.project_title || "Project"}
                </ThemedText>
              </>
            )}
          </View>

          {isAccepted && (
            <View style={styles.statusChipAccepted}>
              <Ionicons name="checkmark-circle" size={16} color="#16A34A" />
              <ThemedText style={styles.statusChipAcceptedText}>
                Accepted
              </ThemedText>
            </View>
          )}
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

      {/* Hero-linked appointment callout (like your green block) */}
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
                  ? (userRole === 'client'
                      ? `${tradeBusiness || 'The tradesperson'} proposed an appointment`
                      : "Appointment scheduled"
                    )
                  : "Quote accepted"}
              </ThemedText>
              <ThemedText style={styles.heroNoteText} variant="muted">
                {hasExistingAppointment
                  ? (userRole === 'client'
                      ? `Survey visit on ${appointmentDateLabel}${appointment?.location ? ` at ${appointment.location}` : ''}`
                      : `${appointmentDateLabel}${appointment?.location ? ` • ${appointment.location}` : ""}${appointment?.status === 'proposed' ? ' • Awaiting client confirmation' : ''}`
                    )
                  : (userRole === 'client'
                      ? `${tradeBusiness || 'The tradesperson'} will contact you to schedule a survey visit.`
                      : "The client accepted your quote. Schedule a visit to confirm the work in person."
                    )}
              </ThemedText>
            </View>
          </View>

          {/* Trade: Show schedule button if no appointment */}
          {!hasExistingAppointment && userRole === 'trades' && (
            <Pressable
              onPress={openSchedulePage}
              style={styles.heroNoteBtn}
              hitSlop={6}
            >
              <ThemedText style={styles.heroNoteBtnText}>
                Schedule appointment
              </ThemedText>
            </Pressable>
          )}

          {/* Client: Show Accept/Decline buttons if appointment is proposed */}
          {hasExistingAppointment && userRole === 'client' && appointment?.status === 'proposed' && (
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
          {hasExistingAppointment && userRole === 'client' && appointment?.status === 'confirmed' && (
            <View style={styles.heroNoteConfirmed}>
              <Ionicons name="checkmark-circle" size={18} color="#16A34A" />
              <ThemedText style={styles.heroNoteConfirmedText}>
                You confirmed this appointment
              </ThemedText>
            </View>
          )}
        </View>
      )}

      <ScrollView
        contentContainerStyle={styles.scrollContents}
        showsVerticalScrollIndicator
      >
        <Spacer size={8} />

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

              <Spacer size={16} />

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

              {!!request.job_outcode && (
                <View style={styles.requestDetailRow}>
                  <Ionicons name="location-outline" size={18} color="#6B7280" />
                  <View style={styles.requestDetailContent}>
                    <ThemedText style={styles.requestDetailLabel}>Area</ThemedText>
                    <ThemedText style={styles.requestDetailValue}>{request.job_outcode}</ThemedText>
                  </View>
                </View>
              )}

              {!!request.budget_band && (
                <View style={styles.requestDetailRow}>
                  <Ionicons name="cash-outline" size={18} color="#6B7280" />
                  <View style={styles.requestDetailContent}>
                    <ThemedText style={styles.requestDetailLabel}>Budget</ThemedText>
                    <ThemedText style={styles.requestDetailValue}>{request.budget_band}</ThemedText>
                  </View>
                </View>
              )}

              {!!parsedDetails.start && (
                <View style={styles.requestDetailRow}>
                  <Ionicons name="time-outline" size={18} color="#6B7280" />
                  <View style={styles.requestDetailContent}>
                    <ThemedText style={styles.requestDetailLabel}>Start date</ThemedText>
                    <ThemedText style={styles.requestDetailValue}>{parsedDetails.start}</ThemedText>
                  </View>
                </View>
              )}

              {!!parsedDetails.refit && (
                <View style={styles.requestDetailRow}>
                  <Ionicons name="construct-outline" size={18} color="#6B7280" />
                  <View style={styles.requestDetailContent}>
                    <ThemedText style={styles.requestDetailLabel}>Job type</ThemedText>
                    <ThemedText style={styles.requestDetailValue}>{parsedDetails.refit}</ThemedText>
                  </View>
                </View>
              )}

              {!!parsedDetails.notes && (
                <View style={styles.requestDetailRow}>
                  <Ionicons name="document-text-outline" size={18} color="#6B7280" />
                  <View style={styles.requestDetailContent}>
                    <ThemedText style={styles.requestDetailLabel}>Notes</ThemedText>
                    <ThemedText style={styles.requestDetailValue}>{parsedDetails.notes}</ThemedText>
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

                  <Spacer size={12} />
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

        <Spacer size={20} />
      </ScrollView>

      {/* Image preview modal – zoom + swipe + pull-down-to-dismiss */}
      {viewer.open && hasAttachments && (
        <Modal
          visible={viewer.open}
          transparent
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
              initialScrollIndex={
                attachments.length > 0
                  ? Math.min(
                      Math.max(viewer.index || 0, 0),
                      attachments.length - 1
                    )
                  : 0
              }
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
              renderItem={({ item: url }) => (
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
                  onScrollEndDrag={handleZoomScrollEndDrag}
                >
                  <Image
                    source={{ uri: url }}
                    style={styles.modalImage}
                    resizeMode="contain"
                    onError={(e) =>
                      console.warn(
                        "preview error (trade quote):",
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
  // main quote details container
  container: {
    flex: 1,
    alignItems: "stretch",
    backgroundColor: "#F9FAFB",
  },

  // separate container for scheduling page
  scheduleContainer: {
    flex: 1,
    alignItems: "stretch",
    backgroundColor: "#F9FAFB",
    paddingTop: Platform.OS === "ios" ? 60 : 20,
  },

  // Profile-style header (matching client version)
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

  scrollContents: { paddingBottom: 40, padding: 20 },

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
    marginHorizontal: 16,
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
    marginBottom: 12,
  },
  sectionHeaderText: {
    fontSize: 20,
    fontWeight: "700",
    color: "#111827",
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
    backgroundColor: "#684477",
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
    paddingBottom: 10,
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
    backgroundColor: "#684477",
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
    color: "#684477",
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
});
