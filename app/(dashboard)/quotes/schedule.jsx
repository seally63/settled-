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
import { FontFamily, Radius } from "../../../constants/Typography";

const PRIMARY = Colors.primary;
const INPUT_ACCESSORY_ID = "schedule-keyboard-accessory";

// Predefined appointment types
const APPOINTMENT_TYPES = [
  { id: 'survey', label: 'Survey / Assessment', icon: 'search-outline' },
  { id: 'design', label: 'Design consultation', icon: 'color-palette-outline' },
  { id: 'start_work', label: 'Start work', icon: 'hammer-outline' },
  { id: 'followup', label: 'Follow-up visit', icon: 'refresh-outline' },
  { id: 'final', label: 'Final inspection', icon: 'checkmark-done-outline' },
];

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
  const [apptNote, setApptNote] = useState(""); // optional note
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

  // Get the selected type object
  const selectedTypeObj = APPOINTMENT_TYPES.find(t => t.id === selectedType);

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

      // Use the RPC that creates appointment AND sends it to messages
      // Note is passed as part of location for now (or could be added to notes param if RPC supports it)
      const noteText = apptNote.trim();

      const { data, error } = await supabase.rpc(
        "rpc_send_appointment_message",
        {
          p_request_id: requestId,
          p_quote_id: quoteId || null,
          p_scheduled_at: apptDateTime.toISOString(),
          p_title: typeLabel,
          p_location: location || null,
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
              <ActivityIndicator size="small" color={c.textMid} />
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
            inputAccessoryViewID={Platform.OS === "ios" ? INPUT_ACCESSORY_ID : undefined}
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

function makeStyles(c, dark) {
  return StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: c.background,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 16,
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
    backgroundColor: c.elevate,
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
    color: c.text,
  },
  heroSubtitle: {
    fontSize: 13,
    color: c.textMid,
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
    backgroundColor: c.elevate2,
    marginTop: 6,
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
    fontSize: 13,
    fontWeight: "500",
    marginBottom: 6,
    color: c.textMid,
  },
  input: {
    borderWidth: 1,
    borderColor: "#D1D5DB",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
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
    fontSize: 13,
    fontWeight: "500",
    color: c.textMid,
    marginBottom: 2,
  },
  detailValue: {
    fontSize: 14,
    color: c.text,
  },
  detailDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: "#E5E7EB",
  },
  detailPill: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: c.elevate2,
  },
  detailPillText: {
    fontSize: 13,
    fontWeight: "500",
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
    fontSize: 16,
    fontWeight: "600",
    color: "#FFFFFF",
  },
  // Section label
  sectionLabel: {
    fontSize: 15,
    fontWeight: "600",
    color: c.textMid,
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
    backgroundColor: "#FAF5FF",
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
    fontSize: 15,
    color: c.textMid,
    fontWeight: "500",
  },
  typeCardLabelSelected: {
    color: PRIMARY,
    fontWeight: "600",
  },
  typeCardRadio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: "#D1D5DB",
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
    borderColor: "#D1D5DB",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    backgroundColor: c.elevate,
    minHeight: 80,
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
}
