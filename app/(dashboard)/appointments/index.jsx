// app/(dashboard)/appointments/index.jsx
import { useCallback, useEffect, useState } from "react";
import {
  StyleSheet,
  View,
  ScrollView,
  Pressable,
  ActivityIndicator,
  Alert,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import ThemedView from "../../../components/ThemedView";
import ThemedText from "../../../components/ThemedText";
import Spacer from "../../../components/Spacer";
import { Colors } from "../../../constants/Colors";
import { useUser } from "../../../hooks/useUser";
import { supabase } from "../../../lib/supabase";

/* -------------------------------- helpers -------------------------------- */

function fmtDateTime(s) {
  if (!s) return "—";
  try {
    const d = new Date(s);
    return d.toLocaleString(undefined, {
      weekday: "short",
      year: "numeric",
      month: "short",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return String(s);
  }
}

function fmtDateOnly(s) {
  if (!s) return "—";
  try {
    const d = new Date(s);
    return d.toLocaleDateString(undefined, {
      weekday: "short",
      month: "short",
      day: "2-digit",
    });
  } catch {
    return String(s);
  }
}

function money(n, currency = "GBP") {
  const v = Number(n ?? 0);
  const c = (currency || "GBP").toUpperCase();
  return c === "GBP" ? `£${v.toFixed(2)}` : `${c} ${v.toFixed(2)}`;
}

function statusPillStyles(status) {
  const s = String(status || "").toLowerCase();
  if (s === "accepted" || s === "confirmed") {
    return {
      label: "Confirmed",
      bg: "#EAF8EF",
      fg: "#117A37",
    };
  }
  if (s === "declined" || s === "cancelled" || s === "canceled") {
    return {
      label: "Cancelled",
      bg: "#FDECEC",
      fg: "#B42318",
    };
  }
  return {
    label: "Proposed",
    bg: "#E9F5FF",
    fg: "#0B74D1",
  };
}

/* --------------------------------- UI bits -------------------------------- */

function FilterChip({ active, label, onPress }) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={8}
      style={[
        styles.filterChip,
        active && styles.filterChipActive,
      ]}
    >
      <ThemedText
        style={[
          styles.filterChipText,
          active && styles.filterChipTextActive,
        ]}
      >
        {label}
      </ThemedText>
    </Pressable>
  );
}

function StatusPill({ status }) {
  const { label, bg, fg } = statusPillStyles(status);
  return (
    <View style={[styles.statusPill, { backgroundColor: bg }]}>
      <ThemedText style={[styles.statusPillText, { color: fg }]}>
        {label}
      </ThemedText>
    </View>
  );
}

function AppointmentList({ rows, onOpenQuote, onOpenRequest, role, onConfirm, onDecline }) {
  if (!rows?.length) {
    const isTrades = role === 'trades';
    const emptyMessage = isTrades
      ? "When you schedule a site visit with a client, it will appear here."
      : "When a tradesperson schedules a site visit for your project, it will appear here.";

    return (
      <View style={styles.emptyCard}>
        <ThemedText style={styles.emptyTitle}>No appointments</ThemedText>
        <ThemedText variant="muted" style={{ textAlign: "center" }}>
          {emptyMessage}
        </ThemedText>
      </View>
    );
  }

  return (
    <View style={{ gap: 14 }}>
      {rows.map((row) => {
        const {
          appointment_id,
          scheduled_at,
          status,
          request_id,
          quote_id,
          project_title,
          quote_status,
          grand_total,
          currency,
          postcode,
          client_name,
        } = row;

        const isClient = role === 'client';
        const isProposed = status === 'proposed';
        const showConfirmButtons = isClient && isProposed;
        const hasQuote = !!quote_id;

        // For clients: show business/trade name prominently
        // For trades: show project title and client name
        const primaryText = isClient
          ? (client_name || 'Tradesperson')
          : (project_title || (postcode ? `Appointment in ${String(postcode).toUpperCase()}` : "Appointment"));

        const secondaryText = isClient
          ? (project_title || (postcode ? `Project in ${String(postcode).toUpperCase()}` : "Project"))
          : (client_name || (postcode ? String(postcode).toUpperCase() : ""));

        return (
          <Pressable
            key={appointment_id}
            onPress={() => {
              // Always go to quote if it exists, otherwise go to request
              if (quote_id) onOpenQuote(quote_id);
              else if (request_id) onOpenRequest(request_id);
            }}
            style={styles.card}
            hitSlop={8}
          >
            {/* Top row: title + status pill */}
            <View style={styles.cardTopRow}>
              <View style={{ flex: 1 }}>
                <ThemedText style={styles.cardTitle} numberOfLines={2}>
                  {primaryText}
                </ThemedText>
                {!!secondaryText && (
                  <ThemedText
                    variant="muted"
                    style={styles.cardSubtitle}
                    numberOfLines={1}
                  >
                    {secondaryText}
                  </ThemedText>
                )}
              </View>
              <StatusPill status={status} />
            </View>

            {/* Date & time row */}
            <View style={styles.dateRow}>
              <Ionicons name="calendar-outline" size={16} color="#4B5563" />
              <ThemedText style={styles.dateText}>
                {fmtDateTime(scheduled_at)}
              </ThemedText>
            </View>

            {/* Quote amount (if available) */}
            {hasQuote && grand_total > 0 && (
              <View style={styles.bottomRow}>
                <View style={{ flex: 1 }}>
                  <ThemedText style={styles.quoteAmount}>
                    {money(grand_total, currency)}
                  </ThemedText>
                  {!!quote_status && (
                    <ThemedText
                      variant="muted"
                      style={styles.quoteStatus}
                    >
                      Quote: {String(quote_status).charAt(0).toUpperCase() +
                        String(quote_status).slice(1)}
                    </ThemedText>
                  )}
                </View>
              </View>
            )}

            {/* Client confirmation buttons */}
            {showConfirmButtons && (
              <View style={styles.confirmButtonsRow}>
                <Pressable
                  onPress={(e) => {
                    e.stopPropagation();
                    onDecline(appointment_id);
                  }}
                  style={styles.declineBtn}
                  hitSlop={8}
                >
                  <Ionicons name="close-circle-outline" size={18} color="#B42318" />
                  <ThemedText style={styles.declineBtnText}>
                    Decline
                  </ThemedText>
                </Pressable>

                <Pressable
                  onPress={(e) => {
                    e.stopPropagation();
                    onConfirm(appointment_id);
                  }}
                  style={styles.confirmBtn}
                  hitSlop={8}
                >
                  <Ionicons name="checkmark-circle-outline" size={18} color="#FFFFFF" />
                  <ThemedText style={styles.confirmBtnText}>
                    Accept
                  </ThemedText>
                </Pressable>
              </View>
            )}
          </Pressable>
        );
      })}
    </View>
  );
}

/* --------------------------------- Screen --------------------------------- */

export default function TradeAppointmentsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useUser();

  const [role, setRole] = useState(null);
  const [onlyUpcoming, setOnlyUpcoming] = useState(true);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);

  const load = useCallback(
    async (opts) => {
      if (!user?.id || !role) return;
      const flag = opts?.onlyUpcoming ?? onlyUpcoming;

      setLoading(true);
      setErr(null);

      try {
        // Call different RPC based on role
        const rpcName = role === 'trades'
          ? "rpc_trade_list_appointments"
          : "rpc_client_list_appointments";

        const { data, error } = await supabase.rpc(
          rpcName,
          { p_only_upcoming: flag }
        );

        if (error) throw error;
        setRows(Array.isArray(data) ? data : []);
      } catch (e) {
        setErr(e?.message || String(e));
        setRows([]);
      } finally {
        setLoading(false);
      }
    },
    [user?.id, role, onlyUpcoming]
  );

  // Fetch user role
  useEffect(() => {
    let mounted = true;

    (async () => {
      if (!user?.id) {
        setRole('client');
        return;
      }

      const { data, error } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single();

      if (mounted) {
        setRole(!error ? (data?.role || 'client') : 'client');
      }
    })();

    return () => {
      mounted = false;
    };
  }, [user?.id]);

  useEffect(() => {
    if (user?.id && role) {
      load({ onlyUpcoming });
    }
  }, [user?.id, role, onlyUpcoming, load]);

  useFocusEffect(
    useCallback(() => {
      load({ onlyUpcoming });
    }, [load, onlyUpcoming])
  );

  const goBack = () => {
    if (router.canGoBack?.()) {
      router.back();
    } else {
      // Navigate to appropriate home based on role
      const isTrades = role === 'trades';
      router.replace(isTrades ? "/quotes" : "/client");
    }
  };

  const handleOpenQuote = (qid) => {
    if (!qid) return;
    router.push({
      pathname: `/quotes/${qid}`,
      params: { fromAppointments: 'true' }
    });
  };

  const handleOpenRequest = (rid) => {
    if (!rid) return;
    router.push(`/quotes/request/${rid}`);
  };

  const handleConfirmAppointment = async (appointmentId) => {
    Alert.alert(
      "Accept appointment?",
      "This will confirm the appointment with the tradesperson.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Accept",
          style: "default",
          onPress: async () => {
            try {
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
              load({ onlyUpcoming });
            } catch (e) {
              Alert.alert("Error", e?.message || "Something went wrong");
            }
          },
        },
      ]
    );
  };

  const handleDeclineAppointment = async (appointmentId) => {
    Alert.alert(
      "Decline appointment?",
      "This will notify the tradesperson that you declined this appointment.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Decline",
          style: "destructive",
          onPress: async () => {
            try {
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
              load({ onlyUpcoming });
            } catch (e) {
              Alert.alert("Error", e?.message || "Something went wrong");
            }
          },
        },
      ]
    );
  };

  return (
    <ThemedView
      style={{ flex: 1, backgroundColor: "#FFFFFF" }}
    >
      {/* Header */}
      <View
        style={[
          styles.headerWrap,
          { paddingTop: insets.top + 6 },
        ]}
      >
        <View style={styles.headerRow}>
          <ThemedText style={styles.headerTitle}>Appointments</ThemedText>
        </View>

        {/* Filter chips */}
        <View style={styles.filterRow}>
          <FilterChip
            active={onlyUpcoming}
            label="Upcoming"
            onPress={() => setOnlyUpcoming(true)}
          />
          <FilterChip
            active={!onlyUpcoming}
            label="All"
            onPress={() => setOnlyUpcoming(false)}
          />
        </View>
      </View>

      {/* Body */}
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator />
        </View>
      ) : (
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{
            paddingHorizontal: 16,
            paddingVertical: 16,
          }}
        >
          <AppointmentList
            rows={rows}
            onOpenQuote={handleOpenQuote}
            onOpenRequest={handleOpenRequest}
            role={role}
            onConfirm={handleConfirmAppointment}
            onDecline={handleDeclineAppointment}
          />
          {!!err && (
            <>
              <Spacer size={8} />
              <ThemedText
                variant="muted"
                style={{ fontSize: 12 }}
              >
                Debug: {err}
              </ThemedText>
            </>
          )}
        </ScrollView>
      )}
    </ThemedView>
  );
}

/* --------------------------------- styles --------------------------------- */

const styles = StyleSheet.create({
  headerWrap: {
    paddingBottom: 8,
    backgroundColor: "#FFFFFF",
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 20,
    paddingBottom: 4,
  },
  headerTitle: {
    textAlign: "center",
    fontSize: 20,
    fontWeight: "800",
  },

  filterRow: {
    flexDirection: "row",
    gap: 8,
    justifyContent: "center",
    paddingBottom: 6,
  },
  filterChip: {
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(148,163,184,0.5)",
    backgroundColor: "#F8FAFC",
  },
  filterChipActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  filterChipText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#0F172A",
  },
  filterChipTextActive: {
    color: "#FFFFFF",
  },

  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },

  emptyCard: {
    backgroundColor: "#fff",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.08)",
    padding: 20,
    alignItems: "center",
    marginHorizontal: 4,
  },
  emptyTitle: { fontWeight: "800", marginBottom: 6 },

  card: {
    backgroundColor: "#fff",
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.08)",
    padding: 18,
  },
  cardTopRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: 8,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: "700",
    marginRight: 10,
  },
  cardSubtitle: {
    fontSize: 14,
    marginTop: 4,
  },

  statusPill: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
    alignSelf: "flex-start",
  },
  statusPillText: {
    fontSize: 12,
    fontWeight: "700",
  },

  dateRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 4,
    gap: 6,
  },
  dateText: {
    fontSize: 13,
    color: "#111827",
  },

  bottomRow: {
    marginTop: 12,
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    gap: 12,
  },
  quoteLabel: {
    fontSize: 12,
    textTransform: "uppercase",
    letterSpacing: 0.4,
    color: "#6B7280",
    marginBottom: 2,
  },
  quoteAmount: {
    fontSize: 18,
    fontWeight: "700",
  },
  quoteStatus: {
    fontSize: 12,
    marginTop: 2,
  },

  primaryBtn: {
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: Colors.primary,
  },
  primaryBtnText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#FFFFFF",
  },

  // Client confirmation buttons
  confirmButtonsRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "rgba(0,0,0,0.08)",
  },
  declineBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    borderRadius: 999,
    paddingVertical: 10,
    paddingHorizontal: 16,
    backgroundColor: "#FEF2F2",
    borderWidth: 1,
    borderColor: "#FCA5A5",
  },
  declineBtnText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#B42318",
  },
  confirmBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    borderRadius: 999,
    paddingVertical: 10,
    paddingHorizontal: 16,
    backgroundColor: "#16A34A",
  },
  confirmBtnText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#FFFFFF",
  },
});
