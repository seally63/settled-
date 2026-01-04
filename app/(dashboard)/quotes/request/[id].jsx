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
import { useEffect, useMemo, useState, useCallback } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useFocusEffect } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import ThemedView from "../../../../components/ThemedView";
import ThemedText from "../../../../components/ThemedText";
import Spacer from "../../../../components/Spacer";
import { Colors } from "../../../../constants/Colors";
import { useUser } from "../../../../hooks/useUser";
import { supabase } from "../../../../lib/supabase";

// RPC wrappers
import { acceptRequest, declineRequest } from "../../../../lib/api/requests";
import { listRequestImagePaths } from "../../../../lib/api/attachments";

const BUCKET = "request-attachments"; // change if your bucket name differs
const CELL = 96;
const SCREEN_WIDTH = Dimensions.get("window").width;

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

// Quotes section component for Client Request page
function QuotesSection({ quotes, hasQuotes, canCreateQuote, router, requestId, derivedTitleForCreate, clientName }) {
  const [showOtherQuotes, setShowOtherQuotes] = useState(false);

  // Get client first name for quote labels
  const clientFirstName = clientName ? clientName.split(" ")[0] : null;

  // Sort quotes by creation date (oldest first for numbering)
  const sortedByDate = [...quotes].sort((a, b) =>
    new Date(a.created_at) - new Date(b.created_at)
  );

  // Create a map of quote id to its number
  const quoteNumberMap = {};
  sortedByDate.forEach((q, idx) => {
    quoteNumberMap[q.id] = idx + 1;
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

    // Build quote title: "Quote N - ClientName" or just "Quote N"
    const quoteTitle = clientFirstName
      ? `Quote ${quoteNumber} - ${clientFirstName}`
      : `Quote ${quoteNumber}`;

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
          <ThemedText style={[quoteStyles.quoteCardTitle, isMuted && { color: "#9CA3AF" }]}>
            {quoteTitle}
          </ThemedText>
          <QuoteStatusBadge status={isDraft && isInOtherSection ? "unused" : quote.status} />
        </View>

        {/* Price */}
        <ThemedText style={[quoteStyles.quoteCardPrice, isMuted && { color: "#9CA3AF" }]}>
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
              <Ionicons name="document-text-outline" size={32} color="#9CA3AF" />
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
                color="#6B7280"
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
const quoteStyles = StyleSheet.create({
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
    color: "#111827",
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
    borderColor: "#E5E7EB",
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
    backgroundColor: "#F3F4F6",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  emptyStateTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#374151",
    marginBottom: 4,
  },
  emptyStateSubtitle: {
    fontSize: 14,
    color: "#9CA3AF",
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
    borderColor: "#E5E7EB",
    padding: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  quoteCardMuted: {
    backgroundColor: "#F9FAFB",
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
    color: "#111827",
  },
  quoteCardPrice: {
    fontSize: 22,
    fontWeight: "700",
    color: "#111827",
    marginBottom: 4,
  },
  quoteCardDateInfo: {
    fontSize: 13,
    color: "#6B7280",
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
    borderColor: "#E5E7EB",
    backgroundColor: "#fff",
  },
  editButtonText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#374151",
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
    backgroundColor: "#F9FAFB",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  otherQuotesToggleText: {
    fontSize: 14,
    fontWeight: "500",
    color: "#6B7280",
  },
});

export default function RequestDetails() {
  const { id } = useLocalSearchParams(); // request_id
  const router = useRouter();
  const { user } = useUser();
  const insets = useSafeAreaInsets();

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);

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

      // Build public URLs from paths (bucket must be public=true)
      const urls = p
        .map((raw) => String(raw || "").replace(/^\//, ""))
        .map(
          (cleanPath) =>
            supabase.storage.from(BUCKET).getPublicUrl(cleanPath).data
              ?.publicUrl
        )
        .filter(Boolean);

      setAttachments(urls);
    } catch (e) {
      console.warn("attachments/load error:", e?.message || e);
      setAttachments([]);
      setAttachmentsCount(0);
    }
  }, []);

  const load = useCallback(async () => {
    if (!user?.id || !id) return;
    setLoading(true);
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
            .select("request_id, trade_id, state, invited_by, created_at")
            .eq("request_id", id)
            .eq("trade_id", myId)
            .maybeSingle(),
          supabase
            .from("tradify_native_app_db")
            .select("id, project_title, grand_total, status, created_at, line_items, valid_until, request_id")
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
    Alert.alert("Accept request", "Confirm you want to accept this request?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Accept",
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

  return (
    <ThemedView style={styles.container}>
      {/* Header - Shows "Client Request" with close button */}
      <View style={[styles.header, { paddingTop: insets.top + 16 }]}>
        <View style={styles.headerRow}>
          <ThemedText style={styles.headerTitle}>Client Request</ThemedText>
          <Pressable
            onPress={() =>
              router.canGoBack?.() ? router.back() : router.replace("/quotes")
            }
            hitSlop={10}
            style={styles.closeButton}
          >
            <Ionicons name="close" size={28} color="#6B7280" />
          </Pressable>
        </View>
      </View>

      {loading ? (
        <>
          <Spacer />
          <ThemedText>Loading…</ThemedText>
        </>
      ) : err ? (
        <>
          <Spacer />
          <ThemedText>Error: {err}</ThemedText>
        </>
      ) : !req ? (
        <>
          <Spacer />
          <ThemedText>Request not found.</ThemedText>
        </>
      ) : (
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingBottom: 140 }}
          contentInsetAdjustmentBehavior="always"
          keyboardShouldPersistTaps="handled"
        >
          {/* Status chips */}
          <View style={styles.chipsRow}>
            <Chip tone="waiting" icon="information-circle">
              {(tgt?.invited_by || "").toLowerCase() === "client"
                ? "Direct request"
                : "Open request"}
            </Chip>
            <Chip tone={statusTone(status)}>
              {status === "open"
                ? "Action needed"
                : status[0].toUpperCase() + status.slice(1)}
            </Chip>
            {!!req?.budget_band && (
              <Chip tone="muted" icon="cash-outline">{req.budget_band}</Chip>
            )}
            {req?.timing_options?.is_emergency && (
              <Chip tone="negative" icon="warning">Emergency</Chip>
            )}
          </View>

          {/* Actions - shown when request is open */}
          {status === "open" && (
            <View style={styles.actionButtonsContainer}>
              <Pressable
                onPress={onDecline}
                style={styles.declineButton}
              >
                <ThemedText style={styles.declineButtonText}>Decline</ThemedText>
              </Pressable>

              <Pressable
                onPress={onAccept}
                style={styles.acceptButton}
              >
                <ThemedText style={styles.acceptButtonText}>Accept request</ThemedText>
              </Pressable>
            </View>
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

          {/* Appointments Section - shown when request is claimed */}
          {status === "claimed" && (
            <>
              <View style={styles.sectionHeaderRow}>
                <ThemedText style={styles.sectionHeaderTitle}>Appointments</ThemedText>
                <Pressable
                  onPress={() => {
                    router.push({
                      pathname: "/quotes/schedule",
                      params: {
                        requestId: String(id || ""),
                        title: encodeURIComponent(derivedTitleForCreate),
                        clientName: encodeURIComponent(clientName || ""),
                        postcode: encodeURIComponent(req?.postcode || ""),
                      },
                    });
                  }}
                  style={styles.sectionHeaderBtn}
                  hitSlop={6}
                >
                  <Ionicons name="add" size={16} color={Colors.primary} />
                  <ThemedText style={styles.sectionHeaderBtnText}>Add</ThemedText>
                </Pressable>
              </View>

              <View style={[styles.card, { marginTop: 8 }]}>
                {appointments.length === 0 ? (
                  <ThemedText style={styles.emptyStateText}>No appointments scheduled</ThemedText>
                ) : (
                  appointments.map((appt, idx) => {
                    const scheduledDate = new Date(appt.scheduled_at);
                    const isProposed = appt.status === "proposed";
                    const isConfirmed = appt.status === "confirmed";
                    const isDeclined = appt.status === "declined";

                    return (
                      <View key={appt.id}>
                        <View style={styles.appointmentListItem}>
                          <Ionicons
                            name="calendar"
                            size={20}
                            color="#6B7280"
                          />
                          <View style={{ flex: 1 }}>
                            <ThemedText style={styles.appointmentListTitle}>
                              {appt.title || "Survey visit"}
                            </ThemedText>
                            <ThemedText style={styles.appointmentListDateTime}>
                              {scheduledDate.toLocaleDateString(undefined, {
                                weekday: "short",
                                day: "numeric",
                                month: "short",
                              })}, {scheduledDate.toLocaleTimeString(undefined, {
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </ThemedText>
                            {appt.location && (
                              <ThemedText style={styles.appointmentListLocation}>
                                {appt.location}
                              </ThemedText>
                            )}
                          </View>
                          <View style={[
                            styles.appointmentListBadge,
                            { backgroundColor: isConfirmed ? "#D1FAE5" : isProposed ? "#FEF3C7" : "#FEE2E2" }
                          ]}>
                            <Ionicons
                              name={isConfirmed ? "checkmark-circle" : isProposed ? "hourglass" : "close-circle"}
                              size={14}
                              color={isConfirmed ? "#10B981" : isProposed ? "#F59E0B" : "#EF4444"}
                            />
                            <ThemedText style={[
                              styles.appointmentListBadgeText,
                              { color: isConfirmed ? "#10B981" : isProposed ? "#F59E0B" : "#EF4444" }
                            ]}>
                              {isConfirmed ? "Confirmed" : isProposed ? "Awaiting confirmation" : isDeclined ? "Declined" : appt.status}
                            </ThemedText>
                          </View>
                        </View>
                        {idx < appointments.length - 1 && <View style={styles.appointmentListDivider} />}
                      </View>
                    );
                  })
                )}
              </View>
            </>
          )}

          {/* Quote Section - shown when request is claimed */}
          {status === "claimed" && (
            <QuotesSection
              quotes={quotes}
              hasQuotes={hasQuotes}
              canCreateQuote={canCreateQuote}
              router={router}
              requestId={id}
              derivedTitleForCreate={derivedTitleForCreate}
              clientName={clientName}
            />
          )}

          {/* Service Details Card */}
          <View style={styles.sectionHeaderRow}>
            <ThemedText style={styles.sectionHeaderTitle}>Service Details</ThemedText>
          </View>
          <View style={[styles.card, { marginTop: 8 }]}>
            {/* Category - from joined table or parsed */}
            <View style={styles.requestDetailRow}>
              <Ionicons name="grid-outline" size={18} color="#6B7280" />
              <View style={styles.requestDetailContent}>
                <ThemedText style={styles.requestDetailLabel}>Category</ThemedText>
                <ThemedText style={styles.requestDetailValue}>
                  {req?.service_categories?.name || parsed.category || "—"}
                </ThemedText>
              </View>
            </View>

            {/* Service Type - from joined table or parsed */}
            <View style={styles.requestDetailRow}>
              <Ionicons name="construct-outline" size={18} color="#6B7280" />
              <View style={styles.requestDetailContent}>
                <ThemedText style={styles.requestDetailLabel}>Service</ThemedText>
                <ThemedText style={styles.requestDetailValue}>
                  {req?.service_types?.name || parsed.service || parsed.main || "—"}
                </ThemedText>
              </View>
            </View>

            {/* Property Type - from joined table or parsed */}
            <View style={styles.requestDetailRow}>
              <Ionicons name="home-outline" size={18} color="#6B7280" />
              <View style={styles.requestDetailContent}>
                <ThemedText style={styles.requestDetailLabel}>Property</ThemedText>
                <ThemedText style={styles.requestDetailValue}>
                  {req?.property_types?.name || parsed.property || "Not specified"}
                </ThemedText>
              </View>
            </View>

            {/* Timing - from joined table or parsed */}
            <View style={styles.requestDetailRow}>
              <Ionicons name="time-outline" size={18} color={req?.timing_options?.is_emergency ? "#EF4444" : "#6B7280"} />
              <View style={styles.requestDetailContent}>
                <ThemedText style={styles.requestDetailLabel}>Timing</ThemedText>
                <ThemedText style={[styles.requestDetailValue, req?.timing_options?.is_emergency && { color: "#EF4444" }]}>
                  {req?.timing_options?.name || parsed.timing || "—"}
                </ThemedText>
              </View>
            </View>

            {/* Location - postcode */}
            {!!req?.postcode && (
              <View style={styles.requestDetailRow}>
                <Ionicons name="location-outline" size={18} color="#6B7280" />
                <View style={styles.requestDetailContent}>
                  <ThemedText style={styles.requestDetailLabel}>Location</ThemedText>
                  <ThemedText style={styles.requestDetailValue}>{req.postcode}</ThemedText>
                </View>
              </View>
            )}

            {/* Budget - from database or parsed from details */}
            {(!!req?.budget_band || !!parsed.budget) && (
              <View style={styles.requestDetailRow}>
                <Ionicons name="cash-outline" size={18} color="#6B7280" />
                <View style={styles.requestDetailContent}>
                  <ThemedText style={styles.requestDetailLabel}>Budget</ThemedText>
                  <ThemedText style={styles.requestDetailValue}>{req?.budget_band || parsed.budget}</ThemedText>
                </View>
              </View>
            )}

            {/* Legacy: Address if available */}
            {!!parsed.address && (
              <View style={styles.requestDetailRow}>
                <Ionicons name="navigate-outline" size={18} color="#6B7280" />
                <View style={styles.requestDetailContent}>
                  <ThemedText style={styles.requestDetailLabel}>Address</ThemedText>
                  <ThemedText style={styles.requestDetailValue}>{parsed.address}</ThemedText>
                </View>
              </View>
            )}

            {/* Legacy: Start date if available */}
            {!!parsed.start && (
              <View style={styles.requestDetailRow}>
                <Ionicons name="calendar-outline" size={18} color="#6B7280" />
                <View style={styles.requestDetailContent}>
                  <ThemedText style={styles.requestDetailLabel}>Start</ThemedText>
                  <ThemedText style={styles.requestDetailValue}>{parsed.start}</ThemedText>
                </View>
              </View>
            )}

            {/* Legacy: Refit type if available */}
            {!!parsed.refit && (
              <View style={styles.requestDetailRow}>
                <Ionicons name="hammer-outline" size={18} color="#6B7280" />
                <View style={styles.requestDetailContent}>
                  <ThemedText style={styles.requestDetailLabel}>Refit type</ThemedText>
                  <ThemedText style={styles.requestDetailValue}>{parsed.refit}</ThemedText>
                </View>
              </View>
            )}

            {/* Description - always show, even if empty */}
            <View style={styles.divider} />
            <View style={styles.requestDetailRow}>
              <Ionicons name="document-text-outline" size={18} color="#6B7280" />
              <View style={styles.requestDetailContent}>
                <ThemedText style={styles.requestDetailLabel}>Description</ThemedText>
                <ThemedText style={[
                  styles.requestDetailValue,
                  !(parsed.description || parsed.notes) && styles.descriptionEmpty
                ]}>
                  {parsed.description || parsed.notes || "No description provided"}
                </ThemedText>
              </View>
            </View>
          </View>

          {/* Photos Card - horizontally scrollable */}
          <View style={styles.sectionHeaderRow}>
            <ThemedText style={styles.sectionHeaderTitle}>Photos</ThemedText>
            {attachmentsCount > 0 && (
              <View style={styles.photoCountBadge}>
                <ThemedText style={styles.photoCountText}>{attachmentsCount}</ThemedText>
              </View>
            )}
          </View>
          <View style={[styles.card, { marginTop: 8 }]}>
            {hasAttachments ? (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.photoScrollContent}
              >
                {attachments.map((url, i) => (
                  <Pressable
                    key={`${url}-${i}`}
                    onPress={() => setViewer({ open: true, index: i })}
                    style={styles.photoThumb}
                  >
                    <Image
                      source={{ uri: url }}
                      style={styles.photoImg}
                      resizeMode="cover"
                      onError={(e) =>
                        console.warn("thumb error:", url, e?.nativeEvent?.error)
                      }
                    />
                  </Pressable>
                ))}
              </ScrollView>
            ) : (
              <ThemedText style={styles.emptyStateText}>No photos attached</ThemedText>
            )}
          </View>
        </ScrollView>
      )}

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

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "stretch",
    backgroundColor: "#F9FAFB",
  },
  // Header - Profile-style matching Quote Overview
  header: {
    backgroundColor: "#F9FAFB",
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
    color: "#111827",
  },
  headerInfo: {
    marginTop: 8,
  },
  headerInfoText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#374151",
  },
  headerInfoSubtext: {
    fontSize: 14,
    color: "#6B7280",
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

  card: {
    marginTop: 16,
    marginHorizontal: 16,
    backgroundColor: "#fff",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#E5E7EB",
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
    color: "#374151",
    flex: 1,
  },

  kvRow: { flexDirection: "row", gap: 10, marginVertical: 6 },
  kvKey: { width: 100, fontWeight: "600", color: "#6B7280", fontSize: 14 },
  kvVal: { flex: 1, color: "#111827", fontSize: 14 },

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
    color: "#6B7280",
    marginBottom: 2,
  },
  requestDetailValue: {
    fontSize: 14,
    color: "#111827",
    lineHeight: 20,
  },

  // Description section
  descriptionSection: {
    marginTop: 4,
  },
  descriptionLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: "#6B7280",
    marginBottom: 6,
  },
  descriptionText: {
    fontSize: 14,
    lineHeight: 22,
    color: "#374151",
  },
  descriptionEmpty: {
    color: "#9CA3AF",
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
    color: "#6B7280",
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
    backgroundColor: "#F3F4F6",
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
    color: "#9CA3AF",
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
    borderColor: "#E5E7EB",
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
  },
  declineButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#374151",
  },
  acceptButton: {
    flex: 2,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: Colors.primary, // Purple primary color
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
    color: "#111827",
  },
  statusBannerSubtitle: {
    fontSize: 13,
    color: "#6B7280",
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
    color: "#111827",
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
    color: "#9CA3AF",
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
    backgroundColor: "#F3F4F6",
    alignItems: "center",
    justifyContent: "center",
  },
  quoteSummaryTitle: {
    fontSize: 15,
    fontWeight: "600",
    color: "#111827",
  },
  quoteSummaryStatus: {
    fontSize: 13,
    color: "#6B7280",
    marginTop: 2,
  },
  quoteSummaryTotal: {
    fontSize: 15,
    fontWeight: "700",
    color: "#111827",
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
    color: "#111827",
  },
  draftQuoteItems: {
    backgroundColor: "#F9FAFB",
    borderRadius: 8,
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
    color: "#374151",
    marginRight: 12,
  },
  draftQuoteItemPrice: {
    fontSize: 14,
    fontWeight: "500",
    color: "#111827",
  },
  draftQuoteMoreItems: {
    fontSize: 13,
    color: "#6B7280",
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
    color: "#374151",
  },
  draftQuoteTotalValue: {
    fontSize: 18,
    fontWeight: "700",
    color: "#111827",
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
    backgroundColor: "#F3F4F6",
    alignItems: "center",
    justifyContent: "center",
  },
  appointmentListTitle: {
    fontSize: 15,
    fontWeight: "600",
    color: "#111827",
    marginBottom: 4,
  },
  appointmentListDateTime: {
    fontSize: 14,
    color: "#374151",
  },
  appointmentListLocation: {
    fontSize: 13,
    color: "#6B7280",
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
