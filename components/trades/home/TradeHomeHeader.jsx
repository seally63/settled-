// components/trades/home/TradeHomeHeader.jsx
// Big "Today" display title + date·jobs line + "Available" pill on the
// right. Matches the Settled redesign spec for trade home top.

import React from "react";
import { View, StyleSheet } from "react-native";
import ThemedText from "../../ThemedText";
import { useTheme } from "../../../hooks/useTheme";
import { Colors } from "../../../constants/Colors";
import { TypeVariants, FontFamily } from "../../../constants/Typography";

function formatTodayLine(jobCount) {
  const today = new Date();
  const dateStr = today.toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
  if (jobCount == null) return dateStr;
  const word = jobCount === 1 ? "job" : "jobs";
  return `${dateStr} · ${jobCount} ${word}`;
}

export default function TradeHomeHeader({ jobCount = 0, availableLabel = "Available" }) {
  const { colors: c } = useTheme();
  return (
    <View style={styles.container}>
      <View style={{ flex: 1 }}>
        <ThemedText
          style={[
            TypeVariants.displayXL,
            { color: c.text, fontSize: 32, lineHeight: 34 },
          ]}
        >
          Today
        </ThemedText>
        <ThemedText
          style={[
            TypeVariants.body,
            { color: c.textMid, marginTop: 4, fontSize: 13, lineHeight: 18 },
          ]}
        >
          {formatTodayLine(jobCount)}
        </ThemedText>
      </View>

      <View
        style={[
          styles.pill,
          { borderColor: c.borderStrong },
        ]}
      >
        <View
          style={[styles.dot, { backgroundColor: Colors.status.accepted }]}
        />
        <ThemedText
          style={{
            fontSize: 11,
            fontFamily: FontFamily.headerBold,
            letterSpacing: 0.8,
            color: c.textMuted,
            textTransform: "uppercase",
          }}
        >
          {availableLabel}
        </ThemedText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 20,
    paddingTop: 4,
    paddingBottom: 6,
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 12,
  },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    marginBottom: 4,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
});
