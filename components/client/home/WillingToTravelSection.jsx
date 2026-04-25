// components/client/home/WillingToTravelSection.jsx
// "Willing to Travel" horizontal scroller on the redesigned client
// home. Surfaces trades whose `base_lat / base_lon` sit outside
// their `service_radius_km` but inside their `extended_radius_km`
// relative to the client's anchor postcode. Same card family as
// SavedTradesSection so the two sections read as a pair.
//
// Scoping note: the budget gate that applies to the server-side
// auto-matching path (match-trades edge function) is intentionally
// NOT applied here. This section is browse-and-choose — the client
// picks the trade directly, and the budget minimum on a trade's
// extended radius only governed which quote_requests got auto-
// targeted at them. On the feed we show every willing-to-travel
// trade the client is in range of, and let the trade decide when
// the enquiry actually lands.

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
import { getWillingToTravel } from "../../../lib/api/feed";
import { getMyProfile, getClientLocation } from "../../../lib/api/profile";

function TradeMini({ trade, onPress }) {
  const { colors: c } = useTheme();
  const name = trade.business_name || trade.full_name || "Business";
  const tradeTitle = trade.trade_title || "";
  const rating = trade.stats?.average_rating || trade.rating_avg || 0;
  const jobs = trade.stats?.review_count || trade.rating_count || 0;
  const miles =
    trade.distance_km != null
      ? Math.round(Number(trade.distance_km) * 0.621371)
      : null;

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        { backgroundColor: c.elevate, borderColor: c.border },
        pressed && { opacity: 0.88 },
      ]}
    >
      <View style={[styles.avatarWrap, { backgroundColor: c.elevate2 }]}>
        {trade.photo_url ? (
          <Image source={{ uri: trade.photo_url }} style={styles.avatar} />
        ) : (
          <ThemedText
            style={{
              ...TypeVariants.headingSm,
              color: c.textMuted,
            }}
          >
            {(name[0] || "T").toUpperCase()}
          </ThemedText>
        )}
      </View>
      <ThemedText
        style={[styles.name, { color: c.text }]}
        numberOfLines={1}
      >
        {name}
      </ThemedText>
      {tradeTitle ? (
        <ThemedText
          style={[styles.title, { color: c.textMid }]}
          numberOfLines={1}
        >
          {tradeTitle}
        </ThemedText>
      ) : null}
      <View style={styles.metaRow}>
        <Ionicons name="star" size={11} color={Colors.status.scheduled} />
        <ThemedText style={[styles.metaText, { color: c.textMid }]}>
          {rating ? Number(rating).toFixed(1) : "New"}
          {jobs ? ` · ${jobs}` : ""}
        </ThemedText>
      </View>
      {miles != null ? (
        <View
          style={[
            styles.distancePill,
            { backgroundColor: Colors.primaryTint, borderColor: Colors.primary + "40" },
          ]}
        >
          <Ionicons name="car-outline" size={10} color={Colors.primary} />
          <ThemedText style={[styles.distancePillText, { color: Colors.primary }]}>
            {miles} mi
          </ThemedText>
        </View>
      ) : null}
    </Pressable>
  );
}

export default function WillingToTravelSection() {
  const router = useRouter();
  const { colors: c } = useTheme();
  const [trades, setTrades] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const profile = await getMyProfile();
      const { lat, lon } = getClientLocation(profile);
      if (lat != null && lon != null) {
        const list = await getWillingToTravel({
          lat,
          lon,
          limit: 10,
        });
        setTrades(list || []);
      } else {
        setTrades([]);
      }
    } catch (e) {
      console.warn("WillingToTravelSection load error:", e?.message || e);
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

  // Hidden entirely when there's nothing to show — no point rendering
  // an empty section title. Loading state also stays hidden to avoid
  // a flash before the first render.
  if (loading || trades.length === 0) return null;

  const handleTradePress = (trade) => {
    router.push({
      pathname: "/client/trade-profile",
      params: { tradeId: trade.id },
    });
  };

  return (
    <View>
      <SectionHead
        title="Willing to Travel"
        chevron={false}
        style={styles.sectionHead}
      />
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scroll}
      >
        {trades.map((trade) => (
          <TradeMini
            key={trade.id}
            trade={trade}
            onPress={() => handleTradePress(trade)}
          />
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  sectionHead: {
    paddingHorizontal: 16,
    marginTop: 4,
  },
  scroll: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    gap: 10,
  },
  card: {
    width: 128,
    padding: 12,
    borderRadius: Radius.lg,
    borderWidth: 1,
    alignItems: "center",
  },
  avatarWrap: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
    overflow: "hidden",
  },
  avatar: {
    width: "100%",
    height: "100%",
  },
  name: {
    fontFamily: FontFamily.headerSemibold,
    fontSize: 13,
    textAlign: "center",
  },
  title: {
    fontFamily: FontFamily.bodyRegular,
    fontSize: 11,
    textAlign: "center",
    marginTop: 2,
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 6,
  },
  metaText: {
    fontSize: 11,
    fontFamily: FontFamily.bodyRegular,
  },
  distancePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    borderWidth: 1,
    marginTop: 8,
  },
  distancePillText: {
    fontSize: 10,
    fontFamily: FontFamily.headerBold,
    letterSpacing: 0.2,
  },
});
