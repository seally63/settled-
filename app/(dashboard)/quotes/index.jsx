// app/(dashboard)/quotes/index.jsx - Tradesman Projects (Quotes + Sales combined)
import { useCallback, useEffect, useState, useMemo } from "react";
import {
  StyleSheet,
  View,
  ScrollView,
  Pressable,
  RefreshControl,
  ActivityIndicator,
} from "react-native";
import { useRouter } from "expo-router";
import { useFocusEffect } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import ThemedView from "../../../components/ThemedView";
import ThemedText from "../../../components/ThemedText";
import Spacer from "../../../components/Spacer";
import { Colors } from "../../../constants/Colors";
import { useUser } from "../../../hooks/useUser";
import { supabase } from "../../../lib/supabase";

// Helper to get privacy-aware client display name
// Before quote accepted: "Sarah L." (first name + last initial)
// After quote accepted: "Sarah Thompson" (full name)
function getClientDisplayName(fullName, contactUnlocked) {
  if (!fullName) return null;
  if (contactUnlocked) return fullName;

  // Privacy mode: first name + last initial
  const parts = String(fullName).trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return null;
  if (parts.length === 1) return parts[0];
  return `${parts[0]} ${parts[parts.length - 1].charAt(0)}.`;
}

// Format number with thousand separators (commas)
function formatNumber(num) {
  if (num == null || isNaN(num)) return "0.00";
  return Number(num).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// Format title: "Service, Category" -> "Category, Service"
// Sometimes the title already contains "in POSTCODE" - we need to strip it first
function formatTitle(suggestedTitle) {
  if (!suggestedTitle) return "Project";

  // Strip any existing "in POSTCODE" from the title to avoid duplication
  // Postcode pattern: UK postcodes like "EH48 3NN", "SW1A 1AA", etc.
  let cleanTitle = suggestedTitle.replace(/\s+in\s+[A-Z]{1,2}\d{1,2}[A-Z]?\s*\d[A-Z]{2}/gi, '').trim();

  const parts = cleanTitle.split(",").map(s => s.trim()).filter(s => s.length > 0);
  if (parts.length >= 2) {
    return `${parts[1]}, ${parts[0]}`;
  }
  return cleanTitle;
}

// Chip color categories based on action context
// ACTION NEEDED (Orange #F59E0B): Send Quote, New Quote, Expires Soon, Confirm Completion
// WAITING (Blue #3B82F6): Request Sent, Quote Sent, Quote Pending, Awaiting Schedule
// ACTIVE/GOOD (Green #10B981): Quote Accepted, Scheduled, On Site, Work in Progress
// COMPLETED (Gray #6B7280): Completed
// NEGATIVE (Red #EF4444): Declined, Expired, No Response
const CHIP_TONES = {
  action: { bg: "#FEF3C7", fg: "#F59E0B", icon: "alert-circle" },
  waiting: { bg: "#DBEAFE", fg: "#3B82F6", icon: "hourglass" },
  active: { bg: "#D1FAE5", fg: "#10B981", icon: "checkmark-circle" },
  completed: { bg: "#F3F4F6", fg: "#6B7280", icon: "checkmark-done" },
  negative: { bg: "#FEE2E2", fg: "#EF4444", icon: "close-circle" },
};

/* Status Chip component - takes label and tone */
function StatusChip({ label, tone = "waiting", icon }) {
  const colors = CHIP_TONES[tone] || CHIP_TONES.waiting;
  const chipIcon = icon || colors.icon;

  return (
    <View style={[styles.statusChip, { backgroundColor: colors.bg }]}>
      <Ionicons name={chipIcon} size={14} color={colors.fg} />
      <ThemedText style={[styles.statusChipText, { color: colors.fg }]}>
        {label}
      </ThemedText>
    </View>
  );
}

const TINT = Colors?.light?.tint || "#6849a7";

/* Tab button */
function TabBtn({ active, label, count, onPress }) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={10}
      style={[
        styles.tabBtn,
        active && styles.tabBtnActive,
      ]}
    >
      <ThemedText
        style={[
          styles.tabLabel,
          active && styles.tabLabelActive,
        ]}
      >
        {label}
        {typeof count === "number" ? ` (${count})` : ""}
      </ThemedText>
    </Pressable>
  );
}

/* Info row component */
function InfoRow({ icon, text, color }) {
  return (
    <View style={styles.infoRow}>
      <Ionicons name={icon} size={14} color={color || "#6B7280"} />
      <ThemedText style={[styles.infoText, color && { color }]}>{text}</ThemedText>
    </View>
  );
}

/* Warning/Alert row */
function AlertRow({ icon, text, type = "warning" }) {
  const colors = {
    warning: { bg: "#FEF3C7", fg: "#F59E0B" },
    danger: { bg: "#FEE2E2", fg: "#EF4444" },
    info: { bg: "#DBEAFE", fg: "#3B82F6" },
  };
  const c = colors[type] || colors.warning;

  return (
    <View style={[styles.alertRow, { backgroundColor: c.bg }]}>
      <Ionicons name={icon} size={14} color={c.fg} />
      <ThemedText style={[styles.alertText, { color: c.fg }]}>{text}</ThemedText>
    </View>
  );
}

export default function TradesmanProjects() {
  const router = useRouter();
  const { user } = useUser();
  const insets = useSafeAreaInsets();

  const [activeTab, setActiveTab] = useState("active"); // active | completed | invoices
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Data
  const [inboxRows, setInboxRows] = useState([]);
  const [sentRows, setSentRows] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [appointments, setAppointments] = useState([]);

  // Helper functions
  const daysSince = (date) => {
    if (!date) return 0;
    const diff = new Date() - new Date(date);
    return Math.floor(diff / (1000 * 60 * 60 * 24));
  };

  const daysUntil = (date) => {
    if (!date) return 0;
    const diff = new Date(date) - new Date();
    return Math.floor(diff / (1000 * 60 * 60 * 24));
  };

  const load = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);

    try {
      const myId = user.id;

      // Fetch request targets (inbox)
      const { data: targets, error: tErr } = await supabase
        .from("request_targets")
        .select("request_id, state, invited_by, created_at, trade_id")
        .eq("trade_id", myId)
        .order("created_at", { ascending: false });
      if (tErr) throw tErr;

      // Fetch quotes with valid_until for expiration tracking
      const { data: quotes, error: qErr } = await supabase
        .from("tradify_native_app_db")
        .select("id, request_id, client_id, status, issued_at, created_at, details, currency, grand_total, tax_total, valid_until")
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

      // Fetch request docs first (we need requester_id for client names)
      let reqById = {};
      if (reqIds.length) {
        const { data: reqs } = await supabase
          .from("quote_requests")
          .select("id, details, created_at, status, postcode, budget_band, suggested_title, requester_id")
          .in("id", reqIds);
        (reqs || []).forEach((r) => (reqById[r.id] = r));
      }

      // Fetch client names using rpc_list_conversations (which has proper RLS permissions)
      // This RPC returns other_party_name for each request_id
      let clientNameByRequestId = {};
      let clientContactByRequestId = {};
      const { data: convData } = await supabase.rpc("rpc_list_conversations", { p_limit: 100 });
      if (convData) {
        convData.forEach((conv) => {
          if (conv.request_id && conv.other_party_name) {
            clientNameByRequestId[conv.request_id] = conv.other_party_name;
          }
        });
      }

      // Fetch client contact visibility info for each request using new RPC
      // This returns privacy-aware contact info based on quote acceptance status
      for (const reqId of reqIds) {
        try {
          const { data: contactData } = await supabase.rpc("rpc_get_client_contact_for_request", {
            p_request_id: reqId,
          });
          if (contactData) {
            clientContactByRequestId[reqId] = contactData;
          }
        } catch {
          // Silently fail - will fallback to conversation data
        }
      }

      // Fetch appointments for these quotes
      const quoteIds = (quotes || []).map((q) => q.id);
      let appointmentsByQuote = {};
      let appointmentsByRequest = {};

      // Fetch all appointments using RPC (bypasses RLS issues)
      const { data: apptData } = await supabase.rpc("rpc_trade_list_appointments", {
        p_only_upcoming: false,
      });

      (apptData || []).forEach((a) => {
        // Normalize field names from RPC (appointment_id -> id)
        const normalized = {
          id: a.appointment_id || a.id,
          quote_id: a.quote_id,
          request_id: a.request_id,
          scheduled_at: a.scheduled_at,
          title: a.title || a.project_title,
          status: a.status,
          location: a.postcode || a.job_outcode,
        };

        // Index by quote_id if available
        if (normalized.quote_id) {
          if (!appointmentsByQuote[normalized.quote_id]) appointmentsByQuote[normalized.quote_id] = [];
          appointmentsByQuote[normalized.quote_id].push(normalized);
        }
        // Also index by request_id for inbox items
        if (normalized.request_id) {
          if (!appointmentsByRequest[normalized.request_id]) appointmentsByRequest[normalized.request_id] = [];
          appointmentsByRequest[normalized.request_id].push(normalized);
        }
      });
      setAppointments(apptData || []);

      // INBOX (no quote created yet)
      const inbox = (targets || [])
        .filter((t) => !quotedReqIds.has(t.request_id))
        .map((t) => {
          const r = reqById[t.request_id];
          const requestAge = daysSince(t.created_at);
          const isUrgent = requestAge >= 2 && t.state !== "accepted" && t.state !== "declined";

          // Get client contact info (privacy-aware)
          const contactInfo = clientContactByRequestId[t.request_id] || {};
          const clientFullName = contactInfo.name || clientNameByRequestId[t.request_id] || null;
          const contactUnlocked = contactInfo.contact_unlocked || false;

          // Get appointments for this request (survey appointments before quote exists)
          const requestAppointments = appointmentsByRequest[t.request_id] || [];
          const now = new Date();
          const upcomingAppointments = requestAppointments
            .filter((a) => new Date(a.scheduled_at) > now)
            .sort((a, b) => new Date(a.scheduled_at) - new Date(b.scheduled_at));
          const nextAppointment = upcomingAppointments[0] || null;
          const additionalAppointmentsCount = upcomingAppointments.length > 1 ? upcomingAppointments.length - 1 : 0;

          return {
            request_id: t.request_id,
            invited_at: t.created_at,
            request_type: t.invited_by || "system",
            state: t.state,
            title: r?.suggested_title || extractTitle(r),
            created_at: r?.created_at,
            budget_band: r?.budget_band || null,
            postcode: r?.postcode || null,
            requestAge,
            isUrgent,
            // Calculate response deadline (e.g., 3 days to respond)
            responseDeadline: 3 - requestAge,
            // Client contact info (privacy-aware)
            clientFullName,
            clientName: getClientDisplayName(clientFullName, contactUnlocked),
            clientPostcode: contactInfo.postcode || r?.postcode || null,
            contactUnlocked,
            // Appointment info (for surveys before quote)
            nextAppointment,
            hasAppointments: requestAppointments.length > 0,
            additionalAppointmentsCount,
          };
        });

      // SENT (quote exists) - Group quotes by request_id for multi-quote display
      // First, group quotes by request_id
      const quotesByRequest = {};
      (quotes || []).forEach((q) => {
        if (!quotesByRequest[q.request_id]) {
          quotesByRequest[q.request_id] = [];
        }
        quotesByRequest[q.request_id].push(q);
      });

      // Now create a single project per request with all its quotes
      const sent = Object.entries(quotesByRequest).map(([requestId, requestQuotes]) => {
        const r = reqById[requestId];
        const t = (targets || []).find(
          (tt) => tt.request_id === requestId && tt.trade_id === myId
        );

        // Sort quotes: drafts first (need action), then by date
        requestQuotes.sort((a, b) => {
          const aStatus = (a.status || "").toLowerCase();
          const bStatus = (b.status || "").toLowerCase();
          // Priority order for chip: draft > sent > accepted > declined/expired
          const priorityOrder = { draft: 0, sent: 1, created: 1, accepted: 2, declined: 3, expired: 3 };
          const aPriority = priorityOrder[aStatus] ?? 2;
          const bPriority = priorityOrder[bStatus] ?? 2;
          if (aPriority !== bPriority) return aPriority - bPriority;
          // Same priority - sort by date (newest first)
          return new Date(b.created_at) - new Date(a.created_at);
        });

        // Use the most actionable quote for status calculations
        const primaryQuote = requestQuotes[0];
        const primaryStatus = (primaryQuote.status || "").toLowerCase();

        // Calculate expiration info from primary quote
        const issuedAt = primaryQuote.issued_at ? new Date(primaryQuote.issued_at) : null;
        const validUntil = primaryQuote.valid_until ? new Date(primaryQuote.valid_until) : null;
        const daysToExpiry = validUntil ? daysUntil(validUntil) : (issuedAt ? 14 - daysSince(issuedAt) : null);
        const isExpiringSoon = daysToExpiry !== null && daysToExpiry <= 3 && daysToExpiry > 0;
        const isExpired = daysToExpiry !== null && daysToExpiry <= 0;

        // Client response tracking
        const daysSinceIssued = issuedAt ? daysSince(issuedAt) : 0;
        const clientNotResponding = primaryStatus === "sent" && daysSinceIssued >= 7;

        // Get appointments for all quotes in this request
        const allQuoteAppointments = requestQuotes.flatMap(q => appointmentsByQuote[q.id] || []);
        const requestAppointments = appointmentsByRequest[requestId] || [];
        const allAppointments = allQuoteAppointments.length > 0 ? allQuoteAppointments : requestAppointments;
        const now = new Date();
        const upcomingAppointments = allAppointments
          .filter((a) => new Date(a.scheduled_at) > now)
          .sort((a, b) => new Date(a.scheduled_at) - new Date(b.scheduled_at));
        const nextAppointment = upcomingAppointments[0] || null;
        const additionalAppointmentsCount = upcomingAppointments.length > 1 ? upcomingAppointments.length - 1 : 0;

        // Get client contact info (privacy-aware)
        const contactInfo = clientContactByRequestId[requestId] || {};
        const clientFullName = contactInfo.name || clientNameByRequestId[requestId] || null;
        // Contact is unlocked when any quote is accepted
        const hasAcceptedQuote = requestQuotes.some(q => (q.status || "").toLowerCase() === "accepted");
        const contactUnlocked = contactInfo.contact_unlocked || hasAcceptedQuote;

        // Calculate price range if multiple quotes
        const quoteTotals = requestQuotes
          .filter(q => q.grand_total != null)
          .map(q => q.grand_total);
        const minPrice = quoteTotals.length > 0 ? Math.min(...quoteTotals) : null;
        const maxPrice = quoteTotals.length > 0 ? Math.max(...quoteTotals) : null;
        const hasPriceRange = quoteTotals.length > 1 && minPrice !== maxPrice;

        return {
          id: primaryQuote.id,
          request_id: requestId,
          status: primaryStatus,
          issued_at: primaryQuote.issued_at ?? primaryQuote.created_at,
          valid_until: primaryQuote.valid_until,
          title: r?.suggested_title || extractTitle(r),
          request_type: t?.invited_by || "system",
          budget_band: r?.budget_band || null,
          postcode: r?.postcode || null,
          acceptedByTrade: t?.state === "accepted",
          currency: primaryQuote.currency,
          grand_total: primaryQuote.grand_total,
          tax_total: primaryQuote.tax_total,
          // Multi-quote info
          quotes: requestQuotes,
          quoteCount: requestQuotes.length,
          minPrice,
          maxPrice,
          hasPriceRange,
          hasAcceptedQuote,
          // Client contact info (privacy-aware)
          clientFullName,
          clientName: getClientDisplayName(clientFullName, contactUnlocked),
          clientPostcode: contactInfo.postcode || r?.postcode || null,
          contactUnlocked,
          // Expiration info
          daysToExpiry,
          isExpiringSoon,
          isExpired: isExpired && primaryStatus !== "expired",
          // Client response tracking
          daysSinceIssued,
          clientNotResponding,
          // Appointment info
          nextAppointment,
          hasAppointments: allAppointments.length > 0,
          additionalAppointmentsCount,
        };
      });

      setInboxRows(inbox);
      setSentRows(sent);

      // Fetch invoices from sales view
      const { data: invoiceData } = await supabase
        .from("v_trades_sales")
        .select("*")
        .eq("kind", "invoice")
        .order("issued_at", { ascending: false });
      setInvoices(invoiceData || []);
    } catch (e) {
      console.error("Load error:", e);
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  // Refresh data when screen gains focus (e.g., returning from schedule page)
  useFocusEffect(
    useCallback(() => {
      if (user?.id) {
        load();
      }
    }, [user?.id, load])
  );

  useEffect(() => {
    if (!user?.id) return;

    // Initial fetch
    load();

    // Realtime subscriptions for quotes table
    const quotesChannel = supabase
      .channel("trades-quotes-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "tradify_native_app_db" },
        (payload) => {
          console.log("[TRADES REALTIME] Quote change:", payload);
          load();
        }
      )
      .subscribe();

    // Realtime subscriptions for appointments table
    const appointmentsChannel = supabase
      .channel("trades-appointments-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "appointments" },
        (payload) => {
          console.log("[TRADES REALTIME] Appointment change:", payload);
          load();
        }
      )
      .subscribe();

    // Realtime subscriptions for request_targets table (for inbox updates)
    const targetsChannel = supabase
      .channel("trades-targets-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "request_targets" },
        (payload) => {
          console.log("[TRADES REALTIME] Target change:", payload);
          load();
        }
      )
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

  // Categorize projects
  const categorizedProjects = useMemo(() => {
    const needsAction = [];
    const activeQuotes = [];
    const completed = [];

    // Process inbox items (requests without quotes)
    inboxRows.forEach((item) => {
      if (item.state === "declined") {
        // Declined by trade - don't show
        return;
      }
      needsAction.push({
        ...item,
        type: "inbox",
        displayStatus: item.state === "accepted" ? "accepted" : "new",
      });
    });

    // Process sent quotes
    sentRows.forEach((item) => {
      const status = item.status?.toLowerCase() || "";

      if (status === "accepted") {
        // Accepted by client - active job
        activeQuotes.push({
          ...item,
          type: "quote",
          displayStatus: item.nextAppointment ? "scheduled" : "in_progress",
        });
      } else if (status === "sent") {
        // Waiting for client response
        if (item.clientNotResponding) {
          needsAction.push({
            ...item,
            type: "quote",
            displayStatus: "awaiting",
          });
        } else {
          activeQuotes.push({
            ...item,
            type: "quote",
            displayStatus: "sent",
          });
        }
      } else if (status === "declined" || status === "expired") {
        completed.push({
          ...item,
          type: "quote",
          displayStatus: status,
        });
      } else if (status === "completed") {
        completed.push({
          ...item,
          type: "quote",
          displayStatus: "completed",
        });
      } else {
        // Draft or other
        activeQuotes.push({
          ...item,
          type: "quote",
          displayStatus: "pending",
        });
      }
    });

    return { needsAction, activeQuotes, completed };
  }, [inboxRows, sentRows]);

  const activeCount = categorizedProjects.needsAction.length + categorizedProjects.activeQuotes.length;
  const completedCount = categorizedProjects.completed.length;

  if (loading) {
    return (
      <ThemedView style={styles.container}>
        <View style={styles.center}>
          <ActivityIndicator size="large" color={TINT} />
        </View>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      {/* Header - Profile style */}
      <View style={[styles.header, { paddingTop: insets.top + 16 }]}>
        <ThemedText style={styles.headerTitle}>Projects</ThemedText>
      </View>

      {/* Tabs */}
      <View style={styles.tabsRow}>
        <TabBtn
          active={activeTab === "active"}
          label="Active"
          count={activeCount}
          onPress={() => setActiveTab("active")}
        />
        <TabBtn
          active={activeTab === "completed"}
          label="Completed"
          count={completedCount}
          onPress={() => setActiveTab("completed")}
        />
        <TabBtn
          active={activeTab === "invoices"}
          label="Invoices"
          count={invoices.length}
          onPress={() => setActiveTab("invoices")}
        />
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        showsVerticalScrollIndicator={false}
      >
        {activeTab === "active" && (
          <ActiveProjectsSection
            needsAction={categorizedProjects.needsAction}
            activeQuotes={categorizedProjects.activeQuotes}
            router={router}
          />
        )}
        {activeTab === "completed" && (
          <CompletedProjects data={categorizedProjects.completed} router={router} />
        )}
        {activeTab === "invoices" && <Invoices data={invoices} router={router} />}
      </ScrollView>
    </ThemedView>
  );
}

/* Helper to extract title from request */
function extractTitle(req) {
  if (!req) return "Project";
  const lines = String(req.details || "").split("\n");
  return lines[0] || "Project";
}

/* Section header component */
function SectionHeader({ title, icon, count }) {
  return (
    <View style={styles.sectionHeader}>
      <Ionicons name={icon} size={18} color="#111827" />
      <ThemedText style={styles.sectionTitle}>
        {title} {typeof count === "number" ? `(${count})` : ""}
      </ThemedText>
    </View>
  );
}

/* Helper to calculate days since a date */
function daysSince(date) {
  if (!date) return 0;
  const diff = new Date() - new Date(date);
  return Math.floor(diff / (1000 * 60 * 60 * 24));
}

/* Project Card Component - Notion/Airbnb style */
function ProjectCard({ project, onPress, onAction, onMessage, router }) {
  const isInbox = project.type === "inbox";
  const displayStatus = project.displayStatus || "pending";
  const hasAppointment = !!project.nextAppointment;
  const hasMultipleQuotes = (project.quoteCount || 0) > 1;

  // Show action buttons for: quotes (sent/active/scheduled), OR inbox items with appointments
  // For multiple quotes, always show "View Details" button
  const showActionButtons = (!isInbox && (displayStatus === "in_progress" || displayStatus === "scheduled" || displayStatus === "sent" || displayStatus === "awaiting" || hasMultipleQuotes)) ||
                           (isInbox && hasAppointment);

  // Determine chip label and tone based on context for TRADES view
  // For multiple quotes, show the most actionable status
  let chipLabel = "";
  let chipTone = "waiting";
  let chipIcon = null;

  if (isInbox) {
    // No quote sent yet - inbox items
    if (project.state === "declined") {
      chipLabel = "Declined";
      chipTone = "negative";
    } else {
      // Check for appointments on inbox items (surveys before quote)
      const apptStatus = project.nextAppointment?.status?.toLowerCase();
      if (apptStatus === "proposed") {
        // Appointment proposed, waiting for client confirmation
        chipLabel = "Visit Pending";
        chipTone = "action";
        chipIcon = "hourglass";
      } else if (apptStatus === "confirmed") {
        // Appointment confirmed by client
        chipLabel = "Scheduled";
        chipTone = "active";
        chipIcon = "calendar";
      } else {
        // No appointment yet - show based on request age
        const daysOld = daysSince(project.invited_at || project.created_at);
        if (daysOld === 0) {
          chipLabel = "New Request";
          chipTone = "waiting";
          chipIcon = "sparkles";
        } else {
          chipLabel = "Send Quote";
          chipTone = "action";
        }
      }
    }
  } else {
    // Quote exists - determine based on status
    // For multiple quotes, use priority: Draft > Sent > Accepted > Declined/Expired
    const status = (project.status || displayStatus || "").toLowerCase();
    const daysOld = daysSince(project.issued_at);

    // Check if there's an accepted quote (highest priority for display)
    if (project.hasAcceptedQuote) {
      // Check appointment status for accepted quotes
      const apptStatus = project.nextAppointment?.status?.toLowerCase();
      if (apptStatus === "proposed") {
        chipLabel = "Visit Pending";
        chipTone = "action";
        chipIcon = "hourglass";
      } else if (apptStatus === "confirmed") {
        chipLabel = "Scheduled";
        chipTone = "active";
        chipIcon = "calendar";
      } else {
        chipLabel = "Accepted";
        chipTone = "active";
      }
    } else if (status === "draft") {
      chipLabel = "Draft";
      chipTone = "action";
      chipIcon = "create-outline";
    } else if (status === "sent" || status === "created" || status === "awaiting") {
      // Quote sent, waiting for client response
      if (daysOld >= 7) {
        chipLabel = "No Response";
        chipTone = "negative";
      } else {
        chipLabel = "Sent";
        chipTone = "waiting";
        chipIcon = "send";
      }
    } else if (status === "accepted" || status === "in_progress" || status === "scheduled") {
      // Check appointment status for accepted quotes
      const apptStatus = project.nextAppointment?.status?.toLowerCase();
      if (apptStatus === "proposed") {
        chipLabel = "Visit Pending";
        chipTone = "action";
        chipIcon = "hourglass";
      } else if (apptStatus === "confirmed") {
        chipLabel = "Scheduled";
        chipTone = "active";
        chipIcon = "calendar";
      } else {
        chipLabel = "Accepted";
        chipTone = "active";
      }
    } else if (status === "declined") {
      chipLabel = "Declined";
      chipTone = "negative";
    } else if (status === "expired") {
      chipLabel = "Expired";
      chipTone = "negative";
      chipIcon = "time";
    } else if (status === "completed") {
      chipLabel = "Completed";
      chipTone = "completed";
    } else {
      chipLabel = "Sent";
      chipTone = "waiting";
    }
  }

  // Format title: just the service/category without location
  const formattedTitle = formatTitle(project.title);

  // Build subtitle: "ClientName • Postcode" (privacy-aware)
  const clientDisplayName = project.clientName || null;
  const displayPostcode = project.clientPostcode || project.postcode || null;
  let subtitleParts = [];
  if (clientDisplayName) subtitleParts.push(clientDisplayName);
  if (displayPostcode) subtitleParts.push(displayPostcode);
  const subtitleText = subtitleParts.join(" • ");

  return (
    <Pressable style={styles.projectCard} onPress={onPress}>
      {/* Header */}
      <View style={styles.cardHeader}>
        <View style={{ flex: 1 }}>
          <ThemedText style={styles.cardTitle} numberOfLines={2}>
            {formattedTitle}
          </ThemedText>
          {subtitleText ? (
            <ThemedText style={styles.cardSubtitle}>
              {subtitleText}
            </ThemedText>
          ) : null}
        </View>
        <StatusChip label={chipLabel} tone={chipTone} icon={chipIcon} />
      </View>

      <Spacer height={12} />

      {/* Content */}
      <View style={styles.cardContent}>
        {/* Meta info row */}
        <View style={styles.metaRow}>
          {project.request_type && (
            <InfoRow
              icon={project.request_type === "client" ? "person" : "globe"}
              text={project.request_type === "client" ? "Direct request" : "Open request"}
            />
          )}
        </View>

        {/* Quote summary for sent quotes */}
        {!isInbox && (
          <>
            {/* Multiple quotes summary */}
            {hasMultipleQuotes ? (
              <View style={styles.quoteSummaryBox}>
                <View style={styles.quoteSummaryHeader}>
                  <Ionicons name="document-text-outline" size={16} color="#6B7280" />
                  <ThemedText style={styles.quoteSummaryLabel}>
                    {project.quoteCount} quotes {project.status === "draft" ? "drafted" : "sent"}
                  </ThemedText>
                </View>
                {project.minPrice != null && (
                  <ThemedText style={styles.quoteSummaryAmount}>
                    {project.hasPriceRange
                      ? `£${formatNumber(project.minPrice)} - £${formatNumber(project.maxPrice)}`
                      : `£${formatNumber(project.minPrice)}`}
                  </ThemedText>
                )}
              </View>
            ) : project.grand_total != null ? (
              /* Single quote - show exact amount */
              <View style={styles.amountRow}>
                <ThemedText style={styles.amountLabel}>Quote total</ThemedText>
                <ThemedText style={styles.amountValue}>
                  £{formatNumber(project.grand_total)}
                </ThemedText>
              </View>
            ) : null}
          </>
        )}

        {/* Appointment info for quotes and inbox items */}
        {project.nextAppointment && (
          <View style={styles.appointmentInfo}>
            <Ionicons
              name="calendar"
              size={14}
              color={project.nextAppointment.status === "confirmed" ? TINT : "#6B7280"}
            />
            <ThemedText style={[
              styles.infoText,
              {
                color: project.nextAppointment.status === "confirmed" ? TINT : "#6B7280",
                fontWeight: "600"
              }
            ]}>
              {project.nextAppointment.title ? `${project.nextAppointment.title}: ` : (project.nextAppointment.status === "proposed" ? "Proposed: " : "Survey: ")}
              {new Date(project.nextAppointment.scheduled_at).toLocaleDateString(undefined, {
                weekday: "short",
                day: "numeric",
                month: "short",
              })}
              {project.nextAppointment.status === "confirmed" && (
                `, ${new Date(project.nextAppointment.scheduled_at).toLocaleTimeString(undefined, {
                  hour: "2-digit",
                  minute: "2-digit",
                })}`
              )}
            </ThemedText>
          </View>
        )}

        {/* Additional appointments hint */}
        {project.additionalAppointmentsCount > 0 && (
          <ThemedText style={styles.additionalAppointmentsHint}>
            +{project.additionalAppointmentsCount} more visit{project.additionalAppointmentsCount !== 1 ? 's' : ''} scheduled
          </ThemedText>
        )}

        {/* Alerts/Warnings */}
        {/* Response deadline for inbox items */}
        {isInbox && project.isUrgent && project.responseDeadline !== undefined && (
          <AlertRow
            icon="alert-circle"
            text={project.responseDeadline <= 0
              ? "Response overdue"
              : `Respond within ${project.responseDeadline} day${project.responseDeadline !== 1 ? 's' : ''}`}
            type={project.responseDeadline <= 0 ? "danger" : "warning"}
          />
        )}

        {/* Client not responding warning */}
        {!isInbox && project.clientNotResponding && (
          <AlertRow
            icon="hourglass"
            text={`Client hasn't responded (${project.daysSinceIssued} days)`}
            type="warning"
          />
        )}

        {/* Expiring soon warning */}
        {!isInbox && project.isExpiringSoon && (
          <AlertRow
            icon="time"
            text={`Quote expires in ${project.daysToExpiry} day${project.daysToExpiry !== 1 ? 's' : ''}`}
            type="warning"
          />
        )}

        {/* Quote age/meta info */}
        {!isInbox && project.issued_at && (
          <ThemedText style={styles.metaText}>
            Sent {new Date(project.issued_at).toLocaleDateString(undefined, {
              month: "short",
              day: "numeric",
            })}
          </ThemedText>
        )}

        {isInbox && project.invited_at && (
          <ThemedText style={styles.metaText}>
            Received {new Date(project.invited_at).toLocaleDateString(undefined, {
              month: "short",
              day: "numeric",
            })}
          </ThemedText>
        )}
      </View>

      {/* Action button for inbox items ready to quote */}
      {isInbox && project.state === "accepted" && (
        <>
          <Spacer height={12} />
          <Pressable
            style={styles.primaryActionBtn}
            onPress={(e) => {
              e.stopPropagation();
              onAction?.();
            }}
          >
            <Ionicons name="create-outline" size={16} color="#FFF" />
            <ThemedText style={styles.primaryActionText}>Create Quote</ThemedText>
            <Ionicons name="arrow-forward" size={16} color="#FFF" />
          </Pressable>
        </>
      )}

      {/* Action buttons for draft quotes: Message icon + View Details + Edit Quote */}
      {/* For multiple quotes, show View Details only (user goes to request page to see all) */}
      {!isInbox && displayStatus === "pending" && project.status === "draft" && !hasMultipleQuotes && (
        <>
          <Spacer height={12} />
          <View style={styles.cardActionsThree}>
            {/* Message icon button */}
            <Pressable
              style={styles.actionBtnIcon}
              onPress={(e) => {
                e.stopPropagation();
                if (project.request_id && router) {
                  router.push({
                    pathname: "/(dashboard)/messages/[id]",
                    params: {
                      id: String(project.request_id),
                      name: project.clientName || "",
                      quoteId: project.id ? String(project.id) : "",
                      returnTo: "/quotes",
                    },
                  });
                }
              }}
            >
              <Ionicons name="chatbubble-outline" size={18} color="#374151" />
            </Pressable>
            {/* View Details button - goes to Client Request page */}
            <Pressable
              style={[styles.actionBtn, styles.actionBtnSecondary, { flex: 1 }]}
              onPress={(e) => {
                e.stopPropagation();
                if (router && project.request_id) {
                  router.push(`/quotes/request/${project.request_id}`);
                }
              }}
            >
              <ThemedText style={styles.actionBtnTextSecondary}>View Details</ThemedText>
            </Pressable>
            {/* Edit Quote button - goes directly to draft editor */}
            <Pressable
              style={[styles.actionBtn, styles.actionBtnPrimary, { flex: 1 }]}
              onPress={(e) => {
                e.stopPropagation();
                if (router && project.id) {
                  router.push({
                    pathname: "/quotes/create",
                    params: {
                      quoteId: project.id,
                      requestId: project.request_id || "",
                    },
                  });
                }
              }}
            >
              <ThemedText style={styles.actionBtnTextPrimary}>Edit Quote</ThemedText>
            </Pressable>
          </View>
        </>
      )}

      {/* Multiple quotes - always show Message + View Details */}
      {!isInbox && hasMultipleQuotes && (
        <>
          <Spacer height={12} />
          <View style={styles.cardActions}>
            <Pressable
              style={[styles.actionBtn, styles.actionBtnSecondary]}
              onPress={(e) => {
                e.stopPropagation();
                if (project.request_id && router) {
                  router.push({
                    pathname: "/(dashboard)/messages/[id]",
                    params: {
                      id: String(project.request_id),
                      name: project.clientName || "",
                      quoteId: project.id ? String(project.id) : "",
                      returnTo: "/quotes",
                    },
                  });
                }
              }}
            >
              <ThemedText style={styles.actionBtnTextSecondary}>Message</ThemedText>
            </Pressable>
            <Pressable
              style={[styles.actionBtn, styles.actionBtnPrimary]}
              onPress={(e) => {
                e.stopPropagation();
                router.push(`/quotes/request/${project.request_id}`);
              }}
            >
              <ThemedText style={styles.actionBtnTextPrimary}>View Details</ThemedText>
            </Pressable>
          </View>
        </>
      )}

      {/* Action buttons for sent/active quotes and inbox items with appointments (Message + View Details) */}
      {/* Skip if multiple quotes (already handled above) or if single draft (handled above) */}
      {showActionButtons && !hasMultipleQuotes && !(displayStatus === "pending" && project.status === "draft") && (
        <>
          <Spacer height={12} />
          <View style={styles.cardActions}>
            <Pressable
              style={[styles.actionBtn, styles.actionBtnSecondary]}
              onPress={(e) => {
                e.stopPropagation();
                if (project.request_id && router) {
                  router.push({
                    pathname: "/(dashboard)/messages/[id]",
                    params: {
                      id: String(project.request_id),
                      name: project.clientName || "",
                      quoteId: project.id ? String(project.id) : "",
                      returnTo: "/quotes",
                    },
                  });
                }
              }}
            >
              <ThemedText style={styles.actionBtnTextSecondary}>Message</ThemedText>
            </Pressable>
            <Pressable
              style={[styles.actionBtn, styles.actionBtnPrimary]}
              onPress={(e) => {
                e.stopPropagation();
                // Navigate to appropriate details page
                if (isInbox) {
                  // Inbox items go to request details
                  router.push(`/quotes/request/${project.request_id}`);
                } else if (project.id) {
                  // Quotes go to quote details
                  router.push(`/quotes/${project.id}`);
                }
              }}
            >
              <ThemedText style={styles.actionBtnTextPrimary}>View Details</ThemedText>
            </Pressable>
          </View>
        </>
      )}
    </Pressable>
  );
}

/* Active Projects Section with sub-categories */
function ActiveProjectsSection({ needsAction, activeQuotes, router }) {
  const hasAny = needsAction.length > 0 || activeQuotes.length > 0;

  if (!hasAny) {
    return (
      <View style={styles.emptyState}>
        <View style={styles.emptyIconContainer}>
          <Ionicons name="briefcase-outline" size={48} color="#9CA3AF" />
        </View>
        <ThemedText style={styles.emptyTitle}>No active projects</ThemedText>
        <ThemedText style={styles.emptySubtitle}>
          New quote requests will appear here
        </ThemedText>
      </View>
    );
  }

  return (
    <View>
      {/* Needs Action Section */}
      {needsAction.length > 0 && (
        <>
          <SectionHeader
            title="Needs attention"
            icon="alert-circle"
            count={needsAction.length}
          />
          <View style={{ gap: 12 }}>
            {needsAction.map((project) => (
              <ProjectCard
                key={project.id || project.request_id}
                project={project}
                router={router}
                onPress={() => {
                  // Always go to Client Request page (project.request_id)
                  router.push(`/quotes/request/${project.request_id}`);
                }}
                onAction={() => {
                  router.push({
                    pathname: "/quotes/create",
                    params: { requestId: project.request_id },
                  });
                }}
              />
            ))}
          </View>
          <Spacer height={24} />
        </>
      )}

      {/* Active Quotes Section */}
      {activeQuotes.length > 0 && (
        <>
          <SectionHeader
            title="Active"
            icon="construct"
            count={activeQuotes.length}
          />
          <View style={{ gap: 12 }}>
            {activeQuotes.map((project) => (
              <ProjectCard
                key={project.id || project.request_id}
                project={project}
                router={router}
                onPress={() => {
                  // Always go to Client Request page (project.request_id)
                  router.push(`/quotes/request/${project.request_id}`);
                }}
              />
            ))}
          </View>
        </>
      )}
    </View>
  );
}

/* Completed Projects List */
function CompletedProjects({ data, router }) {
  if (!data.length) {
    return (
      <View style={styles.emptyState}>
        <View style={styles.emptyIconContainer}>
          <Ionicons name="checkmark-circle-outline" size={48} color="#9CA3AF" />
        </View>
        <ThemedText style={styles.emptyTitle}>No completed projects</ThemedText>
        <ThemedText style={styles.emptySubtitle}>
          Completed quotes will appear here
        </ThemedText>
      </View>
    );
  }

  return (
    <View style={{ gap: 12 }}>
      {data.map((project) => (
        <ProjectCard
          key={project.id}
          project={project}
          router={router}
          onPress={() => {
            // Always go to Client Request page (project.request_id)
            router.push(`/quotes/request/${project.request_id}`);
          }}
        />
      ))}
    </View>
  );
}

/* Invoices List */
function Invoices({ data, router }) {
  if (!data.length) {
    return (
      <View style={styles.emptyState}>
        <View style={styles.emptyIconContainer}>
          <Ionicons name="receipt-outline" size={48} color="#9CA3AF" />
        </View>
        <ThemedText style={styles.emptyTitle}>No invoices</ThemedText>
        <ThemedText style={styles.emptySubtitle}>
          Create invoices for accepted projects
        </ThemedText>
      </View>
    );
  }

  // Invoice status colors
  const invoiceStatusColors = {
    paid: { bg: "#D1FAE5", fg: "#10B981", icon: "checkmark-circle" },
    overdue: { bg: "#FEE2E2", fg: "#EF4444", icon: "alert-circle" },
    unpaid: { bg: "#FEF3C7", fg: "#F59E0B", icon: "hourglass" },
  };

  return (
    <View style={{ gap: 12 }}>
      {data.map((invoice) => {
        const status = (invoice.status_norm || "").toLowerCase();
        const displayStatus = status === "paid" ? "paid" : status === "overdue" ? "overdue" : "unpaid";
        const colors = invoiceStatusColors[displayStatus];
        const chipLabel = status === "paid" ? "Paid" : status === "overdue" ? "Overdue" : "Unpaid";

        return (
          <Pressable
            key={invoice.id}
            style={styles.projectCard}
            onPress={() => router.push(`/sales/invoice/${invoice.id}`)}
          >
            <View style={styles.cardHeader}>
              <View style={{ flex: 1 }}>
                <ThemedText style={styles.cardTitle}>
                  Invoice #{invoice.invoice_number || String(invoice.id).slice(0, 8)}
                </ThemedText>
                {invoice.client_name && (
                  <ThemedText style={styles.cardSubtitle}>
                    {invoice.client_name}
                  </ThemedText>
                )}
              </View>
              <View style={[styles.statusChip, { backgroundColor: colors.bg }]}>
                <Ionicons name={colors.icon} size={14} color={colors.fg} />
                <ThemedText style={[styles.statusChipText, { color: colors.fg }]}>
                  {chipLabel}
                </ThemedText>
              </View>
            </View>

            <Spacer height={12} />

            <View style={styles.amountRow}>
              <ThemedText style={styles.amountLabel}>Amount</ThemedText>
              <ThemedText style={styles.amountValue}>
                {invoice.currency || "GBP"} {formatNumber(invoice.grand_total || 0)}
              </ThemedText>
            </View>

            {invoice.issued_at && (
              <ThemedText style={styles.metaText}>
                Issued {new Date(invoice.issued_at).toLocaleDateString(undefined, {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })}
              </ThemedText>
            )}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F9FAFB",
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },

  // Header - Profile style
  header: {
    paddingHorizontal: 20,
    paddingBottom: 12,
    backgroundColor: "#F9FAFB",
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: "700",
  },

  // Tabs
  tabsRow: {
    flexDirection: "row",
    gap: 12,
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 16,
  },
  tabBtn: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  tabBtnActive: {
    backgroundColor: TINT,
    borderColor: TINT,
  },
  tabLabel: {
    fontSize: 14,
    fontWeight: "500",
    color: "#6B7280",
  },
  tabLabelActive: {
    color: "#FFFFFF",
  },

  scrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 40,
  },

  // Section headers
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 12,
    marginTop: 8,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#111827",
  },

  // Project card - Notion/Airbnb style
  projectCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 12,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#111827",
    lineHeight: 22,
  },
  cardSubtitle: {
    fontSize: 14,
    color: "#6B7280",
    marginTop: 2,
  },
  cardContent: {
    gap: 8,
  },

  // Status chip
  statusChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 12,
  },
  statusChipText: {
    fontSize: 12,
    fontWeight: "600",
  },

  // Info rows
  metaRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  infoRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  infoText: {
    fontSize: 14,
    color: "#6B7280",
  },

  // Alert row
  alertRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
    marginTop: 4,
  },
  alertText: {
    fontSize: 13,
    fontWeight: "500",
  },

  // Amount row
  amountRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: "#F9FAFB",
    borderRadius: 8,
  },
  amountLabel: {
    fontSize: 13,
    color: "#6B7280",
    fontWeight: "500",
  },
  amountValue: {
    fontSize: 18,
    fontWeight: "700",
    color: "#111827",
  },

  // Quote summary box (for multiple quotes)
  quoteSummaryBox: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: "#F9FAFB",
    borderRadius: 8,
  },
  quoteSummaryHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  quoteSummaryLabel: {
    fontSize: 14,
    color: "#6B7280",
    fontWeight: "500",
  },
  quoteSummaryAmount: {
    fontSize: 18,
    fontWeight: "700",
    color: "#111827",
    marginTop: 4,
  },

  // Appointment info
  appointmentInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 4,
  },
  additionalAppointmentsHint: {
    fontSize: 13,
    color: "#6B7280",
    marginTop: 4,
    marginLeft: 20, // Align with appointment text
  },

  // Meta text
  metaText: {
    fontSize: 13,
    color: "#9CA3AF",
    marginTop: 4,
  },

  // Action buttons
  primaryActionBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: TINT,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 999,
  },
  primaryActionText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "600",
  },

  // Card action buttons (Message + View Details)
  cardActions: {
    flexDirection: "row",
    gap: 8,
  },
  // Card action buttons for 3-button layout (Message icon + View Details + Edit Quote)
  cardActionsThree: {
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
  },
  actionBtnIcon: {
    width: 40,
    height: 40,
    borderRadius: 999,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    alignItems: "center",
    justifyContent: "center",
  },
  actionBtn: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
  },
  actionBtnPrimary: {
    backgroundColor: TINT,
  },
  actionBtnSecondary: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  actionBtnTextPrimary: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "600",
  },
  actionBtnTextSecondary: {
    color: "#374151",
    fontSize: 14,
    fontWeight: "600",
  },

  // Empty state
  emptyState: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 60,
    paddingHorizontal: 40,
  },
  emptyIconContainer: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: "#F3F4F6",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#111827",
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 14,
    textAlign: "center",
    color: "#6B7280",
  },
});
