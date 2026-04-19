// components/client/home/TradesFeedSection.jsx
// Horizontal scrollable section of trade cards — flat hairline cards
// with a status-yellow star dot. Theme-aware.
import React from "react";
import { View, FlatList, Pressable, Image, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import ThemedText from "../../ThemedText";
import { useTheme } from "../../../hooks/useTheme";
import { Colors } from "../../../constants/Colors";
import { TypeVariants, Radius, FontFamily } from "../../../constants/Typography";

const CARD_WIDTH = 210;
const GAP = 12;

function StarRating({ rating, count }) {
  const { colors: c } = useTheme();
  if (!rating || rating <= 0) {
    return (
      <ThemedText style={[styles.noRating, { color: c.textMuted }]}>
        No reviews yet
      </ThemedText>
    );
  }
  return (
    <View style={styles.ratingRow}>
      <Ionicons name="star" size={11} color={Colors.status.pending} />
      <ThemedText style={[styles.ratingText, { color: c.text }]}>
        {rating.toFixed(1)}
        {count ? ` (${count})` : ""}
      </ThemedText>
    </View>
  );
}

function TradeCard({ trade, onPress }) {
  const { colors: c } = useTheme();
  const name = trade.business_name || trade.full_name || "Business";
  const title = trade.trade_title;
  const rating = trade.stats?.average_rating || 0;
  const reviewCount = trade.stats?.review_count || 0;
  const distance = trade.distance_miles;
  const town = trade.town_city;

  return (
    <Pressable
      style={({ pressed }) => [
        styles.card,
        {
          backgroundColor: c.elevate,
          borderColor: c.border,
        },
        pressed && {
          backgroundColor: c.elevate2,
          borderColor: Colors.primary,
        },
      ]}
      onPress={() => onPress?.(trade)}
      accessibilityLabel={`View ${name} profile`}
      accessibilityRole="button"
    >
      {trade.photo_url ? (
        <Image source={{ uri: trade.photo_url }} style={styles.avatar} />
      ) : (
        <View style={[styles.avatar, styles.avatarFallback, { backgroundColor: c.elevate2 }]}>
          <Ionicons name="person" size={20} color={c.textMuted} />
        </View>
      )}

      <View style={{ flex: 1, minWidth: 0 }}>
        <ThemedText
          style={[TypeVariants.h3, { color: c.text, fontSize: 13.5 }]}
          numberOfLines={1}
        >
          {name}
        </ThemedText>
        {!!title && (
          <ThemedText
            style={[TypeVariants.caption, { color: c.textMid, marginTop: 1 }]}
            numberOfLines={1}
          >
            {title}
          </ThemedText>
        )}

        <StarRating rating={rating} count={reviewCount} />

        {(town || distance != null) && (
          <View style={styles.locationRow}>
            <Ionicons name="location-outline" size={11} color={c.textMuted} />
            <ThemedText style={[styles.locationText, { color: c.textMuted }]} numberOfLines={1}>
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
  const { colors: c } = useTheme();
  const SectionTitle = (
    <ThemedText style={[TypeVariants.h2, { color: c.text, marginBottom: 2 }]}>
      {title}
    </ThemedText>
  );
  const SectionSub = !!subtitle && (
    <ThemedText style={[TypeVariants.captionMuted, { color: c.textMuted, marginBottom: 12 }]}>
      {subtitle}
    </ThemedText>
  );

  if (!trades || trades.length === 0) {
    return (
      <View style={styles.container}>
        {SectionTitle}
        {SectionSub}
        <View style={[styles.emptyState, { backgroundColor: c.elevate, borderColor: c.border }]}>
          <ThemedText style={[TypeVariants.bodySm, { color: c.textMid, textAlign: "center" }]}>
            {emptyMessage}
          </ThemedText>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {SectionTitle}
      {SectionSub}
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
    marginBottom: 28,
  },
  listContent: {
    paddingRight: 16,
  },
  card: {
    width: CARD_WIDTH,
    padding: 12,
    borderRadius: Radius.md + 2,
    borderWidth: 1,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
  },
  avatarFallback: {
    alignItems: "center",
    justifyContent: "center",
  },
  ratingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 5,
  },
  ratingText: {
    fontSize: 11.5,
    fontFamily: FontFamily.bodyMedium,
  },
  noRating: {
    fontSize: 11.5,
    fontFamily: FontFamily.bodyRegular,
    marginTop: 4,
  },
  locationRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    marginTop: 4,
  },
  locationText: {
    fontSize: 11,
    fontFamily: FontFamily.bodyRegular,
    flexShrink: 1,
  },
  emptyState: {
    paddingVertical: 18,
    paddingHorizontal: 14,
    borderRadius: Radius.md + 2,
    borderWidth: 1,
  },
});
