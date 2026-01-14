// app/(dashboard)/quotes/index.jsx
// Trade Projects Screen - v5 with Progress Bars and Visual Design
import { useCallback, useEffect, useState, useMemo } from "react";
import {
  StyleSheet,
  View,
  ScrollView,
  Pressable,
  RefreshControl,
} from "react-native";
import { useRouter } from "expo-router";
import { useFocusEffect } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";

import ThemedView from "../../../components/ThemedView";
import ThemedText from "../../../components/ThemedText";
import Spacer from "../../../components/Spacer";
import ProgressBar from "../../../components/ProgressBar";
import { ProjectsPageSkeleton } from "../../../components/Skeleton";
import { Colors } from "../../../constants/Colors";
import { useUser } from "../../../hooks/useUser";
import { supabase } from "../../../lib/supabase";

const TINT = Colors?.light?.tint || "#6849a7";

// Trade progress stages
const TRADE_STAGES = ["Request", "Quote", "Work", "Settled"];

// Status colors
const STATUS_COLORS = {
  action: { text: "#F59E0B", icon: "alert-circle" },     // Orange
  scheduled: { text: "#10B981", icon: "calendar" },       // Green
  waiting: { text: "#6B7280", icon: "hourglass" },        // Gray
  issue: { text: "#DC2626", icon: "alert-circle" },       // Red
  completed: { text: "#6B7280", icon: "checkmark" },      // Gray
  new: { text: "#3B82F6", icon: "sparkles" },             // Blue
};

// Format number with thousand separators
function formatNumber(num) {
  if (num == null || isNaN(num)) return "0.00";
  return Number(num).toLocaleString("en-GB", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
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

// Parse title: "Category - Service" or "Service, Category"
function parseTitle(suggestedTitle) {
  if (!suggestedTitle) return { service: "Project", category: "" };

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

// Calculate trade progress position
// ProgressBar stage dots at: 12.5%, 37.5%, 62.5%, 87.5%
// Progress fills from 0% left toward 100% right
// To light up a stage dot, progress must reach that dot's position
function getTradeProgressPosition(stage, subStatus) {
  switch (stage) {
    case "REQUEST":
      // Stage 0 (Request): Dot at 12.5% - show progress just at the dot
      return 12.5;
    case "QUOTE":
      // Stage 1 (Quote): Dot at 37.5%
      // Progress ranges from 12.5% (request) to 37.5% (quote reached)
      if (subStatus === "quote_sent") return 37.5; // Quote sent - reached Quote stage
      if (subStatus === "survey_completed") return 35; // Almost at Quote stage
      if (subStatus === "survey_confirmed") return 30;
      if (subStatus === "survey_proposed") return 25;
      return 20; // Default: working toward Quote stage
    case "WORK":
      // Stage 2 (Work): Dot at 62.5%
      // Progress ranges from 37.5% (quote) to 62.5% (work reached)
      if (subStatus === "awaiting_completion") return 75; // Past Work, heading to Done
      if (subStatus === "issue_resolved_pending") return 70;
      if (subStatus === "issue_reported") return 68;
      if (subStatus === "work_in_progress") return 65;
      if (subStatus === "work_confirmed") return 62.5; // Work scheduled - reached Work stage
      if (subStatus === "work_proposed") return 55;
      if (subStatus === "accepted_no_appt") return 45; // Quote accepted, need to schedule work
      return 50; // Default: working toward Work stage
    case "DONE":
      // Stage 3 (Settled): Dot at 87.5%
      return 87.5;
    default:
      return 12.5;
  }
}

// Filter pill component
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
      {typeof count === "number" && (
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

// Project card component - visual design with progress bar
function ProjectCard({ item, onPress }) {
  const router = useRouter();
  const { service, category } = parseTitle(item.title);
  const hasActions = item.actions && item.actions.length > 0;
  const isDirectRequest = item.requestType === "client";

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
      case "new":
        color = STATUS_COLORS.new;
        icon = "sparkles";
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
        stages={TRADE_STAGES}
        progressPosition={item.progressPosition}
        activeStageIndex={item.stageIndex}
      />

      {/* Context line - client info */}
      {item.contextLine && (
        <ThemedText style={styles.contextLine}>{item.contextLine}</ThemedText>
      )}

      {/* Job description preview for new requests */}
      {item.jobDescription && (
        <ThemedText style={styles.jobDescription} numberOfLines={2}>
          "{item.jobDescription}"
        </ThemedText>
      )}

      {/* Budget info for new requests */}
      {item.budgetInfo && (
        <ThemedText style={styles.budgetText}>{item.budgetInfo}</ThemedText>
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

      {/* Quote amount */}
      {item.quoteAmount && (
        <View style={styles.quoteAmountRow}>
          <ThemedText style={styles.quoteAmountLabel}>
            {item.quoteAmountLabel || "Quote total"}
          </ThemedText>
          <ThemedText style={styles.quoteAmountValue}>
            £{formatNumber(item.quoteAmount)}
          </ThemedText>
        </View>
      )}

      {/* Action buttons */}
      {hasActions && (
        <View style={styles.cardActions}>
          {item.actions.map((action, idx) => (
            <Pressable
              key={idx}
              style={[
                styles.actionBtn,
                action.primary
                  ? styles.actionBtnPrimary
                  : styles.actionBtnSecondary,
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
          <ThemedText style={styles.reviewLabel}>Client review</ThemedText>
        </View>
      )}
    </Pressable>
  );
}

// Empty state component
function EmptyState({ icon, title, subtitle, primaryAction }) {
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
          <Pressable
            style={styles.emptyPrimaryBtn}
            onPress={primaryAction.onPress}
          >
            <ThemedText style={styles.emptyPrimaryBtnText}>
              {primaryAction.label}
            </ThemedText>
          </Pressable>
        </>
      )}
    </View>
  );
}

export default function TradesmanProjects() {
  const router = useRouter();
  const { user } = useUser();
  const insets = useSafeAreaInsets();

  const [filter, setFilter] = useState("all"); // all | new | active | past
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Data
  const [inboxRows, setInboxRows] = useState([]);
  const [sentRows, setSentRows] = useState([]);
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

      // Fetch client names
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

      // Fetch appointments
      let appointmentsByQuote = {};
      let appointmentsByRequest = {};
      const { data: apptData } = await supabase.rpc(
        "rpc_trade_list_appointments",
        { p_only_upcoming: false }
      );

      (apptData || []).forEach((a) => {
        const normalized = {
          id: a.appointment_id || a.id,
          quote_id: a.quote_id,
          request_id: a.request_id,
          scheduled_at: a.scheduled_at,
          title: a.title || a.project_title,
          status: a.status,
          location: a.postcode || a.job_outcode,
          type: a.type, // survey or work
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
      setAppointments(apptData || []);

      // INBOX (no quote created yet)
      const inbox = (targets || [])
        .filter((t) => !quotedReqIds.has(t.request_id))
        .map((t) => {
          const r = reqById[t.request_id];
          const requestAge = daysSince(t.created_at);
          const isStale = requestAge >= 3;

          const contactInfo = clientContactByRequestId[t.request_id] || {};
          const clientFullName =
            contactInfo.name || clientNameByRequestId[t.request_id] || null;
          const contactUnlocked = contactInfo.contact_unlocked || false;

          // Get job description from request details
          // For direct requests, skip metadata lines and find actual description
          let jobDescription = null;
          if (r?.details) {
            const lines = String(r.details).split("\n");
            // Find first line that isn't metadata (doesn't start with known prefixes)
            const metadataPrefixes = ["Direct request to:", "Category:", "Service:", "Property:", "Postcode:", "Budget:", "Timing:", "Emergency:"];
            for (const line of lines) {
              const trimmedLine = line.trim();
              if (!trimmedLine) continue;

              // Check if line starts with "Description:" and extract the value
              if (trimmedLine.startsWith("Description:")) {
                const desc = trimmedLine.replace("Description:", "").trim();
                jobDescription = desc.length > 80 ? desc.slice(0, 80) + "..." : desc;
                break;
              }

              // Check if it's NOT a metadata line - that's the actual description
              const isMetadata = metadataPrefixes.some(prefix => trimmedLine.startsWith(prefix));
              if (!isMetadata) {
                jobDescription = trimmedLine.length > 80 ? trimmedLine.slice(0, 80) + "..." : trimmedLine;
                break;
              }
            }
          }

          const requestAppointments =
            appointmentsByRequest[t.request_id] || [];
          const now = new Date();
          const upcomingAppointments = requestAppointments
            .filter((a) => new Date(a.scheduled_at) > now)
            .sort((a, b) => new Date(a.scheduled_at) - new Date(b.scheduled_at));
          const nextAppointment = upcomingAppointments[0] || null;

          // Extract budget from budget_band column or from details string
          let budgetBand = r?.budget_band || null;
          if (!budgetBand && r?.details) {
            // Look for "Budget: £X" pattern in details
            const budgetMatch = String(r.details).match(/Budget:\s*([^\n]+)/i);
            if (budgetMatch) {
              budgetBand = budgetMatch[1].trim();
            }
          }

          return {
            request_id: t.request_id,
            invited_at: t.created_at,
            request_type: t.invited_by || "system",
            state: t.state,
            title: r?.suggested_title || "Project",
            created_at: r?.created_at,
            budget_band: budgetBand,
            postcode: r?.postcode || null,
            requestAge,
            isStale,
            jobDescription,
            clientFullName,
            clientName: getClientDisplayName(clientFullName, contactUnlocked),
            clientPostcode: contactInfo.postcode || r?.postcode || null,
            contactUnlocked,
            nextAppointment,
          };
        });

      // SENT (quote exists) - Group by request
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
            const aStatus = (a.status || "").toLowerCase();
            const bStatus = (b.status || "").toLowerCase();
            const priorityOrder = {
              completed: 0,
              awaiting_completion: 1,
              issue_reported: 2,
              issue_resolved_pending: 3,
              accepted: 4,
              sent: 5,
              created: 5,
              draft: 6,
              declined: 7,
              expired: 7,
            };
            const aPriority = priorityOrder[aStatus] ?? 5;
            const bPriority = priorityOrder[bStatus] ?? 5;
            if (aPriority !== bPriority) return aPriority - bPriority;
            return new Date(b.created_at) - new Date(a.created_at);
          });

          const primaryQuote = requestQuotes[0];
          const primaryStatus = (primaryQuote.status || "").toLowerCase();

          const issuedAt = primaryQuote.issued_at
            ? new Date(primaryQuote.issued_at)
            : null;
          const validUntil = primaryQuote.valid_until
            ? new Date(primaryQuote.valid_until)
            : null;
          const daysToExpiry = validUntil
            ? daysUntil(validUntil)
            : issuedAt
            ? 14 - daysSince(issuedAt)
            : null;
          const isExpiringSoon =
            daysToExpiry !== null && daysToExpiry <= 3 && daysToExpiry > 0;

          const daysSinceIssued = issuedAt ? daysSince(issuedAt) : 0;
          const clientNotResponding =
            primaryStatus === "sent" && daysSinceIssued >= 7;

          const allQuoteAppointments = requestQuotes.flatMap(
            (q) => appointmentsByQuote[q.id] || []
          );
          const requestAppointments =
            appointmentsByRequest[requestId] || [];
          const allAppointments =
            allQuoteAppointments.length > 0
              ? allQuoteAppointments
              : requestAppointments;
          const now = new Date();
          const upcomingAppointments = allAppointments
            .filter((a) => new Date(a.scheduled_at) > now)
            .sort((a, b) => new Date(a.scheduled_at) - new Date(b.scheduled_at));
          const nextAppointment = upcomingAppointments[0] || null;

          const contactInfo = clientContactByRequestId[requestId] || {};
          const clientFullName =
            contactInfo.name || clientNameByRequestId[requestId] || null;
          const acceptedStatuses = [
            "accepted",
            "awaiting_completion",
            "completed",
            "issue_reported",
            "issue_resolved_pending",
          ];

          const acceptedQuote = requestQuotes.find((q) =>
            acceptedStatuses.includes((q.status || "").toLowerCase())
          );
          const hasAcceptedQuote = !!acceptedQuote;
          const acceptedQuoteId = acceptedQuote?.id || null;
          const acceptedQuoteTotal = acceptedQuote?.grand_total || null;
          const contactUnlocked =
            contactInfo.contact_unlocked || hasAcceptedQuote;

          return {
            id: primaryQuote.id,
            request_id: requestId,
            status: primaryStatus,
            issued_at: primaryQuote.issued_at ?? primaryQuote.created_at,
            valid_until: primaryQuote.valid_until,
            title: r?.suggested_title || "Project",
            request_type: t?.invited_by || "system",
            budget_band: r?.budget_band || null,
            postcode: r?.postcode || null,
            currency: primaryQuote.currency,
            grand_total: primaryQuote.grand_total,
            quotes: requestQuotes,
            quoteCount: requestQuotes.length,
            hasAcceptedQuote,
            acceptedQuoteId,
            acceptedQuoteTotal,
            clientFullName,
            clientName: getClientDisplayName(clientFullName, contactUnlocked),
            clientPostcode: contactInfo.postcode || r?.postcode || null,
            contactUnlocked,
            daysToExpiry,
            isExpiringSoon,
            daysSinceIssued,
            clientNotResponding,
            nextAppointment,
          };
        }
      );

      setInboxRows(inbox);
      setSentRows(sent);
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
      .channel("trades-quotes-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "tradify_native_app_db" },
        () => load()
      )
      .subscribe();

    const appointmentsChannel = supabase
      .channel("trades-appointments-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "appointments" },
        () => load()
      )
      .subscribe();

    const targetsChannel = supabase
      .channel("trades-targets-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "request_targets" },
        () => load()
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

  // Transform data into project cards
  const projects = useMemo(() => {
    const allProjects = [];

    // Process inbox items (new requests) - Stage: REQUEST or QUOTE (if accepted but no quote yet)
    inboxRows.forEach((item) => {
      if (item.state === "declined") return;

      const apptStatus = item.nextAppointment?.status?.toLowerCase();
      const isDirectRequest = item.request_type === "client";
      // Check all accepted states: "accepted", "trade_accepted", "client_accepted"
      const stateStr = (item.state || "").toLowerCase();
      const isAccepted = stateStr.includes("accepted");

      // Always show client info in context line
      const contextLine = `${item.clientName || "Client"} · ${item.clientPostcode || item.postcode || ""}`;

      // Show budget for all requests that have it
      const budgetInfo = item.budget_band
        ? `Budget: ${item.budget_band}`
        : null;

      // If accepted but no quote created yet, show as QUOTE stage with Schedule/Send actions
      if (isAccepted) {
        let statusType = "action";
        let statusText = "Send quote or schedule visit";
        let statusDetail = `Accepted ${item.requestAge > 0 ? item.requestAge + " days ago" : "today"}`;
        let subStatus = null;

        if (apptStatus === "proposed") {
          statusType = "waiting";
          statusText = "Survey visit proposed";
          statusDetail = `${formatDate(item.nextAppointment.scheduled_at)} · Awaiting client`;
          subStatus = "survey_proposed";
        } else if (apptStatus === "confirmed") {
          statusType = "scheduled";
          statusText = "Survey visit confirmed";
          statusDetail = `${formatDate(item.nextAppointment.scheduled_at)}, ${formatTime(item.nextAppointment.scheduled_at)}`;
          subStatus = "survey_confirmed";
        }

        allProjects.push({
          id: `inbox-${item.request_id}`,
          type: "accepted",
          stage: "QUOTE",
          stageIndex: 1,
          progressPosition: getTradeProgressPosition("QUOTE", subStatus),
          requestId: item.request_id,
          title: item.title,
          requestType: item.request_type,
          contextLine,
          jobDescription: item.jobDescription || (isDirectRequest ? "No description added" : null),
          budgetInfo,
          statusType,
          statusText,
          statusDetail,
          quoteAmount: null,
          actions: [
            {
              label: "Schedule Visit",
              primary: false,
              onPress: () =>
                router.push({
                  pathname: "/quotes/schedule",
                  params: { requestId: item.request_id },
                }),
            },
            {
              label: "Send Quote",
              primary: true,
              onPress: () =>
                router.push({
                  pathname: "/quotes/create",
                  params: { requestId: item.request_id },
                }),
            },
          ],
          sortPriority: 1,
        });
        return;
      }

      // Not accepted yet - show as REQUEST stage with Accept/Decline
      let statusType = "new";
      let statusText = "New request";
      let statusDetail = `Posted ${item.requestAge} days ago`;
      let subStatus = null;

      if (item.isStale) {
        statusType = "action";
        statusText = "Getting stale";
        statusDetail = `Posted ${item.requestAge} days ago`;
      }

      if (item.request_type === "client") {
        statusType = "action";
        statusText = `${item.clientName?.split(" ")[0] || "Client"} requested you directly`;
        statusDetail = `Posted ${item.requestAge > 0 ? item.requestAge + " days" : "today"}`;
      }

      if (apptStatus === "proposed") {
        statusType = "waiting";
        statusText = "Survey visit proposed";
        statusDetail = `${formatDate(item.nextAppointment.scheduled_at)} · Awaiting client`;
        subStatus = "survey_proposed";
      } else if (apptStatus === "confirmed") {
        statusType = "scheduled";
        statusText = "Survey visit confirmed";
        statusDetail = `${formatDate(item.nextAppointment.scheduled_at)}, ${formatTime(item.nextAppointment.scheduled_at)}`;
        subStatus = "survey_confirmed";
      }

      allProjects.push({
        id: `inbox-${item.request_id}`,
        type: "inbox",
        stage: "REQUEST",
        stageIndex: 0,
        progressPosition: getTradeProgressPosition("REQUEST", subStatus),
        requestId: item.request_id,
        title: item.title,
        requestType: item.request_type,
        contextLine,
        // Show job description for all requests
        jobDescription: item.jobDescription || (isDirectRequest ? "No description added" : null),
        budgetInfo,
        statusType,
        statusText,
        statusDetail,
        quoteAmount: null,
        actions: [
          {
            label: "Decline",
            primary: false,
            onPress: () => router.push(`/quotes/request/${item.request_id}`),
          },
          {
            label: "Accept",
            primary: true,
            onPress: () => router.push(`/quotes/request/${item.request_id}`),
          },
        ],
        sortPriority:
          item.request_type === "client" ? 0 : item.isStale ? 1 : 2,
      });
    });

    // Process sent quotes - Stages: QUOTE, WORK, DONE
    sentRows.forEach((item) => {
      const status = item.status?.toLowerCase() || "";
      const apptStatus = item.nextAppointment?.status?.toLowerCase();
      const contextLine = `${item.clientName || "Client"} · ${item.clientPostcode || item.postcode || ""}`;

      let stage = "QUOTE";
      let stageIndex = 1;
      let statusType = "waiting";
      let statusText = "Waiting for response";
      let statusDetail = `Sent ${item.daysSinceIssued} days ago`;
      let subStatus = null;
      let actions = null;

      if (status === "draft") {
        statusType = "action";
        statusText = "Send quote or schedule visit";
        statusDetail = `Accepted ${item.daysSinceIssued || 0} days ago`;
        actions = [
          {
            label: "Schedule Visit",
            primary: false,
            onPress: () =>
              router.push({
                pathname: "/quotes/schedule",
                params: { requestId: item.request_id, quoteId: item.id },
              }),
          },
          {
            label: "Send Quote",
            primary: true,
            onPress: () =>
              router.push({
                pathname: "/quotes/create",
                params: { quoteId: item.id, requestId: item.request_id },
              }),
          },
        ];
      } else if (status === "sent" || status === "created") {
        if (item.clientNotResponding) {
          statusType = "action";
          statusText = `No response · ${item.daysSinceIssued} days`;
          statusDetail = `Expires in ${item.daysToExpiry || 0} days`;
          actions = [
            {
              label: "Send Reminder",
              primary: true,
              onPress: () =>
                router.push({
                  pathname: "/(dashboard)/messages/[id]",
                  params: { id: item.request_id, quoteId: item.id },
                }),
            },
          ];
        } else {
          subStatus = "quote_sent";
        }
      } else if (status === "accepted") {
        stage = "WORK";
        stageIndex = 2;

        // For accepted quotes, only look at WORK appointments (linked to quote_id)
        // Survey appointments (quote_id: null, title contains "Survey") should be ignored
        const isWorkAppointment = item.nextAppointment?.quote_id != null ||
          (item.nextAppointment?.title && !item.nextAppointment.title.toLowerCase().includes("survey"));
        const workApptStatus = isWorkAppointment ? apptStatus : null;

        if (workApptStatus === "proposed") {
          statusType = "waiting";
          statusText = "Work visit proposed";
          statusDetail = `${formatDate(item.nextAppointment.scheduled_at)} · Awaiting client`;
          subStatus = "work_proposed";
        } else if (workApptStatus === "confirmed" || workApptStatus === "accepted") {
          // Both "confirmed" and "accepted" mean the client approved the appointment
          statusType = "scheduled";
          statusText = "Work scheduled";
          statusDetail = `${formatDate(item.nextAppointment.scheduled_at)}, ${formatTime(item.nextAppointment.scheduled_at)}`;
          subStatus = "work_confirmed";
          actions = [
            {
              label: "Message",
              primary: false,
              onPress: () =>
                router.push({
                  pathname: "/(dashboard)/messages/[id]",
                  params: { id: item.request_id, quoteId: item.id },
                }),
            },
            {
              label: "Mark Complete",
              primary: true,
              onPress: () => router.push(`/quotes/${item.acceptedQuoteId || item.id}`),
            },
          ];
        } else {
          // No work appointment scheduled yet - prompt to schedule work
          statusType = "action";
          statusText = "Schedule work visit";
          statusDetail = `Accepted ${item.daysSinceIssued || 0} days ago`;
          subStatus = "accepted_no_appt";
          actions = [
            {
              label: "Schedule Work",
              primary: true,
              onPress: () =>
                router.push({
                  pathname: "/quotes/schedule",
                  params: {
                    requestId: item.request_id,
                    quoteId: item.acceptedQuoteId || item.id,
                  },
                }),
            },
          ];
        }
      } else if (status === "awaiting_completion") {
        stage = "WORK";
        stageIndex = 2;
        statusType = "waiting";
        statusText = "Awaiting client confirmation";
        statusDetail = `Marked complete ${formatDate(item.marked_complete_at || item.issued_at)}`;
        subStatus = "awaiting_completion";
      } else if (status === "issue_reported") {
        stage = "WORK";
        stageIndex = 2;
        statusType = "issue";
        statusText = "Issue reported";
        statusDetail = item.issue_reason || "Client reported a problem";
        subStatus = "issue_reported";
        actions = [
          {
            label: `Message ${item.clientName?.split(" ")[0] || "Client"}`,
            primary: false,
            onPress: () =>
              router.push({
                pathname: "/(dashboard)/messages/[id]",
                params: { id: item.request_id, quoteId: item.id },
              }),
          },
          {
            label: "Issue Resolved",
            primary: true,
            onPress: () => router.push(`/quotes/${item.acceptedQuoteId || item.id}`),
          },
        ];
      } else if (status === "issue_resolved_pending") {
        stage = "WORK";
        stageIndex = 2;
        statusType = "waiting";
        statusText = "Resolution sent";
        statusDetail = "Waiting for client to confirm";
        subStatus = "issue_resolved_pending";
      } else if (status === "completed") {
        stage = "DONE";
        stageIndex = 3;
        statusType = "completed";
        statusText = "Completed";
        statusDetail = formatDate(item.completion_confirmed_at || item.issued_at);
        subStatus = null;
        actions = item.trade_review_rating
          ? null
          : [
              {
                label: "Leave Review",
                primary: true,
                onPress: () =>
                  router.push({
                    pathname: "/quotes/leave-review",
                    params: { quoteId: item.acceptedQuoteId || item.id },
                  }),
              },
            ];
      } else if (status === "declined") {
        stage = "DONE";
        stageIndex = 3;
        statusType = "completed";
        statusText = "Client chose another trade";
        statusDetail = `${item.daysSinceIssued || 0} days ago`;
      } else if (status === "expired") {
        stage = "DONE";
        stageIndex = 3;
        statusType = "completed";
        statusText = "Quote expired";
        statusDetail = "No response after 14 days";
      }

      const quoteAmount =
        item.hasAcceptedQuote && item.acceptedQuoteTotal
          ? item.acceptedQuoteTotal
          : item.grand_total;

      allProjects.push({
        id: `quote-${item.id}`,
        type: "quote",
        stage,
        stageIndex,
        progressPosition: getTradeProgressPosition(stage, subStatus),
        requestId: item.request_id,
        quoteId: item.acceptedQuoteId || item.id,
        title: item.title,
        requestType: item.request_type,
        contextLine,
        statusType,
        statusText,
        statusDetail,
        quoteAmount: stage !== "REQUEST" && quoteAmount ? quoteAmount : null,
        quoteAmountLabel: item.hasAcceptedQuote ? "Accepted quote" : "Quote total",
        hasAcceptedQuote: item.hasAcceptedQuote,
        actions,
        hasReview: !!item.client_review_rating,
        reviewRating: item.client_review_rating,
        sortPriority:
          statusType === "issue"
            ? 0
            : statusType === "action"
            ? 1
            : statusType === "scheduled"
            ? 2
            : statusType === "waiting"
            ? 3
            : 4,
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
  }, [inboxRows, sentRows, router, formatDate, formatTime]);

  // Filter projects
  const filteredProjects = useMemo(() => {
    switch (filter) {
      case "new":
        return projects.filter((p) => p.stage === "REQUEST");
      case "active":
        return projects.filter(
          (p) => p.stage === "QUOTE" || p.stage === "WORK"
        );
      case "past":
        return projects.filter((p) => p.stage === "DONE");
      default:
        return projects.filter((p) => p.stage !== "DONE");
    }
  }, [projects, filter]);

  // Counts
  const counts = useMemo(() => {
    const all = projects.filter((p) => p.stage !== "DONE").length;
    const newCount = projects.filter((p) => p.stage === "REQUEST").length;
    const active = projects.filter(
      (p) => p.stage === "QUOTE" || p.stage === "WORK"
    ).length;
    const past = projects.filter((p) => p.stage === "DONE").length;
    return { all, new: newCount, active, past };
  }, [projects]);

  if (loading) {
    return (
      <ThemedView style={styles.container}>
        <StatusBar style="dark" backgroundColor="#FFFFFF" />
        <ProjectsPageSkeleton paddingTop={insets.top + 16} />
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <StatusBar style="dark" backgroundColor="#FFFFFF" />

      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 16 }]}>
        <ThemedText style={styles.headerTitle}>Projects</ThemedText>
      </View>

      {/* Filter pills */}
      <View style={styles.filterRow}>
        <FilterPill
          active={filter === "all"}
          label="All"
          count={counts.all}
          onPress={() => setFilter("all")}
        />
        <FilterPill
          active={filter === "new"}
          label="New"
          count={counts.new}
          onPress={() => setFilter("new")}
        />
        <FilterPill
          active={filter === "active"}
          label="Active"
          count={counts.active}
          onPress={() => setFilter("active")}
        />
        <FilterPill
          active={filter === "past"}
          label="Past"
          count={counts.past}
          onPress={() => setFilter("past")}
        />
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        showsVerticalScrollIndicator={false}
      >
        {filteredProjects.length > 0 && (
          <View style={styles.projectsList}>
            {filteredProjects.map((project) => (
              <ProjectCard
                key={project.id}
                item={project}
                onPress={() => {
                  // Only go to Quote Overview if client has accepted a quote
                  // Otherwise go to Client Request page where trade can see/manage all quotes
                  if (project.hasAcceptedQuote && project.quoteId) {
                    router.push(`/quotes/${project.quoteId}`);
                  } else {
                    router.push(`/quotes/request/${project.requestId}`);
                  }
                }}
              />
            ))}
          </View>
        )}

        {filteredProjects.length === 0 && filter === "all" && (
          <EmptyState
            icon="briefcase-outline"
            title="No active projects"
            subtitle="New quote requests will appear here"
          />
        )}

        {filteredProjects.length === 0 && filter === "new" && (
          <EmptyState
            icon="mail-outline"
            title="No new requests"
            subtitle="New requests matching your services will appear here"
          />
        )}

        {filteredProjects.length === 0 && filter === "active" && (
          <EmptyState
            icon="folder-outline"
            title="No active jobs"
            subtitle="Accept requests from your inbox to start quoting"
            primaryAction={{
              label: "View Inbox",
              onPress: () => setFilter("new"),
            }}
          />
        )}

        {filteredProjects.length === 0 && filter === "past" && (
          <EmptyState
            icon="checkmark-circle-outline"
            title="No completed projects"
            subtitle="Completed quotes will appear here"
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
    paddingHorizontal: 20,
    paddingBottom: 12,
    backgroundColor: "#FFFFFF",
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: "700",
  },
  filterRow: {
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 16,
  },
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
    paddingBottom: 40,
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
  jobDescription: {
    fontSize: 14,
    color: "#6B7280",
    fontStyle: "italic",
    marginTop: 4,
  },
  budgetText: {
    fontSize: 13,
    color: "#9CA3AF",
    marginTop: 4,
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
  quoteAmountRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: "#F9FAFB",
    borderRadius: 10,
  },
  quoteAmountLabel: {
    fontSize: 13,
    color: "#6B7280",
    fontWeight: "500",
  },
  quoteAmountValue: {
    fontSize: 18,
    fontWeight: "700",
    color: "#111827",
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
});
