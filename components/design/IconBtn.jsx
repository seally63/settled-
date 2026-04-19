// IconBtn — 36x36 circular icon button, hairline border on the elevate
// surface. Sits in the top-right of the AppHeader (bell + more).

import React from "react";
import { View, Pressable, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../../hooks/useTheme";
import { Colors } from "../../constants/Colors";

export default function IconBtn({
  icon,
  onPress,
  badge = false,
  size = 36,
  iconSize = 17,
  children,
  style,
  testID,
}) {
  const { colors: c } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      hitSlop={6}
      testID={testID}
      style={({ pressed }) => [
        styles.btn,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: c.elevate,
          borderColor: c.border,
        },
        pressed && { opacity: 0.6 },
        style,
      ]}
    >
      {children ?? (icon ? <Ionicons name={icon} size={iconSize} color={c.text} /> : null)}
      {badge && (
        <View
          style={[
            styles.badge,
            { backgroundColor: Colors.status.declined, borderColor: c.elevate },
          ]}
        />
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: {
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    position: "relative",
  },
  badge: {
    position: "absolute",
    top: 6,
    right: 6,
    width: 7,
    height: 7,
    borderRadius: 4,
    borderWidth: 2,
  },
});
