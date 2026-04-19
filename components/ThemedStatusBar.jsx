// components/ThemedStatusBar.jsx
// Drop-in replacement for expo-status-bar's <StatusBar /> that flips its
// icon colour based on the current theme:
//   dark theme  → light icons (visible on dark background)
//   light theme → dark icons  (visible on light background)
//
// Use anywhere you would have written
//   <StatusBar style="dark" />
//   <StatusBar style="dark" backgroundColor="#FFFFFF" />
// as a straight replacement:
//   <ThemedStatusBar />
//   <ThemedStatusBar backgroundColor="#FFFFFF" />
//
// If you genuinely need to force a specific style (e.g. a photo viewer
// with a black background regardless of mode), pass `style` explicitly:
//   <ThemedStatusBar style="light" />
// That explicit value wins over the theme.

import React from "react";
import { StatusBar } from "expo-status-bar";
import { useTheme } from "../hooks/useTheme";

export default function ThemedStatusBar({ style, backgroundColor, ...rest }) {
  const { dark } = useTheme();
  const resolved = style ?? (dark ? "light" : "dark");
  return <StatusBar style={resolved} backgroundColor={backgroundColor} {...rest} />;
}
