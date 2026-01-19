// app/(dashboard)/client/search-modal.jsx
// Full-screen search modal for services
import {
  View,
  TextInput,
  Pressable,
  ScrollView,
  StyleSheet,
  Keyboard,
  Dimensions,
} from "react-native";
import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { Ionicons } from "@expo/vector-icons";

import ThemedView from "../../../components/ThemedView";
import ThemedText from "../../../components/ThemedText";
import { CATEGORIES } from "../../../components/client/home/PopularServicesGrid";
import {
  getRecentSearches,
  saveRecentSearch,
} from "../../../lib/api/homeScreen";

const { width: SCREEN_WIDTH } = Dimensions.get("window");

// Search index for matching services
const SEARCH_INDEX = [
  // Plumbing
  { category: "Plumbing", service: "Leak or drip", keywords: ["leak", "drip", "dripping", "water", "pipe"] },
  { category: "Plumbing", service: "Blocked drain", keywords: ["blocked", "drain", "clogged", "sink", "slow"] },
  { category: "Plumbing", service: "Toilet problem", keywords: ["toilet", "loo", "cistern", "flush", "running"] },
  { category: "Plumbing", service: "Boiler / heating", keywords: ["boiler", "heating", "hot water", "radiator", "central heating", "gas"] },
  { category: "Plumbing", service: "New installation", keywords: ["install", "new", "fit", "fitting", "tap", "shower"] },

  // Electrical
  { category: "Electrical", service: "Socket or switch issue", keywords: ["socket", "switch", "plug", "outlet", "power point"] },
  { category: "Electrical", service: "Lighting problem", keywords: ["light", "lighting", "bulb", "lamp", "fixture", "led"] },
  { category: "Electrical", service: "Fuse box / consumer unit", keywords: ["fuse", "consumer unit", "trip", "tripping", "breaker", "rcd"] },
  { category: "Electrical", service: "Rewiring", keywords: ["rewire", "rewiring", "wiring", "cables", "wire"] },
  { category: "Electrical", service: "New installation", keywords: ["install", "new", "fit", "fitting", "electric"] },

  // Bathroom
  { category: "Bathroom", service: "Full bathroom refit", keywords: ["bathroom", "refit", "renovation", "refurb", "complete"] },
  { category: "Bathroom", service: "Shower installation", keywords: ["shower", "enclosure", "screen", "tray", "walk in"] },
  { category: "Bathroom", service: "Bath installation", keywords: ["bath", "bathtub", "tub", "freestanding"] },
  { category: "Bathroom", service: "Tiling", keywords: ["tile", "tiling", "tiles", "grout", "retile"] },
  { category: "Bathroom", service: "Plumbing work", keywords: ["plumbing", "pipes", "tap", "taps", "basin"] },

  // Kitchen
  { category: "Kitchen", service: "Full kitchen refit", keywords: ["kitchen", "refit", "renovation", "refurb", "complete", "new kitchen"] },
  { category: "Kitchen", service: "Appliance installation", keywords: ["appliance", "dishwasher", "oven", "hob", "cooker", "washing machine", "fridge"] },
  { category: "Kitchen", service: "Worktop replacement", keywords: ["worktop", "counter", "countertop", "surface", "granite", "quartz"] },
  { category: "Kitchen", service: "Cabinet fitting", keywords: ["cabinet", "cupboard", "unit", "units", "door"] },
  { category: "Kitchen", service: "Tiling / splashback", keywords: ["tile", "tiling", "splashback", "backsplash"] },

  // Cleaning
  { category: "Cleaning", service: "Deep clean", keywords: ["deep", "clean", "thorough", "spring", "intensive"] },
  { category: "Cleaning", service: "End of tenancy", keywords: ["tenancy", "moving", "move out", "rental", "landlord", "deposit"] },
  { category: "Cleaning", service: "Carpet cleaning", keywords: ["carpet", "rug", "steam", "stain"] },
  { category: "Cleaning", service: "Window cleaning", keywords: ["window", "glass", "windows"] },
  { category: "Cleaning", service: "Regular cleaning", keywords: ["regular", "weekly", "fortnightly", "monthly", "domestic", "cleaner"] },

  // Handyman
  { category: "Handyman", service: "Furniture assembly", keywords: ["furniture", "assembly", "assemble", "flatpack", "ikea", "wardrobe"] },
  { category: "Handyman", service: "Painting / decorating", keywords: ["paint", "painting", "decorator", "decorating", "walls", "wallpaper"] },
  { category: "Handyman", service: "Shelving / mounting", keywords: ["shelf", "shelving", "mount", "mounting", "tv", "bracket", "hang"] },
  { category: "Handyman", service: "Door / window repair", keywords: ["door", "window", "lock", "handle", "hinge", "draught"] },
  { category: "Handyman", service: "General repairs", keywords: ["repair", "fix", "broken", "general", "odd job", "handyman"] },
];

// Get category icon by name
function getCategoryIcon(categoryName) {
  const cat = CATEGORIES.find(
    (c) => c.name.toLowerCase() === categoryName.toLowerCase()
  );
  return cat?.icon || "🛠️";
}

// Get category data by name
function getCategoryByName(categoryName) {
  return CATEGORIES.find(
    (c) => c.name.toLowerCase() === categoryName.toLowerCase()
  );
}

// Search function
function searchServices(query) {
  if (!query || query.length < 2) return [];

  const normalized = query.toLowerCase().trim();
  const results = [];
  const seen = new Set();

  // Search through index
  for (const item of SEARCH_INDEX) {
    const serviceKey = `${item.category}:${item.service}`;
    if (seen.has(serviceKey)) continue;

    // Check service name match
    const serviceLower = item.service.toLowerCase();
    const categoryLower = item.category.toLowerCase();

    let matchType = null;

    if (serviceLower === normalized) {
      matchType = "exact";
    } else if (serviceLower.startsWith(normalized)) {
      matchType = "prefix";
    } else if (serviceLower.includes(normalized)) {
      matchType = "contains";
    } else if (categoryLower.includes(normalized)) {
      matchType = "category";
    } else if (item.keywords.some((k) => k.includes(normalized))) {
      matchType = "keyword";
    }

    if (matchType) {
      seen.add(serviceKey);
      results.push({
        ...item,
        matchType,
        icon: getCategoryIcon(item.category),
      });
    }
  }

  // Sort by match priority
  const priority = { exact: 1, prefix: 2, contains: 3, category: 4, keyword: 5 };
  results.sort((a, b) => priority[a.matchType] - priority[b.matchType]);

  return results.slice(0, 10);
}

// Result item component
function ServiceResultItem({ item, onPress }) {
  return (
    <Pressable
      style={({ pressed }) => [
        styles.resultItem,
        pressed && styles.resultItemPressed,
      ]}
      onPress={onPress}
    >
      <ThemedText style={styles.resultIcon}>{item.icon}</ThemedText>
      <View style={styles.resultText}>
        <ThemedText style={styles.resultService}>{item.service}</ThemedText>
        <ThemedText style={styles.resultCategory}>{item.category}</ThemedText>
      </View>
    </Pressable>
  );
}

// Category list item
function CategoryListItem({ category, onPress }) {
  return (
    <Pressable
      style={({ pressed }) => [
        styles.categoryItem,
        pressed && styles.categoryItemPressed,
      ]}
      onPress={onPress}
    >
      <ThemedText style={styles.categoryIcon}>{category.icon}</ThemedText>
      <ThemedText style={styles.categoryName}>{category.name}</ThemedText>
      <Ionicons name="chevron-forward" size={20} color="#9CA3AF" />
    </Pressable>
  );
}

// Recent search item
function RecentSearchItem({ term, onPress }) {
  return (
    <Pressable
      style={({ pressed }) => [
        styles.recentItem,
        pressed && styles.recentItemPressed,
      ]}
      onPress={onPress}
    >
      <Ionicons name="time-outline" size={18} color="#9CA3AF" />
      <ThemedText style={styles.recentText}>{term}</ThemedText>
    </Pressable>
  );
}

export default function SearchModal() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const inputRef = useRef(null);

  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [recentSearches, setRecentSearches] = useState([]);

  // Load recent searches on mount
  useEffect(() => {
    loadRecentSearches();
  }, []);

  // Auto-focus input
  useEffect(() => {
    const timer = setTimeout(() => {
      inputRef.current?.focus();
    }, 300);
    return () => clearTimeout(timer);
  }, []);

  // Search when query changes
  useEffect(() => {
    const timer = setTimeout(() => {
      if (query.length >= 2) {
        setResults(searchServices(query));
      } else {
        setResults([]);
      }
    }, 200);
    return () => clearTimeout(timer);
  }, [query]);

  const loadRecentSearches = async () => {
    const searches = await getRecentSearches();
    setRecentSearches(searches);
  };

  const handleClose = () => {
    Keyboard.dismiss();
    router.back();
  };

  const handleClear = () => {
    setQuery("");
    setResults([]);
    inputRef.current?.focus();
  };

  const handleSelectService = async (category, service) => {
    // Save search
    await saveRecentSearch(service);

    // Navigate to quote request flow with pre-filled values
    router.push({
      pathname: "/client/clienthome",
      params: {
        prefillCategory: category,
        prefillService: service,
      },
    });
  };

  const handleSelectCategory = (category) => {
    // Navigate directly to quote form with category pre-filled (skip bottom sheet)
    router.push({
      pathname: "/client/clienthome",
      params: {
        prefillCategory: category.name,
      },
    });
  };

  const handleSearchTrades = async () => {
    if (query.trim()) {
      await saveRecentSearch(query.trim());
      router.push({
        pathname: "/client/find-business",
        params: { q: query.trim() },
      });
    }
  };

  const handleDescribeProblem = () => {
    router.push("/client/describe-problem");
  };

  const handleRecentSearch = (term) => {
    setQuery(term);
  };

  const hasQuery = query.length > 0;
  const hasResults = results.length > 0;

  return (
    <ThemedView style={[styles.container, { paddingTop: insets.top }]}>
      <StatusBar style="dark" />

      {/* Search header */}
      <View style={styles.header}>
        <View style={styles.searchContainer}>
          <Ionicons name="search" size={20} color="#9CA3AF" />
          <TextInput
            ref={inputRef}
            style={styles.input}
            placeholder="Search for a service..."
            placeholderTextColor="#9CA3AF"
            value={query}
            onChangeText={setQuery}
            returnKeyType="search"
            autoCapitalize="none"
            autoCorrect={false}
          />
          {hasQuery && (
            <Pressable onPress={handleClear} hitSlop={8}>
              <Ionicons name="close-circle" size={20} color="#9CA3AF" />
            </Pressable>
          )}
        </View>
        <Pressable style={styles.cancelButton} onPress={handleClose}>
          <ThemedText style={styles.cancelText}>Cancel</ThemedText>
        </Pressable>
      </View>

      <ScrollView
        style={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Empty state: Recent searches + All services */}
        {!hasQuery && (
          <>
            {/* Recent searches */}
            {recentSearches.length > 0 && (
              <View style={styles.section}>
                <ThemedText style={styles.sectionTitle}>
                  Recent Searches
                </ThemedText>
                {recentSearches.map((term) => (
                  <RecentSearchItem
                    key={term}
                    term={term}
                    onPress={() => handleRecentSearch(term)}
                  />
                ))}
              </View>
            )}

            {/* All services */}
            <View style={styles.section}>
              <ThemedText style={styles.sectionTitle}>All Services</ThemedText>
              {CATEGORIES.map((category) => (
                <CategoryListItem
                  key={category.id}
                  category={category}
                  onPress={() => handleSelectCategory(category)}
                />
              ))}
            </View>
          </>
        )}

        {/* Search results */}
        {hasQuery && hasResults && (
          <View style={styles.section}>
            <ThemedText style={styles.sectionTitle}>Services</ThemedText>
            {results.map((item) => (
              <ServiceResultItem
                key={`${item.category}:${item.service}`}
                item={item}
                onPress={() => handleSelectService(item.category, item.service)}
              />
            ))}
          </View>
        )}

        {/* No results state */}
        {hasQuery && !hasResults && (
          <View style={styles.section}>
            <ThemedText style={styles.noResults}>No services found</ThemedText>
          </View>
        )}

        {/* Search trades option */}
        {hasQuery && (
          <View style={styles.section}>
            <View style={styles.divider} />
            <Pressable
              style={({ pressed }) => [
                styles.searchTradesOption,
                pressed && styles.searchTradesPressed,
              ]}
              onPress={handleSearchTrades}
            >
              <Ionicons name="search" size={20} color="#6849a7" />
              <ThemedText style={styles.searchTradesText}>
                Search trades for "{query}"
              </ThemedText>
            </Pressable>

            {!hasResults && (
              <Pressable
                style={({ pressed }) => [
                  styles.describeOption,
                  pressed && styles.describePressed,
                ]}
                onPress={handleDescribeProblem}
              >
                <ThemedText style={styles.describeIcon}>📝</ThemedText>
                <ThemedText style={styles.describeText}>
                  Or describe your problem
                </ThemedText>
              </Pressable>
            )}
          </View>
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
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
  },
  searchContainer: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F3F4F6",
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 44,
    gap: 8,
  },
  input: {
    flex: 1,
    fontSize: 16,
    color: "#1F2937",
  },
  cancelButton: {
    padding: 4,
  },
  cancelText: {
    fontSize: 16,
    color: "#6849a7",
    fontWeight: "500",
  },
  content: {
    flex: 1,
  },
  section: {
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: "600",
    color: "#6B7280",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  // Recent search item
  recentItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    gap: 12,
  },
  recentItemPressed: {
    opacity: 0.7,
  },
  recentText: {
    fontSize: 16,
    color: "#1F2937",
  },
  // Category list item
  categoryItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#F3F4F6",
  },
  categoryItemPressed: {
    backgroundColor: "#F9FAFB",
  },
  categoryIcon: {
    fontSize: 24,
    marginRight: 12,
  },
  categoryName: {
    flex: 1,
    fontSize: 16,
    color: "#1F2937",
  },
  // Search result item
  resultItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#F3F4F6",
  },
  resultItemPressed: {
    backgroundColor: "#F9FAFB",
  },
  resultIcon: {
    fontSize: 24,
    marginRight: 12,
  },
  resultText: {
    flex: 1,
  },
  resultService: {
    fontSize: 16,
    color: "#1F2937",
    fontWeight: "500",
  },
  resultCategory: {
    fontSize: 13,
    color: "#6B7280",
    marginTop: 2,
  },
  // No results
  noResults: {
    fontSize: 16,
    color: "#6B7280",
    textAlign: "center",
    paddingVertical: 20,
  },
  // Divider
  divider: {
    height: 1,
    backgroundColor: "#E5E7EB",
    marginVertical: 8,
  },
  // Search trades option
  searchTradesOption: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    gap: 12,
  },
  searchTradesPressed: {
    opacity: 0.7,
  },
  searchTradesText: {
    fontSize: 16,
    color: "#6849a7",
    fontWeight: "500",
  },
  // Describe problem option
  describeOption: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    gap: 12,
  },
  describePressed: {
    opacity: 0.7,
  },
  describeIcon: {
    fontSize: 20,
  },
  describeText: {
    fontSize: 16,
    color: "#6B7280",
  },
});
