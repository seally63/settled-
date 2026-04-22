// app/(dashboard)/quotes/schedule.jsx - Standalone scheduling page for trades
import {
  StyleSheet,
  View,
  ScrollView,
  Pressable,
  TextInput,
  Alert,
  Platform,
  ActivityIndicator,
} from "react-native";
import { useState, useEffect, useMemo } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useUser } from "../../../hooks/useUser";
import { useTheme } from "../../../hooks/useTheme";
import { supabase } from "../../../lib/supabase";
import ThemedView from "../../../components/ThemedView";
import ThemedText from "../../../components/ThemedText";
import Spacer from "../../../components/Spacer";
import CustomDateTimePicker from "../../../components/CustomDateTimePicker";
import { Colors } from "../../../constants/Colors";
import { FontFamily, Radius, TypeVariants } from "../../../constants/Typography";

const PRIMARY = Colors.primary;

// Appointment types. The `id` is stored on appointments.kind (see
// the 20260428 migration) so downstream screens can branch on it
// without parsing the title string. `requiresQuote` is the client-
// side gate; the DB RPC enforces the same rule server-side.
const APPOINTMENT_TYPES = [
  { id: 'survey',    label: 'Survey',             icon: 'search-outline',        requiresQuote: false },
  { id: 'design',    label: 'Design consultation',icon: 'color-palette-outline', requiresQuote: false },
  { id: 'start_job', label: 'Start Job',          icon: 'hammer-outline',        requiresQuote: true  },
  { id: 'followup',  label: 'Follow-up visit',    icon: 'refresh-outline',       requiresQuote: true  },
  { id: 'final',     label: 'Final inspection',   icon: 'checkmark-done-outline',requiresQuote: true  },
];

// Shared lookup so other screens (Recent Activity card render,
// bottom sheet) can resolve the icon + display label for a kind
// value without importing the full schedule.jsx file.
export function getAppointmentTypeMeta(kind) {
  return APPOINTMENT_TYPES.find((t) => t.id === kind)
    || { id: 'survey', label: 'Appointment', icon: 'calendar-outline', requiresQuote: false };
}

function getInitials(name) {
  if (!name) return "?";
  const parts = String(name).trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return (
    parts[0].charAt(0).toUpperCase() +
    parts[parts.length - 1].charAt(0).toUpperCase()
  );
}

export default function ScheduleAppointment() {
  const params = useLocalSearchParams();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useUser();
  const { colors: c, dark } = useTheme();
  const styles = useMemo(() => makeStyles(c, dark), [c, dark]);

  // Params from navigation
  const requestId = Array.isArray(params.requestId)
    ? params.requestId[0]
    : params.requestId;
  const quoteId = Array.isArray(params.quoteId)
    ? params.quoteId[0]
    : params.quoteId;
  const clientNameParam = Array.isArray(params.clientName)
    ? params.clientName[0]
    : params.clientName;
  const titleParam = Array.isArray(params.title)
    ? params.title[0]
    : params.title;
  const postcodeParam = Array.isArray(params.postcode)
    ? params.postcode[0]
    : params.postcode;

  // State
  const [selectedType, setSelectedType] = useState(null); // appointment type id
  const [selectedQuoteId, setSelectedQuoteId] = useState(null);
  const [apptNote, setApptNote] = useState(""); // optional note
  const [apptDateTime, setApptDateTime] = useState(null);
  const [hasDate, setHasDate] = useState(false);
  const [hasTime, setHasTime] = useState(false);
  const [busy, setBusy] = useState(false);
  // Accepted quotes on this request (trade can only link an
  // appointment to an accepted-and-still-active quote). Loaded
  // below alongside request details.
  const [acceptedQuotes, setAcceptedQuotes] = useState([]);

  // Picker state
  const [pickerVisible, setPickerVisible] = useState(false);
  const [pickerMode, setPickerMode] = useState("date");
  const [pickerDraftDate, setPickerDraftDate] = useState(new Date());

  // Client info from request
  const [clientName, setClientName] = useState(clientNameParam || "");
  const [jobTitle, setJobTitle] = useState(titleParam ? decodeURIComponent(titleParam) : "");
  const [serviceTypeName, setServiceTypeName] = useState("");
  const [serviceCategoryName, setServiceCategoryName] = useState("");
  const [suggestedTitle, setSuggestedTitle] = useState(
    titleParam ? decodeURIComponent(titleParam) : ""
  );
  const [location, setLocation] = useState(postcodeParam || "");
  const [loadingData, setLoadingData] = useState(true);

  // Load request details if we have a requestId. Uses the same robust
  // pattern as the quote builder: plain embedded joins on service_types
  // / service_categories, separate safety-net lookups, and a
  // profiles.full_name fallback keyed on requester_id. This fixes the
  // "APPOINTMENT FOR CLIENT · PROJECT" fallback that the earlier
  // version hit whenever the RPCs returned nothing.
  useEffect(() => {
    if (!requestId) {
      setLoadingData(false);
      return;
    }

    (async () => {
      try {
        setLoadingData(true);

        const { data: reqData } = await supabase
          .from("quote_requests")
          .select(`
            id,
            postcode,
            requester_id,
            suggested_title,
            service_type_id,
            category_id,
            service_types (id, name),
            service_categories (id, name)
          `)
          .eq("id", requestId)
          .maybeSingle();

        let svcName = reqData?.service_types?.name || null;
        let catName = reqData?.service_categories?.name || null;

        if (!svcName && reqData?.service_type_id) {
          try {
            const { data: st } = await supabase
              .from("service_types")
              .select("name")
              .eq("id", reqData.service_type_id)
              .maybeSingle();
            if (st?.name) svcName = st.name;
          } catch {}
        }
        if (!catName && reqData?.category_id) {
          try {
            const { data: sc } = await supabase
              .from("service_categories")
              .select("name")
              .eq("id", reqData.category_id)
              .maybeSingle();
            if (sc?.name) catName = sc.name;
          } catch {}
        }

        if (reqData?.suggested_title) {
          setJobTitle(reqData.suggested_title);
          setSuggestedTitle(reqData.suggested_title);
        } else if (titleParam) {
          setJobTitle(decodeURIComponent(titleParam));
        }
        if (reqData?.postcode) setLocation(reqData.postcode);
        if (svcName) setServiceTypeName(svcName);
        if (catName) setServiceCategoryName(catName);

        // Client name: RPC → conversations → profiles (source of truth)
        let resolvedName = null;
        try {
          const { data: contactData } = await supabase.rpc(
            "rpc_get_client_contact_for_request",
            { p_request_id: requestId }
          );
          resolvedName =
            contactData?.name_display || contactData?.name || null;
        } catch {}
        if (!resolvedName) {
          try {
            const { data: convData } = await supabase.rpc(
              "rpc_list_conversations",
              { p_limit: 100 }
            );
            const conv = (convData || []).find((c) => c.request_id === requestId);
            resolvedName = conv?.other_party_name || null;
          } catch {}
        }
        if (!resolvedName && reqData?.requester_id) {
          try {
            const { data: prof } = await supabase
              .from("profiles")
              .select("full_name")
              .eq("id", reqData.requester_id)
              .maybeSingle();
            resolvedName = prof?.full_name || null;
          } catch {}
        }
        if (resolvedName) setClientName(resolvedName);
      } catch (e) {
        console.warn("[SCHEDULE] Failed to load request details:", e);
      } finally {
        setLoadingData(false);
      }
    })();
  }, [requestId, titleParam]);

  // Load accepted quotes for this request so the trade can link the
  // appointment to one. Only surfaces quotes that are still active
  // (not completed / expired / declined).
  useEffect(() => {
    if (!requestId || !user?.id) return;
    let alive = true;
    (async () => {
      try {
        const { data } = await supabase
          .from("tradify_native_app_db")
          .select("id, project_title, grand_total, status, issued_at, created_at")
          .eq("trade_id", user.id)
          .eq("request_id", requestId)
          .in("status", ["accepted", "awaiting_completion"]);
        if (!alive) return;
        const list = (data || [])
          .filter((q) => {
            const s = String(q.status || "").toLowerCase();
            return s === "accepted" || s === "awaiting_completion";
          })
          .sort(
            (a, b) =>
              new Date(b.issued_at || b.created_at || 0).getTime() -
              new Date(a.issued_at || a.created_at || 0).getTime()
          );
        setAcceptedQuotes(list);
        // If a quoteId was passed in via URL params, preselect it.
        if (quoteId && list.find((q) => q.id === quoteId)) {
          setSelectedQuoteId(quoteId);
        }
      } catch (e) {
        console.warn("[SCHEDULE] Failed to load accepted quotes:", e);
      }
    })();
    return () => {
      alive = false;
    };
  }, [requestId, user?.id, quoteId]);

  // Get the selected type object
  const selectedTypeObj = APPOINTMENT_TYPES.find(t => t.id === selectedType);
  const selectedQuote = acceptedQuotes.find((q) => q.id === selectedQuoteId);
  const quoteRequired = !!selectedTypeObj?.requiresQuote;

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
    if (!selectedType) {
      Alert.alert(
        "Select visit type",
        "Please select what type of visit this is."
      );
      return { ok: false };
    }

    // Required quote link for post-quote types (start_job, followup,
    // final). Pre-quote types (survey, design) can be scheduled
    // without a linked quote, and the "Don't link" option explicitly
    // picks null.
    if (quoteRequired && !selectedQuoteId) {
      Alert.alert(
        "Link an accepted quote",
        `${selectedTypeObj.label} must be linked to an accepted quote. If you haven't sent one yet, do that first.`
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

    // Get the label from the selected type
    const typeLabel = selectedTypeObj?.label || "Appointment";
    return { ok: true, typeLabel };
  };

  const performScheduleAppointment = async (typeLabel) => {
    if (busy) return;

    if (!requestId) {
      Alert.alert(
        "Cannot schedule appointment",
        "We couldn't find the related request for this appointment."
      );
      return;
    }

    try {
      setBusy(true);

      // Appointment insert. As of the 20260428 migration this RPC
      // stores `kind` on the appointment row and no longer inserts
      // a matching messages row — the conversation is text-only;
      // appointments surface on the project screen / Recent
      // Activity only.
      const noteText = apptNote.trim();

      const { data, error } = await supabase.rpc(
        "rpc_send_appointment_message",
        {
          p_request_id: requestId,
          // Prefer the picker's selection over the URL param. Null
          // is valid for optional kinds (survey / design); required
          // kinds are already validated client-side above.
          p_quote_id: selectedQuoteId || quoteId || null,
          p_scheduled_at: apptDateTime.toISOString(),
          p_title: typeLabel,
          p_location: location || null,
          p_kind: selectedType,
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

      // Show success message. Navigate back on OK. We defer the
      // navigation one tick with setTimeout(0) so it runs AFTER the
      // Alert's native onPress callback finishes — otherwise
      // `router.back()` can be a no-op on some physical devices
      // because it fires inside the same native callback the Alert
      // is dismissing from. If for any reason there's nothing to
      // pop (fresh deep-link), fall back to the Projects index.
      Alert.alert(
        "Appointment sent!",
        "The appointment has been sent to messages. The client can accept or decline it.",
        [
          {
            text: "OK",
            onPress: () => {
              setTimeout(() => {
                if (router.canGoBack?.()) {
                  router.back();
                } else {
                  router.replace("/(dashboard)/quotes");
                }
              }, 0);
            },
          },
        ],
        { cancelable: false }
      );
    } catch (e) {
      console.warn("appointment create error", e?.message || e);
      Alert.alert(
        "Could not schedule appointment",
        e?.message || "Something went wrong, please try again."
      );
    } finally {
      setBusy(false);
    }
  };

  const handleConfirmSchedule = () => {
    if (busy) return;

    const { ok, typeLabel } = validateAppointment();
    if (!ok) return;

    const whenStr = apptDateTime.toLocaleString();

    Alert.alert("Schedule this appointment?", `"${typeLabel}"\n\n${whenStr}`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Schedule",
        style: "default",
        onPress: () => performScheduleAppointment(typeLabel),
      },
    ]);
  };

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

  // Eyebrow is just "APPOINTMENT FOR {CLIENT NAME}" — the big title
  // below already carries the specific service name, no need to
  // duplicate it on the eyebrow line.
  const specificService = (() => {
    if (serviceTypeName) return serviceTypeName;
    if (suggestedTitle && suggestedTitle.includes(" - ")) {
      const parts = suggestedTitle.split(" - ").map((s) => s.trim());
      if (parts.length >= 2) return parts.slice(1).join(" - ");
    }
    if (suggestedTitle) return suggestedTitle;
    if (serviceCategoryName) return serviceCategoryName;
    return "Project";
  })();
  const eyebrow = `APPOINTMENT FOR ${(clientName || "CLIENT").toUpperCase()}`;
  const displayLocation = location || "Location not specified";

  // iOS simulator only: the home-indicator gesture zone sits higher on
  // the simulator than on a physical device and can eat taps in the
  // bottom ~130px. Same fix as the floating FAB on the Client Request
  // page — bump the scroll-content's bottom padding so the CTA button
  // clears the gesture zone.
  const Device = require("expo-device");
  const isSimulator = Device.isDevice === false;
  const scrollBottomPad = isSimulator ? 160 : Math.max(insets.bottom + 40, 60);

  return (
    <ThemedView style={styles.container}>
      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          { paddingTop: insets.top + 10, paddingBottom: scrollBottomPad },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* Inline chrome — transparent chevron back, scrolls with the
            content (matches the quote builder). No header row, no block
            background behind it.                                     */}
        <View style={styles.inlineChrome}>
          <Pressable
            onPress={() => {
              if (busy) return;
              // Pop this screen off the stack — the originating
              // Client Request screen is already below us and will
              // re-focus via its `useFocusEffect` reload. We do NOT
              // use `router.replace(pathname)` here because that
              // PUSHES a second copy of the Client Request screen
              // on top of the existing one (visible as a forward
              // animation + a stale duplicate underneath).
              if (router.canGoBack?.()) {
                router.back();
              } else {
                router.replace("/(dashboard)/quotes");
              }
            }}
            hitSlop={10}
            disabled={busy}
            style={({ pressed }) => [styles.iconBtn, pressed && { opacity: 0.6 }]}
            accessibilityLabel="Back"
          >
            <Ionicons name="chevron-back" size={18} color={c.text} />
          </Pressable>
          <View style={{ flex: 1 }} />
        </View>
        {/* Hero — builder-style eyebrow + big title, no card/box.      */}
        <View style={styles.hero}>
          <ThemedText style={styles.eyebrow} numberOfLines={2}>
            {eyebrow}
          </ThemedText>
          <ThemedText style={styles.heroTitle} numberOfLines={2}>
            {specificService}
          </ThemedText>
        </View>

        {/* What type of visit? */}
        <ThemedText style={styles.sectionLabel}>What type of visit?</ThemedText>
        <View style={styles.typeCardsContainer}>
          {APPOINTMENT_TYPES.map((type) => {
            const isSelected = selectedType === type.id;
            return (
              <Pressable
                key={type.id}
                style={[
                  styles.typeCard,
                  isSelected && styles.typeCardSelected,
                ]}
                onPress={() => setSelectedType(type.id)}
                disabled={busy}
              >
                <View style={styles.typeCardContent}>
                  <Ionicons
                    name={type.icon}
                    size={20}
                    color={isSelected ? PRIMARY : "#6B7280"}
                    style={styles.typeCardIcon}
                  />
                  <ThemedText
                    style={[
                      styles.typeCardLabel,
                      isSelected && styles.typeCardLabelSelected,
                    ]}
                  >
                    {type.label}
                  </ThemedText>
                </View>
                <View
                  style={[
                    styles.typeCardRadio,
                    isSelected && styles.typeCardRadioSelected,
                  ]}
                >
                  {isSelected && <View style={styles.typeCardRadioInner} />}
                </View>
              </Pressable>
            );
          })}
        </View>

        {/* Quote picker — required for start_job / followup / final;
            optional (but recommended) for survey / design. Renders
            once a type has been selected so the UI isn't noisy
            before the user's made a choice. */}
        {selectedTypeObj && (
          <>
            <ThemedText style={styles.sectionLabel}>
              {quoteRequired ? "Link to accepted quote" : "Link to accepted quote (optional)"}
            </ThemedText>
            {!quoteRequired && (
              <ThemedText
                style={{
                  fontFamily: FontFamily.bodyRegular,
                  fontSize: 12.5,
                  color: c.textMuted,
                  marginTop: -6,
                  marginBottom: 8,
                }}
              >
                If this visit relates to an accepted quote, link it here.
              </ThemedText>
            )}
            {acceptedQuotes.length === 0 ? (
              <View style={[styles.card, { marginBottom: 4 }]}>
                <ThemedText
                  style={{
                    fontFamily: FontFamily.bodyRegular,
                    fontSize: 14,
                    color: c.textMid,
                  }}
                >
                  {quoteRequired
                    ? "No accepted quotes on this request yet — send one first."
                    : "No accepted quotes yet on this request."}
                </ThemedText>
              </View>
            ) : (
              <View style={styles.typeCardsContainer}>
                {/* Optional "None" row for non-required types */}
                {!quoteRequired && (
                  <Pressable
                    style={[
                      styles.typeCard,
                      !selectedQuoteId && styles.typeCardSelected,
                    ]}
                    onPress={() => setSelectedQuoteId(null)}
                    disabled={busy}
                  >
                    <View style={styles.typeCardContent}>
                      <Ionicons
                        name="remove-circle-outline"
                        size={20}
                        color={!selectedQuoteId ? PRIMARY : c.textMuted}
                        style={styles.typeCardIcon}
                      />
                      <ThemedText
                        style={[
                          styles.typeCardLabel,
                          !selectedQuoteId && styles.typeCardLabelSelected,
                        ]}
                      >
                        Don't link to a quote
                      </ThemedText>
                    </View>
                    <View
                      style={[
                        styles.typeCardRadio,
                        !selectedQuoteId && styles.typeCardRadioSelected,
                      ]}
                    >
                      {!selectedQuoteId && <View style={styles.typeCardRadioInner} />}
                    </View>
                  </Pressable>
                )}
                {acceptedQuotes.map((q) => {
                  const isSelected = selectedQuoteId === q.id;
                  const short = String(q.id || "").slice(-4).toUpperCase();
                  const amount = Number(q.grand_total || 0);
                  return (
                    <Pressable
                      key={q.id}
                      style={[
                        styles.typeCard,
                        isSelected && styles.typeCardSelected,
                      ]}
                      onPress={() => setSelectedQuoteId(q.id)}
                      disabled={busy}
                    >
                      <View style={styles.typeCardContent}>
                        <Ionicons
                          name="document-text-outline"
                          size={20}
                          color={isSelected ? PRIMARY : c.textMuted}
                          style={styles.typeCardIcon}
                        />
                        <View style={{ flex: 1, minWidth: 0 }}>
                          <ThemedText
                            style={[
                              styles.typeCardLabel,
                              isSelected && styles.typeCardLabelSelected,
                            ]}
                            numberOfLines={1}
                          >
                            Quote #{short} · {q.project_title || "Project"}
                          </ThemedText>
                          <ThemedText
                            style={{
                              fontFamily: FontFamily.bodyRegular,
                              fontSize: 12,
                              color: c.textMuted,
                              marginTop: 2,
                            }}
                          >
                            £{amount.toLocaleString("en-GB", { minimumFractionDigits: 0 })}
                          </ThemedText>
                        </View>
                      </View>
                      <View
                        style={[
                          styles.typeCardRadio,
                          isSelected && styles.typeCardRadioSelected,
                        ]}
                      >
                        {isSelected && <View style={styles.typeCardRadioInner} />}
                      </View>
                    </Pressable>
                  );
                })}
              </View>
            )}
          </>
        )}

        {/* Date & Time */}
        <View style={[styles.card, { marginTop: 16 }]}>
          {/* Date row */}
          <Pressable
            style={styles.detailRow}
            onPress={handlePressDateRow}
            disabled={busy}
          >
            <View style={styles.detailLeft}>
              <ThemedText style={styles.detailLabel}>Date</ThemedText>
              <ThemedText
                style={[styles.detailValue, !hasDate && { color: c.textMuted }]}
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

          <View style={styles.detailDivider} />

          {/* Time row */}
          <Pressable
            style={styles.detailRow}
            onPress={handlePressTimeRow}
            disabled={busy}
          >
            <View style={styles.detailLeft}>
              <ThemedText style={styles.detailLabel}>Time</ThemedText>
              <ThemedText
                style={[styles.detailValue, !hasTime && { color: c.textMuted }]}
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

        {/* Note (optional) */}
        <View style={[styles.card, { marginTop: 16 }]}>
          <ThemedText style={styles.fieldLabel}>Note (optional)</ThemedText>
          <TextInput
            style={styles.noteInput}
            placeholder="e.g., I'll need access to the back garden..."
            placeholderTextColor={c.textMuted}
            value={apptNote}
            onChangeText={setApptNote}
            editable={!busy}
            multiline
            numberOfLines={3}
            textAlignVertical="top"
            // Note input intentionally has no iOS `inputAccessoryViewID`
            // — the floating Done bar added extra chrome the user didn't
            // want. iOS keyboard has its own dismiss via tap-outside /
            // return, and multiline returns are preserved as newlines.
          />
        </View>

        <Spacer size={24} />

        {/* CTA Button */}
        <Pressable
          onPress={handleConfirmSchedule}
          disabled={busy}
          style={[styles.primaryBtn, { opacity: busy ? 0.7 : 1 }]}
        >
          <ThemedText style={styles.primaryBtnText}>
            {busy ? "Scheduling..." : "Schedule appointment"}
          </ThemedText>
        </Pressable>

        <Spacer size={24} />
      </ScrollView>

      {/* Date/Time Picker */}
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

function makeStyles(c, dark) {
  return StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: c.background,
  },
  // Transparent inline chrome row — paddingHorizontal: 4 here because
  // scrollContent already carries 16px, so the chevron lands at 20px
  // from the left edge (matching the quote builder + request page).
  inlineChrome: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 4,
    paddingBottom: 14,
    gap: 10,
  },
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: c.elevate,
    borderWidth: 1,
    borderColor: c.border,
    alignItems: "center",
    justifyContent: "center",
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingBottom: 40,
  },
  // Builder-style hero — flat eyebrow + big title, no card.
  hero: {
    paddingHorizontal: 4, // scrollContent already has 16 horizontal
    marginBottom: 24,
  },
  eyebrow: {
    ...TypeVariants.eyebrow,
    color: c.textMuted,
    letterSpacing: 0.8,
    marginBottom: 8,
  },
  heroTitle: {
    fontFamily: FontFamily.headerBold,
    fontSize: 28,
    lineHeight: 32,
    letterSpacing: -0.6,
    color: c.text,
  },
  card: {
    borderRadius: 16,
    backgroundColor: c.elevate,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: c.border,
  },
  fieldLabel: {
    fontFamily: FontFamily.bodyMedium,
    fontSize: 13,
    marginBottom: 6,
    color: c.textMid,
  },
  input: {
    borderWidth: 1,
    borderColor: c.borderStrong,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontFamily: FontFamily.bodyRegular,
    fontSize: 15,
    color: c.text,
    backgroundColor: c.elevate,
  },
  detailRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 12,
  },
  detailLeft: {
    flex: 1,
    paddingRight: 12,
  },
  detailLabel: {
    fontFamily: FontFamily.bodyMedium,
    fontSize: 13,
    color: c.textMid,
    marginBottom: 2,
  },
  detailValue: {
    fontFamily: FontFamily.headerSemibold,
    fontSize: 14,
    color: c.text,
    letterSpacing: -0.1,
  },
  detailDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: c.divider,
  },
  detailPill: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: c.elevate2,
  },
  detailPillText: {
    fontFamily: FontFamily.bodyMedium,
    fontSize: 13,
    color: c.textMid,
  },
  primaryBtn: {
    borderRadius: 999,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: PRIMARY,
  },
  primaryBtnText: {
    fontFamily: FontFamily.headerSemibold,
    fontSize: 16,
    color: "#FFFFFF",
    letterSpacing: -0.1,
  },
  // Section label — builder uses small uppercase eyebrow. Matching
  // here so the typography feels consistent across the flow.
  sectionLabel: {
    ...TypeVariants.eyebrow,
    color: c.textMuted,
    letterSpacing: 1,
    marginTop: 8,
    marginBottom: 12,
  },
  // Type selector cards
  typeCardsContainer: {
    gap: 8,
  },
  typeCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 12,
    backgroundColor: c.elevate,
    borderWidth: 1,
    borderColor: c.border,
  },
  typeCardSelected: {
    borderColor: PRIMARY,
    backgroundColor: dark ? "rgba(124,92,255,0.18)" : "#FAF5FF",
  },
  typeCardContent: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  typeCardIcon: {
    marginRight: 12,
  },
  typeCardLabel: {
    fontFamily: FontFamily.bodyMedium,
    fontSize: 15,
    color: c.textMid,
  },
  typeCardLabelSelected: {
    fontFamily: FontFamily.headerSemibold,
    color: PRIMARY,
    letterSpacing: -0.1,
  },
  typeCardRadio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: c.borderStrong,
    alignItems: "center",
    justifyContent: "center",
  },
  typeCardRadioSelected: {
    borderColor: PRIMARY,
  },
  typeCardRadioInner: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: PRIMARY,
  },
  // Note input
  noteInput: {
    borderWidth: 1,
    borderColor: c.borderStrong,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontFamily: FontFamily.bodyRegular,
    fontSize: 15,
    color: c.text,
    backgroundColor: c.elevate,
    minHeight: 80,
  },
  });
}
