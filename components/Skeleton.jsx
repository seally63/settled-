// components/Skeleton.jsx
// Skeleton loader component with shimmer animation
import { useEffect, useRef } from "react";
import { View, Animated, StyleSheet } from "react-native";
import { Colors } from "../constants/Colors";

// Base skeleton box with shimmer
export function SkeletonBox({ width, height, borderRadius = 4, style }) {
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
        styles.skeleton,
        { width, height, borderRadius, opacity },
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
  return (
    <View style={[styles.pageContainer, { paddingTop: paddingTop ?? 16 }]}>
      {/* Header */}
      <View style={styles.headerRow}>
        <SkeletonText width={120} height={28} />
        <SkeletonCircle size={40} />
      </View>

      {/* Stats cards */}
      <View style={styles.statsRow}>
        <View style={styles.statCard}>
          <SkeletonText width={60} height={32} />
          <SkeletonText width={80} height={14} style={{ marginTop: 8 }} />
        </View>
        <View style={styles.statCard}>
          <SkeletonText width={60} height={32} />
          <SkeletonText width={80} height={14} style={{ marginTop: 8 }} />
        </View>
      </View>

      {/* Section title */}
      <SkeletonText width={140} height={20} style={{ marginTop: 24, marginBottom: 12 }} />

      {/* List items */}
      {[1, 2, 3].map((i) => (
        <View key={i} style={styles.listCard}>
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
        <View key={i} style={styles.projectCard}>
          <View style={styles.projectCardHeader}>
            <SkeletonCircle size={44} />
            <View style={{ flex: 1, marginLeft: 12 }}>
              <SkeletonText width="60%" height={16} />
              <SkeletonText width="40%" height={14} style={{ marginTop: 6 }} />
            </View>
            <SkeletonBox width={70} height={24} borderRadius={12} />
          </View>
          <View style={styles.projectCardBody}>
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
  return (
    <View style={[styles.pageContainer, { paddingTop: paddingTop ?? 16 }]}>
      {/* Header */}
      <SkeletonText width={120} height={28} style={{ marginBottom: 16 }} />

      {/* Conversation items */}
      {[1, 2, 3, 4, 5].map((i) => (
        <View key={i} style={styles.messageItem}>
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
  return (
    <View style={[styles.pageContainer, { paddingTop: paddingTop ?? 16 }]}>
      {/* Header */}
      <View style={styles.headerRow}>
        <SkeletonText width={80} height={28} />
        <SkeletonBox width={26} height={26} borderRadius={4} />
      </View>

      {/* Profile card */}
      <View style={styles.profileCard}>
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
          <View style={styles.verticalDivider} />

          {/* Right column */}
          <View style={styles.profileRightCol}>
            <View style={styles.profileSection}>
              <SkeletonText width="80%" height={14} />
            </View>
            <View style={styles.horizontalDivider} />
            <View style={styles.profileSection}>
              <SkeletonText width="60%" height={14} />
            </View>
            <View style={styles.horizontalDivider} />
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
  return (
    <View>
      {[1, 2, 3, 4, 5].map((i) => (
        <View key={i} style={styles.serviceTypeItem}>
          <SkeletonBox width={24} height={24} borderRadius={4} />
          <SkeletonText width="70%" height={16} style={{ marginLeft: 12 }} />
        </View>
      ))}
    </View>
  );
}

// Request detail page skeleton (trade view)
export function RequestDetailSkeleton({ paddingTop }) {
  return (
    <View style={[styles.pageContainer, { paddingTop: paddingTop ?? 16 }]}>
      {/* Action buttons placeholder */}
      <View style={styles.actionButtonsRow}>
        <SkeletonBox width="48%" height={48} borderRadius={8} />
        <SkeletonBox width="48%" height={48} borderRadius={8} />
      </View>

      {/* Hero section */}
      <View style={styles.heroCard}>
        <SkeletonText width="70%" height={20} />
        <SkeletonText width="50%" height={16} style={{ marginTop: 8 }} />
        <SkeletonText width="40%" height={14} style={{ marginTop: 8 }} />
      </View>

      {/* Section */}
      <SkeletonText width={100} height={16} style={{ marginTop: 20, marginBottom: 8 }} />
      <View style={styles.detailCard}>
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
      <View style={styles.detailCard}>
        <SkeletonText width="100%" height={14} />
        <SkeletonText width="90%" height={14} style={{ marginTop: 6 }} />
        <SkeletonText width="70%" height={14} style={{ marginTop: 6 }} />
      </View>
    </View>
  );
}

// Pipeline page skeleton (trade dashboard)
export function PipelinePageSkeleton({ paddingTop }) {
  return (
    <View style={[styles.pageContainer, { paddingTop: paddingTop ?? 16 }]}>
      {/* Header */}
      <View style={styles.pipelineHeader}>
        <SkeletonBox width={24} height={24} borderRadius={4} />
        <SkeletonText width={80} height={20} />
        <View style={{ width: 24 }} />
      </View>

      {/* Summary cards */}
      <View style={styles.pipelineSummaryRow}>
        <View style={styles.pipelineSummaryCard}>
          <View style={styles.pipelineSummaryCardHeader}>
            <SkeletonBox width={20} height={20} borderRadius={4} />
            <SkeletonText width={90} height={13} />
          </View>
          <SkeletonText width={80} height={24} style={{ marginTop: 8 }} />
          <SkeletonText width={100} height={12} style={{ marginTop: 4 }} />
        </View>
        <View style={styles.pipelineSummaryCard}>
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
        <View key={i} style={styles.pipelineProjectCard}>
          <SkeletonBox width={100} height={24} borderRadius={12} />
          <SkeletonText width="70%" height={16} style={{ marginTop: 8 }} />
          <View style={styles.pipelineProjectMeta}>
            <SkeletonText width={80} height={14} />
            <SkeletonText width={60} height={14} />
          </View>
          <View style={styles.pipelineProjectFooter}>
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
  return (
    <View style={[styles.pageContainer, { paddingTop: paddingTop ?? 16 }]}>
      {/* Hero card */}
      <View style={styles.quoteHeroCard}>
        <View style={styles.quoteHeroHeader}>
          <SkeletonCircle size={56} />
          <View style={{ flex: 1, marginLeft: 12 }}>
            <SkeletonText width="60%" height={18} />
            <SkeletonText width="80%" height={14} style={{ marginTop: 6 }} />
          </View>
          <SkeletonBox width={80} height={28} borderRadius={14} />
        </View>

        <View style={styles.quoteHeroStats}>
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
          <View style={styles.detailCard}>
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

const styles = StyleSheet.create({
  skeleton: {
    backgroundColor: "#E5E7EB",
  },
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
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.light.border,
    padding: 16,
    alignItems: "center",
  },
  // List
  listCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.light.border,
    padding: 16,
    marginBottom: 12,
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
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.light.border,
    padding: 16,
    marginBottom: 12,
  },
  projectCardHeader: {
    flexDirection: "row",
    alignItems: "center",
  },
  projectCardBody: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: Colors.light.border,
  },
  // Messages
  messageItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.light.border,
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
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.light.border,
    padding: 16,
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
    backgroundColor: Colors.light.border,
  },
  horizontalDivider: {
    height: 1,
    backgroundColor: Colors.light.border,
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
    borderBottomColor: Colors.light.border,
  },
  // Request detail page
  actionButtonsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 20,
  },
  heroCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.light.border,
    padding: 16,
  },
  detailCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.light.border,
    padding: 16,
  },
  detailRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
  },
  // Quote overview
  quoteHeroCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.light.border,
    padding: 16,
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
    borderTopColor: Colors.light.border,
  },
  // Pipeline page
  pipelineHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: Colors.light.border,
    marginBottom: 20,
    marginHorizontal: -20,
    paddingHorizontal: 20,
  },
  pipelineSummaryRow: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 20,
  },
  pipelineSummaryCard: {
    flex: 1,
    backgroundColor: "#F9FAFB",
    borderRadius: 12,
    padding: 16,
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
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.light.border,
    marginBottom: 12,
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
    borderTopColor: "#F3F4F6",
    paddingTop: 12,
  },
});

export default SkeletonBox;
