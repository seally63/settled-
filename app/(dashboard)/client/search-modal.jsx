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
import { Ionicons } from "@expo/vector-icons";

import ThemedView from "../../../components/ThemedView";
import ThemedText from "../../../components/ThemedText";
import { CATEGORIES } from "../../../components/client/home/PopularServicesGrid";
import {
  getRecentSearches,
  saveRecentSearch,
  removeRecentSearch,
} from "../../../lib/api/homeScreen";
import { searchTrades } from "../../../lib/api/profile";
import { Image } from "react-native";
import {
  getCategoryIcon,
  getServiceTypeIcon,
  defaultCategoryIcon,
  defaultServiceTypeIcon,
} from "../../../assets/icons";
import ThemedStatusBar from "../../../components/ThemedStatusBar";
import { useTheme } from "../../../hooks/useTheme";
import { FontFamily } from "../../../constants/Typography";
import { Colors } from "../../../constants/Colors";
import { useMemo } from "react";

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

// Get category icon source by name (returns PNG source for Image component)
function getCategoryIconSource(categoryName) {
  return getCategoryIcon(categoryName);
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
        iconSource: getCategoryIconSource(item.category),
        serviceIconSource: getServiceTypeIcon(item.service),
      });
    }
  }

  // Sort by match priority
  const priority = { exact: 1, prefix: 2, contains: 3, category: 4, keyword: 5 };
  results.sort((a, b) => priority[a.matchType] - priority[b.matchType]);

  return results.slice(0, 10);
}

// Result item component
function ServiceResultItem({ item, onPress, styles, c }) {
  const iconSource = item.serviceIconSource || item.iconSource || defaultServiceTypeIcon;
  return (
    <Pressable
      style={({ pressed }) => [
        styles.resultItem,
        pressed && styles.resultItemPressed,
      ]}
      onPress={onPress}
    >
      {/* Icon tile — fixed light fill so the black-line assets stay
          readable on dark mode. Same treatment on the category rows. */}
      <View style={styles.iconTile}>
        <Image source={iconSource} style={styles.iconTileImage} resizeMode="contain" />
      </View>
      <View style={styles.resultText}>
        <ThemedText style={styles.resultService}>{item.service}</ThemedText>
        <ThemedText style={styles.resultCategory}>{item.category}</ThemedText>
      </View>
    </Pressable>
  );
}

// Category list item
function CategoryListItem({ category, onPress, styles, c }) {
  const iconSource = getCategoryIconSource(category.name) || defaultCategoryIcon;
  return (
    <Pressable
      style={({ pressed }) => [
        styles.categoryItem,
        pressed && styles.categoryItemPressed,
      ]}
      onPress={onPress}
    >
      <View style={styles.iconTile}>
        <Image source={iconSource} style={styles.iconTileImage} resizeMode="contain" />
      </View>
      <ThemedText style={styles.categoryName}>{category.name}</ThemedText>
      <Ionicons name="chevron-forward" size={20} color={c.textMuted} />
    </Pressable>
  );
}

// Recent search item
function RecentSearchItem({ term, onPress, onRemove, styles, c }) {
  return (
    <View style={styles.recentItemRow}>
      <Pressable
        style={({ pressed }) => [
          styles.recentItem,
          pressed && styles.recentItemPressed,
        ]}
        onPress={onPress}
      >
        <Ionicons name="time-outline" size={18} color={c.textMuted} />
        <ThemedText style={styles.recentText}>{term}</ThemedText>
      </Pressable>
      <Pressable
        style={({ pressed }) => [
          styles.recentRemoveButton,
          pressed && styles.recentRemovePressed,
        ]}
        onPress={onRemove}
        hitSlop={8}
      >
        <Ionicons name="close" size={18} color={c.textMuted} />
      </Pressable>
    </View>
  );
}

// Trade result item
function TradeResultItem({ trade, onPress, styles, c }) {
  const displayName = trade.business_name || trade.full_name || "Unknown Trade";
  const subtitle = trade.trade_title || "";
  const location = trade.town_city || "";
  return (
    <Pressable
      style={({ pressed }) => [
        styles.tradeItem,
        pressed && styles.tradeItemPressed,
      ]}
      onPress={onPress}
    >
      {trade.photo_url ? (
        <Image source={{ uri: trade.photo_url }} style={styles.tradeAvatar} />
      ) : (
        <View style={styles.tradeAvatarPlaceholder}>
          <Ionicons name="person" size={20} color={c.textMuted} />
        </View>
      )}
      <View style={styles.tradeInfo}>
        <ThemedText style={styles.tradeName} numberOfLines={1}>
          {displayName}
        </ThemedText>
        {subtitle ? (
          <ThemedText style={styles.tradeSubtitle} numberOfLines={1}>
            {subtitle}
          </ThemedText>
        ) : null}
        {location ? (
          <ThemedText style={styles.tradeLocation} numberOfLines={1}>
            {location}
          </ThemedText>
        ) : null}
      </View>
      <Ionicons name="chevron-forward" size={20} color={c.textMuted} />
    </Pressable>
  );
}

export default function SearchModal() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const inputRef = useRef(null);
  const { colors: c, dark } = useTheme();
  const styles = useMemo(() => makeStyles(c, dark), [c, dark]);

  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [tradeResults, setTradeResults] = useState([]);
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
    const timer = setTimeout(async () => {
      if (query.length >= 2) {
        // Search services (local)
        setResults(searchServices(query));
        // Search trades (async)
        try {
          const trades = await searchTrades(query, 5);
          setTradeResults(trades);
        } catch (err) {
          console.warn("Trade search error:", err);
          setTradeResults([]);
        }
      } else {
        setResults([]);
        setTradeResults([]);
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
    setTradeResults([]);
    inputRef.current?.focus();
  };

  const handleSelectService = async (category, service) => {
    // Save search
    await saveRecentSearch(service);

    // Browse trades filtered by category
    router.push({
      pathname: "/client/find-business",
      params: {
        category,
        service,
      },
    });
  };

  const handleSelectCategory = (category) => {
    // Browse trades filtered by category
    router.push({
      pathname: "/client/find-business",
      params: { category: category.name },
    });
  };

  const handleSelectTrade = async (trade) => {
    // Save search term
    const searchTerm = trade.business_name || trade.full_name;
    if (searchTerm) {
      await saveRecentSearch(searchTerm);
    }

    // Dismiss keyboard
    Keyboard.dismiss();

    // Navigate to the trade profile page
    try {
      router.back();
      setTimeout(() => {
        router.push({
          pathname: "/client/trade-profile",
          params: { tradeId: trade.id },
        });
      }, 100);
    } catch (err) {
      console.error("Navigation error:", err);
    }
  };

  const handleDescribeProblem = () => {
    router.push("/client/describe-problem");
  };

  const handleRecentSearch = (term) => {
    setQuery(term);
  };

  const handleRemoveRecentSearch = async (term) => {
    await removeRecentSearch(term);
    // Refresh the list
    const searches = await getRecentSearches();
    setRecentSearches(searches);
  };

  const hasQuery = query.length > 0;
  const hasServiceResults = results.length > 0;
  const hasTradeResults = tradeResults.length > 0;
  const hasResults = hasServiceResults || hasTradeResults;

  return (
    <ThemedView style={[styles.container, { paddingTop: insets.top }]}>
      <ThemedStatusBar />

      {/* Search header */}
      <View style={styles.header}>
        <View style={styles.searchContainer}>
          <Ionicons name="search" size={20} color={c.textMuted} />
          <TextInput
            ref={inputRef}
            style={styles.input}
            placeholder="Search for a service..."
            placeholderTextColor={c.textMuted}
            value={query}
            onChangeText={setQuery}
            returnKeyType="search"
            autoCapitalize="none"
            autoCorrect={false}
          />
          {hasQuery && (
            <Pressable onPress={handleClear} hitSlop={8}>
              <Ionicons name="close-circle" size={20} color={c.textMuted} />
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
                    onRemove={() => handleRemoveRecentSearch(term)}
                    styles={styles}
                    c={c}
                  />
                ))}
              </View>
            )}

            <View style={styles.section}>
              <ThemedText style={styles.sectionTitle}>All Services</ThemedText>
              {CATEGORIES.map((category) => (
                <CategoryListItem
                  key={category.id}
                  category={category}
                  onPress={() => handleSelectCategory(category)}
                  styles={styles}
                  c={c}
                />
              ))}
            </View>
          </>
        )}

        {hasQuery && hasServiceResults && (
          <View style={styles.section}>
            <ThemedText style={styles.sectionTitle}>Services</ThemedText>
            {results.map((item) => (
              <ServiceResultItem
                key={`${item.category}:${item.service}`}
                item={item}
                onPress={() => handleSelectService(item.category, item.service)}
                styles={styles}
                c={c}
              />
            ))}
          </View>
        )}

        {hasQuery && hasTradeResults && (
          <View style={styles.section}>
            <ThemedText style={styles.sectionTitle}>Trades</ThemedText>
            {tradeResults.map((trade) => (
              <TradeResultItem
                key={trade.id}
                trade={trade}
                onPress={() => handleSelectTrade(trade)}
                styles={styles}
                c={c}
              />
            ))}
          </View>
        )}

        {/* No results state */}
        {hasQuery && !hasResults && (
          <View style={styles.section}>
            <ThemedText style={styles.noResults}>
              No services or trades found
            </ThemedText>
            <View style={styles.divider} />
            <Pressable
              style={({ pressed }) => [
                styles.describeOption,
                pressed && styles.describePressed,
              ]}
              onPress={handleDescribeProblem}
            >
              <ThemedText style={styles.describeIcon}>📝</ThemedText>
              <ThemedText style={styles.describeText}>
                Describe your problem instead
              </ThemedText>
            </Pressable>
          </View>
        )}
      </ScrollView>

    </ThemedView>
  );
}

function makeStyles(c, dark) {
  return StyleSheet.create({
  container: {
    flex: 1,
    // Themed by ThemedView — but set explicitly too so the modal
    // doesn't flash white before ThemedView hydrates.
    backgroundColor: c.background,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: c.border,
  },
  searchContainer: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: c.elevate,
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 44,
    gap: 8,
  },
  input: {
    flex: 1,
    fontFamily: FontFamily.bodyRegular,
    fontSize: 16,
    color: c.text,
  },
  cancelButton: {
    padding: 4,
  },
  cancelText: {
    fontFamily: FontFamily.headerSemibold,
    fontSize: 16,
    color: Colors.primary,
  },
  content: {
    flex: 1,
  },
  section: {
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  sectionTitle: {
    fontFamily: FontFamily.headerBold,
    fontSize: 11,
    color: c.textMuted,
    textTransform: "uppercase",
    letterSpacing: 1.2,
    marginBottom: 8,
  },
  // Recent search item
  recentItemRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  recentItem: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    gap: 12,
  },
  recentItemPressed: {
    opacity: 0.7,
  },
  recentText: {
    fontFamily: FontFamily.bodyRegular,
    fontSize: 16,
    color: c.text,
  },
  recentRemoveButton: {
    padding: 8,
  },
  recentRemovePressed: {
    opacity: 0.5,
  },
  // Category list item
  categoryItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: c.border,
  },
  categoryItemPressed: {
    backgroundColor: c.elevate,
  },
  categoryIconImage: {
    width: 24,
    height: 24,
    marginRight: 12,
  },
  // Icon tile — fixed light fill that stays light in dark mode too so
  // the category / service icon (which is a black-line asset) is
  // always readable. 36px rounded square, 22px icon inside.
  iconTile: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: "#F3F4F6",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  iconTileImage: {
    width: 22,
    height: 22,
  },
  categoryName: {
    flex: 1,
    fontFamily: FontFamily.bodyMedium,
    fontSize: 16,
    color: c.text,
  },
  // Search result item
  resultItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: c.border,
  },
  resultItemPressed: {
    backgroundColor: c.elevate,
  },
  resultIconImage: {
    width: 24,
    height: 24,
    marginRight: 12,
  },
  resultText: {
    flex: 1,
  },
  resultService: {
    fontFamily: FontFamily.headerSemibold,
    fontSize: 16,
    color: c.text,
  },
  resultCategory: {
    fontFamily: FontFamily.bodyRegular,
    fontSize: 13,
    color: c.textMid,
    marginTop: 2,
  },
  // No results
  noResults: {
    fontFamily: FontFamily.bodyRegular,
    fontSize: 16,
    color: c.textMid,
    textAlign: "center",
    paddingVertical: 20,
  },
  // Trade result item
  tradeItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: c.border,
    gap: 12,
  },
  tradeItemPressed: {
    backgroundColor: c.elevate,
  },
  tradeAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: c.elevate,
  },
  tradeAvatarPlaceholder: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: c.elevate,
    borderWidth: 1,
    borderColor: c.border,
    alignItems: "center",
    justifyContent: "center",
  },
  tradeInfo: {
    flex: 1,
  },
  tradeName: {
    fontFamily: FontFamily.headerSemibold,
    fontSize: 16,
    color: c.text,
  },
  tradeSubtitle: {
    fontFamily: FontFamily.bodyRegular,
    fontSize: 13,
    color: c.textMid,
    marginTop: 2,
  },
  tradeLocation: {
    fontFamily: FontFamily.bodyRegular,
    fontSize: 12,
    color: c.textMuted,
    marginTop: 2,
  },
  // Divider
  divider: {
    height: 1,
    backgroundColor: c.border,
    marginVertical: 8,
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
    fontFamily: FontFamily.bodyRegular,
    fontSize: 16,
    color: c.textMid,
  },
  });
}
