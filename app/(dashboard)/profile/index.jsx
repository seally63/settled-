// app/(dashboard)/profile/index.jsx
// Profile tab — thin consumer of the shared TradeProfileView in
// "owner" mode. Clients (non-trade role) get a minimal client-profile
// card; trades get the full shared profile shell.
//
// Data layer lives here (role, profile, reviews, performance stats);
// presentation is delegated to components/trade/TradeProfileView.jsx
// which is also used by /client/trade-profile.jsx (visitor mode) and
// /profile/trade-profile.jsx (preview mode). One shell, three modes.

import { useEffect, useState, useCallback } from "react";
import {
  StyleSheet,
  View,
  ScrollView,
  Image,
  Pressable,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter, useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import ThemedView from "../../../components/ThemedView";
import ThemedText from "../../../components/ThemedText";
import Spacer from "../../../components/Spacer";
import { ProfilePageSkeleton } from "../../../components/Skeleton";
import { IconBtn } from "../../../components/design";
import TradeProfileView from "../../../components/trade/TradeProfileView";
import { FontFamily } from "../../../constants/Typography";
import { useTheme } from "../../../hooks/useTheme";
import ThemedStatusBar from "../../../components/ThemedStatusBar";

import { useUser } from "../../../hooks/useUser";
import { getMyRole, getMyProfile } from "../../../lib/api/profile";
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

// Helpers
function normalizeRole(r) {
  if (r == null) return null;
  const s = String(r).trim().toLowerCase();
  if (["trade", "trades", "tradesman", "tradesperson", "business", "pro"].includes(s)) return "trades";
  if (["client", "customer", "homeowner", "user"].includes(s)) return "client";
  return s;
}

function getInitials(name) {
  if (!name) return "?";
  const parts = String(name).trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user, authChecked } = useUser();
  const { colors: c } = useTheme();

  const [role, setRole] = useState(null);
  const [roleLoading, setRoleLoading] = useState(true);
  const [profile, setProfile] = useState(null);
  const [reviews, setReviews] = useState([]);
  const [loadingData, setLoadingData] = useState(true);
  const [performanceStats, setPerformanceStats] = useState({
    responseTimeHours: null,
    quoteRate: null,
  });

  // Role
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        if (!authChecked) return;
        if (!user?.id) {
          if (alive) { setRole("guest"); setRoleLoading(false); }
          return;
        }
        const r = await getMyRole();
        const norm = normalizeRole(r);
        if (alive) { setRole(norm ?? "unknown"); setRoleLoading(false); }
      } catch {
        if (alive) { setRole("unknown"); setRoleLoading(false); }
      }
    })();
    return () => { alive = false; };
  }, [user?.id, authChecked]);

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
    if (role) loadProfile();
  }, [user?.id, role, loadProfile]);

  useFocusEffect(
    useCallback(() => {
      if (role && user?.id) loadProfile();
    }, [role, user?.id, loadProfile])
  );

  if (roleLoading || loadingData) {
    return (
      <ThemedView style={[styles.container, { paddingTop: insets.top }]}>
        <ThemedStatusBar />
        <ProfilePageSkeleton paddingTop={16} />
      </ThemedView>
    );
  }

  // Trade — hand off to the shared view in owner mode.
  if (role === "trades") {
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

  // Client branch — deliberately minimal. Their settings are the main
  // surface; the Profile tab just needs to carry identity + settings
  // access and hand off.
  const displayName = profile?.full_name || user?.email || "User";
  const photoUrl = profile?.photo_url || null;
  const projectCount = profile?.project_count || 0;

  return (
    <ThemedView style={[styles.container, { paddingTop: insets.top }]}>
      <ThemedStatusBar />

      <View style={[styles.topBar, { top: insets.top + 12 }]}>
        <IconBtn
          icon="menu-outline"
          onPress={() => router.push("/profile/settings")}
          testID="profile-settings-btn"
        />
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.titleBlock}>
          <ThemedText style={[styles.pageTitle, { color: c.text }]}>
            Profile
          </ThemedText>
        </View>

        <View style={styles.clientHero}>
          {photoUrl ? (
            <Image source={{ uri: photoUrl }} style={styles.clientAvatar} />
          ) : (
            <View
              style={[
                styles.clientAvatar,
                styles.clientAvatarFallback,
                { backgroundColor: c.elevate, borderColor: c.border },
              ]}
            >
              <ThemedText style={[styles.clientAvatarInitials, { color: c.textMid }]}>
                {getInitials(displayName)}
              </ThemedText>
            </View>
          )}
          <View style={styles.clientTextCol}>
            <ThemedText style={[styles.clientName, { color: c.text }]} numberOfLines={2}>
              {displayName}
            </ThemedText>
            <ThemedText style={[styles.clientSub, { color: c.textMid }]} numberOfLines={1}>
              {projectCount} project{projectCount !== 1 ? "s" : ""} completed
            </ThemedText>
          </View>
        </View>

        <Spacer height={insets.bottom + 180} />
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  topBar: {
    position: "absolute",
    right: 16,
    flexDirection: "row",
    gap: 8,
    zIndex: 20,
  },
  titleBlock: { paddingTop: 4, paddingBottom: 10 },
  pageTitle: {
    fontFamily: FontFamily.headerBold,
    fontSize: 32,
    lineHeight: 34,
    letterSpacing: -0.8,
  },
  scrollContent: { paddingHorizontal: 20, paddingTop: 54 },

  clientHero: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    paddingVertical: 8,
  },
  clientAvatar: { width: 76, height: 76, borderRadius: 38 },
  clientAvatarFallback: {
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
  },
  clientAvatarInitials: { fontFamily: FontFamily.headerBold, fontSize: 26 },
  clientTextCol: { flex: 1, minWidth: 0 },
  clientName: {
    fontFamily: FontFamily.headerBold,
    fontSize: 22,
    lineHeight: 26,
    letterSpacing: -0.4,
  },
  clientSub: { fontFamily: FontFamily.bodyRegular, fontSize: 13, marginTop: 2 },
});
