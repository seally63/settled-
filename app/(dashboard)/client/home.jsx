// app/(dashboard)/client/home.jsx
// Client Home — STRUCTURAL rebuild per the Settled redesign.
//
// Previous (discovery-first) layout: search bar → popular services →
// trades-near-you → willing-to-travel → trust badge.
//
// New (action-first) layout per design spec:
//   Top-right IconBtns: bell + search + more
//   Big "Home" title + greeting
//   Panel: Active job     (one status-striped row + Message / Track)
//   Panel: Quotes         (status-striped rows per open request)
//   Section: Saved trades (horizontal TradeMini cards)
//   Panel: Messages       (top 3 conversations)
//
// Discovery is still reachable — the top-right search icon opens the
// existing search modal, and "Saved trades" tappable heads to the
// find-business listing. No Supabase or navigation changes.

import {
  StyleSheet,
  View,
  ScrollView,
  RefreshControl,
} from "react-native";
import { useState, useCallback, useRef } from "react";
import { useRouter, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect } from "@react-navigation/native";
import ThemedStatusBar from "../../../components/ThemedStatusBar";

import { useUser } from "../../../hooks/useUser";
import { useTheme } from "../../../hooks/useTheme";
import ThemedView from "../../../components/ThemedView";
import ThemedText from "../../../components/ThemedText";
import { IconBtn } from "../../../components/design";
import { Colors } from "../../../constants/Colors";
import { TypeVariants, Spacing } from "../../../constants/Typography";

// New panels (per design spec)
import ActiveJobPanel from "../../../components/client/home/ActiveJobPanel";
import QuotesPanel from "../../../components/client/home/QuotesPanel";
import SavedTradesSection from "../../../components/client/home/SavedTradesSection";
import MessagesPanel from "../../../components/client/home/MessagesPanel";
import PostcodePrompt from "../../../components/client/home/PostcodePrompt";

// API
import { getUserFirstName } from "../../../lib/api/homeScreen";
import { getMyProfile } from "../../../lib/api/profile";

function getGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

export default function ClientHomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useUser();
  const { colors: c, dark } = useTheme();
  const params = useLocalSearchParams();

  // Legacy deep-link: /client?openSearch=true should still open the modal.
  const hasHandledOpenSearch = useRef(false);
  useFocusEffect(
    useCallback(() => {
      if (params.openSearch === "true" && !hasHandledOpenSearch.current) {
        hasHandledOpenSearch.current = true;
        const timer = setTimeout(() => {
          router.push("/client/search-modal");
        }, 100);
        return () => clearTimeout(timer);
      }
    }, [params.openSearch])
  );

  const [firstName, setFirstName] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  const [showPostcodePrompt, setShowPostcodePrompt] = useState(false);

  const loadLightweight = useCallback(async () => {
    try {
      if (user?.id) {
        const name = await getUserFirstName(user.id);
        setFirstName(name);
      }
      const profile = await getMyProfile();
      if (
        !hasLoadedOnce &&
        (profile?.base_lat == null || profile?.base_lon == null)
      ) {
        setShowPostcodePrompt(true);
      }
      setHasLoadedOnce(true);
    } catch (e) {
      console.warn("ClientHome loadLightweight error:", e.message);
    }
  }, [user?.id, hasLoadedOnce]);

  useFocusEffect(
    useCallback(() => {
      loadLightweight();
    }, [loadLightweight])
  );

  const handleRefresh = async () => {
    setRefreshing(true);
    // Each panel reloads independently on focus; force a re-render
    // of the greeting + cue child panels via a short reload cycle.
    await loadLightweight();
    setTimeout(() => setRefreshing(false), 400);
  };

  const handlePostcodeSaved = async () => {
    setShowPostcodePrompt(false);
    // Panels will pick up the new postcode on next focus automatically.
  };

  return (
    <ThemedView style={styles.container}>
      <ThemedStatusBar />

      {/* Fixed top safe-area backing so top icons don't clip on scroll */}
      <View
        style={[
          styles.safeAreaBackground,
          { height: insets.top, backgroundColor: c.background },
        ]}
      />

      {/* Top-right icon dock: bell · search · more */}
      <View style={[styles.topBar, { top: insets.top + 12 }]}>
        <IconBtn icon="notifications-outline" badge />
        <IconBtn
          icon="search-outline"
          onPress={() => router.push("/client/search-modal")}
        />
        <IconBtn icon="ellipsis-horizontal" />
      </View>

      <ScrollView
        style={[styles.scrollView, { marginTop: insets.top }]}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingTop: 54, paddingBottom: insets.bottom + 130 },
        ]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={Colors.primary}
          />
        }
      >
        {/* Big page title */}
        <View style={styles.titleBlock}>
          <ThemedText
            style={[
              TypeVariants.displayXL,
              { color: c.text, fontSize: 32, lineHeight: 34 },
            ]}
          >
            Home
          </ThemedText>
          <ThemedText
            style={[
              TypeVariants.body,
              { color: c.textMid, marginTop: 4 },
            ]}
          >
            {getGreeting()}{firstName ? `, ${firstName}` : ""}
          </ThemedText>
        </View>

        <ActiveJobPanel />
        <QuotesPanel />
        <SavedTradesSection />
        <MessagesPanel />
      </ScrollView>

      <PostcodePrompt
        visible={showPostcodePrompt}
        onClose={() => setShowPostcodePrompt(false)}
        onSaved={handlePostcodeSaved}
      />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeAreaBackground: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
  },
  topBar: {
    position: "absolute",
    right: 16,
    flexDirection: "row",
    gap: 8,
    zIndex: 20,
  },
  scrollView: { flex: 1 },
  scrollContent: {
    paddingHorizontal: 0, // panels have their own 16px gutter
  },
  titleBlock: {
    paddingHorizontal: Spacing.lg,
    paddingBottom: 6,
  },
});
