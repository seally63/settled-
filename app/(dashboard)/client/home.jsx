// app/(dashboard)/client/home.jsx
// Client Home Screen — trade discovery feed (browse-and-choose model).
// UI-only redesign pass: theme-aware, new top-right icons, floating-tab-bar
// aware bottom padding. Data/navigation unchanged.
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
import { StatusBar } from "expo-status-bar";

import { useUser } from "../../../hooks/useUser";
import { useTheme } from "../../../hooks/useTheme";
import ThemedView from "../../../components/ThemedView";
import { SkeletonBox, SkeletonText, SkeletonCircle } from "../../../components/Skeleton";
import IconBtn from "../../../components/design/IconBtn";
import { Colors } from "../../../constants/Colors";

// Home screen components
import HomeHeader from "../../../components/client/home/HomeHeader";
import SearchBar from "../../../components/client/home/SearchBar";
import PopularServicesGrid from "../../../components/client/home/PopularServicesGrid";
import TradesFeedSection from "../../../components/client/home/TradesFeedSection";
import PostcodePrompt from "../../../components/client/home/PostcodePrompt";
import TrustBadge from "../../../components/client/home/TrustBadge";

// API functions
import { getUserFirstName } from "../../../lib/api/homeScreen";
import { getMyProfile } from "../../../lib/api/profile";
import { getClosestTrades, getWillingToTravel } from "../../../lib/api/feed";

// Skeleton loader for client home screen
function ClientHomeSkeleton() {
  return (
    <View style={styles.skeletonContainer}>
      <View style={styles.skeletonHeader}>
        <SkeletonText width={180} height={28} />
      </View>
      <SkeletonBox width="100%" height={52} borderRadius={18} style={{ marginBottom: 24 }} />
      <SkeletonText width={140} height={18} style={{ marginBottom: 16 }} />
      <View style={styles.skeletonGrid}>
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <View key={i} style={styles.skeletonGridItem}>
            <SkeletonCircle size={48} />
            <SkeletonText width={60} height={12} style={{ marginTop: 8 }} />
          </View>
        ))}
      </View>
      <SkeletonText width={180} height={18} style={{ marginTop: 24, marginBottom: 12 }} />
      <View style={{ flexDirection: "row", gap: 12 }}>
        {[1, 2].map((i) => (
          <SkeletonBox key={i} width={210} height={100} borderRadius={14} />
        ))}
      </View>
    </View>
  );
}

export default function ClientHomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useUser();
  const { colors: c, dark } = useTheme();
  const params = useLocalSearchParams();

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
  const [clientLocation, setClientLocation] = useState(null);
  const [nearbyTrades, setNearbyTrades] = useState([]);
  const [furtherTrades, setFurtherTrades] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  const [showPostcodePrompt, setShowPostcodePrompt] = useState(false);

  useFocusEffect(
    useCallback(() => {
      loadData(!hasLoadedOnce);
    }, [user?.id, hasLoadedOnce])
  );

  const loadData = async (showLoadingState = true) => {
    if (showLoadingState) setIsLoading(true);
    try {
      const [name, profile] = await Promise.all([
        loadUserName(),
        loadProfileLocation(),
      ]);

      if (profile?.base_lat != null && profile?.base_lon != null) {
        await loadTradeFeeds(profile.base_lat, profile.base_lon);
      } else {
        setNearbyTrades([]);
        setFurtherTrades([]);
        if (!hasLoadedOnce) setShowPostcodePrompt(true);
      }

      setHasLoadedOnce(true);
    } catch (e) {
      console.warn("Error loading home data:", e.message);
    } finally {
      setIsLoading(false);
    }
  };

  const loadUserName = async () => {
    if (user?.id) {
      const name = await getUserFirstName(user.id);
      setFirstName(name);
      return name;
    }
    return null;
  };

  const loadProfileLocation = async () => {
    const profile = await getMyProfile();
    if (profile?.base_lat != null && profile?.base_lon != null) {
      setClientLocation({
        lat: Number(profile.base_lat),
        lon: Number(profile.base_lon),
        postcode: profile.base_postcode,
        town: profile.town_city,
      });
    }
    return profile;
  };

  const loadTradeFeeds = async (lat, lon) => {
    try {
      const [nearby, further] = await Promise.all([
        getClosestTrades({ lat, lon, limit: 10 }),
        getWillingToTravel({ lat, lon, limit: 10 }),
      ]);
      setNearbyTrades(nearby || []);
      setFurtherTrades(further || []);
    } catch (e) {
      console.warn("Error loading trade feeds:", e.message);
      setNearbyTrades([]);
      setFurtherTrades([]);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadData(false);
    setRefreshing(false);
  };

  const handlePostcodeSaved = async ({ lat, lon, postcode, town }) => {
    setClientLocation({ lat, lon, postcode, town });
    setShowPostcodePrompt(false);
    await loadTradeFeeds(lat, lon);
  };

  const handleSearchPress = () => router.push("/client/search-modal");

  const handleCategorySelect = (category) => {
    router.push({
      pathname: "/client/find-business",
      params: { category: category.name },
    });
  };

  const handleTradePress = (trade) => {
    router.push({
      pathname: "/client/trade-profile",
      params: { tradeId: trade.id },
    });
  };

  return (
    <ThemedView style={styles.container}>
      <StatusBar style={dark ? "light" : "dark"} />

      <View style={[styles.safeAreaBackground, { height: insets.top, backgroundColor: c.background }]} />

      {/* Top-right icon dock — subtle, matches design spec. */}
      <View style={[styles.topBar, { top: insets.top + 8 }]}>
        <IconBtn icon="notifications-outline" badge />
        <IconBtn icon="ellipsis-horizontal" />
      </View>

      <ScrollView
        style={[styles.scrollView, { marginTop: insets.top }]}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingTop: 48, paddingBottom: insets.bottom + 110 },
        ]}
        showsVerticalScrollIndicator={false}
        bounces={true}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={Colors.primary}
          />
        }
      >
        {isLoading ? (
          <ClientHomeSkeleton />
        ) : (
          <>
            <HomeHeader firstName={firstName} />
            <SearchBar onPress={handleSearchPress} />
            <PopularServicesGrid onCategorySelect={handleCategorySelect} />

            <TradesFeedSection
              title="Trades near you"
              subtitle={
                clientLocation?.town
                  ? `Verified trades around ${clientLocation.town}`
                  : "Verified trades in your area"
              }
              trades={nearbyTrades}
              onTradePress={handleTradePress}
              emptyMessage={
                clientLocation
                  ? "No trades in your area yet. Try checking back soon."
                  : "Add your postcode to see trades near you."
              }
            />

            {furtherTrades.length > 0 && (
              <TradesFeedSection
                title="Willing to travel"
                subtitle="Trades based further away who cover your area"
                trades={furtherTrades}
                onTradePress={handleTradePress}
              />
            )}

            <TrustBadge />
          </>
        )}
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
  container: {
    flex: 1,
  },
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
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
  },
  // Skeleton styles
  skeletonContainer: {
    flex: 1,
  },
  skeletonHeader: {
    marginBottom: 20,
  },
  skeletonGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 16,
    marginBottom: 8,
  },
  skeletonGridItem: {
    width: "30%",
    alignItems: "center",
  },
});
