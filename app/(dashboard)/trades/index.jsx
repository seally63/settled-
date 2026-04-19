// app/(dashboard)/trades/index.jsx - Trade Command Center Home Dashboard
import { useEffect, useState, useCallback, useMemo } from "react";
import {
  StyleSheet,
  View,
  ScrollView,
  Pressable,
  RefreshControl,
  Modal,
  Dimensions,
  Linking,
  Platform,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { useRouter } from "expo-router";
import { useFocusEffect } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import ThemedView from "../../../components/ThemedView";
import ThemedText from "../../../components/ThemedText";
import Spacer from "../../../components/Spacer";
import { HomePageSkeleton } from "../../../components/Skeleton";
import { Colors } from "../../../constants/Colors";
import { FontFamily, TypeVariants, Radius } from "../../../constants/Typography";
import { useUser } from "../../../hooks/useUser";
import { useTheme } from "../../../hooks/useTheme";
import { supabase } from "../../../lib/supabase";
import { getTradeReviews } from "../../../lib/api/trust";

const TINT = Colors.primary;
const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");

// Status colors — remapped to the redesign's status palette.
const STATUS_COLORS = {
  issue:     Colors.status.declined,  // red
  direct:    Colors.primary,          // purple
  action:    Colors.status.pending,   // amber
  scheduled: Colors.status.accepted,  // green
  new:       Colors.status.scheduled, // blue
  waiting:   "#6B7280",               // gray (neutral)
};

// Local hook that memoizes a theme-aware styles object.
function useStyles() {
  const { colors: c, dark } = useTheme();
  const styles = useMemo(() => makeStyles(c, dark), [c, dark]);
  return { styles, colors: c, dark };
}

// Appointment type icons
const APPOINTMENT_ICONS = {
  work: { icon: "hammer", label: "Work visit" },
  survey: { icon: "search", label: "Survey visit" },
  design: { icon: "color-palette", label: "Design consultation" },
  followup: { icon: "refresh", label: "Follow-up" },
  final: { icon: "checkmark-circle", label: "Final inspection" },
};

// Format currency
function formatCurrency(amount) {
  if (amount == null || isNaN(amount)) return "£0";
  return `£${Number(amount).toLocaleString("en-GB", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })}`;
}

// Get privacy-aware client display name
function getClientDisplayName(fullName, contactUnlocked) {
  if (!fullName) return null;
  if (contactUnlocked) return fullName;
  const parts = String(fullName).trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return null;
  if (parts.length === 1) return parts[0];
  return `${parts[0]} ${parts[parts.length - 1].charAt(0)}.`;
}

// Helper functions
function daysSince(date) {
  if (!date) return 0;
  const diff = new Date() - new Date(date);
  return Math.floor(diff / (1000 * 60 * 60 * 24));
}

function daysUntil(date) {
  if (!date) return 0;
  const diff = new Date(date) - new Date();
  return Math.floor(diff / (1000 * 60 * 60 * 24));
}

function formatDate(date) {
  if (!date) return "";
  const d = new Date(date);
  return d.toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

function formatDateFull(date) {
  if (!date) return "";
  const d = new Date(date);
  return d.toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

function formatTime(date) {
  if (!date) return "";
  const d = new Date(date);
  return d.toLocaleTimeString("en-GB", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).toLowerCase();
}

function formatDateShort(date) {
  if (!date) return "";
  const d = new Date(date);
  return d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
  });
}

// Get month name
function getMonthName(date) {
  return date.toLocaleDateString("en-GB", { month: "long", year: "numeric" });
}

// Get days in month
function getDaysInMonth(year, month) {
  return new Date(year, month + 1, 0).getDate();
}

// Get first day of month (0 = Sunday, 1 = Monday, etc.)
function getFirstDayOfMonth(year, month) {
  return new Date(year, month, 1).getDay();
}

// Open maps for directions
function openDirections(postcode) {
  if (!postcode) return;
  const query = encodeURIComponent(postcode);
  const url = Platform.select({
    ios: `maps:?daddr=${query}`,
    android: `google.navigation:q=${query}`,
    default: `https://www.google.com/maps/dir/?api=1&destination=${query}`,
  });
  Linking.openURL(url);
}

// ============================================
// HEADER (greeting + date)
// ============================================
function Header({ firstName, isNewTrade }) {
  const { styles } = useStyles();
  const getGreeting = () => {
    const hour = new Date().getHours();
    if (isNewTrade) return "Welcome";
    if (hour < 12) return "Good morning";
    if (hour < 18) return "Good afternoon";
    return "Good evening";
  };

  const today = new Date();
  const dateStr = today.toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

  return (
    <View style={styles.headerSection}>
      <ThemedText style={styles.headerGreeting}>
        {getGreeting()}{firstName ? `, ${firstName}` : ""}
      </ThemedText>
      <ThemedText style={styles.headerDate}>{dateStr}</ThemedText>
    </View>
  );
}

// ============================================
// GLANCE STRIP — single ambient line of key counts
// ============================================
function GlanceStrip({ todayCount, attentionCount, sentCount }) {
  const { styles } = useStyles();
  const parts = [];
  parts.push(`${todayCount} ${todayCount === 1 ? "appointment" : "appointments"} today`);
  if (attentionCount > 0) parts.push(`${attentionCount} ${attentionCount === 1 ? "item needs" : "items need"} attention`);
  if (sentCount > 0) parts.push(`${sentCount} ${sentCount === 1 ? "quote" : "quotes"} awaiting`);

  return (
    <View style={styles.glanceStrip}>
      <ThemedText style={styles.glanceText}>{parts.join("  ·  ")}</ThemedText>
    </View>
  );
}

// ============================================
// PROFILE FOOTER — slim banner showing completion %
// Hidden when profile is 100% complete.
// ============================================
function ProfileFooter({ profile, onPress }) {
  const calculateCompletion = () => {
    if (!profile) return { percentage: 0, missing: [] };

    const checks = [
      { field: 'full_name', label: 'name', weight: 10 },
      { field: 'business_name', label: 'business name', weight: 10 },
      { field: 'photo_url', label: 'profile photo', weight: 15 },
      { field: 'bio', label: 'bio', weight: 10 },
      { field: 'job_titles', label: 'job titles', weight: 10, check: (v) => v && v.length > 0 },
      { field: 'base_postcode', label: 'location', weight: 10 },
      { field: 'service_radius_km', label: 'service area', weight: 5 },
    ];

    const verification = profile.verification || {};
    const verificationChecks = [
      { status: verification.photo_id, label: 'photo ID', weight: 10 },
      { status: verification.insurance, label: 'insurance', weight: 10 },
      { status: verification.credentials, label: 'credentials', weight: 10 },
    ];

    let total = 0;
    const missing = [];
    checks.forEach(({ field, label, weight, check }) => {
      const value = profile[field];
      const isComplete = check ? check(value) : !!value;
      if (isComplete) total += weight;
      else missing.push(label);
    });
    verificationChecks.forEach(({ status, label, weight }) => {
      if (status === 'verified') total += weight;
      else missing.push(label);
    });

    return { percentage: total, missing };
  };

  const { percentage, missing } = calculateCompletion();
  if (percentage >= 100) return null;
  const nextItem = missing[0];

  return (
    <ProfileFooterBody
      percentage={percentage}
      nextItem={nextItem}
      onPress={onPress}
    />
  );
}

// Rendered body split out so it can use hooks alongside ProfileFooter's logic.
function ProfileFooterBody({ percentage, nextItem, onPress }) {
  const { styles, colors: c } = useStyles();
  return (
    <Pressable style={styles.profileFooter} onPress={onPress}>
      <View style={{ flex: 1 }}>
        <ThemedText style={styles.profileFooterTitle}>
          Profile is {percentage}% complete
        </ThemedText>
        {nextItem && (
          <ThemedText style={styles.profileFooterSubtitle}>
            Next: add your {nextItem}
          </ThemedText>
        )}
      </View>
      <Ionicons name="chevron-forward" size={18} color={c.textMuted} />
    </Pressable>
  );
}

// ============================================
// PERFORMANCE INFO MODAL
// ============================================
function PerformanceInfoModal({ visible, onClose }) {
  const insets = useSafeAreaInsets();
  const { styles, colors: c } = useStyles();

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
      onRequestClose={onClose}
    >
      <View style={styles.infoModalOverlay}>
        <View style={[styles.infoModalSheet, { paddingBottom: insets.bottom + 20 }]}>
          <View style={styles.infoModalHandle} />

          <View style={styles.infoModalHeader}>
            <ThemedText style={styles.infoModalTitle}>Performance Metrics</ThemedText>
            <Pressable onPress={onClose} hitSlop={10} style={styles.infoModalCloseBtn}>
              <Ionicons name="close" size={20} color={c.text} />
            </Pressable>
          </View>

          <ScrollView style={styles.infoModalContent} showsVerticalScrollIndicator={false}>
          <View style={styles.infoSection}>
            <View style={styles.infoSectionHeader}>
              <Ionicons name="flash" size={20} color={TINT} />
              <ThemedText style={styles.infoSectionTitle}>Response Time</ThemedText>
            </View>
            <ThemedText style={styles.infoSectionText}>
              This measures how quickly you respond to new requests and messages from clients.
            </ThemedText>
            <View style={styles.infoTipBox}>
              <ThemedText style={styles.infoTipTitle}>Why it matters</ThemedText>
              <ThemedText style={styles.infoTipText}>
                Clients on Settled chose you specifically — a fast reply shows you take their job seriously. Aim to respond within 4 hours during business hours.
              </ThemedText>
            </View>
          </View>

          <View style={styles.infoSection}>
            <View style={styles.infoSectionHeader}>
              <Ionicons name="checkmark" size={20} color={TINT} />
              <ThemedText style={styles.infoSectionTitle}>Follow-through Rate</ThemedText>
            </View>
            <ThemedText style={styles.infoSectionText}>
              The percentage of accepted requests that you actually quoted. You have 3 days after accepting before it affects your rate.
            </ThemedText>
            <View style={styles.infoTipBox}>
              <ThemedText style={styles.infoTipTitle}>How it's calculated</ThemedText>
              <ThemedText style={styles.infoTipText}>
                If you accept 10 requests and send quotes for 8 of them, your follow-through rate is 80%. Newly accepted requests won't affect your rate for 3 days, giving you time to schedule a survey or send a quote.
              </ThemedText>
            </View>
          </View>

          <View style={styles.infoSection}>
            <View style={styles.infoSectionHeader}>
              <Ionicons name="star" size={20} color={Colors.status.pending} />
              <ThemedText style={styles.infoSectionTitle}>Rating</ThemedText>
            </View>
            <ThemedText style={styles.infoSectionText}>
              Your average rating from completed jobs, as rated by your clients.
            </ThemedText>
            <View style={styles.infoTipBox}>
              <ThemedText style={styles.infoTipTitle}>Building trust</ThemedText>
              <ThemedText style={styles.infoTipText}>
                Ratings are one of the first things clients look at when choosing a tradesperson. Great communication, quality work, and punctuality all contribute to 5-star reviews.
              </ThemedText>
            </View>
          </View>

          <Spacer height={20} />
        </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

// ============================================
// HEALTH ROW — compact strip of three metrics with info button
// ============================================
function HealthRow({ stats, onInfoPress }) {
  const { styles, colors: c } = useStyles();
  const formatResponseTime = (hours) => {
    if (hours === null || hours === undefined) return "—";
    if (hours < 1) return `${Math.round(hours * 60)}m`;
    if (hours < 24) return `${hours.toFixed(1)}h`;
    return `${Math.round(hours / 24)}d`;
  };

  return (
    <View style={styles.section}>
      <View style={styles.sectionHeaderRow}>
        <ThemedText style={styles.sectionLabel}>YOUR HEALTH</ThemedText>
        <Pressable onPress={onInfoPress} hitSlop={10} style={styles.infoButton}>
          <Ionicons name="information-circle-outline" size={16} color={c.textMuted} />
        </Pressable>
      </View>

      <View style={styles.healthRow}>
        <View style={styles.healthItem}>
          <ThemedText style={styles.healthValue}>{formatResponseTime(stats.responseTimeHours)}</ThemedText>
          <ThemedText style={styles.healthLabel}>Response</ThemedText>
        </View>
        <View style={styles.healthDivider} />
        <View style={styles.healthItem}>
          <ThemedText style={styles.healthValue}>
            {stats.quoteRate !== null ? `${stats.quoteRate}%` : "—"}
          </ThemedText>
          <ThemedText style={styles.healthLabel}>Follow-through</ThemedText>
        </View>
        <View style={styles.healthDivider} />
        <View style={styles.healthItem}>
          <View style={styles.healthValueRow}>
            <ThemedText style={styles.healthValue}>
              {stats.averageRating > 0 ? stats.averageRating.toFixed(1) : "—"}
            </ThemedText>
            {stats.averageRating > 0 && (
              <Ionicons name="star" size={12} color={Colors.status.pending} />
            )}
          </View>
          <ThemedText style={styles.healthLabel}>Rating</ThemedText>
        </View>
      </View>
    </View>
  );
}

// ============================================
// TODAY SECTION — clean rows with Today + Tomorrow groups
// ============================================
function TodaySection({ todayAppointments, tomorrowAppointments, onSeeAll, onItemPress, onMessage, conversationsByRequest }) {
  const { styles, colors: c } = useStyles();
  const getAppointmentIcon = (type) => APPOINTMENT_ICONS[type] || APPOINTMENT_ICONS.work;

  const AppointmentRow = ({ appointment, showActions = true }) => {
    const iconConfig = getAppointmentIcon(appointment.type);
    const conversationId = conversationsByRequest[appointment.request_id];

    return (
      <Pressable
        style={styles.apptRow}
        onPress={() => onItemPress(appointment)}
      >
        <View style={styles.apptTimeColumn}>
          <ThemedText style={styles.apptTime}>{formatTime(appointment.scheduled_at)}</ThemedText>
        </View>
        <View style={styles.apptBody}>
          <View style={styles.apptTopLine}>
            <Ionicons name={iconConfig.icon} size={13} color={c.textMuted} />
            <ThemedText style={styles.apptType}>{iconConfig.label}</ThemedText>
            {appointment.clientName ? (
              <>
                <ThemedText style={styles.apptDot}>·</ThemedText>
                <ThemedText style={styles.apptClient} numberOfLines={1}>
                  {appointment.clientName}
                </ThemedText>
              </>
            ) : null}
          </View>
          {(appointment.serviceType || appointment.title) && (
            <ThemedText style={styles.apptTitle} numberOfLines={1}>
              {appointment.serviceType || appointment.title}
            </ThemedText>
          )}
          {appointment.location && (
            <ThemedText style={styles.apptLocation} numberOfLines={1}>
              {appointment.location}
            </ThemedText>
          )}
          {showActions && (
            <View style={styles.apptActions}>
              <Pressable
                style={styles.apptChip}
                onPress={(e) => {
                  e.stopPropagation();
                  openDirections(appointment.location);
                }}
              >
                <Ionicons name="navigate-outline" size={12} color={c.text} />
                <ThemedText style={styles.apptChipText}>Directions</ThemedText>
              </Pressable>
              {conversationId && (
                <Pressable
                  style={styles.apptChip}
                  onPress={(e) => {
                    e.stopPropagation();
                    onMessage(conversationId);
                  }}
                >
                  <Ionicons name="chatbubble-outline" size={12} color={c.text} />
                  <ThemedText style={styles.apptChipText}>Message</ThemedText>
                </Pressable>
              )}
            </View>
          )}
        </View>
      </Pressable>
    );
  };

  return (
    <View style={styles.section}>
      <View style={styles.sectionHeaderRow}>
        <ThemedText style={styles.sectionLabel}>TODAY</ThemedText>
        <Pressable onPress={onSeeAll} style={styles.linkButton} hitSlop={8}>
          <ThemedText style={styles.linkText}>View calendar</ThemedText>
          <Ionicons name="chevron-forward" size={14} color={c.text} />
        </Pressable>
      </View>

      {todayAppointments.length === 0 ? (
        <ThemedText style={styles.inlineEmpty}>No appointments today</ThemedText>
      ) : (
        <View style={styles.apptList}>
          {todayAppointments.slice(0, 3).map((appt) => (
            <AppointmentRow key={appt.id} appointment={appt} showActions={true} />
          ))}
        </View>
      )}

      {tomorrowAppointments.length > 0 && (
        <View style={styles.tomorrowGroup}>
          <ThemedText style={styles.subLabel}>TOMORROW</ThemedText>
          <View style={styles.apptList}>
            {tomorrowAppointments.slice(0, 2).map((appt) => (
              <AppointmentRow key={appt.id} appointment={appt} showActions={false} />
            ))}
          </View>
        </View>
      )}
    </View>
  );
}

// ============================================
// PIPELINE LIST — clickable rows for each pipeline metric
// ============================================
function PipelineList({ activeJobs, sentQuotes, scheduled, completedThisMonth, onActivePress, onSentPress, onScheduledPress, onCompletedPress }) {
  const { styles, colors: c } = useStyles();
  const rows = [
    { key: "active", label: "Active jobs", value: activeJobs, onPress: onActivePress },
    { key: "sent", label: "Quotes awaiting", value: sentQuotes, onPress: onSentPress },
    { key: "scheduled", label: "Scheduled", value: scheduled, onPress: onScheduledPress },
    { key: "completed", label: "Completed (this month)", value: completedThisMonth, onPress: onCompletedPress },
  ];

  return (
    <View style={styles.section}>
      <ThemedText style={styles.sectionLabel}>PIPELINE</ThemedText>
      <View style={styles.pipelineList}>
        {rows.map((row, idx) => (
          <Pressable
            key={row.key}
            style={[
              styles.pipelineRow,
              idx < rows.length - 1 && styles.pipelineRowDivider,
            ]}
            onPress={row.onPress}
          >
            <ThemedText style={styles.pipelineLabel}>{row.label}</ThemedText>
            <View style={styles.pipelineValueRow}>
              <ThemedText style={styles.pipelineValue}>{row.value}</ThemedText>
              <Ionicons name="chevron-forward" size={16} color={c.textMuted} />
            </View>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

// ============================================
// MONTH SUMMARY — earnings + active value
// ============================================
function MonthSummary({ earned, activeValue }) {
  const { styles } = useStyles();
  if (!earned && !activeValue) return null;

  return (
    <View style={styles.section}>
      <ThemedText style={styles.sectionLabel}>THIS MONTH</ThemedText>
      <View style={styles.monthList}>
        <View style={[styles.monthRow, styles.monthRowDivider]}>
          <ThemedText style={styles.monthLabel}>Earnings</ThemedText>
          <ThemedText style={styles.monthValue}>{formatCurrency(earned)}</ThemedText>
        </View>
        <View style={styles.monthRow}>
          <ThemedText style={styles.monthLabel}>Active job value</ThemedText>
          <ThemedText style={styles.monthValue}>{formatCurrency(activeValue)}</ThemedText>
        </View>
      </View>
    </View>
  );
}

// ============================================
// ACTION ITEMS SECTION (Needs Attention)
// ============================================
function ActionItemsSection({ items, onItemPress, onSeeAll }) {
  const { styles, colors: c } = useStyles();
  const getItemConfig = (type) => {
    switch (type) {
      case "issue":
        return { color: STATUS_COLORS.issue, label: "Issue reported" };
      case "direct_request":
        return { color: STATUS_COLORS.new, label: "New request" };
      case "send_quote":
        return { color: STATUS_COLORS.action, label: "Send quote" };
      case "no_response":
        return { color: STATUS_COLORS.action, label: "Awaiting reply" };
      case "schedule_work":
        return { color: STATUS_COLORS.scheduled, label: "Schedule work" };
      default:
        return { color: STATUS_COLORS.waiting, label: "Action needed" };
    }
  };

  if (items.length === 0) {
    return (
      <View style={styles.section}>
        <View style={styles.sectionHeaderRow}>
          <ThemedText style={styles.sectionLabel}>NEEDS YOUR ATTENTION</ThemedText>
        </View>
        <ThemedText style={styles.inlineEmpty}>
          You're all caught up.
        </ThemedText>
      </View>
    );
  }

  return (
    <View style={styles.section}>
      <View style={styles.sectionHeaderRow}>
        <ThemedText style={styles.sectionLabel}>
          NEEDS YOUR ATTENTION  ·  {items.length}
        </ThemedText>
        <Pressable onPress={onSeeAll} style={styles.linkButton} hitSlop={8}>
          <ThemedText style={styles.linkText}>See all</ThemedText>
          <Ionicons name="chevron-forward" size={14} color={c.text} />
        </Pressable>
      </View>

      <View style={styles.attentionList}>
        {items.slice(0, 3).map((item, index) => {
          const config = getItemConfig(item.type);
          return (
            <Pressable
              key={`${item.type}-${item.requestId}-${index}`}
              style={styles.attentionCard}
              onPress={() => onItemPress(item)}
            >
              <View style={[styles.attentionDot, { backgroundColor: config.color }]} />
              <View style={styles.attentionBody}>
                <View style={styles.attentionLabelRow}>
                  <ThemedText style={styles.attentionLabel}>{config.label}</ThemedText>
                  {item.extendedMatch && (
                    <View style={styles.metaPill}>
                      <Ionicons name="car-outline" size={10} color={Colors.status.scheduled} />
                      <ThemedText style={[styles.metaPillText, { color: Colors.status.scheduled }]}>
                        Extended travel
                      </ThemedText>
                    </View>
                  )}
                  {item.outsideServiceArea && (
                    <View style={styles.metaPill}>
                      <Ionicons name="location-outline" size={10} color={Colors.status.pending} />
                      <ThemedText style={[styles.metaPillText, { color: Colors.status.pending }]}>
                        {item.distanceMiles ? `${item.distanceMiles} mi away` : "Outside area"}
                      </ThemedText>
                    </View>
                  )}
                </View>
                <ThemedText style={styles.attentionTitle} numberOfLines={1}>
                  {item.title}
                </ThemedText>
                <ThemedText style={styles.attentionMeta} numberOfLines={1}>
                  {item.clientName}{item.subtitle ? `  ·  ${item.subtitle}` : ""}
                </ThemedText>
              </View>
              <Ionicons name="chevron-forward" size={16} color={c.textMuted} />
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

// ============================================
// EMPTY STATE FOR NEW TRADES
// ============================================
function NewTradeActionItems() {
  const { styles } = useStyles();
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeaderRow}>
        <ThemedText style={styles.sectionLabel}>NEEDS YOUR ATTENTION</ThemedText>
      </View>

      <View style={styles.emptyStateCard}>
        <ThemedText style={styles.emptyStateText}>
          New requests will appear here when clients find your profile.
        </ThemedText>
      </View>
    </View>
  );
}

// ============================================
// CALENDAR MODAL
// ============================================
function CalendarModal({ visible, onClose, appointments, onItemPress }) {
  const insets = useSafeAreaInsets();
  const [currentDate, setCurrentDate] = useState(new Date());
  const { styles, colors: c } = useStyles();

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  const daysInMonth = getDaysInMonth(year, month);
  const firstDay = getFirstDayOfMonth(year, month);

  // Adjust for Monday start (0 = Monday, 6 = Sunday)
  const adjustedFirstDay = firstDay === 0 ? 6 : firstDay - 1;

  const now = new Date();

  // Get appointments for current month (including past)
  const monthAppointments = useMemo(() => {
    const monthStart = new Date(year, month, 1);
    const monthEnd = new Date(year, month + 1, 0, 23, 59, 59);

    return appointments
      .filter((appt) => {
        const apptDate = new Date(appt.scheduled_at);
        return apptDate >= monthStart && apptDate <= monthEnd;
      })
      .map((appt) => ({
        ...appt,
        isPast: new Date(appt.scheduled_at) < now,
      }));
  }, [appointments, year, month, now]);

  // Group appointments by day
  const appointmentsByDay = useMemo(() => {
    const byDay = {};
    monthAppointments.forEach((appt) => {
      const day = new Date(appt.scheduled_at).getDate();
      if (!byDay[day]) byDay[day] = [];
      byDay[day].push(appt);
    });
    return byDay;
  }, [monthAppointments]);

  const goToPrevMonth = () => {
    setCurrentDate(new Date(year, month - 1, 1));
  };

  const goToNextMonth = () => {
    setCurrentDate(new Date(year, month + 1, 1));
  };

  const today = new Date();
  const isCurrentMonth = today.getFullYear() === year && today.getMonth() === month;
  const todayDate = today.getDate();

  // Build calendar grid
  const calendarDays = [];
  for (let i = 0; i < adjustedFirstDay; i++) {
    calendarDays.push({ day: null, key: `empty-${i}` });
  }
  for (let day = 1; day <= daysInMonth; day++) {
    calendarDays.push({ day, key: `day-${day}`, appointments: appointmentsByDay[day] || [] });
  }

  const weekDays = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={styles.calendarModal}>
        {/* Header */}
        <View style={styles.calendarHeader}>
          <Pressable onPress={onClose} hitSlop={10}>
            <Ionicons name="close" size={24} color={c.text} />
          </Pressable>
          <ThemedText style={styles.calendarHeaderTitle}>Calendar</ThemedText>
          <View style={{ width: 24 }} />
        </View>

        {/* Month Navigation */}
        <View style={styles.calendarMonthNav}>
          <Pressable onPress={goToPrevMonth} hitSlop={10} style={styles.calendarNavBtn}>
            <Ionicons name="chevron-back" size={24} color={c.text} />
          </Pressable>
          <ThemedText style={styles.calendarMonthTitle}>{getMonthName(currentDate)}</ThemedText>
          <Pressable onPress={goToNextMonth} hitSlop={10} style={styles.calendarNavBtn}>
            <Ionicons name="chevron-forward" size={24} color={c.text} />
          </Pressable>
        </View>

        {/* Week Days Header */}
        <View style={styles.calendarWeekDays}>
          {weekDays.map((day) => (
            <View key={day} style={styles.calendarWeekDay}>
              <ThemedText style={styles.calendarWeekDayText}>{day}</ThemedText>
            </View>
          ))}
        </View>

        {/* Calendar Grid */}
        <ScrollView style={styles.calendarContent} showsVerticalScrollIndicator={false}>
          <View style={styles.calendarGrid}>
            {calendarDays.map((item) => {
              const isToday = isCurrentMonth && item.day === todayDate;
              const hasAppointments = item.appointments && item.appointments.length > 0;

              return (
                <View key={item.key} style={styles.calendarDayCell}>
                  {item.day && (
                    <>
                      <View style={[
                        styles.calendarDayNumber,
                        isToday && styles.calendarDayNumberToday
                      ]}>
                        <ThemedText style={[
                          styles.calendarDayText,
                          isToday && styles.calendarDayTextToday
                        ]}>
                          {item.day}
                        </ThemedText>
                      </View>
                      {hasAppointments && (
                        <View style={styles.calendarDayIndicators}>
                          {item.appointments.slice(0, 3).map((appt, idx) => (
                            <View
                              key={appt.id || idx}
                              style={[
                                styles.calendarDayDot,
                                { backgroundColor: appt.type === "survey" ? TINT : Colors.status.accepted }
                              ]}
                            />
                          ))}
                          {item.appointments.length > 3 && (
                            <ThemedText style={styles.calendarDayMore}>+{item.appointments.length - 3}</ThemedText>
                          )}
                        </View>
                      )}
                    </>
                  )}
                </View>
              );
            })}
          </View>

          {/* Appointments for current month */}
          <View style={styles.calendarAppointmentsList}>
            <ThemedText style={styles.calendarAppointmentsTitle}>
              {monthAppointments.length > 0
                ? `${monthAppointments.length} appointment${monthAppointments.length !== 1 ? "s" : ""} this month`
                : "No appointments this month"
              }
            </ThemedText>

            {monthAppointments
              .sort((a, b) => new Date(a.scheduled_at) - new Date(b.scheduled_at))
              .map((appt) => (
                <Pressable
                  key={appt.id}
                  style={[
                    styles.calendarAppointmentItem,
                    appt.isPast && styles.calendarAppointmentItemPast
                  ]}
                  onPress={() => {
                    onClose();
                    onItemPress(appt);
                  }}
                >
                  <View style={[
                    styles.calendarAppointmentDot,
                    { backgroundColor: appt.isPast ? c.textMuted : (appt.type === "survey" ? TINT : Colors.status.accepted) }
                  ]} />
                  <View style={styles.calendarAppointmentContent}>
                    <View style={styles.calendarAppointmentDateRow}>
                      <ThemedText style={[
                        styles.calendarAppointmentDate,
                        appt.isPast && styles.calendarAppointmentDatePast
                      ]}>
                        {formatDate(appt.scheduled_at)} · {formatTime(appt.scheduled_at)}
                      </ThemedText>
                      {appt.isPast && (
                        <View style={styles.pastBadge}>
                          <ThemedText style={styles.pastBadgeText}>Past</ThemedText>
                        </View>
                      )}
                    </View>
                    <ThemedText style={[
                      styles.calendarAppointmentTitle,
                      appt.isPast && styles.calendarAppointmentTitlePast
                    ]} numberOfLines={1}>
                      {appt.type === "survey" ? "Survey" : "Work"} - {appt.title}
                    </ThemedText>
                    <ThemedText style={styles.calendarAppointmentClient} numberOfLines={1}>
                      {appt.clientName} {appt.location ? `· ${appt.location}` : ""}
                    </ThemedText>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={c.textMuted} />
                </Pressable>
              ))}
          </View>

          <Spacer height={40} />
        </ScrollView>
      </View>
    </Modal>
  );
}

// ============================================
// MAIN COMPONENT
// ============================================
export default function TradesmanHome() {
  const router = useRouter();
  const { user } = useUser();
  const insets = useSafeAreaInsets();
  const { colors: c, dark } = useTheme();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [calendarVisible, setCalendarVisible] = useState(false);
  const [performanceInfoVisible, setPerformanceInfoVisible] = useState(false);

  // Data states
  const [profile, setProfile] = useState(null);
  const [inboxRows, setInboxRows] = useState([]);
  const [sentRows, setSentRows] = useState([]);
  const [todayAppointments, setTodayAppointments] = useState([]);
  const [tomorrowAppointments, setTomorrowAppointments] = useState([]);
  const [allAppointments, setAllAppointments] = useState([]);
  const [conversationsByRequest, setConversationsByRequest] = useState({});
  const [reviews, setReviews] = useState([]);
  const [monthlyStats, setMonthlyStats] = useState({
    completedJobs: 0,
    activeJobs: 0,
    activeValue: 0,
    completedThisMonth: 0,
    earnedThisMonth: 0,
  });
  const [performanceStats, setPerformanceStats] = useState({
    responseTimeHours: null,
    quoteRate: null,
    averageRating: 0,
  });

  const load = useCallback(async () => {
    if (!user?.id) return;

    try {
      const myId = user.id;

      // Fetch profile
      const { data: profileData } = await supabase
        .from("profiles")
        .select("full_name, business_name, photo_url, bio, job_titles, base_postcode, service_radius_km, verification")
        .eq("id", myId)
        .single();
      setProfile(profileData);

      // Fetch reviews for rating
      const reviewsData = await getTradeReviews(myId, { limit: 50 });
      setReviews(reviewsData || []);

      // Fetch request targets (inbox)
      const { data: targets, error: tErr } = await supabase
        .from("request_targets")
        .select("request_id, state, invited_by, created_at, trade_id, outside_service_area, distance_miles, extended_match, first_action_at")
        .eq("trade_id", myId)
        .order("created_at", { ascending: false });
      if (tErr) throw tErr;

      // Fetch quotes
      const { data: quotes, error: qErr } = await supabase
        .from("tradify_native_app_db")
        .select(
          "id, request_id, client_id, status, issued_at, created_at, details, currency, grand_total, tax_total, valid_until"
        )
        .eq("trade_id", myId)
        .order("issued_at", { ascending: false, nullsFirst: false });
      if (qErr) throw qErr;

      const quotedReqIds = new Set((quotes || []).map((q) => q.request_id));

      const reqIds = Array.from(
        new Set([
          ...(targets || []).map((t) => t.request_id),
          ...(quotes || []).map((q) => q.request_id),
        ])
      );

      // Fetch request docs (joins service_types so we can show "Lighting problem"
      // instead of just "Project" on action item cards)
      let reqById = {};
      if (reqIds.length) {
        const { data: reqs } = await supabase
          .from("quote_requests")
          .select(
            `id, details, created_at, status, postcode, budget_band,
             suggested_title, requester_id, service_type_id,
             service_types ( id, name )`
          )
          .in("id", reqIds);
        (reqs || []).forEach((r) => {
          const st = Array.isArray(r.service_types) ? r.service_types[0] : r.service_types;
          reqById[r.id] = { ...r, service_type_name: st?.name || null };
        });
      }

      // Fetch client names and conversation IDs via conversations
      let clientNameByRequestId = {};
      let convByRequestId = {};
      const { data: convData } = await supabase.rpc("rpc_list_conversations", {
        p_limit: 100,
      });
      if (convData) {
        convData.forEach((conv) => {
          if (conv.request_id) {
            if (conv.other_party_name) {
              clientNameByRequestId[conv.request_id] = conv.other_party_name;
            }
            convByRequestId[conv.request_id] = conv.conversation_id;
          }
        });
      }
      setConversationsByRequest(convByRequestId);

      // Fetch client contact visibility and names
      let clientContactByRequestId = {};
      for (const reqId of reqIds) {
        try {
          const { data: contactData } = await supabase.rpc(
            "rpc_get_client_contact_for_request",
            { p_request_id: reqId }
          );
          if (contactData) {
            clientContactByRequestId[reqId] = contactData;
            // Also populate clientNameByRequestId from contact data
            // This ensures client names show even without messages
            if (contactData.name && !clientNameByRequestId[reqId]) {
              clientNameByRequestId[reqId] = contactData.name;
            }
          }
        } catch {
          // Silently fail
        }
      }

      // Fallback: Fetch client names directly from profiles for any missing names
      // This handles cases where rpc_get_client_contact_for_request didn't return names
      const requestIdsNeedingNames = reqIds.filter(
        (reqId) => !clientNameByRequestId[reqId] && reqById[reqId]?.requester_id
      );
      if (requestIdsNeedingNames.length > 0) {
        const clientIds = [...new Set(
          requestIdsNeedingNames
            .map((reqId) => reqById[reqId]?.requester_id)
            .filter(Boolean)
        )];

        if (clientIds.length > 0) {
          const { data: clientProfiles } = await supabase
            .from("profiles")
            .select("id, full_name")
            .in("id", clientIds);

          if (clientProfiles) {
            const profileById = {};
            clientProfiles.forEach((p) => {
              profileById[p.id] = p.full_name;
            });

            // Map client names back to request IDs
            requestIdsNeedingNames.forEach((reqId) => {
              const clientId = reqById[reqId]?.requester_id;
              if (clientId && profileById[clientId]) {
                clientNameByRequestId[reqId] = profileById[clientId];
              }
            });
          }
        }
      }

      // Fetch ALL appointments (for calendar)
      const { data: apptData } = await supabase.rpc(
        "rpc_trade_list_appointments",
        { p_only_upcoming: false }
      );

      // Filter for today and tomorrow
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);
      const dayAfterTomorrow = new Date(today);
      dayAfterTomorrow.setDate(dayAfterTomorrow.getDate() + 2);

      const todayAppts = (apptData || [])
        .filter((a) => {
          const apptDate = new Date(a.scheduled_at);
          return apptDate >= today && apptDate < tomorrow && a.status !== "cancelled";
        })
        .map((a) => {
          const req = reqById[a.request_id];
          return {
            id: a.appointment_id || a.id,
            quote_id: a.quote_id,
            request_id: a.request_id,
            scheduled_at: a.scheduled_at,
            title: a.title || a.project_title,
            serviceType: req?.service_type || a.title || a.project_title,
            status: a.status,
            location: a.postcode || a.job_outcode,
            type: a.type || (a.title?.toLowerCase().includes("survey") ? "survey" : "work"),
            clientName: clientNameByRequestId[a.request_id] || "Client",
          };
        })
        .sort((a, b) => new Date(a.scheduled_at) - new Date(b.scheduled_at));

      const tomorrowAppts = (apptData || [])
        .filter((a) => {
          const apptDate = new Date(a.scheduled_at);
          return apptDate >= tomorrow && apptDate < dayAfterTomorrow && a.status !== "cancelled";
        })
        .map((a) => {
          const req = reqById[a.request_id];
          return {
            id: a.appointment_id || a.id,
            quote_id: a.quote_id,
            request_id: a.request_id,
            scheduled_at: a.scheduled_at,
            title: a.title || a.project_title,
            serviceType: req?.service_type || a.title || a.project_title,
            status: a.status,
            location: a.postcode || a.job_outcode,
            type: a.type || (a.title?.toLowerCase().includes("survey") ? "survey" : "work"),
            clientName: clientNameByRequestId[a.request_id] || "Client",
          };
        })
        .sort((a, b) => new Date(a.scheduled_at) - new Date(b.scheduled_at));

      setTodayAppointments(todayAppts);
      setTomorrowAppointments(tomorrowAppts);

      // Store all future appointments for calendar
      const allFutureAppointments = (apptData || [])
        .filter((a) => a.status !== "cancelled")
        .map((a) => ({
          id: a.appointment_id || a.id,
          quote_id: a.quote_id,
          request_id: a.request_id,
          scheduled_at: a.scheduled_at,
          title: a.title || a.project_title,
          status: a.status,
          location: a.postcode || a.job_outcode,
          type: a.type || (a.title?.toLowerCase().includes("survey") ? "survey" : "work"),
          clientName: clientNameByRequestId[a.request_id] || "Client",
        }));
      setAllAppointments(allFutureAppointments);

      // Fetch appointments by quote for status checking
      let appointmentsByQuote = {};
      let appointmentsByRequest = {};
      (apptData || []).forEach((a) => {
        const normalized = {
          id: a.appointment_id || a.id,
          quote_id: a.quote_id,
          request_id: a.request_id,
          scheduled_at: a.scheduled_at,
          title: a.title || a.project_title,
          status: a.status,
          type: a.type,
        };

        if (normalized.quote_id) {
          if (!appointmentsByQuote[normalized.quote_id])
            appointmentsByQuote[normalized.quote_id] = [];
          appointmentsByQuote[normalized.quote_id].push(normalized);
        }
        if (normalized.request_id) {
          if (!appointmentsByRequest[normalized.request_id])
            appointmentsByRequest[normalized.request_id] = [];
          appointmentsByRequest[normalized.request_id].push(normalized);
        }
      });

      // Process INBOX (no quote created yet)
      const inbox = (targets || [])
        .filter((t) => !quotedReqIds.has(t.request_id) && t.state !== "declined")
        .map((t) => {
          const r = reqById[t.request_id];
          const requestAge = daysSince(t.created_at);

          const contactInfo = clientContactByRequestId[t.request_id] || {};
          const clientFullName =
            contactInfo.name || clientNameByRequestId[t.request_id] || null;
          const contactUnlocked = contactInfo.contact_unlocked || false;
          const stateStr = (t.state || "").toLowerCase();
          const isAccepted = stateStr.includes("accepted");

          // Check if survey completed (has past survey appointment)
          const reqAppts = appointmentsByRequest[t.request_id] || [];
          const pastSurveys = reqAppts.filter((a) =>
            a.type === "survey" && new Date(a.scheduled_at) < new Date()
          );
          const surveyCompleted = pastSurveys.length > 0;
          const surveyCompletedDaysAgo = surveyCompleted
            ? daysSince(pastSurveys[0].scheduled_at)
            : 0;

          return {
            request_id: t.request_id,
            invited_at: t.created_at,
            request_type: t.invited_by || "system",
            state: t.state,
            isAccepted,
            title: r?.service_type_name || r?.suggested_title || "Project",
            serviceTypeName: r?.service_type_name || null,
            budget_band: r?.budget_band || null,
            postcode: r?.postcode || null,
            requestAge,
            isStale: requestAge >= 3,
            surveyCompleted,
            surveyCompletedDaysAgo,
            clientName: getClientDisplayName(clientFullName, contactUnlocked),
            outsideServiceArea: t.outside_service_area || false,
            distanceMiles: t.distance_miles || null,
            extendedMatch: t.extended_match || false,
          };
        });

      // Process SENT (quote exists)
      const quotesByRequest = {};
      (quotes || []).forEach((q) => {
        if (!quotesByRequest[q.request_id]) {
          quotesByRequest[q.request_id] = [];
        }
        quotesByRequest[q.request_id].push(q);
      });

      const sent = Object.entries(quotesByRequest).map(
        ([requestId, requestQuotes]) => {
          const r = reqById[requestId];
          const t = (targets || []).find(
            (tt) => tt.request_id === requestId && tt.trade_id === myId
          );

          requestQuotes.sort((a, b) => {
            const priorityOrder = {
              completed: 0, awaiting_completion: 1, issue_reported: 2,
              issue_resolved_pending: 3, accepted: 4, sent: 5, created: 5,
              draft: 6, declined: 7, expired: 7,
            };
            const aPriority = priorityOrder[(a.status || "").toLowerCase()] ?? 5;
            const bPriority = priorityOrder[(b.status || "").toLowerCase()] ?? 5;
            return aPriority - bPriority;
          });

          const primaryQuote = requestQuotes[0];
          const primaryStatus = (primaryQuote.status || "").toLowerCase();
          const issuedAt = primaryQuote.issued_at ? new Date(primaryQuote.issued_at) : null;
          const validUntil = primaryQuote.valid_until ? new Date(primaryQuote.valid_until) : null;
          const daysToExpiryVal = validUntil ? daysUntil(validUntil) : issuedAt ? 14 - daysSince(issuedAt) : null;
          const daysSinceIssued = issuedAt ? daysSince(issuedAt) : 0;
          const clientNotResponding = primaryStatus === "sent" && daysSinceIssued >= 8;

          const allQuoteAppointments = requestQuotes.flatMap(
            (q) => appointmentsByQuote[q.id] || []
          );
          const requestAppointments = appointmentsByRequest[requestId] || [];
          const allAppointmentsForQuote = allQuoteAppointments.length > 0 ? allQuoteAppointments : requestAppointments;
          const now = new Date();
          const upcomingAppointments = allAppointmentsForQuote
            .filter((a) => new Date(a.scheduled_at) > now)
            .sort((a, b) => new Date(a.scheduled_at) - new Date(b.scheduled_at));
          const nextAppointment = upcomingAppointments[0] || null;

          const contactInfo = clientContactByRequestId[requestId] || {};
          const clientFullName = contactInfo.name || clientNameByRequestId[requestId] || null;
          const acceptedStatuses = ["accepted", "awaiting_completion", "completed", "issue_reported", "issue_resolved_pending"];
          const acceptedQuote = requestQuotes.find((q) => acceptedStatuses.includes((q.status || "").toLowerCase()));
          const hasAcceptedQuote = !!acceptedQuote;
          const contactUnlocked = contactInfo.contact_unlocked || hasAcceptedQuote;

          return {
            id: primaryQuote.id,
            request_id: requestId,
            status: primaryStatus,
            issued_at: primaryQuote.issued_at ?? primaryQuote.created_at,
            title: r?.service_type_name || r?.suggested_title || "Project",
            serviceTypeName: r?.service_type_name || null,
            request_type: t?.invited_by || "system",
            postcode: r?.postcode || null,
            grand_total: primaryQuote.grand_total,
            tax_total: primaryQuote.tax_total,
            hasAcceptedQuote,
            acceptedQuoteId: acceptedQuote?.id || null,
            acceptedQuoteTotal: acceptedQuote?.grand_total || null,
            acceptedQuoteTax: acceptedQuote?.tax_total || null,
            clientName: getClientDisplayName(clientFullName, contactUnlocked),
            daysToExpiry: daysToExpiryVal,
            isExpiringSoon: daysToExpiryVal !== null && daysToExpiryVal <= 3 && daysToExpiryVal > 0,
            daysSinceIssued,
            clientNotResponding,
            nextAppointment,
          };
        }
      );

      setInboxRows(inbox);
      setSentRows(sent);

      // Calculate pipeline stats
      const now = new Date();
      const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

      const activeQuotes = (quotes || []).filter(
        (q) => ["accepted", "awaiting_completion"].includes(q.status?.toLowerCase())
      );
      const completedQuotesThisMonth = (quotes || []).filter(
        (q) => q.status?.toLowerCase() === "completed" && new Date(q.issued_at) >= firstOfMonth
      );
      const allCompletedQuotes = (quotes || []).filter(
        (q) => q.status?.toLowerCase() === "completed"
      );

      const activeCount = activeQuotes.length;
      const activeValue = activeQuotes.reduce((sum, q) => sum + (q.grand_total || 0), 0);
      const completedThisMonthCount = completedQuotesThisMonth.length;
      const earnedThisMonth = completedQuotesThisMonth.reduce((sum, q) => sum + (q.grand_total || 0), 0);

      setMonthlyStats({
        completedJobs: allCompletedQuotes.length,
        activeJobs: activeCount,
        activeValue,
        completedThisMonth: completedThisMonthCount,
        earnedThisMonth,
      });

      // Calculate pipeline stages
      // Calculate scheduled count (upcoming appointments)
      const upcomingApptsCount = allFutureAppointments.filter(
        (a) => new Date(a.scheduled_at) >= today
      ).length;

      // Calculate performance stats
      const avgRating = reviewsData && reviewsData.length > 0
        ? reviewsData.reduce((sum, r) => sum + (r.rating || 0), 0) / reviewsData.length
        : 0;

      // Quote rate with grace period:
      // - Only count accepted requests that are "mature" (accepted > 3 days ago)
      // - This gives trades time to send quotes before affecting their rate
      const gracePeriodMs = 3 * 24 * 60 * 60 * 1000; // 3 days

      const requestsWithQuotesSet = new Set(
        (quotes || [])
          .filter((q) => ["sent", "accepted", "declined", "expired", "completed", "awaiting_completion"].includes(q.status?.toLowerCase()))
          .map((q) => q.request_id)
      );

      // Filter to only "mature" accepted requests (accepted > 3 days ago)
      // OR requests that already have quotes (regardless of age)
      const matureAcceptedRequests = (targets || []).filter((t) => {
        if (!t.state?.toLowerCase().includes("accepted")) return false;

        // If this request already has a quote, include it (successful conversion)
        if (requestsWithQuotesSet.has(t.request_id)) return true;

        // Otherwise, only include if it's past the grace period
        if (t.first_action_at) {
          const acceptedAt = new Date(t.first_action_at);
          return (today - acceptedAt) > gracePeriodMs;
        }

        return false; // No timestamp and no quote = still in grace period
      });

      const quoteRate = matureAcceptedRequests.length > 0
        ? Math.min(100, Math.round((requestsWithQuotesSet.size / matureAcceptedRequests.length) * 100))
        : null;

      setPerformanceStats({
        responseTimeHours: null, // Would need backend RPC for this
        quoteRate,
        averageRating: avgRating,
        scheduledCount: upcomingApptsCount,
      });

    } catch (e) {
      console.error("Load error:", e);
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useFocusEffect(
    useCallback(() => {
      if (user?.id) {
        load();
      }
    }, [user?.id, load])
  );

  useEffect(() => {
    if (!user?.id) return;
    load();

    // Realtime subscriptions
    const quotesChannel = supabase
      .channel("trades-home-quotes")
      .on("postgres_changes", { event: "*", schema: "public", table: "tradify_native_app_db" }, () => load())
      .subscribe();

    const appointmentsChannel = supabase
      .channel("trades-home-appointments")
      .on("postgres_changes", { event: "*", schema: "public", table: "appointments" }, () => load())
      .subscribe();

    const targetsChannel = supabase
      .channel("trades-home-targets")
      .on("postgres_changes", { event: "*", schema: "public", table: "request_targets" }, () => load())
      .subscribe();

    return () => {
      supabase.removeChannel(quotesChannel);
      supabase.removeChannel(appointmentsChannel);
      supabase.removeChannel(targetsChannel);
    };
  }, [user?.id, load]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  // Compute action items with priority sorting
  const actionItems = useMemo(() => {
    const items = [];

    // Priority 1: Issues reported
    sentRows
      .filter((q) => q.status === "issue_reported")
      .forEach((q) => items.push({
        priority: 1,
        type: "issue",
        title: q.title,
        clientName: q.clientName || "Client",
        subtitle: "Client reported a problem",
        requestId: q.request_id,
        quoteId: q.acceptedQuoteId || q.id,
        hasAcceptedQuote: q.hasAcceptedQuote,
      }));

    // Priority 2: Direct requests (new, not accepted)
    inboxRows
      .filter((i) => i.request_type === "client" && !i.isAccepted)
      .forEach((i) => items.push({
        priority: 2,
        type: "direct_request",
        title: i.title,
        clientName: i.clientName || "Client",
        subtitle: i.budget_band ? `Budget: ${i.budget_band}` : null,
        requestId: i.request_id,
        outsideServiceArea: i.outsideServiceArea,
        distanceMiles: i.distanceMiles,
        extendedMatch: i.extendedMatch,
      }));

    // (Removed) Priority 3: Open requests (system broadcast).
    // Settled is now direct-only — clients always pick a specific trade,
    // so trades never receive system-broadcast "open" requests anymore.

    // Priority 4: Send quote needed (survey completed)
    inboxRows
      .filter((i) => i.surveyCompleted && i.isAccepted)
      .forEach((i) => items.push({
        priority: 4,
        type: "send_quote",
        title: i.title,
        clientName: i.clientName || "Client",
        subtitle: `Survey completed ${i.surveyCompletedDaysAgo} day${i.surveyCompletedDaysAgo !== 1 ? "s" : ""} ago`,
        requestId: i.request_id,
      }));

    // Priority 5: No response (quote sent 8+ days ago)
    sentRows
      .filter((q) => q.clientNotResponding)
      .forEach((q) => items.push({
        priority: 5,
        type: "no_response",
        title: q.title,
        clientName: q.clientName || "Client",
        subtitle: `Sent ${q.daysSinceIssued} days ago`,
        requestId: q.request_id,
        quoteId: q.id,
      }));

    // Priority 6: Schedule work needed (accepted but no work scheduled)
    sentRows
      .filter((q) => q.status === "accepted" && !q.nextAppointment?.quote_id)
      .forEach((q) => items.push({
        priority: 6,
        type: "schedule_work",
        title: q.title,
        clientName: q.clientName || "Client",
        subtitle: `Quote: ${formatCurrency(q.acceptedQuoteTotal || q.grand_total)}`,
        requestId: q.request_id,
        quoteId: q.acceptedQuoteId || q.id,
        hasAcceptedQuote: true,
      }));

    return items.sort((a, b) => a.priority - b.priority);
  }, [inboxRows, sentRows]);

  const firstName = profile?.full_name?.split(" ")[0] || user?.user_metadata?.full_name?.split(" ")[0] || "there";
  const isNewTrade = monthlyStats.completedJobs === 0 &&
                     monthlyStats.activeJobs === 0 &&
                     inboxRows.length === 0 &&
                     sentRows.length === 0;

  // Navigation handlers
  const handleJobsPress = () => {
    router.push({ pathname: "/quotes", params: { filter: "active" } });
  };

  const handleScheduledPress = () => {
    setCalendarVisible(true);
  };

  const handleActionItemPress = (item) => {
    // Stay within the trades tab stack so the X button returns to the trade home
    if (item.hasAcceptedQuote && item.quoteId) {
      router.push(`/trades/quote/${item.quoteId}`);
    } else if (item.quoteId) {
      router.push(`/trades/quote/${item.quoteId}`);
    } else {
      router.push(`/trades/request/${item.requestId}`);
    }
  };

  const handleAppointmentPress = (appt) => {
    // Stay within the trades tab stack
    if (appt.quote_id) {
      router.push(`/trades/quote/${appt.quote_id}`);
    } else {
      router.push(`/trades/request/${appt.request_id}`);
    }
  };

  const handleMessagePress = (conversationId) => {
    if (conversationId) {
      router.push(`/messages/${conversationId}`);
    }
  };

  const handleSeeAllSchedule = () => {
    setCalendarVisible(true);
  };

  const handleSeeAllActions = () => {
    router.push("/quotes");
  };

  const handlePipelinePress = () => {
    router.push("/trades/pipeline");
  };

  const handleProfileCompletion = () => {
    router.push("/profile/settings");
  };

  if (loading) {
    return (
      <ThemedView style={[rootStyles.container, { paddingTop: insets.top }]}>
        <StatusBar style={dark ? "light" : "dark"} />
        <HomePageSkeleton paddingTop={20} />
      </ThemedView>
    );
  }

  return (
    <ThemedView style={[rootStyles.container, { paddingTop: insets.top }]}>
      <StatusBar style={dark ? "light" : "dark"} />
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[
          rootStyles.scrollContent,
          { paddingBottom: insets.bottom + 110 },
        ]}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={Colors.primary}
          />
        }
        showsVerticalScrollIndicator={false}
      >
        <Header firstName={firstName} isNewTrade={isNewTrade} />

        <GlanceStrip
          todayCount={todayAppointments.length}
          attentionCount={isNewTrade ? 0 : actionItems.length}
          sentCount={sentRows.filter((q) => q.status === "sent").length}
        />

        <TodaySection
          todayAppointments={todayAppointments}
          tomorrowAppointments={tomorrowAppointments}
          onSeeAll={handleSeeAllSchedule}
          onItemPress={handleAppointmentPress}
          onMessage={handleMessagePress}
          conversationsByRequest={conversationsByRequest}
        />

        {isNewTrade ? (
          <NewTradeActionItems />
        ) : (
          <ActionItemsSection
            items={actionItems}
            onItemPress={handleActionItemPress}
            onSeeAll={handleSeeAllActions}
          />
        )}

        <PipelineList
          activeJobs={monthlyStats.activeJobs}
          sentQuotes={sentRows.filter((q) => q.status === "sent").length}
          scheduled={performanceStats.scheduledCount || 0}
          completedThisMonth={monthlyStats.completedThisMonth}
          onActivePress={handleJobsPress}
          onSentPress={() => router.push({ pathname: "/quotes", params: { filter: "sent" } })}
          onScheduledPress={handleScheduledPress}
          onCompletedPress={() => router.push({ pathname: "/quotes", params: { filter: "completed" } })}
        />

        <MonthSummary
          earned={monthlyStats.earnedThisMonth}
          activeValue={monthlyStats.activeValue}
        />

        <HealthRow
          stats={performanceStats}
          onInfoPress={() => setPerformanceInfoVisible(true)}
        />

        <ProfileFooter profile={profile} onPress={handleProfileCompletion} />

        <Spacer height={40} />
      </ScrollView>

      <CalendarModal
        visible={calendarVisible}
        onClose={() => setCalendarVisible(false)}
        appointments={allAppointments}
        onItemPress={handleAppointmentPress}
      />

      <PerformanceInfoModal
        visible={performanceInfoVisible}
        onClose={() => setPerformanceInfoVisible(false)}
      />
    </ThemedView>
  );
}

// ============================================
// STYLES
// ============================================
// Static outer styles — no theme needed for these.
const rootStyles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 20,
  },
});

// makeStyles(c, dark) — regenerates the styles object when the theme changes.
// All colours come from `c` (the active palette); typography uses the shared
// font families so everything picks up the new Public Sans / DM Sans stack.
function makeStyles(c, dark) {
  return StyleSheet.create({
    // ============ HEADER ============
    headerSection: {
      marginBottom: 12,
    },
    headerGreeting: {
      fontSize: 28,
      fontFamily: FontFamily.headerBold,
      color: c.text,
      letterSpacing: -0.5,
    },
    headerDate: {
      fontSize: 13,
      fontFamily: FontFamily.bodyRegular,
      color: c.textMid,
      marginTop: 4,
    },

    // ============ GLANCE STRIP ============
    glanceStrip: {
      paddingVertical: 12,
      paddingHorizontal: 14,
      backgroundColor: c.elevate,
      borderRadius: Radius.md,
      borderWidth: 1,
      borderColor: c.border,
      marginBottom: 24,
    },
    glanceText: {
      fontSize: 13,
      color: c.textMid,
      fontFamily: FontFamily.bodyMedium,
    },

    // ============ SECTION SHARED ============
    section: {
      marginBottom: 28,
    },
    sectionHeaderRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: 12,
    },
    sectionLabel: {
      fontSize: 11,
      fontFamily: FontFamily.headerBold,
      color: c.textMuted,
      textTransform: "uppercase",
      letterSpacing: 1.1,
    },
    subLabel: {
      fontSize: 11,
      fontFamily: FontFamily.headerBold,
      color: c.textMuted,
      textTransform: "uppercase",
      letterSpacing: 1.1,
      marginTop: 16,
      marginBottom: 8,
    },
    linkButton: {
      flexDirection: "row",
      alignItems: "center",
      gap: 2,
    },
    linkText: {
      fontSize: 13,
      fontFamily: FontFamily.headerSemibold,
      color: c.text,
    },
    inlineEmpty: {
      fontSize: 14,
      fontFamily: FontFamily.bodyRegular,
      color: c.textMuted,
      paddingVertical: 8,
    },
    infoButton: {
      padding: 4,
    },

    // ============ TODAY (appointments) ============
    apptList: {
      gap: 0,
    },
    apptRow: {
      flexDirection: "row",
      paddingVertical: 12,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: c.divider,
      gap: 14,
    },
    apptTimeColumn: {
      width: 56,
      paddingTop: 1,
    },
    apptTime: {
      fontSize: 14,
      fontFamily: FontFamily.headerSemibold,
      color: c.text,
    },
    apptBody: {
      flex: 1,
    },
    apptTopLine: {
      flexDirection: "row",
      alignItems: "center",
      gap: 5,
      flexWrap: "wrap",
    },
    apptType: {
      fontSize: 12,
      fontFamily: FontFamily.bodyMedium,
      color: c.textMid,
    },
    apptDot: {
      fontSize: 12,
      color: c.textFaint,
    },
    apptClient: {
      fontSize: 12,
      fontFamily: FontFamily.bodyMedium,
      color: c.textMid,
      flexShrink: 1,
    },
    apptTitle: {
      fontSize: 15,
      fontFamily: FontFamily.bodyMedium,
      color: c.text,
      marginTop: 2,
    },
    apptLocation: {
      fontSize: 13,
      fontFamily: FontFamily.bodyRegular,
      color: c.textMid,
      marginTop: 1,
    },
    apptActions: {
      flexDirection: "row",
      gap: 8,
      marginTop: 10,
    },
    apptChip: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 999,
      backgroundColor: c.elevate2,
      borderWidth: 1,
      borderColor: c.border,
    },
    apptChipText: {
      fontSize: 12,
      fontFamily: FontFamily.headerSemibold,
      color: c.text,
    },
    tomorrowGroup: {
      marginTop: 8,
    },

    // ============ NEEDS YOUR ATTENTION ============
    attentionList: {
      gap: 8,
    },
    attentionCard: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      paddingVertical: 12,
      paddingHorizontal: 14,
      borderRadius: Radius.md,
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: c.elevate,
    },
    attentionDot: {
      width: 8,
      height: 8,
      borderRadius: 4,
    },
    attentionBody: {
      flex: 1,
    },
    attentionLabelRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      flexWrap: "wrap",
    },
    attentionLabel: {
      fontSize: 11,
      fontFamily: FontFamily.headerBold,
      color: c.textMid,
      textTransform: "uppercase",
      letterSpacing: 0.8,
    },
    attentionTitle: {
      fontSize: 14,
      fontFamily: FontFamily.bodyMedium,
      color: c.text,
      marginTop: 2,
    },
    attentionMeta: {
      fontSize: 12,
      fontFamily: FontFamily.bodyRegular,
      color: c.textMid,
      marginTop: 1,
    },
    metaPill: {
      flexDirection: "row",
      alignItems: "center",
      gap: 3,
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: 4,
      backgroundColor: c.chipBg,
    },
    metaPillText: {
      fontSize: 10,
      fontFamily: FontFamily.headerSemibold,
    },

    // ============ PIPELINE ============
    pipelineList: {
      borderRadius: Radius.md,
      borderWidth: 1,
      borderColor: c.border,
      overflow: "hidden",
      backgroundColor: c.elevate,
    },
    pipelineRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      paddingVertical: 14,
      paddingHorizontal: 14,
    },
    pipelineRowDivider: {
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: c.divider,
    },
    pipelineLabel: {
      fontSize: 14,
      fontFamily: FontFamily.bodyRegular,
      color: c.textMid,
    },
    pipelineValueRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
    },
    pipelineValue: {
      fontSize: 16,
      fontFamily: FontFamily.headerSemibold,
      color: c.text,
    },

    // ============ THIS MONTH ============
    monthList: {
      borderRadius: Radius.md,
      borderWidth: 1,
      borderColor: c.border,
      overflow: "hidden",
      backgroundColor: c.elevate,
    },
    monthRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      paddingVertical: 14,
      paddingHorizontal: 14,
    },
    monthRowDivider: {
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: c.divider,
    },
    monthLabel: {
      fontSize: 14,
      fontFamily: FontFamily.bodyRegular,
      color: c.textMid,
    },
    monthValue: {
      fontSize: 18,
      fontFamily: FontFamily.headerBold,
      color: c.text,
      letterSpacing: -0.3,
    },

    // ============ HEALTH ============
    healthRow: {
      flexDirection: "row",
      alignItems: "center",
      paddingVertical: 14,
      paddingHorizontal: 14,
      borderRadius: Radius.md,
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: c.elevate,
    },
    healthItem: {
      flex: 1,
      alignItems: "center",
    },
    healthDivider: {
      width: 1,
      height: 28,
      backgroundColor: c.border,
    },
    healthValueRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 3,
    },
    healthValue: {
      fontSize: 18,
      fontFamily: FontFamily.headerBold,
      color: c.text,
      letterSpacing: -0.3,
    },
    healthLabel: {
      fontSize: 11,
      fontFamily: FontFamily.bodyMedium,
      color: c.textMid,
      marginTop: 3,
    },

    // ============ PROFILE FOOTER ============
    profileFooter: {
      flexDirection: "row",
      alignItems: "center",
      paddingVertical: 14,
      paddingHorizontal: 14,
      borderRadius: Radius.md,
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: c.elevate,
      marginTop: 8,
      gap: 12,
    },
    profileFooterTitle: {
      fontSize: 13,
      fontFamily: FontFamily.headerSemibold,
      color: c.text,
    },
    profileFooterSubtitle: {
      fontSize: 12,
      fontFamily: FontFamily.bodyRegular,
      color: c.textMid,
      marginTop: 2,
    },

    // ============ EMPTY STATE (for new trades) ============
    emptyStateCard: {
      backgroundColor: c.elevate,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: Radius.lg,
      padding: 24,
      alignItems: "center",
      justifyContent: "center",
    },
    emptyStateText: {
      fontSize: 14,
      fontFamily: FontFamily.bodyRegular,
      color: c.textMid,
      textAlign: "center",
    },

    // Performance Info Modal
    infoModalOverlay: {
      flex: 1,
      backgroundColor: "rgba(0, 0, 0, 0.55)",
      justifyContent: "flex-end",
    },
    infoModalSheet: {
      backgroundColor: c.bg,
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      height: "80%",
      paddingTop: 12,
    },
    infoModalHandle: {
      width: 36,
      height: 4,
      backgroundColor: c.borderStrong,
      borderRadius: 2,
      alignSelf: "center",
      marginBottom: 16,
    },
    infoModalHeader: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: 24,
      paddingBottom: 16,
    },
    infoModalTitle: {
      fontSize: 22,
      fontFamily: FontFamily.headerBold,
      color: c.text,
      letterSpacing: -0.4,
    },
    infoModalCloseBtn: {
      width: 32,
      height: 32,
      borderRadius: 16,
      backgroundColor: c.elevate2,
      alignItems: "center",
      justifyContent: "center",
    },
    infoModalContent: {
      flex: 1,
      paddingHorizontal: 24,
      paddingTop: 16,
    },
    infoSection: {
      marginBottom: 28,
    },
    infoSectionHeader: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      marginBottom: 10,
    },
    infoSectionTitle: {
      fontSize: 16,
      fontFamily: FontFamily.headerSemibold,
      color: c.text,
    },
    infoSectionText: {
      fontSize: 15,
      lineHeight: 22,
      fontFamily: FontFamily.bodyRegular,
      color: c.textMid,
      marginBottom: 12,
    },
    infoTipBox: {
      backgroundColor: c.elevate2,
      borderRadius: Radius.md,
      padding: 14,
      borderLeftWidth: 3,
      borderLeftColor: TINT,
    },
    infoTipTitle: {
      fontSize: 13,
      fontFamily: FontFamily.headerSemibold,
      color: c.text,
      marginBottom: 6,
    },
    infoTipText: {
      fontSize: 14,
      lineHeight: 20,
      fontFamily: FontFamily.bodyRegular,
      color: c.textMid,
    },

    // ============ Calendar Modal ============
    calendarModal: {
      flex: 1,
      backgroundColor: c.bg,
    },
    calendarHeader: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: 20,
      paddingTop: 20,
      paddingBottom: 12,
      borderBottomWidth: 1,
      borderBottomColor: c.border,
    },
    calendarHeaderTitle: {
      fontSize: 18,
      fontFamily: FontFamily.headerBold,
      color: c.text,
    },
    calendarMonthNav: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: 20,
      paddingVertical: 16,
    },
    calendarNavBtn: {
      padding: 8,
    },
    calendarMonthTitle: {
      fontSize: 18,
      fontFamily: FontFamily.headerBold,
      color: c.text,
    },
    calendarWeekDays: {
      flexDirection: "row",
      paddingHorizontal: 10,
      borderBottomWidth: 1,
      borderBottomColor: c.border,
      paddingBottom: 8,
    },
    calendarWeekDay: {
      flex: 1,
      alignItems: "center",
    },
    calendarWeekDayText: {
      fontSize: 12,
      fontFamily: FontFamily.headerSemibold,
      color: c.textMid,
    },
    calendarContent: {
      flex: 1,
    },
    calendarGrid: {
      flexDirection: "row",
      flexWrap: "wrap",
      paddingHorizontal: 10,
      paddingTop: 8,
    },
    calendarDayCell: {
      width: (SCREEN_WIDTH - 20) / 7,
      height: 60,
      alignItems: "center",
      paddingTop: 4,
    },
    calendarDayNumber: {
      width: 32,
      height: 32,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: 16,
    },
    calendarDayNumberToday: {
      backgroundColor: TINT,
    },
    calendarDayText: {
      fontSize: 14,
      fontFamily: FontFamily.bodyMedium,
      color: c.text,
    },
    calendarDayTextToday: {
      color: "#FFFFFF",
    },
    calendarDayIndicators: {
      flexDirection: "row",
      gap: 3,
      marginTop: 4,
      alignItems: "center",
    },
    calendarDayDot: {
      width: 6,
      height: 6,
      borderRadius: 3,
    },
    calendarDayMore: {
      fontSize: 10,
      fontFamily: FontFamily.bodyRegular,
      color: c.textMid,
    },
    calendarAppointmentsList: {
      paddingHorizontal: 20,
      paddingTop: 20,
    },
    calendarAppointmentsTitle: {
      fontSize: 14,
      fontFamily: FontFamily.headerSemibold,
      color: c.textMid,
      marginBottom: 12,
    },
    calendarAppointmentItem: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: c.elevate,
      borderRadius: Radius.md,
      padding: 14,
      marginBottom: 8,
      borderWidth: 1,
      borderColor: c.border,
    },
    calendarAppointmentDot: {
      width: 8,
      height: 8,
      borderRadius: 4,
      marginRight: 12,
    },
    calendarAppointmentContent: {
      flex: 1,
    },
    calendarAppointmentDate: {
      fontSize: 12,
      fontFamily: FontFamily.headerSemibold,
      color: TINT,
    },
    calendarAppointmentTitle: {
      fontSize: 15,
      fontFamily: FontFamily.bodyMedium,
      color: c.text,
      marginTop: 2,
    },
    calendarAppointmentClient: {
      fontSize: 13,
      fontFamily: FontFamily.bodyRegular,
      color: c.textMid,
      marginTop: 2,
    },
    calendarAppointmentDateRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
    },
    calendarAppointmentItemPast: {
      backgroundColor: c.elevate2,
      borderColor: c.border,
    },
    calendarAppointmentDatePast: {
      color: c.textMuted,
    },
    calendarAppointmentTitlePast: {
      color: c.textMid,
    },
    pastBadge: {
      backgroundColor: c.elevate2,
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: 4,
    },
    pastBadgeText: {
      fontSize: 10,
      fontFamily: FontFamily.headerSemibold,
      color: c.textMid,
    },
  });
}
