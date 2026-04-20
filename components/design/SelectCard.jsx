// components/design/SelectCard.jsx
// Selection card used inside wizards. Per the redesign spec:
//   — flat hairline-border card
//   — selected state: single purple ring + small purple check circle
//     in the top-right
//   — works as a vertical-icon tile OR a horizontal icon+title row
//     via the `variant` prop
//
// Props:
//   selected   bool
//   title      short label
//   subtitle?  optional secondary line (row variant only)
//   iconSource RN require()'d image (the PNG icon)
//   variant    'tile' | 'row'   (default 'tile')
//   onPress

import React from "react";
import { View, Pressable, Image, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import ThemedText from "../ThemedText";
import { useTheme } from "../../hooks/useTheme";
import { Colors } from "../../constants/Colors";
import { FontFamily, Radius } from "../../constants/Typography";

export default function SelectCard({
  selected = false,
  title,
  subtitle,
  iconSource,
  variant = "tile",
  onPress,
  style,
}) {
  const { colors: c, dark } = useTheme();

  const borderColor = selected ? Colors.primary : c.border;
  const borderWidth = selected ? 2 : 1;

  if (variant === "row") {
    return (
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [
          styles.row,
          {
            backgroundColor: c.elevate,
            borderColor,
            borderWidth,
          },
          pressed && { backgroundColor: c.elevate2 },
          style,
        ]}
      >
        <View style={[styles.rowIconBox, { backgroundColor: c.elevate2 }]}>
          {iconSource ? (
            <Image
              source={iconSource}
              style={[styles.rowIcon, dark && { tintColor: c.text }]}
              resizeMode="contain"
            />
          ) : null}
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <ThemedText
            style={{
              fontSize: 15,
              fontFamily: FontFamily.headerSemibold,
              color: c.text,
              letterSpacing: -0.1,
            }}
            numberOfLines={1}
          >
            {title}
          </ThemedText>
          {!!subtitle && (
            <ThemedText
              style={{
                fontSize: 12,
                color: c.textMuted,
                marginTop: 2,
                fontFamily: FontFamily.bodyRegular,
              }}
              numberOfLines={1}
            >
              {subtitle}
            </ThemedText>
          )}
        </View>
        {selected ? <CheckBadge /> : (
          <Ionicons name="chevron-forward" size={18} color={c.textMuted} />
        )}
      </Pressable>
    );
  }

  // Tile variant (for category grid etc.)
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.tile,
        {
          backgroundColor: c.elevate,
          borderColor,
          borderWidth,
        },
        pressed && { backgroundColor: c.elevate2 },
        style,
      ]}
    >
      {iconSource ? (
        <Image
          source={iconSource}
          style={[styles.tileIcon, dark && { tintColor: c.text }]}
          resizeMode="contain"
        />
      ) : null}
      <ThemedText
        style={{
          fontSize: 13,
          fontFamily: FontFamily.headerSemibold,
          color: c.text,
          textAlign: "center",
          marginTop: 10,
        }}
        numberOfLines={2}
      >
        {title}
      </ThemedText>
      {selected ? (
        <View style={styles.tileCheckWrap}>
          <CheckBadge />
        </View>
      ) : null}
    </Pressable>
  );
}

function CheckBadge() {
  return (
    <View style={styles.checkBadge}>
      <Ionicons name="checkmark" size={12} color="#FFFFFF" />
    </View>
  );
}

const styles = StyleSheet.create({
  // Tile (square-ish)
  tile: {
    aspectRatio: 1,
    borderRadius: Radius.lg,
    alignItems: "center",
    justifyContent: "center",
    padding: 14,
    position: "relative",
  },
  tileIcon: {
    width: 36,
    height: 36,
  },
  tileCheckWrap: {
    position: "absolute",
    top: 10,
    right: 10,
  },

  // Row (wider, horizontal layout)
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: Radius.md + 2,
  },
  rowIconBox: {
    width: 40,
    height: 40,
    borderRadius: Radius.sm + 2,
    alignItems: "center",
    justifyContent: "center",
  },
  rowIcon: {
    width: 22,
    height: 22,
  },

  // Check badge (absolute in tile, inline in row)
  checkBadge: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: Colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
});
