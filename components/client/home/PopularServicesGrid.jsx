// components/client/home/PopularServicesGrid.jsx
// Horizontal scrolling grid of service categories
import { View, FlatList, Pressable, StyleSheet, Dimensions } from "react-native";
import ThemedText from "../../ThemedText";

const { width: SCREEN_WIDTH } = Dimensions.get("window");

// Hardcoded categories with emojis and service types
export const CATEGORIES = [
  {
    id: "plumbing",
    name: "Plumbing",
    icon: "🔧",
    services: [
      "Leak or drip",
      "Blocked drain",
      "Toilet problem",
      "Boiler / heating",
      "New installation",
      "Something else",
    ],
  },
  {
    id: "electrical",
    name: "Electrical",
    icon: "⚡",
    services: [
      "Socket or switch issue",
      "Lighting problem",
      "Fuse box / consumer unit",
      "Rewiring",
      "New installation",
      "Something else",
    ],
  },
  {
    id: "bathroom",
    name: "Bathroom",
    icon: "🚿",
    services: [
      "Full bathroom refit",
      "Shower installation",
      "Bath installation",
      "Tiling",
      "Plumbing work",
      "Something else",
    ],
  },
  {
    id: "kitchen",
    name: "Kitchen",
    icon: "🍳",
    services: [
      "Full kitchen refit",
      "Appliance installation",
      "Worktop replacement",
      "Cabinet fitting",
      "Tiling / splashback",
      "Something else",
    ],
  },
  {
    id: "cleaning",
    name: "Cleaning",
    icon: "✨",
    services: [
      "Deep clean",
      "End of tenancy",
      "Carpet cleaning",
      "Window cleaning",
      "Regular cleaning",
      "Something else",
    ],
  },
  {
    id: "handyman",
    name: "Handyman",
    icon: "🛠️",
    services: [
      "Furniture assembly",
      "Painting / decorating",
      "Shelving / mounting",
      "Door / window repair",
      "General repairs",
      "Something else",
    ],
  },
];

// Card dimensions - sized to fit longest label "Handyman"
const CARD_WIDTH = 90;
const CARD_HEIGHT = 92;
const GAP = 10;

function CategoryCard({ category, onPress }) {
  return (
    <Pressable
      style={({ pressed }) => [
        styles.card,
        pressed && styles.cardPressed,
      ]}
      onPress={() => onPress(category)}
      accessibilityLabel={`${category.name} services`}
      accessibilityRole="button"
    >
      <ThemedText style={styles.emoji}>{category.icon}</ThemedText>
      <ThemedText style={styles.label} numberOfLines={1}>
        {category.name}
      </ThemedText>
    </Pressable>
  );
}

export default function PopularServicesGrid({ onCategorySelect }) {
  return (
    <View style={styles.container}>
      <ThemedText style={styles.sectionTitle}>Popular Services</ThemedText>
      <FlatList
        data={CATEGORIES}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.listContent}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <CategoryCard category={item} onPress={onCategorySelect} />
        )}
        snapToInterval={CARD_WIDTH + GAP}
        decelerationRate="fast"
        ItemSeparatorComponent={() => <View style={{ width: GAP }} />}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#1F2937",
    marginBottom: 12,
  },
  listContent: {
    paddingRight: 16,
  },
  card: {
    width: CARD_WIDTH,
    height: CARD_HEIGHT,
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    paddingHorizontal: 8,
    // Shadow for iOS
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    // Shadow for Android
    elevation: 2,
  },
  cardPressed: {
    backgroundColor: "#F9FAFB",
    borderColor: "#6849a7",
  },
  emoji: {
    fontSize: 32,
    marginBottom: 6,
  },
  label: {
    fontSize: 12,
    fontWeight: "500",
    color: "#374151",
    textAlign: "center",
  },
});
