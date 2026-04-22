// app/(dashboard)/client/trade-profile.jsx
// Client viewing a trade's profile from Discovery / Search / Saved.
// Thin data-layer wrapper around the shared TradeProfileView in
// "visitor" mode: chevron back, performance stats, reviews, a
// Request-a-quote primary CTA + Message ghost CTA at the bottom,
// and a "Report this trade" text link beneath the reviews.

import { useEffect, useState, useCallback } from "react";
import { Alert } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter, useLocalSearchParams } from "expo-router";

import TradeProfileView from "../../../components/trade/TradeProfileView";
import RequestQuoteSheet from "../../../components/client/RequestQuoteSheet";
import ThemedView from "../../../components/ThemedView";
import { ProfilePageSkeleton } from "../../../components/Skeleton";
import ThemedStatusBar from "../../../components/ThemedStatusBar";

import { useUser } from "../../../hooks/useUser";
import useHideTabBar from "../../../hooks/useHideTabBar";
import { getMyProfile, getTradePublicById } from "../../../lib/api/profile";
import { getTradeReviews } from "../../../lib/api/trust";
import { supabase } from "../../../lib/supabase";

export default function ClientTradeProfile() {
  useHideTabBar();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useUser();
  const { tradeId: rawTradeId } = useLocalSearchParams();
  const tradeId = Array.isArray(rawTradeId) ? rawTradeId[0] : rawTradeId;

  // If a trade somehow lands on their own discovery card, still render
  // the view — but we'll quietly use self-profile data so nothing's
  // broken. The CTAs don't make sense in that case; we hide them.
  const isSelf = !!tradeId && tradeId === user?.id;

  const [profile, setProfile] = useState(null);
  const [reviews, setReviews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [performanceStats, setPerformanceStats] = useState({
    responseTimeHours: null,
    quoteRate: null,
  });
  const [quoteSheetOpen, setQuoteSheetOpen] = useState(false);

  const load = useCallback(async () => {
    if (!tradeId && !user?.id) return;
    try {
      setLoading(true);
      const targetId = tradeId || user?.id;

      // Profile — public read for visitor, self read otherwise.
      const loadedProfile = isSelf
        ? await getMyProfile()
        : await getTradePublicById(targetId);
      setProfile(loadedProfile || null);

      // Reviews — both use the public reviews RPC.
      if (targetId) {
        const reviewsData = await getTradeReviews(targetId, { limit: 20 });
        setReviews(reviewsData || []);

        // Performance stats — same compute as the Profile tab, so
        // clients see exactly what the trade sees (per product call).
        const [{ data: targets }, { data: quotes }] = await Promise.all([
          supabase
            .from("request_targets")
            .select("request_id, state, first_action_at")
            .eq("trade_id", targetId),
          supabase
            .from("tradify_native_app_db")
            .select("id, request_id, status")
            .eq("trade_id", targetId),
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

        setPerformanceStats({
          responseTimeHours: null,
          quoteRate,
        });
      }
    } finally {
      setLoading(false);
    }
  }, [tradeId, user?.id, isSelf]);

  useEffect(() => {
    load();
  }, [load]);

  // ---- handlers -------------------------------------------------------
  const handleBack = () => {
    if (router.canGoBack?.()) router.back();
    else router.replace("/client");
  };

  const handleRequestQuote = () => {
    if (isSelf) return; // no-op self-guard
    setQuoteSheetOpen(true);
  };

  const handleMessage = async () => {
    if (isSelf || !tradeId) return;
    // Look for an existing conversation with this trade. If found,
    // route to that thread. If not, explain that a request must come
    // first so we don't create orphan conversations.
    try {
      const { data } = await supabase.rpc("rpc_list_conversations", {
        p_limit: 100,
      });
      const conv = (data || []).find(
        (c) => c.other_party_id === tradeId && c.request_id
      );
      if (conv?.request_id) {
        router.push({
          pathname: "/(dashboard)/messages/[id]",
          params: {
            id: String(conv.request_id),
            name: profile?.business_name || profile?.full_name || "Trade",
            returnTo: "/(dashboard)/client",
          },
        });
        return;
      }
    } catch (e) {
      console.log("Message lookup error:", e?.message || e);
    }
    // Fallback: no conversation yet — guide the client to send a
    // request first.
    const tradeName =
      profile?.business_name || profile?.full_name || "this trade";
    Alert.alert(
      "Send a quote request first",
      `Once ${tradeName} receives your enquiry, you'll be able to message them directly from here.`,
      [
        { text: "OK", style: "cancel" },
        {
          text: "Request a quote",
          onPress: () => setQuoteSheetOpen(true),
        },
      ]
    );
  };

  const handleReport = () => {
    const tradeName =
      profile?.business_name || profile?.full_name || "this trade";
    Alert.alert(
      "Report this trade",
      `Thanks for flagging ${tradeName}. Our team will review the profile. You can also email support@settled.app with more details.`,
      [{ text: "OK", style: "cancel" }]
    );
  };

  if (loading) {
    return (
      <ThemedView style={{ flex: 1, paddingTop: insets.top }}>
        <ThemedStatusBar />
        <ProfilePageSkeleton paddingTop={16} />
      </ThemedView>
    );
  }

  return (
    <>
      <TradeProfileView
        profile={profile}
        reviews={reviews}
        performanceStats={performanceStats}
        insets={insets}
        mode="visitor"
        onBack={handleBack}
        // Self-view safety: hide quote + message + report so a trade
        // who lands on their own discovery page doesn't see nonsense.
        onRequestQuote={isSelf ? null : handleRequestQuote}
        onMessage={isSelf ? null : handleMessage}
        onReport={isSelf ? null : handleReport}
      />

      {/* Pre-populated quote request sheet — same component used on
          every other Request-quote entry point in the client app.   */}
      <RequestQuoteSheet
        visible={quoteSheetOpen}
        onClose={() => setQuoteSheetOpen(false)}
        tradeId={tradeId}
        tradeName={profile?.business_name || profile?.full_name || "Trade"}
      />
    </>
  );
}
