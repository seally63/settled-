// components/client/home/RecentlyCompletedFeed.jsx
// Feed showing recent verified project completions
// Builds trust by showing real, verified platform activity
import { View, StyleSheet } from "react-native";
import ThemedText from "../../ThemedText";
import { SkeletonBox, SkeletonText } from "../../Skeleton";
import { Ionicons } from "@expo/vector-icons";

// Format relative time
function formatRelativeTime(dateString) {
  if (!dateString) return "";

  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now - date;
  const diffMins = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins} min ago`;
  if (diffHours === 1) return "1 hour ago";
  if (diffHours < 24) return `${diffHours} hours ago`;
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays} days ago`;
  if (diffDays < 14) return "Last week";
  return `${Math.floor(diffDays / 7)} weeks ago`;
}

// Format rating to one decimal place
function formatRating(rating) {
  if (rating == null || isNaN(rating)) return "5.0";
  return Number(rating).toFixed(1);
}

function CompletionCard({ completion }) {
  const { service_type, city, completed_at, rating } = completion;

  return (
    <View style={styles.card}>
      <View style={styles.content}>
        <ThemedText style={styles.serviceType} numberOfLines={1}>
          {service_type}
        </ThemedText>
        <View style={styles.metaRow}>
          <ThemedText style={styles.meta} numberOfLines={1}>
            {city} · {formatRelativeTime(completed_at)}
          </ThemedText>
          <View style={styles.ratingContainer}>
            <Ionicons name="star" size={12} color="#F59E0B" />
            <ThemedText style={styles.ratingText}>{formatRating(rating)}</ThemedText>
          </View>
        </View>
      </View>
    </View>
  );
}

function SkeletonCard() {
  return (
    <View style={styles.card}>
      <View style={[styles.content, { gap: 6 }]}>
        <SkeletonText width="60%" height={14} />
        <SkeletonText width="80%" height={12} />
      </View>
    </View>
  );
}

export default function RecentlyCompletedFeed({ completions, isLoading }) {
  // Hide section if no completions and not loading
  if (!isLoading && (!completions || completions.length === 0)) {
    return null;
  }

  return (
    <View style={styles.container}>
      <ThemedText style={styles.sectionTitle}>
        Recently Completed on Settled
      </ThemedText>

      {isLoading ? (
        // Show skeleton cards while loading
        <>
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </>
      ) : (
        // Show completion cards
        completions.map((completion, index) => (
          <CompletionCard
            key={completion.id || `completion-${index}`}
            completion={completion}
          />
        ))
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#1F2937",
    marginBottom: 12,
  },
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    padding: 12,
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  content: {
    flex: 1,
  },
  serviceType: {
    fontSize: 14,
    fontWeight: "600",
    color: "#1F2937",
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 2,
  },
  meta: {
    fontSize: 12,
    color: "#6B7280",
  },
  ratingContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginLeft: 6,
    gap: 2,
  },
  ratingText: {
    fontSize: 12,
    color: "#6B7280",
    fontWeight: "500",
  },
});
