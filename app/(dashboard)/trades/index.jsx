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
import { useUser } from "../../../hooks/useUser";
import { supabase } from "../../../lib/supabase";
import { getTradeReviews } from "../../../lib/api/trust";

const TINT = Colors?.light?.tint || "#6849a7";
const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");

// Status colors
const STATUS_COLORS = {
  issue: "#DC2626",      // Red
  direct: "#7C3AED",     // Purple
  action: "#F59E0B",     // Orange
  scheduled: "#10B981",  // Green
  new: "#3B82F6",        // Blue
  waiting: "#6B7280",    // Gray
};

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
// HERO SECTION
// ============================================
function HeroSection({ firstName, isNewTrade }) {
  const getGreeting = () => {
    const hour = new Date().getHours();
    if (isNewTrade) return "Welcome";
    if (hour < 12) return "Good morning";
    if (hour < 18) return "Good afternoon";
    return "Good evening";
  };

  return (
    <View style={styles.heroSection}>
      <ThemedText style={styles.heroGreeting}>
        {getGreeting()}, {firstName}
      </ThemedText>
    </View>
  );
}

// ============================================
// PROFILE COMPLETION BANNER
// ============================================
function ProfileCompletionBanner({ profile, onPress }) {
  // Calculate completion percentage
  const calculateCompletion = () => {
    if (!profile) return { percentage: 0, missing: [] };

    const checks = [
      { field: 'full_name', label: 'Name', weight: 10 },
      { field: 'business_name', label: 'Business name', weight: 10 },
      { field: 'photo_url', label: 'Profile photo', weight: 15 },
      { field: 'bio', label: 'Bio', weight: 10 },
      { field: 'job_titles', label: 'Job titles', weight: 10, check: (v) => v && v.length > 0 },
      { field: 'base_postcode', label: 'Location', weight: 10 },
      { field: 'service_radius_km', label: 'Service area', weight: 5 },
    ];

    // Verification checks
    const verification = profile.verification || {};
    const verificationChecks = [
      { status: verification.photo_id, label: 'Photo ID', weight: 10 },
      { status: verification.insurance, label: 'Insurance', weight: 10 },
      { status: verification.credentials, label: 'Credentials', weight: 10 },
    ];

    let total = 0;
    const missing = [];

    checks.forEach(({ field, label, weight, check }) => {
      const value = profile[field];
      const isComplete = check ? check(value) : !!value;
      if (isComplete) {
        total += weight;
      } else {
        missing.push(label);
      }
    });

    verificationChecks.forEach(({ status, label, weight }) => {
      if (status === 'verified') {
        total += weight;
      } else {
        missing.push(label);
      }
    });

    return { percentage: total, missing };
  };

  const { percentage, missing } = calculateCompletion();

  // Don't show if 100% complete
  if (percentage >= 100) return null;

  const isAlmostDone = percentage >= 80;
  const nextItem = missing[0];

  return (
    <Pressable style={styles.completionBanner} onPress={onPress}>
      <View style={styles.completionHeader}>
        <ThemedText style={styles.completionTitle}>
          {isAlmostDone ? "Almost there!" : "Complete your profile"}
        </ThemedText>
      </View>

      <View style={styles.progressBarContainer}>
        <View style={[styles.progressBarFill, { width: `${percentage}%` }]} />
      </View>
      <ThemedText style={styles.progressPercentage}>{percentage}%</ThemedText>

      <ThemedText style={styles.completionSubtext}>
        {isAlmostDone && nextItem
          ? `Just add your ${nextItem.toLowerCase()} to get verified`
          : "Verified trades get 3x more leads"}
      </ThemedText>

      <View style={styles.completionButton}>
        <ThemedText style={styles.completionButtonText}>Complete</ThemedText>
        <Ionicons name="chevron-forward" size={16} color="#111827" />
      </View>
    </Pressable>
  );
}

// ============================================
// SUMMARY CARDS
// ============================================
function SummaryCards({ stats, onJobsPress, onScheduledPress, onQuotesPress, onCompletedPress }) {
  const cards = [
    { key: "active", label: "Active", count: stats.activeJobs, color: STATUS_COLORS.action, onPress: onJobsPress },
    { key: "scheduled", label: "Scheduled", count: stats.scheduledCount, color: STATUS_COLORS.scheduled, onPress: onScheduledPress },
    { key: "quotes", label: "Quotes", count: stats.pendingQuotes, color: STATUS_COLORS.new, onPress: onQuotesPress },
    { key: "done", label: "Done", count: stats.completedThisMonth, color: STATUS_COLORS.waiting, onPress: onCompletedPress },
  ];

  return (
    <View style={styles.summaryCardsRow}>
      {cards.map((card) => (
        <Pressable key={card.key} style={styles.summaryCard} onPress={card.onPress}>
          <ThemedText style={styles.summaryCardCount}>{card.count}</ThemedText>
          <ThemedText style={styles.summaryCardLabel} numberOfLines={1}>{card.label}</ThemedText>
          <View style={[styles.summaryCardIndicator, { backgroundColor: card.color }]} />
        </Pressable>
      ))}
    </View>
  );
}

// ============================================
// PERFORMANCE INFO MODAL
// ============================================
function PerformanceInfoModal({ visible, onClose }) {
  const insets = useSafeAreaInsets();

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
      onRequestClose={onClose}
    >
      <View style={styles.infoModalOverlay}>
        <View style={[styles.infoModalSheet, { paddingBottom: insets.bottom + 20 }]}>
          {/* Handle bar */}
          <View style={styles.infoModalHandle} />

          <View style={styles.infoModalHeader}>
            <ThemedText style={styles.infoModalTitle}>Performance Metrics</ThemedText>
            <Pressable onPress={onClose} hitSlop={10} style={styles.infoModalCloseBtn}>
              <Ionicons name="close" size={20} color="#111827" />
            </Pressable>
          </View>

          <ScrollView style={styles.infoModalContent} showsVerticalScrollIndicator={false}>
          {/* Response Time */}
          <View style={styles.infoSection}>
            <View style={styles.infoSectionHeader}>
              <Ionicons name="flash" size={20} color={TINT} />
              <ThemedText style={styles.infoSectionTitle}>Response Time</ThemedText>
            </View>
            <ThemedText style={styles.infoSectionText}>
              This measures how quickly you respond to new quote requests and messages from clients.
            </ThemedText>
            <View style={styles.infoTipBox}>
              <ThemedText style={styles.infoTipTitle}>Why it matters</ThemedText>
              <ThemedText style={styles.infoTipText}>
                Clients often reach out to multiple tradespeople. Those who respond within a few hours are much more likely to win the job. Aim to respond within 4 hours during business hours.
              </ThemedText>
            </View>
          </View>

          {/* Quote Rate */}
          <View style={styles.infoSection}>
            <View style={styles.infoSectionHeader}>
              <Ionicons name="checkmark" size={20} color={TINT} />
              <ThemedText style={styles.infoSectionTitle}>Quote Rate</ThemedText>
            </View>
            <ThemedText style={styles.infoSectionText}>
              This shows the percentage of requests you've accepted that resulted in you sending a quote to the client.
            </ThemedText>
            <View style={styles.infoTipBox}>
              <ThemedText style={styles.infoTipTitle}>How it's calculated</ThemedText>
              <ThemedText style={styles.infoTipText}>
                If you accept 10 requests and send quotes for 8 of them, your quote rate is 80%. A higher quote rate shows you're actively pursuing work and following through with clients.
              </ThemedText>
            </View>
          </View>

          {/* Rating */}
          <View style={styles.infoSection}>
            <View style={styles.infoSectionHeader}>
              <Ionicons name="star" size={20} color="#F59E0B" />
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
// PERFORMANCE SECTION
// ============================================
function PerformanceSection({ stats, isNewTrade, onInfoPress }) {
  const hasData = stats.responseTimeHours !== null || stats.quoteRate !== null || stats.averageRating > 0;

  const formatResponseTime = (hours) => {
    if (hours === null || hours === undefined) return "--";
    if (hours < 1) return `${Math.round(hours * 60)} min`;
    if (hours < 24) return `${hours.toFixed(1)} hrs`;
    return `${Math.round(hours / 24)} days`;
  };

  const getPerformanceMessage = () => {
    if (isNewTrade || !hasData) {
      return "Complete your first job to see stats";
    }

    if (stats.responseTimeHours !== null && stats.responseTimeHours < 4) {
      return "You're faster than 78% of trades";
    }

    if (stats.responseTimeHours !== null && stats.responseTimeHours > 12) {
      return "Tip: Faster responses = more jobs";
    }

    if (stats.quoteRate !== null && stats.quoteRate >= 80) {
      return "Great quote rate! Keep it up";
    }

    return null;
  };

  const performanceMessage = getPerformanceMessage();

  return (
    <View style={styles.section}>
      <View style={styles.sectionHeaderRow}>
        <ThemedText style={styles.sectionTitle}>Your Performance</ThemedText>
        <Pressable onPress={onInfoPress} hitSlop={10} style={styles.infoButton}>
          <Ionicons name="information-circle-outline" size={20} color="#6B7280" />
        </Pressable>
      </View>

      <View style={styles.performanceCard}>
        <View style={styles.performanceRow}>
          <View style={styles.performanceItem}>
            <View style={styles.performanceIconRow}>
              <Ionicons name="flash" size={14} color={TINT} />
              <ThemedText style={styles.performanceValue}>
                {formatResponseTime(stats.responseTimeHours)}
              </ThemedText>
            </View>
            <ThemedText style={styles.performanceLabel}>Response</ThemedText>
          </View>

          <View style={styles.performanceDivider} />

          <View style={styles.performanceItem}>
            <View style={styles.performanceIconRow}>
              <Ionicons name="checkmark" size={14} color={TINT} />
              <ThemedText style={styles.performanceValue}>
                {stats.quoteRate !== null ? `${stats.quoteRate}%` : "--"}
              </ThemedText>
            </View>
            <ThemedText style={styles.performanceLabel}>Quote rate</ThemedText>
          </View>

          <View style={styles.performanceDivider} />

          <View style={styles.performanceItem}>
            <View style={styles.performanceIconRow}>
              <Ionicons name="star" size={14} color="#F59E0B" />
              <ThemedText style={styles.performanceValue}>
                {stats.averageRating > 0 ? stats.averageRating.toFixed(1) : "--"}
              </ThemedText>
            </View>
            <ThemedText style={styles.performanceLabel}>Rating</ThemedText>
          </View>
        </View>

        {performanceMessage && (
          <View style={styles.performanceFooter}>
            <ThemedText style={styles.performanceMessage}>
              {performanceMessage}
            </ThemedText>
          </View>
        )}
      </View>
    </View>
  );
}

// ============================================
// TODAY SECTION
// ============================================
function TodaySection({ todayAppointments, tomorrowAppointments, onSeeAll, onItemPress, onMessage, conversationsByRequest }) {
  const today = new Date();
  const todayStr = formatDateFull(today);

  const getAppointmentIcon = (type) => {
    const config = APPOINTMENT_ICONS[type] || APPOINTMENT_ICONS.work;
    return config;
  };

  const AppointmentCard = ({ appointment, showActions = true }) => {
    const iconConfig = getAppointmentIcon(appointment.type);
    const conversationId = conversationsByRequest[appointment.request_id];

    return (
      <Pressable
        style={styles.appointmentCard}
        onPress={() => onItemPress(appointment)}
      >
        <View style={styles.appointmentHeader}>
          <View style={styles.appointmentTimeRow}>
            <Ionicons name={iconConfig.icon} size={16} color={TINT} />
            <ThemedText style={styles.appointmentTime}>
              {formatTime(appointment.scheduled_at)} · {iconConfig.label}
            </ThemedText>
          </View>
        </View>

        <ThemedText style={styles.appointmentTitle} numberOfLines={1}>
          {appointment.serviceType || appointment.title}
        </ThemedText>

        <ThemedText style={styles.appointmentMeta} numberOfLines={1}>
          {appointment.clientName} · {appointment.location}
        </ThemedText>

        {showActions && (
          <View style={styles.appointmentActions}>
            <Pressable
              style={styles.appointmentActionBtn}
              onPress={(e) => {
                e.stopPropagation();
                openDirections(appointment.location);
              }}
            >
              <ThemedText style={styles.appointmentActionText}>Get Directions</ThemedText>
            </Pressable>

            <Pressable
              style={styles.appointmentActionBtn}
              onPress={(e) => {
                e.stopPropagation();
                if (conversationId) {
                  onMessage(conversationId);
                }
              }}
            >
              <ThemedText style={styles.appointmentActionText}>Message</ThemedText>
            </Pressable>
          </View>
        )}
      </Pressable>
    );
  };

  const hasAnyAppointments = todayAppointments.length > 0 || tomorrowAppointments.length > 0;

  return (
    <View style={styles.section}>
      <View style={styles.sectionHeaderRow}>
        <ThemedText style={styles.sectionTitle}>Today · {todayStr}</ThemedText>
        <Pressable onPress={onSeeAll} style={styles.seeAllButton}>
          <ThemedText style={styles.seeAllText}>See all</ThemedText>
          <Ionicons name="chevron-forward" size={16} color="#111827" />
        </Pressable>
      </View>

      {todayAppointments.length === 0 ? (
        <View style={styles.emptyStateCard}>
          <ThemedText style={styles.emptyStateText}>
            No appointments today
          </ThemedText>
        </View>
      ) : (
        <View style={styles.appointmentsList}>
          {todayAppointments.slice(0, 3).map((appt) => (
            <AppointmentCard key={appt.id} appointment={appt} showActions={true} />
          ))}
        </View>
      )}

      {tomorrowAppointments.length > 0 && (
        <>
          <View style={styles.tomorrowDivider}>
            <View style={styles.dividerLine} />
          </View>

          <ThemedText style={styles.tomorrowLabel}>
            Tomorrow · {formatDateFull(new Date(Date.now() + 86400000))}
          </ThemedText>

          <View style={styles.appointmentsList}>
            {tomorrowAppointments.slice(0, 2).map((appt) => (
              <AppointmentCard key={appt.id} appointment={appt} showActions={false} />
            ))}
          </View>
        </>
      )}
    </View>
  );
}

// ============================================
// PIPELINE SECTION
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
// ACTION ITEMS SECTION (Needs Attention)
// ============================================
function ActionItemsSection({ items, onItemPress, onSeeAll }) {
  const getItemConfig = (type) => {
    switch (type) {
      case "issue":
        return { icon: "alert-circle", color: STATUS_COLORS.issue, label: "Issue reported" };
      case "direct_request":
        return { icon: "chatbubble", color: STATUS_COLORS.direct, label: "Direct request" };
      case "open_request":
        return { icon: "download", color: STATUS_COLORS.new, label: "Open request" };
      case "send_quote":
        return { icon: "document-text", color: STATUS_COLORS.action, label: "Send quote" };
      case "no_response":
        return { icon: "time", color: STATUS_COLORS.action, label: "No response" };
      case "schedule_work":
        return { icon: "calendar", color: STATUS_COLORS.action, label: "Schedule work" };
      default:
        return { icon: "ellipse", color: STATUS_COLORS.waiting, label: "Action needed" };
    }
  };

  // Empty state
  if (items.length === 0) {
    return (
      <View style={styles.section}>
        <View style={styles.sectionHeaderRow}>
          <ThemedText style={styles.sectionTitle}>Needs Attention</ThemedText>
        </View>

        <View style={styles.emptyStateCard}>
          <ThemedText style={styles.emptyStateText}>
            No items need your attention right now.
          </ThemedText>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.section}>
      <View style={styles.sectionHeaderRow}>
        <ThemedText style={styles.sectionTitle}>
          Needs Attention ({items.length})
        </ThemedText>
        <Pressable onPress={onSeeAll} style={styles.seeAllButton}>
          <ThemedText style={styles.seeAllText}>See all</ThemedText>
          <Ionicons name="chevron-forward" size={16} color="#111827" />
        </Pressable>
      </View>

      <View style={styles.actionItemsList}>
        {items.slice(0, 3).map((item, index) => {
          const config = getItemConfig(item.type);
          return (
            <Pressable
              key={`${item.type}-${item.requestId}-${index}`}
              style={styles.actionItem}
              onPress={() => onItemPress(item)}
            >
              <View style={[styles.actionItemIndicator, { backgroundColor: config.color }]}>
                <Ionicons name={config.icon} size={14} color="#FFFFFF" />
              </View>
              <View style={styles.actionItemContent}>
                <ThemedText style={styles.actionItemLabel}>{config.label}</ThemedText>
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
    </View>
  );
}

// ============================================
// EMPTY STATE FOR NEW TRADES
// ============================================
function NewTradeActionItems() {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeaderRow}>
        <ThemedText style={styles.sectionTitle}>Needs Attention</ThemedText>
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
// MAIN COMPONENT
// ============================================
export default function TradesmanHome() {
  const router = useRouter();
  const { user } = useUser();
  const insets = useSafeAreaInsets();

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
            "id, details, created_at, status, postcode, budget_band, suggested_title, requester_id, service_type"
          )
          .in("id", reqIds);
        (reqs || []).forEach((r) => (reqById[r.id] = r));
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

      // Fetch client contact visibility
      let clientContactByRequestId = {};
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
            title: r?.suggested_title || "Project",
            budget_band: r?.budget_band || null,
            postcode: r?.postcode || null,
            requestAge,
            isStale: requestAge >= 3,
            surveyCompleted,
            surveyCompletedDaysAgo,
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

      // Quote rate: unique requests with quotes / total requests accepted
      // This measures what % of accepted requests actually got a quote sent
      const acceptedRequests = (targets || []).filter((t) =>
        t.state?.toLowerCase().includes("accepted")
      ).length;
      const requestsWithQuotes = new Set(
        (quotes || [])
          .filter((q) => ["sent", "accepted", "declined", "expired", "completed", "awaiting_completion"].includes(q.status?.toLowerCase()))
          .map((q) => q.request_id)
      ).size;
      const quoteRate = acceptedRequests > 0
        ? Math.min(100, Math.round((requestsWithQuotes / acceptedRequests) * 100))
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
      }));

    // Priority 3: Open requests (new, from system)
    inboxRows
      .filter((i) => i.request_type !== "client" && !i.isAccepted && !i.isStale)
      .forEach((i) => items.push({
        priority: 3,
        type: "open_request",
        title: i.title,
        clientName: i.clientName || "Client",
        subtitle: i.budget_band ? `Budget: ${i.budget_band}` : null,
        requestId: i.request_id,
      }));

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
    if (item.hasAcceptedQuote && item.quoteId) {
      router.push(`/quotes/${item.quoteId}`);
    } else if (item.quoteId) {
      router.push(`/quotes/${item.quoteId}`);
    } else {
      router.push(`/quotes/request/${item.requestId}`);
    }
  };

  const handleAppointmentPress = (appt) => {
    if (appt.quote_id) {
      router.push(`/quotes/${appt.quote_id}`);
    } else {
      router.push(`/quotes/request/${appt.request_id}`);
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
        <HeroSection firstName={firstName} isNewTrade={isNewTrade} />

        <SummaryCards
          stats={{
            activeJobs: monthlyStats.activeJobs,
            scheduledCount: performanceStats.scheduledCount || 0,
            pendingQuotes: sentRows.filter(q => q.status === "sent").length,
            completedThisMonth: monthlyStats.completedThisMonth,
          }}
          onJobsPress={handleJobsPress}
          onScheduledPress={handleScheduledPress}
          onQuotesPress={() => router.push({ pathname: "/quotes", params: { filter: "sent" } })}
          onCompletedPress={() => router.push({ pathname: "/quotes", params: { filter: "completed" } })}
        />

        <Spacer height={24} />

        {/* Needs Attention - first priority */}
        {isNewTrade ? (
          <NewTradeActionItems />
        ) : (
          <ActionItemsSection
            items={actionItems}
            onItemPress={handleActionItemPress}
            onSeeAll={handleSeeAllActions}
          />
        )}

        <TodaySection
          todayAppointments={todayAppointments}
          tomorrowAppointments={tomorrowAppointments}
          onSeeAll={handleSeeAllSchedule}
          onItemPress={handleAppointmentPress}
          onMessage={handleMessagePress}
          conversationsByRequest={conversationsByRequest}
        />

        <PipelineSummarySection
          stats={{
            activeJobs: monthlyStats.activeJobs,
            completedJobs: monthlyStats.completedJobs,
            earned: monthlyStats.earnedThisMonth,
          }}
          onPress={handlePipelinePress}
        />

        {/* Your Performance - at the bottom */}
        <PerformanceSection
          stats={performanceStats}
          isNewTrade={isNewTrade}
          onInfoPress={() => setPerformanceInfoVisible(true)}
        />

        {/* Complete Profile - very bottom */}
        <ProfileCompletionBanner profile={profile} onPress={handleProfileCompletion} />

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
    marginBottom: 16,
  },
  heroGreeting: {
    fontSize: 28,
    fontWeight: "700",
    color: "#111827",
  },

  // Profile Completion Banner
  completionBanner: {
    backgroundColor: "#FFFBEB",
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: "#FDE68A",
  },
  completionHeader: {
    marginBottom: 8,
  },
  completionTitle: {
    fontSize: 15,
    fontWeight: "600",
    color: "#92400E",
  },
  progressBarContainer: {
    height: 6,
    backgroundColor: "#FEF3C7",
    borderRadius: 3,
    marginBottom: 4,
  },
  progressBarFill: {
    height: 6,
    backgroundColor: "#F59E0B",
    borderRadius: 3,
  },
  progressPercentage: {
    fontSize: 12,
    fontWeight: "600",
    color: "#92400E",
    marginBottom: 8,
  },
  completionSubtext: {
    fontSize: 13,
    color: "#B45309",
    marginBottom: 12,
  },
  completionButton: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-end",
  },
  completionButtonText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#111827",
  },

  // Summary Cards
  summaryCardsRow: {
    flexDirection: "row",
    gap: 10,
  },
  summaryCard: {
    flex: 1,
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    paddingVertical: 16,
    paddingHorizontal: 8,
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
    fontSize: 24,
    fontWeight: "700",
    color: "#111827",
  },
  summaryCardLabel: {
    fontSize: 12,
    fontWeight: "500",
    color: "#6B7280",
    marginTop: 2,
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
  infoButton: {
    padding: 4,
  },

  // Performance Info Modal (80% height bottom sheet)
  infoModalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "flex-end",
  },
  infoModalSheet: {
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    height: "80%",
    paddingTop: 12,
  },
  infoModalHandle: {
    width: 36,
    height: 4,
    backgroundColor: "#D1D5DB",
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
    fontWeight: "700",
    color: "#111827",
  },
  infoModalCloseBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#F3F4F6",
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
    fontWeight: "600",
    color: "#111827",
  },
  infoSectionText: {
    fontSize: 15,
    lineHeight: 22,
    color: "#4B5563",
    marginBottom: 12,
  },
  infoTipBox: {
    backgroundColor: "#F9FAFB",
    borderRadius: 10,
    padding: 14,
    borderLeftWidth: 3,
    borderLeftColor: TINT,
  },
  infoTipTitle: {
    fontSize: 13,
    fontWeight: "600",
    color: "#111827",
    marginBottom: 6,
  },
  infoTipText: {
    fontSize: 14,
    lineHeight: 20,
    color: "#6B7280",
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

  // Performance Section
  performanceCard: {
    backgroundColor: "#F9FAFB",
    borderRadius: 12,
    padding: 16,
  },
  performanceRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  performanceItem: {
    flex: 1,
    alignItems: "center",
  },
  performanceIconRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  performanceValue: {
    fontSize: 18,
    fontWeight: "700",
    color: "#111827",
  },
  performanceLabel: {
    fontSize: 12,
    color: "#6B7280",
    marginTop: 2,
  },
  performanceDivider: {
    width: 1,
    height: 32,
    backgroundColor: "#E5E7EB",
  },
  performanceFooter: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "#E5E7EB",
    alignItems: "center",
  },
  performanceMessage: {
    fontSize: 13,
    color: "#6B7280",
  },

  // Today Section
  appointmentsList: {
    gap: 10,
  },
  appointmentCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  appointmentHeader: {
    marginBottom: 6,
  },
  appointmentTimeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  appointmentTime: {
    fontSize: 14,
    fontWeight: "600",
    color: TINT,
  },
  appointmentTitle: {
    fontSize: 15,
    fontWeight: "500",
    color: "#111827",
    marginBottom: 2,
  },
  appointmentMeta: {
    fontSize: 13,
    color: "#6B7280",
    marginBottom: 12,
  },
  appointmentActions: {
    flexDirection: "row",
    gap: 10,
  },
  appointmentActionBtn: {
    flex: 1,
    backgroundColor: "#F3F4F6",
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: "center",
  },
  appointmentActionText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#111827",
  },
  tomorrowDivider: {
    marginVertical: 16,
  },
  dividerLine: {
    height: 1,
    backgroundColor: "#E5E7EB",
  },
  tomorrowLabel: {
    fontSize: 14,
    fontWeight: "500",
    color: "#6B7280",
    marginBottom: 10,
  },

  // Empty State Card
  emptyStateCard: {
    backgroundColor: "#F9FAFB",
    borderRadius: 12,
    padding: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyStateText: {
    fontSize: 14,
    color: "#6B7280",
    textAlign: "center",
  },

  // Pipeline Section
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

  // Action Items (Needs Attention)
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
    fontSize: 12,
    fontWeight: "600",
    color: "#6B7280",
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
