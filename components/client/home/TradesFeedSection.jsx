// components/client/home/TradesFeedSection.jsx
// Horizontal scrollable section of trade cards for client home discovery feed
import { View, FlatList, Pressable, Image, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import ThemedText from "../../ThemedText";
import { Colors } from "../../../constants/Colors";

const CARD_WIDTH = 200;
const GAP = 12;

function StarRating({ rating, count }) {
  if (!rating || rating <= 0) {
    return (
      <ThemedText style={styles.noRating}>No reviews yet</ThemedText>
    );
  }
  return (
    <View style={styles.ratingRow}>
      <Ionicons name="star" size={12} color="#F59E0B" />
      <ThemedText style={styles.ratingText}>
        {rating.toFixed(1)}
        {count ? ` (${count})` : ""}
      </ThemedText>
    </View>
  );
}

function TradeCard({ trade, onPress }) {
  const name = trade.business_name || trade.full_name || "Business";
  const title = trade.trade_title;
  const rating = trade.stats?.average_rating || 0;
  const reviewCount = trade.stats?.review_count || 0;
  const distance = trade.distance_miles;
  const town = trade.town_city;

  return (
    <Pressable
      style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
      onPress={() => onPress?.(trade)}
      accessibilityLabel={`View ${name} profile`}
      accessibilityRole="button"
    >
      {trade.photo_url ? (
        <Image source={{ uri: trade.photo_url }} style={styles.avatar} />
      ) : (
        <View style={[styles.avatar, styles.avatarFallback]}>
          <Ionicons name="person" size={22} color="#9CA3AF" />
        </View>
      )}

      <View style={{ flex: 1 }}>
        <ThemedText style={styles.name} numberOfLines={1}>
          {name}
        </ThemedText>
        {!!title && (
          <ThemedText style={styles.title} numberOfLines={1}>
            {title}
          </ThemedText>
        )}

        <StarRating rating={rating} count={reviewCount} />

        {(town || distance != null) && (
          <View style={styles.locationRow}>
            <Ionicons name="location-outline" size={11} color="#9CA3AF" />
            <ThemedText style={styles.locationText} numberOfLines={1}>
              {town ? town : ""}
              {town && distance != null ? " · " : ""}
              {distance != null ? `${distance} mi` : ""}
            </ThemedText>
          </View>
        )}
      </View>
    </Pressable>
  );
}

export default function TradesFeedSection({
  title,
  subtitle,
  trades = [],
  onTradePress,
  emptyMessage = "No trades available in your area yet.",
}) {
  if (!trades || trades.length === 0) {
    return (
      <View style={styles.container}>
        <ThemedText style={styles.sectionTitle}>{title}</ThemedText>
        {!!subtitle && <ThemedText style={styles.sectionSubtitle}>{subtitle}</ThemedText>}
        <View style={styles.emptyState}>
          <ThemedText style={styles.emptyText}>{emptyMessage}</ThemedText>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ThemedText style={styles.sectionTitle}>{title}</ThemedText>
      {!!subtitle && <ThemedText style={styles.sectionSubtitle}>{subtitle}</ThemedText>}
      <FlatList
        data={trades}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.listContent}
        keyExtractor={(item) => String(item.id)}
        renderItem={({ item }) => <TradeCard trade={item} onPress={onTradePress} />}
        ItemSeparatorComponent={() => <View style={{ width: GAP }} />}
      />
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
    marginBottom: 2,
  },
  sectionSubtitle: {
    fontSize: 12,
    color: "#6B7280",
    marginBottom: 12,
  },
  listContent: {
    paddingRight: 16,
  },
  card: {
    width: CARD_WIDTH,
    padding: 12,
    borderRadius: 12,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    // iOS shadow
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
    // Android shadow
    elevation: 2,
  },
  cardPressed: {
    backgroundColor: "#F9FAFB",
    borderColor: Colors.primary,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#F3F4F6",
  },
  avatarFallback: {
    alignItems: "center",
    justifyContent: "center",
  },
  name: {
    fontSize: 13,
    fontWeight: "600",
    color: "#1F2937",
  },
  title: {
    fontSize: 11,
    color: "#6B7280",
    marginTop: 1,
  },
  ratingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    marginTop: 4,
  },
  ratingText: {
    fontSize: 11,
    fontWeight: "500",
    color: "#374151",
  },
  noRating: {
    fontSize: 11,
    color: "#9CA3AF",
    marginTop: 4,
  },
  locationRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    marginTop: 4,
  },
  locationText: {
    fontSize: 10,
    color: "#9CA3AF",
    flexShrink: 1,
  },
  emptyState: {
    paddingVertical: 16,
    paddingHorizontal: 12,
    backgroundColor: "#F9FAFB",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#F3F4F6",
  },
  emptyText: {
    fontSize: 13,
    color: "#6B7280",
    textAlign: "center",
  },
});
