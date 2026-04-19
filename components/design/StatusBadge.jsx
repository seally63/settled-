// StatusBadge — uppercase label with a 6px status dot.
// Flat, no fill. The only colour on the row.

import React from "react";
import { View, StyleSheet } from "react-native";
import { useTheme } from "../../hooks/useTheme";
import { Colors } from "../../constants/Colors";
import { TypeVariants } from "../../constants/Typography";
import ThemedText from "../ThemedText";

const PRESETS = {
  pending:   { dot: Colors.status.pending,   label: "Awaiting" },
  awaiting:  { dot: Colors.status.pending,   label: "Awaiting" },
  quoted:    { dot: Colors.status.quoted,    label: "Quoted" },
  accepted:  { dot: Colors.status.accepted,  label: "Accepted" },
  declined:  { dot: Colors.status.declined,  label: "Declined" },
  expired:   { dot: Colors.status.declined,  label: "Expired" },
  scheduled: { dot: Colors.status.scheduled, label: "Scheduled" },
  in_progress: { dot: Colors.status.scheduled, label: "In progress" },
  completed: { dot: Colors.status.accepted,  label: "Completed" },
  draft:     { dot: null,                    label: "Draft" },
};

export default function StatusBadge({ state, label, dotColor, size = "md", style }) {
  const { colors: c } = useTheme();
  const preset = PRESETS[state] || {};
  const resolvedDot = dotColor ?? preset.dot ?? c.textMuted;
  const resolvedLabel = label ?? preset.label ?? (state ? String(state) : "");

  const fontSize = size === "sm" ? 10.5 : 11.5;

  return (
    <View style={[styles.row, style]}>
      <View style={[styles.dot, { backgroundColor: resolvedDot }]} />
      <ThemedText
        style={{
          ...TypeVariants.eyebrow,
          fontSize,
          letterSpacing: 0.8,
          color: c.textMid,
        }}
      >
        {resolvedLabel}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
});
