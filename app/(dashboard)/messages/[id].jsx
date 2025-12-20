//app/(dasboard)/messages/[id].jsx

import React, {
  useEffect,
  useState,
  useCallback,
  useMemo,
} from "react";
import {
  StyleSheet,
  View,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  TextInput,
  Pressable,
  Alert,
  Image,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import { supabase } from "../../../lib/supabase";
import { useUser } from "../../../hooks/useUser";
import ThemedView from "../../../components/ThemedView";
import ThemedText from "../../../components/ThemedText";
import Spacer from "../../../components/Spacer";
import { Colors } from "../../../constants/Colors";

const TINT = Colors?.light?.tint || "#0ea5e9";

function formatTime(iso) {
  if (!iso) return "";
  const dt = new Date(iso);
  return dt.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  });
}

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

// Same parser as myquotes detail
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

function MessageBubble({ message, isMine }) {
  return (
    <View
      style={[
        styles.bubbleRow,
        { justifyContent: isMine ? "flex-end" : "flex-start" },
      ]}
    >
      <View
        style={[
          styles.bubble,
          isMine ? styles.bubbleMine : styles.bubbleOther,
        ]}
      >
        <ThemedText
          style={[
            styles.bubbleText,
            isMine && styles.bubbleTextMine,
          ]}
        >
          {message.body}
        </ThemedText>
        <ThemedText
          style={[
            styles.bubbleMeta,
            isMine && styles.bubbleMetaMine,
          ]}
          variant="muted"
        >
          {formatTime(message.created_at)}
        </ThemedText>
      </View>
    </View>
  );
}

function AppointmentMessageBubble({ message, appointment, isMine, userRole, onRespond, onEdit }) {
  if (!appointment) return null;

  const scheduledDate = new Date(appointment.scheduled_at);
  const isPending = appointment.status === 'proposed';
  const isConfirmed = appointment.status === 'confirmed';
  const isCancelled = appointment.status === 'cancelled';

  const showClientActions = !isMine && userRole === 'client' && isPending;
  const showTradeActions = isMine && userRole === 'trades' && isPending;

  const statusMap = {
    proposed: { bg: "#FEF3C7", fg: "#92400E", icon: "time-outline", label: "Proposed" },
    confirmed: { bg: "#D1FAE5", fg: "#065F46", icon: "checkmark-circle", label: "Confirmed" },
    cancelled: { bg: "#FEE2E2", fg: "#991B1B", icon: "close-circle", label: "Cancelled" },
  };
  const statusInfo = statusMap[appointment.status] || statusMap.proposed;

  return (
    <View style={styles.appointmentBubbleContainer}>
      <View style={styles.appointmentBubble}>
        {/* Header with icon and title - centered */}
        <View style={styles.appointmentHeader}>
          <Ionicons name="calendar" size={24} color={TINT} />
          <Spacer height={8} />
          <ThemedText style={styles.appointmentTitle}>
            {appointment.title || 'Site Survey Appointment'}
          </ThemedText>
        </View>

        {/* Status badge - centered */}
        <View style={[styles.appointmentStatusBadge, { backgroundColor: statusInfo.bg }]}>
          <Ionicons name={statusInfo.icon} size={14} color={statusInfo.fg} />
          <ThemedText style={[styles.appointmentStatusText, { color: statusInfo.fg }]}>
            {statusInfo.label}
          </ThemedText>
        </View>

        <Spacer height={20} />

        {/* Date and time - centered */}
        <View style={styles.appointmentDetailRow}>
          <Ionicons name="calendar-outline" size={18} color="#6B7280" />
          <ThemedText style={styles.appointmentDetailText}>
            {scheduledDate.toLocaleDateString(undefined, {
              weekday: 'short',
              month: 'short',
              day: 'numeric',
              year: 'numeric'
            })}
          </ThemedText>
        </View>

        <Spacer height={8} />

        <View style={styles.appointmentDetailRow}>
          <Ionicons name="time-outline" size={18} color="#6B7280" />
          <ThemedText style={styles.appointmentDetailText}>
            {scheduledDate.toLocaleTimeString(undefined, {
              hour: '2-digit',
              minute: '2-digit'
            })}
          </ThemedText>
        </View>

        {appointment.location && (
          <>
            <Spacer height={8} />
            <View style={styles.appointmentDetailRow}>
              <Ionicons name="location-outline" size={18} color="#6B7280" />
              <ThemedText style={styles.appointmentDetailText}>
                {appointment.location}
              </ThemedText>
            </View>
          </>
        )}

        {/* Client action buttons */}
        {showClientActions && (
          <>
            <Spacer height={12} />
            <View style={styles.appointmentActions}>
              <Pressable
                style={styles.appointmentDeclineBtn}
                onPress={() => onRespond('cancelled')}
              >
                <Ionicons name="close-circle-outline" size={16} color="#B42318" />
                <ThemedText style={styles.appointmentDeclineBtnText}>Decline</ThemedText>
              </Pressable>
              <Pressable
                style={styles.appointmentAcceptBtn}
                onPress={() => onRespond('confirmed')}
              >
                <Ionicons name="checkmark-circle-outline" size={16} color="#FFFFFF" />
                <ThemedText style={styles.appointmentAcceptBtnText}>Accept</ThemedText>
              </Pressable>
            </View>
          </>
        )}

        {/* Trade edit button */}
        {showTradeActions && (
          <>
            <Spacer height={12} />
            <Pressable
              style={styles.appointmentEditBtn}
              onPress={onEdit}
            >
              <Ionicons name="create-outline" size={16} color={TINT} />
              <ThemedText style={styles.appointmentEditBtnText}>Edit appointment</ThemedText>
            </Pressable>
          </>
        )}

        {/* Confirmed banner */}
        {isConfirmed && (
          <>
            <Spacer height={12} />
            <View style={styles.appointmentConfirmedBanner}>
              <Ionicons name="checkmark-circle" size={16} color="#065F46" />
              <ThemedText style={styles.appointmentConfirmedText}>
                {userRole === 'client' ? 'You confirmed this appointment' : 'Client confirmed this appointment'}
              </ThemedText>
            </View>
          </>
        )}

        {/* Cancelled banner */}
        {isCancelled && (
          <>
            <Spacer height={12} />
            <View style={styles.appointmentCancelledBanner}>
              <Ionicons name="close-circle" size={16} color="#991B1B" />
              <ThemedText style={styles.appointmentCancelledText}>
                This appointment was cancelled
              </ThemedText>
            </View>
          </>
        )}

        {/* Timestamp */}
        <Spacer height={8} />
        <ThemedText style={styles.appointmentTimestamp} variant="muted">
          {formatTime(message.created_at)}
        </ThemedText>
      </View>
    </View>
  );
}

function StatusChip({ value }) {
  const v = String(value || "").toLowerCase();
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
}

// Hero card (same visual as yellow card / quote header)
function QuoteHeader({ quote, tradeName, subtitle }) {
  if (!quote) return null;

  const currency = quote.currency || "GBP";
  const total = Number(quote.grand_total ?? quote.quote_total ?? 0);
  const includesVat = Number(quote.tax_total ?? 0) > 0;
  const issuedAt = quote.issued_at ? new Date(quote.issued_at) : null;
  const validUntil = quote.valid_until
    ? new Date(quote.valid_until)
    : null;
  const status = String(quote.status || "created").toLowerCase();

  return (
    <View style={styles.quoteCard}>
      <View style={styles.quoteTopRow}>
        <View style={{ flex: 1 }}>
          <ThemedText style={styles.tradeHeading}>{tradeName}</ThemedText>
          <ThemedText style={styles.heroProject} variant="muted">
            {subtitle}
          </ThemedText>
        </View>
        <StatusChip value={status} />
      </View>

      <Spacer height={14} />

      <View style={styles.quoteAmountRow}>
        <View>
          <ThemedText style={styles.quoteAmountLabel}>Total quote</ThemedText>
          <ThemedText style={styles.quoteAmount}>
            {currency} {total.toFixed(2)}
          </ThemedText>
          <ThemedText variant="muted" style={styles.heroSub}>
            {includesVat ? "Includes VAT" : "No VAT added"}
          </ThemedText>
        </View>
        <View style={{ alignItems: "flex-end" }}>
          {issuedAt && (
            <>
              <ThemedText style={styles.quoteMetaLabel}>Issued</ThemedText>
              <ThemedText style={styles.quoteMetaValue}>
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
  );
}

export default function MessageThread() {
  const params = useLocalSearchParams();
  const router = useRouter();
  const { user } = useUser();

  const requestId = Array.isArray(params.id) ? params.id[0] : params.id;
  const tradeNameParam = Array.isArray(params.name)
    ? params.name[0]
    : params.name;
  const quoteIdParam = Array.isArray(params.quoteId)
    ? params.quoteId[0]
    : params.quoteId;
  const avatarParam = Array.isArray(params.avatar)
    ? params.avatar[0]
    : params.avatar;
  const returnToParam = Array.isArray(params.returnTo)
    ? params.returnTo[0]
    : params.returnTo;

  const tradeName = tradeNameParam || "Trade business";
  const quoteId = quoteIdParam || null;
  const avatarUrl = avatarParam || null;
  const avatarInitials = getInitials(tradeName);

  console.log("MessageThread params:", params);
  console.log("MessageThread quoteId:", quoteId);

  const [messages, setMessages] = useState([]);
  const [sending, setSending] = useState(false);
  const [input, setInput] = useState("");
  const [quoteSummary, setQuoteSummary] = useState(null);
  const [request, setRequest] = useState(null);
  const [userRole, setUserRole] = useState(null);
  const [apptBusy, setApptBusy] = useState(false);

  const loadMessages = useCallback(async () => {
    if (!requestId) return;
    try {
      const { data, error } = await supabase.rpc("rpc_list_messages", {
        p_request_id: requestId,
        p_quote_id: null,
      });
      if (error) {
        console.warn("rpc_list_messages error:", error.message);
        setMessages([]);
        return;
      }
      setMessages(data || []);
    } catch (e) {
      console.warn("loadMessages failed:", e?.message || e);
      setMessages([]);
    }
  }, [requestId]);

  const loadQuote = useCallback(async () => {
    try {
      let data = null;
      let error = null;

      if (quoteId) {
        const res = await supabase
          .from("tradify_native_app_db")
          .select("*")
          .eq("id", quoteId)
          .maybeSingle();
        data = res.data;
        error = res.error;
      } else if (requestId) {
        const res = await supabase
          .from("tradify_native_app_db")
          .select("*")
          .eq("request_id", requestId)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        data = res.data;
        error = res.error;
      }

      if (error) {
        console.warn("loadQuote failed:", error.message);
        setQuoteSummary(null);
        return;
      }

      setQuoteSummary(data || null);
    } catch (e) {
      console.warn("loadQuote failed:", e?.message || e);
      setQuoteSummary(null);
    }
  }, [quoteId, requestId]);

  const loadRequest = useCallback(async () => {
    if (!requestId) {
      setRequest(null);
      return;
    }
    try {
      const { data, error } = await supabase
        .from("quote_requests")
        .select("id, details")
        .eq("id", requestId)
        .maybeSingle();

      if (error) {
        console.warn("loadRequest failed:", error.message);
        setRequest(null);
        return;
      }
      setRequest(data || null);
    } catch (e) {
      console.warn("loadRequest failed:", e?.message || e);
      setRequest(null);
    }
  }, [requestId]);

  useEffect(() => {
    loadMessages();
    loadQuote();
    loadRequest();
  }, [loadMessages, loadQuote, loadRequest]);

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

  const handleRespondToAppointment = useCallback(async (appointmentId, response) => {
    if (apptBusy || !appointmentId) return;

    const isAccepting = response === 'confirmed';
    const action = isAccepting ? 'Accept' : 'Decline';

    Alert.alert(
      `${action} this appointment?`,
      isAccepting
        ? 'This will confirm the appointment with the tradesperson.'
        : 'This will notify the tradesperson that you declined this appointment.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: action,
          style: isAccepting ? 'default' : 'destructive',
          onPress: async () => {
            try {
              setApptBusy(true);

              const { error } = await supabase.rpc('rpc_client_respond_appointment', {
                p_appointment_id: appointmentId,
                p_response: isAccepting ? 'accepted' : 'declined',
              });

              if (error) {
                Alert.alert('Error', error.message || `Could not ${action.toLowerCase()} appointment`);
                return;
              }

              // Reload messages to show updated appointment status
              await loadMessages();
            } catch (e) {
              Alert.alert('Error', e?.message || 'Something went wrong');
            } finally {
              setApptBusy(false);
            }
          },
        },
      ]
    );
  }, [apptBusy, loadMessages]);

  const handleEditAppointment = useCallback((appointmentId) => {
    // TODO: Implement edit appointment modal
    Alert.alert('Edit Appointment', 'This feature will be available soon!');
  }, []);

  const handleSend = useCallback(async () => {
    const body = input.trim();
    if (!body || !requestId || !user?.id) return;

    setSending(true);
    try {
      const { error } = await supabase.rpc("rpc_send_message", {
        p_request_id: requestId,
        p_quote_id: null,
        p_body: body,
        p_paths: [],
      });
      if (error) {
        Alert.alert("Send failed", error.message);
        return;
      }
      setInput("");
      await loadMessages();
    } catch (e) {
      Alert.alert("Send failed", e?.message || "Unknown error");
    } finally {
      setSending(false);
    }
  }, [input, requestId, user?.id, loadMessages]);

  const renderItem = ({ item }) => {
    const isMine = item.sender_id === user?.id;

    // Debug log to see what we're getting
    if (item.message_type === 'appointment') {
      console.log('Appointment message:', {
        message_type: item.message_type,
        appointment_id: item.appointment_id,
        appointment_scheduled_at: item.appointment_scheduled_at,
        appointment_title: item.appointment_title,
        appointment_status: item.appointment_status,
        isMine,
        userRole,
      });
    }

    // Check if this is an appointment message
    if (item.message_type === 'appointment' && item.appointment_id && item.appointment_scheduled_at) {
      const appointment = {
        id: item.appointment_id,
        scheduled_at: item.appointment_scheduled_at,
        title: item.appointment_title,
        location: item.appointment_location,
        status: item.appointment_status,
      };

      return (
        <AppointmentMessageBubble
          message={item}
          appointment={appointment}
          isMine={isMine}
          userRole={userRole}
          onRespond={(response) => handleRespondToAppointment(appointment.id, response)}
          onEdit={() => handleEditAppointment(appointment.id)}
        />
      );
    }

    // Regular text message
    return <MessageBubble message={item} isMine={isMine} />;
  };

  const parsed = useMemo(
    () => parseDetails(request?.details),
    [request?.details]
  );

  const heroSubtitle =
    (parsed.main && parsed.refit
      ? `${parsed.main} - ${parsed.refit}`
      : parsed.main || parsed.refit) ||
    quoteSummary?.project_title ||
    quoteSummary?.project_name ||
    "Project details";

  return (
    // No safe prop → no extra safe-area padding at the bottom
    <ThemedView style={styles.container}>
      {/* Top bar with avatar + name */}
      <View style={styles.topBar}>
        <Pressable
          onPress={() => {
            // If returnTo param exists, navigate there instead of going back
            if (returnToParam) {
              router.replace(returnToParam);
            } else if (router.canGoBack()) {
              router.back(); // gives you the proper "back" animation
            } else {
              router.replace("/(dashboard)/messages");
            }
          }}
          hitSlop={10}
        >
          <Ionicons name="arrow-back" size={22} color="#0F172A" />
        </Pressable>

        <View style={styles.topBarCenter}>
          {avatarUrl ? (
            <Image source={{ uri: avatarUrl }} style={styles.topBarAvatar} />
          ) : (
            <View style={[styles.topBarAvatar, styles.topBarAvatarFallback]}>
              <ThemedText style={styles.topBarAvatarInitials}>
                {avatarInitials}
              </ThemedText>
            </View>
          )}
          <ThemedText title style={styles.topBarName} numberOfLines={1}>
            {tradeName}
          </ThemedText>
        </View>

        <View style={{ width: 22 }} />
      </View>

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={0}
      >
        <View style={styles.flex}>
          <FlatList
            data={messages}
            keyExtractor={(item) => String(item.id)}
            renderItem={renderItem}
            contentContainerStyle={styles.listContent}
            ListHeaderComponent={
              quoteSummary ? (
                <QuoteHeader
                  quote={quoteSummary}
                  tradeName={tradeName}
                  subtitle={heroSubtitle}
                />
              ) : null
            }
          />
        </View>

        {/* Input bar */}
        <View style={styles.inputBar}>
          <TextInput
            style={styles.input}
            placeholder="Type a message…"
            value={input}
            onChangeText={setInput}
            editable={!sending}
            multiline
          />
          <Pressable
            onPress={handleSend}
            disabled={sending || !input.trim()}
            style={({ pressed }) => [
              styles.sendBtn,
              {
                opacity:
                  sending || !input.trim() ? 0.4 : pressed ? 0.8 : 1,
              },
            ]}
          >
            <Ionicons name="send" size={18} color="#FFFFFF" />
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: {
    flex: 1,
    backgroundColor: Colors?.light?.background || "#F8FAFC",
    // manual safe-area for the notch; no bottom padding so no blob
    paddingTop: Platform.OS === "ios" ? 56 : 0,
  },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 10,
    backgroundColor: Colors?.light?.background || "#F8FAFC",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(148,163,184,0.4)",
  },
  topBarCenter: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 12,
  },
  topBarAvatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "#E5E7EB",
  },
  topBarAvatarFallback: {
    alignItems: "center",
    justifyContent: "center",
  },
  topBarAvatarInitials: {
    fontSize: 13,
    fontWeight: "700",
    color: "#4B5563",
  },
  topBarName: {
    marginLeft: 8,
    fontSize: 17,
    textAlign: "left",
  },

  // Hero quote card
  quoteCard: {
    marginHorizontal: 16,
    marginTop: 8,
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
  quoteTopRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  tradeHeading: {
    fontSize: 18,
    fontWeight: "600",
  },
  heroProject: {
    marginTop: 2,
    fontSize: 13,
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  quoteAmountRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
  },
  quoteAmountLabel: {
    fontSize: 12,
    textTransform: "uppercase",
    letterSpacing: 0.4,
    color: "#6B7280",
    marginBottom: 2,
  },
  quoteAmount: {
    fontSize: 22,
    fontWeight: "700",
  },
  heroSub: {
    marginTop: 2,
    fontSize: 12,
  },
  quoteMetaLabel: {
    fontSize: 12,
    color: "#6B7280",
  },
  quoteMetaValue: {
    fontSize: 14,
    fontWeight: "600",
  },

  listContent: {
    paddingTop: 4,
    paddingBottom: 12,
  },
  bubbleRow: {
    marginBottom: 9, // slightly bigger gap between messages
    paddingHorizontal: 16,
    flexDirection: "row",
  },
  bubble: {
    maxWidth: "80%",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 16,
  },
  bubbleMine: {
    backgroundColor: TINT,
  },
  bubbleOther: {
    backgroundColor: "#E5E7EB",
  },
  bubbleText: {
    fontSize: 14,
    color: "#0F172A",
  },
  bubbleTextMine: {
    color: "#FFFFFF",
  },
  bubbleMeta: {
    fontSize: 10,
    marginTop: 2,
    textAlign: "right",
    opacity: 0.7,
    color: "rgba(15,23,42,0.7)",
  },
  bubbleMetaMine: {
    color: "rgba(255,255,255,0.75)",
  },

  inputBar: {
    flexDirection: "row",
    alignItems: "flex-end",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "rgba(148,163,184,0.5)",
    backgroundColor: "#FFFFFF",
  },
  input: {
    flex: 1,
    minHeight: 36,
    maxHeight: 120,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#CBD5E1",
    backgroundColor: "#F8FAFC",
    fontSize: 14,
  },
  sendBtn: {
    marginLeft: 8,
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: TINT,
  },

  // Appointment message styles - Compact design
  appointmentBubbleContainer: {
    alignItems: "center",
    marginBottom: 12,
    paddingHorizontal: 16,
  },
  appointmentBubble: {
    width: "100%",
    maxWidth: 340,
    padding: 16,
    borderRadius: 16,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    shadowColor: "#000",
    shadowOpacity: 0.06,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 8,
    elevation: 2,
  },
  appointmentHeader: {
    alignItems: "center",
    marginBottom: 12,
  },
  appointmentTitle: {
    fontSize: 16,
    fontWeight: "700",
    textAlign: "center",
    color: "#0F172A",
  },
  appointmentStatusBadge: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  appointmentStatusText: {
    fontSize: 12,
    fontWeight: "600",
  },
  appointmentDetailRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginBottom: 8,
  },
  appointmentDetailText: {
    fontSize: 14,
    color: "#374151",
  },
  appointmentActions: {
    flexDirection: "row",
    gap: 10,
    marginTop: 6,
  },
  appointmentDeclineBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: "#FEF2F2",
    borderWidth: 1,
    borderColor: "#FCA5A5",
  },
  appointmentDeclineBtnText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#B42318",
  },
  appointmentAcceptBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: "#16A34A",
  },
  appointmentAcceptBtnText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#FFFFFF",
  },
  appointmentEditBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 10,
    backgroundColor: "#F1F5F9",
    borderWidth: 1,
    borderColor: "#CBD5E1",
  },
  appointmentEditBtnText: {
    fontSize: 13,
    fontWeight: "600",
    color: TINT,
  },
  appointmentConfirmedBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    padding: 8,
    borderRadius: 8,
    backgroundColor: "#D1FAE5",
  },
  appointmentConfirmedText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#065F46",
  },
  appointmentCancelledBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    padding: 8,
    borderRadius: 8,
    backgroundColor: "#FEE2E2",
  },
  appointmentCancelledText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#991B1B",
  },
  appointmentTimestamp: {
    fontSize: 11,
    textAlign: "right",
  },
});
