// components/design/ProjectRow.jsx
// Flat row used on both Projects tabs. Matches the redesign spec's
// ClientProjectRow / TradeProjectRow shape:
//
//   [3px coloured stripe] [38x38 icon square] [title + subtitle + status
//    label w/ dot]                                  [right: primary + sub]
//
// Props:
//   stripeColor   — status colour (hex) for the left stripe + label dot
//   statusLabel   — uppercase label e.g. "Awaiting quotes" / "Quote sent"
//   title         — row headline
//   subtitle      — plain grey sub
//   iconSource    — RN require()'d image (service-type PNG)
//   rightTop      — bold right-column value (e.g. "£1,840" or "4 quotes")
//   rightBot      — smaller right-column line (e.g. "Deposit paid")
//   fresh         — shows an inline "NEW" pill next to the title
//   muted         — renders the whole row at 0.75 opacity (expired/declined)
//   onPress

import React from "react";
import { View, Pressable, Image, StyleSheet } from "react-native";
import ThemedText from "../ThemedText";
import { useTheme } from "../../hooks/useTheme";
import { Colors } from "../../constants/Colors";
import { FontFamily, Radius } from "../../constants/Typography";

export default function ProjectRow({
  stripeColor,
  statusLabel,
  title,
  subtitle,
  iconSource,
  rightTop,
  rightBot,
  fresh = false,
  muted = false,
  onPress,
}) {
  const { colors: c, dark } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        { opacity: muted ? 0.75 : 1 },
        pressed && { backgroundColor: c.elevate2 },
      ]}
    >
      <View
        style={[
          styles.stripe,
          { backgroundColor: stripeColor || c.textFaint },
        ]}
      />
      <View style={[styles.iconBox, { backgroundColor: c.elevate2 }]}>
        {iconSource ? (
          <Image
            source={iconSource}
            style={[
              styles.iconImage,
              dark && { tintColor: c.text },
            ]}
            resizeMode="contain"
          />
        ) : null}
      </View>

      <View style={styles.titleCol}>
        <View style={styles.titleRow}>
          <ThemedText
            style={[
              styles.titleText,
              // Explicit color — title MUST render in both themes.
              { color: c.text, flex: 1 },
            ]}
            numberOfLines={1}
          >
            {title || ""}
          </ThemedText>
          {fresh ? (
            <View style={[styles.newPill, { backgroundColor: Colors.primaryTint }]}>
              <ThemedText
                style={{
                  fontSize: 9,
                  fontFamily: FontFamily.headerBold,
                  color: Colors.primary,
                  letterSpacing: 0.6,
                }}
              >
                NEW
              </ThemedText>
            </View>
          ) : null}
        </View>
        {!!subtitle && (
          <ThemedText
            style={[styles.subText, { color: c.textMuted }]}
            numberOfLines={1}
          >
            {subtitle}
          </ThemedText>
        )}
        {!!statusLabel && (
          <View style={styles.statusRow}>
            <View
              style={[
                styles.statusDot,
                { backgroundColor: stripeColor || c.textMuted },
              ]}
            />
            <ThemedText
              style={{
                fontSize: 10,
                fontFamily: FontFamily.headerBold,
                letterSpacing: 0.6,
                textTransform: "uppercase",
                color: muted ? c.textMuted : stripeColor || c.textMuted,
              }}
              numberOfLines={1}
            >
              {statusLabel}
            </ThemedText>
          </View>
        )}
      </View>

      {(rightTop || rightBot) ? (
        <View style={styles.rightCol}>
          {!!rightTop && (
            <ThemedText
              style={{
                fontFamily: FontFamily.headerBold,
                fontSize: 13.5,
                letterSpacing: -0.2,
                color: c.text,
              }}
              numberOfLines={1}
            >
              {rightTop}
            </ThemedText>
          )}
          {!!rightBot && (
            <ThemedText
              style={{
                fontSize: 11,
                color: c.textMuted,
                textAlign: "right",
                fontFamily: FontFamily.bodyRegular,
                marginTop: 3,
              }}
              numberOfLines={1}
            >
              {rightBot}
            </ThemedText>
          )}
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "stretch",
    paddingVertical: 14,
    paddingLeft: 17,
    paddingRight: 20,
    gap: 0,
  },
  stripe: {
    width: 3,
    borderRadius: 2,
    flexShrink: 0,
  },
  iconBox: {
    width: 38,
    height: 38,
    borderRadius: Radius.sm + 2,
    marginLeft: 13,
    alignSelf: "center",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  iconImage: {
    width: 20,
    height: 20,
  },
  titleCol: {
    flex: 1,
    minWidth: 0,
    paddingLeft: 12,
    paddingRight: 10,
    alignSelf: "center",
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  titleText: {
    fontFamily: FontFamily.bodyMedium,
    fontSize: 15,
    lineHeight: 19,
  },
  newPill: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  subText: {
    fontSize: 12,
    marginTop: 3,
    lineHeight: 16,
  },
  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 6,
  },
  statusDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
  },
  rightCol: {
    alignItems: "flex-end",
    justifyContent: "center",
    flexShrink: 0,
    minWidth: 68,
  },
});
