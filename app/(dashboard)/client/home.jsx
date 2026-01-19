// app/(dashboard)/client/home.jsx
// New Client Home Screen with action-first design
import {
  StyleSheet,
  View,
  ScrollView,
  RefreshControl,
} from "react-native";
import { useState, useCallback } from "react";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect } from "@react-navigation/native";
import { StatusBar } from "expo-status-bar";

import { useUser } from "../../../hooks/useUser";
import ThemedView from "../../../components/ThemedView";
import { SkeletonBox, SkeletonText, SkeletonCircle } from "../../../components/Skeleton";

// Home screen components
import HomeHeader from "../../../components/client/home/HomeHeader";
import SearchBar from "../../../components/client/home/SearchBar";
import PopularServicesGrid from "../../../components/client/home/PopularServicesGrid";
import ActiveRequestCard from "../../../components/client/home/ActiveRequestCard";
import RecentlyCompletedFeed from "../../../components/client/home/RecentlyCompletedFeed";
import DescribeProblemCTA from "../../../components/client/home/DescribeProblemCTA";

// API functions
import {
  getRecentCompletions,
  getClientActiveRequests,
  getUserFirstName,
} from "../../../lib/api/homeScreen";

// Skeleton loader for client home screen
function ClientHomeSkeleton() {
  return (
    <View style={styles.skeletonContainer}>
      {/* Header skeleton */}
      <View style={styles.skeletonHeader}>
        <SkeletonText width={180} height={28} />
      </View>

      {/* Search bar skeleton */}
      <SkeletonBox width="100%" height={48} borderRadius={24} style={{ marginBottom: 24 }} />

      {/* Popular services skeleton */}
      <SkeletonText width={140} height={18} style={{ marginBottom: 16 }} />
      <View style={styles.skeletonGrid}>
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <View key={i} style={styles.skeletonGridItem}>
            <SkeletonCircle size={56} />
            <SkeletonText width={60} height={12} style={{ marginTop: 8 }} />
          </View>
        ))}
      </View>

      {/* Recently completed skeleton */}
      <SkeletonText width={200} height={18} style={{ marginTop: 24, marginBottom: 12 }} />
      {[1, 2, 3].map((i) => (
        <SkeletonBox key={i} width="100%" height={60} borderRadius={10} style={{ marginBottom: 8 }} />
      ))}
    </View>
  );
}

export default function ClientHomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useUser();

  // State
  const [firstName, setFirstName] = useState(null);
  const [activeRequest, setActiveRequest] = useState(null);
  const [completions, setCompletions] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);


  // Load data on mount and when screen comes into focus
  useFocusEffect(
    useCallback(() => {
      loadData(!hasLoadedOnce); // Only show skeleton on initial load
    }, [user?.id, hasLoadedOnce])
  );

  const loadData = async (showLoadingState = true) => {
    // Only show loading skeleton on initial load, not on subsequent focus events
    if (showLoadingState) {
      setIsLoading(true);
    }
    try {
      await Promise.all([
        loadUserName(),
        loadActiveRequests(),
        loadCompletions(),
      ]);
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
    }
  };

  const loadActiveRequests = async () => {
    if (user?.id) {
      const requests = await getClientActiveRequests(user.id);
      // Only show the most recent active request
      setActiveRequest(requests.length > 0 ? requests[0] : null);
    }
  };

  const loadCompletions = async () => {
    const data = await getRecentCompletions(null, 3);
    setCompletions(data);
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadData(false); // Don't show skeleton on pull-to-refresh
    setRefreshing(false);
  };

  // Navigation handlers
  const handleSearchPress = () => {
    router.push("/client/search-modal");
  };

  const handleCategorySelect = (category) => {
    // Navigate directly to quote form with category pre-filled (skip bottom sheet)
    router.push({
      pathname: "/client/clienthome",
      params: {
        prefillCategory: category.name,
      },
    });
  };


  const handleActiveRequestPress = (requestId) => {
    router.push(`/client/myquotes/request/${requestId}`);
  };

  const handleSeeAllRequests = () => {
    router.push("/client/myquotes");
  };

  const handleDescribeProblem = () => {
    // Navigate to clienthome (quote request flow) step 0
    router.push("/client/clienthome");
  };

  return (
    <ThemedView style={styles.container}>
      <StatusBar style="dark" />

      {/* Fixed safe area background - prevents content showing under notch */}
      <View style={[styles.safeAreaBackground, { height: insets.top }]} />

      <ScrollView
        style={[styles.scrollView, { marginTop: insets.top }]}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingTop: 8, paddingBottom: insets.bottom + 100 },
        ]}
        showsVerticalScrollIndicator={false}
        bounces={true}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor="#6849a7"
          />
        }
      >
        {isLoading ? (
          <ClientHomeSkeleton />
        ) : (
          <>
            {/* Header */}
            <HomeHeader firstName={firstName} />

            {/* Search bar */}
            <SearchBar onPress={handleSearchPress} />

            {/* Popular services grid */}
            <PopularServicesGrid onCategorySelect={handleCategorySelect} />

            {/* Active request card (conditional) */}
            <ActiveRequestCard
              request={activeRequest}
              onPress={handleActiveRequestPress}
              onSeeAll={handleSeeAllRequests}
            />

            {/* Recently completed feed (conditional) */}
            <RecentlyCompletedFeed
              completions={completions}
              isLoading={false}
            />

            {/* Describe your problem CTA */}
            <DescribeProblemCTA onPress={handleDescribeProblem} />
          </>
        )}
      </ScrollView>

    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#FFFFFF",
  },
  safeAreaBackground: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: "#FFFFFF",
    zIndex: 10,
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
