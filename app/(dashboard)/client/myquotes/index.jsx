// app/(dashboard)/client/myquotes/index.jsx
// Client Projects Screen - v5 with Progress Bars and Visual Design
import {
  StyleSheet,
  View,
  Pressable,
  Alert,
  ScrollView,
  RefreshControl,
} from "react-native";
import { useEffect, useState, useCallback, useMemo } from "react";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useFocusEffect } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";

import { supabase } from "../../../../lib/supabase";
import { useUser } from "../../../../hooks/useUser";

import ThemedView from "../../../../components/ThemedView";
import ThemedText from "../../../../components/ThemedText";
import ThemedButton from "../../../../components/ThemedButton";
import Spacer from "../../../../components/Spacer";
import ProgressBar from "../../../../components/ProgressBar";
import { ProjectsPageSkeleton } from "../../../../components/Skeleton";
import { Colors } from "../../../../constants/Colors";

const TINT = Colors?.light?.tint || "#6849a7";

// Client progress stages
const CLIENT_STAGES = ["Posted", "Quotes", "Hired", "Settled"];

// Status colors
const STATUS_COLORS = {
  action: { text: "#F59E0B", icon: "alert-circle" },      // Orange
  scheduled: { text: "#10B981", icon: "calendar" },        // Green
  waiting: { text: "#6B7280", icon: "hourglass" },         // Gray
  issue: { text: "#DC2626", icon: "alert-circle" },        // Red
  completed: { text: "#6B7280", icon: "checkmark" },       // Gray
  direct: { text: "#7C3AED", icon: "person" },             // Purple
  expired: { text: "#6B7280", icon: "close-circle" },      // Gray with close icon
  cancelled: { text: "#6B7280", icon: "close" },           // Gray with X
};

// Done tab stages for filtering
const DONE_STAGES = ["DONE", "EXPIRED", "CANCELLED"];

// Format number with thousand separators
function formatNumber(num) {
  if (num == null || isNaN(num)) return "0.00";
  return Number(num).toLocaleString("en-GB", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

// Parse title: "Category - Service" or "Service, Category"
function parseTitle(suggestedTitle) {
  if (!suggestedTitle) return { service: "Untitled job", category: "" };

  // Strip any "in POSTCODE" suffix
  let cleanTitle = suggestedTitle
    .replace(/\s+in\s+[A-Z]{1,2}\d{1,2}[A-Z]?\s*\d[A-Z]{2}/gi, "")
    .trim();

  // Try "Category - Service" format first
  if (cleanTitle.includes(" - ")) {
    const parts = cleanTitle.split(" - ").map((s) => s.trim());
    if (parts.length >= 2) {
      return { service: parts[1], category: parts[0] };
    }
  }

  // Try "Service, Category" format
  const parts = cleanTitle.split(",").map((s) => s.trim());
  if (parts.length >= 2) {
    return { service: parts[0], category: parts[1] };
  }

  return { service: cleanTitle, category: "" };
}

// Calculate client progress position
// ProgressBar stage dots at: 12.5%, 37.5%, 62.5%, 87.5%
// Progress fills from 0% left toward 100% right
// To light up a stage dot, progress must reach that dot's position
function getClientProgressPosition(stage, subStatus) {
  switch (stage) {
    case "POSTED":
      // Stage 0 (Posted): Dot at 12.5%
      return 12.5;
    case "QUOTES":
      // Stage 1 (Quotes): Dot at 37.5%
      // Progress ranges from 12.5% (posted) to 37.5% (quotes received)
      if (subStatus === "quotes_received") return 37.5; // Reached Quotes stage
      if (subStatus === "appointment_confirmed") return 32;
      if (subStatus === "appointment_pending") return 28;
      if (subStatus === "preparing") return 22;
      return 18; // Default: just past Posted
    case "HIRED":
      // Stage 2 (Hired): Dot at 62.5%
      // Progress ranges from 37.5% (quotes) to 62.5% (hired)
      if (subStatus === "awaiting_completion") return 75; // Past Hired, heading to Done
      if (subStatus === "issue_resolved_pending") return 70;
      if (subStatus === "issue_reported") return 68;
      if (subStatus === "work_in_progress") return 65;
      if (subStatus === "work_confirmed") return 62.5; // Reached Hired stage
      if (subStatus === "work_pending") return 55;
      return 50; // Default: working toward Hired stage
    case "DONE":
      // Stage 3 (Settled): Fill to 100% for completed jobs
      return 100;
    default:
      return 12.5;
  }
}

// Filter pill component - matches trade side style
function FilterPill({ active, label, count, onPress }) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.filterPill, active && styles.filterPillActive]}
    >
      <ThemedText
        style={[styles.filterPillText, active && styles.filterPillTextActive]}
      >
        {label}
      </ThemedText>
      {typeof count === "number" && count > 0 && (
        <ThemedText
          style={[
            styles.filterPillCount,
            active && styles.filterPillCountActive,
          ]}
        >
          ({count})
        </ThemedText>
      )}
    </Pressable>
  );
}

// Project card component - new visual design
function ProjectCard({ item, onPress }) {
  const router = useRouter();
  const { service, category } = parseTitle(item.title);
  const hasActions = item.actions && item.actions.length > 0;
  const isDirectRequest = item.requestType === "direct";

  // Get status display
  const getStatusDisplay = () => {
    const { statusType, statusText, statusDetail } = item;
    let color = STATUS_COLORS.waiting;
    let icon = "hourglass";

    switch (statusType) {
      case "action":
        color = STATUS_COLORS.action;
        icon = "alert-circle";
        break;
      case "scheduled":
        color = STATUS_COLORS.scheduled;
        icon = "calendar";
        break;
      case "issue":
        color = STATUS_COLORS.issue;
        icon = "alert-circle";
        break;
      case "completed":
        color = STATUS_COLORS.completed;
        icon = "checkmark";
        break;
      default:
        color = STATUS_COLORS.waiting;
        icon = "hourglass";
    }

    return { color, icon, text: statusText, detail: statusDetail };
  };

  const status = getStatusDisplay();

  return (
    <Pressable style={styles.projectCard} onPress={onPress}>
      {/* Two-line title + menu */}
      <View style={styles.cardTitleRow}>
        <View style={styles.cardTitleContent}>
          <ThemedText style={styles.cardServiceTitle} numberOfLines={1}>
            {service}
          </ThemedText>
        </View>
        <Pressable style={styles.menuButton}>
          <Ionicons name="ellipsis-horizontal" size={20} color="#9CA3AF" />
        </Pressable>
      </View>

      {/* Category subtitle */}
      {category ? (
        <ThemedText style={styles.cardCategory}>{category}</ThemedText>
      ) : null}

      {/* Progress bar */}
      <ProgressBar
        stages={CLIENT_STAGES}
        progressPosition={item.progressPosition}
        activeStageIndex={item.stageIndex}
      />

      {/* Context line */}
      {item.contextLine && (
        <ThemedText style={styles.contextLine}>{item.contextLine}</ThemedText>
      )}

      {/* Status with icon */}
      <View style={styles.statusRow}>
        {status.text && (
          <>
            <Ionicons name={status.icon} size={16} color={status.color.text} />
            <ThemedText style={[styles.statusText, { color: status.color.text }]}>
              {status.text}
            </ThemedText>
          </>
        )}
      </View>

      {/* Detail line */}
      {status.detail && (
        <ThemedText style={styles.detailLine}>{status.detail}</ThemedText>
      )}

      {/* Price info */}
      {item.priceInfo && (
        <ThemedText style={styles.priceText}>{item.priceInfo}</ThemedText>
      )}

      {/* Action buttons */}
      {hasActions && (
        <View style={styles.cardActions}>
          {item.actions.map((action, idx) => (
            <Pressable
              key={idx}
              style={[
                styles.actionBtn,
                action.primary ? styles.actionBtnPrimary : styles.actionBtnSecondary,
              ]}
              onPress={(e) => {
                e.stopPropagation();
                action.onPress?.();
              }}
            >
              <ThemedText
                style={
                  action.primary
                    ? styles.actionBtnTextPrimary
                    : styles.actionBtnTextSecondary
                }
              >
                {action.label}
              </ThemedText>
            </Pressable>
          ))}
        </View>
      )}

      {/* Review stars for completed */}
      {item.hasReview && (
        <View style={styles.reviewRow}>
          {[1, 2, 3, 4, 5].map((star) => (
            <Ionicons
              key={star}
              name={star <= (item.reviewRating || 0) ? "star" : "star-outline"}
              size={16}
              color="#F59E0B"
            />
          ))}
          <ThemedText style={styles.reviewLabel}>Your review</ThemedText>
        </View>
      )}
    </Pressable>
  );
}

// Past card component for Done tab (completed, expired, cancelled)
function ClientPastCard({ item, onPress }) {
  const router = useRouter();
  const { service, category } = parseTitle(item.title);

  // Determine icon based on past type
  const getIcon = () => {
    if (item.pastType === "completed") return "checkmark-circle";
    if (item.pastType === "expired") return "close-circle-outline";
    if (item.pastType === "cancelled") return "close";
    return "ellipse-outline";
  };

  const getIconColor = () => {
    if (item.pastType === "completed") return "#10B981";
    return "#9CA3AF";
  };

  const isExpiredOrCancelled = item.pastType === "expired" || item.pastType === "cancelled";

  return (
    <Pressable
      style={[
        styles.pastCard,
        isExpiredOrCancelled && styles.pastCardMuted,
      ]}
      onPress={onPress}
    >
      {/* Title row with icon */}
      <View style={styles.pastCardHeader}>
        <View style={styles.pastCardTitleContent}>
          <ThemedText
            style={[
              styles.pastCardTitle,
              isExpiredOrCancelled && styles.pastCardTitleMuted,
            ]}
            numberOfLines={1}
          >
            {service}
          </ThemedText>
          {category ? (
            <ThemedText style={styles.pastCardCategory}>{category}</ThemedText>
          ) : null}
        </View>
        <Ionicons name={getIcon()} size={24} color={getIconColor()} />
      </View>

      {/* Context line */}
      <ThemedText style={styles.pastCardContext}>
        {item.contextLine}
      </ThemedText>

      {/* Explanation line for expired/cancelled (dashed separator + explanation) */}
      {isExpiredOrCancelled && item.explanation && (
        <View style={styles.pastCardExplanation}>
          <View style={styles.dashedLine} />
          <ThemedText style={styles.explanationText}>
            {item.explanation}
          </ThemedText>
        </View>
      )}

      {/* Review badge for completed */}
      {item.pastType === "completed" && (
        <>
          {item.hasReview ? (
            <View style={styles.pastCardReviewBadge}>
              {[1, 2, 3, 4, 5].map((star) => (
                <Ionicons
                  key={star}
                  name={star <= (item.reviewRating || 0) ? "star" : "star-outline"}
                  size={14}
                  color="#F59E0B"
                />
              ))}
              <ThemedText style={styles.pastCardReviewText}>Reviewed</ThemedText>
            </View>
          ) : (
            <Pressable
              style={styles.leaveReviewBtn}
              onPress={() =>
                router.push({
                  pathname: "/(dashboard)/myquotes/review",
                  params: { quoteId: item.quoteId },
                })
              }
            >
              <ThemedText style={styles.leaveReviewBtnText}>Leave Review</ThemedText>
            </Pressable>
          )}
        </>
      )}

      {/* Amount for completed */}
      {item.pastType === "completed" && item.priceInfo && (
        <ThemedText style={styles.pastCardAmount}>
          {item.priceInfo}
        </ThemedText>
      )}
    </Pressable>
  );
}

// Section header for Done tab groupings
function DoneSectionHeader({ title, count, expanded, onToggle }) {
  return (
    <Pressable style={styles.sectionHeader} onPress={onToggle}>
      <View style={styles.sectionHeaderLeft}>
        <ThemedText style={styles.sectionHeaderTitle}>{title}</ThemedText>
        {typeof count === "number" && (
          <ThemedText style={styles.sectionHeaderCount}>({count})</ThemedText>
        )}
      </View>
      {onToggle && (
        <View style={styles.sectionHeaderRight}>
          <ThemedText style={styles.sectionHeaderToggle}>
            {expanded ? "Hide" : "Show all"}
          </ThemedText>
          <Ionicons
            name={expanded ? "chevron-up" : "chevron-down"}
            size={16}
            color="#374151"
          />
        </View>
      )}
    </Pressable>
  );
}

// Empty state component
function EmptyState({ icon, title, subtitle, primaryAction, secondaryAction }) {
  return (
    <View style={styles.emptyState}>
      <View style={styles.emptyIconContainer}>
        <Ionicons name={icon} size={48} color="#9CA3AF" />
      </View>
      <ThemedText style={styles.emptyTitle}>{title}</ThemedText>
      <ThemedText style={styles.emptySubtitle}>{subtitle}</ThemedText>
      {primaryAction && (
        <>
          <Spacer height={16} />
          <Pressable style={styles.emptyPrimaryBtn} onPress={primaryAction.onPress}>
            <ThemedText style={styles.emptyPrimaryBtnText}>
              {primaryAction.label}
            </ThemedText>
          </Pressable>
        </>
      )}
      {secondaryAction && (
        <>
          <ThemedText style={styles.emptyOrText}>or</ThemedText>
          <Pressable style={styles.emptySecondaryBtn} onPress={secondaryAction.onPress}>
            <ThemedText style={styles.emptySecondaryBtnText}>
              {secondaryAction.label}
            </ThemedText>
          </Pressable>
        </>
      )}
    </View>
  );
}

// Request usage badge component
function RequestUsageBadge({ current, max, unlimited, label }) {
  const displayText = unlimited ? `${current}/∞` : `${current}/${max}`;
  const isNearLimit = !unlimited && max && current >= max - 1;
  const isAtLimit = !unlimited && max && current >= max;

  return (
    <View style={[
      usageStyles.badge,
      isAtLimit && usageStyles.badgeAtLimit,
      isNearLimit && !isAtLimit && usageStyles.badgeNearLimit,
    ]}>
      <ThemedText style={[
        usageStyles.badgeText,
        isAtLimit && usageStyles.badgeTextAtLimit,
      ]}>
        {label}: {displayText}
      </ThemedText>
    </View>
  );
}

const usageStyles = StyleSheet.create({
  usageContainer: {
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 20,
    paddingBottom: 12,
  },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 16,
    backgroundColor: "#F3F4F6",
  },
  badgeNearLimit: {
    backgroundColor: "#FEF3C7",
  },
  badgeAtLimit: {
    backgroundColor: "#FEE2E2",
  },
  badgeText: {
    fontSize: 13,
    fontWeight: "500",
    color: "#6B7280",
  },
  badgeTextAtLimit: {
    color: "#DC2626",
  },
});

export default function ClientProjects() {
  const { user } = useUser();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [filter, setFilter] = useState("all"); // all | quotes | active | done
  const [refreshing, setRefreshing] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [isFocusLoading, setIsFocusLoading] = useState(false);

  // Request usage data
  const [requestUsage, setRequestUsage] = useState(null);

  // Data from RPCs
  const [requests, setRequests] = useState([]);
  const [responses, setResponses] = useState([]);
  const [decideQuotes, setDecideQuotes] = useState([]);
  const [decidedQuotes, setDecidedQuotes] = useState([]);
  const [appointments, setAppointments] = useState([]);

  // Helper functions
  const daysSince = (date) => {
    if (!date) return 0;
    const diff = new Date() - new Date(date);
    return Math.floor(diff / (1000 * 60 * 60 * 24));
  };

  const formatDate = (date) => {
    if (!date) return "";
    const d = new Date(date);
    return d.toLocaleDateString(undefined, {
      weekday: "short",
      day: "numeric",
      month: "short",
    });
  };

  const formatTime = (date) => {
    if (!date) return "";
    const d = new Date(date);
    return d.toLocaleTimeString(undefined, {
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  // Fetch data
  const fetchAllData = useCallback(async () => {
    if (!user?.id) return;

    try {
      // Fetch request usage limits
      const { data: usageData } = await supabase.rpc("rpc_get_client_request_usage");
      if (usageData) {
        setRequestUsage(usageData);
      }

      // Requests (no quotes yet)
      const { data: reqData } = await supabase.rpc("rpc_client_list_requests");

      // For all requests, check if they have client-invited targets (direct request indicator)
      const requestIds = (reqData || []).map(r => r.id);
      let directRequestsMap = {};  // Maps request_id to trade info
      let tradeInfoMap = {};

      if (requestIds.length > 0) {
        // Check for client-invited targets (indicates direct request)
        const { data: targetsData } = await supabase
          .from("request_targets")
          .select("request_id, trade_id, invited_by, profiles:trade_id(business_name, full_name)")
          .in("request_id", requestIds);

        (targetsData || []).forEach(t => {
          if (t.request_id) {
            // If this target was invited by client, mark request as direct and get trade name
            if (t.invited_by === "client" && t.profiles) {
              directRequestsMap[t.request_id] = true;
              tradeInfoMap[t.request_id] = t.profiles.business_name || t.profiles.full_name || "Trade";
            }
          }
        });
      }

      // Enrich requests with is_direct flag and trade business name
      const enrichedReqData = (reqData || []).map(r => {
        // Use is_direct from RPC if available, or check directRequestsMap
        const isDirectRequest = r.is_direct === true || directRequestsMap[r.id] === true;
        return {
          ...r,
          is_direct: isDirectRequest,
          trade_business_name: isDirectRequest ? tradeInfoMap[r.id] || r.trade_business_name || null : null,
        };
      });

      setRequests(enrichedReqData);

      // Responses (trades responded)
      const { data: resData } = await supabase.rpc("rpc_client_list_responses");

      // For responses, we need to check if the request is a direct request
      // by looking up the quote_requests table for is_direct field or request_targets
      const responseReqIds = [...new Set((resData || []).map(r => r.request_id).filter(Boolean))];
      let directRequestIds = new Set();

      if (responseReqIds.length > 0) {
        // Check quote_requests table for is_direct flag
        const { data: reqDirectData } = await supabase
          .from("quote_requests")
          .select("id, is_direct")
          .in("id", responseReqIds);

        (reqDirectData || []).forEach(r => {
          if (r.is_direct) {
            directRequestIds.add(r.id);
          }
        });

        // Also check request_targets for invited_by='client' as fallback
        const { data: targetData } = await supabase
          .from("request_targets")
          .select("request_id")
          .in("request_id", responseReqIds)
          .eq("invited_by", "client");

        (targetData || []).forEach(t => {
          directRequestIds.add(t.request_id);
        });
      }

      // Enrich responses with is_direct flag
      const enrichedResData = (resData || []).map(r => ({
        ...r,
        is_direct: directRequestIds.has(r.request_id),
      }));

      setResponses(enrichedResData);

      // Quotes to decide
      const { data: decideData } = await supabase.rpc("rpc_client_list_decide_v2", {
        p_days: 30,
        p_limit: 50,
      });
      setDecideQuotes(decideData || []);

      // Past decisions
      const { data: decidedData } = await supabase.rpc(
        "rpc_client_list_decided_quotes",
        {
          p_days: 90,
          p_limit: 50,
        }
      );

      // Fetch client's reviews to check which quotes have been reviewed
      const completedQuoteIds = (decidedData || [])
        .filter((q) => q.status === "completed")
        .map((q) => q.quote_id)
        .filter(Boolean);

      let reviewsByQuoteId = {};
      if (completedQuoteIds.length > 0) {
        const { data: reviewsData } = await supabase
          .from("reviews")
          .select("quote_id, rating")
          .eq("reviewer_id", user.id)
          .in("quote_id", completedQuoteIds);

        (reviewsData || []).forEach((r) => {
          if (r.quote_id) {
            reviewsByQuoteId[r.quote_id] = r.rating;
          }
        });
      }

      // Enrich decided quotes with review info
      const enrichedDecidedData = (decidedData || []).map((q) => ({
        ...q,
        client_review_rating: reviewsByQuoteId[q.quote_id] || null,
      }));

      setDecidedQuotes(enrichedDecidedData);

      // Appointments
      const { data: apptData } = await supabase.rpc("rpc_client_list_appointments", {
        p_only_upcoming: true,
      });
      setAppointments(apptData || []);

      // Also fetch appointments by request_id for survey appointments
      const reqIdsFromRequests = (reqData || []).map((r) => r.id);
      const reqIdsFromResponses = (resData || [])
        .map((r) => r.request_id)
        .filter(Boolean);
      const allReqIds = [...new Set([...reqIdsFromRequests, ...reqIdsFromResponses])];

      if (allReqIds.length > 0) {
        const directPromises = allReqIds.map(async (reqId) => {
          const { data } = await supabase
            .from("appointments")
            .select("*")
            .eq("request_id", reqId)
            .order("scheduled_at", { ascending: true });
          return { data: data || [], reqId };
        });
        const directResults = await Promise.all(directPromises);

        let requestApptData = directResults.flatMap((r) =>
          (r.data || []).map((appt) => ({
            ...appt,
            request_id: appt.request_id || r.reqId,
          }))
        );

        if (requestApptData.length > 0) {
          const existingIds = new Set((apptData || []).map((a) => a.id));
          const newAppts = requestApptData.filter(
            (a) => a && a.id && !existingIds.has(a.id)
          );
          const mergedAppts = [...(apptData || []), ...newAppts];
          setAppointments(mergedAppts);
        }
      }
    } catch (err) {
      Alert.alert("Error", err.message);
    } finally {
      setInitialLoading(false);
    }
  }, [user?.id]);

  // Confirm job completion with overlay
  const confirmJobComplete = useCallback(async (quoteId, tradeName) => {
    Alert.alert(
      "Confirm Completion",
      "Are you sure the job has been completed to your satisfaction?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Confirm",
          style: "default",
          onPress: async () => {
            try {
              const { error } = await supabase.rpc("rpc_client_confirm_complete", {
                p_quote_id: quoteId,
              });
              if (error) throw error;

              // Refresh data after confirmation
              fetchAllData();

              // Navigate to completion success / leave review
              router.push({
                pathname: "/(dashboard)/myquotes/completion-success",
                params: { quoteId, tradeName },
              });
            } catch (err) {
              console.error("Error confirming completion:", err);
              Alert.alert("Error", err.message || "Could not confirm completion.");
            }
          },
        },
      ]
    );
  }, [fetchAllData, router]);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchAllData();
    setRefreshing(false);
  };

  useFocusEffect(
    useCallback(() => {
      if (user?.id) {
        if (!initialLoading) {
          setIsFocusLoading(true);
        }
        fetchAllData().finally(() => {
          setIsFocusLoading(false);
        });
      }
    }, [user?.id, fetchAllData, initialLoading])
  );

  useEffect(() => {
    if (!user?.id) return;
    fetchAllData();

    // Realtime subscriptions
    const chQuotes = supabase
      .channel("client-quotes-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "tradify_native_app_db" },
        () => fetchAllData()
      )
      .subscribe();

    const chReq = supabase
      .channel("client-requests-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "quote_requests" },
        () => fetchAllData()
      )
      .subscribe();

    const chAppts = supabase
      .channel("client-appointments-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "appointments" },
        () => fetchAllData()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(chQuotes);
      supabase.removeChannel(chReq);
      supabase.removeChannel(chAppts);
    };
  }, [user?.id, fetchAllData]);

  // Transform data into project cards
  const projects = useMemo(() => {
    const allProjects = [];

    // Build set of requests with accepted/completed quotes (from decidedQuotes)
    // These requests should not appear in the QUOTES stage
    const acceptedStatuses = ["accepted", "awaiting_completion", "completed"];
    const requestsWithAcceptedQuote = new Set();
    const decidedQuoteIds = new Set(); // Track quote IDs that have been decided
    decidedQuotes.forEach((q) => {
      const status = String(q.status || "").toLowerCase();
      // Add quote_id to decided set (these should not appear in decideQuotes)
      if (q.quote_id) {
        decidedQuoteIds.add(q.quote_id);
      }
      if (acceptedStatuses.includes(status) && q.request_id) {
        requestsWithAcceptedQuote.add(q.request_id);
      }
    });

    // Process open requests (no quotes yet) - Stage: POSTED
    requests.forEach((req) => {
      if (requestsWithAcceptedQuote.has(req.id)) return;

      const requestAppointments = appointments.filter((a) => a.request_id === req.id);
      const now = new Date();
      const upcomingAppointments = requestAppointments
        .filter((a) => new Date(a.scheduled_at) > now)
        .sort((a, b) => new Date(a.scheduled_at) - new Date(b.scheduled_at));
      const nextAppt = upcomingAppointments[0];
      const apptStatus = nextAppt?.status?.toLowerCase();

      let statusType = "waiting";
      let statusText = "Waiting for trades";
      let statusDetail = `Posted ${daysSince(req.created_at) || 0} hours ago`;
      let subStatus = null;

      if (apptStatus === "proposed") {
        statusType = "action";
        statusText = "Confirm survey visit";
        statusDetail = `${formatDate(nextAppt.scheduled_at)}, ${formatTime(nextAppt.scheduled_at)}`;
        subStatus = "appointment_pending";
      } else if (apptStatus === "confirmed") {
        statusType = "scheduled";
        statusText = "Survey visit confirmed";
        statusDetail = `${formatDate(nextAppt.scheduled_at)}, ${formatTime(nextAppt.scheduled_at)}`;
        subStatus = "appointment_confirmed";
      }

      const isDirectRequest = req.request_type === "direct" || req.is_direct;

      // For direct requests, show "Waiting for trade" (not repeating the trade name)
      if (isDirectRequest && statusType === "waiting") {
        statusText = "Waiting for trade";
      }

      const contextLine = isDirectRequest
        ? `Direct request · ${req.trade_business_name || "Trade"}`
        : `Open request · ${req.target_count || 5} trades invited`;

      allProjects.push({
        id: `request-${req.id}`,
        type: "request",
        stage: "POSTED",
        stageIndex: 0,
        progressPosition: getClientProgressPosition("POSTED", subStatus),
        requestId: req.id,
        title: req.suggested_title || "Untitled job",
        requestType: isDirectRequest ? "direct" : "open",
        contextLine,
        statusType,
        statusText,
        statusDetail,
        priceInfo: null,
        actions:
          apptStatus === "proposed"
            ? [
                {
                  label: "Decline",
                  primary: false,
                  onPress: () => {},
                },
                {
                  label: "Confirm",
                  primary: true,
                  onPress: () =>
                    router.push(`/(dashboard)/myquotes/request/${req.id}`),
                },
              ]
            : null,
        appointmentId: nextAppt?.id,
        sortPriority: statusType === "action" ? 1 : statusType === "scheduled" ? 2 : 3,
      });
    });

    // Process responses (trades preparing) - Stage: QUOTES
    const decidedTradesByRequest = {};
    decidedQuotes.forEach((q) => {
      const reqId = q.request_id;
      if (!decidedTradesByRequest[reqId]) {
        decidedTradesByRequest[reqId] = new Set();
      }
      decidedTradesByRequest[reqId].add(q.trade_id);
    });

    const responsesByRequest = {};
    responses.forEach((r) => {
      const reqId = r.request_id;
      const status = String(r.decision_status || "").toLowerCase();
      if (!reqId) return;
      if (requestsWithAcceptedQuote.has(reqId)) return;
      if (decidedTradesByRequest[reqId]?.has(r.trade_id)) return;

      // Check if this is a direct request (from enriched is_direct flag)
      const isDirectRequest = r.is_direct === true;

      if (!responsesByRequest[reqId]) {
        responsesByRequest[reqId] = {
          requestId: reqId,
          title: r.suggested_title || "Untitled job",
          preparingTrades: [],
          isDirectRequest: isDirectRequest,
        };
      }

      if (status === "accepted") {
        responsesByRequest[reqId].preparingTrades.push({
          id: r.trade_id,
          name: r.trade_business_name || "Trade",
        });
      }
    });

    Object.values(responsesByRequest).forEach((group) => {
      if (group.preparingTrades.length === 0) return;

      const isDirectRequest = group.isDirectRequest;
      const tradeName = group.preparingTrades[0]?.name || "Trade";

      // Build context line based on request type
      const contextLine = isDirectRequest
        ? `Direct request · ${tradeName}`
        : `Open request · ${group.preparingTrades.length} trades preparing`;

      // Check for existing request card and skip if already added
      const existingRequest = allProjects.find(
        (p) => p.type === "request" && p.requestId === group.requestId
      );
      if (existingRequest) {
        // Update existing with preparing info
        existingRequest.contextLine = contextLine;
        existingRequest.stage = "QUOTES";
        existingRequest.stageIndex = 1;
        existingRequest.progressPosition = getClientProgressPosition("QUOTES", "preparing");
        return;
      }

      const requestAppointments = appointments.filter(
        (a) => a.request_id === group.requestId
      );
      const now = new Date();
      const upcomingAppointments = requestAppointments
        .filter((a) => new Date(a.scheduled_at) > now)
        .sort((a, b) => new Date(a.scheduled_at) - new Date(b.scheduled_at));
      const nextAppt = upcomingAppointments[0];
      const apptStatus = nextAppt?.status?.toLowerCase();

      let statusType = "waiting";
      // For direct requests: "Preparing your quote", for open: "X trades preparing quotes"
      let statusText = isDirectRequest
        ? "Preparing your quote"
        : `${group.preparingTrades.length} trade${group.preparingTrades.length > 1 ? "s" : ""} preparing quotes`;
      let statusDetail = null;
      let subStatus = "preparing";

      if (apptStatus === "proposed") {
        statusType = "action";
        statusText = "Confirm survey visit";
        statusDetail = `${formatDate(nextAppt.scheduled_at)}, ${formatTime(nextAppt.scheduled_at)}`;
        subStatus = "appointment_pending";
      } else if (apptStatus === "confirmed") {
        statusType = "scheduled";
        statusText = "Survey visit confirmed";
        statusDetail = `${formatDate(nextAppt.scheduled_at)}, ${formatTime(nextAppt.scheduled_at)}`;
        subStatus = "appointment_confirmed";
      }

      // Build actions based on appointment status
      let actions = null;
      if (apptStatus === "proposed") {
        actions = [
          { label: "Decline", primary: false },
          {
            label: "Confirm",
            primary: true,
            onPress: () =>
              router.push(`/(dashboard)/myquotes/request/${group.requestId}`),
          },
        ];
      } else {
        // Show Message button when trade has accepted (preparing quote)
        actions = [
          {
            label: "Message",
            primary: true,
            onPress: () =>
              router.push({
                pathname: "/(dashboard)/messages/[id]",
                params: {
                  id: String(group.requestId),
                  name: tradeName,
                  returnTo: "/(dashboard)/myquotes",
                },
              }),
          },
        ];
      }

      allProjects.push({
        id: `preparing-${group.requestId}`,
        type: "preparing",
        stage: "QUOTES",
        stageIndex: 1,
        progressPosition: getClientProgressPosition("QUOTES", subStatus),
        requestId: group.requestId,
        title: group.title,
        requestType: isDirectRequest ? "direct" : "open",
        contextLine,
        statusType,
        statusText,
        statusDetail,
        priceInfo: null,
        actions,
        sortPriority: statusType === "action" ? 1 : 3,
      });
    });

    // Process quotes to decide - Stage: QUOTES
    // Exclude completed/declined/expired quotes - they should only appear in DONE stage
    // Also exclude quotes that are already in decidedQuotes (to avoid duplicates)
    const quotesByRequest = {};
    const doneStatuses = ["completed", "declined", "expired", "draft"];
    const visibleDecideQuotes = decideQuotes.filter((q) => {
      const status = String(q.status || "").toLowerCase();
      // Exclude done statuses, requests with accepted quote, and quotes already in decidedQuotes
      if (doneStatuses.includes(status)) return false;
      if (requestsWithAcceptedQuote.has(q.request_id)) return false;
      if (decidedQuoteIds.has(q.quote_id)) return false;
      return true;
    });

    const seenQuoteIds = new Set();
    visibleDecideQuotes
      .filter((q) => {
        if (!q.quote_id || seenQuoteIds.has(q.quote_id)) return false;
        seenQuoteIds.add(q.quote_id);
        return true;
      })
      .forEach((q) => {
        const reqId = q.request_id;
        if (!reqId) return;
        if (!quotesByRequest[reqId]) {
          quotesByRequest[reqId] = {
            requestId: reqId,
            title: q.request_suggested_title || q.project_title || "Untitled job",
            quotes: [],
            lowestPrice: null,
            highestPrice: null,
            tradeName: null,
          };
        }
        quotesByRequest[reqId].quotes.push(q);
        const price = q.grand_total;
        if (price) {
          if (
            quotesByRequest[reqId].lowestPrice === null ||
            price < quotesByRequest[reqId].lowestPrice
          ) {
            quotesByRequest[reqId].lowestPrice = price;
          }
          if (
            quotesByRequest[reqId].highestPrice === null ||
            price > quotesByRequest[reqId].highestPrice
          ) {
            quotesByRequest[reqId].highestPrice = price;
          }
        }
        if (quotesByRequest[reqId].quotes.length === 1) {
          quotesByRequest[reqId].tradeName = q.trade_business_name;
        }
      });

    Object.values(quotesByRequest).forEach((group) => {
      const quotesCount = group.quotes.length;

      // Check if all quotes are from the same trade (direct request with multiple quote options)
      // A single trade can send up to 3 quotes for a direct request
      // First try trade_id, fallback to trade_business_name for RPC results that don't include trade_id
      const uniqueTradeIds = [...new Set(group.quotes.map(q => q.trade_id).filter(Boolean))];
      const uniqueTradeNames = [...new Set(group.quotes.map(q => q.trade_business_name).filter(Boolean))];

      // If we have trade_ids, use those; otherwise use trade names as proxy
      const isSingleTrade = uniqueTradeIds.length > 0
        ? uniqueTradeIds.length === 1
        : uniqueTradeNames.length === 1;
      const isDirectRequest = isSingleTrade; // Direct request = all quotes from same trade

      const oldestQuote = group.quotes.reduce((oldest, q) => {
        const qDate = new Date(q.issued_at);
        return !oldest || qDate < new Date(oldest.issued_at) ? q : oldest;
      }, null);
      const daysOld = oldestQuote ? daysSince(oldestQuote.issued_at) : 0;
      const expiryDays = 14 - daysOld;
      const expiresSoon = expiryDays <= 3 && expiryDays > 0;

      let statusType = "action";
      let statusText =
        quotesCount === 1
          ? "Quote received"
          : isDirectRequest
            ? `${quotesCount} quote options received` // Same trade sent multiple options
            : `${quotesCount} quotes ready`; // Multiple trades
      let statusDetail = null;

      if (expiresSoon) {
        statusText = `Quote expires in ${expiryDays} day${expiryDays !== 1 ? "s" : ""}`;
        if (isDirectRequest && group.tradeName) {
          statusDetail = `${group.tradeName} · £${formatNumber(group.lowestPrice)}`;
        }
      }

      let priceInfo = null;
      if (group.lowestPrice) {
        if (quotesCount > 1 && group.lowestPrice !== group.highestPrice) {
          priceInfo = `£${formatNumber(group.lowestPrice)} - £${formatNumber(group.highestPrice)}`;
        } else {
          priceInfo = `£${formatNumber(group.lowestPrice)}`;
        }
      }

      // Context line: show trade name for direct requests, quote count for open requests
      const contextLine = isDirectRequest
        ? `Direct request · ${group.tradeName || "Trade"}`
        : `Open request · ${quotesCount} quote${quotesCount !== 1 ? "s" : ""}`;

      // Remove any existing request/preparing card for this request
      const existingIdx = allProjects.findIndex(
        (p) =>
          (p.type === "request" || p.type === "preparing") &&
          p.requestId === group.requestId
      );
      if (existingIdx >= 0) {
        allProjects.splice(existingIdx, 1);
      }

      // Action button label depends on whether it's same trade (options) or different trades (compare)
      const actionLabel = quotesCount === 1
        ? "View Quote"
        : isDirectRequest
          ? "View Options" // Same trade sent multiple quote options
          : "Compare Quotes"; // Multiple different trades

      allProjects.push({
        id: `quotes-${group.requestId}`,
        type: "quotes",
        stage: "QUOTES",
        stageIndex: 1,
        progressPosition: getClientProgressPosition("QUOTES", "quotes_received"),
        requestId: group.requestId,
        title: group.title,
        requestType: isDirectRequest ? "direct" : "open",
        contextLine,
        statusType,
        statusText,
        statusDetail,
        priceInfo,
        actions: [
          {
            label: actionLabel,
            primary: true,
            onPress: () =>
              router.push(`/(dashboard)/myquotes/request/${group.requestId}`),
          },
        ],
        sortPriority: expiresSoon ? 1 : 2,
      });
    });

    // Process decided quotes (accepted = active, completed = done) - Stages: HIRED, DONE
    const activeByRequest = {};
    const visibleDecidedQuotes = decidedQuotes.filter((q) => q.status !== "draft");

    visibleDecidedQuotes.forEach((q) => {
      const status = String(q.status || "").toLowerCase();
      const reqId = q.request_id;

      if (
        status === "accepted" ||
        status === "awaiting_completion" ||
        status === "issue_reported" ||
        status === "issue_resolved_pending"
      ) {
        if (!activeByRequest[reqId]) {
          activeByRequest[reqId] = {
            requestId: reqId,
            title: q.request_suggested_title || q.project_title || "Active job",
            quoteId: q.quote_id,
            tradeName: q.trade_business_name || "Trade",
            amount: q.grand_total,
            status,
          };
        }
        // Update with highest priority status
        const statusPriority = {
          issue_reported: 0,
          issue_resolved_pending: 1,
          awaiting_completion: 2,
          accepted: 3,
        };
        if (statusPriority[status] < statusPriority[activeByRequest[reqId].status]) {
          activeByRequest[reqId].status = status;
        }
      } else if (status === "completed") {
        // Move to done
        allProjects.push({
          id: `completed-${q.quote_id}`,
          type: "completed",
          stage: "DONE",
          stageIndex: 3,
          progressPosition: 100,
          requestId: reqId,
          quoteId: q.quote_id,
          title: q.request_suggested_title || q.project_title || "Job",
          requestType: "direct",
          contextLine: `${q.trade_business_name} · Completed ${formatDate(q.completion_confirmed_at || q.updated_at)} · £${formatNumber(q.grand_total)}`,
          statusType: "completed",
          statusText: "Completed",
          statusDetail: formatDate(q.completion_confirmed_at || q.updated_at),
          priceInfo: `£${formatNumber(q.grand_total)}`,
          hasReview: !!q.client_review_rating,
          reviewRating: q.client_review_rating,
          pastType: "completed",
          actions: q.client_review_rating
            ? null
            : [
                {
                  label: "Leave Review",
                  primary: true,
                  onPress: () =>
                    router.push({
                      pathname: "/(dashboard)/myquotes/leave-review",
                      params: {
                        quoteId: q.quote_id,
                        revieweeName: q.trade_business_name || "Tradesperson",
                        revieweeType: "trade",
                        tradePhotoUrl: q.trade_photo_url || "",
                        jobTitle: q.request_suggested_title || q.project_title || "Job",
                      },
                    }),
                },
              ],
          sortPriority: q.client_review_rating ? 5 : 2,
        });
      } else if (status === "declined") {
        // Client declined - this means client chose another trade or cancelled
        allProjects.push({
          id: `cancelled-${q.quote_id}`,
          type: "cancelled",
          stage: "CANCELLED",
          stageIndex: 3,
          progressPosition: 37.5,
          requestId: reqId,
          quoteId: q.quote_id,
          title: q.request_suggested_title || q.project_title || "Quote",
          requestType: "direct",
          contextLine: `You cancelled · ${daysSince(q.updated_at)} days ago`,
          statusType: "cancelled",
          statusText: "You declined this quote",
          statusDetail: `${daysSince(q.updated_at)} days ago`,
          priceInfo: null,
          pastType: "cancelled",
          explanation: "You declined this quote",
          sortPriority: 5,
        });
      } else if (status === "expired") {
        // Quote received but client never responded - goes to EXPIRED in Done tab
        allProjects.push({
          id: `expired-${q.quote_id}`,
          type: "expired",
          stage: "EXPIRED",
          stageIndex: 1,
          progressPosition: 37.5,
          requestId: reqId,
          quoteId: q.quote_id,
          title: q.request_suggested_title || q.project_title || "Quote",
          requestType: "direct",
          contextLine: `${q.trade_business_name || "Trade"} · £${formatNumber(q.grand_total)} quoted · Expired ${daysSince(q.updated_at)} days ago`,
          statusType: "expired",
          statusText: "Quote expired",
          statusDetail: "No response within 14 days",
          priceInfo: `£${formatNumber(q.grand_total)}`,
          pastType: "expired",
          explanation: "You didn't respond to the quote in time",
          sortPriority: 5,
        });
      }
    });

    // Process active jobs
    Object.values(activeByRequest).forEach((group) => {
      const relatedAppointments = appointments
        .filter((appt) => appt.quote_id === group.quoteId)
        .sort((a, b) => new Date(a.scheduled_at) - new Date(b.scheduled_at));
      const nextAppt = relatedAppointments[0];
      const apptStatus = nextAppt?.status?.toLowerCase();

      let statusType = "scheduled";
      let statusText = "Quote accepted";
      let statusDetail = "Waiting for work schedule";
      let subStatus = null;
      let actions = [
        {
          label: "Message",
          primary: false,
          onPress: () =>
            router.push({
              pathname: "/(dashboard)/messages/[id]",
              params: { id: group.requestId, quoteId: group.quoteId },
            }),
        },
      ];

      if (group.status === "awaiting_completion") {
        statusType = "action";
        statusText = "Confirm job complete";
        statusDetail = "Trade marked as finished";
        subStatus = "awaiting_completion";
        actions = [
          {
            label: "Report Issue",
            primary: false,
            onPress: () =>
              router.push({
                pathname: "/(dashboard)/myquotes/report-issue",
                params: { quoteId: group.quoteId, requestId: group.requestId, tradeName: group.tradeName },
              }),
          },
          {
            label: "Confirm",
            primary: true,
            onPress: () => confirmJobComplete(group.quoteId, group.tradeName),
          },
        ];
      } else if (group.status === "issue_reported") {
        statusType = "issue";
        statusText = "Issue reported";
        statusDetail = "Waiting for trade to respond";
        subStatus = "issue_reported";
        actions = [
          {
            label: "Message",
            primary: true,
            onPress: () =>
              router.push({
                pathname: "/(dashboard)/messages/[id]",
                params: { id: group.requestId, quoteId: group.quoteId },
              }),
          },
        ];
      } else if (group.status === "issue_resolved_pending") {
        statusType = "action";
        statusText = "Is the issue resolved?";
        statusDetail = "Trade responded to your issue";
        subStatus = "issue_resolved_pending";
        actions = [
          {
            label: "Still not right",
            primary: false,
            onPress: () =>
              router.push({
                pathname: "/(dashboard)/myquotes/completion-response",
                params: { quoteId: group.quoteId },
              }),
          },
          {
            label: "Yes, all sorted",
            primary: true,
            onPress: () =>
              router.push({
                pathname: "/(dashboard)/myquotes/completion-response",
                params: { quoteId: group.quoteId },
              }),
          },
        ];
      } else if (apptStatus === "proposed") {
        statusType = "action";
        statusText = "Confirm work visit";
        statusDetail = `${formatDate(nextAppt.scheduled_at)}, ${formatTime(nextAppt.scheduled_at)}`;
        subStatus = "work_pending";
        actions = [
          {
            label: "Suggest Time",
            primary: false,
            onPress: () =>
              router.push({
                pathname: "/(dashboard)/myquotes/appointment-response",
                params: { appointmentId: nextAppt.id, quoteId: group.quoteId },
              }),
          },
          {
            label: "Confirm",
            primary: true,
            onPress: () =>
              router.push(`/(dashboard)/myquotes/${group.quoteId}`),
          },
        ];
      } else if (apptStatus === "confirmed") {
        statusType = "scheduled";
        statusText = "Work scheduled";
        statusDetail = `${formatDate(nextAppt.scheduled_at)}, ${formatTime(nextAppt.scheduled_at)}`;
        subStatus = "work_confirmed";
      }

      allProjects.push({
        id: `active-${group.requestId}`,
        type: "active",
        stage: "HIRED",
        stageIndex: 2,
        progressPosition: getClientProgressPosition("HIRED", subStatus),
        requestId: group.requestId,
        quoteId: group.quoteId,
        title: group.title,
        requestType: "direct",
        contextLine: `${group.tradeName} · £${formatNumber(group.amount)}`,
        statusType,
        statusText,
        statusDetail,
        priceInfo: null,
        actions,
        sortPriority:
          statusType === "issue"
            ? 0
            : statusType === "action"
            ? 1
            : statusType === "scheduled"
            ? 2
            : 3,
      });
    });

    // Sort by priority
    allProjects.sort((a, b) => {
      if (a.sortPriority !== b.sortPriority) {
        return a.sortPriority - b.sortPriority;
      }
      return 0;
    });

    return allProjects;
  }, [
    requests,
    responses,
    decideQuotes,
    decidedQuotes,
    appointments,
    router,
    daysSince,
    formatDate,
    formatTime,
    confirmJobComplete,
  ]);

  // Filter projects
  const filteredProjects = useMemo(() => {
    switch (filter) {
      case "quotes":
        return projects.filter(
          (p) => p.stage === "POSTED" || p.stage === "QUOTES"
        );
      case "active":
        return projects.filter((p) => p.stage === "HIRED");
      case "done":
        // Done includes completed, expired, and cancelled
        return projects.filter((p) => DONE_STAGES.includes(p.stage));
      default:
        // "All" shows everything except done stages
        return projects.filter((p) => !DONE_STAGES.includes(p.stage));
    }
  }, [projects, filter]);

  // Grouped done projects for Done tab
  const doneGrouped = useMemo(() => {
    const doneProjects = projects.filter((p) => DONE_STAGES.includes(p.stage));
    return {
      completed: doneProjects.filter((p) => p.stage === "DONE"),
      expired: doneProjects.filter((p) => p.stage === "EXPIRED"),
      cancelled: doneProjects.filter((p) => p.stage === "CANCELLED"),
    };
  }, [projects]);

  // Section expansion state for Done tab
  const [expandedDoneSections, setExpandedDoneSections] = useState({
    completed: true,
    expired: true,
    cancelled: false,
  });

  const toggleDoneSection = (section) => {
    setExpandedDoneSections((prev) => ({ ...prev, [section]: !prev[section] }));
  };

  // Counts
  const counts = useMemo(() => {
    const doneCount = projects.filter((p) => DONE_STAGES.includes(p.stage)).length;
    const all = projects.filter((p) => !DONE_STAGES.includes(p.stage)).length;
    const quotes = projects.filter(
      (p) => p.stage === "POSTED" || p.stage === "QUOTES"
    ).length;
    const active = projects.filter((p) => p.stage === "HIRED").length;
    return { all, quotes, active, done: doneCount };
  }, [projects]);

  const isLoading = initialLoading || isFocusLoading;

  return (
    <ThemedView style={styles.container}>
      <StatusBar style="dark" backgroundColor="#FFFFFF" />

      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 16 }]}>
        <ThemedText style={styles.headerTitle}>My Projects</ThemedText>
      </View>

      {/* Request usage badges */}
      {requestUsage && (
        <View style={usageStyles.usageContainer}>
          <RequestUsageBadge
            current={requestUsage.open_requests?.current || 0}
            max={requestUsage.open_requests?.max}
            unlimited={requestUsage.open_requests?.unlimited}
            label="Open"
          />
          <RequestUsageBadge
            current={requestUsage.direct_requests?.current || 0}
            max={requestUsage.direct_requests?.max}
            unlimited={requestUsage.direct_requests?.unlimited}
            label="Direct"
          />
        </View>
      )}

      {/* Filter pills */}
      <View style={styles.filterRow}>
        <FilterPill
          active={filter === "all"}
          label="All"
          count={counts.all}
          onPress={() => setFilter("all")}
        />
        <FilterPill
          active={filter === "quotes"}
          label="Quotes"
          count={counts.quotes}
          onPress={() => setFilter("quotes")}
        />
        <FilterPill
          active={filter === "active"}
          label="Active"
          count={counts.active}
          onPress={() => setFilter("active")}
        />
        <FilterPill
          active={filter === "done"}
          label="Done"
          count={counts.done}
          onPress={() => setFilter("done")}
        />
      </View>

      <ScrollView
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        contentContainerStyle={styles.scrollContent}
      >
        {isLoading && <ProjectsPageSkeleton paddingTop={0} />}

        {/* Regular project cards for non-Done tabs */}
        {!isLoading && filter !== "done" && filteredProjects.length > 0 && (
          <View style={styles.projectsList}>
            {filteredProjects.map((project) => (
              <ProjectCard
                key={project.id}
                item={project}
                onPress={() => {
                  if (project.quoteId) {
                    router.push(`/(dashboard)/myquotes/${project.quoteId}`);
                  } else {
                    router.push(
                      `/(dashboard)/myquotes/request/${project.requestId}`
                    );
                  }
                }}
              />
            ))}
          </View>
        )}

        {/* Grouped sections for Done tab */}
        {!isLoading && filter === "done" && (
          <View style={styles.projectsList}>
            {/* COMPLETED Section */}
            {doneGrouped.completed.length > 0 && (
              <>
                <DoneSectionHeader
                  title="COMPLETED"
                  count={doneGrouped.completed.length}
                />
                {doneGrouped.completed.map((project) => (
                  <ClientPastCard
                    key={project.id}
                    item={project}
                    onPress={() => {
                      if (project.quoteId) {
                        router.push(`/(dashboard)/myquotes/${project.quoteId}`);
                      }
                    }}
                  />
                ))}
              </>
            )}

            {/* EXPIRED Section */}
            {doneGrouped.expired.length > 0 && (
              <>
                <DoneSectionHeader
                  title="EXPIRED"
                  count={doneGrouped.expired.length}
                  expanded={expandedDoneSections.expired}
                  onToggle={() => toggleDoneSection("expired")}
                />
                {expandedDoneSections.expired &&
                  doneGrouped.expired.map((project) => (
                    <ClientPastCard
                      key={project.id}
                      item={project}
                      onPress={() => {
                        if (project.quoteId) {
                          router.push(`/(dashboard)/myquotes/${project.quoteId}`);
                        } else if (project.requestId) {
                          router.push(`/(dashboard)/myquotes/request/${project.requestId}`);
                        }
                      }}
                    />
                  ))}
              </>
            )}

            {/* CANCELLED Section */}
            {doneGrouped.cancelled.length > 0 && (
              <>
                <DoneSectionHeader
                  title="CANCELLED"
                  count={doneGrouped.cancelled.length}
                  expanded={expandedDoneSections.cancelled}
                  onToggle={() => toggleDoneSection("cancelled")}
                />
                {expandedDoneSections.cancelled &&
                  doneGrouped.cancelled.map((project) => (
                    <ClientPastCard
                      key={project.id}
                      item={project}
                      onPress={() => {
                        if (project.quoteId) {
                          router.push(`/(dashboard)/myquotes/${project.quoteId}`);
                        }
                      }}
                    />
                  ))}
              </>
            )}
          </View>
        )}

        {!isLoading && filter !== "done" && filteredProjects.length === 0 && filter === "all" && (
          <EmptyState
            icon="clipboard-outline"
            title="No projects yet"
            subtitle="Get quotes from verified local tradespeople"
            primaryAction={{
              label: "Get Quotes",
              onPress: () => router.push("/(dashboard)/client?openSearch=true"),
            }}
          />
        )}

        {!isLoading && filteredProjects.length === 0 && filter === "quotes" && (
          <EmptyState
            icon="document-text-outline"
            title="No quotes"
            subtitle="Create a request to receive quotes"
            primaryAction={{
              label: "Get Quotes",
              onPress: () => router.push("/(dashboard)/client?openSearch=true"),
            }}
          />
        )}

        {!isLoading && filteredProjects.length === 0 && filter === "active" && (
          <EmptyState
            icon="construct-outline"
            title="No active jobs"
            subtitle="Accept a quote to start a job"
          />
        )}

        {!isLoading && filter === "done" && doneGrouped.completed.length === 0 && doneGrouped.expired.length === 0 && doneGrouped.cancelled.length === 0 && (
          <EmptyState
            icon="checkmark-circle-outline"
            title="No past projects"
            subtitle="Completed, expired and cancelled projects will appear here"
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
    backgroundColor: "#FFFFFF",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingBottom: 12,
    backgroundColor: "#FFFFFF",
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: "700",
  },
  addButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#F3F4F6",
    alignItems: "center",
    justifyContent: "center",
  },
  filterRow: {
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 16,
  },
  // Filter pills - matches trade side Projects tab style
  filterPill: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 20,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  filterPillActive: {
    backgroundColor: TINT,
    borderColor: TINT,
  },
  filterPillText: {
    fontSize: 14,
    fontWeight: "500",
    color: "#6B7280",
  },
  filterPillTextActive: {
    color: "#FFFFFF",
  },
  filterPillCount: {
    fontSize: 14,
    fontWeight: "500",
    color: "#9CA3AF",
    marginLeft: 4,
  },
  filterPillCountActive: {
    color: "rgba(255,255,255,0.8)",
  },
  scrollContent: {
    paddingBottom: 20,
  },
  projectsList: {
    paddingHorizontal: 20,
    gap: 12,
  },
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
  cardTitleRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  cardTitleContent: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    gap: 8,
  },
  directBadge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: "#EDE9FE",
    alignItems: "center",
    justifyContent: "center",
  },
  cardServiceTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#111827",
    flex: 1,
  },
  menuButton: {
    padding: 4,
  },
  cardCategory: {
    fontSize: 14,
    color: "#6B7280",
    marginTop: 2,
  },
  contextLine: {
    fontSize: 14,
    color: "#6B7280",
    marginTop: 8,
  },
  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 8,
  },
  statusText: {
    fontSize: 14,
    fontWeight: "500",
  },
  detailLine: {
    fontSize: 14,
    color: "#6B7280",
    marginTop: 2,
    marginLeft: 22,
  },
  priceText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#111827",
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
  reviewRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 12,
  },
  reviewLabel: {
    fontSize: 13,
    color: "#6B7280",
    marginLeft: 4,
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
  emptyPrimaryBtn: {
    backgroundColor: TINT,
    borderRadius: 999,
    paddingVertical: 14,
    paddingHorizontal: 28,
    minWidth: 180,
    alignItems: "center",
  },
  emptyPrimaryBtnText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "600",
  },
  emptyOrText: {
    fontSize: 14,
    color: "#9CA3AF",
    marginVertical: 12,
  },
  emptySecondaryBtn: {
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 999,
    paddingVertical: 14,
    paddingHorizontal: 28,
    minWidth: 180,
    alignItems: "center",
  },
  emptySecondaryBtnText: {
    color: "#374151",
    fontSize: 16,
    fontWeight: "600",
  },
  // Past card styles for Done tab
  pastCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  pastCardMuted: {
    backgroundColor: "#F9FAFB",
    borderStyle: "dashed",
    borderColor: "#D1D5DB",
  },
  pastCardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  pastCardTitleContent: {
    flex: 1,
    marginRight: 12,
  },
  pastCardTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#1F2937",
  },
  pastCardTitleMuted: {
    color: "#6B7280",
  },
  pastCardCategory: {
    fontSize: 13,
    color: "#9CA3AF",
    marginTop: 2,
  },
  pastCardContext: {
    fontSize: 14,
    color: "#6B7280",
    marginTop: 8,
  },
  pastCardExplanation: {
    marginTop: 12,
  },
  dashedLine: {
    height: 1,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: "#D1D5DB",
    marginBottom: 8,
  },
  explanationText: {
    fontSize: 13,
    color: "#9CA3AF",
    fontStyle: "italic",
  },
  pastCardActionBtn: {
    marginTop: 12,
    alignSelf: "flex-end",
  },
  pastCardActionBtnText: {
    fontSize: 14,
    fontWeight: "600",
    color: TINT,
  },
  pastCardReviewBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    marginTop: 12,
  },
  pastCardReviewText: {
    fontSize: 12,
    color: "#6B7280",
    marginLeft: 4,
  },
  leaveReviewBtn: {
    marginTop: 12,
    alignSelf: "flex-end",
    backgroundColor: "#F3F4F6",
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
  },
  leaveReviewBtnText: {
    fontSize: 14,
    fontWeight: "600",
    color: TINT,
  },
  pastCardAmount: {
    fontSize: 16,
    fontWeight: "600",
    color: "#1F2937",
    marginTop: 8,
    textAlign: "right",
  },
  // Section header styles for Done tab
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 12,
    marginTop: 8,
  },
  sectionHeaderLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  sectionHeaderTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: "#6B7280",
    letterSpacing: 0.5,
  },
  sectionHeaderCount: {
    fontSize: 13,
    fontWeight: "500",
    color: "#9CA3AF",
  },
  sectionHeaderRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  sectionHeaderToggle: {
    fontSize: 13,
    fontWeight: "500",
    color: "#374151",
  },
});
