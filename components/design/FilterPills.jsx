// components/design/FilterPills.jsx
// Horizontal pill-row filter. Active pill = solid dark (c.text bg / c.bg fg).
// Inactive pill = subtle chip bg. Each option may carry a numeric count
// badge rendered as a tiny oval to the right of the label.
//
// Matches the Settled redesign spec's pill pattern used on both
// Projects screens (client + trade).

import React from "react";
import { ScrollView, Pressable, View, StyleSheet } from "react-native";
import ThemedText from "../ThemedText";
import { useTheme } from "../../hooks/useTheme";
import { FontFamily, Radius } from "../../constants/Typography";

export default function FilterPills({ value, onChange, options = [] }) {
  const { colors: c } = useTheme();
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.row}
    >
      {options.map((opt) => {
        const on = value === opt.key;
        return (
          <Pressable
            key={opt.key}
            onPress={() => onChange?.(opt.key)}
            style={({ pressed }) => [
              styles.pill,
              {
                backgroundColor: on ? c.text : c.chipBg,
                opacity: pressed ? 0.7 : 1,
              },
            ]}
          >
            <ThemedText
              style={{
                fontFamily: FontFamily.headerSemibold,
                fontSize: 12.5,
                letterSpacing: -0.1,
                color: on ? c.bg : c.textMid,
              }}
            >
              {opt.label}
            </ThemedText>
            {opt.count != null && opt.count > 0 ? (
              <View
                style={[
                  styles.countBadge,
                  {
                    backgroundColor: on
                      ? "rgba(0,0,0,0.12)"
                      : c.elevate2,
                  },
                ]}
              >
                <ThemedText
                  style={{
                    fontFamily: FontFamily.headerBold,
                    fontSize: 10.5,
                    letterSpacing: 0,
                    color: on ? c.bg : c.textMuted,
                    lineHeight: 12,
                  }}
                >
                  {opt.count}
                </ThemedText>
              </View>
            ) : null}
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 4,
    gap: 8,
  },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: Radius.pill,
    flexShrink: 0,
  },
  countBadge: {
    minWidth: 16,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: Radius.pill,
    alignItems: "center",
    justifyContent: "center",
  },
});
