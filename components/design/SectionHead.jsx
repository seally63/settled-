// SectionHead — "Schedule ›" style section label with optional trailing slot.
// Sits above a Panel or plain list. Tappable when onPress is provided.

import React from "react";
import { View, Pressable, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../../hooks/useTheme";
import { TypeVariants, Spacing } from "../../constants/Typography";
import ThemedText from "../ThemedText";

export default function SectionHead({ title, onPress, trailing, chevron = true, style }) {
  const { colors: c } = useTheme();
  const Wrap = onPress ? Pressable : View;

  return (
    <View style={[styles.row, style]}>
      <Wrap
        onPress={onPress}
        hitSlop={6}
        style={({ pressed }) => [styles.titleWrap, pressed && { opacity: 0.6 }]}
      >
        <ThemedText
          style={{
            ...TypeVariants.h2,
            color: c.text,
          }}
        >
          {title}
        </ThemedText>
        {chevron && (
          <Ionicons
            name="chevron-forward"
            size={16}
            color={c.textMuted}
            style={{ marginLeft: 2, marginTop: 1 }}
          />
        )}
      </Wrap>
      <View style={{ flex: 1 }} />
      {trailing}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.sm + 2,
    gap: 4,
  },
  titleWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
});
