// components/client/home/HomeHeader.jsx
// Header section with greeting and subheading
import { View, StyleSheet } from "react-native";
import ThemedText from "../../ThemedText";

export default function HomeHeader({ firstName }) {
  const displayName = firstName || "there";

  return (
    <View style={styles.container}>
      <ThemedText style={styles.greeting}>
        Hi {displayName} 👋
      </ThemedText>
      <ThemedText style={styles.subheading}>
        What do you need help with?
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingTop: 16,
    marginBottom: 20,
  },
  greeting: {
    fontSize: 24,
    fontWeight: "700",
    color: "#1F2937",
    marginBottom: 4,
  },
  subheading: {
    fontSize: 16,
    fontWeight: "400",
    color: "#6B7280",
  },
});
