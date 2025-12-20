// app/(dashboard)/client/myquotes/index.jsx
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
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { supabase } from "../../../../lib/supabase";
import { useUser } from "../../../../hooks/useUser";

import ThemedView from "../../../../components/ThemedView";
import ThemedText from "../../../../components/ThemedText";
import ThemedButton from "../../../../components/ThemedButton";
import Spacer from "../../../../components/Spacer";
import { Colors } from "../../../../constants/Colors";

const TINT = Colors?.light?.tint || "#6849a7";

// Format number with thousand separators (commas)
function formatNumber(num) {
  if (num == null || isNaN(num)) return "0.00";
  return Number(num).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// Status badge component with icons (no emojis)
function StatusBadge({ type }) {
  const badges = {
    NEW: { icon: "sparkles", color: "#10B981", bg: "#D1FAE5", text: "New" },
    DECLINED: { icon: "close-circle", color: "#EF4444", bg: "#FEE2E2", text: "Declined" },
    EXPIRES_SOON: { icon: "time", color: "#F59E0B", bg: "#FEF3C7", text: "Expires soon" },
    MULTIPLE_QUOTES: { icon: "document-text", color: "#8B5CF6", bg: "#EDE9FE", text: "Multiple quotes" },
    RESPONSE_NEEDED: { icon: "alert-circle", color: "#F59E0B", bg: "#FEF3C7", text: "Response needed" },
    AT_LIMIT: { icon: "warning", color: "#DC2626", bg: "#FEE2E2", text: "At limit" },
    ACTIVE: { icon: "construct", color: "#10B981", bg: "#D1FAE5", text: "Active" },
    SCHEDULED: { icon: "calendar", color: "#3B82F6", bg: "#DBEAFE", text: "Scheduled" },
    COMPLETED: { icon: "checkmark-done", color: "#6B7280", bg: "#F3F4F6", text: "Completed" },
    DECLINED_BY_YOU: { icon: "close", color: "#6B7280", bg: "#F3F4F6", text: "Declined by you" },
    EXPIRED: { icon: "ban", color: "#6B7280", bg: "#F3F4F6", text: "Expired" },
    AWAITING: { icon: "hourglass", color: "#3B82F6", bg: "#DBEAFE", text: "Awaiting response" },
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

// Project card component
function ProjectCard({ item, onPress, statusType, actionButtons }) {
  return (
    <Pressable style={styles.projectCard} onPress={onPress}>
      {/* Header */}
      <View style={styles.cardHeader}>
        <View style={{ flex: 1 }}>
          <ThemedText style={styles.cardTitle}>
            {item.title || "Project"}
          </ThemedText>
          {!!item.subtitle && (
            <ThemedText style={styles.cardSubtitle} variant="muted">
              {item.subtitle}
            </ThemedText>
          )}
        </View>
        <StatusBadge type={statusType} />
      </View>

      <Spacer height={12} />

      {/* Content area */}
      <View style={styles.cardContent}>
        {!!item.tradeName && (
          <View style={styles.infoRow}>
            <Ionicons name="business" size={16} color="#6B7280" />
            <ThemedText style={styles.infoText}>{item.tradeName}</ThemedText>
          </View>
        )}

        {!!item.amount && (
          <View style={styles.amountRow}>
            <ThemedText style={styles.amountLabel}>Quote total</ThemedText>
            <ThemedText style={styles.amountValue}>
              {item.currency || "GBP"} {formatNumber(item.amount)}
            </ThemedText>
          </View>
        )}

        {!!item.startDate && (
          <View style={styles.infoRow}>
            <Ionicons name="calendar-outline" size={16} color="#6B7280" />
            <ThemedText style={styles.infoText}>Can start: {item.startDate}</ThemedText>
          </View>
        )}

        {!!item.appointmentDate && (
          <View style={styles.infoRow}>
            <Ionicons name="calendar" size={16} color={Colors.primary} />
            <ThemedText style={[styles.infoText, { color: Colors.primary, fontWeight: "600" }]}>
              {item.appointmentDate}
            </ThemedText>
          </View>
        )}

        {!!item.expiryWarning && (
          <View style={styles.warningRow}>
            <Ionicons name="alert-circle" size={16} color="#F59E0B" />
            <ThemedText style={[styles.infoText, { color: "#F59E0B" }]}>
              {item.expiryWarning}
            </ThemedText>
          </View>
        )}

        {!!item.limitWarning && (
          <View style={styles.warningRow}>
            <Ionicons name="warning" size={16} color="#DC2626" />
            <ThemedText style={[styles.infoText, { color: "#DC2626" }]}>
              {item.limitWarning}
            </ThemedText>
          </View>
        )}

        {!!item.metaInfo && (
          <ThemedText style={styles.metaText} variant="muted">
            {item.metaInfo}
          </ThemedText>
        )}
      </View>

      {/* Action buttons */}
      {actionButtons && actionButtons.length > 0 && (
        <>
          <Spacer height={12} />
          <View style={styles.cardActions}>
            {actionButtons.map((btn, idx) => (
              <ThemedButton
                key={idx}
                style={[
                  styles.actionBtn,
                  btn.variant === "secondary" && styles.actionBtnSecondary,
                  { flex: 1 },
                ]}
                onPress={btn.onPress}
              >
                <ThemedText
                  style={[
                    styles.actionBtnText,
                    btn.variant === "secondary" && styles.actionBtnTextSecondary,
                  ]}
                >
                  {btn.label}
                </ThemedText>
              </ThemedButton>
            ))}
          </View>
        </>
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

  // Transform data into project cards with proper categorization
  const projects = useMemo(() => {
    const needsAttention = [];
    const waitingForQuotes = [];
    const activeJobs = [];
    const completedProjects = [];

    const atDirectLimit = caps.direct_used >= caps.direct_cap;
    const atOpenLimit = caps.open_used >= caps.open_cap;

    // Helper to calculate days difference
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

    // Process quotes needing decision
    decideQuotes.forEach((q) => {
      const daysOld = daysSince(q.issued_at);
      const isNew = daysOld < 1;
      const needsResponse = daysOld >= 7;

      // Calculate expiry (assuming 14 day expiry from issued_at)
      const expiryDays = 14 - daysOld;
      const expiresSoon = expiryDays <= 3 && expiryDays > 0;

      let statusType = "RESPONSE_NEEDED";
      if (isNew) statusType = "NEW";
      else if (expiresSoon) statusType = "EXPIRES_SOON";
      else if (needsResponse) statusType = "RESPONSE_NEEDED";

      const expiryWarning = expiresSoon ? `Expires in ${expiryDays} day${expiryDays !== 1 ? 's' : ''}` : null;

      needsAttention.push({
        id: `decide-${q.quote_id}`,
        type: "decide",
        title: q.request_suggested_title || q.project_title || "Quote",
        subtitle: null,
        tradeName: q.trade_business_name,
        amount: q.grand_total,
        currency: q.currency || "GBP",
        startDate: null,
        expiryWarning,
        metaInfo: `Received ${daysOld} day${daysOld !== 1 ? 's' : ''} ago`,
        statusType,
        actionButtons: [
          {
            label: "Accept Quote",
            variant: "primary",
            onPress: () => {
              // TODO: Implement accept quote flow
              router.push(`/myquotes/${q.quote_id}`);
            },
          },
          {
            label: "Decline",
            variant: "secondary",
            onPress: () => {
              // TODO: Implement decline quote flow
              router.push(`/myquotes/${q.quote_id}`);
            },
          },
        ],
      });
    });

    // Process responses (trades declined requests)
    responses.forEach((r) => {
      const status = String(r.decision_status || "").toLowerCase();

      if (status === "declined") {
        const daysAgo = daysSince(r.created_at);

        needsAttention.push({
          id: `response-declined-${r.id || r.request_id}`,
          type: "response_declined",
          title: r.suggested_title || "Request",
          subtitle: null,
          tradeName: null,
          metaInfo: `Declined ${daysAgo} day${daysAgo !== 1 ? 's' : ''} ago`,
          limitWarning: `Direct requests remaining: ${caps.direct_cap - caps.direct_used}/${caps.direct_cap}`,
          statusType: "DECLINED",
          actionButtons: [
            {
              label: "Find Other Trades",
              variant: "primary",
              onPress: () => router.push(`/myquotes/request/${r.request_id}`),
            },
          ],
        });
      } else if (status === "accepted") {
        // Trade accepted but no quote yet - waiting for quote
        waitingForQuotes.push({
          id: `response-accepted-${r.id || r.request_id}`,
          type: "response_accepted",
          title: r.suggested_title || "Request",
          subtitle: null,
          metaInfo: `${r.decisions_count || 0} trade${r.decisions_count !== 1 ? 's' : ''} responded • Waiting for quote`,
          statusType: "AWAITING",
          actionButtons: [
            {
              label: "View Request",
              variant: "primary",
              onPress: () => router.push(`/myquotes/request/${r.request_id}`),
            },
          ],
        });
      }
    });

    // Process open requests (no responses yet)
    requests.forEach((req) => {
      const isAtLimit = req.is_direct ? atDirectLimit : atOpenLimit;
      const daysAgo = daysSince(req.created_at);

      waitingForQuotes.push({
        id: `request-${req.id}`,
        type: "request",
        title: req.suggested_title || (req.is_direct ? "Direct request" : "Open request"),
        subtitle: req.job_outcode || null,
        metaInfo: `${req.is_direct ? 'Direct' : 'Open'} request • ${daysAgo} day${daysAgo !== 1 ? 's' : ''} ago • No response yet`,
        limitWarning: isAtLimit ? `Daily ${req.is_direct ? 'direct' : 'open'} request limit reached` : null,
        statusType: isAtLimit ? "AT_LIMIT" : "AWAITING",
        actionButtons: [
          {
            label: "View Request",
            variant: "primary",
            onPress: () => router.push(`/myquotes/request/${req.id}`),
          },
        ],
      });
    });

    // Process decided quotes
    decidedQuotes.forEach((q) => {
      const status = String(q.status || "").toLowerCase();

      if (status === "accepted") {
        // Find next appointment (earliest upcoming or confirmed)
        const relatedAppointments = appointments.filter(
          (appt) => appt.quote_id === q.quote_id
        ).sort((a, b) => new Date(a.scheduled_at) - new Date(b.scheduled_at));

        const nextAppointment = relatedAppointments[0];
        const scheduledDate = nextAppointment?.scheduled_at ? new Date(nextAppointment.scheduled_at) : null;
        const isScheduled = !!scheduledDate;

        activeJobs.push({
          id: `active-${q.quote_id}`,
          type: "active",
          title: q.request_suggested_title || q.project_title || "Active job",
          subtitle: null,
          tradeName: q.trade_business_name,
          amount: q.grand_total,
          currency: q.currency || "GBP",
          appointmentDate: scheduledDate
            ? `${nextAppointment.title || "Appointment"}: ${scheduledDate.toLocaleDateString(undefined, {
                weekday: "short",
                month: "short",
                day: "numeric"
              })} at ${scheduledDate.toLocaleTimeString(undefined, {
                hour: "2-digit",
                minute: "2-digit"
              })}`
            : null,
          metaInfo: null, // Removed "Accepted" date
          statusType: isScheduled ? "SCHEDULED" : "ACTIVE",
          requestId: q.request_id, // Pass request_id for messaging
          actionButtons: [
            {
              label: "Message",
              variant: "secondary",
              onPress: () => {
                if (q.request_id) {
                  router.push({
                    pathname: "/(dashboard)/messages/[id]",
                    params: {
                      id: String(q.request_id),
                      name: q.trade_business_name || "",
                      quoteId: String(q.quote_id),
                      returnTo: "/myquotes", // Tell messages screen to return to projects
                    },
                  });
                } else {
                  router.push(`/messages`);
                }
              },
            },
            {
              label: "View Details",
              variant: "primary",
              onPress: () => router.push(`/myquotes/${q.quote_id}`),
            },
          ],
        });
      } else if (status === "declined") {
        const daysAgo = daysSince(q.issued_at);

        completedProjects.push({
          id: `declined-${q.quote_id}`,
          type: "declined",
          title: q.request_suggested_title || q.project_title || "Quote",
          subtitle: null,
          tradeName: q.trade_business_name,
          amount: q.grand_total,
          currency: q.currency || "GBP",
          metaInfo: `You declined ${daysAgo} day${daysAgo !== 1 ? 's' : ''} ago`,
          statusType: "DECLINED_BY_YOU",
          actionButtons: [
            {
              label: "View Quote",
              variant: "secondary",
              onPress: () => router.push(`/myquotes/${q.quote_id}`),
            },
          ],
        });
      } else if (status === "expired") {
        const daysAgo = daysSince(q.issued_at);

        completedProjects.push({
          id: `expired-${q.quote_id}`,
          type: "expired",
          title: q.request_suggested_title || q.project_title || "Quote",
          subtitle: null,
          tradeName: q.trade_business_name,
          amount: q.grand_total,
          currency: q.currency || "GBP",
          metaInfo: `Expired ${daysAgo} days ago (no response)`,
          statusType: "EXPIRED",
          actionButtons: [
            {
              label: "Request Updated Quote",
              variant: "primary",
              onPress: () => router.push(`/myquotes/${q.quote_id}`),
            },
          ],
        });
      }
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
                actionButtons={project.actionButtons}
                onPress={() => {
                  // Navigate based on project type
                  if (project.type === "decide" && project.id.includes("decide-")) {
                    const quoteId = project.id.replace("decide-", "");
                    router.push(`/myquotes/${quoteId}`);
                  } else if (project.type === "response_declined" && project.actionButtons?.[0]) {
                    project.actionButtons[0].onPress();
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
                actionButtons={project.actionButtons}
                onPress={() => {
                  // Navigate to request detail
                  if (project.actionButtons?.[0]) {
                    project.actionButtons[0].onPress();
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
                actionButtons={project.actionButtons}
                onPress={() => {
                  // Navigate to quote detail (View Details action)
                  const quoteId = project.id.replace("active-", "");
                  router.push(`/myquotes/${quoteId}`);
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
                actionButtons={project.actionButtons}
                onPress={() => {
                  // Navigate to quote detail
                  if (project.actionButtons?.[0]) {
                    project.actionButtons[0].onPress();
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
  },
  cardSubtitle: {
    fontSize: 14,
    marginTop: 2,
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
  warningRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 6,
    paddingHorizontal: 10,
    backgroundColor: "#FEF3C7",
    borderRadius: 8,
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
  cardActions: {
    flexDirection: "row",
    gap: 8,
  },
  actionBtn: {
    minWidth: 100,
    backgroundColor: TINT,
    borderRadius: 999,
    paddingVertical: 10,
    paddingHorizontal: 16,
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
  actionBtnTextSecondary: {
    color: "#374151",
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
