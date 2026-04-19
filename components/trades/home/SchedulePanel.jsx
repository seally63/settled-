// components/trades/home/SchedulePanel.jsx
// Redesign's "Schedule" Panel — Today / Tomorrow sub-groups with
// StripeRows (3px status bar + title + subtitle + trailing time).
//
// Expects todayAppointments / tomorrowAppointments shaped like the
// current trades/index.jsx state (scheduled_at, clientName, location,
// type, etc.).

import React from "react";
import { View, StyleSheet } from "react-native";
import ThemedText from "../../ThemedText";
import { Panel, StripeRow } from "../../design";
import { useTheme } from "../../../hooks/useTheme";
import { Colors } from "../../../constants/Colors";
import { TypeVariants, FontFamily } from "../../../constants/Typography";

function formatTime(iso) {
  if (!iso) return "";
  const dt = new Date(iso);
  return dt
    .toLocaleTimeString("en-GB", {
      hour: "numeric",
      minute: "2-digit",
      hour12: false,
    })
    .replace(/\s/g, "");
}

function formatApptTitle(appt) {
  // Prefer service/type + client name for the headline.
  const svc = appt.serviceType || appt.title || appt.type || "Appointment";
  const client = appt.clientName || appt.client_name;
  return client ? `${svc} — ${client}` : svc;
}

function formatApptSub(appt) {
  const loc = appt.location || appt.postcode || appt.town;
  const est =
    appt.estimatedDuration != null
      ? `est. ${appt.estimatedDuration}`
      : appt.duration_minutes
      ? `est. ${Math.round(Number(appt.duration_minutes) / 60)}h`
      : null;
  return [loc, est].filter(Boolean).join(" · ");
}

function ScheduleGroup({ label, appointments, stripeColor, isTodayRow, onItemPress }) {
  const { colors: c } = useTheme();
  if (!appointments || appointments.length === 0) return null;
  return (
    <>
      <View style={{ padding: isTodayRow ? "14px 14px 6px" : "10px 14px 4px" }} />
      <View style={styles.groupLabel}>
        <ThemedText
          style={{
            fontSize: 11,
            fontFamily: FontFamily.headerBold,
            letterSpacing: 1,
            textTransform: "uppercase",
            color: isTodayRow ? Colors.status.declined : c.textMuted,
          }}
        >
          {label}
        </ThemedText>
      </View>
      {appointments.map((appt, idx) => (
        <React.Fragment key={appt.id || `${label}-${idx}`}>
          <StripeRow
            stripeColor={stripeColor}
            title={formatApptTitle(appt)}
            subtitle={formatApptSub(appt)}
            onPress={() => onItemPress?.(appt)}
            trailing={
              <ThemedText
                style={{
                  fontSize: 13,
                  fontFamily: FontFamily.headerSemibold,
                  color: c.text,
                }}
              >
                {formatTime(appt.scheduled_at)}
              </ThemedText>
            }
          />
          {idx < appointments.length - 1 ? (
            <View style={[styles.divider, { backgroundColor: c.divider }]} />
          ) : null}
        </React.Fragment>
      ))}
    </>
  );
}

export default function SchedulePanel({
  todayAppointments = [],
  tomorrowAppointments = [],
  onItemPress,
  onSeeAll,
}) {
  const { colors: c } = useTheme();
  const hasToday = todayAppointments.length > 0;
  const hasTomorrow = tomorrowAppointments.length > 0;
  const total = todayAppointments.length + tomorrowAppointments.length;

  if (total === 0) {
    return (
      <Panel title="Schedule" chevron onPress={onSeeAll}>
        <View style={{ padding: 14 }}>
          <ThemedText style={{ ...TypeVariants.bodySm, color: c.textMid }}>
            Nothing on the books yet. When clients schedule surveys or work they'll appear here.
          </ThemedText>
        </View>
      </Panel>
    );
  }

  return (
    <Panel title="Schedule" chevron onPress={onSeeAll}>
      {hasToday ? (
        <ScheduleGroup
          label={`Today, ${new Date().toLocaleDateString("en-GB", {
            day: "numeric",
            month: "short",
          })}`}
          appointments={todayAppointments}
          stripeColor={Colors.status.declined}
          isTodayRow
          onItemPress={onItemPress}
        />
      ) : null}

      {hasToday && hasTomorrow ? (
        <View style={[styles.divider, { backgroundColor: c.divider }]} />
      ) : null}

      {hasTomorrow ? (
        <ScheduleGroup
          label="Tomorrow"
          appointments={tomorrowAppointments}
          stripeColor={Colors.primary}
          onItemPress={onItemPress}
        />
      ) : null}
    </Panel>
  );
}

const styles = StyleSheet.create({
  groupLabel: {
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 6,
  },
  divider: {
    height: 1,
    marginLeft: 14,
  },
});
