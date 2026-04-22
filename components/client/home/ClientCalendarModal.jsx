// components/client/home/ClientCalendarModal.jsx
// Client-side calendar bottom-sheet modal — mirrors the trade-side
// CalendarModal pattern (month grid + per-day dots + scrollable
// list of appointments below) but scoped to the signed-in client's
// appointments.
//
// Data is loaded by the parent (ActiveJobPanel) and passed in via
// `appointments` so this component stays presentational and the
// fetching logic lives in one place.
//
// Each appointment item shows:
//   • kind-aware icon (Survey / Start Job / Follow-up / etc.)
//   • title     — "{Type label} for {service / project}"
//   • subtitle  — "{Business name} · DD MMM, HH:MM"
//   • "Past" badge when the scheduled time has already gone by
//
// Tap an item → close the modal and navigate to the underlying
// request / quote screen via the caller-provided onItemPress.

import React, { useMemo, useState } from "react";
import { View, Modal, Pressable, ScrollView, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import ThemedText from "../../ThemedText";
import Spacer from "../../Spacer";
import { useTheme } from "../../../hooks/useTheme";
import { Colors } from "../../../constants/Colors";
import { FontFamily, Radius, Spacing } from "../../../constants/Typography";

const APPT_KIND_META = {
  survey:    { label: "Survey",              icon: "search-outline",        color: "#5BB3FF" },
  design:    { label: "Design consultation", icon: "color-palette-outline", color: "#7C5CFF" },
  start_job: { label: "Start Job",           icon: "hammer-outline",        color: "#F4B740" },
  followup:  { label: "Follow-up",           icon: "refresh-outline",       color: "#14B8A6" },
  final:     { label: "Final inspection",    icon: "checkmark-done-outline",color: "#3DCF89" },
};

// Title-keyword fallback for appointment rows whose `kind` column is
// null (legacy / RPC-without-migration). Mirrors the inference used on
// the request screens so the calendar classifies appointments the same
// way the rest of the app does.
function inferKindFromTitle(title) {
  const t = String(title || "").toLowerCase();
  if (t.includes("start job") || t.includes("start work")) return "start_job";
  if (t.includes("final inspection") || t.includes("final")) return "final";
  if (t.includes("follow-up") || t.includes("follow up") || t.includes("followup")) return "followup";
  if (t.includes("design consultation") || t.includes("design")) return "design";
  if (t.includes("survey") || t.includes("assessment")) return "survey";
  return null;
}

function apptMeta(a) {
  const k = a?.kind || inferKindFromTitle(a?.title);
  // Fallback label is the generic "Appointment" rather than the raw
  // title — some legacy rows stored a project title in the title
  // column, and surfacing that as a "type" misrepresents the row.
  return (
    APPT_KIND_META[k] || {
      label: "Appointment",
      icon: "calendar-outline",
      color: "#8A8A94",
    }
  );
}

function fmtDay(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

function fmtTime(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function monthTitle(d) {
  return d.toLocaleDateString("en-GB", { month: "long", year: "numeric" });
}

function daysInMonth(year, month) {
  return new Date(year, month + 1, 0).getDate();
}

function firstWeekdayOfMonth(year, month) {
  // Expo calendar is Mon-first; getDay returns 0=Sun..6=Sat so shift.
  const raw = new Date(year, month, 1).getDay();
  return raw === 0 ? 6 : raw - 1;
}

const WEEK_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export default function ClientCalendarModal({
  visible,
  onClose,
  appointments = [],
  onItemPress,
}) {
  const insets = useSafeAreaInsets();
  const { colors: c } = useTheme();
  const [cursor, setCursor] = useState(new Date());

  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const now = new Date();
  const todayY = now.getFullYear();
  const todayM = now.getMonth();
  const todayD = now.getDate();

  // Appointments that fall inside the currently-displayed month.
  const monthAppts = useMemo(() => {
    const start = new Date(year, month, 1, 0, 0, 0);
    const end = new Date(year, month + 1, 0, 23, 59, 59);
    return (appointments || [])
      .filter((a) => {
        if (!a?.scheduled_at) return false;
        const d = new Date(a.scheduled_at);
        return d >= start && d <= end;
      })
      .map((a) => ({ ...a, isPast: new Date(a.scheduled_at) < now }))
      .sort((x, y) => new Date(x.scheduled_at) - new Date(y.scheduled_at));
  }, [appointments, year, month, now]);

  // Bucket into day → appointments for the grid dots.
  const apptByDay = useMemo(() => {
    const map = {};
    monthAppts.forEach((a) => {
      const d = new Date(a.scheduled_at).getDate();
      if (!map[d]) map[d] = [];
      map[d].push(a);
    });
    return map;
  }, [monthAppts]);

  // Calendar cells with leading spacers.
  const cells = useMemo(() => {
    const total = daysInMonth(year, month);
    const leading = firstWeekdayOfMonth(year, month);
    const out = [];
    for (let i = 0; i < leading; i++) out.push({ key: `blank-${i}`, day: null });
    for (let d = 1; d <= total; d++) {
      out.push({ key: `d-${d}`, day: d, appts: apptByDay[d] || [] });
    }
    return out;
  }, [year, month, apptByDay]);

  const goPrev = () => setCursor(new Date(year, month - 1, 1));
  const goNext = () => setCursor(new Date(year, month + 1, 1));

  const isCurrentMonth = year === todayY && month === todayM;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={[styles.root, { backgroundColor: c.background }]}>
        {/* Header */}
        <View style={[styles.header, { borderBottomColor: c.border }]}>
          <Pressable onPress={onClose} hitSlop={10}>
            <Ionicons name="close" size={24} color={c.text} />
          </Pressable>
          <ThemedText style={[styles.headerTitle, { color: c.text }]}>
            Calendar
          </ThemedText>
          <View style={{ width: 24 }} />
        </View>

        {/* Month nav */}
        <View style={styles.monthNav}>
          <Pressable onPress={goPrev} hitSlop={10} style={styles.navBtn}>
            <Ionicons name="chevron-back" size={22} color={c.text} />
          </Pressable>
          <ThemedText style={[styles.monthTitle, { color: c.text }]}>
            {monthTitle(cursor)}
          </ThemedText>
          <Pressable onPress={goNext} hitSlop={10} style={styles.navBtn}>
            <Ionicons name="chevron-forward" size={22} color={c.text} />
          </Pressable>
        </View>

        {/* Weekday labels */}
        <View style={styles.weekRow}>
          {WEEK_LABELS.map((lbl) => (
            <View key={lbl} style={styles.weekCell}>
              <ThemedText style={[styles.weekLabel, { color: c.textMuted }]}>
                {lbl}
              </ThemedText>
            </View>
          ))}
        </View>

        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{
            paddingBottom: insets.bottom + 24,
          }}
          showsVerticalScrollIndicator={false}
        >
          {/* Grid */}
          <View style={styles.grid}>
            {cells.map((cell) => {
              const isToday = isCurrentMonth && cell.day === todayD;
              const has = (cell.appts || []).length > 0;
              return (
                <View key={cell.key} style={styles.dayCell}>
                  {cell.day ? (
                    <>
                      <View
                        style={[
                          styles.dayNumberWrap,
                          isToday && {
                            backgroundColor: Colors.primary,
                          },
                        ]}
                      >
                        <ThemedText
                          style={[
                            styles.dayNumber,
                            { color: isToday ? "#fff" : c.text },
                          ]}
                        >
                          {cell.day}
                        </ThemedText>
                      </View>
                      {has && (
                        <View style={styles.dotRow}>
                          {cell.appts.slice(0, 3).map((a, i) => {
                            const m = apptMeta(a);
                            return (
                              <View
                                key={a.id || `dot-${i}`}
                                style={[styles.dot, { backgroundColor: m.color }]}
                              />
                            );
                          })}
                          {cell.appts.length > 3 ? (
                            <ThemedText
                              style={[styles.moreDot, { color: c.textMuted }]}
                            >
                              +{cell.appts.length - 3}
                            </ThemedText>
                          ) : null}
                        </View>
                      )}
                    </>
                  ) : null}
                </View>
              );
            })}
          </View>

          <Spacer size={14} />

          {/* Month list */}
          <View style={styles.listWrap}>
            <ThemedText style={[styles.listTitle, { color: c.text }]}>
              {monthAppts.length > 0
                ? `${monthAppts.length} appointment${monthAppts.length === 1 ? "" : "s"} this month`
                : "No appointments this month"}
            </ThemedText>

            {monthAppts.map((a) => {
              const m = apptMeta(a);
              const who =
                a.tradeName || a.business_name || a.trade_name || "Trade";
              // Title — just the appointment's type label, matches
              // the card on the home panel. No "for <service>" tail.
              const titleStr = m.label;
              return (
                <Pressable
                  key={a.id}
                  onPress={() => {
                    onClose?.();
                    onItemPress?.(a);
                  }}
                  style={({ pressed }) => [
                    styles.listRow,
                    {
                      backgroundColor: c.elevate,
                      borderColor: c.border,
                      opacity: a.isPast ? 0.6 : 1,
                    },
                    pressed && { backgroundColor: c.elevate2 },
                  ]}
                >
                  {/* Left stripe — kind-coloured, full-height. This
                      is the main differentiator between appointment
                      types inside the list (matches the trade-side
                      calendar's coloured dot treatment but upgraded
                      to a full-height bar for better scan-ability). */}
                  <View
                    style={[
                      styles.listStripe,
                      { backgroundColor: m.color },
                    ]}
                  />
                  <View
                    style={[
                      styles.listIcon,
                      {
                        backgroundColor: m.color + "22",
                        borderColor: m.color + "55",
                      },
                    ]}
                  >
                    <Ionicons name={m.icon} size={18} color={m.color} />
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <View style={styles.listRowHeader}>
                      <ThemedText
                        style={[styles.listRowDate, { color: c.text }]}
                        numberOfLines={1}
                      >
                        {fmtDay(a.scheduled_at)} · {fmtTime(a.scheduled_at)}
                      </ThemedText>
                      {a.isPast ? (
                        <View
                          style={[
                            styles.pastPill,
                            { backgroundColor: c.elevate2, borderColor: c.border },
                          ]}
                        >
                          <ThemedText
                            style={[styles.pastPillText, { color: c.textMuted }]}
                          >
                            Past
                          </ThemedText>
                        </View>
                      ) : null}
                    </View>
                    <ThemedText
                      style={[styles.listRowTitle, { color: c.text }]}
                      numberOfLines={1}
                    >
                      {titleStr}
                    </ThemedText>
                    <ThemedText
                      style={[styles.listRowSub, { color: c.textMuted }]}
                      numberOfLines={1}
                    >
                      {who}
                    </ThemedText>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={c.textMuted} />
                </Pressable>
              );
            })}
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  headerTitle: {
    fontFamily: FontFamily.headerBold,
    fontSize: 18,
    letterSpacing: -0.2,
  },
  monthNav: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 18,
    paddingVertical: 14,
  },
  navBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  monthTitle: {
    fontFamily: FontFamily.headerSemibold,
    fontSize: 17,
  },
  weekRow: {
    flexDirection: "row",
    paddingHorizontal: 10,
    marginBottom: 6,
  },
  weekCell: {
    flex: 1,
    alignItems: "center",
  },
  weekLabel: {
    fontFamily: FontFamily.headerBold,
    fontSize: 10,
    letterSpacing: 0.6,
    textTransform: "uppercase",
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    paddingHorizontal: 10,
  },
  dayCell: {
    width: `${100 / 7}%`,
    paddingVertical: 6,
    alignItems: "center",
  },
  dayNumberWrap: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
  },
  dayNumber: {
    fontFamily: FontFamily.bodyMedium,
    fontSize: 13,
  },
  dotRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    marginTop: 4,
    minHeight: 6,
  },
  dot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
  },
  moreDot: {
    fontSize: 9,
    marginLeft: 2,
  },
  listWrap: {
    paddingHorizontal: Spacing.base,
    paddingTop: 6,
  },
  listTitle: {
    fontFamily: FontFamily.headerBold,
    fontSize: 13,
    letterSpacing: 0.6,
    textTransform: "uppercase",
    marginBottom: 10,
  },
  listRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingLeft: 0,
    paddingRight: 12,
    paddingVertical: 10,
    borderRadius: Radius.md,
    borderWidth: 1,
    marginBottom: 8,
    overflow: "hidden",
  },
  listStripe: {
    width: 4,
    alignSelf: "stretch",
  },
  listIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
  },
  listRowHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  listRowDate: {
    fontFamily: FontFamily.headerSemibold,
    fontSize: 13,
  },
  listRowTitle: {
    fontFamily: FontFamily.bodyMedium,
    fontSize: 14,
    marginTop: 2,
  },
  listRowSub: {
    fontSize: 12,
    marginTop: 1,
  },
  pastPill: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
    borderWidth: 1,
  },
  pastPillText: {
    fontSize: 10,
    fontFamily: FontFamily.headerBold,
    letterSpacing: 0.4,
    textTransform: "uppercase",
  },
});
