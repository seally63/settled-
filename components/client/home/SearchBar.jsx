// components/client/home/SearchBar.jsx
// Presentational search bar that navigates to search modal on press
import { Pressable, StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import ThemedText from "../../ThemedText";

export default function SearchBar({ onPress }) {
  return (
    <Pressable
      style={({ pressed }) => [
        styles.container,
        pressed && styles.pressed,
      ]}
      onPress={onPress}
      accessibilityLabel="Search for a service"
      accessibilityRole="button"
    >
      <View style={styles.inner}>
        <Ionicons name="search" size={20} color="#9CA3AF" />
        <ThemedText style={styles.placeholder}>
          Search for a service...
        </ThemedText>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    height: 52,
    backgroundColor: "#F3F4F6",
    borderRadius: 12,
    borderWidth: 2,
    borderColor: "transparent",
    marginBottom: 24,
  },
  pressed: {
    borderColor: "#6849a7",
  },
  inner: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    gap: 12,
  },
  placeholder: {
    fontSize: 16,
    color: "#9CA3AF",
  },
});
