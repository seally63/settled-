// app/(dashboard)/client/myquotes/index.jsx
import {
  StyleSheet,
  View,
  Pressable,
  Alert,
  ScrollView,
  RefreshControl,
  Image,
} from "react-native";
import { useEffect, useState, useCallback, useMemo } from "react";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { supabase } from "../../../../lib/supabase";
import { useUser } from "../../../../hooks/useUser";

import ThemedView from "../../../../components/ThemedView";
import ThemedText from "../../../../components/ThemedText";
import ThemedButton from "../../../../components/ThemedButton";
import Spacer from "../../../../components/Spacer";
import { Colors } from "../../../../constants/Colors";

const TINT = Colors?.light?.tint || "#6849a7";

// Get initials from a name (e.g., "John Builder" -> "JB")
function getInitials(name) {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
}

// Avatar component with photo or initials fallback
function Avatar({ name, photoUrl, size = 40, style }) {
  const initials = getInitials(name);
  const colors = ["#6849a7", "#3B82F6", "#10B981", "#F59E0B", "#EF4444"];
  const colorIndex = name ? name.charCodeAt(0) % colors.length : 0;
  const bgColor = colors[colorIndex];

  if (photoUrl) {
    return (
      <Image
        source={{ uri: photoUrl }}
        style={[
          {
            width: size,
            height: size,
            borderRadius: size / 2,
            backgroundColor: "#E5E7EB",
          },
          style,
        ]}
      />
    );
  }

  return (
    <View
      style={[
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: bgColor,
          alignItems: "center",
          justifyContent: "center",
        },
        style,
      ]}
    >
      <ThemedText
        style={{
          color: "#FFFFFF",
          fontSize: size * 0.4,
          fontWeight: "700",
        }}
      >
        {initials}
      </ThemedText>
    </View>
  );
}

// Stacked avatars for multiple trades
// trades: array of { name, photoUrl }
function AvatarStack({ trades, size = 36, maxVisible = 3 }) {
  const visibleTrades = trades.slice(0, maxVisible);
  const overflow = trades.length - maxVisible;

  return (
    <View style={{ flexDirection: "row", alignItems: "center" }}>
      {visibleTrades.map((trade, idx) => (
        <Avatar
          key={idx}
          name={trade.name}
          photoUrl={trade.photoUrl}
          size={size}
          style={{
            marginLeft: idx > 0 ? -size * 0.3 : 0,
            borderWidth: 2,
            borderColor: "#FFFFFF",
            zIndex: visibleTrades.length - idx,
          }}
        />
      ))}
      {overflow > 0 && (
        <View
          style={{
            marginLeft: -size * 0.3,
            width: size,
            height: size,
            borderRadius: size / 2,
            backgroundColor: "#E5E7EB",
            alignItems: "center",
            justifyContent: "center",
            borderWidth: 2,
            borderColor: "#FFFFFF",
          }}
        >
          <ThemedText style={{ fontSize: size * 0.35, fontWeight: "600", color: "#6B7280" }}>
            +{overflow}
          </ThemedText>
        </View>
      )}
    </View>
  );
}

// Format number with thousand separators (commas)
function formatNumber(num) {
  if (num == null || isNaN(num)) return "0.00";
  return Number(num).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// Build tertiary text: "Category, Service in Postcode"
// suggested_title is usually "Service, Category" format
// Sometimes the title already contains "in POSTCODE" - we need to strip it first
function buildTertiaryText(suggestedTitle, postcode) {
  if (!suggestedTitle) return postcode ? `in ${postcode}` : null;

  // Strip any existing "in POSTCODE" from the title to avoid duplication
  // Postcode pattern: UK postcodes like "EH48 3NN", "SW1A 1AA", etc.
  let cleanTitle = suggestedTitle.replace(/\s+in\s+[A-Z]{1,2}\d{1,2}[A-Z]?\s*\d[A-Z]{2}/gi, '').trim();

  // Parse "Service, Category" -> "Category, Service"
  const parts = cleanTitle.split(",").map(s => s.trim()).filter(s => s.length > 0);
  let formatted;
  if (parts.length >= 2) {
    // Reverse: "Full Bathroom Refit, Bathroom" -> "Bathroom, Full Bathroom Refit"
    formatted = `${parts[1]}, ${parts[0]}`;
  } else {
    formatted = cleanTitle;
  }

  return postcode ? `${formatted} in ${postcode}` : formatted;
}

// Status badge component with icons (no emojis)
// Colors based on action context:
// - ACTION NEEDED (Orange #F59E0B): New Quote, Expires Soon, Confirm Completion
// - WAITING (Blue #3B82F6): Request Sent, Quote Pending, Awaiting Schedule
// - ACTIVE/GOOD (Green #10B981): Quote Accepted, Scheduled, On Site, Work in Progress
// - COMPLETED (Gray #6B7280): Completed
// - NEGATIVE (Red #EF4444): Declined, Expired, No Response
function StatusBadge({ type }) {
  const badges = {
    // ACTION NEEDED (Orange) - client needs to take action
    NEW_QUOTE: { icon: "document-text", color: "#F59E0B", bg: "#FEF3C7", text: "New Quote" },
    EXPIRES_SOON: { icon: "time", color: "#F59E0B", bg: "#FEF3C7", text: "Expires Soon" },
    CONFIRM_COMPLETION: { icon: "checkmark-circle", color: "#F59E0B", bg: "#FEF3C7", text: "Confirm Completion" },
    RESPONSE_NEEDED: { icon: "alert-circle", color: "#F59E0B", bg: "#FEF3C7", text: "Response Needed" },

    // WAITING (Blue) - waiting for trade
    REQUEST_SENT: { icon: "send", color: "#3B82F6", bg: "#DBEAFE", text: "Request Sent" },
    QUOTE_PENDING: { icon: "hourglass", color: "#3B82F6", bg: "#DBEAFE", text: "Quote Pending" },
    AWAITING_SCHEDULE: { icon: "calendar-outline", color: "#3B82F6", bg: "#DBEAFE", text: "Awaiting Schedule" },
    AWAITING: { icon: "hourglass", color: "#3B82F6", bg: "#DBEAFE", text: "Awaiting Response" },

    // ACTIVE/GOOD (Green) - positive state
    QUOTE_ACCEPTED: { icon: "checkmark-circle", color: "#10B981", bg: "#D1FAE5", text: "Quote Accepted" },
    SCHEDULED: { icon: "calendar", color: "#10B981", bg: "#D1FAE5", text: "Scheduled" },
    ON_SITE: { icon: "location", color: "#10B981", bg: "#D1FAE5", text: "On Site" },
    WORK_IN_PROGRESS: { icon: "construct", color: "#10B981", bg: "#D1FAE5", text: "Work in Progress" },
    ACTIVE: { icon: "construct", color: "#10B981", bg: "#D1FAE5", text: "Active" },

    // ACTION NEEDED for appointments (Orange)
    CONFIRM_VISIT: { icon: "calendar-outline", color: "#F59E0B", bg: "#FEF3C7", text: "Confirm Visit" },

    // COMPLETED (Gray)
    COMPLETED: { icon: "checkmark-done", color: "#6B7280", bg: "#F3F4F6", text: "Completed" },

    // NEGATIVE (Red) - declined, expired, no response
    DECLINED: { icon: "close-circle", color: "#EF4444", bg: "#FEE2E2", text: "Declined" },
    DECLINED_BY_YOU: { icon: "close", color: "#EF4444", bg: "#FEE2E2", text: "Declined by You" },
    EXPIRED: { icon: "ban", color: "#EF4444", bg: "#FEE2E2", text: "Expired" },
    NO_RESPONSE: { icon: "alert-circle", color: "#EF4444", bg: "#FEE2E2", text: "No Response" },

    // Legacy mappings (for backwards compatibility)
    NEW: { icon: "sparkles", color: "#F59E0B", bg: "#FEF3C7", text: "New Quote" },
    AT_LIMIT: { icon: "warning", color: "#EF4444", bg: "#FEE2E2", text: "At Limit" },
    MULTIPLE_QUOTES: { icon: "document-text", color: "#F59E0B", bg: "#FEF3C7", text: "Multiple Quotes" },
  };

  const badge = badges[type] || badges.AWAITING;

  return (
    <View style={[styles.badge, { backgroundColor: badge.bg }]}>
      <Ionicons name={badge.icon} size={14} color={badge.color} />
      <ThemedText style={[styles.badgeText, { color: badge.color }]}>
        {badge.text}
      </ThemedText>
    </View>
  );
}

// Filter button component
function FilterBtn({ active, label, count, onPress }) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.filterBtn, active && styles.filterBtnActive]}
    >
      <ThemedText style={[styles.filterLabel, active && styles.filterLabelActive]}>
        {label} {typeof count === "number" ? `(${count})` : ""}
      </ThemedText>
    </Pressable>
  );
}

// Project card component - NEW DESIGN
// Hierarchy: WHO (primary) -> STATUS (secondary) -> WHAT (tertiary)
function ProjectCard({ item, onPress, statusType, onMessage, onRespond }) {
  const router = useRouter();
  const hasTrades = item.trades && item.trades.length > 0;
  const singleTrade = hasTrades && item.trades.length === 1;
  const multipleTrades = hasTrades && item.trades.length > 1;

  // Determine if we need to show action buttons for active jobs
  const isActiveJob = item.type === "active";
  const needsConfirmation = item.appointmentStatus === "proposed";
  const isConfirmed = item.appointmentStatus === "confirmed";
  const waitingForAppointment = isActiveJob && !item.appointmentStatus;

  return (
    <Pressable style={styles.projectCard} onPress={onPress}>
      {/* Row 1: Avatar(s) + Primary info + Chip */}
      <View style={styles.cardHeader}>
        {/* Avatar section */}
        {singleTrade && (
          <Avatar name={item.trades[0].name} photoUrl={item.trades[0].photoUrl} size={44} />
        )}
        {multipleTrades && (
          <AvatarStack trades={item.trades} size={40} maxVisible={3} />
        )}
        {!hasTrades && (
          <View style={styles.noTradeIcon}>
            <Ionicons name="hourglass-outline" size={24} color="#9CA3AF" />
          </View>
        )}

        {/* Primary info */}
        <View style={styles.cardPrimaryInfo}>
          {/* Primary: Trade name(s) or Job title */}
          <ThemedText style={styles.cardPrimaryText} numberOfLines={2}>
            {singleTrade
              ? item.trades[0].name
              : multipleTrades
              ? `${item.trades.length} trades`
              : item.jobTitle || "Untitled job"}
          </ThemedText>

          {/* Secondary: Status description */}
          <ThemedText style={styles.cardSecondaryText} numberOfLines={2}>
            {item.statusDescription}
          </ThemedText>
        </View>

        {/* Chip */}
        <StatusBadge type={statusType} />
      </View>

      {/* Row 2: Tertiary info (Category, Service in Postcode) */}
      {item.tertiaryText && (
        <View style={styles.cardTertiaryRow}>
          <ThemedText style={styles.cardTertiaryText} numberOfLines={1}>
            {item.tertiaryText}
          </ThemedText>
        </View>
      )}

      {/* Row 2 alt: Location only when no trades and no tertiaryText */}
      {!item.tertiaryText && !hasTrades && item.location && (
        <View style={styles.cardTertiaryRow}>
          <Ionicons name="location-outline" size={14} color="#9CA3AF" />
          <ThemedText style={styles.cardTertiaryText}>
            {item.location}
          </ThemedText>
        </View>
      )}

      {/* Row 3: Price info (for quotes received) */}
      {item.priceInfo && (
        <View style={styles.priceRow}>
          <ThemedText style={styles.priceLabel}>{item.priceLabel || "Quote"}</ThemedText>
          <ThemedText style={styles.priceValue}>{item.priceInfo}</ThemedText>
        </View>
      )}

      {/* Row 3b: Helper text for waiting for appointment */}
      {item.helperText && (
        <ThemedText style={styles.helperText}>{item.helperText}</ThemedText>
      )}

      {/* Row 4: Appointment info */}
      {item.appointmentInfo && (
        <View style={styles.appointmentRow}>
          <Ionicons
            name="calendar"
            size={16}
            color={needsConfirmation ? "#F59E0B" : TINT}
          />
          <ThemedText style={[
            styles.appointmentText,
            needsConfirmation && { color: "#92400E" }
          ]}>
            {item.appointmentInfo}
          </ThemedText>
        </View>
      )}

      {/* Row 5: Warning/expiry */}
      {item.warningText && (
        <View style={styles.warningRow}>
          <Ionicons name="alert-circle" size={16} color="#F59E0B" />
          <ThemedText style={styles.warningText}>{item.warningText}</ThemedText>
        </View>
      )}

      {/* Action buttons for active jobs */}
      {isActiveJob && (
        <View style={styles.cardActions}>
          <Pressable
            style={[styles.actionBtn, styles.actionBtnSecondary]}
            onPress={(e) => {
              e.stopPropagation();
              if (item.requestId) {
                router.push({
                  pathname: "/(dashboard)/messages/[id]",
                  params: {
                    id: String(item.requestId),
                    name: singleTrade ? item.trades[0].name : "",
                    quoteId: item.quoteId ? String(item.quoteId) : "",
                    returnTo: "/myquotes",
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
              if (needsConfirmation && item.appointmentId) {
                // Navigate to appointment response screen
                router.push({
                  pathname: "/myquotes/appointment-response",
                  params: {
                    appointmentId: String(item.appointmentId),
                    quoteId: item.quoteId ? String(item.quoteId) : "",
                    requestId: String(item.requestId),
                  },
                });
              } else {
                // Navigate to quote details
                onPress?.();
              }
            }}
          >
            <ThemedText style={styles.actionBtnTextPrimary}>
              {needsConfirmation ? "Respond" : "View Details"}
            </ThemedText>
          </Pressable>
        </View>
      )}
    </Pressable>
  );
}

// Section header component
function SectionHeader({ title, icon, count }) {
  return (
    <View style={styles.sectionHeader}>
      <Ionicons name={icon} size={20} color="#111827" />
      <ThemedText style={styles.sectionTitle}>
        {title} {typeof count === "number" ? `(${count})` : ""}
      </ThemedText>
    </View>
  );
}

// Empty state component
function EmptyState({ icon, title, subtitle, actionLabel, onAction }) {
  return (
    <View style={styles.emptyState}>
      <View style={styles.emptyIconContainer}>
        <Ionicons name={icon} size={48} color="#9CA3AF" />
      </View>
      <ThemedText style={styles.emptyTitle}>{title}</ThemedText>
      <ThemedText style={styles.emptySubtitle} variant="muted">
        {subtitle}
      </ThemedText>
      {actionLabel && onAction && (
        <>
          <Spacer height={16} />
          <ThemedButton onPress={onAction} style={styles.emptyActionBtn}>
            <ThemedText style={styles.actionBtnText}>{actionLabel}</ThemedText>
          </ThemedButton>
        </>
      )}
    </View>
  );
}

export default function ClientProjects() {
  const { user } = useUser();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [filter, setFilter] = useState("all"); // all | active | completed
  const [refreshing, setRefreshing] = useState(false);

  // Data from existing RPCs
  const [requests, setRequests] = useState([]);
  const [responses, setResponses] = useState([]);
  const [decideQuotes, setDecideQuotes] = useState([]);
  const [decidedQuotes, setDecidedQuotes] = useState([]);
  const [appointments, setAppointments] = useState([]);
  const [caps, setCaps] = useState({
    direct_used: 0,
    open_used: 0,
    direct_cap: 5,
    open_cap: 20,
  });

  // Fetch data using existing RPCs
  const fetchAllData = useCallback(async () => {
    if (!user?.id) return;

    try {
      // Caps
      const { data: capsData } = await supabase.rpc("rpc_client_request_overview", {});
      if (capsData && capsData.length) {
        setCaps({
          direct_used: capsData[0].direct_used ?? 0,
          open_used: capsData[0].open_used ?? 0,
          direct_cap: capsData[0].direct_cap ?? 5,
          open_cap: capsData[0].open_cap ?? 20,
        });
      }

      // Requests (no quotes yet)
      const { data: reqData } = await supabase.rpc("rpc_client_list_requests");
      setRequests(reqData || []);

      // Responses (trades responded)
      const { data: resData } = await supabase.rpc("rpc_client_list_responses");
      setResponses(resData || []);

      // Quotes to decide
      const { data: decideData } = await supabase.rpc("rpc_client_list_decide_v2", {
        p_days: 30,
        p_limit: 50,
      });
      setDecideQuotes(decideData || []);

      // Past decisions
      const { data: decidedData } = await supabase.rpc("rpc_client_list_decided_quotes", {
        p_days: 90,
        p_limit: 50,
      });
      setDecidedQuotes(decidedData || []);

      // Appointments (upcoming only)
      const { data: apptData } = await supabase.rpc("rpc_client_list_appointments", {
        p_only_upcoming: true,
      });
      setAppointments(apptData || []);
    } catch (err) {
      Alert.alert("Error", err.message);
    }
  }, [user?.id]);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchAllData();
    setRefreshing(false);
  };

  useEffect(() => {
    if (!user?.id) return;
    fetchAllData();

    // Realtime subscriptions
    const chQuotes = supabase
      .channel("client-quotes-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "tradify_native_app_db" },
        fetchAllData
      )
      .subscribe();

    const chReq = supabase
      .channel("client-requests-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "quote_requests" },
        fetchAllData
      )
      .subscribe();

    return () => {
      supabase.removeChannel(chQuotes);
      supabase.removeChannel(chReq);
    };
  }, [user?.id, fetchAllData]);

  // Transform data into project cards GROUPED BY REQUEST
  // New hierarchy: WHO (primary) -> STATUS (secondary) -> WHAT (tertiary)
  const projects = useMemo(() => {
    const needsAttention = [];
    const waitingForQuotes = [];
    const activeJobs = [];
    const completedProjects = [];

    // Helper to calculate days difference
    const daysSince = (date) => {
      if (!date) return 0;
      const diff = new Date() - new Date(date);
      return Math.floor(diff / (1000 * 60 * 60 * 24));
    };

    // Group quotes by request_id
    const quotesByRequest = {};

    // Group decideQuotes (pending quotes) by request
    decideQuotes.forEach((q) => {
      const reqId = q.request_id;
      if (!reqId) return;
      if (!quotesByRequest[reqId]) {
        quotesByRequest[reqId] = {
          requestId: reqId,
          jobTitle: q.request_suggested_title || q.project_title || "Untitled job",
          location: q.postcode || null,
          tertiaryText: buildTertiaryText(q.request_suggested_title || q.project_title, q.postcode),
          trades: [],
          quotes: [],
          hasNewQuotes: false,
          lowestPrice: null,
          currency: q.currency || "GBP",
        };
      }
      quotesByRequest[reqId].quotes.push(q);
      quotesByRequest[reqId].trades.push({
        id: q.trade_id,
        name: q.trade_business_name || "Trade",
        photoUrl: q.trade_photo_url || null,
        hasQuote: true,
        quoteId: q.quote_id,
        amount: q.grand_total,
        issuedAt: q.issued_at,
      });
      quotesByRequest[reqId].hasNewQuotes = true;
      const price = q.grand_total;
      if (price && (quotesByRequest[reqId].lowestPrice === null || price < quotesByRequest[reqId].lowestPrice)) {
        quotesByRequest[reqId].lowestPrice = price;
      }
    });

    // Process grouped quotes needing decision
    Object.values(quotesByRequest).forEach((group) => {
      const quotesReceived = group.quotes.length;
      const tradesCount = group.trades.length;

      // Check for expiry
      const oldestQuote = group.quotes.reduce((oldest, q) => {
        const qDate = new Date(q.issued_at);
        return !oldest || qDate < new Date(oldest.issued_at) ? q : oldest;
      }, null);
      const daysOld = oldestQuote ? daysSince(oldestQuote.issued_at) : 0;
      const expiryDays = 14 - daysOld;
      const expiresSoon = expiryDays <= 3 && expiryDays > 0;

      let statusType = "NEW_QUOTE";
      if (expiresSoon) statusType = "EXPIRES_SOON";

      // Build status description based on count
      let statusDescription;
      if (tradesCount === 1) {
        statusDescription = "Quote received";
      } else {
        statusDescription = `${quotesReceived} quote${quotesReceived !== 1 ? "s" : ""} received`;
      }

      needsAttention.push({
        id: `grouped-${group.requestId}`,
        type: "grouped_quotes",
        requestId: group.requestId,
        jobTitle: group.jobTitle,
        location: group.location,
        tertiaryText: group.tertiaryText,
        trades: group.trades,
        statusDescription,
        statusType,
        priceInfo: group.lowestPrice
          ? tradesCount > 1
            ? `From £${formatNumber(group.lowestPrice)}`
            : `£${formatNumber(group.lowestPrice)}`
          : null,
        priceLabel: tradesCount > 1 ? "Prices from" : "Quote total",
        warningText: expiresSoon ? `Expires in ${expiryDays} day${expiryDays !== 1 ? "s" : ""}` : null,
      });
    });

    // Process responses - trades who accepted but haven't sent quote yet
    // Group by request to combine with existing grouped cards
    const responsesByRequest = {};
    responses.forEach((r) => {
      const reqId = r.request_id;
      const status = String(r.decision_status || "").toLowerCase();
      if (!reqId) return;

      if (!responsesByRequest[reqId]) {
        responsesByRequest[reqId] = {
          requestId: reqId,
          jobTitle: r.suggested_title || "Untitled job",
          location: r.postcode || null,
          tertiaryText: buildTertiaryText(r.suggested_title, r.postcode),
          preparingTrades: [],
          declinedTrades: [],
        };
      }

      if (status === "accepted") {
        responsesByRequest[reqId].preparingTrades.push({
          id: r.trade_id,
          name: r.trade_business_name || "Trade",
          photoUrl: r.trade_photo_url || null,
          hasQuote: false,
        });
      } else if (status === "declined") {
        responsesByRequest[reqId].declinedTrades.push({
          id: r.trade_id,
          name: r.trade_business_name || "Trade",
        });
      }
    });

    // Merge responses with existing grouped cards or create new ones
    Object.values(responsesByRequest).forEach((respGroup) => {
      // Check if we already have a card for this request (from decideQuotes)
      const existingIdx = needsAttention.findIndex(
        (p) => p.type === "grouped_quotes" && p.requestId === respGroup.requestId
      );

      if (existingIdx >= 0) {
        // Add preparing trades to existing card
        const existing = needsAttention[existingIdx];
        respGroup.preparingTrades.forEach((t) => {
          if (!existing.trades.find((et) => et.id === t.id)) {
            existing.trades.push(t);
          }
        });
        // Update status description
        const quotesReceived = existing.trades.filter((t) => t.hasQuote).length;
        const preparing = existing.trades.filter((t) => !t.hasQuote).length;
        if (preparing > 0) {
          existing.statusDescription = `${quotesReceived} quote${quotesReceived !== 1 ? "s" : ""} received, ${preparing} preparing`;
        }
      } else if (respGroup.preparingTrades.length > 0) {
        // Create new card for trades preparing quotes
        const preparing = respGroup.preparingTrades.length;
        waitingForQuotes.push({
          id: `preparing-${respGroup.requestId}`,
          type: "preparing_quotes",
          requestId: respGroup.requestId,
          jobTitle: respGroup.jobTitle,
          location: respGroup.location,
          tertiaryText: respGroup.tertiaryText,
          trades: respGroup.preparingTrades,
          statusDescription: preparing === 1 ? "Preparing quote" : `${preparing} preparing quotes`,
          statusType: "QUOTE_PENDING",
          priceInfo: null,
        });
      }

      // Handle all-declined scenario
      if (respGroup.declinedTrades.length > 0 && respGroup.preparingTrades.length === 0) {
        const declined = respGroup.declinedTrades.length;
        needsAttention.push({
          id: `declined-req-${respGroup.requestId}`,
          type: "request_declined",
          requestId: respGroup.requestId,
          jobTitle: respGroup.jobTitle,
          location: respGroup.location,
          tertiaryText: respGroup.tertiaryText,
          trades: [], // No active trades
          statusDescription: declined === 1 ? "Trade declined" : `${declined} trades declined`,
          statusType: "DECLINED",
          priceInfo: null,
        });
      }
    });

    // Process open requests (no responses yet)
    requests.forEach((req) => {
      waitingForQuotes.push({
        id: `request-${req.id}`,
        type: "request",
        requestId: req.id,
        jobTitle: req.suggested_title || "Untitled job",
        location: req.postcode || null,
        tertiaryText: buildTertiaryText(req.suggested_title, req.postcode),
        trades: [], // No trades yet
        statusDescription: "Waiting for trades to respond",
        statusType: "REQUEST_SENT",
        priceInfo: null,
      });
    });

    // Process decided quotes (accepted quotes = active jobs)
    const activeByRequest = {};
    decidedQuotes.forEach((q) => {
      const status = String(q.status || "").toLowerCase();
      const reqId = q.request_id;

      if (status === "accepted") {
        // Group active jobs by request
        if (!activeByRequest[reqId]) {
          activeByRequest[reqId] = {
            requestId: reqId,
            jobTitle: q.request_suggested_title || q.project_title || "Active job",
            location: q.postcode || null,
            tertiaryText: buildTertiaryText(q.request_suggested_title || q.project_title, q.postcode),
            trades: [],
            quoteId: q.quote_id, // For single-trade navigation
          };
        }
        activeByRequest[reqId].trades.push({
          id: q.trade_id,
          name: q.trade_business_name || "Trade",
          photoUrl: q.trade_photo_url || null,
          hasQuote: true,
          quoteId: q.quote_id,
          amount: q.grand_total,
        });
      } else if (status === "declined") {
        const daysAgo = daysSince(q.issued_at);
        completedProjects.push({
          id: `declined-${q.quote_id}`,
          type: "declined",
          requestId: reqId,
          jobTitle: q.request_suggested_title || q.project_title || "Quote",
          location: q.postcode || null,
          tertiaryText: buildTertiaryText(q.request_suggested_title || q.project_title, q.postcode),
          trades: [{
            id: q.trade_id,
            name: q.trade_business_name || "Trade",
            photoUrl: q.trade_photo_url || null,
            hasQuote: true,
            quoteId: q.quote_id,
          }],
          statusDescription: `You declined ${daysAgo} day${daysAgo !== 1 ? "s" : ""} ago`,
          statusType: "DECLINED_BY_YOU",
          priceInfo: null,
        });
      } else if (status === "expired") {
        const daysAgo = daysSince(q.issued_at);
        completedProjects.push({
          id: `expired-${q.quote_id}`,
          type: "expired",
          requestId: reqId,
          jobTitle: q.request_suggested_title || q.project_title || "Quote",
          location: q.postcode || null,
          tertiaryText: buildTertiaryText(q.request_suggested_title || q.project_title, q.postcode),
          trades: [{
            id: q.trade_id,
            name: q.trade_business_name || "Trade",
            photoUrl: q.trade_photo_url || null,
            hasQuote: true,
            quoteId: q.quote_id,
          }],
          statusDescription: `Expired ${daysAgo} day${daysAgo !== 1 ? "s" : ""} ago`,
          statusType: "EXPIRED",
          priceInfo: null,
        });
      }
    });

    // Process active jobs
    Object.values(activeByRequest).forEach((group) => {
      // Find appointment for this job
      const relatedAppointments = appointments.filter(
        (appt) => group.trades.some((t) => t.quoteId === appt.quote_id)
      ).sort((a, b) => new Date(a.scheduled_at) - new Date(b.scheduled_at));

      const nextAppointment = relatedAppointments[0];
      const scheduledDate = nextAppointment?.scheduled_at ? new Date(nextAppointment.scheduled_at) : null;
      const appointmentStatus = nextAppointment?.status?.toLowerCase();

      let statusType = "QUOTE_ACCEPTED";
      let statusDescription = "Quote accepted";
      let appointmentInfo = null;
      let helperText = null;

      if (appointmentStatus === "proposed") {
        // Trade proposed an appointment - client needs to confirm
        statusType = "CONFIRM_VISIT";
        statusDescription = "Appointment requested";
        appointmentInfo = scheduledDate
          ? `Survey proposed: ${scheduledDate.toLocaleDateString(undefined, {
              day: "numeric",
              month: "short",
            })}, ${scheduledDate.toLocaleTimeString(undefined, {
              hour: "2-digit",
              minute: "2-digit",
            })}`
          : null;
      } else if (appointmentStatus === "confirmed") {
        // Appointment confirmed by client
        statusType = "SCHEDULED";
        statusDescription = "Visit confirmed";
        appointmentInfo = scheduledDate
          ? `${scheduledDate.toLocaleDateString(undefined, {
              weekday: "short",
              day: "numeric",
              month: "short",
            })}, ${scheduledDate.toLocaleTimeString(undefined, {
              hour: "2-digit",
              minute: "2-digit",
            })}`
          : null;
      } else {
        // No appointment yet - waiting for trade to schedule
        helperText = "Waiting for appointment";
      }

      // Calculate price from trades
      const totalPrice = group.trades.reduce((sum, t) => sum + (t.amount || 0), 0);

      activeJobs.push({
        id: `active-${group.requestId}`,
        type: "active",
        requestId: group.requestId,
        jobTitle: group.jobTitle,
        location: group.location,
        tertiaryText: group.tertiaryText,
        trades: group.trades,
        statusDescription,
        statusType,
        priceInfo: totalPrice > 0 ? `GBP ${formatNumber(totalPrice)}` : null,
        priceLabel: "Quote total",
        helperText,
        appointmentInfo,
        appointmentStatus,
        appointmentId: nextAppointment?.id,
        quoteId: group.quoteId, // For single-trade navigation
      });
    });

    return { needsAttention, waitingForQuotes, activeJobs, completedProjects };
  }, [requests, responses, decideQuotes, decidedQuotes, appointments, caps, router]);

  // Filter counts
  const counts = useMemo(() => {
    const all =
      projects.needsAttention.length +
      projects.waitingForQuotes.length +
      projects.activeJobs.length +
      projects.completedProjects.length;

    const active =
      projects.needsAttention.length +
      projects.waitingForQuotes.length +
      projects.activeJobs.length;

    const completed = projects.completedProjects.length;

    return { all, active, completed };
  }, [projects]);

  // Filter logic
  const shouldShowSection = (sectionType) => {
    if (filter === "all") return true;
    if (filter === "active") return sectionType !== "completed";
    if (filter === "completed") return sectionType === "completed";
    return false;
  };

  return (
    <ThemedView style={styles.container}>
      {/* Header - Profile-style */}
      <View style={[styles.header, { paddingTop: insets.top + 16 }]}>
        <ThemedText style={styles.headerTitle}>Projects</ThemedText>
      </View>

      {/* Filter buttons */}
      <View style={styles.filterRow}>
        <FilterBtn
          active={filter === "all"}
          label="All"
          count={counts.all}
          onPress={() => setFilter("all")}
        />
        <FilterBtn
          active={filter === "active"}
          label="Active"
          count={counts.active}
          onPress={() => setFilter("active")}
        />
        <FilterBtn
          active={filter === "completed"}
          label="Completed"
          count={counts.completed}
          onPress={() => setFilter("completed")}
        />
      </View>

      <ScrollView
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        contentContainerStyle={styles.scrollContent}
      >
        {/* Needs Attention Section */}
        {shouldShowSection("needsAttention") && projects.needsAttention.length > 0 && (
          <>
            <SectionHeader
              title="Needs attention"
              icon="alert-circle"
              count={projects.needsAttention.length}
            />
            {projects.needsAttention.map((project) => (
              <ProjectCard
                key={project.id}
                item={project}
                statusType={project.statusType}
                onPress={() => {
                  // Navigate based on project type
                  if (project.trades && project.trades.length > 1) {
                    // Multiple trades -> go to quote list
                    router.push(`/myquotes/quotes/${project.requestId}`);
                  } else if (project.trades && project.trades.length === 1 && project.trades[0].quoteId) {
                    // Single trade with quote -> go to quote detail
                    router.push(`/myquotes/${project.trades[0].quoteId}`);
                  } else {
                    // No trades or request view
                    router.push(`/myquotes/request/${project.requestId}`);
                  }
                }}
              />
            ))}
            <Spacer height={16} />
          </>
        )}

        {/* Waiting for Quotes Section */}
        {shouldShowSection("waiting") && projects.waitingForQuotes.length > 0 && (
          <>
            <SectionHeader
              title="Waiting for quotes"
              icon="hourglass"
              count={projects.waitingForQuotes.length}
            />
            {projects.waitingForQuotes.map((project) => (
              <ProjectCard
                key={project.id}
                item={project}
                statusType={project.statusType}
                onPress={() => {
                  // Navigate based on project type
                  if (project.trades && project.trades.length > 1) {
                    router.push(`/myquotes/quotes/${project.requestId}`);
                  } else if (project.trades && project.trades.length === 1 && project.trades[0].quoteId) {
                    router.push(`/myquotes/${project.trades[0].quoteId}`);
                  } else {
                    router.push(`/myquotes/request/${project.requestId}`);
                  }
                }}
              />
            ))}
            <Spacer height={16} />
          </>
        )}

        {/* Active Jobs Section */}
        {shouldShowSection("active") && projects.activeJobs.length > 0 && (
          <>
            <SectionHeader
              title="Active jobs"
              icon="construct"
              count={projects.activeJobs.length}
            />
            {projects.activeJobs.map((project) => (
              <ProjectCard
                key={project.id}
                item={project}
                statusType={project.statusType}
                onPress={() => {
                  // Active jobs - go to quote detail (single trade) or quote list (multiple)
                  if (project.trades && project.trades.length > 1) {
                    router.push(`/myquotes/quotes/${project.requestId}`);
                  } else if (project.trades && project.trades.length === 1 && project.trades[0].quoteId) {
                    router.push(`/myquotes/${project.trades[0].quoteId}`);
                  } else if (project.quoteId) {
                    router.push(`/myquotes/${project.quoteId}`);
                  }
                }}
              />
            ))}
            <Spacer height={16} />
          </>
        )}

        {/* Completed Section */}
        {shouldShowSection("completed") && projects.completedProjects.length > 0 && (
          <>
            <SectionHeader
              title="Completed"
              icon="checkmark-done-circle"
              count={projects.completedProjects.length}
            />
            {projects.completedProjects.map((project) => (
              <ProjectCard
                key={project.id}
                item={project}
                statusType={project.statusType}
                onPress={() => {
                  // Completed projects - go to quote detail
                  if (project.trades && project.trades.length === 1 && project.trades[0].quoteId) {
                    router.push(`/myquotes/${project.trades[0].quoteId}`);
                  }
                }}
              />
            ))}
            <Spacer height={16} />
          </>
        )}

        {/* Empty states */}
        {filter === "all" && counts.all === 0 && (
          <EmptyState
            icon="briefcase-outline"
            title="No projects yet"
            subtitle="Create a request to receive quotes from trades."
            actionLabel="Browse Services"
            onAction={() => router.push("/create")}
          />
        )}

        {filter === "active" && counts.active === 0 && (
          <EmptyState
            icon="checkmark-circle-outline"
            title="No active projects"
            subtitle="When you receive or accept quotes, they'll appear here."
            actionLabel="Request a Quote"
            onAction={() => router.push("/create")}
          />
        )}

        {filter === "completed" && counts.completed === 0 && (
          <EmptyState
            icon="archive-outline"
            title="No completed projects yet"
            subtitle="Your project history will appear here."
          />
        )}

        <Spacer height={40} />
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F9FAFB",
  },
  // Profile-style header
  header: {
    paddingHorizontal: 20,
    paddingBottom: 12,
    backgroundColor: "#F9FAFB",
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: "700",
  },
  filterRow: {
    flexDirection: "row",
    gap: 12,
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 12,
  },
  filterBtn: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  filterBtnActive: {
    backgroundColor: TINT,
    borderColor: TINT,
  },
  filterLabel: {
    fontSize: 14,
    fontWeight: "500",
    color: "#6B7280",
  },
  filterLabelActive: {
    color: "#FFFFFF",
  },
  scrollContent: {
    paddingTop: 8,
    paddingBottom: 20,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#111827",
  },
  projectCard: {
    marginHorizontal: 20,
    marginBottom: 12,
    padding: 16,
    borderRadius: 16,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  // New card design styles
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  noTradeIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#F3F4F6",
    alignItems: "center",
    justifyContent: "center",
  },
  cardPrimaryInfo: {
    flex: 1,
    gap: 2,
  },
  cardPrimaryText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#111827",
  },
  cardSecondaryText: {
    fontSize: 14,
    color: "#6B7280",
  },
  cardTertiaryRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "#F3F4F6",
  },
  cardTertiaryText: {
    fontSize: 13,
    color: "#9CA3AF",
  },
  priceRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: "#F9FAFB",
    borderRadius: 10,
  },
  priceLabel: {
    fontSize: 13,
    color: "#6B7280",
    fontWeight: "500",
  },
  priceValue: {
    fontSize: 18,
    fontWeight: "700",
    color: "#111827",
  },
  appointmentRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 10,
  },
  appointmentText: {
    fontSize: 14,
    color: TINT,
    fontWeight: "600",
  },
  warningRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 10,
    paddingVertical: 8,
    paddingHorizontal: 10,
    backgroundColor: "#FEF3C7",
    borderRadius: 8,
  },
  warningText: {
    fontSize: 13,
    color: "#F59E0B",
    fontWeight: "500",
  },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 12,
  },
  badgeText: {
    fontSize: 12,
    fontWeight: "600",
  },
  // Legacy styles kept for compatibility
  cardTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#111827",
  },
  cardSubtitle: {
    fontSize: 14,
    marginTop: 2,
  },
  cardContent: {
    gap: 8,
  },
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
  infoRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  infoText: {
    fontSize: 14,
    color: "#6B7280",
  },
  metaText: {
    fontSize: 13,
    color: "#9CA3AF",
    marginTop: 4,
  },
  helperText: {
    fontSize: 13,
    color: "#6B7280",
    marginTop: 8,
  },
  cardActions: {
    flexDirection: "row",
    gap: 10,
    marginTop: 14,
  },
  actionBtn: {
    flex: 1,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
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
  actionBtnText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "600",
    textAlign: "center",
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
  emptyActionBtn: {
    minWidth: 160,
    backgroundColor: TINT,
    borderRadius: 999,
    paddingVertical: 12,
    paddingHorizontal: 20,
  },
});
