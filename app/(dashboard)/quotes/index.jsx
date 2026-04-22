// app/(dashboard)/quotes/index.jsx
// Trade Projects Screen - v5 with Progress Bars and Visual Design
import React, { useCallback, useEffect, useState, useMemo } from "react";
import {
  StyleSheet,
  View,
  ScrollView,
  Pressable,
  RefreshControl,
  Alert,
} from "react-native";
import { useRouter } from "expo-router";
import { useFocusEffect } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import ThemedView from "../../../components/ThemedView";
import ThemedText from "../../../components/ThemedText";
import Spacer from "../../../components/Spacer";
import ProgressBar from "../../../components/ProgressBar";
import { ProjectsPageSkeleton } from "../../../components/Skeleton";
import { Colors } from "../../../constants/Colors";
import { StatusColor } from "../../../constants/ProjectStatus";
import { useUser } from "../../../hooks/useUser";
import { useTheme } from "../../../hooks/useTheme";
import { supabase } from "../../../lib/supabase";
import { acceptRequest, declineRequest } from "../../../lib/api/requests";
import { getRequestAttachmentUrlsCached } from "../../../lib/api/attachments";
import ThemedStatusBar from "../../../components/ThemedStatusBar";
import { IconBtn, FilterPills, ProjectRow } from "../../../components/design";
import {
  getCategoryIcon,
  getServiceTypeIcon,
  defaultServiceTypeIcon,
} from "../../../assets/icons";

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
  expired: { text: "#6B7280", icon: "close-circle" },     // Gray with close icon
  declined: { text: "#6B7280", icon: "close" },           // Gray with X
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

// Prefer FK-joined names from quote_requests; fall back to parseTitle only
// if the joins are empty (e.g. legacy rows that predate the wizard).
function resolveServiceCategory(item) {
  const fromJoin = {
    service: item.serviceTypeName || null,
    category: item.serviceCategoryName || null,
  };
  if (fromJoin.service && fromJoin.category) return fromJoin;
  const parsed = parseTitle(item.title);
  return {
    service: fromJoin.service || parsed.service,
    category: fromJoin.category || parsed.category,
  };
}

// Detect a Start Job appointment. Prefer the `kind` column when the
// appointments RPC returns it (post 2026-04-28 migration); fall back
// to a title heuristic so older RPC builds still flip the card to
// "In progress" after the scheduled datetime passes.
function isStartJobKind(a) {
  if (!a) return false;
  if (a.kind) return String(a.kind).toLowerCase() === "start_job";
  const t = String(a.title || "").toLowerCase();
  return t.includes("start job") || t.includes("start work");
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
      if (subStatus === "work_awaiting_start") return 58; // Start Job proposed, awaiting client confirmation
      if (subStatus === "work_proposed") return 55;
      if (subStatus === "accepted_no_appt") return 45; // Quote accepted, need to schedule work
      return 50; // Default: working toward Work stage
    case "DONE":
      // Stage 3 (Settled): Dot at 87.5%, but fill to 100% to show completion
      return 100;
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
  const { service, category } = resolveServiceCategory(item);
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

      {/* Extended match badge (for larger budget jobs outside normal radius) */}
      {item.extendedMatch && (
        <View style={styles.extendedMatchBadge}>
          <Ionicons name="car-outline" size={12} color="#3B82F6" />
          <ThemedText style={styles.extendedMatchText}>
            Extended travel job
          </ThemedText>
        </View>
      )}

      {/* Outside service area badge */}
      {item.outsideServiceArea && (
        <View style={styles.outsideAreaBadge}>
          <Ionicons name="location-outline" size={12} color="#F59E0B" />
          <ThemedText style={styles.outsideAreaText}>
            {item.distanceMiles
              ? `Outside your service area (${item.distanceMiles} miles away)`
              : "Outside your service area"}
          </ThemedText>
        </View>
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

// Past card component for expired/declined items - visual treatment with dashed border and explanation
function PastCard({ item, onPress }) {
  const { service, category } = resolveServiceCategory(item);

  // Determine icon based on past type
  const getIcon = () => {
    if (item.pastType === "completed") return "checkmark-circle";
    if (item.pastType === "expired") return "close-circle-outline";
    if (item.pastType === "declined") return "close";
    return "ellipse-outline";
  };

  const getIconColor = () => {
    if (item.pastType === "completed") return "#10B981";
    return "#9CA3AF";
  };

  const isExpiredOrDeclined = item.pastType === "expired" || item.pastType === "declined";

  return (
    <Pressable
      style={[
        styles.pastCard,
        isExpiredOrDeclined && styles.pastCardMuted,
      ]}
      onPress={onPress}
    >
      {/* Title row with icon */}
      <View style={styles.pastCardHeader}>
        <View style={styles.pastCardTitleContent}>
          <ThemedText
            style={[
              styles.pastCardTitle,
              isExpiredOrDeclined && styles.pastCardTitleMuted,
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

      {/* Explanation line for expired/declined (dashed separator + explanation) */}
      {isExpiredOrDeclined && item.explanation && (
        <View style={styles.pastCardExplanation}>
          <View style={styles.dashedLine} />
          <ThemedText style={styles.explanationText}>
            {item.explanation}
          </ThemedText>
        </View>
      )}

      {/* Quote amount for expired quotes that had a price */}
      {item.quoteAmount && item.pastType === "expired" && (
        <ThemedText style={styles.pastCardQuoteInfo}>
          Your quote: £{formatNumber(item.quoteAmount)} · Sent {item.daysSinceSent || "?"} days ago
        </ThemedText>
      )}

      {/* Review badge for completed */}
      {item.pastType === "completed" && item.hasReview && (
        <View style={styles.pastCardReviewBadge}>
          {[1, 2, 3, 4, 5].map((star) => (
            <Ionicons
              key={star}
              name={star <= (item.reviewRating || 0) ? "star" : "star-outline"}
              size={14}
              color="#F59E0B"
            />
          ))}
          <ThemedText style={styles.pastCardReviewText}>Client review</ThemedText>
        </View>
      )}

      {/* Amount for completed */}
      {item.pastType === "completed" && item.quoteAmount && (
        <ThemedText style={styles.pastCardAmount}>
          £{formatNumber(item.quoteAmount)}
        </ThemedText>
      )}
    </Pressable>
  );
}

// Section header for Past tab groupings
function SectionHeader({ title, count, expanded, onToggle }) {
  return (
    <Pressable style={styles.sectionHeader} onPress={onToggle}>
      <View style={styles.sectionHeaderLeft}>
        <ThemedText style={styles.sectionHeaderTitle}>{title}</ThemedText>
        {typeof count === "number" && (
          <ThemedText style={styles.sectionHeaderCount}>({count})</ThemedText>
        )}
      </View>
      {onToggle && (
        <ThemedText style={styles.sectionHeaderToggle}>
          {expanded ? "Hide" : "Show all"}
        </ThemedText>
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
  const { colors: c } = useTheme();

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

      // Fetch trade's current service radius to dynamically calculate if jobs are outside area
      const { data: tradeProfile } = await supabase
        .from("profiles")
        .select("service_radius_km")
        .eq("id", myId)
        .single();
      const currentServiceRadiusKm = tradeProfile?.service_radius_km ?? 40; // Default 40km (~25 miles)
      const currentServiceRadiusMiles = currentServiceRadiusKm * 0.621371;

      // Fetch request targets (inbox)
      const { data: targets, error: tErr } = await supabase
        .from("request_targets")
        .select("request_id, state, invited_by, created_at, trade_id, outside_service_area, distance_miles, extended_match")
        .eq("trade_id", myId)
        .order("created_at", { ascending: false });
      if (tErr) throw tErr;

      // Fetch quotes. `work_started_at` drives the "Scheduled" vs
      // "In progress" distinction on project cards — without it every
      // accepted quote shows as Scheduled regardless of whether the
      // trade has actually begun work.
      const { data: quotes, error: qErr } = await supabase
        .from("tradify_native_app_db")
        .select(
          "id, request_id, client_id, status, issued_at, created_at, details, currency, grand_total, tax_total, valid_until, work_started_at"
        )
        .eq("trade_id", myId)
        .order("issued_at", { ascending: false, nullsFirst: false });
      if (qErr) throw qErr;

      const quotedReqIds = new Set((quotes || []).map((q) => q.request_id));

      // Filter out null / "null" / undefined — the string literal "null"
      // slips in for old rows where request_id was persisted un-cast, and
      // Postgres then rejects the whole `.in()` query with
      // "invalid input syntax for type uuid: \"null\"" which nukes every
      // downstream lookup.
      const isValidUuid = (v) =>
        typeof v === "string" && v !== "null" && /^[0-9a-f-]{36}$/i.test(v);
      const reqIds = Array.from(
        new Set([
          ...(targets || []).map((t) => t.request_id),
          ...(quotes || []).map((q) => q.request_id),
        ])
      ).filter(isValidUuid);

      // Fetch request docs. We join service_types + service_categories
      // so the card can show real service + category names directly from
      // the FK — then we also fetch those tables separately and stitch
      // them in as a safety net (protects against any PostgREST relation
      // disambiguation issues, and handles legacy rows where the FK was
      // never set but the category can still be guessed from another
      // request in the batch).
      let reqById = {};
      let serviceTypesById = {};
      let serviceCategoriesById = {};
      if (reqIds.length) {
        const { data: reqs, error: reqErr } = await supabase
          .from("quote_requests")
          .select(`
            id,
            details,
            created_at,
            status,
            postcode,
            budget_band,
            suggested_title,
            requester_id,
            service_type_id,
            category_id,
            service_types (id, name),
            service_categories (id, name)
          `)
          .in("id", reqIds);
        if (reqErr) console.warn("[quotes/index] reqs fetch error:", reqErr.message);
        (reqs || []).forEach((r) => (reqById[r.id] = r));

        // Safety-net lookups — in case the embedded join came back null.
        const serviceTypeIds = [
          ...new Set((reqs || []).map((r) => r.service_type_id).filter(Boolean)),
        ];
        const serviceCategoryIds = [
          ...new Set((reqs || []).map((r) => r.category_id).filter(Boolean)),
        ];
        if (serviceTypeIds.length) {
          const { data: sts } = await supabase
            .from("service_types")
            .select("id, name")
            .in("id", serviceTypeIds);
          (sts || []).forEach((s) => (serviceTypesById[s.id] = s.name));
        }
        if (serviceCategoryIds.length) {
          const { data: scs } = await supabase
            .from("service_categories")
            .select("id, name")
            .in("id", serviceCategoryIds);
          (scs || []).forEach((s) => (serviceCategoriesById[s.id] = s.name));
        }
      }

      // Helper — pick the best name available: embedded join first, then
      // separate-lookup map, then null.
      const resolveServiceName = (r) =>
        r?.service_types?.name ||
        (r?.service_type_id ? serviceTypesById[r.service_type_id] : null) ||
        null;
      const resolveCategoryName = (r) =>
        r?.service_categories?.name ||
        (r?.category_id ? serviceCategoriesById[r.category_id] : null) ||
        null;

      // Fetch client names. Preload from profiles (the source of truth)
      // up-front so even brand-new requests with no conversation yet show
      // the real client name instead of falling back to "Client".
      let clientNameByRequestId = {};
      let clientContactByRequestId = {};

      const requesterIdByRequestId = {};
      reqIds.forEach((rid) => {
        const rid2 = reqById[rid]?.requester_id;
        if (isValidUuid(rid2)) requesterIdByRequestId[rid] = rid2;
      });
      const requesterIds = [...new Set(Object.values(requesterIdByRequestId))];
      if (requesterIds.length) {
        const { data: profRows, error: profErr } = await supabase
          .from("profiles")
          .select("id, full_name")
          .in("id", requesterIds);
        if (profErr) {
          console.warn("[quotes/index] profiles fetch failed:", profErr.message);
        } else {
          const nameById = {};
          (profRows || []).forEach((p) => {
            if (p.full_name) nameById[p.id] = p.full_name;
          });
          Object.entries(requesterIdByRequestId).forEach(([reqId, userId]) => {
            if (nameById[userId]) clientNameByRequestId[reqId] = nameById[userId];
          });
        }
      }

      const { data: convData } = await supabase.rpc("rpc_list_conversations", {
        p_limit: 100,
      });
      if (convData) {
        convData.forEach((conv) => {
          if (conv.request_id && conv.other_party_name && !clientNameByRequestId[conv.request_id]) {
            clientNameByRequestId[conv.request_id] = conv.other_party_name;
          }
        });
      }

      // Fetch client contact visibility and names
      for (const reqId of reqIds) {
        try {
          const { data: contactData } = await supabase.rpc(
            "rpc_get_client_contact_for_request",
            { p_request_id: reqId }
          );
          if (contactData) {
            clientContactByRequestId[reqId] = contactData;
            // Also populate clientNameByRequestId from contact data
            if (contactData.name && !clientNameByRequestId[reqId]) {
              clientNameByRequestId[reqId] = contactData.name;
            }
          }
        } catch {
          // Silently fail
        }
      }

      // Fallback: Fetch client names directly from profiles for any missing names
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
          type: a.type, // survey or work (legacy)
          // New kind column (survey / design / start_job / followup /
          // final). Older RPC builds that don't yet select this column
          // will pass `undefined` through — the start_job detection
          // helper below falls back to a title heuristic in that case.
          kind: a.kind ?? null,
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

          // Calculate outsideServiceArea dynamically based on current service radius
          // This ensures if trade changes their radius, the flag updates immediately
          const distanceMiles = t.distance_miles || null;
          const outsideServiceArea = distanceMiles != null
            ? distanceMiles > currentServiceRadiusMiles
            : (t.outside_service_area || false); // Fallback to stored flag if no distance

          return {
            request_id: t.request_id,
            invited_at: t.created_at,
            request_type: t.invited_by || "system",
            state: t.state,
            title: r?.suggested_title || "Project",
            // Real service + category names straight from the FK data
            // (embedded join first, separate lookup as fallback) so the
            // card stops using parseTitle when suggested_title is empty
            // or differently-formatted.
            serviceTypeName: resolveServiceName(r),
            serviceCategoryName: resolveCategoryName(r),
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
            outsideServiceArea,
            distanceMiles,
            extendedMatch: t.extended_match || false,
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

          // Start-job appointments for this quote — the canonical
          // signal for "work has been booked". We use them (not
          // survey/design appts) to flip the card between Awaiting
          // start confirmation / Scheduled / In progress. `kind` is
          // the new source-of-truth column; older RPCs that don't
          // select it fall back to a title heuristic.
          const startJobAppts = allQuoteAppointments
            .filter((a) => isStartJobKind(a))
            .filter((a) => String(a.status || "").toLowerCase() !== "cancelled")
            .sort((a, b) => new Date(a.scheduled_at) - new Date(b.scheduled_at));
          const latestStartJobAppt = startJobAppts[startJobAppts.length - 1] || null;

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

          // Work-started timestamp — prefer the accepted quote's value
          // (that's the project-level truth). Drafts/sent quotes never
          // have this, so primaryQuote is only a fallback.
          const workStartedAt =
            acceptedQuote?.work_started_at || primaryQuote?.work_started_at || null;

          return {
            id: primaryQuote.id,
            request_id: requestId,
            status: primaryStatus,
            issued_at: primaryQuote.issued_at ?? primaryQuote.created_at,
            valid_until: primaryQuote.valid_until,
            title: r?.suggested_title || "Project",
            serviceTypeName: resolveServiceName(r),
            serviceCategoryName: resolveCategoryName(r),
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
            startJobAppts,
            latestStartJobAppt,
            workStartedAt,
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
      const stateStr = (item.state || "").toLowerCase();

      // Handle declined - trade declined this request (skip, don't show)
      if (stateStr === "declined") return;

      // Handle expired request_targets
      if (stateStr === "expired") {
        const contextLine = `${item.clientName || "Client"} · No response · Expired ${item.requestAge - 14 > 0 ? item.requestAge - 14 : 0} days ago`;
        const wasAccepted = item.wasAccepted || false; // Need to track if was previously accepted

        allProjects.push({
          id: `inbox-expired-${item.request_id}`,
          type: "expired_request",
          stage: "EXPIRED",
          stageIndex: 1,
          progressPosition: 12.5,
          requestId: item.request_id,
          title: item.title,
          requestType: item.request_type,
          contextLine,
          statusType: "expired",
          statusText: wasAccepted ? "Quote not sent" : "No response",
          statusDetail: `Expired ${item.requestAge - 14 > 0 ? item.requestAge - 14 : 0} days ago`,
          pastType: "expired",
          explanation: wasAccepted
            ? "You accepted but didn't send a quote in time"
            : "You didn't respond to this request",
          sortPriority: 5,
        });
        return;
      }

      const apptStatus = item.nextAppointment?.status?.toLowerCase();
      const isDirectRequest = item.request_type === "client";
      // Check all accepted states: "accepted", "trade_accepted", "client_accepted"
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
          outsideServiceArea: item.outsideServiceArea,
          distanceMiles: item.distanceMiles,
          extendedMatch: item.extendedMatch,
          actions: [
            {
              label: "Message",
              primary: false,
              onPress: () =>
                router.push({
                  pathname: "/(dashboard)/messages/[id]",
                  params: {
                    id: String(item.request_id),
                    name: item.clientName || "Client",
                    returnTo: "/(dashboard)/quotes",
                  },
                }),
            },
            {
              label: "Schedule Visit",
              primary: true,
              onPress: () =>
                router.push({
                  pathname: "/quotes/schedule",
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

      // Create handler functions for accept/decline that call API directly
      const handleAccept = async () => {
        const isOutsideArea = item.outsideServiceArea;
        const distanceInfo = item.distanceMiles ? ` (${item.distanceMiles} miles away)` : "";

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
                await acceptRequest(item.request_id);
                // Also update request_targets.state directly
                if (user?.id) {
                  await supabase
                    .from("request_targets")
                    .update({ state: "accepted" })
                    .eq("request_id", item.request_id)
                    .eq("trade_id", user.id);
                }
                // Reload data to reflect the change
                load();
              } catch (e) {
                Alert.alert("Accept Failed", e?.message || "Unable to accept this request.");
              }
            },
          },
        ]);
      };

      const handleDecline = async () => {
        Alert.alert("Decline request", "Are you sure you want to decline?", [
          { text: "Cancel", style: "cancel" },
          {
            text: "Decline",
            style: "destructive",
            onPress: async () => {
              try {
                await declineRequest(item.request_id);
                // Also update request_targets.state directly
                if (user?.id) {
                  await supabase
                    .from("request_targets")
                    .update({ state: "declined" })
                    .eq("request_id", item.request_id)
                    .eq("trade_id", user.id);
                }
                // Reload data to reflect the change
                load();
              } catch (e) {
                Alert.alert("Decline Failed", e?.message || "Unable to decline this request.");
              }
            },
          },
        ]);
      };

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
        outsideServiceArea: item.outsideServiceArea,
        distanceMiles: item.distanceMiles,
        extendedMatch: item.extendedMatch,
        actions: [
          {
            label: "Decline",
            primary: false,
            onPress: handleDecline,
          },
          {
            label: "Accept",
            primary: true,
            onPress: handleAccept,
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

        // "In progress" is now DERIVED from the Start Job appointment:
        // once the scheduled datetime has passed (and the appt isn't
        // cancelled), the project is automatically in progress — no
        // explicit Start Work button tap needed. `workStartedAt` is
        // kept as a fallback for data written before this change.
        const startJobs = item.startJobAppts || [];
        const nowT = Date.now();
        const nonCancelledStartJobs = startJobs.filter(
          (a) => String(a.status || "").toLowerCase() !== "cancelled"
        );
        const startedStartJob = nonCancelledStartJobs.find(
          (a) => a.scheduled_at && new Date(a.scheduled_at).getTime() <= nowT
        );
        const futureStartJob = nonCancelledStartJobs
          .filter((a) => a.scheduled_at && new Date(a.scheduled_at).getTime() > nowT)
          .sort((a, b) => new Date(a.scheduled_at) - new Date(b.scheduled_at))[0] || null;
        const futureStartJobStatus = futureStartJob
          ? String(futureStartJob.status || "").toLowerCase()
          : null;

        if (startedStartJob || item.workStartedAt) {
          statusType = "scheduled";
          statusText = "In progress";
          statusDetail = startedStartJob
            ? `Started ${formatDate(startedStartJob.scheduled_at)}`
            : `Started ${formatDate(item.workStartedAt)}`;
          subStatus = "work_in_progress";
          actions = [
            {
              label: "Mark Complete",
              primary: true,
              onPress: () => router.push(`/quotes/${item.acceptedQuoteId || item.id}`),
            },
          ];
        } else if (futureStartJobStatus === "proposed") {
          // Start Job booked but client hasn't confirmed yet — this is
          // the "Awaiting start confirmation" state; card stays amber.
          statusType = "waiting";
          statusText = "Awaiting start confirmation";
          statusDetail = `${formatDate(futureStartJob.scheduled_at)}, ${formatTime(futureStartJob.scheduled_at)}`;
          subStatus = "work_awaiting_start";
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
          ];
        } else if (
          futureStartJobStatus === "confirmed" ||
          futureStartJobStatus === "accepted" ||
          futureStartJobStatus === "reschedule_pending"
        ) {
          statusType = "scheduled";
          statusText = "Work scheduled";
          statusDetail = `${formatDate(futureStartJob.scheduled_at)}, ${formatTime(futureStartJob.scheduled_at)}`;
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
          ];
        } else {
          // No Start Job booked yet — still prompt to schedule work.
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
        stage = "COMPLETED";
        stageIndex = 3;
        statusType = "completed";
        statusText = "Completed";
        statusDetail = formatDate(item.completion_confirmed_at || item.issued_at);
        subStatus = null;
        actions = null;
      } else if (status === "declined") {
        stage = "DECLINED";
        stageIndex = 3;
        statusType = "declined";
        statusText = "Client chose another trade";
        statusDetail = `${item.daysSinceIssued || 0} days ago`;
      } else if (status === "expired") {
        // Quote sent but client never responded
        stage = "EXPIRED";
        stageIndex = 3;
        statusType = "expired";
        statusText = "Client didn't respond";
        statusDetail = `Expired ${item.daysSinceIssued ? item.daysSinceIssued - 14 : 0} days ago`;
      }

      const quoteAmount =
        item.hasAcceptedQuote && item.acceptedQuoteTotal
          ? item.acceptedQuoteTotal
          : item.grand_total;

      // Determine pastType and explanation for Past tab cards
      let pastType = null;
      let explanation = null;
      if (stage === "COMPLETED") {
        pastType = "completed";
      } else if (stage === "DECLINED") {
        pastType = "declined";
        explanation = "Client chose another trade for this job";
      } else if (stage === "EXPIRED") {
        pastType = "expired";
        explanation = "Your quote: £" + formatNumber(quoteAmount || 0) + " · Sent " + (item.daysSinceIssued || "?") + " days ago";
      }

      allProjects.push({
        id: `quote-${item.id}`,
        type: "quote",
        stage,
        stageIndex,
        // Raw status (draft / sent / accepted / …) so the card render
        // logic can distinguish them without inferring from labels.
        status,
        // Fine-grained lifecycle key — the WORK stage alone maps to
        // several canonical card states ("Schedule work" / "Visit
        // proposed" / "Scheduled" / "In progress" / …). `subStatus`
        // is already computed above; we just need to surface it so
        // buildTradeRow can pick the right label + colour.
        subStatus,
        // Work-started timestamp: flips the card from "Scheduled" to
        // "In progress" for both POVs. Null until the trade taps
        // Start Work via the Client Request page appointment sheet.
        workStartedAt: item.workStartedAt ?? null,
        // Next upcoming appointment (if any) — handy for the card
        // sub-detail line ("Thu 24 Apr, 09:00"). For WORK-stage
        // states we prefer the Start Job appointment so the date
        // shown lines up with "Awaiting start confirmation" /
        // "Scheduled" / "In progress" copy rather than an earlier
        // unrelated survey visit.
        nextAppointment:
          stage === "WORK" && item.latestStartJobAppt
            ? item.latestStartJobAppt
            : item.nextAppointment ?? null,
        progressPosition: getTradeProgressPosition(stage, subStatus),
        requestId: item.request_id,
        quoteId: item.acceptedQuoteId || item.id,
        title: item.title,
        serviceTypeName: item.serviceTypeName || null,
        serviceCategoryName: item.serviceCategoryName || null,
        requestType: item.request_type,
        contextLine,
        statusType,
        statusText,
        statusDetail,
        // Drafts have no meaningful "quote amount" to surface on the
        // card — it's a work-in-progress number, not a client-facing
        // figure. Suppressing it also keeps the pipeline strip honest.
        quoteAmount: status === "draft"
          ? null
          : stage !== "REQUEST" && quoteAmount
            ? quoteAmount
            : null,
        quoteAmountLabel: item.hasAcceptedQuote ? "Accepted quote" : "Quote total",
        hasAcceptedQuote: item.hasAcceptedQuote,
        actions,
        hasReview: !!item.client_review_rating,
        reviewRating: item.client_review_rating,
        // Past tab fields
        pastType,
        explanation,
        daysSinceSent: item.daysSinceIssued,
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
  }, [inboxRows, sentRows, router, formatDate, formatTime, user, load]);

  // Past stages for filtering
  const PAST_STAGES = ["COMPLETED", "EXPIRED", "DECLINED"];

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
        // Past includes completed, expired, and declined
        return projects.filter((p) => PAST_STAGES.includes(p.stage));
      default:
        // All excludes past items
        return projects.filter((p) => !PAST_STAGES.includes(p.stage));
    }
  }, [projects, filter]);

  // Grouped past projects for Past tab
  const pastGrouped = useMemo(() => {
    const pastProjects = projects.filter((p) => PAST_STAGES.includes(p.stage));
    return {
      completed: pastProjects.filter((p) => p.stage === "COMPLETED"),
      expired: pastProjects.filter((p) => p.stage === "EXPIRED"),
      declined: pastProjects.filter((p) => p.stage === "DECLINED"),
    };
  }, [projects]);

  // Section expansion state for Past tab
  const [expandedSections, setExpandedSections] = useState({
    completed: true,
    expired: true,
    declined: false,
  });

  const toggleSection = (section) => {
    setExpandedSections((prev) => ({ ...prev, [section]: !prev[section] }));
  };

  // Counts
  const counts = useMemo(() => {
    const pastCount = projects.filter((p) => PAST_STAGES.includes(p.stage)).length;
    const all = projects.filter((p) => !PAST_STAGES.includes(p.stage)).length;
    const newCount = projects.filter((p) => p.stage === "REQUEST").length;
    const active = projects.filter(
      (p) => p.stage === "QUOTE" || p.stage === "WORK"
    ).length;
    return { all, new: newCount, active, past: pastCount };
  }, [projects]);

  if (loading) {
    return (
      <ThemedView style={styles.container}>
        <ThemedStatusBar />
        <ProjectsPageSkeleton paddingTop={insets.top + 16} />
      </ThemedView>
    );
  }

  // === REDESIGN — flat list per design spec ===
  const visibleRows = (() => {
    if (filter !== "past") return filteredProjects;
    return [
      ...pastGrouped.completed,
      ...pastGrouped.expired,
      ...pastGrouped.declined,
    ];
  })();

  const summary = (() => {
    let pipeline = 0;
    let onJobs = 0;
    let quotesOut = 0;
    let jobsInProgress = 0;
    for (const p of projects) {
      // Drafts are work-in-progress and intentionally carry no
      // quoteAmount — they never contribute to the pipeline strip or
      // the quotesOut count. Same for accepted-without-quote rows
      // (quoteAmount is null there already thanks to the push).
      if (String(p.status || "").toLowerCase() === "draft") continue;
      const n = Number(p.quoteAmount) || 0;
      if (p.stage === "QUOTE") { pipeline += n; quotesOut += 1; }
      if (p.stage === "WORK")  { onJobs += n;  jobsInProgress += 1; }
    }
    return { pipeline, onJobs, quotesOut, jobsInProgress };
  })();

  const statusLine = (() => {
    const parts = [];
    if (counts.new > 0) parts.push(`${counts.new} new`);
    if (counts.active > 0) parts.push(`${counts.active} in flight`);
    return parts.join(" · ") || "Nothing in flight";
  })();

  return (
    <ThemedView style={styles.container}>
      <ThemedStatusBar />

      {/* Top-right icon dock */}
      <View style={[redesign.topBar, { top: insets.top + 12 }]}>
        <IconBtn icon="search-outline" />
        <IconBtn icon="options-outline" />
      </View>

      <ScrollView
        style={{ flex: 1, marginTop: insets.top }}
        contentContainerStyle={{ paddingTop: 54, paddingBottom: insets.bottom + 180 }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        <View style={redesign.titleBlock}>
          <ThemedText style={[redesign.title, { color: c.text }]}>
            Projects
          </ThemedText>
          <ThemedText style={[redesign.subtitle, { color: c.textMid }]}>
            {statusLine}
          </ThemedText>
        </View>

        <FilterPills
          value={filter}
          onChange={setFilter}
          options={[
            { key: "all",    label: "All",     count: counts.all },
            { key: "new",    label: "New",     count: counts.new },
            { key: "active", label: "Active",  count: counts.active },
            { key: "past",   label: "Past",    count: counts.past },
          ]}
        />

        {/* Pipeline strip — always shown on All (even when both totals are
            0 — signals "your money at play" slot exists). */}
        {filter === "all" && <TradeSummaryStrip summary={summary} />}

        {/* Flat list */}
        {visibleRows.length > 0 && (
          <View style={{ paddingTop: 10, paddingBottom: 4 }}>
            {visibleRows.map((project, idx) => {
              const row = buildTradeRow(project, formatNumber);
              return (
                <React.Fragment key={project.id}>
                  <ProjectRow
                    {...row}
                    onPress={() => {
                      // Pre-warm the attachments memo so the
                      // Client Request screen's photo strip lands
                      // with zero extra delay. Fire-and-forget —
                      // the cache fills in the background while
                      // the navigation + hero render happens. The
                      // helper swallows its own errors.
                      if (project.requestId) {
                        getRequestAttachmentUrlsCached(
                          String(project.requestId)
                        ).catch(() => {});
                      }
                      // New rule: every project card routes to the
                      // Client Request page regardless of quote status.
                      // Quotes (draft, sent, accepted, etc.) are
                      // surfaced inside Recent Activity on that page
                      // and can be tapped to open directly.
                      router.push(`/quotes/request/${project.requestId}`);
                    }}
                  />
                  {idx < visibleRows.length - 1 && (
                    <View style={[redesign.divider, { backgroundColor: rowDividerColor }]} />
                  )}
                </React.Fragment>
              );
            })}
          </View>
        )}

        {/* Empty states */}
        {visibleRows.length === 0 && filter === "all" && (
          <EmptyState
            icon="briefcase-outline"
            title="No active projects"
            subtitle="New quote requests will appear here"
          />
        )}
        {visibleRows.length === 0 && filter === "new" && (
          <EmptyState
            icon="mail-outline"
            title="No new requests"
            subtitle="New requests matching your services will appear here"
          />
        )}
        {visibleRows.length === 0 && filter === "active" && (
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
        {visibleRows.length === 0 && filter === "past" && (
          <EmptyState
            icon="checkmark-circle-outline"
            title="No past projects"
            subtitle="Completed, expired and declined quotes will appear here"
          />
        )}
      </ScrollView>
    </ThemedView>
  );
}

// ───────────────────────────────────────────────────────────────────
// Redesign helpers (local to this file)
// ───────────────────────────────────────────────────────────────────

const rowDividerColor = "rgba(15,15,20,0.06)";

function TradeSummaryStrip({ summary }) {
  const { colors: c } = useTheme();
  return (
    <View style={{ paddingHorizontal: 20, paddingTop: 12, paddingBottom: 4 }}>
      <View
        style={[
          redesign.strip,
          { backgroundColor: c.elevate, borderColor: c.border },
        ]}
      >
        <View style={{ flex: 1 }}>
          <ThemedText style={[redesign.stripEyebrow, { color: c.textMuted }]}>
            PIPELINE
          </ThemedText>
          <ThemedText style={[redesign.stripValue, { color: c.text }]}>
            £{Number(summary.pipeline || 0).toLocaleString("en-GB")}
          </ThemedText>
          <ThemedText style={[redesign.stripMeta, { color: c.textMuted }]}>
            {summary.quotesOut} {summary.quotesOut === 1 ? "quote" : "quotes"} out
          </ThemedText>
        </View>
        <View style={[redesign.stripDivider, { backgroundColor: c.divider }]} />
        <View style={{ flex: 1, paddingLeft: 14 }}>
          <ThemedText style={[redesign.stripEyebrow, { color: c.textMuted }]}>
            ON JOBS
          </ThemedText>
          <ThemedText style={[redesign.stripValue, { color: c.text }]}>
            £{Number(summary.onJobs || 0).toLocaleString("en-GB")}
          </ThemedText>
          <ThemedText style={[redesign.stripMeta, { color: c.textMuted }]}>
            {summary.jobsInProgress} in progress
          </ThemedText>
        </View>
      </View>
    </View>
  );
}

// Canonical trade-side project states. 16 distinguishable rows; each
// maps to exactly one chip colour + label + sub-detail template. This
// is the single source of truth agreed in design — no ad-hoc labels
// anywhere else in the trade app. See constants/ProjectStatus.js for
// the colour palette (same palette drives the client side).
const TRADE_STATE = {
  // Enquiry stage
  ENQUIRY_NEW:         "ENQUIRY_NEW",          // #1  New enquiry             / Purple
  ENQUIRY_EXPIRED:     "ENQUIRY_EXPIRED",      // #2  Expired (no response)   / Gray
  ENQUIRY_DECLINED:    "ENQUIRY_DECLINED",     // #3  Declined by you         / Red
  // Quoting stage
  QUOTE_DRAFTED:       "QUOTE_DRAFTED",        // #4  Quote drafted           / Amber
  QUOTE_NEEDED:        "QUOTE_NEEDED",         // #5  Respond to enquiry      / Blue (trade accepted, no action yet)
  SURVEY_PROPOSED:     "SURVEY_PROPOSED",      // #5a Survey proposed         / Blue
  SURVEY_CONFIRMED:    "SURVEY_CONFIRMED",     // #5b Survey scheduled        / Teal
  QUOTE_SENT:          "QUOTE_SENT",           // #6  Quote sent              / Blue
  QUOTE_NO_RESPONSE:   "QUOTE_NO_RESPONSE",    // #7  No response             / Gray
  QUOTE_DECLINED:      "QUOTE_DECLINED",       // #8  Quote declined          / Red
  // Work stage
  WORK_NEEDS_APPT:       "WORK_NEEDS_APPT",       // #9  Schedule work               / Amber
  WORK_APPT_PROPOSED:    "WORK_APPT_PROPOSED",    // #10 Visit proposed              / Blue
  WORK_AWAITING_START:   "WORK_AWAITING_START",   // #10b Awaiting start confirmation / Amber
  WORK_SCHEDULED:        "WORK_SCHEDULED",        // #11 Scheduled                   / Teal
  WORK_IN_PROGRESS:      "WORK_IN_PROGRESS",      // #12 In progress                 / Amber
  WORK_AWAITING:         "WORK_AWAITING",         // #13 Awaiting confirmation       / Amber
  WORK_ISSUE:            "WORK_ISSUE",            // #14 Issue reported              / Coral
  WORK_RESOLUTION:       "WORK_RESOLUTION",       // #15 Resolution sent             / Amber
  COMPLETED:             "COMPLETED",             // #16 Completed                   / Green
};

// Days-ago helper for the sub-detail copy. 0 → "today", 1 → "1d ago".
function daysAgoText(iso) {
  if (!iso) return null;
  const d = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86400000));
  if (d === 0) return "today";
  if (d === 1) return "1d ago";
  return `${d}d ago`;
}

function formatCardDate(iso) {
  if (!iso) return null;
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      day: "numeric",
      month: "short",
    });
  } catch { return null; }
}

function formatCardTime(iso) {
  if (!iso) return null;
  try {
    return new Date(iso).toLocaleTimeString(undefined, {
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch { return null; }
}

// Collapse the upstream loader's (stage + status + subStatus + workStartedAt)
// onto a single canonical key. Keeping the mapping in one place means the
// label / colour / detail renders from a single switch below, and nothing
// else in the file needs to know about the 16-row table.
function deriveTradeCanonicalState(project) {
  const stage = project.stage;
  const status = String(project.status || "").toLowerCase();
  const sub = project.subStatus || null;

  if (stage === "EXPIRED") return TRADE_STATE.ENQUIRY_EXPIRED;
  if (stage === "DECLINED") {
    // "Declined by you" (trade declined the enquiry) vs "Quote declined"
    // (client turned a sent quote down). The loader uses DECLINED only
    // for client-declined-quote paths; trade-decline is filtered out
    // earlier (stateStr === "declined" return). Safe to map to #8.
    return TRADE_STATE.QUOTE_DECLINED;
  }
  if (stage === "COMPLETED") return TRADE_STATE.COMPLETED;

  if (stage === "REQUEST") return TRADE_STATE.ENQUIRY_NEW;

  if (stage === "QUOTE") {
    if (status === "draft") return TRADE_STATE.QUOTE_DRAFTED;
    // Survey sub-states need to win BEFORE the accepted-no-quote
    // fallback below — otherwise scheduling a survey wouldn't
    // change the chip from "Respond to enquiry".
    if (sub === "survey_proposed") return TRADE_STATE.SURVEY_PROPOSED;
    if (sub === "survey_confirmed") return TRADE_STATE.SURVEY_CONFIRMED;
    // Accepted the enquiry but no quote / no appt / no survey yet
    // (inbox "accepted" type). This is the "Respond to enquiry"
    // explicit state. Handled here rather than falling through.
    if (project.type === "accepted" || (!project.quoteAmount && status !== "sent" && status !== "created")) {
      return TRADE_STATE.QUOTE_NEEDED;
    }
    if (status === "expired") return TRADE_STATE.QUOTE_NO_RESPONSE;
    if (status === "sent" || status === "created") return TRADE_STATE.QUOTE_SENT;
    return TRADE_STATE.QUOTE_SENT;
  }

  if (stage === "WORK") {
    if (sub === "work_in_progress" || project.workStartedAt) {
      return TRADE_STATE.WORK_IN_PROGRESS;
    }
    if (sub === "awaiting_completion" || status === "awaiting_completion") {
      return TRADE_STATE.WORK_AWAITING;
    }
    if (sub === "issue_reported" || status === "issue_reported") {
      return TRADE_STATE.WORK_ISSUE;
    }
    if (sub === "issue_resolved_pending" || status === "issue_resolved_pending") {
      return TRADE_STATE.WORK_RESOLUTION;
    }
    if (sub === "work_awaiting_start") return TRADE_STATE.WORK_AWAITING_START;
    if (sub === "work_proposed") return TRADE_STATE.WORK_APPT_PROPOSED;
    if (sub === "work_confirmed") return TRADE_STATE.WORK_SCHEDULED;
    if (sub === "accepted_no_appt") return TRADE_STATE.WORK_NEEDS_APPT;
    // Fallback — shouldn't hit in practice.
    return TRADE_STATE.WORK_NEEDS_APPT;
  }

  return TRADE_STATE.ENQUIRY_NEW;
}

// Canonical-state → chip colour + label + right-column detail. This is
// the agreed table from the design sign-off. Any copy change on the
// Projects card should happen HERE.
function tradeStateMeta(state, project, formatNum) {
  const next = project.nextAppointment;
  const apptDate = formatCardDate(next?.scheduled_at);
  const apptTime = formatCardTime(next?.scheduled_at);

  switch (state) {
    case TRADE_STATE.ENQUIRY_NEW:
      return {
        color: StatusColor.ENQUIRY,
        label: "New enquiry",
        rightTop: "New",
        rightBot: `Received ${daysAgoText(project.created_at) || `${project.requestAge || 0}d ago`}`,
      };
    case TRADE_STATE.ENQUIRY_EXPIRED:
      return {
        color: StatusColor.EXPIRED,
        label: "Expired",
        rightTop: "—",
        rightBot: "No response given",
      };
    case TRADE_STATE.ENQUIRY_DECLINED:
      return {
        color: StatusColor.DECLINED,
        label: "Declined by you",
        rightTop: "—",
        rightBot: daysAgoText(project.created_at) || "—",
      };
    case TRADE_STATE.QUOTE_DRAFTED:
      return {
        color: StatusColor.IN_PROGRESS,
        label: "Quote drafted",
        rightTop: "Drafted",
        rightBot: "Not yet sent",
      };
    case TRADE_STATE.QUOTE_NEEDED:
      // "Respond to enquiry" — trade has accepted the enquiry but
      // hasn't sent a quote, scheduled an appointment, or otherwise
      // taken a project-state-changing action. Sending a message does
      // NOT move the card out of this state. Sending a quote bumps it
      // to QUOTE_SENT; scheduling a visit bumps it to SURVEY_PROPOSED
      // or SURVEY_CONFIRMED (handled above in deriveTradeCanonicalState).
      return {
        color: StatusColor.QUOTING,
        label: "Respond to enquiry",
        rightTop: "Accepted",
        rightBot: "Send quote or schedule visit",
      };
    case TRADE_STATE.SURVEY_PROPOSED:
      return {
        color: StatusColor.QUOTING,
        label: "Survey proposed",
        rightTop: "Awaiting client",
        rightBot: apptDate ? `${apptDate} awaiting client` : "Awaiting client",
      };
    case TRADE_STATE.SURVEY_CONFIRMED:
      return {
        color: StatusColor.HIRED,
        label: "Survey scheduled",
        rightTop: "Scheduled",
        rightBot: apptDate && apptTime ? `${apptDate}, ${apptTime}` : apptDate || "Scheduled",
      };
    case TRADE_STATE.QUOTE_SENT:
      return {
        color: StatusColor.QUOTING,
        label: "Quote sent",
        rightTop: project.quoteAmount ? `£${formatNum(project.quoteAmount)}` : "Sent",
        rightBot: `Sent ${project.daysSinceSent != null ? project.daysSinceSent + "d ago" : "recently"}`,
      };
    case TRADE_STATE.QUOTE_NO_RESPONSE:
      return {
        color: StatusColor.EXPIRED,
        label: "No response",
        rightTop: "—",
        rightBot: "Quote expired",
      };
    case TRADE_STATE.QUOTE_DECLINED:
      return {
        color: StatusColor.DECLINED,
        label: "Quote declined",
        rightTop: "—",
        rightBot: project.daysSinceSent != null ? `${project.daysSinceSent}d ago` : "—",
      };
    case TRADE_STATE.WORK_NEEDS_APPT:
      return {
        color: StatusColor.IN_PROGRESS,
        label: "Schedule work",
        rightTop: project.quoteAmount ? `£${formatNum(project.quoteAmount)}` : "Accepted",
        rightBot: "Needs appointment",
      };
    case TRADE_STATE.WORK_APPT_PROPOSED:
      return {
        color: StatusColor.QUOTING,
        label: "Visit proposed",
        rightTop: project.quoteAmount ? `£${formatNum(project.quoteAmount)}` : "—",
        rightBot: apptDate ? `${apptDate} awaiting client` : "Awaiting client",
      };
    case TRADE_STATE.WORK_AWAITING_START:
      return {
        color: StatusColor.IN_PROGRESS,
        label: "Awaiting start confirmation",
        rightTop: project.quoteAmount ? `£${formatNum(project.quoteAmount)}` : "—",
        rightBot: apptDate && apptTime ? `${apptDate}, ${apptTime}` : apptDate || "Awaiting client",
      };
    case TRADE_STATE.WORK_SCHEDULED:
      return {
        color: StatusColor.HIRED,
        label: "Scheduled",
        rightTop: project.quoteAmount ? `£${formatNum(project.quoteAmount)}` : "Scheduled",
        rightBot: apptDate && apptTime ? `${apptDate}, ${apptTime}` : apptDate || "Scheduled",
      };
    case TRADE_STATE.WORK_IN_PROGRESS:
      return {
        color: StatusColor.IN_PROGRESS,
        label: "In progress",
        rightTop: project.quoteAmount ? `£${formatNum(project.quoteAmount)}` : "Active",
        rightBot: project.workStartedAt
          ? `Started ${formatCardDate(project.workStartedAt) || "recently"}`
          : "In progress",
      };
    case TRADE_STATE.WORK_AWAITING:
      return {
        color: StatusColor.IN_PROGRESS,
        label: "Awaiting confirmation",
        rightTop: project.quoteAmount ? `£${formatNum(project.quoteAmount)}` : "—",
        rightBot: `Sent to client ${daysAgoText(project.marked_complete_at) || "recently"}`,
      };
    case TRADE_STATE.WORK_ISSUE:
      return {
        color: StatusColor.ISSUE,
        label: "Issue reported",
        rightTop: project.quoteAmount ? `£${formatNum(project.quoteAmount)}` : "—",
        rightBot: project.statusDetail || "Client reported a problem",
      };
    case TRADE_STATE.WORK_RESOLUTION:
      return {
        color: StatusColor.IN_PROGRESS,
        label: "Resolution sent",
        rightTop: project.quoteAmount ? `£${formatNum(project.quoteAmount)}` : "—",
        rightBot: `Awaiting client ${daysAgoText(project.issueResolvedAt) || "recently"}`,
      };
    case TRADE_STATE.COMPLETED:
      return {
        color: StatusColor.COMPLETED,
        label: "Completed",
        rightTop: project.quoteAmount ? `£${formatNum(project.quoteAmount)}` : "Completed",
        rightBot: `Completed ${formatCardDate(project.completion_confirmed_at || project.issued_at) || "recently"}`,
      };
    default:
      return {
        color: StatusColor.EXPIRED,
        label: "",
        rightTop: null,
        rightBot: null,
      };
  }
}

function buildTradeRow(project, formatNum) {
  const { service, category } = parseTitle(project.title);
  const iconSource =
    (service ? (tryServiceIcon(service)) : null) ||
    (category ? tryCategoryIcon(category) : null) ||
    defaultServiceIcon;

  const canonical = deriveTradeCanonicalState(project);
  const meta = tradeStateMeta(canonical, project, formatNum);

  const muted =
    canonical === TRADE_STATE.ENQUIRY_EXPIRED ||
    canonical === TRADE_STATE.ENQUIRY_DECLINED ||
    canonical === TRADE_STATE.QUOTE_NO_RESPONSE ||
    canonical === TRADE_STATE.QUOTE_DECLINED;
  const fresh = canonical === TRADE_STATE.ENQUIRY_NEW &&
    (project.requestAge === 0 || project.isFresh);

  const subtitle = project.contextLine || project.statusDetail || null;

  return {
    iconSource,
    stripeColor: meta.color,
    statusLabel: meta.label,
    title: service || project.title || "Project",
    subtitle,
    rightTop: meta.rightTop,
    rightBot: meta.rightBot,
    fresh,
    muted,
  };
}

function tryServiceIcon(name) {
  try { return getServiceTypeIcon(name); } catch { return null; }
}
function tryCategoryIcon(name) {
  try { return getCategoryIcon(name); } catch { return null; }
}
const defaultServiceIcon = (() => {
  try { return defaultServiceTypeIcon; } catch { return null; }
})();

const redesign = StyleSheet.create({
  topBar: {
    position: "absolute",
    right: 16,
    flexDirection: "row",
    gap: 8,
    zIndex: 20,
  },
  titleBlock: {
    paddingHorizontal: 20,
    paddingTop: 4,
    paddingBottom: 2,
  },
  title: {
    fontFamily: "PublicSans_700Bold",
    fontSize: 32,
    letterSpacing: -0.8,
    lineHeight: 34,
  },
  subtitle: {
    fontSize: 13,
    marginTop: 4,
    fontFamily: "DMSans_400Regular",
  },
  strip: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 10,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(15,15,20,0.08)",
  },
  stripDivider: {
    width: 1,
    alignSelf: "stretch",
    backgroundColor: "rgba(15,15,20,0.06)",
  },
  stripEyebrow: {
    fontFamily: "PublicSans_700Bold",
    fontSize: 10.5,
    letterSpacing: 1.2,
    textTransform: "uppercase",
    opacity: 0.6,
  },
  stripValue: {
    fontFamily: "PublicSans_700Bold",
    fontSize: 24,
    letterSpacing: -0.6,
    lineHeight: 26,
    marginTop: 6,
  },
  stripMeta: {
    fontSize: 11,
    opacity: 0.55,
    marginTop: 4,
  },
  divider: {
    height: 1,
    marginLeft: 66,
    marginRight: 20,
  },
});

const styles = StyleSheet.create({
  container: {
    flex: 1,
    // No hardcoded backgroundColor — ThemedView supplies theme-aware bg.
  },
  header: {
    paddingHorizontal: 20,
    paddingBottom: 12,
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
  outsideAreaBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#FEF3C7",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    marginTop: 8,
    alignSelf: "flex-start",
  },
  outsideAreaText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#D97706",
  },
  extendedMatchBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#DBEAFE",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    marginTop: 8,
    alignSelf: "flex-start",
  },
  extendedMatchText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#2563EB",
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
  // Past card styles
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
  pastCardQuoteInfo: {
    fontSize: 13,
    color: "#6B7280",
    marginTop: 8,
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
  pastCardAmount: {
    fontSize: 16,
    fontWeight: "600",
    color: "#1F2937",
    marginTop: 8,
    textAlign: "right",
  },
  // Section header styles
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
  sectionHeaderToggle: {
    fontSize: 13,
    fontWeight: "500",
    color: TINT,
  },
});
