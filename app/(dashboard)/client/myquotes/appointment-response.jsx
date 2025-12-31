// app/(dashboard)/client/myquotes/appointment-response.jsx
// Client appointment response screen - confirm or suggest alternative time
import { useState, useEffect, useCallback } from "react";
import {
  StyleSheet,
  View,
  ScrollView,
  Pressable,
  Alert,
  Platform,
  Image,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import DateTimePicker from "@react-native-community/datetimepicker";

import ThemedView from "../../../../components/ThemedView";
import ThemedText from "../../../../components/ThemedText";
import Spacer from "../../../../components/Spacer";
import { Colors } from "../../../../constants/Colors";
import { supabase } from "../../../../lib/supabase";
import { useUser } from "../../../../hooks/useUser";

const PRIMARY = Colors?.light?.tint || "#6849a7";
const GREEN = "#16A34A";

// Get initials from a name
function getInitials(name) {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
}

// Avatar component
function Avatar({ name, photoUrl, size = 56 }) {
  const initials = getInitials(name);
  const colors = ["#6849a7", "#3B82F6", "#10B981", "#F59E0B", "#EF4444"];
  const colorIndex = name ? name.charCodeAt(0) % colors.length : 0;
  const bgColor = colors[colorIndex];

  if (photoUrl) {
    return (
      <Image
        source={{ uri: photoUrl }}
        style={{
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: "#E5E7EB",
        }}
      />
    );
  }

  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: bgColor,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <ThemedText style={{ color: "#FFF", fontSize: size * 0.4, fontWeight: "700" }}>
        {initials}
      </ThemedText>
    </View>
  );
}

export default function AppointmentResponse() {
  const params = useLocalSearchParams();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useUser();

  const appointmentId = params.appointmentId;
  const quoteId = params.quoteId;
  const requestId = params.requestId;

  const [loading, setLoading] = useState(true);
  const [appointment, setAppointment] = useState(null);
  const [trade, setTrade] = useState(null);
  const [busy, setBusy] = useState(false);

  // Suggest alternative time state
  const [showSuggestForm, setShowSuggestForm] = useState(false);
  const [suggestedDate, setSuggestedDate] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);

  // Fetch appointment and trade details
  const fetchDetails = useCallback(async () => {
    if (!appointmentId) return;

    try {
      setLoading(true);

      // Fetch appointment
      const { data: apptData, error: apptErr } = await supabase
        .from("appointments")
        .select("id, quote_id, scheduled_at, title, status, location, notes")
        .eq("id", appointmentId)
        .single();

      if (apptErr) throw apptErr;
      setAppointment(apptData);

      // Fetch quote and trade info
      if (apptData?.quote_id) {
        const { data: quoteData } = await supabase
          .from("tradify_native_app_db")
          .select("trade_id, project_title")
          .eq("id", apptData.quote_id)
          .single();

        if (quoteData?.trade_id) {
          const { data: tradeData } = await supabase
            .from("profiles")
            .select("id, business_name, full_name, photo_url")
            .eq("id", quoteData.trade_id)
            .single();

          setTrade({
            ...tradeData,
            projectTitle: quoteData.project_title,
          });
        }
      }
    } catch (err) {
      console.error("Error fetching appointment:", err);
      Alert.alert("Error", "Could not load appointment details.");
    } finally {
      setLoading(false);
    }
  }, [appointmentId]);

  useEffect(() => {
    fetchDetails();
  }, [fetchDetails]);

  // Confirm appointment
  const confirmAppointment = async () => {
    if (!appointmentId) return;

    try {
      setBusy(true);

      const { error } = await supabase
        .from("appointments")
        .update({ status: "confirmed" })
        .eq("id", appointmentId);

      if (error) throw error;

      Alert.alert(
        "Appointment confirmed",
        "The tradesperson has been notified.",
        [
          {
            text: "OK",
            onPress: () => {
              if (quoteId) {
                router.replace(`/myquotes/${quoteId}`);
              } else {
                router.replace("/myquotes");
              }
            },
          },
        ]
      );
    } catch (err) {
      console.error("Error confirming appointment:", err);
      Alert.alert("Error", "Could not confirm appointment. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  // Send suggested alternative time
  const sendSuggestion = async () => {
    if (!appointmentId || !suggestedDate) return;

    try {
      setBusy(true);

      // Update appointment with suggested time and mark as needs re-confirmation
      const { error } = await supabase
        .from("appointments")
        .update({
          scheduled_at: suggestedDate.toISOString(),
          status: "proposed", // Keep as proposed until trade confirms
          notes: `Client suggested: ${suggestedDate.toLocaleString()}`,
        })
        .eq("id", appointmentId);

      if (error) throw error;

      // Send a message to the trade about the suggested time
      if (requestId) {
        await supabase.from("messages").insert({
          request_id: requestId,
          sender_id: user?.id,
          body: `I've suggested a different time: ${suggestedDate.toLocaleDateString(undefined, {
            weekday: "long",
            day: "numeric",
            month: "long",
            year: "numeric",
          })} at ${suggestedDate.toLocaleTimeString(undefined, {
            hour: "2-digit",
            minute: "2-digit",
          })}`,
        });
      }

      Alert.alert(
        "Suggestion sent",
        "The tradesperson has been notified of your preferred time.",
        [
          {
            text: "OK",
            onPress: () => {
              if (quoteId) {
                router.replace(`/myquotes/${quoteId}`);
              } else {
                router.replace("/myquotes");
              }
            },
          },
        ]
      );
    } catch (err) {
      console.error("Error sending suggestion:", err);
      Alert.alert("Error", "Could not send suggestion. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  // Format scheduled date/time
  const scheduledDate = appointment?.scheduled_at
    ? new Date(appointment.scheduled_at)
    : null;

  const tradeName = trade?.business_name || trade?.full_name || "The tradesperson";

  if (loading) {
    return (
      <ThemedView style={styles.container}>
        <View style={[styles.header, { paddingTop: insets.top + 16 }]}>
          <Pressable onPress={() => router.back()} hitSlop={10}>
            <Ionicons name="arrow-back" size={24} color="#111827" />
          </Pressable>
          <ThemedText style={styles.headerTitle}>Appointment request</ThemedText>
          <View style={{ width: 24 }} />
        </View>
        <View style={styles.loadingContainer}>
          <ThemedText>Loading...</ThemedText>
        </View>
      </ThemedView>
    );
  }

  // Suggest alternative time form
  if (showSuggestForm) {
    return (
      <ThemedView style={styles.container}>
        <View style={[styles.header, { paddingTop: insets.top + 16 }]}>
          <Pressable onPress={() => setShowSuggestForm(false)} hitSlop={10}>
            <Ionicons name="arrow-back" size={24} color="#111827" />
          </Pressable>
          <ThemedText style={styles.headerTitle}>Suggest another time</ThemedText>
          <View style={{ width: 24 }} />
        </View>

        <ScrollView contentContainerStyle={styles.content}>
          <ThemedText style={styles.sectionTitle}>What works better?</ThemedText>

          <Spacer height={20} />

          {/* Date picker */}
          <ThemedText style={styles.fieldLabel}>Date</ThemedText>
          <Pressable
            style={styles.pickerButton}
            onPress={() => setShowDatePicker(true)}
          >
            <ThemedText style={styles.pickerButtonText}>
              {suggestedDate.toLocaleDateString(undefined, {
                day: "numeric",
                month: "long",
                year: "numeric",
              })}
            </ThemedText>
            <Ionicons name="calendar-outline" size={20} color="#6B7280" />
          </Pressable>

          {showDatePicker && (
            <DateTimePicker
              value={suggestedDate}
              mode="date"
              display={Platform.OS === "ios" ? "spinner" : "default"}
              minimumDate={new Date()}
              onChange={(event, date) => {
                setShowDatePicker(Platform.OS === "ios");
                if (date) setSuggestedDate(date);
              }}
            />
          )}

          <Spacer height={16} />

          {/* Time picker */}
          <ThemedText style={styles.fieldLabel}>Time</ThemedText>
          <Pressable
            style={styles.pickerButton}
            onPress={() => setShowTimePicker(true)}
          >
            <ThemedText style={styles.pickerButtonText}>
              {suggestedDate.toLocaleTimeString(undefined, {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </ThemedText>
            <Ionicons name="time-outline" size={20} color="#6B7280" />
          </Pressable>

          {showTimePicker && (
            <DateTimePicker
              value={suggestedDate}
              mode="time"
              display={Platform.OS === "ios" ? "spinner" : "default"}
              onChange={(event, date) => {
                setShowTimePicker(Platform.OS === "ios");
                if (date) setSuggestedDate(date);
              }}
            />
          )}

          <Spacer height={32} />

          {/* Send suggestion button */}
          <Pressable
            style={[styles.primaryBtn, busy && styles.btnDisabled]}
            onPress={sendSuggestion}
            disabled={busy}
          >
            <ThemedText style={styles.primaryBtnText}>
              {busy ? "Sending..." : "Send suggestion"}
            </ThemedText>
          </Pressable>
        </ScrollView>
      </ThemedView>
    );
  }

  // Main confirmation screen
  return (
    <ThemedView style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + 16 }]}>
        <Pressable onPress={() => router.back()} hitSlop={10}>
          <Ionicons name="arrow-back" size={24} color="#111827" />
        </Pressable>
        <ThemedText style={styles.headerTitle}>Appointment request</ThemedText>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {/* Trade info */}
        <View style={styles.tradeRow}>
          <Avatar name={tradeName} photoUrl={trade?.photo_url} size={56} />
          <View style={styles.tradeInfo}>
            <ThemedText style={styles.tradeName}>{tradeName}</ThemedText>
            <ThemedText style={styles.tradeSubtext}>wants to schedule:</ThemedText>
          </View>
        </View>

        <Spacer height={24} />

        {/* Appointment details card */}
        <View style={styles.detailsCard}>
          {/* Appointment title/type */}
          <View style={styles.detailRow}>
            <Ionicons name="clipboard-outline" size={20} color="#6B7280" />
            <ThemedText style={styles.detailText}>
              {appointment?.title || trade?.projectTitle || "Survey / Assessment"}
            </ThemedText>
          </View>

          {/* Date */}
          {scheduledDate && (
            <View style={styles.detailRow}>
              <Ionicons name="calendar-outline" size={20} color="#6B7280" />
              <ThemedText style={styles.detailText}>
                {scheduledDate.toLocaleDateString(undefined, {
                  weekday: "long",
                  day: "numeric",
                  month: "long",
                  year: "numeric",
                })}
              </ThemedText>
            </View>
          )}

          {/* Time */}
          {scheduledDate && (
            <View style={styles.detailRow}>
              <Ionicons name="time-outline" size={20} color="#6B7280" />
              <ThemedText style={styles.detailText}>
                {scheduledDate.toLocaleTimeString(undefined, {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </ThemedText>
            </View>
          )}

          {/* Location if available */}
          {appointment?.location && (
            <View style={styles.detailRow}>
              <Ionicons name="location-outline" size={20} color="#6B7280" />
              <ThemedText style={styles.detailText}>{appointment.location}</ThemedText>
            </View>
          )}
        </View>

        <Spacer height={32} />

        {/* Question */}
        <ThemedText style={styles.questionText}>Does this work for you?</ThemedText>

        <Spacer height={20} />

        {/* Confirm button - green */}
        <Pressable
          style={[styles.confirmBtn, busy && styles.btnDisabled]}
          onPress={confirmAppointment}
          disabled={busy}
        >
          <ThemedText style={styles.confirmBtnText}>
            {busy ? "Confirming..." : "Yes, confirm"}
          </ThemedText>
        </Pressable>

        <Spacer height={12} />

        {/* Suggest alternative button - gray outline */}
        <Pressable
          style={[styles.suggestBtn, busy && styles.btnDisabled]}
          onPress={() => {
            // Initialize suggested date to the current proposed date
            if (scheduledDate) {
              setSuggestedDate(new Date(scheduledDate));
            }
            setShowSuggestForm(true);
          }}
          disabled={busy}
        >
          <ThemedText style={styles.suggestBtnText}>Suggest another time</ThemedText>
        </Pressable>
      </ScrollView>
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
    paddingHorizontal: 20,
    paddingBottom: 16,
    backgroundColor: "#F9FAFB",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#E5E7EB",
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#111827",
  },
  loadingContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  content: {
    padding: 20,
  },
  tradeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
  },
  tradeInfo: {
    flex: 1,
  },
  tradeName: {
    fontSize: 18,
    fontWeight: "600",
    color: "#111827",
  },
  tradeSubtext: {
    fontSize: 14,
    color: "#6B7280",
    marginTop: 2,
  },
  detailsCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 20,
    gap: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  detailRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  detailText: {
    fontSize: 16,
    color: "#111827",
    flex: 1,
  },
  questionText: {
    fontSize: 18,
    fontWeight: "600",
    color: "#111827",
    textAlign: "center",
  },
  confirmBtn: {
    backgroundColor: GREEN,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: "center",
  },
  confirmBtnText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "600",
  },
  suggestBtn: {
    backgroundColor: "transparent",
    borderWidth: 1.5,
    borderColor: "#9CA3AF",
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: "center",
  },
  suggestBtnText: {
    color: "#6B7280",
    fontSize: 16,
    fontWeight: "600",
  },
  btnDisabled: {
    opacity: 0.5,
  },

  // Suggest form styles
  sectionTitle: {
    fontSize: 20,
    fontWeight: "600",
    color: "#111827",
  },
  fieldLabel: {
    fontSize: 14,
    fontWeight: "500",
    color: "#374151",
    marginBottom: 8,
  },
  pickerButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  pickerButtonText: {
    fontSize: 16,
    color: "#111827",
  },
  primaryBtn: {
    backgroundColor: PRIMARY,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: "center",
  },
  primaryBtnText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "600",
  },
});
