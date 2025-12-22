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
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import ThemedView from "../../../components/ThemedView";
import ThemedText from "../../../components/ThemedText";
import Spacer from "../../../components/Spacer";
import { Colors } from "../../../constants/Colors";
import { useUser } from "../../../hooks/useUser";
import { supabase } from "../../../lib/supabase";

// Format number with thousand separators (commas)
function formatNumber(num) {
  if (num == null || isNaN(num)) return "0.00";
  return Number(num).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
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
          .select("id, details, created_at, status, job_outcode, budget_band, suggested_title, requester_id")
          .in("id", reqIds);
        (reqs || []).forEach((r) => (reqById[r.id] = r));
      }

      // Fetch client names for quotes AND requests (from profiles table directly)
      // Include both client_id from quotes and requester_id from requests
      const quoteClientIds = (quotes || []).map((q) => q.client_id).filter(Boolean);
      const requestClientIds = Object.values(reqById).map((r) => r.requester_id).filter(Boolean);
      const clientIds = [...new Set([...quoteClientIds, ...requestClientIds])];
      let clientsById = {};
      if (clientIds.length) {
        const { data: clientsData } = await supabase
          .from("profiles")
          .select("id, full_name, business_name, email")
          .in("id", clientIds);
        (clientsData || []).forEach((c) => {
          clientsById[c.id] = c.full_name || c.business_name || c.email || "Client";
        });
      }

      // Fetch appointments for these quotes
      const quoteIds = (quotes || []).map((q) => q.id);
      let appointmentsByQuote = {};
      if (quoteIds.length) {
        const { data: apptData } = await supabase
          .from("appointments")
          .select("id, quote_id, scheduled_at, title, status, location")
          .in("quote_id", quoteIds)
          .order("scheduled_at", { ascending: true });

        (apptData || []).forEach((a) => {
          if (!appointmentsByQuote[a.quote_id]) appointmentsByQuote[a.quote_id] = [];
          appointmentsByQuote[a.quote_id].push(a);
        });
        setAppointments(apptData || []);
      }

      // INBOX (no quote created yet)
      const inbox = (targets || [])
        .filter((t) => !quotedReqIds.has(t.request_id))
        .map((t) => {
          const r = reqById[t.request_id];
          const requestAge = daysSince(t.created_at);
          const isUrgent = requestAge >= 2 && t.state !== "accepted" && t.state !== "declined";

          return {
            request_id: t.request_id,
            invited_at: t.created_at,
            request_type: t.invited_by || "system",
            state: t.state,
            title: r?.suggested_title || extractTitle(r),
            created_at: r?.created_at,
            budget_band: r?.budget_band || null,
            job_outcode: r?.job_outcode || null,
            requestAge,
            isUrgent,
            // Calculate response deadline (e.g., 3 days to respond)
            responseDeadline: 3 - requestAge,
            // Client name from requester_id
            clientName: r?.requester_id ? clientsById[r.requester_id] || null : null,
          };
        });

      // SENT (quote exists)
      const sent = (quotes || []).map((q) => {
        const r = reqById[q.request_id];
        const t = (targets || []).find(
          (tt) => tt.request_id === q.request_id && tt.trade_id === myId
        );

        // Calculate expiration info
        const issuedAt = q.issued_at ? new Date(q.issued_at) : null;
        const validUntil = q.valid_until ? new Date(q.valid_until) : null;
        const daysToExpiry = validUntil ? daysUntil(validUntil) : (issuedAt ? 14 - daysSince(issuedAt) : null);
        const isExpiringSoon = daysToExpiry !== null && daysToExpiry <= 3 && daysToExpiry > 0;
        const isExpired = daysToExpiry !== null && daysToExpiry <= 0;

        // Client response tracking
        const daysSinceIssued = issuedAt ? daysSince(issuedAt) : 0;
        const clientNotResponding = q.status === "sent" && daysSinceIssued >= 7;

        // Get appointments for this quote
        const quoteAppointments = appointmentsByQuote[q.id] || [];
        const nextAppointment = quoteAppointments.find((a) => new Date(a.scheduled_at) > new Date());

        return {
          id: q.id,
          request_id: q.request_id,
          status: (q.status || "").toLowerCase(),
          issued_at: q.issued_at ?? q.created_at,
          valid_until: q.valid_until,
          title: r?.suggested_title || extractTitle(r),
          request_type: t?.invited_by || "system",
          budget_band: r?.budget_band || null,
          job_outcode: r?.job_outcode || null,
          acceptedByTrade: t?.state === "accepted",
          currency: q.currency,
          grand_total: q.grand_total,
          tax_total: q.tax_total,
          clientName: clientsById[q.client_id] || null,
          // Expiration info
          daysToExpiry,
          isExpiringSoon,
          isExpired: isExpired && q.status !== "expired",
          // Client response tracking
          daysSinceIssued,
          clientNotResponding,
          // Appointment info
          nextAppointment,
          hasAppointments: quoteAppointments.length > 0,
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

  useEffect(() => {
    if (user?.id) load();
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
  const showActionButtons = !isInbox && (displayStatus === "in_progress" || displayStatus === "scheduled" || displayStatus === "sent" || displayStatus === "awaiting");

  // Determine chip label and tone based on context for TRADES view
  let chipLabel = "";
  let chipTone = "waiting";
  let chipIcon = null;

  if (isInbox) {
    // No quote sent yet - inbox items
    if (project.state === "declined") {
      chipLabel = "Declined";
      chipTone = "negative";
    } else {
      // New request that needs quote sent
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
  } else {
    // Quote exists - determine based on status
    const status = (project.status || displayStatus || "").toLowerCase();
    const daysOld = daysSince(project.issued_at);

    if (status === "accepted" || status === "in_progress") {
      chipLabel = "Quote Accepted";
      chipTone = "active";
    } else if (status === "scheduled") {
      chipLabel = "Scheduled";
      chipTone = "active";
      chipIcon = "calendar";
    } else if (status === "sent" || status === "created" || status === "draft" || status === "awaiting") {
      // Quote sent, waiting for client response
      if (daysOld >= 7) {
        chipLabel = "No Response";
        chipTone = "negative";
      } else {
        chipLabel = "Quote Sent";
        chipTone = "waiting";
        chipIcon = "send";
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
      chipLabel = "Quote Sent";
      chipTone = "waiting";
    }
  }

  return (
    <Pressable style={styles.projectCard} onPress={onPress}>
      {/* Header */}
      <View style={styles.cardHeader}>
        <View style={{ flex: 1 }}>
          <ThemedText style={styles.cardTitle} numberOfLines={2}>
            {project.title || "Project"}
          </ThemedText>
          {project.clientName && (
            <ThemedText style={styles.cardSubtitle}>
              {project.clientName}
            </ThemedText>
          )}
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
          {project.job_outcode && (
            <InfoRow icon="location-outline" text={project.job_outcode} />
          )}
        </View>

        {/* Budget */}
        {project.budget_band && (
          <InfoRow icon="cash-outline" text={`Budget: ${project.budget_band}`} />
        )}

        {/* Quote total for sent quotes */}
        {!isInbox && project.grand_total != null && (
          <View style={styles.amountRow}>
            <ThemedText style={styles.amountLabel}>Quote total</ThemedText>
            <ThemedText style={styles.amountValue}>
              {project.currency || "GBP"} {formatNumber(project.grand_total)}
            </ThemedText>
          </View>
        )}

        {/* Appointment info for accepted quotes */}
        {project.nextAppointment && (
          <View style={styles.appointmentInfo}>
            <Ionicons name="calendar" size={14} color={TINT} />
            <ThemedText style={[styles.infoText, { color: TINT, fontWeight: "600" }]}>
              {project.nextAppointment.title || "Appointment"}: {" "}
              {new Date(project.nextAppointment.scheduled_at).toLocaleDateString(undefined, {
                weekday: "short",
                month: "short",
                day: "numeric",
              })}
            </ThemedText>
          </View>
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
            {project.valid_until && (
              <> • Valid until {new Date(project.valid_until).toLocaleDateString(undefined, {
                month: "short",
                day: "numeric",
              })}</>
            )}
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
            <ThemedText style={styles.primaryActionText}>Create Quote</ThemedText>
            <Ionicons name="arrow-forward" size={16} color="#FFF" />
          </Pressable>
        </>
      )}

      {/* Action buttons for sent/active quotes (Message + View Details) */}
      {showActionButtons && (
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
                      quoteId: String(project.id),
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
                onPress?.();
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
                  if (project.type === "inbox") {
                    router.push(`/quotes/request/${project.request_id}`);
                  } else {
                    router.push(`/quotes/${project.id}`);
                  }
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
                  if (project.type === "inbox") {
                    router.push(`/quotes/request/${project.request_id}`);
                  } else {
                    router.push(`/quotes/${project.id}`);
                  }
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
          onPress={() => router.push(`/quotes/${project.id}`)}
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

  // Appointment info
  appointmentInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 4,
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
