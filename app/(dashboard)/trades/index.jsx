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
import { useUser } from "../../../hooks/useUser";
import { supabase } from "../../../lib/supabase";

const TINT = Colors?.light?.tint || "#6849a7";
const { width: SCREEN_WIDTH } = Dimensions.get("window");

// Status colors matching Projects tab
const STATUS_COLORS = {
  issue: "#DC2626",      // Red
  direct: "#7C3AED",     // Purple
  action: "#F59E0B",     // Orange
  scheduled: "#10B981",  // Green
  new: "#3B82F6",        // Blue
  waiting: "#6B7280",    // Gray
};

// Format currency
function formatCurrency(amount) {
  if (amount == null || isNaN(amount)) return "£0";
  return `£${Number(amount).toLocaleString("en-GB", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })}`;
}

function formatCurrencyFull(amount) {
  if (amount == null || isNaN(amount)) return "£0.00";
  return `£${Number(amount).toLocaleString("en-GB", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
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

function formatTime(date) {
  if (!date) return "";
  const d = new Date(date);
  return d.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
  });
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

// ============================================
// HERO SECTION
// ============================================
function HeroSection({ firstName, actionItemsCount, hasIssues }) {
  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return "Good morning";
    if (hour < 18) return "Good afternoon";
    return "Good evening";
  };

  const getSubtitle = () => {
    if (hasIssues) {
      return { text: `${actionItemsCount} item${actionItemsCount !== 1 ? "s" : ""} need your attention`, color: STATUS_COLORS.issue };
    }
    if (actionItemsCount > 0) {
      return { text: `${actionItemsCount} item${actionItemsCount !== 1 ? "s" : ""} need your attention`, color: STATUS_COLORS.action };
    }
    return { text: "You're all caught up!", color: STATUS_COLORS.scheduled };
  };

  const subtitle = getSubtitle();

  return (
    <View style={styles.heroSection}>
      <ThemedText style={styles.heroGreeting}>
        {getGreeting()}, {firstName}
      </ThemedText>
      <ThemedText style={[styles.heroSubtitle, { color: subtitle.color }]}>
        {subtitle.text}
      </ThemedText>
    </View>
  );
}

// ============================================
// SUMMARY CARDS
// ============================================
function SummaryCards({ counts, onPress }) {
  const cards = [
    { key: "action", label: "Action", count: counts.action, color: STATUS_COLORS.action, filter: "all" },
    { key: "scheduled", label: "Scheduled", count: counts.scheduled, color: STATUS_COLORS.scheduled, filter: "active" },
    { key: "pending", label: "Pending", count: counts.pending, color: STATUS_COLORS.waiting, filter: "active" },
    { key: "new", label: "New", count: counts.new, color: STATUS_COLORS.new, filter: "new" },
  ];

  return (
    <View style={styles.summaryCardsRow}>
      {cards.map((card) => (
        <Pressable
          key={card.key}
          style={styles.summaryCard}
          onPress={() => onPress(card.filter)}
        >
          <ThemedText style={styles.summaryCardCount}>{card.count}</ThemedText>
          <ThemedText style={styles.summaryCardLabel} numberOfLines={1}>{card.label}</ThemedText>
          <View style={[styles.summaryCardIndicator, { backgroundColor: card.color }]} />
        </Pressable>
      ))}
    </View>
  );
}


// ============================================
// ACTION ITEMS SECTION
// ============================================
function ActionItemsSection({ items, onItemPress }) {
  if (items.length === 0) {
    return (
      <View style={styles.section}>
        <View style={styles.sectionHeaderLeft}>
          <Ionicons name="checkmark-circle-outline" size={20} color="#111827" />
          <ThemedText style={styles.sectionTitle}>All Caught Up</ThemedText>
        </View>
        <View style={styles.emptyStateCard}>
          <ThemedText style={styles.emptyStateText}>
            No urgent items need your attention right now.
          </ThemedText>
        </View>
      </View>
    );
  }

  const getItemIcon = (type) => {
    switch (type) {
      case "issue": return { icon: "alert-circle", color: STATUS_COLORS.issue };
      case "direct_request": return { icon: "person", color: STATUS_COLORS.direct };
      case "no_response": return { icon: "time", color: STATUS_COLORS.action };
      case "schedule_work": return { icon: "calendar", color: STATUS_COLORS.action };
      case "stale_request": return { icon: "alert", color: STATUS_COLORS.action };
      case "expiring": return { icon: "hourglass", color: STATUS_COLORS.action };
      case "awaiting_completion": return { icon: "checkmark-circle-outline", color: STATUS_COLORS.waiting };
      default: return { icon: "ellipse", color: STATUS_COLORS.action };
    }
  };

  return (
    <View style={styles.section}>
      <View style={styles.sectionHeaderLeft}>
        <Ionicons name="notifications" size={20} color={STATUS_COLORS.action} />
        <ThemedText style={styles.sectionTitle}>Needs Attention</ThemedText>
      </View>

      <View style={styles.actionItemsList}>
        {items.slice(0, 5).map((item, index) => {
          const iconConfig = getItemIcon(item.type);
          return (
            <Pressable
              key={`${item.type}-${item.requestId}-${index}`}
              style={styles.actionItem}
              onPress={() => onItemPress(item)}
            >
              <View style={[styles.actionItemIndicator, { backgroundColor: iconConfig.color }]}>
                <Ionicons name={iconConfig.icon} size={14} color="#FFFFFF" />
              </View>
              <View style={styles.actionItemContent}>
                <ThemedText style={styles.actionItemLabel}>{item.label}</ThemedText>
                <ThemedText style={styles.actionItemTitle} numberOfLines={1}>
                  {item.title} · {item.clientName}
                </ThemedText>
                {item.subtitle && (
                  <ThemedText style={styles.actionItemSubtitle} numberOfLines={1}>
                    {item.subtitle}
                  </ThemedText>
                )}
              </View>
              <Ionicons name="chevron-forward" size={18} color="#9CA3AF" />
            </Pressable>
          );
        })}
      </View>

      {items.length > 5 && (
        <Pressable style={styles.grayButton} onPress={() => onItemPress({ goToProjects: true })}>
          <ThemedText style={styles.grayButtonText}>
            View all {items.length} items in Projects
          </ThemedText>
        </Pressable>
      )}
    </View>
  );
}

// ============================================
// CALENDAR MODAL
// ============================================
const { height: SCREEN_HEIGHT } = Dimensions.get("window");

function CalendarModal({ visible, onClose, appointments, onItemPress }) {
  const insets = useSafeAreaInsets();
  const [currentDate, setCurrentDate] = useState(new Date());

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

  const goToToday = () => {
    setCurrentDate(new Date());
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
            <Ionicons name="close" size={24} color="#111827" />
          </Pressable>
          <ThemedText style={styles.calendarHeaderTitle}>Calendar</ThemedText>
          <View style={{ width: 24 }} />
        </View>

        {/* Month Navigation */}
        <View style={styles.calendarMonthNav}>
          <Pressable onPress={goToPrevMonth} hitSlop={10} style={styles.calendarNavBtn}>
            <Ionicons name="chevron-back" size={24} color="#111827" />
          </Pressable>
          <ThemedText style={styles.calendarMonthTitle}>{getMonthName(currentDate)}</ThemedText>
          <Pressable onPress={goToNextMonth} hitSlop={10} style={styles.calendarNavBtn}>
            <Ionicons name="chevron-forward" size={24} color="#111827" />
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
                                { backgroundColor: appt.type === "survey" ? TINT : "#10B981" }
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
                    { backgroundColor: appt.isPast ? "#9CA3AF" : (appt.type === "survey" ? TINT : "#10B981") }
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
                  <Ionicons name="chevron-forward" size={18} color="#9CA3AF" />
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
// SCHEDULE SECTION
// ============================================
function ScheduleSection({ appointments, allAppointments, onItemPress, onSeeAll }) {
  // Group appointments by day
  const groupedAppointments = useMemo(() => {
    const groups = {};
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    appointments.forEach((appt) => {
      const apptDate = new Date(appt.scheduled_at);
      apptDate.setHours(0, 0, 0, 0);

      const diffDays = Math.floor((apptDate - today) / (1000 * 60 * 60 * 24));
      let label;
      if (diffDays === 0) label = "Today";
      else if (diffDays === 1) label = "Tomorrow";
      else label = formatDate(appt.scheduled_at);

      if (!groups[label]) {
        groups[label] = { label, isToday: diffDays === 0, appointments: [] };
      }
      groups[label].appointments.push(appt);
    });

    return Object.values(groups).sort((a, b) => {
      if (a.isToday) return -1;
      if (b.isToday) return 1;
      return 0;
    });
  }, [appointments]);

  return (
    <View style={styles.section}>
      <View style={styles.sectionHeaderRow}>
        <View style={styles.sectionHeaderLeftInline}>
          <Ionicons name="calendar-outline" size={20} color="#111827" />
          <ThemedText style={styles.sectionTitle}>This Week</ThemedText>
        </View>
        <Pressable onPress={onSeeAll} style={styles.seeAllButton}>
          <ThemedText style={styles.seeAllText}>See all</ThemedText>
          <Ionicons name="chevron-forward" size={16} color="#111827" />
        </Pressable>
      </View>

      {groupedAppointments.length === 0 ? (
        <View style={styles.emptyStateCard}>
          <ThemedText style={styles.emptyStateText}>
            No appointments scheduled for the next 7 days.
          </ThemedText>
        </View>
      ) : (
        <View style={styles.scheduleGroups}>
          {groupedAppointments.map((group) => (
            <View key={group.label} style={styles.scheduleGroup}>
              <ThemedText style={styles.scheduleGroupLabel}>{group.label}</ThemedText>
              {group.appointments.map((appt) => (
                <Pressable
                  key={appt.id}
                  style={styles.scheduleItem}
                  onPress={() => onItemPress(appt)}
                >
                  <View style={styles.scheduleItemDot}>
                    <View style={[
                      styles.scheduleDot,
                      group.isToday ? styles.scheduleDotFilled : styles.scheduleDotOutline
                    ]} />
                  </View>
                  <View style={styles.scheduleItemTime}>
                    <ThemedText style={styles.scheduleTimeText}>
                      {formatTime(appt.scheduled_at)}
                    </ThemedText>
                  </View>
                  <View style={styles.scheduleItemContent}>
                    <ThemedText style={styles.scheduleItemType}>
                      {appt.type === "survey" ? "Survey visit" : "Work visit"}
                    </ThemedText>
                    <ThemedText style={styles.scheduleItemTitle} numberOfLines={1}>
                      {appt.title} · {appt.clientName}
                    </ThemedText>
                    {appt.location && (
                      <View style={styles.scheduleItemLocation}>
                        <Ionicons name="location-outline" size={12} color="#9CA3AF" />
                        <ThemedText style={styles.scheduleLocationText}>{appt.location}</ThemedText>
                      </View>
                    )}
                  </View>
                </Pressable>
              ))}
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

// ============================================
// PIPELINE SUMMARY SECTION
// ============================================
function PipelineSummarySection({ stats, onPress }) {
  if (stats.completedJobs === 0 && stats.earned === 0 && stats.activeJobs === 0) {
    return null;
  }

  return (
    <View style={styles.section}>
      <View style={styles.pipelineSummaryHeader}>
        <View style={styles.pipelineSummaryHeaderLeft}>
          <Ionicons name="stats-chart-outline" size={20} color="#111827" />
          <ThemedText style={styles.sectionTitle}>Pipeline</ThemedText>
        </View>
        <Pressable onPress={onPress} style={styles.seeAllButton}>
          <ThemedText style={styles.seeAllText}>See all</ThemedText>
          <Ionicons name="chevron-forward" size={16} color="#111827" />
        </Pressable>
      </View>

      <Pressable style={styles.pipelineSummaryCard} onPress={onPress}>
        <View style={styles.pipelineSummaryRow}>
          <View style={styles.pipelineSummaryItem}>
            <ThemedText style={styles.pipelineSummaryValue}>{stats.activeJobs}</ThemedText>
            <ThemedText style={styles.pipelineSummaryLabel}>Active</ThemedText>
          </View>
          <View style={styles.pipelineSummaryDivider} />
          <View style={styles.pipelineSummaryItem}>
            <ThemedText style={styles.pipelineSummaryValue}>{stats.completedJobs}</ThemedText>
            <ThemedText style={styles.pipelineSummaryLabel}>Completed</ThemedText>
          </View>
          <View style={styles.pipelineSummaryDivider} />
          <View style={styles.pipelineSummaryItem}>
            <ThemedText style={styles.pipelineSummaryValue}>{formatCurrency(stats.earned)}</ThemedText>
            <ThemedText style={styles.pipelineSummaryLabel}>Earned</ThemedText>
          </View>
        </View>
        <View style={styles.pipelineSummaryFooter}>
          <ThemedText style={styles.pipelineSummaryFooterText}>
            Tap to view all projects and details
          </ThemedText>
          <Ionicons name="arrow-forward" size={16} color="#6B7280" />
        </View>
      </Pressable>
    </View>
  );
}

// ============================================
// MAIN COMPONENT
// ============================================
export default function TradesmanHome() {
  const router = useRouter();
  const { user } = useUser();
  const insets = useSafeAreaInsets();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [calendarVisible, setCalendarVisible] = useState(false);

  // Data states
  const [profile, setProfile] = useState(null);
  const [inboxRows, setInboxRows] = useState([]);
  const [sentRows, setSentRows] = useState([]);
  const [weekAppointments, setWeekAppointments] = useState([]);
  const [allAppointments, setAllAppointments] = useState([]);
  const [monthlyStats, setMonthlyStats] = useState({ completedJobs: 0, activeJobs: 0, earned: 0 });

  const load = useCallback(async () => {
    if (!user?.id) return;

    try {
      const myId = user.id;

      // Fetch profile
      const { data: profileData } = await supabase
        .from("profiles")
        .select("full_name, business_name")
        .eq("id", myId)
        .single();
      setProfile(profileData);

      // Fetch request targets (inbox)
      const { data: targets, error: tErr } = await supabase
        .from("request_targets")
        .select("request_id, state, invited_by, created_at, trade_id")
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

      // Fetch request docs
      let reqById = {};
      if (reqIds.length) {
        const { data: reqs } = await supabase
          .from("quote_requests")
          .select(
            "id, details, created_at, status, postcode, budget_band, suggested_title, requester_id"
          )
          .in("id", reqIds);
        (reqs || []).forEach((r) => (reqById[r.id] = r));
      }

      // Fetch client names via conversations
      let clientNameByRequestId = {};
      let clientContactByRequestId = {};
      const { data: convData } = await supabase.rpc("rpc_list_conversations", {
        p_limit: 100,
      });
      if (convData) {
        convData.forEach((conv) => {
          if (conv.request_id && conv.other_party_name) {
            clientNameByRequestId[conv.request_id] = conv.other_party_name;
          }
        });
      }

      // Fetch client contact visibility
      for (const reqId of reqIds) {
        try {
          const { data: contactData } = await supabase.rpc(
            "rpc_get_client_contact_for_request",
            { p_request_id: reqId }
          );
          if (contactData) {
            clientContactByRequestId[reqId] = contactData;
          }
        } catch {
          // Silently fail
        }
      }

      // Fetch ALL appointments (for calendar)
      const { data: apptData } = await supabase.rpc(
        "rpc_trade_list_appointments",
        { p_only_upcoming: false }
      );

      // Filter for this week
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const nextWeek = new Date(today);
      nextWeek.setDate(nextWeek.getDate() + 7);

      const filteredAppointments = (apptData || [])
        .filter((a) => {
          const apptDate = new Date(a.scheduled_at);
          return apptDate >= today && apptDate < nextWeek && a.status !== "cancelled";
        })
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
        }))
        .sort((a, b) => new Date(a.scheduled_at) - new Date(b.scheduled_at));

      setWeekAppointments(filteredAppointments);

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

          return {
            request_id: t.request_id,
            invited_at: t.created_at,
            request_type: t.invited_by || "system",
            state: t.state,
            isAccepted,
            title: r?.suggested_title || "Project",
            budget_band: r?.budget_band || null,
            postcode: r?.postcode || null,
            requestAge,
            isStale: requestAge >= 3,
            clientName: getClientDisplayName(clientFullName, contactUnlocked),
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
          const clientNotResponding = primaryStatus === "sent" && daysSinceIssued >= 7;

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
            title: r?.suggested_title || "Project",
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
      const completedQuotes = (quotes || []).filter(
        (q) => q.status?.toLowerCase() === "completed"
      );
      const activeQuotes = (quotes || []).filter(
        (q) => ["accepted", "awaiting_completion"].includes(q.status?.toLowerCase())
      );
      const completedCount = completedQuotes.length;
      const activeCount = activeQuotes.length;
      const earnedTotal = completedQuotes.reduce(
        (sum, q) => sum + (q.grand_total || 0),
        0
      );

      setMonthlyStats({
        completedJobs: completedCount,
        activeJobs: activeCount,
        earned: earnedTotal,
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

  // Compute summary counts
  const summaryCounts = useMemo(() => {
    let action = 0;
    let scheduled = 0;
    let pending = 0;
    let newCount = 0;

    // From inbox
    inboxRows.forEach((item) => {
      if (!item.isAccepted) {
        newCount++;
        if (item.request_type === "client" || item.isStale) {
          action++;
        }
      } else {
        action++;
      }
    });

    // From sent
    sentRows.forEach((item) => {
      const status = item.status;
      if (status === "issue_reported" || status === "issue_resolved_pending") {
        action++;
      } else if (item.clientNotResponding || item.isExpiringSoon) {
        action++;
      } else if (status === "accepted") {
        const hasWorkAppt = item.nextAppointment?.quote_id != null;
        if (hasWorkAppt) {
          scheduled++;
        } else {
          action++;
        }
      } else if (status === "sent" || status === "created") {
        pending++;
      } else if (status === "awaiting_completion") {
        pending++;
      }
    });

    return { action, scheduled, pending, new: newCount };
  }, [inboxRows, sentRows]);

  // Compute action items
  const actionItems = useMemo(() => {
    const items = [];

    // Priority 1: Issues
    sentRows
      .filter((q) => q.status === "issue_reported")
      .forEach((q) => items.push({
        priority: 1,
        type: "issue",
        label: "Issue reported",
        title: q.title,
        clientName: q.clientName || "Client",
        subtitle: "Client reported a problem",
        requestId: q.request_id,
        quoteId: q.acceptedQuoteId || q.id,
        hasAcceptedQuote: q.hasAcceptedQuote,
      }));

    // Priority 2: Direct requests
    inboxRows
      .filter((i) => i.request_type === "client" && !i.isAccepted)
      .forEach((i) => items.push({
        priority: 2,
        type: "direct_request",
        label: "Direct request",
        title: i.title,
        clientName: i.clientName || "Client",
        subtitle: i.budget_band ? `Budget: ${i.budget_band}` : null,
        requestId: i.request_id,
      }));

    // Priority 3: No response 7+ days
    sentRows
      .filter((q) => q.clientNotResponding)
      .forEach((q) => items.push({
        priority: 3,
        type: "no_response",
        label: `No response · ${q.daysSinceIssued} days`,
        title: q.title,
        clientName: q.clientName || "Client",
        subtitle: `Expires in ${q.daysToExpiry || 0} days`,
        requestId: q.request_id,
        quoteId: q.id,
      }));

    // Priority 4: Accepted but no work scheduled
    sentRows
      .filter((q) => q.status === "accepted" && !q.nextAppointment?.quote_id)
      .forEach((q) => items.push({
        priority: 4,
        type: "schedule_work",
        label: "Schedule work",
        title: q.title,
        clientName: q.clientName || "Client",
        subtitle: `Quote: ${formatCurrency(q.acceptedQuoteTotal || q.grand_total)}`,
        requestId: q.request_id,
        quoteId: q.acceptedQuoteId || q.id,
        hasAcceptedQuote: true,
      }));

    // Priority 5: Stale inbox
    inboxRows
      .filter((i) => i.isStale && !i.isAccepted && i.request_type !== "client")
      .forEach((i) => items.push({
        priority: 5,
        type: "stale_request",
        label: `Getting stale · ${i.requestAge} days`,
        title: i.title,
        clientName: i.clientName || "Client",
        subtitle: i.budget_band ? `Budget: ${i.budget_band}` : null,
        requestId: i.request_id,
      }));

    // Priority 6: Expiring soon
    sentRows
      .filter((q) => q.isExpiringSoon && !q.clientNotResponding)
      .forEach((q) => items.push({
        priority: 6,
        type: "expiring",
        label: `Expires in ${q.daysToExpiry} days`,
        title: q.title,
        clientName: q.clientName || "Client",
        subtitle: `Quote: ${formatCurrency(q.grand_total)}`,
        requestId: q.request_id,
        quoteId: q.id,
      }));

    // Priority 7: Awaiting completion
    sentRows
      .filter((q) => q.status === "awaiting_completion")
      .forEach((q) => items.push({
        priority: 7,
        type: "awaiting_completion",
        label: "Awaiting client confirmation",
        title: q.title,
        clientName: q.clientName || "Client",
        requestId: q.request_id,
        quoteId: q.acceptedQuoteId || q.id,
        hasAcceptedQuote: true,
      }));

    return items.sort((a, b) => a.priority - b.priority);
  }, [inboxRows, sentRows]);

  const hasIssues = actionItems.some((item) => item.type === "issue");
  const firstName = profile?.full_name?.split(" ")[0] || "there";

  // Navigation handlers
  const handleSummaryCardPress = (filter) => {
    router.push({ pathname: "/quotes", params: { filter } });
  };

  const handleActionItemPress = (item) => {
    if (item.goToProjects) {
      router.push("/quotes");
      return;
    }
    if (item.hasAcceptedQuote && item.quoteId) {
      router.push(`/quotes/${item.quoteId}`);
    } else {
      router.push(`/quotes/request/${item.requestId}`);
    }
  };

  const handleScheduleItemPress = (appt) => {
    if (appt.quote_id) {
      router.push(`/quotes/${appt.quote_id}`);
    } else {
      router.push(`/quotes/request/${appt.request_id}`);
    }
  };

  const handleSeeAllSchedule = () => {
    setCalendarVisible(true);
  };

  const handlePipelinePress = () => {
    router.push("/trades/pipeline");
  };

  if (loading) {
    return (
      <ThemedView style={[styles.container, { paddingTop: insets.top }]}>
        <StatusBar style="dark" />
        <HomePageSkeleton paddingTop={20} />
      </ThemedView>
    );
  }

  return (
    <ThemedView style={[styles.container, { paddingTop: insets.top }]}>
      <StatusBar style="dark" />
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        showsVerticalScrollIndicator={false}
      >
        <HeroSection
          firstName={firstName}
          actionItemsCount={actionItems.length}
          hasIssues={hasIssues}
        />

        <SummaryCards counts={summaryCounts} onPress={handleSummaryCardPress} />

        <Spacer height={24} />

        <PipelineSummarySection
          stats={monthlyStats}
          onPress={handlePipelinePress}
        />

        <ActionItemsSection items={actionItems} onItemPress={handleActionItemPress} />

        <ScheduleSection
          appointments={weekAppointments}
          allAppointments={allAppointments}
          onItemPress={handleScheduleItemPress}
          onSeeAll={handleSeeAllSchedule}
        />

        <Spacer height={40} />
      </ScrollView>

      <CalendarModal
        visible={calendarVisible}
        onClose={() => setCalendarVisible(false)}
        appointments={allAppointments}
        onItemPress={handleScheduleItemPress}
      />
    </ThemedView>
  );
}

// ============================================
// STYLES
// ============================================
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#FFFFFF",
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 20,
  },

  // Hero Section
  heroSection: {
    marginBottom: 20,
  },
  heroGreeting: {
    fontSize: 28,
    fontWeight: "700",
    color: "#111827",
    marginBottom: 4,
  },
  heroSubtitle: {
    fontSize: 16,
    fontWeight: "500",
  },

  // Summary Cards
  summaryCardsRow: {
    flexDirection: "row",
    gap: 6,
  },
  summaryCard: {
    flex: 1,
    backgroundColor: "#FFFFFF",
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 4,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  summaryCardCount: {
    fontSize: 20,
    fontWeight: "700",
    color: "#111827",
  },
  summaryCardLabel: {
    fontSize: 10,
    fontWeight: "500",
    color: "#6B7280",
    marginTop: 2,
    textAlign: "center",
  },
  summaryCardIndicator: {
    width: 18,
    height: 3,
    borderRadius: 2,
    marginTop: 5,
  },

  // Section Headers
  section: {
    marginBottom: 24,
  },
  sectionHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  sectionHeaderLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 12,
  },
  sectionHeaderLeftInline: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#374151",
  },
  seeAllButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
  },
  seeAllText: {
    fontSize: 14,
    fontWeight: "500",
    color: "#111827",
  },

  // Gray Button (matching profile showMoreBtn)
  grayButton: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 14,
    paddingHorizontal: 24,
    marginTop: 16,
    backgroundColor: "#F3F4F6",
    borderRadius: 8,
    alignSelf: "center",
  },
  grayButtonText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#111827",
  },

  // Action Items
  actionItemsList: {
    gap: 8,
  },
  actionItem: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    gap: 12,
  },
  actionItemIndicator: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  actionItemContent: {
    flex: 1,
  },
  actionItemLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: "#6B7280",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  actionItemTitle: {
    fontSize: 15,
    fontWeight: "500",
    color: "#111827",
    marginTop: 2,
  },
  actionItemSubtitle: {
    fontSize: 13,
    color: "#9CA3AF",
    marginTop: 1,
  },

  // Empty State
  emptyStateCard: {
    backgroundColor: "#F9FAFB",
    borderRadius: 12,
    padding: 16,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 60,
  },
  emptyStateText: {
    fontSize: 14,
    color: "#6B7280",
    textAlign: "center",
  },

  // Schedule Section
  scheduleGroups: {
    gap: 16,
  },
  scheduleGroup: {},
  scheduleGroupLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: "#6B7280",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  scheduleItem: {
    flexDirection: "row",
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  scheduleItemDot: {
    width: 20,
    alignItems: "center",
    paddingTop: 4,
  },
  scheduleDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  scheduleDotFilled: {
    backgroundColor: TINT,
  },
  scheduleDotOutline: {
    borderWidth: 2,
    borderColor: TINT,
    backgroundColor: "transparent",
  },
  scheduleItemTime: {
    width: 70,
    paddingTop: 2,
  },
  scheduleTimeText: {
    fontSize: 14,
    fontWeight: "600",
    color: TINT,
  },
  scheduleItemContent: {
    flex: 1,
  },
  scheduleItemType: {
    fontSize: 13,
    color: "#6B7280",
  },
  scheduleItemTitle: {
    fontSize: 15,
    fontWeight: "500",
    color: "#111827",
    marginTop: 2,
  },
  scheduleItemLocation: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 4,
  },
  scheduleLocationText: {
    fontSize: 12,
    color: "#9CA3AF",
  },

  // Pipeline Summary
  pipelineSummaryHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  pipelineSummaryHeaderLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  pipelineSummaryCard: {
    backgroundColor: "#F9FAFB",
    borderRadius: 12,
    padding: 16,
  },
  pipelineSummaryRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  pipelineSummaryItem: {
    flex: 1,
    alignItems: "center",
  },
  pipelineSummaryValue: {
    fontSize: 20,
    fontWeight: "700",
    color: "#111827",
  },
  pipelineSummaryLabel: {
    fontSize: 12,
    color: "#6B7280",
    marginTop: 2,
  },
  pipelineSummaryDivider: {
    width: 1,
    height: 32,
    backgroundColor: "#E5E7EB",
  },
  pipelineSummaryFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "#E5E7EB",
  },
  pipelineSummaryFooterText: {
    fontSize: 13,
    color: "#6B7280",
  },

  // Calendar Modal
  calendarModal: {
    flex: 1,
    backgroundColor: "#FFFFFF",
  },
  calendarHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
  },
  calendarHeaderTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#111827",
  },
  calendarTodayBtn: {
    fontSize: 14,
    fontWeight: "600",
    color: TINT,
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
    fontWeight: "600",
    color: "#111827",
  },
  calendarWeekDays: {
    flexDirection: "row",
    paddingHorizontal: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
    paddingBottom: 8,
  },
  calendarWeekDay: {
    flex: 1,
    alignItems: "center",
  },
  calendarWeekDayText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#6B7280",
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
    fontWeight: "500",
    color: "#111827",
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
    color: "#6B7280",
  },
  calendarAppointmentsList: {
    paddingHorizontal: 20,
    paddingTop: 20,
  },
  calendarAppointmentsTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: "#6B7280",
    marginBottom: 12,
  },
  calendarAppointmentItem: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: "#E5E7EB",
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
    fontWeight: "600",
    color: TINT,
  },
  calendarAppointmentTitle: {
    fontSize: 15,
    fontWeight: "500",
    color: "#111827",
    marginTop: 2,
  },
  calendarAppointmentClient: {
    fontSize: 13,
    color: "#6B7280",
    marginTop: 2,
  },
  calendarAppointmentDateRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  calendarAppointmentItemPast: {
    backgroundColor: "#F9FAFB",
    borderColor: "#E5E7EB",
  },
  calendarAppointmentDatePast: {
    color: "#9CA3AF",
  },
  calendarAppointmentTitlePast: {
    color: "#6B7280",
  },
  pastBadge: {
    backgroundColor: "#E5E7EB",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  pastBadgeText: {
    fontSize: 10,
    fontWeight: "600",
    color: "#6B7280",
  },
});
