// StripeRow — list row with an optional 3px coloured bar on the left.
// This is the row style used inside Panels for quote / request / schedule
// lists. The stripe is where status colour earns its keep; the rest of
// the row stays neutral.

import React from "react";
import { View, Pressable, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../../hooks/useTheme";
import { TypeVariants } from "../../constants/Typography";
import ThemedText from "../ThemedText";

export default function StripeRow({
  stripeColor,
  title,
  subtitle,
  trailing,
  leading,
  onPress,
  dense = false,
  muted = false,
  strike = false,
  showChevron = false,
  style,
}) {
  const { colors: c } = useTheme();
  const Wrap = onPress ? Pressable : View;

  return (
    <Wrap
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        { paddingVertical: dense ? 10 : 12 },
        pressed && onPress && { backgroundColor: c.elevate2 },
        style,
      ]}
    >
      {stripeColor ? (
        <View style={[styles.stripe, { backgroundColor: stripeColor }]} />
      ) : (
        <View style={styles.stripeSpacer} />
      )}
      {leading}
      <View style={styles.textWrap}>
        <ThemedText
          style={{
            ...TypeVariants.bodyStrong,
            color: muted ? c.textMid : c.text,
            textDecorationLine: strike ? "line-through" : "none",
          }}
          numberOfLines={1}
        >
          {title}
        </ThemedText>
        {subtitle ? (
          <ThemedText
            style={{
              ...TypeVariants.captionMuted,
              color: c.textMuted,
              marginTop: 2,
            }}
            numberOfLines={1}
          >
            {subtitle}
          </ThemedText>
        ) : null}
      </View>
      {trailing}
      {showChevron && (
        <Ionicons
          name="chevron-forward"
          size={16}
          color={c.textMuted}
          style={{ marginLeft: 4 }}
        />
      )}
    </Wrap>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 14,
  },
  stripe: {
    width: 3,
    alignSelf: "stretch",
    borderRadius: 2,
    marginVertical: 2,
  },
  stripeSpacer: {
    width: 3,
  },
  textWrap: {
    flex: 1,
    minWidth: 0,
  },
});
