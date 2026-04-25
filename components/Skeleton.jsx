// components/Skeleton.jsx
// Skeleton loader component with shimmer animation
import { useEffect, useRef } from "react";
import { View, Animated, StyleSheet } from "react-native";
import { Colors } from "../constants/Colors";
import { useTheme } from "../hooks/useTheme";

// Base skeleton box with shimmer.
// Reads the theme so the shimmer fill matches dark/light mode automatically —
// no caller has to pass a colour. Override via `style` if needed.
export function SkeletonBox({ width, height, borderRadius = 4, style }) {
  const { colors: c } = useTheme();
  const shimmerAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(shimmerAnim, {
          toValue: 1,
          duration: 1000,
          useNativeDriver: true,
        }),
        Animated.timing(shimmerAnim, {
          toValue: 0,
          duration: 1000,
          useNativeDriver: true,
        }),
      ])
    );
    animation.start();
    return () => animation.stop();
  }, [shimmerAnim]);

  const opacity = shimmerAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0.3, 0.7],
  });

  return (
    <Animated.View
      style={[
        { width, height, borderRadius, opacity, backgroundColor: c.elevate2 },
        style,
      ]}
    />
  );
}

// Circular skeleton (for avatars)
export function SkeletonCircle({ size = 48, style }) {
  return <SkeletonBox width={size} height={size} borderRadius={size / 2} style={style} />;
}

// Text line skeleton
export function SkeletonText({ width = "100%", height = 14, style }) {
  return <SkeletonBox width={width} height={height} borderRadius={4} style={style} />;
}

// ==================== PAGE SKELETONS ====================

// Home page skeleton (trades dashboard)
export function HomePageSkeleton({ paddingTop }) {
  const { colors: c } = useTheme();
  const cardThemed = { backgroundColor: c.elevate, borderColor: c.border };
  return (
    <View style={[styles.pageContainer, { paddingTop: paddingTop ?? 16 }]}>
      {/* Header */}
      <View style={styles.headerRow}>
        <SkeletonText width={120} height={28} />
        <SkeletonCircle size={40} />
      </View>

      {/* Stats cards */}
      <View style={styles.statsRow}>
        <View style={[styles.statCard, cardThemed]}>
          <SkeletonText width={60} height={32} />
          <SkeletonText width={80} height={14} style={{ marginTop: 8 }} />
        </View>
        <View style={[styles.statCard, cardThemed]}>
          <SkeletonText width={60} height={32} />
          <SkeletonText width={80} height={14} style={{ marginTop: 8 }} />
        </View>
      </View>

      {/* Section title */}
      <SkeletonText width={140} height={20} style={{ marginTop: 24, marginBottom: 12 }} />

      {/* List items */}
      {[1, 2, 3].map((i) => (
        <View key={i} style={[styles.listCard, cardThemed]}>
          <View style={styles.listCardRow}>
            <SkeletonCircle size={48} />
            <View style={styles.listCardContent}>
              <SkeletonText width="70%" height={16} />
              <SkeletonText width="50%" height={14} style={{ marginTop: 6 }} />
            </View>
          </View>
        </View>
      ))}
    </View>
  );
}

// Projects/Quotes page skeleton
export function ProjectsPageSkeleton({ paddingTop }) {
  const { colors: c } = useTheme();
  const cardThemed = { backgroundColor: c.elevate, borderColor: c.border };
  return (
    <View style={[styles.pageContainer, { paddingTop: paddingTop ?? 16 }]}>
      {/* Header */}
      <SkeletonText width={100} height={28} style={{ marginBottom: 16 }} />

      {/* Tabs */}
      <View style={styles.tabsRow}>
        <SkeletonBox width={80} height={36} borderRadius={18} />
        <SkeletonBox width={80} height={36} borderRadius={18} />
        <SkeletonBox width={80} height={36} borderRadius={18} />
      </View>

      {/* Project cards */}
      {[1, 2, 3].map((i) => (
        <View key={i} style={[styles.projectCard, cardThemed]}>
          <View style={styles.projectCardHeader}>
            <SkeletonCircle size={44} />
            <View style={{ flex: 1, marginLeft: 12 }}>
              <SkeletonText width="60%" height={16} />
              <SkeletonText width="40%" height={14} style={{ marginTop: 6 }} />
            </View>
            <SkeletonBox width={70} height={24} borderRadius={12} />
          </View>
          <View style={[styles.projectCardBody, { borderTopColor: c.border }]}>
            <SkeletonText width="90%" height={14} />
            <SkeletonText width="70%" height={14} style={{ marginTop: 6 }} />
          </View>
        </View>
      ))}
    </View>
  );
}

// Messages page skeleton
export function MessagesPageSkeleton({ paddingTop }) {
  const { colors: c } = useTheme();
  return (
    <View style={[styles.pageContainer, { paddingTop: paddingTop ?? 16 }]}>
      {/* Header */}
      <SkeletonText width={120} height={28} style={{ marginBottom: 16 }} />

      {/* Conversation items */}
      {[1, 2, 3, 4, 5].map((i) => (
        <View key={i} style={[styles.messageItem, { borderBottomColor: c.border }]}>
          <SkeletonCircle size={52} />
          <View style={styles.messageContent}>
            <View style={styles.messageHeader}>
              <SkeletonText width="50%" height={16} />
              <SkeletonText width={50} height={12} />
            </View>
            <SkeletonText width="80%" height={14} style={{ marginTop: 6 }} />
          </View>
        </View>
      ))}
    </View>
  );
}

// Profile page skeleton
export function ProfilePageSkeleton({ paddingTop }) {
  const { colors: c } = useTheme();
  return (
    <View style={[styles.pageContainer, { paddingTop: paddingTop ?? 16 }]}>
      {/* Header */}
      <View style={styles.headerRow}>
        <SkeletonText width={80} height={28} />
        <SkeletonBox width={26} height={26} borderRadius={4} />
      </View>

      {/* Profile card */}
      <View style={[styles.profileCard, { backgroundColor: c.elevate, borderColor: c.border }]}>
        <View style={styles.profileCardColumns}>
          {/* Left column */}
          <View style={styles.profileLeftCol}>
            <SkeletonCircle size={72} />
            <SkeletonText width={100} height={16} style={{ marginTop: 12 }} />
            <SkeletonText width={80} height={14} style={{ marginTop: 4 }} />
            <View style={styles.badgesRow}>
              <SkeletonBox width={32} height={32} borderRadius={8} />
              <SkeletonBox width={32} height={32} borderRadius={8} />
              <SkeletonBox width={32} height={32} borderRadius={8} />
            </View>
          </View>

          {/* Divider */}
          <View style={[styles.verticalDivider, { backgroundColor: c.border }]} />

          {/* Right column */}
          <View style={styles.profileRightCol}>
            <View style={styles.profileSection}>
              <SkeletonText width="80%" height={14} />
            </View>
            <View style={[styles.horizontalDivider, { backgroundColor: c.border }]} />
            <View style={styles.profileSection}>
              <SkeletonText width="60%" height={14} />
            </View>
            <View style={[styles.horizontalDivider, { backgroundColor: c.border }]} />
            <View style={styles.profileSection}>
              <SkeletonText width="70%" height={14} />
            </View>
          </View>
        </View>
      </View>
    </View>
  );
}

// Settings form skeleton
export function SettingsFormSkeleton({ paddingTop }) {
  return (
    <View style={[styles.pageContainer, { paddingTop: paddingTop ?? 16 }]}>
      {/* Header with back button */}
      <View style={styles.headerRow}>
        <SkeletonBox width={24} height={24} borderRadius={4} />
        <SkeletonText width={100} height={20} />
        <View style={{ width: 24 }} />
      </View>

      {/* Form fields */}
      {[1, 2, 3].map((i) => (
        <View key={i} style={{ marginBottom: 20 }}>
          <SkeletonText width={80} height={14} style={{ marginBottom: 8 }} />
          <SkeletonBox width="100%" height={48} borderRadius={8} />
        </View>
      ))}

      {/* Button */}
      <SkeletonBox width="100%" height={48} borderRadius={8} style={{ marginTop: 16 }} />
    </View>
  );
}

// Client home category grid skeleton
export function CategoryGridSkeleton() {
  return (
    <View style={styles.categoryGrid}>
      {[1, 2, 3, 4, 5, 6].map((i) => (
        <View key={i} style={styles.categoryItem}>
          <SkeletonBox width={64} height={64} borderRadius={12} />
          <SkeletonText width={60} height={12} style={{ marginTop: 8 }} />
        </View>
      ))}
    </View>
  );
}

// Service types list skeleton
export function ServiceTypesListSkeleton() {
  const { colors: c } = useTheme();
  return (
    <View>
      {[1, 2, 3, 4, 5].map((i) => (
        <View key={i} style={[styles.serviceTypeItem, { borderBottomColor: c.border }]}>
          <SkeletonBox width={24} height={24} borderRadius={4} />
          <SkeletonText width="70%" height={16} style={{ marginLeft: 12 }} />
        </View>
      ))}
    </View>
  );
}

// Request detail page skeleton (trade view)
export function RequestDetailSkeleton({ paddingTop }) {
  const { colors: c } = useTheme();
  const cardThemed = { backgroundColor: c.elevate, borderColor: c.border };
  return (
    <View style={[styles.pageContainer, { paddingTop: paddingTop ?? 16 }]}>
      {/* Action buttons placeholder */}
      <View style={styles.actionButtonsRow}>
        <SkeletonBox width="48%" height={48} borderRadius={8} />
        <SkeletonBox width="48%" height={48} borderRadius={8} />
      </View>

      {/* Hero section */}
      <View style={[styles.heroCard, cardThemed]}>
        <SkeletonText width="70%" height={20} />
        <SkeletonText width="50%" height={16} style={{ marginTop: 8 }} />
        <SkeletonText width="40%" height={14} style={{ marginTop: 8 }} />
      </View>

      {/* Section */}
      <SkeletonText width={100} height={16} style={{ marginTop: 20, marginBottom: 8 }} />
      <View style={[styles.detailCard, cardThemed]}>
        {[1, 2, 3, 4].map((i) => (
          <View key={i} style={styles.detailRow}>
            <SkeletonBox width={18} height={18} borderRadius={4} />
            <View style={{ flex: 1, marginLeft: 12 }}>
              <SkeletonText width={60} height={12} />
              <SkeletonText width="80%" height={14} style={{ marginTop: 4 }} />
            </View>
          </View>
        ))}
      </View>

      {/* Description section */}
      <SkeletonText width={100} height={16} style={{ marginTop: 20, marginBottom: 8 }} />
      <View style={[styles.detailCard, cardThemed]}>
        <SkeletonText width="100%" height={14} />
        <SkeletonText width="90%" height={14} style={{ marginTop: 6 }} />
        <SkeletonText width="70%" height={14} style={{ marginTop: 6 }} />
      </View>
    </View>
  );
}

// Pipeline page skeleton (trade dashboard)
export function PipelinePageSkeleton({ paddingTop }) {
  const { colors: c } = useTheme();
  const cardThemed = { backgroundColor: c.elevate, borderColor: c.border };
  return (
    <View style={[styles.pageContainer, { paddingTop: paddingTop ?? 16 }]}>
      {/* Header */}
      <View style={[styles.pipelineHeader, { borderBottomColor: c.border }]}>
        <SkeletonBox width={24} height={24} borderRadius={4} />
        <SkeletonText width={80} height={20} />
        <View style={{ width: 24 }} />
      </View>

      {/* Summary cards */}
      <View style={styles.pipelineSummaryRow}>
        <View style={[styles.pipelineSummaryCard, { backgroundColor: c.elevate2 }]}>
          <View style={styles.pipelineSummaryCardHeader}>
            <SkeletonBox width={20} height={20} borderRadius={4} />
            <SkeletonText width={90} height={13} />
          </View>
          <SkeletonText width={80} height={24} style={{ marginTop: 8 }} />
          <SkeletonText width={100} height={12} style={{ marginTop: 4 }} />
        </View>
        <View style={[styles.pipelineSummaryCard, { backgroundColor: c.elevate2 }]}>
          <View style={styles.pipelineSummaryCardHeader}>
            <SkeletonBox width={20} height={20} borderRadius={4} />
            <SkeletonText width={70} height={13} />
          </View>
          <SkeletonText width={80} height={24} style={{ marginTop: 8 }} />
          <SkeletonText width={100} height={12} style={{ marginTop: 4 }} />
        </View>
      </View>

      {/* Filter tabs */}
      <View style={styles.pipelineFilterRow}>
        <SkeletonBox width={50} height={32} borderRadius={16} />
        <SkeletonBox width={70} height={32} borderRadius={16} />
        <SkeletonBox width={80} height={32} borderRadius={16} />
        <SkeletonBox width={80} height={32} borderRadius={16} />
      </View>

      {/* Project cards */}
      {[1, 2, 3].map((i) => (
        <View key={i} style={[styles.pipelineProjectCard, cardThemed]}>
          <SkeletonBox width={100} height={24} borderRadius={12} />
          <SkeletonText width="70%" height={16} style={{ marginTop: 8 }} />
          <View style={styles.pipelineProjectMeta}>
            <SkeletonText width={80} height={14} />
            <SkeletonText width={60} height={14} />
          </View>
          <View style={[styles.pipelineProjectFooter, { borderTopColor: c.border }]}>
            <View>
              <SkeletonText width={80} height={16} />
              <SkeletonText width={100} height={12} style={{ marginTop: 2 }} />
            </View>
            <SkeletonBox width={20} height={20} borderRadius={4} />
          </View>
        </View>
      ))}
    </View>
  );
}

// Quote overview page skeleton
export function QuoteOverviewSkeleton({ paddingTop }) {
  const { colors: c } = useTheme();
  const cardThemed = { backgroundColor: c.elevate, borderColor: c.border };
  return (
    <View style={[styles.pageContainer, { paddingTop: paddingTop ?? 16 }]}>
      {/* Hero card */}
      <View style={[styles.quoteHeroCard, cardThemed]}>
        <View style={styles.quoteHeroHeader}>
          <SkeletonCircle size={56} />
          <View style={{ flex: 1, marginLeft: 12 }}>
            <SkeletonText width="60%" height={18} />
            <SkeletonText width="80%" height={14} style={{ marginTop: 6 }} />
          </View>
          <SkeletonBox width={80} height={28} borderRadius={14} />
        </View>

        <View style={[styles.quoteHeroStats, { borderTopColor: c.border }]}>
          <View style={{ flex: 1 }}>
            <SkeletonText width={80} height={12} />
            <SkeletonText width={100} height={24} style={{ marginTop: 4 }} />
            <SkeletonText width={70} height={12} style={{ marginTop: 4 }} />
          </View>
          <View style={{ flex: 1, alignItems: "flex-end" }}>
            <SkeletonText width={60} height={12} />
            <SkeletonText width={80} height={16} style={{ marginTop: 4 }} />
          </View>
        </View>
      </View>

      {/* Sections */}
      {[1, 2].map((i) => (
        <View key={i}>
          <SkeletonText width={120} height={16} style={{ marginTop: 20, marginBottom: 8 }} />
          <View style={[styles.detailCard, cardThemed]}>
            <View style={styles.detailRow}>
              <SkeletonBox width={40} height={40} borderRadius={8} />
              <View style={{ flex: 1, marginLeft: 12 }}>
                <SkeletonText width="70%" height={14} />
                <SkeletonText width="50%" height={12} style={{ marginTop: 4 }} />
              </View>
              <SkeletonText width={60} height={14} />
            </View>
          </View>
        </View>
      ))}
    </View>
  );
}

// ==================== LAYOUT GATE SKELETON ====================
// Shown by route _layout files while session/role is being resolved.
// Replaces a bare ActivityIndicator so the transition into the dashboard
// stays themed instead of flashing white card stubs.
export function LayoutGateSkeleton({ paddingTop }) {
  const { colors: c } = useTheme();
  const cardThemed = { backgroundColor: c.elevate, borderColor: c.border };
  return (
    <View style={[styles.pageContainer, { paddingTop: paddingTop ?? 16 }]}>
      {/* Header */}
      <View style={styles.headerRow}>
        <SkeletonText width={140} height={26} />
        <SkeletonCircle size={36} />
      </View>

      {/* Single hero card */}
      <View style={[styles.heroCard, cardThemed, { marginBottom: 16 }]}>
        <SkeletonText width="60%" height={18} />
        <SkeletonText width="40%" height={14} style={{ marginTop: 8 }} />
      </View>

      {/* List preview */}
      {[1, 2, 3].map((i) => (
        <View key={i} style={[styles.listCard, cardThemed]}>
          <View style={styles.listCardRow}>
            <SkeletonCircle size={44} />
            <View style={styles.listCardContent}>
              <SkeletonText width="70%" height={16} />
              <SkeletonText width="50%" height={14} style={{ marginTop: 6 }} />
            </View>
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  // Note: skeleton fill colour is painted inline in SkeletonBox from theme.
  pageContainer: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 16,
  },
  // Header
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 20,
  },
  // Stats
  statsRow: {
    flexDirection: "row",
    gap: 12,
  },
  statCard: {
    flex: 1,
    borderRadius: 12,
    borderWidth: 1,
    padding: 16,
    alignItems: "center",
    // bg + border painted inline from theme.
  },
  // List
  listCard: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 16,
    marginBottom: 12,
    // bg + border painted inline from theme.
  },
  listCardRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  listCardContent: {
    flex: 1,
    marginLeft: 12,
  },
  // Tabs
  tabsRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 16,
  },
  // Project card
  projectCard: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 16,
    marginBottom: 12,
    // bg + border painted inline from theme.
  },
  projectCardHeader: {
    flexDirection: "row",
    alignItems: "center",
  },
  projectCardBody: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    // border painted inline from theme.
  },
  // Messages
  messageItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    borderBottomWidth: 1,
    // border painted inline from theme.
  },
  messageContent: {
    flex: 1,
    marginLeft: 12,
  },
  messageHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  // Profile card
  profileCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    // bg + border painted inline from theme.
  },
  profileCardColumns: {
    flexDirection: "row",
  },
  profileLeftCol: {
    width: "40%",
    alignItems: "center",
    paddingRight: 12,
  },
  profileRightCol: {
    flex: 1,
    paddingLeft: 12,
    justifyContent: "space-between",
  },
  profileSection: {
    paddingVertical: 10,
  },
  badgesRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 12,
  },
  verticalDivider: {
    width: 1,
    // bg painted inline from theme.
  },
  horizontalDivider: {
    height: 1,
    // bg painted inline from theme.
  },
  // Category grid
  categoryGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    gap: 16,
  },
  categoryItem: {
    width: "30%",
    alignItems: "center",
  },
  // Service types
  serviceTypeItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    borderBottomWidth: 1,
    // border painted inline from theme.
  },
  // Request detail page
  actionButtonsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 20,
  },
  heroCard: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 16,
    // bg + border painted inline from theme.
  },
  detailCard: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 16,
    // bg + border painted inline from theme.
  },
  detailRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
  },
  // Quote overview
  quoteHeroCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    // bg + border painted inline from theme.
  },
  quoteHeroHeader: {
    flexDirection: "row",
    alignItems: "center",
  },
  quoteHeroStats: {
    flexDirection: "row",
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    // border painted inline from theme.
  },
  // Pipeline page
  pipelineHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 16,
    borderBottomWidth: 1,
    marginBottom: 20,
    marginHorizontal: -20,
    paddingHorizontal: 20,
    // border painted inline from theme.
  },
  pipelineSummaryRow: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 20,
  },
  pipelineSummaryCard: {
    flex: 1,
    borderRadius: 12,
    padding: 16,
    // bg painted inline from theme.
  },
  pipelineSummaryCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  pipelineFilterRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 20,
  },
  pipelineProjectCard: {
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    marginBottom: 12,
    // bg + border painted inline from theme.
  },
  pipelineProjectMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 8,
    marginBottom: 12,
  },
  pipelineProjectFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderTopWidth: 1,
    paddingTop: 12,
    // border painted inline from theme.
  },
});

export default SkeletonBox;
