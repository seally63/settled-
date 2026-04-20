// components/design/WizardHeader.jsx
// Sticky header for multi-step wizards (Client request create,
// Trade quote builder, etc.). Layout:
//
//   [Back]   Step N of M · Title   [Close]
//   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  ← progress bar, N/M filled
//
// Title is short, uppercase-free, Public Sans semibold. The "Step N
// of M" pre-title gives an unambiguous progress read.

import React from "react";
import { View, Pressable, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import ThemedText from "../ThemedText";
import { useTheme } from "../../hooks/useTheme";
import { Colors } from "../../constants/Colors";
import { FontFamily } from "../../constants/Typography";

export default function WizardHeader({
  step = 1,
  totalSteps = 4,
  title,
  onBack,
  onClose,
  canGoBack = true,
}) {
  const { colors: c } = useTheme();

  return (
    <View style={[styles.wrap, { backgroundColor: c.background, borderColor: c.border }]}>
      <View style={styles.row}>
        {canGoBack ? (
          <Pressable onPress={onBack} hitSlop={10} style={styles.iconBtn}>
            <Ionicons name="chevron-back" size={24} color={c.text} />
          </Pressable>
        ) : (
          <View style={styles.iconBtn} />
        )}

        <View style={styles.titleCol}>
          <ThemedText
            style={{
              fontSize: 10.5,
              letterSpacing: 1.2,
              fontFamily: FontFamily.headerBold,
              color: c.textMuted,
              textTransform: "uppercase",
            }}
          >
            Step {step} of {totalSteps}
          </ThemedText>
          <ThemedText
            style={{
              fontSize: 17,
              fontFamily: FontFamily.headerBold,
              letterSpacing: -0.3,
              color: c.text,
              marginTop: 2,
            }}
            numberOfLines={1}
          >
            {title}
          </ThemedText>
        </View>

        {onClose ? (
          <Pressable onPress={onClose} hitSlop={10} style={styles.iconBtn}>
            <Ionicons name="close" size={22} color={c.text} />
          </Pressable>
        ) : (
          <View style={styles.iconBtn} />
        )}
      </View>

      <View style={[styles.progressTrack, { backgroundColor: c.elevate2 }]}>
        <View
          style={[
            styles.progressFill,
            {
              backgroundColor: Colors.primary,
              width: `${Math.min(100, Math.max(0, (step / totalSteps) * 100))}%`,
            },
          ]}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingTop: 10,
    paddingBottom: 0,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingBottom: 12,
    gap: 12,
  },
  iconBtn: {
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
  },
  titleCol: {
    flex: 1,
    alignItems: "center",
  },
  progressTrack: {
    height: 3,
    width: "100%",
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    borderRadius: 0,
  },
});
