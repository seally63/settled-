// components/client/home/SearchBar.jsx
// Flat elevated search bar — hairline border, DM Sans placeholder.
import React from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import ThemedText from "../../ThemedText";
import { useTheme } from "../../../hooks/useTheme";
import { Colors } from "../../../constants/Colors";
import { FontFamily, Radius } from "../../../constants/Typography";

export default function SearchBar({ onPress }) {
  const { colors: c } = useTheme();
  return (
    <Pressable
      style={({ pressed }) => [
        styles.container,
        {
          backgroundColor: c.elevate,
          borderColor: c.border,
        },
        pressed && { borderColor: Colors.primary },
      ]}
      onPress={onPress}
      accessibilityLabel="Search for a service"
      accessibilityRole="button"
    >
      <View style={styles.inner}>
        <Ionicons name="search" size={20} color={c.textMuted} />
        <ThemedText style={[styles.placeholder, { color: c.textMuted }]}>
          Search for a service or business…
        </ThemedText>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    height: 52,
    borderRadius: Radius.lg,
    borderWidth: 1,
    marginBottom: 24,
  },
  inner: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    gap: 12,
  },
  placeholder: {
    fontSize: 15,
    fontFamily: FontFamily.bodyRegular,
  },
});
