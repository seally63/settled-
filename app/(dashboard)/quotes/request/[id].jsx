// app/(dashboard)/quotes/request/[id].jsx
import {
  StyleSheet,
  View,
  ScrollView,
  Pressable,
  Alert,
  Image,
  Modal,
  FlatList,
  Dimensions,
} from "react-native";
import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useFocusEffect } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import ThemedView from "../../../../components/ThemedView";
import ThemedText from "../../../../components/ThemedText";
import Spacer from "../../../../components/Spacer";
import { RequestDetailSkeleton } from "../../../../components/Skeleton";
import { Colors } from "../../../../constants/Colors";
import { FontFamily, Radius } from "../../../../constants/Typography";
import { useUser } from "../../../../hooks/useUser";
import { useTheme } from "../../../../hooks/useTheme";
import useHideTabBar from "../../../../hooks/useHideTabBar";
import { supabase } from "../../../../lib/supabase";

// RPC wrappers
import { acceptRequest, declineRequest } from "../../../../lib/api/requests";
import { listRequestImagePaths, getSignedUrls } from "../../../../lib/api/attachments";
const CELL = 96;
const SCREEN_WIDTH = Dimensions.get("window").width;

// Static layout for the redesigned trade-reviews-request screen.
// Colours are applied inline against the active theme palette.
const trvStyles = StyleSheet.create({
  // Sticky chevron — floats top-left, always visible as you scroll.
  // Sizing matches the builder's iconBtn for visual uniformity across
  // the three screens (request detail · builder · schedule). The
  // chevron now scrolls with the content (was sticky) so it can't
  // sit on top of rows as the user scrolls down.
  inlineChevron: {
    marginLeft: 20,
    marginBottom: 12,
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  eyebrowRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 20,
  },
  eyebrowDot: { width: 6, height: 6, borderRadius: 3 },
  eyebrow: {
    fontFamily: "PublicSans_700Bold",
    fontSize: 11,
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  // Bumped size + line height for the hero title — more breathing room
  // between it and the client row below.
  title: {
    fontFamily: "PublicSans_700Bold",
    fontSize: 30,
    letterSpacing: -0.8,
    lineHeight: 36,
    paddingHorizontal: 20,
    marginTop: 10,
  },
  clientRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    paddingHorizontal: 20,
    marginTop: 20,
  },
  clientAvatar: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: "center",
    justifyContent: "center",
  },
  clientInitials: { fontFamily: "PublicSans_700Bold", fontSize: 15 },
  clientName: {
    fontFamily: "PublicSans_600SemiBold",
    fontSize: 15,
    letterSpacing: -0.1,
  },
  clientMeta: { fontSize: 12, fontFamily: "DMSans_400Regular", marginTop: 2 },
  distanceText: { fontSize: 12, fontFamily: "PublicSans_600SemiBold" },
  factsRow: {
    flexDirection: "row",
    gap: 10,
    paddingHorizontal: 16,
    marginTop: 28,
  },
  // Full-width "Job description" container — same visual treatment as
  // factPill (14 radius, 1px border, elevate background) so it reads
  // as part of the same family as BUDGET / TIMING.
  descRow: {
    paddingHorizontal: 16,
    marginTop: 28,
  },
  descPill: {
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 14,
    borderWidth: 1,
  },
  descLabel: {
    fontFamily: "PublicSans_700Bold",
    fontSize: 10,
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  descValue: {
    fontFamily: "DMSans_400Regular",
    fontSize: 14,
    lineHeight: 20,
    marginTop: 4,
  },
  factPill: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 14,
    borderWidth: 1,
  },
  factLabel: {
    fontFamily: "PublicSans_700Bold",
    fontSize: 10,
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  factValue: {
    fontFamily: "PublicSans_700Bold",
    fontSize: 16,
    letterSpacing: -0.3,
    marginTop: 4,
  },
  sectionLabel: {
    fontFamily: "PublicSans_700Bold",
    fontSize: 11,
    letterSpacing: 1,
    textTransform: "uppercase",
    paddingHorizontal: 20,
    marginTop: 32,
    marginBottom: 8,
  },
  sectionCard: {
    marginHorizontal: 16,
    borderRadius: 18,
    borderWidth: 1,
    overflow: "hidden",
  },
  scopeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  scopeIconBox: {
    width: 32,
    height: 32,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
  },
  scopeTitle: { fontFamily: "DMSans_500Medium", fontSize: 14 },
  scopeSub: { fontSize: 11.5, fontFamily: "DMSans_400Regular", marginTop: 2 },
  scopeDivider: { height: 1, marginLeft: 58 },
  notesCard: {
    marginHorizontal: 20,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
  },
  notesText: {
    fontFamily: "DMSans_400Regular",
    fontSize: 14,
    lineHeight: 21,
  },
  photoThumb: {
    width: 120,
    height: 120,
    borderRadius: 12,
    borderWidth: 1,
    overflow: "hidden",
  },
  clientMsgBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 8,
  },
  activityCard: {
    marginHorizontal: 16,
    borderRadius: 18,
    borderWidth: 1,
    overflow: "hidden",
  },
  activityEmpty: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 16,
    paddingHorizontal: 14,
  },
  activityEmptyText: {
    fontFamily: "DMSans_400Regular",
    fontSize: 13,
  },
  activityRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  activityIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  activityTitle: {
    fontFamily: "PublicSans_600SemiBold",
    fontSize: 14,
    letterSpacing: -0.2,
  },
  activityMeta: {
    fontFamily: "DMSans_400Regular",
    fontSize: 12,
    marginTop: 2,
  },
  activityBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
  },
  activityBadgeText: {
    fontFamily: "PublicSans_700Bold",
    fontSize: 10.5,
    letterSpacing: 0.4,
    textTransform: "uppercase",
  },
  activityDivider: { height: 1, marginLeft: 62 },

  // Inline Accept/Decline row for the open state — equal flex, same
  // height, no bar behind them.
  inlineOpenActions: {
    flexDirection: "row",
    gap: 10,
    paddingHorizontal: 16,
    marginTop: 32,
  },
  openBtnGhost: {
    flex: 1,
    height: 52,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  openBtnGhostText: {
    fontFamily: "PublicSans_600SemiBold",
    fontSize: 15,
    letterSpacing: -0.1,
  },
  openBtnPrimary: {
    flex: 1,
    height: 52,
    borderRadius: 16,
    backgroundColor: Colors.primary,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  openBtnPrimaryText: {
    fontFamily: "PublicSans_600SemiBold",
    fontSize: 15,
    color: "#FFFFFF",
    letterSpacing: -0.1,
  },
  fabWrap: {
    position: "absolute",
    left: 0,
    right: 0,
    alignItems: "center",
    zIndex: 40,
  },
  fab: {
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowRadius: 16,
    shadowOpacity: 0.2,
    elevation: 10,
  },
  dock: {
    position: "absolute",
    left: 0,
    right: 0,
    // Lifted above the floating tab bar so the dock isn't covered.
    bottom: 92,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  dockGhostBtn: {
    paddingVertical: 14,
    paddingHorizontal: 18,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  dockGhostText: { fontFamily: "PublicSans_600SemiBold", fontSize: 15 },
  dockSquareBtn: {
    width: 52,
    height: 52,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  dockPrimaryBtn: {
    flex: 1,
    height: 52,
    borderRadius: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: Colors.primary,
  },
  dockPrimaryText: {
    fontFamily: "PublicSans_700Bold",
    fontSize: 16,
    color: "#FFFFFF",
  },
});

// Per-theme styles factory shared by all sub-components in this file.
function useStyles() {
  const { colors: c, dark } = useTheme();
  const styles = useMemo(() => makeStyles(c, dark), [c, dark]);
  const quoteStyles = useMemo(() => makeQuoteStyles(c, dark), [c, dark]);
  return { styles, quoteStyles, colors: c, dark };
}

function parseDetails(details) {
  const res = {
    title: null,
    category: null,
    service: null,
    description: null,
    property: null,
    timing: null,
    emergency: null,
    budget: null,
    // Legacy fields for backwards compatibility
    start: null,
    address: null,
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
    // New multi-step form fields
    if (key === "category") res.category = v;
    else if (key === "service") res.service = v;
    else if (key === "description") res.description = v;
    else if (key === "property") res.property = v;
    else if (key === "timing") res.timing = v;
    else if (key === "emergency") res.emergency = v;
    else if (key === "budget") res.budget = v;
    // Legacy fields
    else if (key.includes("start")) res.start = v;
    else if (key.includes("address")) res.address = v;
    else if (key === "main") res.main = v;
    else if (key.includes("refit")) res.refit = v;
    else if (key.includes("notes")) res.notes = v;
  }
  return res;
}

// Chip color categories matching app-wide CHIP_TONES standard
// ACTION NEEDED (Orange #F59E0B): Send Quote, New Quote, Expires Soon
// WAITING (Blue #3B82F6): Request Sent, Quote Sent, Quote Pending
// ACTIVE/GOOD (Green #10B981): Quote Accepted, Scheduled, Claimed
// COMPLETED (Gray #6B7280): Completed, Neutral
// NEGATIVE (Red #EF4444): Declined, Expired, No Response
const CHIP_TONES = {
  action: { bg: "#FEF3C7", fg: "#F59E0B", icon: "alert-circle" },
  waiting: { bg: "#DBEAFE", fg: "#3B82F6", icon: "hourglass" },
  active: { bg: "#D1FAE5", fg: "#10B981", icon: "checkmark-circle" },
  completed: { bg: "#F3F4F6", fg: "#6B7280", icon: "checkmark-done" },
  negative: { bg: "#FEE2E2", fg: "#EF4444", icon: "close-circle" },
  muted: { bg: "#F1F5F9", fg: "#334155", icon: null },
};

function Chip({ children, tone = "muted", icon }) {
  const { styles } = useStyles();
  const t = CHIP_TONES[tone] || CHIP_TONES.muted;
  const chipIcon = icon || t.icon;
  return (
    <View
      style={{
        backgroundColor: t.bg,
        borderRadius: 999,
        paddingVertical: 6,
        paddingHorizontal: 12,
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
      }}
    >
      {chipIcon && <Ionicons name={chipIcon} size={14} color={t.fg} />}
      <ThemedText style={{ color: t.fg, fontWeight: "700", fontSize: 13 }}>
        {children}
      </ThemedText>
    </View>
  );
}

// Helper: format currency number
function formatNumber(n) {
  if (n == null) return "";
  return n.toLocaleString("en-GB", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

// Quote status badge for individual quotes in the list
function QuoteStatusBadge({ status }) {
  const { quoteStyles } = useStyles();
  const s = (status || "").toLowerCase();
  let tone = "muted";
  let label = status;
  let icon = null;

  if (s === "draft") {
    tone = "action";
    label = "Draft";
    icon = "create-outline";
  } else if (s === "unused") {
    // Draft quote that wasn't sent when another quote was accepted
    tone = "muted";
    label = "Draft (unused)";
    icon = "document-outline";
  } else if (s === "sent" || s === "created") {
    tone = "waiting";
    label = "Sent";
    icon = "paper-plane-outline";
  } else if (s === "accepted") {
    tone = "active";
    label = "Accepted";
    icon = "checkmark-circle";
  } else if (s === "declined") {
    tone = "negative";
    label = "Declined";
    icon = "close-circle";
  } else if (s === "expired") {
    tone = "negative";
    label = "Expired";
    icon = "time-outline";
  }

  const t = CHIP_TONES[tone] || CHIP_TONES.muted;

  return (
    <View style={{
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      backgroundColor: t.bg,
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: 12,
    }}>
      {icon && <Ionicons name={icon} size={14} color={t.fg} />}
      <ThemedText style={{ fontSize: 12, fontWeight: "600", color: t.fg }}>
        {label}
      </ThemedText>
    </View>
  );
}

/* ───────── Phase 11.1 — Recent Activity (trade-side) ───────── */

// Helper — last 4 chars of a UUID for the "#EE57" style quote id.
function quoteShortId(id) {
  const s = String(id || "");
  return s.slice(-4).toUpperCase() || "0000";
}

// Interleaved appointments + quotes, newest first, tappable.
function RecentActivitySection({ styles, c, appointments, quotes, onActivityPress, clientName, workStartedAt, hasConfirmedWorkAppt }) {
  const items = [
    ...((appointments || []).map((a) => ({
      kind: "appointment",
      id: a.id,
      ts: new Date(a.scheduled_at || a.created_at || 0).getTime(),
      data: a,
    }))),
    ...((quotes || []).map((q) => ({
      kind: "quote",
      id: q.id,
      ts: new Date(q.created_at || q.issued_at || 0).getTime(),
      data: q,
    }))),
  ].sort((a, b) => b.ts - a.ts);

  return (
    <>
      <ThemedText style={[styles.sectionLabel, { color: c.textMuted }]}>
        RECENT ACTIVITY
      </ThemedText>
      <View
        style={[
          styles.activityCard,
          { backgroundColor: c.elevate, borderColor: c.border },
        ]}
      >
        {items.length === 0 ? (
          <View style={styles.activityEmpty}>
            <Ionicons name="time-outline" size={18} color={c.textMuted} />
            <ThemedText style={[styles.activityEmptyText, { color: c.textMuted }]}>
              No activity yet — tap + to schedule or quote.
            </ThemedText>
          </View>
        ) : (
          items.map((it, i) => (
            <View key={`${it.kind}-${it.id}`}>
              {i > 0 && (
                <View style={[styles.activityDivider, { backgroundColor: c.divider }]} />
              )}
              <ActivityRow
                styles={styles}
                c={c}
                item={it}
                onPress={() => onActivityPress(it)}
                clientName={clientName}
                workStartedAt={workStartedAt}
                hasConfirmedWorkAppt={hasConfirmedWorkAppt}
              />
            </View>
          ))
        )}
      </View>
    </>
  );
}

function ActivityRow({ styles, c, item, onPress, clientName, workStartedAt, hasConfirmedWorkAppt }) {
  const { kind, data } = item;
  if (kind === "appointment") {
    const scheduled = new Date(data.scheduled_at);
    const dateStr = scheduled.toLocaleDateString(undefined, {
      weekday: "short",
      day: "numeric",
      month: "short",
    });
    const timeStr = scheduled.toLocaleTimeString(undefined, {
      hour: "2-digit",
      minute: "2-digit",
    });
    const statusTone =
      data.status === "confirmed"
        ? Colors.status.scheduled
        : data.status === "proposed"
        ? Colors.status.pending
        : Colors.status.declined;
    // Subtitle prompt (A+B-agreed hint): a confirmed appointment that's
    // today or past, with no Start Work stamp, should nudge the trade
    // to tap and fire it.
    const apptIsConfirmed = data.status === "confirmed" || data.status === "accepted";
    const apptDue = Number.isFinite(scheduled.getTime()) && scheduled.getTime() <= Date.now();
    const promptStart = apptIsConfirmed && apptDue && !workStartedAt;
    return (
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [styles.activityRow, pressed && { opacity: 0.7 }]}
        accessibilityRole="button"
      >
        <View style={[styles.activityIcon, { backgroundColor: c.elevate2 }]}>
          <Ionicons name="calendar-outline" size={18} color={c.text} />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <ThemedText style={[styles.activityTitle, { color: c.text }]} numberOfLines={1}>
            {data.title || "Appointment"}
          </ThemedText>
          <ThemedText style={[styles.activityMeta, { color: c.textMuted }]} numberOfLines={1}>
            {dateStr} · {timeStr}
            {promptStart ? "  ·  tap to start work" : ""}
          </ThemedText>
        </View>
        <View style={[styles.activityBadge, { backgroundColor: statusTone + "22", borderColor: statusTone }]}>
          <ThemedText style={[styles.activityBadgeText, { color: statusTone }]}>
            {data.status === "confirmed"
              ? "Confirmed"
              : data.status === "proposed"
              ? "Awaiting"
              : "Cancelled"}
          </ThemedText>
        </View>
      </Pressable>
    );
  }
  // quote
  const s = (data.status || "").toLowerCase();
  const tone =
    s === "accepted"
      ? Colors.status.accepted
      : s === "sent"
      ? Colors.status.quoted
      : s === "draft"
      ? Colors.status.pending
      : Colors.status.declined;
  const label =
    s === "accepted"
      ? "Accepted"
      : s === "sent"
      ? "Sent"
      : s === "draft"
      ? "Draft"
      : s.charAt(0).toUpperCase() + s.slice(1);
  const clientFirst = clientName ? clientName.trim().split(/\s+/)[0] : null;
  const title = clientFirst
    ? `Quote #${quoteShortId(data.id)} for ${clientFirst}`
    : `Quote #${quoteShortId(data.id)}`;
  // Subtitle prompt on the accepted quote row: ask the trade to book
  // a work appointment when they haven't yet. Disappears as soon as
  // a confirmed work appointment exists.
  const showScheduleHint =
    s === "accepted" && !hasConfirmedWorkAppt && !workStartedAt;
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.activityRow, pressed && { opacity: 0.7 }]}
      accessibilityRole="button"
    >
      <View style={[styles.activityIcon, { backgroundColor: c.elevate2 }]}>
        <Ionicons name="document-text-outline" size={18} color={c.text} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <ThemedText style={[styles.activityTitle, { color: c.text }]} numberOfLines={1}>
          {title}
        </ThemedText>
        {showScheduleHint && (
          <ThemedText style={[styles.activityMeta, { color: c.textMuted }]} numberOfLines={1}>
            Tap + to schedule the first visit
          </ThemedText>
        )}
      </View>
      <View style={[styles.activityBadge, { backgroundColor: tone + "22", borderColor: tone }]}>
        <ThemedText style={[styles.activityBadgeText, { color: tone }]}>{label}</ThemedText>
      </View>
    </Pressable>
  );
}

function RecentActivityBottomSheet({
  insets,
  c,
  activity,
  onClose,
  onReschedule,
  onCancelAppt,
  onOpenQuote,
  // Start-work props (optional — only meaningful on the trade side).
  canStartWork,
  workStartedAt,
  canUndoStartWork,
  onStartWork,
  onUndoStartWork,
}) {
  const visible = !!activity;
  const kind = activity?.kind;
  const data = activity?.data;
  // Only surface Start Work inside the appointment sheet when the
  // activity being viewed is an appointment. Avoids bleeding the
  // action into the quote sheet.
  const apptStatus = String(data?.status || "").toLowerCase();
  const isConfirmedAppt = kind === "appointment" &&
    (apptStatus === "confirmed" || apptStatus === "accepted");
  const showStartWork = isConfirmedAppt && canStartWork && !workStartedAt;
  const showStartedBadge = isConfirmedAppt && !!workStartedAt;
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={sheetStyles.backdrop} onPress={onClose}>
        <Pressable
          onPress={(e) => e.stopPropagation?.()}
          style={[
            sheetStyles.card,
            {
              backgroundColor: c.background,
              borderColor: c.border,
              paddingBottom: insets.bottom + 18,
            },
          ]}
        >
          <View style={[sheetStyles.handle, { backgroundColor: c.borderStrong }]} />
          {kind === "appointment" && data ? (
            <>
              <ThemedText style={[sheetStyles.title, { color: c.text }]}>
                {data.title || "Appointment"}
              </ThemedText>
              <ThemedText style={[sheetStyles.subtitle, { color: c.textMuted }]}>
                {new Date(data.scheduled_at).toLocaleString(undefined, {
                  weekday: "long",
                  day: "numeric",
                  month: "long",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </ThemedText>
              {data.location ? (
                <ThemedText style={[sheetStyles.meta, { color: c.textMid }]}>
                  Location: {data.location}
                </ThemedText>
              ) : null}

              {/* Work-started banner — only on a confirmed appointment
                  belonging to the accepted quote. While inside the 5-min
                  window the trade can also Undo the stamp. After that
                  window the banner stays for reference but Undo is hidden.  */}
              {showStartedBadge && (
                <View
                  style={{
                    marginTop: 12,
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "space-between",
                    paddingHorizontal: 12,
                    paddingVertical: 10,
                    borderRadius: 12,
                    backgroundColor: c.elevate,
                    borderWidth: 1,
                    borderColor: c.border,
                  }}
                >
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flex: 1, minWidth: 0 }}>
                    <Ionicons name="play-circle" size={18} color={Colors.status?.pending || "#F4B740"} />
                    <ThemedText style={{ color: c.text, fontFamily: "PublicSans_600SemiBold", fontSize: 14 }} numberOfLines={1}>
                      Work started
                    </ThemedText>
                    <ThemedText style={{ color: c.textMuted, fontSize: 12 }} numberOfLines={1}>
                      · {new Date(workStartedAt).toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                    </ThemedText>
                  </View>
                  {canUndoStartWork && (
                    <Pressable onPress={onUndoStartWork} hitSlop={8}>
                      <ThemedText style={{ color: Colors.primary, fontFamily: "PublicSans_600SemiBold", fontSize: 13 }}>
                        Undo
                      </ThemedText>
                    </Pressable>
                  )}
                </View>
              )}

              <View style={sheetStyles.actions}>
                {showStartWork && (
                  <Pressable
                    onPress={onStartWork}
                    style={({ pressed }) => [
                      sheetStyles.actionPrimary,
                      { backgroundColor: Colors.primary, flex: 1 },
                      pressed && { opacity: 0.85 },
                    ]}
                    accessibilityRole="button"
                    accessibilityLabel="Start work"
                  >
                    <Ionicons name="play" size={16} color="#fff" />
                    <ThemedText style={sheetStyles.actionPrimaryText}>
                      Start work
                    </ThemedText>
                  </Pressable>
                )}
                <Pressable
                  onPress={() => onReschedule(data)}
                  style={({ pressed }) => [
                    sheetStyles.actionGhost,
                    { backgroundColor: c.elevate, borderColor: c.border },
                    pressed && { opacity: 0.7 },
                  ]}
                >
                  <Ionicons name="calendar-outline" size={18} color={c.text} />
                  <ThemedText style={[sheetStyles.actionGhostText, { color: c.text }]}>
                    Reschedule
                  </ThemedText>
                </Pressable>
                <Pressable
                  onPress={() => onCancelAppt(data)}
                  style={({ pressed }) => [
                    sheetStyles.actionGhost,
                    { backgroundColor: c.elevate, borderColor: c.border },
                    pressed && { opacity: 0.7 },
                  ]}
                >
                  <Ionicons name="close-circle-outline" size={18} color={Colors.status.declined} />
                  <ThemedText
                    style={[sheetStyles.actionGhostText, { color: Colors.status.declined }]}
                  >
                    Cancel
                  </ThemedText>
                </Pressable>
              </View>
            </>
          ) : kind === "quote" && data ? (
            <>
              <ThemedText style={[sheetStyles.title, { color: c.text }]}>
                {data.project_title || "Quote"}
              </ThemedText>
              <ThemedText style={[sheetStyles.subtitle, { color: c.textMuted }]}>
                £{Number(data.grand_total || 0).toFixed(2)} ·{" "}
                {(data.status || "draft").charAt(0).toUpperCase() + (data.status || "draft").slice(1)}
              </ThemedText>
              <View style={sheetStyles.actions}>
                <Pressable
                  onPress={() => onOpenQuote(data)}
                  style={({ pressed }) => [
                    sheetStyles.actionPrimary,
                    { backgroundColor: Colors.primary },
                    pressed && { opacity: 0.85 },
                  ]}
                >
                  <Ionicons
                    name={
                      (data.status || "").toLowerCase() === "draft"
                        ? "create-outline"
                        : "eye-outline"
                    }
                    size={18}
                    color="#fff"
                  />
                  <ThemedText style={sheetStyles.actionPrimaryText}>
                    {(data.status || "").toLowerCase() === "draft" ? "Continue draft" : "Open quote"}
                  </ThemedText>
                </Pressable>
              </View>
            </>
          ) : null}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function CreateActionSheet({ insets, c, visible, onClose, onCreateQuote, onCreateAppointment }) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={sheetStyles.backdrop} onPress={onClose}>
        <Pressable
          onPress={(e) => e.stopPropagation?.()}
          style={[
            sheetStyles.card,
            {
              backgroundColor: c.background,
              borderColor: c.border,
              paddingBottom: insets.bottom + 18,
            },
          ]}
        >
          <View style={[sheetStyles.handle, { backgroundColor: c.borderStrong }]} />
          <ThemedText style={[sheetStyles.title, { color: c.text }]}>What would you like to add?</ThemedText>
          <Pressable
            onPress={onCreateQuote}
            style={({ pressed }) => [
              sheetStyles.row,
              pressed && { backgroundColor: c.elevate },
            ]}
          >
            <View style={[sheetStyles.rowIcon, { backgroundColor: Colors.primaryTint }]}>
              <Ionicons name="document-text-outline" size={22} color={Colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <ThemedText style={[sheetStyles.rowTitle, { color: c.text }]}>Create quote</ThemedText>
              <ThemedText style={[sheetStyles.rowSub, { color: c.textMuted }]}>
                Build a quote with line items — send or save as draft
              </ThemedText>
            </View>
          </Pressable>
          <Pressable
            onPress={onCreateAppointment}
            style={({ pressed }) => [
              sheetStyles.row,
              pressed && { backgroundColor: c.elevate },
            ]}
          >
            <View style={[sheetStyles.rowIcon, { backgroundColor: Colors.primaryTint }]}>
              <Ionicons name="calendar-outline" size={22} color={Colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <ThemedText style={[sheetStyles.rowTitle, { color: c.text }]}>Schedule appointment</ThemedText>
              <ThemedText style={[sheetStyles.rowSub, { color: c.textMuted }]}>
                Create appointment to schedule a visit or start work
              </ThemedText>
            </View>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function FABCreate({ insets, c, onPress }) {
  // Same y-offset rule as the floating tab bar (bar is hidden here so
  // the FAB owns the slot). isDevice is false on the simulator and the
  // simulator needs extra clearance from the home-indicator gesture.
  const Device = require("expo-device");
  const isSimulator = Device.isDevice === false;
  const bottom = isSimulator ? 130 : Math.max(insets.bottom + 46, 80);
  return (
    <View
      pointerEvents="box-none"
      style={[trvStyles.fabWrap, { bottom }]}
    >
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [
          trvStyles.fab,
          { backgroundColor: Colors.primary },
          pressed && { opacity: 0.85, transform: [{ scale: 0.96 }] },
        ]}
        hitSlop={10}
        accessibilityLabel="Create quote or appointment"
      >
        <Ionicons name="add" size={26} color="#fff" />
      </Pressable>
    </View>
  );
}

const sheetStyles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "flex-end",
  },
  card: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 10,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderBottomWidth: 0,
  },
  handle: {
    alignSelf: "center",
    width: 40,
    height: 4,
    borderRadius: 2,
    marginBottom: 14,
  },
  title: {
    fontFamily: "PublicSans_700Bold",
    fontSize: 18,
    letterSpacing: -0.3,
    paddingHorizontal: 4,
  },
  subtitle: {
    fontFamily: "DMSans_400Regular",
    fontSize: 13,
    marginTop: 4,
    paddingHorizontal: 4,
  },
  meta: {
    fontFamily: "DMSans_400Regular",
    fontSize: 13,
    marginTop: 6,
    paddingHorizontal: 4,
  },
  actions: {
    flexDirection: "row",
    gap: 10,
    marginTop: 18,
  },
  actionGhost: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    borderRadius: 14,
    borderWidth: 1,
  },
  actionGhostText: {
    fontFamily: "PublicSans_600SemiBold",
    fontSize: 15,
  },
  actionPrimary: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    borderRadius: 14,
  },
  actionPrimaryText: {
    fontFamily: "PublicSans_600SemiBold",
    fontSize: 15,
    color: "#fff",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 14,
    borderRadius: 14,
    marginTop: 8,
  },
  rowIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  rowTitle: {
    fontFamily: "PublicSans_600SemiBold",
    fontSize: 15,
    letterSpacing: -0.2,
  },
  rowSub: {
    fontFamily: "DMSans_400Regular",
    fontSize: 12,
    marginTop: 2,
  },
});

// Quotes section component for Client Request page
function QuotesSection({ quotes, hasQuotes, canCreateQuote, router, requestId, derivedTitleForCreate, clientName }) {
  const { quoteStyles, colors: c } = useStyles();
  const [showOtherQuotes, setShowOtherQuotes] = useState(false);

  // Get client first name for quote labels
  const clientFirstName = clientName ? clientName.split(" ")[0] : null;

  // Helper to get last 4 characters of quote ID for display
  // This ensures both trade and client see the same quote identifier
  const getQuoteShortId = (quoteId) => {
    if (!quoteId) return "0000";
    const idStr = String(quoteId);
    return idStr.slice(-4).toUpperCase();
  };

  // Sort quotes by creation date (oldest first for numbering)
  const sortedByDate = [...quotes].sort((a, b) =>
    new Date(a.created_at) - new Date(b.created_at)
  );

  // Create a map of quote id to its short ID (last 4 chars)
  const quoteNumberMap = {};
  sortedByDate.forEach((q) => {
    quoteNumberMap[q.id] = getQuoteShortId(q.id);
  });

  // Sort quotes for display: accepted first, then drafts (action needed), then sent, then declined/expired
  const sortedQuotes = [...quotes].sort((a, b) => {
    const aStatus = (a.status || "").toLowerCase();
    const bStatus = (b.status || "").toLowerCase();
    const priorityOrder = { accepted: 0, draft: 1, sent: 2, created: 2, declined: 3, expired: 3 };
    const aPrio = priorityOrder[aStatus] ?? 4;
    const bPrio = priorityOrder[bStatus] ?? 4;
    return aPrio - bPrio;
  });

  // Check if any quote is accepted
  const acceptedQuote = sortedQuotes.find(q => (q.status || "").toLowerCase() === "accepted");
  const otherQuotes = acceptedQuote ? sortedQuotes.filter(q => q.id !== acceptedQuote.id) : [];

  // Format date helper
  const formatDate = (dateStr) => {
    if (!dateStr) return null;
    const d = new Date(dateStr);
    return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  };

  // Render a single quote card
  const renderQuoteCard = (quote, quoteNumber, isAccepted = false, isInOtherSection = false) => {
    const status = (quote.status || "").toLowerCase();
    const isDraft = status === "draft";
    const isSent = status === "sent" || status === "created";
    const isDeclined = status === "declined";
    const isExpired = status === "expired";
    // Muted styling for non-accepted quotes when an accepted quote exists
    const isMuted = isInOtherSection && (isDraft || isDeclined || isExpired);

    // Calculate expiry info for sent quotes
    const createdDate = quote.created_at ? new Date(quote.created_at) : null;
    const validUntil = quote.valid_until ? new Date(quote.valid_until) : null;
    const sentDateLabel = createdDate ? formatDate(quote.created_at) : null;
    const expiryDateLabel = validUntil ? formatDate(quote.valid_until) : null;

    // Build quote title: "Quote #XXXX - ClientName" or just "Quote #XXXX"
    // Uses last 4 chars of quote ID so both trade and client see same identifier
    const quoteTitle = clientFirstName
      ? `Quote #${quoteNumber} - ${clientFirstName}`
      : `Quote #${quoteNumber}`;

    // Handle card press for sent/accepted quotes (navigate to read-only view)
    const handleCardPress = () => {
      if (!isDraft) {
        router.push({
          pathname: "/quotes/[id]",
          params: {
            id: quote.id,
            readOnly: "true",
            quoteTitle: encodeURIComponent(quoteTitle),
          },
        });
      }
    };

    return (
      <Pressable
        key={quote.id}
        style={[quoteStyles.quoteCard, isMuted && quoteStyles.quoteCardMuted]}
        onPress={!isDraft ? handleCardPress : undefined}
        disabled={isDraft}
      >
        {/* Header with title and status badge */}
        <View style={quoteStyles.quoteCardHeader}>
          <ThemedText style={[quoteStyles.quoteCardTitle, isMuted && { color: c.textMuted }]}>
            {quoteTitle}
          </ThemedText>
          <QuoteStatusBadge status={isDraft && isInOtherSection ? "unused" : quote.status} />
        </View>

        {/* Price */}
        <ThemedText style={[quoteStyles.quoteCardPrice, isMuted && { color: c.textMuted }]}>
          £{formatNumber(quote.grand_total || 0)}
        </ThemedText>

        {/* Date info for sent quotes */}
        {isSent && sentDateLabel && (
          <ThemedText style={quoteStyles.quoteCardDateInfo}>
            Sent {sentDateLabel}{expiryDateLabel ? ` • Expires ${expiryDateLabel}` : ""}
          </ThemedText>
        )}

        {/* Status-specific content */}
        {/* Only show Edit/Send buttons for drafts that are NOT in the "other" section */}
        {isDraft && !isInOtherSection && (
          <View style={quoteStyles.quoteCardActions}>
            <Pressable
              style={quoteStyles.editButton}
              onPress={() => router.push({
                pathname: "/quotes/create",
                params: { quoteId: quote.id },
              })}
            >
              <ThemedText style={quoteStyles.editButtonText}>Edit</ThemedText>
            </Pressable>
            <Pressable
              style={quoteStyles.sendButton}
              onPress={() => router.push({
                pathname: "/quotes/create",
                params: { quoteId: quote.id },
              })}
            >
              <ThemedText style={quoteStyles.sendButtonText}>Send</ThemedText>
            </Pressable>
          </View>
        )}

        {isSent && (
          <View style={quoteStyles.quoteCardFooter}>
            <Ionicons name="hourglass-outline" size={16} color="#3B82F6" />
            <ThemedText style={quoteStyles.awaitingText}>Awaiting client response</ThemedText>
          </View>
        )}

        {isAccepted && (
          <Pressable
            style={quoteStyles.scheduleButton}
            onPress={(e) => {
              e.stopPropagation();
              router.push({
                pathname: "/quotes/schedule",
                params: {
                  requestId: String(requestId || ""),
                  quoteId: quote.id,
                  title: encodeURIComponent(quote.project_title || derivedTitleForCreate),
                },
              });
            }}
          >
            <Ionicons name="calendar" size={16} color="#FFF" />
            <ThemedText style={quoteStyles.scheduleButtonText}>Schedule work</ThemedText>
          </Pressable>
        )}
      </Pressable>
    );
  };

  return (
    <>
      <View style={quoteStyles.sectionHeaderRow}>
        <ThemedText style={quoteStyles.sectionHeaderTitle}>
          Quotes{hasQuotes ? ` (${quotes.length})` : ""}
        </ThemedText>
        {canCreateQuote && (
          <Pressable
            onPress={() => {
              router.push({
                pathname: "/quotes/create",
                params: {
                  requestId: String(requestId || ""),
                  title: encodeURIComponent(derivedTitleForCreate),
                },
              });
            }}
            style={quoteStyles.sectionHeaderBtn}
            hitSlop={6}
          >
            <Ionicons name="add" size={16} color={Colors.primary} />
            <ThemedText style={quoteStyles.sectionHeaderBtnText}>Create</ThemedText>
          </Pressable>
        )}
      </View>

      {!hasQuotes ? (
        <View style={quoteStyles.emptyCard}>
          <View style={quoteStyles.emptyStateContainer}>
            <View style={quoteStyles.emptyStateIcon}>
              <Ionicons name="document-text-outline" size={32} color={c.textMuted} />
            </View>
            <ThemedText style={quoteStyles.emptyStateTitle}>No quotes yet</ThemedText>
            <ThemedText style={quoteStyles.emptyStateSubtitle}>
              Tap + Create above to send a quote
            </ThemedText>
          </View>
        </View>
      ) : acceptedQuote ? (
        <>
          {/* Show accepted quote prominently */}
          {renderQuoteCard(acceptedQuote, quoteNumberMap[acceptedQuote.id], true)}

          {/* Collapsible section for other quotes */}
          {otherQuotes.length > 0 && (
            <Pressable
              style={quoteStyles.otherQuotesToggle}
              onPress={() => setShowOtherQuotes(!showOtherQuotes)}
            >
              <ThemedText style={quoteStyles.otherQuotesToggleText}>
                {otherQuotes.length} other quote{otherQuotes.length > 1 ? "s" : ""}
              </ThemedText>
              <Ionicons
                name={showOtherQuotes ? "chevron-up" : "chevron-down"}
                size={18}
                color={c.textMid}
              />
            </Pressable>
          )}

          {showOtherQuotes && otherQuotes.map(q =>
            renderQuoteCard(q, quoteNumberMap[q.id], false, true)
          )}
        </>
      ) : (
        // No accepted quote - show all quotes as separate cards
        sortedQuotes.map(q => renderQuoteCard(q, quoteNumberMap[q.id]))
      )}
    </>
  );
}

// Styles for QuotesSection
function makeQuoteStyles(c, dark) {
  return StyleSheet.create({
  sectionHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 24,
    marginHorizontal: 16,
  },
  sectionHeaderTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: c.text,
  },
  sectionHeaderBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingVertical: 4,
    paddingHorizontal: 4,
  },
  sectionHeaderBtnText: {
    fontSize: 15,
    fontWeight: "600",
    color: Colors.primary,
  },

  // Empty state card
  emptyCard: {
    marginTop: 12,
    marginHorizontal: 16,
    backgroundColor: "#fff",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: c.border,
    padding: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  emptyStateContainer: {
    alignItems: "center",
    paddingVertical: 16,
  },
  emptyStateIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: c.elevate2,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  emptyStateTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: c.textMid,
    marginBottom: 4,
  },
  emptyStateSubtitle: {
    fontSize: 14,
    color: c.textMuted,
    textAlign: "center",
  },
  createQuoteButton: {
    marginTop: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: Colors.primary,
    paddingVertical: 14,
    borderRadius: 12,
  },
  createQuoteButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#FFF",
  },

  // Quote card - each quote is its own card
  quoteCard: {
    marginTop: 12,
    marginHorizontal: 16,
    backgroundColor: "#fff",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: c.border,
    padding: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  quoteCardMuted: {
    backgroundColor: c.elevate2,
    opacity: 0.8,
  },
  quoteCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  quoteCardTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: c.text,
  },
  quoteCardPrice: {
    fontSize: 22,
    fontWeight: "700",
    color: c.text,
    marginBottom: 4,
  },
  quoteCardDateInfo: {
    fontSize: 13,
    color: c.textMid,
    marginBottom: 8,
  },

  // Actions row for draft quotes - equal width buttons
  quoteCardActions: {
    flexDirection: "row",
    gap: 12,
    marginTop: 8,
  },
  editButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: c.border,
    backgroundColor: "#fff",
  },
  editButtonText: {
    fontSize: 15,
    fontWeight: "600",
    color: c.textMid,
  },
  sendButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: Colors.primary,
  },
  sendButtonText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#FFF",
  },
  scheduleButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: Colors.primary,
    marginTop: 8,
  },
  scheduleButtonText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#FFF",
  },

  // Awaiting response footer
  quoteCardFooter: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 8,
  },
  awaitingText: {
    fontSize: 14,
    color: "#3B82F6",
    fontWeight: "500",
  },

  // Other quotes collapsible section
  otherQuotesToggle: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 16,
    marginHorizontal: 16,
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: c.elevate2,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: c.border,
  },
  otherQuotesToggleText: {
    fontSize: 14,
    fontWeight: "500",
    color: c.textMid,
  },
  });
}

export default function RequestDetails() {
  const { id } = useLocalSearchParams(); // request_id
  const router = useRouter();
  const { user } = useUser();
  const insets = useSafeAreaInsets();
  const { styles, colors: c, dark } = useStyles();
  // Detail screen has its own bottom dock — hide the floating tab bar.
  useHideTabBar();

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);
  // Latches after the first successful fetch so focus-refresh doesn't
  // flash the skeleton. Ref instead of state so the latest value is
  // always visible inside the memoised `load` callback.
  const hasLoadedOnceRef = useRef(false);

  const [req, setReq] = useState(null); // quote_requests row
  const [tgt, setTgt] = useState(null); // request_targets row for this trade (optional)
  const [quotes, setQuotes] = useState([]); // Quotes for this request (up to 3)
  const [clientName, setClientName] = useState(null); // Client name from requester profile

  const [attachments, setAttachments] = useState([]); // string[] of final URLs
  const [attachmentsCount, setAttachmentsCount] = useState(0);

  // Appointments for this request (survey visits before quote)
  const [appointments, setAppointments] = useState([]);

  // Full-screen viewer state: open + current index
  const [viewer, setViewer] = useState({ open: false, index: 0 });

  // Recent Activity bottom-sheet + FAB + create-action sheet (claimed only)
  const [activitySheet, setActivitySheet] = useState(null); // activity item or null
  const [createSheetOpen, setCreateSheetOpen] = useState(false);

  const closeViewer = useCallback(() => {
    setViewer((v) => ({ ...v, open: false }));
  }, []);

  // Pull down to dismiss: only when page is active AND zoomed out (≈1)
  const handleZoomScrollEndDrag = useCallback(
    (e, pageIndex) => {
      if (!viewer.open || pageIndex !== viewer.index) return;
      const { contentOffset, zoomScale } = e.nativeEvent || {};
      if (zoomScale && zoomScale <= 1.01 && contentOffset?.y < -40) {
        closeViewer();
      }
    },
    [viewer.open, viewer.index, closeViewer]
  );

  const parsed = useMemo(() => parseDetails(req?.details), [req?.details]);

  const loadAttachments = useCallback(async (requestId) => {
    try {
      const paths = await listRequestImagePaths(String(requestId));
      const p = Array.isArray(paths) ? paths : [];
      setAttachmentsCount(p.length);

      if (!p.length) {
        setAttachments([]);
        return;
      }

      // Use signed URLs for secure access
      const signed = await getSignedUrls(p, 3600);
      const urls = (signed || []).map((s) => s.url).filter(Boolean);

      setAttachments(urls);
    } catch (e) {
      console.warn("attachments/load error:", e?.message || e);
      setAttachments([]);
      setAttachmentsCount(0);
    }
  }, []);

  const load = useCallback(async () => {
    if (!user?.id || !id) return;
    // Only show the full-screen skeleton on the first fetch. Subsequent
    // focus re-enters (e.g. returning from Create Quote or Create
    // Appointment) refresh silently in the background — the previous
    // content stays on screen, so the transition doesn't feel slowed
    // down by a skeleton flash.
    if (!hasLoadedOnceRef.current) setLoading(true);
    setErr(null);
    try {
      const myId = user.id;

      const [{ data: r, error: rErr }, { data: t }, { data: q, error: qErr }] =
        await Promise.all([
          supabase
            .from("quote_requests")
            .select(`
              id, details, created_at, status, claimed_by, claimed_at, budget_band, postcode, requester_id, suggested_title,
              service_categories(id, name, icon),
              service_types(id, name, icon),
              property_types(id, name),
              timing_options(id, name, description, is_emergency)
            `)
            .eq("id", id)
            .maybeSingle(),
          supabase
            .from("request_targets")
            .select("request_id, trade_id, state, invited_by, created_at, outside_service_area, distance_miles, extended_match")
            .eq("request_id", id)
            .eq("trade_id", myId)
            .maybeSingle(),
          supabase
            .from("tradify_native_app_db")
            .select("id, project_title, grand_total, status, created_at, line_items, valid_until, request_id, work_started_at")
            .eq("trade_id", myId)
            .eq("request_id", id)
            .order("created_at", { ascending: false })
            .limit(3),
        ]);

      if (rErr) throw rErr;
      setReq(r || null);
      setTgt(t || null);
      // Store all quotes (up to 3)
      setQuotes(q && q.length ? q : []);

      // Fetch client name from requester profile
      if (r?.requester_id) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("full_name")
          .eq("id", r.requester_id)
          .maybeSingle();
        setClientName(profile?.full_name || null);
      }

      await loadAttachments(id);

      // Fetch ALL appointments for this request (survey visits before quote)
      // Try multiple methods to find appointments
      try {
        let appointmentsToUse = [];

        // Method 1: Try rpc_trade_list_appointments
        try {
          const { data: allAppts, error: apptErr } = await supabase.rpc(
            "rpc_trade_list_appointments",
            { p_only_upcoming: false }
          );

          if (!apptErr && allAppts && allAppts.length > 0) {
            const filtered = (Array.isArray(allAppts) ? allAppts : [])
              .filter((a) => a.request_id === id);

            if (filtered.length > 0) {
              appointmentsToUse = filtered.map((a) => ({
                id: a.appointment_id,
                scheduled_at: a.scheduled_at,
                status: a.status,
                // Prioritize the appointment's own title (e.g., "Initial survey") over project title
                title: a.title || a.project_title || "Survey visit",
                location: a.postcode || a.location,
                notes: a.notes,
              }));
            }
          }
        } catch (e) {
          // Method 1 failed, continue to fallback
        }

        // Method 2: If Method 1 didn't find any, query appointments directly for this request
        if (appointmentsToUse.length === 0) {
          try {
            const { data: directAppts, error: directErr } = await supabase
              .from("appointments")
              .select("*")
              .eq("request_id", id);

            if (!directErr && directAppts && directAppts.length > 0) {
              appointmentsToUse = directAppts.map((a) => ({
                id: a.id,
                scheduled_at: a.scheduled_at,
                status: a.status,
                title: a.title || "Survey visit",
                location: a.location,
                notes: a.notes,
              }));
            }
          } catch (e) {
            // Method 2 failed, continue to fallback
          }
        }

        // Method 3: If still nothing, try via rpc_get_latest_request_appointment
        if (appointmentsToUse.length === 0) {
          try {
            const { data: latestAppt, error: latestErr } = await supabase.rpc(
              "rpc_get_latest_request_appointment",
              { p_request_id: id }
            );

            if (!latestErr && latestAppt) {
              // Handle nested arrays like [[{...}]]
              let appt = latestAppt;
              while (Array.isArray(appt)) {
                if (appt.length === 0) break;
                appt = appt[0];
              }

              if (appt && appt.id) {
                appointmentsToUse = [{
                  id: appt.id,
                  scheduled_at: appt.scheduled_at,
                  status: appt.status,
                  title: appt.title || "Survey visit",
                  location: appt.location,
                  notes: appt.notes,
                }];
              }
            }
          } catch (e) {
            // Method 3 failed
          }
        }

        setAppointments(appointmentsToUse);
      } catch (apptErr) {
        console.warn("appointments/load error:", apptErr?.message || apptErr);
        setAppointments([]);
      }
    } catch (e) {
      setErr(e?.message || String(e));
      setAttachments([]);
      setAttachmentsCount(0);
    } finally {
      hasLoadedOnceRef.current = true;
      setLoading(false);
    }
  }, [user?.id, id, loadAttachments]);

  useEffect(() => {
    load();
  }, [load]);

  // Refresh data when screen gains focus (e.g., returning from schedule page)
  useFocusEffect(
    useCallback(() => {
      if (user?.id && id) {
        load();
      }
    }, [user?.id, id, load])
  );

  // Status for trade view: use request_targets.state mapped to UI labels
  // Database states: "client_accepted" (client sent direct request), "accepted" (trade accepted),
  // "trade_accepted" (trade accepted), "declined" (trade declined)
  // Also check quote_requests.status for "claimed" which means trade has accepted
  const tgtState = (tgt?.state || "").toLowerCase();
  const reqStatus = (req?.status || "").toLowerCase();

  // Trade has accepted if: tgt.state contains "accepted" OR req.status is "claimed"
  const isAccepted = tgtState.includes("accepted") || reqStatus === "claimed";
  const isDeclined = tgtState === "declined";
  const status = isAccepted ? "claimed" : isDeclined ? "declined" : "open";

  function statusTone(s) {
    if (s === "claimed") return "active";
    if (s === "declined") return "negative";
    if (s === "open") return "action"; // Open = action needed
    return "muted";
  }

  async function onAccept() {
    if (!id) return;

    // If outside service area, show a different confirmation
    const isOutsideArea = tgt?.outside_service_area;
    const distanceInfo = tgt?.distance_miles ? ` (${tgt.distance_miles} miles away)` : "";

    const title = isOutsideArea ? "Accept anyway?" : "Accept request";
    const message = isOutsideArea
      ? `This client is outside your service area${distanceInfo}. Are you sure you want to accept this request?`
      : "Confirm you want to accept this request?";

    Alert.alert(title, message, [
      { text: "Cancel", style: "cancel" },
      {
        text: isOutsideArea ? "Accept anyway" : "Accept",
        onPress: async () => {
          try {
            const updated = await acceptRequest(id);

            // Also update request_targets.state directly to ensure persistence
            // The RPC may only update quote_requests, not request_targets
            if (user?.id) {
              const { error: tgtErr } = await supabase
                .from("request_targets")
                .update({ state: "accepted" })
                .eq("request_id", id)
                .eq("trade_id", user.id);
              if (tgtErr) {
                console.error("request_targets update error:", tgtErr);
              }
            }

            // Update req with any returned data
            setReq((prev) => ({
              ...(prev || {}),
              ...updated,
            }));
            // Update tgt.state to "accepted" so status becomes "claimed"
            setTgt((prev) => ({
              ...(prev || {}),
              state: "accepted",
            }));
          } catch (e) {
            Alert.alert("Accept Failed", e?.message || "Unable to accept this request.");
          }
        },
      },
    ]);
  }

  async function onDecline() {
    if (!id) return;
    Alert.alert("Decline request", "Are you sure you want to decline?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Decline",
        style: "destructive",
        onPress: async () => {
          try {
            const updated = await declineRequest(id);

            // Also update request_targets.state directly to ensure persistence
            if (user?.id) {
              const { error: tgtErr } = await supabase
                .from("request_targets")
                .update({ state: "declined" })
                .eq("request_id", id)
                .eq("trade_id", user.id);
              if (tgtErr) {
                console.error("request_targets update error:", tgtErr);
              }
            }

            // Update req with any returned data
            setReq((prev) => ({
              ...(prev || {}),
              ...updated,
            }));
            // Update tgt.state to "declined" so status becomes "declined"
            setTgt((prev) => ({
              ...(prev || {}),
              state: "declined",
            }));
          } catch (e) {
            Alert.alert("Failed", e?.message || "Unable to decline this request.");
          }
        },
      },
    ]);
  }

  const canAccept = status === "open";
  const canDecline = status === "open";
  const hasQuotes = quotes.length > 0;
  // Can create new quote if claimed and has less than 3 quotes
  const canCreateQuote = status === "claimed" && quotes.length < 3;

  // Build titles - prioritize joined table data (service_categories, service_types) for accurate display
  // Skip any title that starts with "Direct request to:" as that's metadata, not a title
  const rawTitle = parsed.title || "";
  const cleanedParsedTitle = rawTitle.toLowerCase().startsWith("direct request to")
    ? null
    : rawTitle;

  // Get category and service from joined tables (most reliable)
  const categoryName = req?.service_categories?.name || parsed.category;
  const serviceName = req?.service_types?.name || parsed.service || parsed.main;
  const out = (req?.postcode || "").toString().trim().toUpperCase();

  // Build the professional title format: "Category: Service in Postcode"
  // (When displayed with client name prefix, it becomes "ClientName's Category: Service in Postcode")
  let baseTitle;
  if (categoryName && serviceName) {
    baseTitle = `${categoryName}: ${serviceName}`;
  } else if (categoryName) {
    baseTitle = categoryName;
  } else if (serviceName) {
    baseTitle = serviceName;
  } else if (req?.suggested_title) {
    // Fallback: parse suggested_title (format: "Category - Service")
    const parts = req.suggested_title.split(" - ").map(s => s.trim());
    if (parts.length >= 2) {
      baseTitle = `${parts[0]}: ${parts.slice(1).join(" - ")}`;
    } else {
      baseTitle = req.suggested_title;
    }
  } else {
    baseTitle = (parsed.main && parsed.refit && `${parsed.main} – ${parsed.refit}`) ||
      parsed.main ||
      cleanedParsedTitle ||
      "Project";
  }

  const derivedTitleForCreate = out ? `${baseTitle} in ${out}` : baseTitle;

  // Build display title with client name for quote cards
  const displayTitleWithClient = clientName
    ? `${clientName.split(" ")[0]}'s ${derivedTitleForCreate}`
    : derivedTitleForCreate;

  const hasAttachments = attachments.length > 0;

  // Work-started machinery. `workStartedAt` flips the project into
  // "In progress" on both POVs; `canStartWork` guards the action
  // (needs accepted quote + confirmed appointment for the quote);
  // `canUndoStartWork` mirrors the 5-minute RPC window so the chip
  // only renders while the RPC will still accept it.
  const acceptedQuote = (quotes || []).find(
    (q) => String(q?.status || "").toLowerCase() === "accepted"
  ) || null;
  const workStartedAt = acceptedQuote?.work_started_at || null;
  const hasConfirmedWorkAppt = (appointments || []).some((a) => {
    const s = String(a?.status || "").toLowerCase();
    if (!(s === "confirmed" || s === "accepted")) return false;
    if (acceptedQuote?.id && a.quote_id === acceptedQuote.id) return true;
    // Fallback: request-level appointments (quote_id null) that don't
    // look like a survey — treat as work appointments.
    const title = String(a?.title || "").toLowerCase();
    return !title.includes("survey");
  });
  const canStartWork =
    !!acceptedQuote && !workStartedAt && hasConfirmedWorkAppt;
  const workStartedMsAgo = workStartedAt
    ? Date.now() - new Date(workStartedAt).getTime()
    : null;
  const canUndoStartWork =
    !!workStartedAt && workStartedMsAgo != null && workStartedMsAgo < 5 * 60 * 1000;

  // === Derived values for the redesigned hero ===
  const reqTitle =
    req?.suggested_title ||
    req?.service_types?.name ||
    parsed.service ||
    parsed.title ||
    "New request";
  const clientPostcode = req?.postcode || "";
  const clientLocation = clientPostcode
    ? `Verified client · ${clientPostcode.split(" ")[0]}`
    : "Verified client";
  const distanceMiles = tgt?.distance_miles
    ? `${Number(tgt.distance_miles).toFixed(1)} mi`
    : null;
  const budgetText = req?.budget_band || parsed.budget || "—";
  const timingText = req?.timing_options?.name || parsed.timing || "—";
  // Item count = scope items count if we can derive any
  const scopeItems = (() => {
    const list = [];
    const svc = req?.service_types?.name || parsed.service;
    const cat = req?.service_categories?.name || parsed.category;
    if (svc) list.push({ icon: svc, title: svc, sub: cat || "" });
    return list;
  })();
  const itemsCount = scopeItems.length > 0 ? scopeItems.length : 1;
  const clientInitials = (() => {
    const n = clientName || "Client";
    const parts = n.trim().split(/\s+/).filter(Boolean);
    if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    return n.slice(0, 2).toUpperCase();
  })();
  const enquiredAgo = (() => {
    const ts = req?.created_at;
    if (!ts) return "";
    const diff = Math.max(0, Math.floor((Date.now() - new Date(ts).getTime()) / 60000));
    if (diff < 1) return "just now";
    if (diff < 60) return `${diff}m ago`;
    const hr = Math.floor(diff / 60);
    if (hr < 24) return `${hr}h ago`;
    const day = Math.floor(hr / 24);
    return `${day}d ago`;
  })();
  const eyebrowText =
    status === "open"
      ? `NEW REQUEST · ${enquiredAgo}`
      : status === "claimed"
      ? "ACTIVE REQUEST"
      : status === "declined"
      ? "DECLINED REQUEST"
      : `REQUEST · ${enquiredAgo}`;
  const eyebrowDot =
    status === "open"
      ? Colors.status.pending
      : status === "claimed"
      ? Colors.status.scheduled
      : Colors.status.declined;

  // Inline chevron — used in BOTH the error/empty fallback bodies and
  // as the first row inside the ScrollView's content. Scrolls with the
  // rest of the page so it never covers content as the user scrolls.
  const inlineChevron = (
    <Pressable
      onPress={() =>
        router.canGoBack?.() ? router.back() : router.replace("/quotes")
      }
      hitSlop={10}
      style={[
        trvStyles.inlineChevron,
        { backgroundColor: c.elevate, borderColor: c.border },
      ]}
      accessibilityRole="button"
      accessibilityLabel="Back"
    >
      <Ionicons name="chevron-back" size={18} color={c.text} />
    </Pressable>
  );

  return (
    <ThemedView style={styles.container}>
      {err ? (
        <View style={{ paddingTop: insets.top + 12, paddingHorizontal: 0 }}>
          {inlineChevron}
          <View style={{ paddingHorizontal: 20 }}>
            <ThemedText>Error: {err}</ThemedText>
          </View>
        </View>
      ) : !req ? (
        // No skeleton — the inline chevron gives an instant back route.
        // Initial fetch is fast enough that an empty screen for the few
        // ms is cleaner than a loader flash.
        <View style={{ paddingTop: insets.top + 12 }}>
          {inlineChevron}
        </View>
      ) : (
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{
            // Chevron is inline at the top of this content now; just a
            // modest top pad off the safe-area edge.
            paddingTop: insets.top + 12,
            // Extra bottom room so the FAB (~60px circle + 80-130px
            // bottom offset) doesn't cover the last content row.
            paddingBottom: insets.bottom + 220,
          }}
          // `never` — we already reserve the safe-area-top ourselves via
          // paddingTop above. With the default/"always" behaviour iOS
          // silently added another insets.top worth of inset on top of
          // our manual value, producing a ~175px empty band between the
          // floating chevron and the eyebrow.
          contentInsetAdjustmentBehavior="never"
          keyboardShouldPersistTaps="handled"
        >
          {/* Inline chevron — scrolls with the content. */}
          {inlineChevron}

          {/* Eyebrow */}
          <View style={trvStyles.eyebrowRow}>
            <View style={[trvStyles.eyebrowDot, { backgroundColor: eyebrowDot }]} />
            <ThemedText style={[trvStyles.eyebrow, { color: c.textMuted }]}>
              {eyebrowText}
            </ThemedText>
          </View>

          {/* Big title */}
          <ThemedText style={[trvStyles.title, { color: c.text }]}>
            {reqTitle}
          </ThemedText>

          {/* Client row — avatar · name/location · message button at far right */}
          <View style={trvStyles.clientRow}>
            <View style={[trvStyles.clientAvatar, { backgroundColor: Colors.primaryTint }]}>
              <ThemedText style={[trvStyles.clientInitials, { color: Colors.primary }]}>
                {clientInitials}
              </ThemedText>
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <ThemedText
                style={[trvStyles.clientName, { color: c.text }]}
                numberOfLines={1}
              >
                {clientName || "Client"}
              </ThemedText>
              <ThemedText
                style={[trvStyles.clientMeta, { color: c.textMuted }]}
                numberOfLines={1}
              >
                {clientLocation}
              </ThemedText>
            </View>
            {distanceMiles ? (
              <ThemedText style={[trvStyles.distanceText, { color: c.textMid }]}>
                {distanceMiles}
              </ThemedText>
            ) : null}
            {status === "claimed" && (
              <Pressable
                onPress={() => {
                  router.push({
                    pathname: "/(dashboard)/messages/[id]",
                    params: {
                      id: String(id),
                      name: clientName || "",
                      returnTo: `/(dashboard)/quotes/request/${id}`,
                    },
                  });
                }}
                hitSlop={10}
                style={({ pressed }) => [
                  trvStyles.clientMsgBtn,
                  { backgroundColor: c.elevate, borderColor: c.border },
                  pressed && { opacity: 0.7 },
                ]}
                accessibilityLabel="Message client"
              >
                <Ionicons name="chatbubble-outline" size={16} color={c.text} />
              </Pressable>
            )}
          </View>

          {/* Job description — same visual treatment as the Budget /
              Timing fact pills: label inside a bordered container with
              matching radius + padding. Always rendered with a
              placeholder when empty.                               */}
          <View style={trvStyles.descRow}>
            <View
              style={[
                trvStyles.descPill,
                { backgroundColor: c.elevate, borderColor: c.border },
              ]}
            >
              <ThemedText style={[trvStyles.descLabel, { color: c.textMuted }]}>
                JOB DESCRIPTION
              </ThemedText>
              <ThemedText
                style={[
                  trvStyles.descValue,
                  {
                    color:
                      parsed.description || parsed.notes
                        ? c.text
                        : c.textMuted,
                    fontStyle:
                      parsed.description || parsed.notes ? "normal" : "italic",
                  },
                ]}
              >
                {parsed.description ||
                  parsed.notes ||
                  "No description provided — the client didn't add one."}
              </ThemedText>
            </View>
          </View>

          {/* Two quick-fact pills (ITEMS removed — always 1, not useful).
              TIMING allows 2 lines so long strings like
              "As soon as availability allows" don't truncate. */}
          <View style={trvStyles.factsRow}>
            <View style={[trvStyles.factPill, { backgroundColor: c.elevate, borderColor: c.border }]}>
              <ThemedText style={[trvStyles.factLabel, { color: c.textMuted }]}>BUDGET</ThemedText>
              <ThemedText style={[trvStyles.factValue, { color: c.text }]} numberOfLines={2}>
                {budgetText}
              </ThemedText>
            </View>
            <View style={[trvStyles.factPill, { backgroundColor: c.elevate, borderColor: c.border }]}>
              <ThemedText style={[trvStyles.factLabel, { color: c.textMuted }]}>TIMING</ThemedText>
              <ThemedText style={[trvStyles.factValue, { color: c.text }]} numberOfLines={2}>
                {timingText}
              </ThemedText>
            </View>
          </View>

          {/* Photos */}
          {hasAttachments && (
            <>
              <ThemedText style={[trvStyles.sectionLabel, { color: c.textMuted }]}>
                PHOTOS · {attachmentsCount}
              </ThemedText>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ paddingHorizontal: 16, gap: 8 }}
              >
                {attachments.map((url, i) => (
                  <Pressable
                    key={`${url}-${i}`}
                    onPress={() => setViewer({ open: true, index: i })}
                    style={[
                      trvStyles.photoThumb,
                      { borderColor: c.border, backgroundColor: c.elevate2 },
                    ]}
                  >
                    <Image
                      source={{ uri: url }}
                      style={{ width: "100%", height: "100%" }}
                      resizeMode="cover"
                    />
                  </Pressable>
                ))}
              </ScrollView>
            </>
          )}

          {/* Banners (legacy) — extended match / outside area */}
          {tgt?.extended_match && (
            <View style={[styles.extendedMatchBanner, { marginHorizontal: 16, marginTop: 18 }]}>
              <View style={styles.extendedMatchIcon}>
                <Ionicons name="car-outline" size={20} color="#3B82F6" />
              </View>
              <View style={styles.extendedMatchContent}>
                <ThemedText style={styles.extendedMatchTitle}>Extended Travel Job</ThemedText>
                <ThemedText style={styles.extendedMatchDescription}>
                  This job is outside your normal service area but matches your extended travel settings.
                </ThemedText>
              </View>
            </View>
          )}
          {tgt?.outside_service_area && (
            <View style={[styles.outsideServiceAreaBanner, { marginHorizontal: 16, marginTop: 12 }]}>
              <View style={styles.outsideServiceAreaIcon}>
                <Ionicons name="location-outline" size={20} color="#F59E0B" />
              </View>
              <View style={styles.outsideServiceAreaContent}>
                <ThemedText style={styles.outsideServiceAreaTitle}>
                  Outside Your Service Area{tgt?.distance_miles ? ` (${tgt.distance_miles} mi)` : ""}
                </ThemedText>
                <ThemedText style={styles.outsideServiceAreaText}>
                  This client's location is outside your usual radius.
                </ThemedText>
              </View>
            </View>
          )}

          {/* Recent Activity (when claimed) — interleaved appointments +
              quotes, newest first. Tap a card to open a bottom-sheet with
              details and actions. */}
          {status === "claimed" && (
            <>
              <RecentActivitySection
                styles={trvStyles}
                c={c}
                appointments={appointments}
                quotes={quotes}
                clientName={clientName}
                workStartedAt={workStartedAt}
                hasConfirmedWorkAppt={hasConfirmedWorkAppt}
                onActivityPress={(activity) => {
                  // Quote cards always open directly (no bottom sheet):
                  //  · draft       → builder for continued editing
                  //  · sent / etc. → Quote Overview page
                  // Appointments still use the sheet for confirm /
                  // reschedule / cancel actions.
                  if (activity?.kind === "quote") {
                    const qs = String(activity?.data?.status || "").toLowerCase();
                    if (qs === "draft") {
                      router.push({
                        pathname: "/quotes/create",
                        params: {
                          requestId: String(id),
                          quoteId: String(activity.data.id),
                          title: encodeURIComponent(derivedTitleForCreate),
                          clientName: encodeURIComponent(clientName || ""),
                        },
                      });
                    } else {
                      router.push({
                        pathname: "/quotes/[id]",
                        params: { id: String(activity.data.id) },
                      });
                    }
                    return;
                  }
                  setActivitySheet(activity);
                }}
              />
            </>
          )}

          {/* Declined banner */}
          {status === "declined" && (
            <View style={[styles.statusBanner, styles.statusBannerDeclined]}>
              <View style={[styles.statusBannerIcon, styles.statusBannerIconDeclined]}>
                <Ionicons name="close-circle" size={24} color="#EF4444" />
              </View>
              <View style={styles.statusBannerContent}>
                <ThemedText style={styles.statusBannerTitle}>Request declined</ThemedText>
                <ThemedText style={styles.statusBannerSubtitle}>
                  You have declined this request
                </ThemedText>
              </View>
            </View>
          )}

          {/* OPEN state — Decline + Accept rendered inline as the last
              content of the scroll view. Equal-size buttons side-by-side,
              no background bar behind them. */}
          {status === "open" && (
            <View style={trvStyles.inlineOpenActions}>
              <Pressable
                onPress={onDecline}
                style={({ pressed }) => [
                  trvStyles.openBtnGhost,
                  { backgroundColor: c.elevate, borderColor: c.borderStrong },
                  pressed && { opacity: 0.75 },
                ]}
                accessibilityRole="button"
              >
                <ThemedText style={[trvStyles.openBtnGhostText, { color: c.text }]}>
                  {tgt?.outside_service_area ? "Too far" : "Decline"}
                </ThemedText>
              </Pressable>
              <Pressable
                onPress={onAccept}
                style={({ pressed }) => [
                  trvStyles.openBtnPrimary,
                  pressed && { opacity: 0.85 },
                ]}
                accessibilityRole="button"
              >
                <Ionicons name="checkmark" size={16} color="#FFFFFF" style={{ marginRight: 6 }} />
                <ThemedText style={trvStyles.openBtnPrimaryText}>
                  {tgt?.outside_service_area ? "Accept anyway" : "Accept"}
                </ThemedText>
              </Pressable>
            </View>
          )}

        </ScrollView>
      )}

      {/* Floating + action button — claimed state only. Purple, same
          bottom offset as the floating tab bar so it feels uniform, but
          the tab bar is hidden on this screen so the FAB owns the slot.
          Tap → bottom sheet offering "Create quote" or "Create
          appointment". The amber dot overlay signals a pending action:
          the quote is accepted + either no work appointment exists, or
          the scheduled date has arrived but Start Work hasn't fired.   */}
      {!loading && req && status === "claimed" && (
        <FABCreate
          insets={insets}
          c={c}
          onPress={() => setCreateSheetOpen(true)}
        />
      )}

      <RecentActivityBottomSheet
        insets={insets}
        c={c}
        activity={activitySheet}
        onClose={() => setActivitySheet(null)}
        canStartWork={canStartWork}
        workStartedAt={workStartedAt}
        canUndoStartWork={canUndoStartWork}
        onStartWork={async () => {
          if (!acceptedQuote?.id) return;
          // Soft guard: if the appointment is >7 days out, ask again.
          const appt = activitySheet?.kind === "appointment" ? activitySheet.data : null;
          const ms = appt?.scheduled_at
            ? new Date(appt.scheduled_at).getTime() - Date.now()
            : 0;
          const farOut = ms > 7 * 24 * 60 * 60 * 1000;
          const dateLabel = appt?.scheduled_at
            ? new Date(appt.scheduled_at).toLocaleDateString(undefined, {
                day: "numeric",
                month: "long",
              })
            : null;
          const doStart = async () => {
            try {
              const { error } = await supabase.rpc("rpc_trade_start_work", {
                p_quote_id: acceptedQuote.id,
              });
              if (error) throw error;
              setActivitySheet(null);
              load();
            } catch (e) {
              Alert.alert("Could not start work", e?.message || "Please try again.");
            }
          };
          const clientFirst = (clientName || "Client").split(" ")[0];
          if (farOut && dateLabel) {
            Alert.alert(
              "Start work early?",
              `This appointment isn't until ${dateLabel}. Start anyway? ${clientFirst} will be notified.`,
              [
                { text: "Cancel", style: "cancel" },
                { text: "Start anyway", style: "destructive", onPress: doStart },
              ]
            );
          } else {
            Alert.alert(
              "Start work",
              `Start this job now? ${clientFirst} will be notified that work has begun.`,
              [
                { text: "Cancel", style: "cancel" },
                { text: "Start work", onPress: doStart },
              ]
            );
          }
        }}
        onUndoStartWork={async () => {
          if (!acceptedQuote?.id) return;
          try {
            const { error } = await supabase.rpc("rpc_trade_undo_start_work", {
              p_quote_id: acceptedQuote.id,
            });
            if (error) throw error;
            setActivitySheet(null);
            load();
          } catch (e) {
            Alert.alert("Could not undo", e?.message || "Undo window has passed.");
          }
        }}
        onReschedule={(appt) => {
          setActivitySheet(null);
          router.push({
            pathname: "/quotes/schedule",
            params: {
              requestId: String(id || ""),
              appointmentId: String(appt.id),
              title: encodeURIComponent(derivedTitleForCreate),
              clientName: encodeURIComponent(clientName || ""),
              postcode: encodeURIComponent(req?.postcode || ""),
            },
          });
        }}
        onCancelAppt={async (appt) => {
          try {
            await supabase
              .from("appointments")
              .update({ status: "cancelled" })
              .eq("id", appt.id);
            setActivitySheet(null);
            load();
          } catch (e) {
            Alert.alert("Cancel failed", e?.message || "Could not cancel.");
          }
        }}
        onOpenQuote={(q) => {
          setActivitySheet(null);
          if ((q.status || "").toLowerCase() === "draft") {
            router.push({
              pathname: "/quotes/create",
              params: {
                requestId: String(id),
                quoteId: String(q.id),
                title: encodeURIComponent(derivedTitleForCreate),
                clientName: encodeURIComponent(clientName || ""),
              },
            });
          } else {
            router.push({ pathname: "/quotes/[id]", params: { id: String(q.id) } });
          }
        }}
      />

      <CreateActionSheet
        insets={insets}
        c={c}
        visible={createSheetOpen}
        onClose={() => setCreateSheetOpen(false)}
        onCreateQuote={() => {
          // Close the sheet first, then navigate on the next tick so
          // the modal dismissal animation doesn't race with the push
          // on iOS (which can silently drop the navigation when both
          // fire synchronously from a modal callback).
          setCreateSheetOpen(false);
          setTimeout(() => {
            router.push({
              pathname: "/quotes/create",
              params: {
                requestId: String(id),
                title: encodeURIComponent(derivedTitleForCreate),
                clientName: encodeURIComponent(clientName || ""),
              },
            });
          }, 0);
        }}
        onCreateAppointment={() => {
          setCreateSheetOpen(false);
          setTimeout(() => {
            router.push({
              pathname: "/quotes/schedule",
              params: {
                requestId: String(id || ""),
                title: encodeURIComponent(derivedTitleForCreate),
                clientName: encodeURIComponent(clientName || ""),
                postcode: encodeURIComponent(req?.postcode || ""),
              },
            });
          }, 0);
        }}
      />

      {/* Image preview modal – zoom + swipe + pull-down-to-dismiss */}
      {viewer.open && hasAttachments && (
        <Modal
          visible={viewer.open}
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
              initialScrollIndex={viewer.index}
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
              renderItem={({ item: url, index }) => (
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
                  onScrollEndDrag={(e) => handleZoomScrollEndDrag(e, index)}
                >
                  <Image
                    source={{ uri: url }}
                    style={styles.modalImage}
                    resizeMode="contain"
                    onError={(e) =>
                      console.warn(
                        "preview error:",
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

function makeStyles(c, dark) {
  return StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "stretch",
    backgroundColor: c.background,
  },
  // Header - Profile-style matching Quote Overview
  header: {
    backgroundColor: c.elevate,
    paddingHorizontal: 20,
    paddingBottom: 12,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: "700",
    color: c.text,
  },
  headerInfo: {
    marginTop: 8,
  },
  headerInfoText: {
    fontSize: 16,
    fontWeight: "600",
    color: c.textMid,
  },
  headerInfoSubtext: {
    fontSize: 14,
    color: c.textMid,
    marginTop: 2,
  },
  closeButton: {
    padding: 4,
  },
  chipsRow: {
    marginTop: 8,
    flexDirection: "row",
    gap: 8,
    justifyContent: "center",
    alignItems: "center",
    flexWrap: "wrap",
    paddingHorizontal: 16,
  },

  // Extended Match Banner
  extendedMatchBanner: {
    marginTop: 16,
    marginHorizontal: 16,
    backgroundColor: "#DBEAFE",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#93C5FD",
    padding: 14,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
  },
  extendedMatchIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#BFDBFE",
    alignItems: "center",
    justifyContent: "center",
  },
  extendedMatchContent: {
    flex: 1,
  },
  extendedMatchTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: "#1E40AF",
    marginBottom: 4,
  },
  extendedMatchDescription: {
    fontSize: 13,
    color: "#1D4ED8",
    lineHeight: 18,
  },

  // Outside Service Area Banner
  outsideServiceAreaBanner: {
    marginTop: 16,
    marginHorizontal: 16,
    backgroundColor: "#FEF3C7",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#FCD34D",
    padding: 14,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
  },
  outsideServiceAreaIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#FDE68A",
    alignItems: "center",
    justifyContent: "center",
  },
  outsideServiceAreaContent: {
    flex: 1,
  },
  outsideServiceAreaTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: "#92400E",
    marginBottom: 4,
  },
  outsideServiceAreaText: {
    fontSize: 13,
    color: "#A16207",
    lineHeight: 18,
  },

  card: {
    marginTop: 16,
    marginHorizontal: 16,
    backgroundColor: "#fff",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: c.border,
    padding: 16,
    // Subtle shadow for Notion/Airbnb style
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },

  // Section headers
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: c.textMid,
    flex: 1,
  },

  kvRow: { flexDirection: "row", gap: 10, marginVertical: 6 },
  kvKey: { width: 100, fontWeight: "600", color: c.textMid, fontSize: 14 },
  kvVal: { flex: 1, color: c.text, fontSize: 14 },

  // Request detail row with icons (matching Quote Overview style)
  requestDetailRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    marginVertical: 8,
  },
  requestDetailContent: {
    flex: 1,
  },
  requestDetailLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: c.textMid,
    marginBottom: 2,
  },
  requestDetailValue: {
    fontSize: 14,
    color: c.text,
    lineHeight: 20,
  },

  // Description section
  descriptionSection: {
    marginTop: 4,
  },
  descriptionLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: c.textMid,
    marginBottom: 6,
  },
  descriptionText: {
    fontSize: 14,
    lineHeight: 22,
    color: c.textMid,
  },
  descriptionEmpty: {
    color: c.textMuted,
    fontStyle: "italic",
  },

  // Photo gallery - horizontal scroll
  photoCountBadge: {
    backgroundColor: "#E5E7EB",
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  photoCountText: {
    fontSize: 12,
    fontWeight: "700",
    color: c.textMid,
  },
  photoScrollContent: {
    gap: 12,
    paddingRight: 4,
  },
  photoThumb: {
    width: 120,
    height: 120,
    borderRadius: 12,
    overflow: "hidden",
    backgroundColor: c.elevate2,
  },
  photoImg: {
    width: "100%",
    height: "100%",
  },
  noPhotosContainer: {
    alignItems: "center",
    paddingVertical: 24,
    gap: 8,
  },
  noPhotosText: {
    fontSize: 14,
    color: c.textMuted,
  },

  divider: {
    marginTop: 12,
    marginBottom: 4,
    height: StyleSheet.hairlineWidth,
    backgroundColor: "#E5E7EB",
  },

  // Action buttons - Airbnb/Notion style
  actionButtonsContainer: {
    marginTop: 24,
    marginHorizontal: 16,
    flexDirection: "row",
    gap: 12,
  },
  declineButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: c.border,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
  },
  declineButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: c.textMid,
  },
  acceptButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: Colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  acceptButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#fff",
  },

  // Status banners (after action taken)
  statusBanner: {
    marginTop: 24,
    marginHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#D1FAE5",
    borderRadius: 12,
    padding: 16,
    gap: 12,
  },
  statusBannerDeclined: {
    backgroundColor: "#FEE2E2",
  },
  statusBannerIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
  },
  statusBannerIconDeclined: {
    backgroundColor: "#fff",
  },
  statusBannerContent: {
    flex: 1,
  },
  statusBannerTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: c.text,
  },
  statusBannerSubtitle: {
    fontSize: 13,
    color: c.textMid,
    marginTop: 2,
  },

  // Section header row (Appointments, Quote, Service Details, Photos)
  sectionHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 24,
    marginHorizontal: 16,
  },
  sectionHeaderTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: c.text,
  },
  sectionHeaderBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    paddingVertical: 4,
    paddingHorizontal: 4,
  },
  sectionHeaderBtnText: {
    fontSize: 15,
    fontWeight: "600",
    color: Colors.primary,
  },

  // Empty state text
  emptyStateText: {
    fontSize: 14,
    color: c.textMuted,
    textAlign: "center",
    paddingVertical: 16,
  },

  // Quote summary row
  quoteSummaryRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 4,
  },
  quoteSummaryIcon: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: c.elevate2,
    alignItems: "center",
    justifyContent: "center",
  },
  quoteSummaryTitle: {
    fontSize: 15,
    fontWeight: "600",
    color: c.text,
  },
  quoteSummaryStatus: {
    fontSize: 13,
    color: c.textMid,
    marginTop: 2,
  },
  quoteSummaryTotal: {
    fontSize: 15,
    fontWeight: "700",
    color: c.text,
    marginRight: 4,
  },
  quoteDivider: {
    height: 1,
    backgroundColor: "#E5E7EB",
    marginBottom: 16,
  },

  // Draft quote preview card
  draftQuoteHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  draftQuoteHeaderLeft: {
    flex: 1,
    gap: 6,
  },
  draftQuoteBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#FEF3C7",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    alignSelf: "flex-start",
  },
  draftQuoteBadgeText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#F59E0B",
  },
  draftQuoteTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: c.text,
  },
  draftQuoteItems: {
    backgroundColor: c.elevate,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.08)",
    padding: 12,
    gap: 8,
    marginBottom: 12,
  },
  draftQuoteItemRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  draftQuoteItemName: {
    flex: 1,
    fontSize: 14,
    color: c.textMid,
    marginRight: 12,
  },
  draftQuoteItemPrice: {
    fontSize: 14,
    fontWeight: "500",
    color: c.text,
  },
  draftQuoteMoreItems: {
    fontSize: 13,
    color: c.textMid,
    fontStyle: "italic",
    marginTop: 4,
  },
  draftQuoteTotalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
  },
  draftQuoteTotalLabel: {
    fontSize: 15,
    fontWeight: "600",
    color: c.textMid,
  },
  draftQuoteTotalValue: {
    fontSize: 18,
    fontWeight: "700",
    color: c.text,
  },

  // Draft quote actions
  quoteDraftActions: {
    marginTop: 12,
  },
  quoteDraftEditBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: Colors.primary,
    paddingVertical: 12,
    borderRadius: 10,
  },
  quoteDraftEditText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#FFF",
  },

  // Appointments list styles
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
  appointmentListDivider: {
    height: 1,
    backgroundColor: "#E5E7EB",
    marginVertical: 12,
  },

  // modal
  modalBackdrop: {
    flex: 1,
    backgroundColor: "#000",
    alignItems: "center",
    justifyContent: "center",
  },
  modalClose: { position: "absolute", top: 48, right: 24, padding: 8 },

  // horizontal pager
  carousel: {
    flex: 1,
    width: "100%",
  },

  // zoom container per image
  zoomScroll: {
    flex: 1,
    width: SCREEN_WIDTH,
  },
  zoomContent: {
    flexGrow: 1,
    justifyContent: "center",
    alignItems: "center",
  },

  modalImage: {
    width: "90%",
    height: "70%",
    resizeMode: "contain",
  },
  });
}
