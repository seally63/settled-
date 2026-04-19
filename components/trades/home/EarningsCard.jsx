// components/trades/home/EarningsCard.jsx
// Redesign's "This month" earnings card — eyebrow label, big £ value,
// optional vs-last-month delta, and a mini bar chart on the right.

import React from "react";
import { View, Pressable, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import ThemedText from "../../ThemedText";
import { useTheme } from "../../../hooks/useTheme";
import { Colors } from "../../../constants/Colors";
import { FontFamily, Radius } from "../../../constants/Typography";

function formatCurrency(n) {
  if (n == null || isNaN(n)) return "£0";
  return `£${Number(n).toLocaleString("en-GB", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })}`;
}

function MiniChart({ values = [] }) {
  const { dark } = useTheme();
  if (!values.length) return null;
  const max = Math.max(...values, 1);
  const H = 56, barW = 6;
  return (
    <View style={[chartStyles.row, { height: H }]}>
      {values.map((v, i) => {
        const h = Math.max(3, (v / max) * (H - 6));
        const isLast = i === values.length - 1;
        return (
          <View
            key={i}
            style={{
              width: barW,
              height: h,
              borderRadius: 2,
              backgroundColor: isLast
                ? Colors.primary
                : dark
                ? "rgba(255,255,255,0.12)"
                : "rgba(15,15,20,0.1)",
            }}
          />
        );
      })}
    </View>
  );
}

const chartStyles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 4,
  },
});

export default function EarningsCard({
  earnedThisMonth,
  earnedLastMonth,      // optional — enables delta %
  trend,                // optional — array of weekly/daily values for chart
  onPress,
}) {
  const { colors: c } = useTheme();

  let deltaText = null;
  let deltaPositive = true;
  if (
    typeof earnedThisMonth === "number" &&
    typeof earnedLastMonth === "number" &&
    earnedLastMonth > 0
  ) {
    const pct = ((earnedThisMonth - earnedLastMonth) / earnedLastMonth) * 100;
    deltaPositive = pct >= 0;
    deltaText = `${deltaPositive ? "+" : ""}${pct.toFixed(0)}%`;
  }

  // Fallback trend — a flat stub so the chart still has shape when
  // we don't have real series data yet.
  const chartValues =
    trend && trend.length >= 3
      ? trend
      : typeof earnedThisMonth === "number" && earnedThisMonth > 0
      ? [4, 6, 5, 8, 7, 10, 9, 12, 11, Math.max(8, Math.min(14, Math.floor(earnedThisMonth / 1000)))]
      : [];

  const Wrapper = onPress ? Pressable : View;

  return (
    <View style={styles.wrap}>
      <Wrapper
        onPress={onPress}
        style={({ pressed }) => [
          styles.card,
          { backgroundColor: c.elevate, borderColor: c.border },
          pressed && { opacity: 0.7 },
        ]}
      >
        <View style={{ flex: 1 }}>
          <ThemedText
            style={{
              fontSize: 11,
              fontFamily: FontFamily.headerBold,
              letterSpacing: 0.8,
              color: c.textMuted,
              textTransform: "uppercase",
            }}
          >
            This month
          </ThemedText>
          <ThemedText
            style={{
              fontFamily: FontFamily.headerBold,
              fontSize: 30,
              letterSpacing: -1,
              color: c.text,
              marginTop: 6,
              lineHeight: 32,
            }}
          >
            {formatCurrency(earnedThisMonth || 0)}
          </ThemedText>
          {deltaText ? (
            <View style={styles.deltaRow}>
              <Ionicons
                name={deltaPositive ? "arrow-up-outline" : "arrow-down-outline"}
                size={12}
                color={deltaPositive ? Colors.status.accepted : Colors.status.declined}
              />
              <ThemedText
                style={{
                  fontSize: 12,
                  fontFamily: FontFamily.headerSemibold,
                  color: deltaPositive ? Colors.status.accepted : Colors.status.declined,
                }}
              >
                {deltaText}
              </ThemedText>
              <ThemedText
                style={{
                  fontSize: 12,
                  fontFamily: FontFamily.bodyRegular,
                  color: c.textMid,
                }}
              >
                vs last month
              </ThemedText>
            </View>
          ) : null}
        </View>
        <MiniChart values={chartValues} />
      </Wrapper>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingHorizontal: 16,
    paddingTop: 20,
  },
  card: {
    borderRadius: Radius.lg,
    borderWidth: 1,
    padding: 18,
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
  },
  deltaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 6,
  },
});
