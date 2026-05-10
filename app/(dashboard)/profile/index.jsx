// app/(dashboard)/profile/index.jsx
//
// Profile tab — thin consumer of the shared TradeProfileView in
// "owner" mode.
//
// Settled mobile is now trade-only (the homeowner side moved off to
// the web directory project), so the legacy role gate that branched
// between TradeProfileView and an inline minimal client-profile card
// has been removed. Every signed-in user that lands here is a trade
// by construction; this screen now just loads their profile + reviews
// + cached quote-rate metric and hands the lot to TradeProfileView.

import { useEffect, useState, useCallback } from "react";
import {
  StyleSheet,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter, useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import ThemedView from "../../../components/ThemedView";
import { ProfilePageSkeleton } from "../../../components/Skeleton";
import TradeProfileView from "../../../components/trade/TradeProfileView";
import { useTheme } from "../../../hooks/useTheme";
import ThemedStatusBar from "../../../components/ThemedStatusBar";

import { useUser } from "../../../hooks/useUser";
import { getMyProfile } from "../../../lib/api/profile";
import { getTradeReviews } from "../../../lib/api/trust";
import { supabase } from "../../../lib/supabase";

export const options = {
  title: "Profile",
  tabBarIcon: ({ color, size, focused }) => (
    <Ionicons
      name={focused ? "person-circle" : "person-circle-outline"}
      size={size}
      color={color}
    />
  ),
};

export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user, authChecked } = useUser();
  const { colors: c } = useTheme();

  const [profile, setProfile] = useState(null);
  const [reviews, setReviews] = useState([]);
  const [loadingData, setLoadingData] = useState(true);
  const [performanceStats, setPerformanceStats] = useState({
    responseTimeHours: null,
    quoteRate: null,
  });

  // Profile + reviews + perf stats
  const loadProfile = useCallback(async () => {
    if (!user?.id) return;
    try {
      setLoadingData(true);
      const me = await getMyProfile();
      setProfile(me || null);

      if (me?.id) {
        const reviewsData = await getTradeReviews(me.id, { limit: 20 });
        setReviews(reviewsData || []);

        // Quote-rate with 3-day grace period — same algo as before.
        const { data: targets } = await supabase
          .from("request_targets")
          .select("request_id, state, first_action_at")
          .eq("trade_id", user.id);

        const { data: quotes } = await supabase
          .from("tradify_native_app_db")
          .select("id, request_id, status")
          .eq("trade_id", user.id);

        const now = new Date();
        const gracePeriodMs = 3 * 24 * 60 * 60 * 1000;
        const requestsWithQuotesSet = new Set(
          (quotes || [])
            .filter((q) =>
              ["sent", "accepted", "declined", "expired", "completed", "awaiting_completion"].includes(
                (q.status || "").toLowerCase()
              )
            )
            .map((q) => q.request_id)
        );
        const matureAcceptedRequests = (targets || []).filter((t) => {
          if (!t.state?.toLowerCase().includes("accepted")) return false;
          if (requestsWithQuotesSet.has(t.request_id)) return true;
          if (t.first_action_at) {
            const acceptedAt = new Date(t.first_action_at);
            return now - acceptedAt > gracePeriodMs;
          }
          return false;
        });
        const quoteRate = matureAcceptedRequests.length > 0
          ? Math.min(
              100,
              Math.round((requestsWithQuotesSet.size / matureAcceptedRequests.length) * 100)
            )
          : null;

        setPerformanceStats({
          responseTimeHours: null, // reserved — back-end RPC not wired yet
          quoteRate,
        });
      }
    } finally {
      setLoadingData(false);
    }
  }, [user?.id]);

  useEffect(() => {
    if (authChecked && user?.id) loadProfile();
  }, [user?.id, authChecked, loadProfile]);

  useFocusEffect(
    useCallback(() => {
      if (authChecked && user?.id) loadProfile();
    }, [authChecked, user?.id, loadProfile])
  );

  if (!authChecked || loadingData) {
    return (
      <ThemedView style={[styles.container, { paddingTop: insets.top }]}>
        <ThemedStatusBar />
        <ProfilePageSkeleton paddingTop={16} />
      </ThemedView>
    );
  }

  return (
    <TradeProfileView
      profile={profile}
      reviews={reviews}
      performanceStats={performanceStats}
      insets={insets}
      mode="owner"
      onSettings={() => router.push("/profile/settings")}
    />
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
});
