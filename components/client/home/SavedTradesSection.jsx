// components/client/home/SavedTradesSection.jsx
// "Saved trades" horizontal scroller on the redesigned client home.
// Compact TradeMini cards (avatar + name + trade + rating). Right
// side of the header has a Recent / Nearby toggle per the design.
// — "Recent" = last 10 closest trades (serves as a 'recently seen'
//   proxy until we wire a real recents store).
// — "Nearby" = same getClosestTrades fallback; the toggle is cosmetic
//   for now and ready to swap when a separate recents source exists.

import React, { useEffect, useMemo, useState, useCallback } from "react";
import { View, Pressable, Image, StyleSheet, ScrollView } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useFocusEffect } from "@react-navigation/native";

import { useTheme } from "../../../hooks/useTheme";
import ThemedText from "../../ThemedText";
import { SectionHead } from "../../design";
import { Colors } from "../../../constants/Colors";
import { TypeVariants, Radius, FontFamily } from "../../../constants/Typography";
import { getClosestTrades } from "../../../lib/api/feed";
import { getMyProfile, getClientLocation } from "../../../lib/api/profile";

function TradeMini({ trade, onPress }) {
  const { colors: c } = useTheme();
  const name = trade.business_name || trade.full_name || "Business";
  const tradeTitle = trade.trade_title || "";
  const rating = trade.stats?.average_rating || trade.rating_avg || 0;
  const jobs = trade.stats?.review_count || trade.rating_count || 0;

  return (
    <Pressable
      onPress={() => onPress?.(trade)}
      style={({ pressed }) => [
        styles.card,
        { backgroundColor: c.elevate, borderColor: c.border },
        pressed && {
          backgroundColor: c.elevate2,
          borderColor: Colors.primary,
        },
      ]}
      accessibilityRole="button"
      accessibilityLabel={`Open ${name}`}
    >
      {trade.photo_url ? (
        <Image source={{ uri: trade.photo_url }} style={styles.avatar} />
      ) : (
        <View
          style={[
            styles.avatar,
            styles.avatarFallback,
            { backgroundColor: c.elevate2 },
          ]}
        >
          <Ionicons name="person" size={18} color={c.textMuted} />
        </View>
      )}
      <ThemedText
        style={[
          TypeVariants.h3,
          { color: c.text, fontSize: 14, marginTop: 10, lineHeight: 17 },
        ]}
        numberOfLines={1}
      >
        {name}
      </ThemedText>
      {!!tradeTitle && (
        <ThemedText
          style={[TypeVariants.caption, { color: c.textMid, marginTop: 2 }]}
          numberOfLines={1}
        >
          {tradeTitle}
        </ThemedText>
      )}
      <View style={styles.ratingRow}>
        {rating > 0 ? (
          <>
            <Ionicons name="star" size={11} color={Colors.status.pending} />
            <ThemedText
              style={{
                fontSize: 11.5,
                fontFamily: FontFamily.headerSemibold,
                color: c.text,
              }}
            >
              {Number(rating).toFixed(1)}
            </ThemedText>
            <ThemedText style={{ fontSize: 11, color: c.textMuted }}>
              · {jobs} jobs
            </ThemedText>
          </>
        ) : (
          <ThemedText style={{ fontSize: 11, color: c.textMuted }}>
            No reviews yet
          </ThemedText>
        )}
      </View>
    </Pressable>
  );
}

export default function SavedTradesSection() {
  const router = useRouter();
  const { colors: c } = useTheme();

  const [trades, setTrades] = useState([]);
  const [tab, setTab] = useState("recent"); // 'recent' | 'nearby'
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const profile = await getMyProfile();
      // Read the client's anchor via the shared helper — prefers the
      // new home_* columns and falls back to base_* so legacy rows
      // keep working until they update via the PostcodePrompt.
      const { lat, lon } = getClientLocation(profile);
      if (lat != null && lon != null) {
        const list = await getClosestTrades({ lat, lon, limit: 10 });
        setTrades(list || []);
      } else {
        setTrades([]);
      }
    } catch (e) {
      console.warn("SavedTradesSection load error:", e.message);
      setTrades([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const tradesToShow = useMemo(() => {
    // Same data source for now — toggle is cosmetic until we track
    // "recently viewed" in AsyncStorage / DB.
    return trades;
  }, [trades, tab]);

  const handleTradePress = (trade) => {
    router.push({
      pathname: "/client/trade-profile",
      params: { tradeId: trade.id },
    });
  };

  return (
    <View>
      <View style={styles.headerRow}>
        <SectionHead
          title="Discover Trades"
          chevron={false}
          style={styles.sectionHeadFlush}
        />
        <View style={styles.tabs}>
          <Pressable onPress={() => setTab("recent")} hitSlop={6}>
            <ThemedText
              style={{
                ...TypeVariants.buttonSm,
                color: tab === "recent" ? c.text : c.textMuted,
              }}
            >
              Recent
            </ThemedText>
          </Pressable>
          <Pressable onPress={() => setTab("nearby")} hitSlop={6}>
            <ThemedText
              style={{
                ...TypeVariants.buttonSm,
                color: tab === "nearby" ? c.text : c.textMuted,
              }}
            >
              Nearby
            </ThemedText>
          </Pressable>
        </View>
      </View>

      {loading ? (
        <View style={{ paddingHorizontal: 16, paddingBottom: 8 }}>
          <ThemedText
            style={{ ...TypeVariants.bodySm, color: c.textMuted }}
          >
            Loading trades…
          </ThemedText>
        </View>
      ) : tradesToShow.length === 0 ? (
        <View style={{ paddingHorizontal: 16, paddingBottom: 8 }}>
          <ThemedText
            style={{ ...TypeVariants.bodySm, color: c.textMid }}
          >
            Add your postcode on your profile to see trades near you.
          </ThemedText>
        </View>
      ) : (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
        >
          {tradesToShow.map((t) => (
            <TradeMini key={t.id} trade={t} onPress={handleTradePress} />
          ))}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  sectionHeadFlush: {
    flex: 1,
    // SectionHead already has internal padding; trust it.
  },
  tabs: {
    flexDirection: "row",
    gap: 14,
    paddingRight: 20,
    paddingTop: 22,
    paddingBottom: 10,
  },
  scrollContent: {
    paddingLeft: 16,
    paddingRight: 16,
    gap: 12,
  },
  card: {
    width: 150,
    borderRadius: Radius.md + 2,
    borderWidth: 1,
    padding: 14,
  },
  avatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
  },
  avatarFallback: {
    alignItems: "center",
    justifyContent: "center",
  },
  ratingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 10,
  },
});
