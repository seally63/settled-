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
  InputAccessoryView,
  Keyboard,
  Text,
} from "react-native";
import { useState, useEffect, useCallback } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useUser } from "../../../hooks/useUser";
import { supabase } from "../../../lib/supabase";
import ThemedView from "../../../components/ThemedView";
import ThemedText from "../../../components/ThemedText";
import Spacer from "../../../components/Spacer";
import CustomDateTimePicker from "../../../components/CustomDateTimePicker";

const PRIMARY = "#6849a7";
const INPUT_ACCESSORY_ID = "schedule-keyboard-accessory";

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
  const [apptTitle, setApptTitle] = useState("");
  const [apptDateTime, setApptDateTime] = useState(null);
  const [hasDate, setHasDate] = useState(false);
  const [hasTime, setHasTime] = useState(false);
  const [busy, setBusy] = useState(false);

  // Picker state
  const [pickerVisible, setPickerVisible] = useState(false);
  const [pickerMode, setPickerMode] = useState("date");
  const [pickerDraftDate, setPickerDraftDate] = useState(new Date());

  // Client info from request
  const [clientName, setClientName] = useState(clientNameParam || "");
  const [jobTitle, setJobTitle] = useState(titleParam ? decodeURIComponent(titleParam) : "");
  const [location, setLocation] = useState(postcodeParam || "");
  const [loadingData, setLoadingData] = useState(true);

  // Load request details if we have a requestId
  useEffect(() => {
    if (!requestId) {
      setLoadingData(false);
      return;
    }

    (async () => {
      try {
        setLoadingData(true);

        // Get request details
        const { data: reqData, error: reqError } = await supabase
          .from("quote_requests")
          .select("suggested_title, postcode, requester_id, details")
          .eq("id", requestId)
          .maybeSingle();

        if (reqData) {
          if (reqData.suggested_title) {
            setJobTitle(reqData.suggested_title);
          } else if (titleParam) {
            setJobTitle(decodeURIComponent(titleParam));
          }

          if (reqData.postcode) {
            setLocation(reqData.postcode);
          }
        }

        // Get client name using privacy-aware RPC (works with RLS)
        const { data: contactData } = await supabase.rpc("rpc_get_client_contact_for_request", {
          p_request_id: requestId,
        });
        if (contactData?.name_display) {
          setClientName(contactData.name_display);
        } else if (contactData?.name) {
          setClientName(contactData.name);
        } else {
          // Fallback: try rpc_list_conversations
          const { data: convData } = await supabase.rpc("rpc_list_conversations", { p_limit: 100 });
          if (convData) {
            const conv = convData.find((c) => c.request_id === requestId);
            if (conv?.other_party_name) {
              setClientName(conv.other_party_name);
            }
          }
        }
      } catch (e) {
        console.warn("[SCHEDULE] Failed to load request details:", e);
      } finally {
        setLoadingData(false);
      }
    })();
  }, [requestId, titleParam]);

  // Handle appointment title with auto-capitalize first letter
  const handleTitleChange = useCallback((text) => {
    if (text.length === 1) {
      setApptTitle(text.charAt(0).toUpperCase());
    } else if (text.length > 0 && apptTitle.length === 0) {
      setApptTitle(text.charAt(0).toUpperCase() + text.slice(1));
    } else {
      setApptTitle(text);
    }
  }, [apptTitle]);

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
        "Please name this appointment (e.g. Survey visit)."
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

      // Use the RPC that creates appointment AND sends it to messages
      console.log("[DEBUG] Schedule - Calling rpc_send_appointment_message with:", {
        p_request_id: requestId,
        p_quote_id: quoteId || null,
        p_scheduled_at: apptDateTime.toISOString(),
        p_title: trimmedTitle,
        p_location: location || null,
      });

      const { data, error } = await supabase.rpc(
        "rpc_send_appointment_message",
        {
          p_request_id: requestId,
          p_quote_id: quoteId || null,
          p_scheduled_at: apptDateTime.toISOString(),
          p_title: trimmedTitle,
          p_location: location || null,
        }
      );

      console.log("[DEBUG] Schedule - rpc_send_appointment_message result:", { data, error });

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
        "The appointment has been sent to messages. The client can accept or decline it.",
        [
          {
            text: "OK",
            onPress: () => {
              if (router.canGoBack?.()) {
                router.back();
              } else {
                router.replace("/quotes");
              }
            },
          },
        ]
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

  const avatarInitials = getInitials(clientName);
  const displayTitle = jobTitle || "Job";
  const displayLocation = location || "Location not specified";

  return (
    <ThemedView style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable
          onPress={() => {
            if (busy) return;
            if (router.canGoBack?.()) {
              router.back();
            } else {
              router.replace("/quotes");
            }
          }}
          hitSlop={8}
          disabled={busy}
        >
          <Ionicons name="close" size={24} color="#374151" />
        </Pressable>
        <ThemedText style={styles.headerTitle}>Schedule appointment</ThemedText>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Hero card */}
        <View style={styles.heroCard}>
          {loadingData ? (
            <View style={styles.heroAvatarFallback}>
              <ActivityIndicator size="small" color="#6B7280" />
            </View>
          ) : (
            <View style={styles.heroAvatarFallback}>
              <ThemedText style={styles.heroAvatarInitials}>
                {avatarInitials}
              </ThemedText>
            </View>
          )}

          <View style={{ flex: 1 }}>
            {loadingData ? (
              <>
                <View style={styles.heroTitlePlaceholder} />
                <View style={styles.heroSubtitlePlaceholder} />
              </>
            ) : (
              <>
                <ThemedText style={styles.heroTitle} numberOfLines={2}>
                  {displayTitle}
                </ThemedText>
                {clientName ? (
                  <ThemedText style={styles.heroSubtitle}>
                    {clientName}
                  </ThemedText>
                ) : null}
              </>
            )}
          </View>
        </View>

        {/* Appointment name */}
        <View style={styles.card}>
          <ThemedText style={styles.fieldLabel}>Appointment name</ThemedText>
          <TextInput
            style={styles.input}
            placeholder="e.g. Survey visit"
            value={apptTitle}
            onChangeText={handleTitleChange}
            editable={!busy}
            autoCapitalize="sentences"
            returnKeyType="done"
            blurOnSubmit={true}
            inputAccessoryViewID={Platform.OS === "ios" ? INPUT_ACCESSORY_ID : undefined}
          />
        </View>

        {/* Details rows */}
        <View style={[styles.card, { marginTop: 12 }]}>
          {/* Location row */}
          <View style={styles.detailRow}>
            <View style={styles.detailLeft}>
              <ThemedText style={styles.detailLabel}>Location</ThemedText>
              <ThemedText style={styles.detailValue} numberOfLines={2}>
                {displayLocation}
              </ThemedText>
            </View>
          </View>

          <View style={styles.detailDivider} />

          {/* Date row */}
          <Pressable
            style={styles.detailRow}
            onPress={handlePressDateRow}
            disabled={busy}
          >
            <View style={styles.detailLeft}>
              <ThemedText style={styles.detailLabel}>Date</ThemedText>
              <ThemedText
                style={[styles.detailValue, !hasDate && { color: "#9CA3AF" }]}
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
                style={[styles.detailValue, !hasTime && { color: "#9CA3AF" }]}
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

      {/* iOS keyboard accessory with Done button */}
      {Platform.OS === "ios" && (
        <InputAccessoryView nativeID={INPUT_ACCESSORY_ID}>
          <View style={styles.keyboardAccessory}>
            <View style={{ flex: 1 }} />
            <Pressable
              onPress={() => Keyboard.dismiss()}
              style={styles.keyboardDoneBtn}
              hitSlop={8}
            >
              <Text style={styles.keyboardDoneText}>Done</Text>
            </Pressable>
          </View>
        </InputAccessoryView>
      )}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F9FAFB",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#E5E7EB",
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "600",
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 40,
  },
  heroCard: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    borderRadius: 16,
    backgroundColor: "#FFFFFF",
    marginBottom: 16,
    shadowColor: "#0F172A",
    shadowOpacity: 0.06,
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 10,
    elevation: 2,
  },
  heroAvatarFallback: {
    width: 48,
    height: 48,
    borderRadius: 24,
    marginRight: 12,
    backgroundColor: "#E5E7EB",
    alignItems: "center",
    justifyContent: "center",
  },
  heroAvatarInitials: {
    fontSize: 18,
    fontWeight: "600",
    color: "#4B5563",
  },
  heroTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#111827",
  },
  heroSubtitle: {
    fontSize: 13,
    color: "#6B7280",
    marginTop: 2,
  },
  heroTitlePlaceholder: {
    width: 140,
    height: 18,
    borderRadius: 4,
    backgroundColor: "#E5E7EB",
  },
  heroSubtitlePlaceholder: {
    width: 100,
    height: 14,
    borderRadius: 4,
    backgroundColor: "#F3F4F6",
    marginTop: 6,
  },
  card: {
    borderRadius: 16,
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: "500",
    marginBottom: 6,
    color: "#374151",
  },
  input: {
    borderWidth: 1,
    borderColor: "#D1D5DB",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    backgroundColor: "#FFFFFF",
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
    fontSize: 13,
    fontWeight: "500",
    color: "#374151",
    marginBottom: 2,
  },
  detailValue: {
    fontSize: 14,
    color: "#111827",
  },
  detailDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: "#E5E7EB",
  },
  detailPill: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: "#F3F4F6",
  },
  detailPillText: {
    fontSize: 13,
    fontWeight: "500",
    color: "#374151",
  },
  primaryBtn: {
    borderRadius: 999,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: PRIMARY,
  },
  primaryBtnText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#FFFFFF",
  },
  // Keyboard accessory
  keyboardAccessory: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F1F5F9",
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#CBD5E1",
  },
  keyboardDoneBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: PRIMARY,
  },
  keyboardDoneText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#FFFFFF",
  },
});
