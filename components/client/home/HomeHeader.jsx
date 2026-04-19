// components/client/home/HomeHeader.jsx
// Big-display greeting per redesign — Public Sans display title + DM Sans sub.
import React from "react";
import { View, StyleSheet } from "react-native";
import ThemedText from "../../ThemedText";
import { useTheme } from "../../../hooks/useTheme";
import { TypeVariants } from "../../../constants/Typography";

function getGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

export default function HomeHeader({ firstName }) {
  const { colors: c } = useTheme();
  const greeting = getGreeting();
  const displayName = firstName ? `, ${firstName}` : "";

  return (
    <View style={styles.container}>
      <ThemedText
        style={[
          TypeVariants.displayXL,
          { color: c.text, fontSize: 30, lineHeight: 32 },
        ]}
      >
        Home
      </ThemedText>
      <ThemedText
        style={[
          TypeVariants.body,
          { color: c.textMid, marginTop: 6 },
        ]}
      >
        {greeting}{displayName}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingTop: 4,
    marginBottom: 20,
  },
});
