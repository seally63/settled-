// FloatingTabBar — the redesign's signature element.
// Drop-in replacement for the default expo-router / react-navigation
// bottom tab bar: a blurred translucent pill with the active tab rendered
// as a brighter inner pill.
//
// Implementation notes:
// — The bar is NOT position:absolute. React Navigation measures its height
//   and applies that as bottom inset to scenes. So the outer View renders
//   normally in the layout; the pill is centered inside with a transparent
//   gutter so content underneath can be partially seen through the blur.
// — If you want a screen's content to scroll *under* the bar, give that
//   screen ~12–18px extra bottom padding beyond insets.bottom so the last
//   line isn't tight against the pill.

import React from "react";
import { View, Pressable, StyleSheet, Platform } from "react-native";
import { BlurView } from "expo-blur";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "../../hooks/useTheme";
import { FontFamily } from "../../constants/Typography";
import ThemedText from "../ThemedText";

export default function FloatingTabBar({ state, descriptors, navigation }) {
  const { colors: c, dark } = useTheme();
  const insets = useSafeAreaInsets();
  const tint = dark ? "dark" : "light";

  // expo-router handles `href: null` on a Tabs.Screen by setting
  // `tabBarItemStyle: { display: 'none' }` (see
  // node_modules/expo-router/build/layouts/TabsClient.js). We mirror that
  // check here — `tabBarButton` is set for every href-using tab (visible
  // or not), so it's not a reliable signal on its own.
  const isTabHidden = (options) => {
    const itemStyle = options.tabBarItemStyle;
    if (!itemStyle) return false;
    const flat = Array.isArray(itemStyle)
      ? Object.assign({}, ...itemStyle.filter(Boolean))
      : itemStyle;
    return flat?.display === "none";
  };

  const visibleRoutes = state.routes
    .map((route, index) => ({ route, index }))
    .filter(({ route }) => !isTabHidden(descriptors[route.key].options));

  return (
    <View
      style={[
        styles.wrap,
        {
          // Sit this many px above the home-indicator / nav inset.
          bottom: Math.max(insets.bottom, 12) + 8,
        },
      ]}
      pointerEvents="box-none"
    >
      <View
        style={[
          styles.pillOuter,
          {
            shadowOpacity: dark ? 0.4 : 0.08,
            shadowColor: "#000",
          },
        ]}
        pointerEvents="box-none"
      >
        <BlurView
          intensity={80}
          tint={tint}
          experimentalBlurMethod="dimezisBlurView"
          style={[
            styles.pill,
            {
              borderColor: c.borderStrong,
              // Very subtle tint on top of the blur for legibility —
              // the blur itself does the heavy lifting for the frosted
              // glass effect.
              backgroundColor: dark
                ? "rgba(20,20,24,0.35)"
                : "rgba(255,255,255,0.45)",
            },
          ]}
        >
          {visibleRoutes.map(({ route, index }) => {
            const { options } = descriptors[route.key];
            const isFocused = state.index === index;

            const label =
              options.tabBarLabel !== undefined
                ? options.tabBarLabel
                : options.title !== undefined
                ? options.title
                : route.name;

            const onPress = () => {
              const event = navigation.emit({
                type: "tabPress",
                target: route.key,
                canPreventDefault: true,
              });
              if (!isFocused && !event.defaultPrevented) {
                navigation.navigate(route.name, route.params);
              }
            };

            const onLongPress = () => {
              navigation.emit({ type: "tabLongPress", target: route.key });
            };

            const renderIcon = options.tabBarIcon;
            const iconColor = isFocused ? c.text : c.textMuted;

            return (
              <Pressable
                key={route.key}
                accessibilityRole="button"
                accessibilityState={isFocused ? { selected: true } : {}}
                accessibilityLabel={options.tabBarAccessibilityLabel}
                testID={options.tabBarTestID}
                onPress={onPress}
                onLongPress={onLongPress}
                style={({ pressed }) => [
                  styles.tab,
                  isFocused && { backgroundColor: c.pillActive },
                  pressed && { opacity: 0.65 },
                ]}
                hitSlop={4}
              >
                <View style={styles.iconWrap}>
                  {renderIcon
                    ? renderIcon({
                        focused: isFocused,
                        color: iconColor,
                        size: 20,
                      })
                    : null}
                </View>
                <ThemedText
                  style={[
                    styles.label,
                    {
                      color: iconColor,
                      fontFamily: isFocused
                        ? FontFamily.headerSemibold
                        : FontFamily.headerMedium,
                    },
                  ]}
                  numberOfLines={1}
                >
                  {label}
                </ThemedText>
              </Pressable>
            );
          })}
        </BlurView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    // Pulled out of flex flow so the screens container fills the full
    // viewport and the pill truly floats over it. `bottom` is set
    // dynamically in the render with the safe-area inset.
    position: "absolute",
    left: 0,
    right: 0,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
  },
  pillOuter: {
    // Drop shadow sits outside the blur so it survives translucency.
    // shadowColor + shadowOpacity set dynamically for light/dark above.
    shadowOffset: { width: 0, height: 8 },
    shadowRadius: 24,
    elevation: 12,
    borderRadius: 999,
  },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    paddingVertical: 6,
    paddingHorizontal: 6,
    borderRadius: 999,
    borderWidth: 1,
    overflow: "hidden",
  },
  tab: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 9,
    paddingHorizontal: 15,
    borderRadius: 999,
    minWidth: 60,
    gap: 2,
  },
  iconWrap: {
    height: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  label: {
    fontSize: 10.5,
    letterSpacing: 0.15,
    marginTop: 1,
  },
});
