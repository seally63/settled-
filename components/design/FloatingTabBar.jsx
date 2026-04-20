// FloatingTabBar — the redesign's signature element.
// Drop-in replacement for the default expo-router / react-navigation
// bottom tab bar: a blurred translucent pill with the active tab rendered
// as a brighter inner pill.
//
// Implementation notes:
// — The outer `wrap` is position: absolute so the screens container can
//   fill the full viewport with the pill floating over it. The wrap has
//   an explicit `height` because iOS UIView hit-testing clips to a
//   view's bounds — without a height, the wrap's native bounds were
//   reported as 0-height (tap ghost region) and inner Pressables were
//   never reached.
// — The pill is pushed well above the iOS home-indicator / edge-gesture
//   zone; taps placed inside the bottom ~40px of the screen are eaten
//   by the system before they reach React Native.
// — The BlurView renders as a pointer-transparent absolute backdrop
//   behind the tab row so touches go straight to the Pressables on top.
// — This component honours `tabBarStyle: { display: 'none' }` on the
//   currently focused route, so nested sub-pages (settings, chat, etc.)
//   can hide the floating bar via the Tabs.Screen options.

import React from "react";
import { View, Pressable, StyleSheet } from "react-native";
import { BlurView } from "expo-blur";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { getFocusedRouteNameFromRoute } from "@react-navigation/native";
import { useTheme } from "../../hooks/useTheme";

export default function FloatingTabBar({ state, descriptors, navigation }) {
  const { colors: c, dark } = useTheme();
  const insets = useSafeAreaInsets();
  const tint = dark ? "dark" : "light";

  // expo-router handles `href: null` on a Tabs.Screen by setting
  // `tabBarItemStyle: { display: 'none' }` (see
  // node_modules/expo-router/build/layouts/TabsClient.js). Mirror that
  // check so role-hidden tabs don't render.
  const isTabHidden = (options) => {
    const itemStyle = options.tabBarItemStyle;
    if (!itemStyle) return false;
    const flat = Array.isArray(itemStyle)
      ? Object.assign({}, ...itemStyle.filter(Boolean))
      : itemStyle;
    return flat?.display === "none";
  };

  // Hide the whole bar on nested sub-routes (e.g. /profile/settings,
  // /messages/[id], /quotes/[id]/edit). We read the focused tab's
  // nested-child route name directly — doing this inside the tab bar
  // lets Tabs.Screen `options` stay plain object literals, which is
  // required for expo-router's `href: null` → hide-tab shortcut to work.
  const focusedRoute = state.routes[state.index];
  const focusedChild = getFocusedRouteNameFromRoute(focusedRoute) ?? "index";
  if (focusedChild !== "index") return null;

  const visibleRoutes = state.routes
    .map((route, index) => ({ route, index }))
    .filter(({ route }) => !isTabHidden(descriptors[route.key].options));

  return (
    <View
      style={[
        styles.wrap,
        // Pill sits well above the iOS home-indicator / edge-swipe zone.
        // Values lower than ~60-70 cause iOS to swallow taps on an
        // iPhone 16-class device before they reach React Native. 80+
        // is the verified-safe floor.
        { bottom: Math.max(insets.bottom + 46, 80) },
      ]}
      pointerEvents="box-none"
    >
      <View
        style={[
          styles.pillOuter,
          { shadowOpacity: dark ? 0.4 : 0.08, shadowColor: "#000" },
        ]}
        pointerEvents="box-none"
      >
        <View style={[styles.pill, { borderColor: c.borderStrong }]}>
          {/* Blurred translucent backdrop — pointer-transparent so taps
              pass straight through to the Pressables above. */}
          <BlurView
            intensity={80}
            tint={tint}
            experimentalBlurMethod="dimezisBlurView"
            pointerEvents="none"
            style={[
              StyleSheet.absoluteFillObject,
              {
                borderRadius: 999,
                overflow: "hidden",
                backgroundColor: dark
                  ? "rgba(20,20,24,0.35)"
                  : "rgba(255,255,255,0.45)",
              },
            ]}
          />
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
                accessibilityLabel={
                  options.tabBarAccessibilityLabel ??
                  (typeof label === "string" ? label : undefined)
                }
                testID={options.tabBarTestID}
                onPress={onPress}
                onLongPress={onLongPress}
                style={({ pressed }) => [
                  styles.tab,
                  isFocused && { backgroundColor: c.pillActive },
                  pressed && { opacity: 0.65 },
                ]}
                // Wider hit region + tighter press-cancel so small
                // finger drift doesn't drop the tap on iOS.
                hitSlop={10}
                pressRetentionOffset={20}
              >
                <View style={styles.iconWrap}>
                  {renderIcon
                    ? renderIcon({
                        focused: isFocused,
                        color: iconColor,
                        size: 22,
                      })
                    : null}
                </View>
              </Pressable>
            );
          })}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: "absolute",
    left: 0,
    right: 0,
    // Explicit height so iOS treats the whole region as hit-testable.
    height: 92,
    alignItems: "center",
    justifyContent: "flex-end",
    paddingHorizontal: 16,
    zIndex: 100,
    elevation: 100,
  },
  pillOuter: {
    shadowOffset: { width: 0, height: 8 },
    shadowRadius: 24,
    elevation: 12,
    borderRadius: 999,
  },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingVertical: 8,
    paddingHorizontal: 8,
    borderRadius: 999,
    borderWidth: 1,
    overflow: "hidden",
  },
  tab: {
    // Comfortable 48×48 tap target per tab (icon-only layout).
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 13,
    paddingHorizontal: 18,
    borderRadius: 999,
    minWidth: 48,
    minHeight: 48,
  },
  iconWrap: {
    height: 22,
    width: 22,
    alignItems: "center",
    justifyContent: "center",
  },
});
