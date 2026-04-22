// app/(dashboard)/profile/trade-profile.jsx
// Trade previewing their own public profile — "how a client sees me".
// Wraps the shared TradeProfileView in "preview" mode: same shell as
// the visitor view, without the CTAs, with a small Preview banner at
// the top so the trade knows they're not looking at a live client
// surface. Nothing currently navigates here; kept alive so a future
// "Preview as client" button on the Profile tab has a target.

import { useEffect, useState, useCallback } from "react";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";

import TradeProfileView from "../../../components/trade/TradeProfileView";
import ThemedView from "../../../components/ThemedView";
import ThemedStatusBar from "../../../components/ThemedStatusBar";
import { ProfilePageSkeleton } from "../../../components/Skeleton";

import { useUser } from "../../../hooks/useUser";
import useHideTabBar from "../../../hooks/useHideTabBar";
import { getMyProfile } from "../../../lib/api/profile";
import { getTradeReviews } from "../../../lib/api/trust";
import { supabase } from "../../../lib/supabase";

export default function TradeProfilePreview() {
  useHideTabBar();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useUser();

  const [profile, setProfile] = useState(null);
  const [reviews, setReviews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [performanceStats, setPerformanceStats] = useState({
    responseTimeHours: null,
    quoteRate: null,
  });

  const load = useCallback(async () => {
    if (!user?.id) return;
    try {
      setLoading(true);
      const me = await getMyProfile();
      setProfile(me || null);

      if (me?.id) {
        const reviewsData = await getTradeReviews(me.id, { limit: 20 });
        setReviews(reviewsData || []);

        const [{ data: targets }, { data: quotes }] = await Promise.all([
          supabase
            .from("request_targets")
            .select("request_id, state, first_action_at")
            .eq("trade_id", user.id),
          supabase
            .from("tradify_native_app_db")
            .select("id, request_id, status")
            .eq("trade_id", user.id),
        ]);

        const now = new Date();
        const gracePeriodMs = 3 * 24 * 60 * 60 * 1000;
        const requestsWithQuotes = new Set(
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
          if (requestsWithQuotes.has(t.request_id)) return true;
          if (t.first_action_at) {
            const acceptedAt = new Date(t.first_action_at);
            return now - acceptedAt > gracePeriodMs;
          }
          return false;
        });
        const quoteRate = matureAcceptedRequests.length > 0
          ? Math.min(
              100,
              Math.round((requestsWithQuotes.size / matureAcceptedRequests.length) * 100)
            )
          : null;
        setPerformanceStats({ responseTimeHours: null, quoteRate });
      }
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) {
    return (
      <ThemedView style={{ flex: 1, paddingTop: insets.top }}>
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
      mode="preview"
      onBack={() =>
        router.canGoBack?.() ? router.back() : router.replace("/profile")
      }
    />
  );
}
