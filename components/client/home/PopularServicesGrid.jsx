// components/client/home/PopularServicesGrid.jsx
// Horizontal scrolling grid of service categories — flat hairline-border
// cards, no shadow, theme-aware.
import React from "react";
import { View, FlatList, Pressable, StyleSheet, Image } from "react-native";
import ThemedText from "../../ThemedText";
import { getCategoryIcon, defaultCategoryIcon } from "../../../assets/icons";
import { useTheme } from "../../../hooks/useTheme";
import { Colors } from "../../../constants/Colors";
import { TypeVariants, Radius } from "../../../constants/Typography";

// Hardcoded categories with service types
// Icons are now PNG files loaded from assets/icons/categories/
export const CATEGORIES = [
  { id: "plumbing",   name: "Plumbing",
    services: ["Leak or drip", "Blocked drain", "Toilet problem", "Boiler / heating", "New installation", "Something else"] },
  { id: "electrical", name: "Electrical",
    services: ["Socket or switch issue", "Lighting problem", "Fuse box / consumer unit", "Rewiring", "New installation", "Something else"] },
  { id: "bathroom",   name: "Bathroom",
    services: ["Full bathroom refit", "Shower installation", "Bath installation", "Tiling", "Plumbing work", "Something else"] },
  { id: "kitchen",    name: "Kitchen",
    services: ["Full kitchen refit", "Appliance installation", "Worktop replacement", "Cabinet fitting", "Tiling / splashback", "Something else"] },
  { id: "cleaning",   name: "Cleaning",
    services: ["Deep clean", "End of tenancy", "Carpet cleaning", "Window cleaning", "Regular cleaning", "Something else"] },
  { id: "handyman",   name: "Handyman",
    services: ["Furniture assembly", "Painting / decorating", "Shelving / mounting", "Door / window repair", "General repairs", "Something else"] },
];

const CARD_WIDTH = 92;
const CARD_HEIGHT = 96;
const GAP = 10;

function CategoryCard({ category, onPress }) {
  const { colors: c, dark } = useTheme();
  const iconSource = getCategoryIcon(category.name) || defaultCategoryIcon;

  return (
    <Pressable
      style={({ pressed }) => [
        styles.card,
        {
          backgroundColor: c.elevate,
          borderColor: c.border,
        },
        pressed && {
          backgroundColor: c.elevate2,
          borderColor: Colors.primary,
        },
      ]}
      onPress={() => onPress(category)}
      accessibilityLabel={`${category.name} services`}
      accessibilityRole="button"
    >
      <Image
        source={iconSource}
        style={[
          styles.iconImage,
          // Outline PNGs are black — invert in dark mode so strokes read.
          dark && { tintColor: c.text },
        ]}
        resizeMode="contain"
      />
      <ThemedText
        style={[TypeVariants.caption, { color: c.text, fontWeight: "500" }]}
        numberOfLines={1}
      >
        {category.name}
      </ThemedText>
    </Pressable>
  );
}

export default function PopularServicesGrid({ onCategorySelect }) {
  const { colors: c } = useTheme();
  return (
    <View style={styles.container}>
      <ThemedText
        style={[
          TypeVariants.h2,
          { color: c.text, marginBottom: 12 },
        ]}
      >
        Popular services
      </ThemedText>
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
    marginBottom: 28,
  },
  listContent: {
    paddingRight: 16,
  },
  card: {
    width: CARD_WIDTH,
    height: CARD_HEIGHT,
    borderRadius: Radius.md + 2,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    paddingHorizontal: 8,
    gap: 6,
  },
  iconImage: {
    width: 30,
    height: 30,
  },
});
