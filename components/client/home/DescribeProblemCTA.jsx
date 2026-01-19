// components/client/home/DescribeProblemCTA.jsx
// CTA card for freeform problem description
import { Pressable, StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import ThemedText from "../../ThemedText";

export default function DescribeProblemCTA({ onPress }) {
  return (
    <View style={styles.wrapper}>
      <ThemedText style={styles.sectionTitle}>Not sure what you need?</ThemedText>
      <Pressable
        style={({ pressed }) => [
          styles.container,
          pressed && styles.pressed,
        ]}
        onPress={onPress}
        accessibilityLabel="Describe your problem"
        accessibilityRole="button"
      >
        <View style={styles.iconContainer}>
          <Ionicons name="create-outline" size={22} color="#6849a7" />
        </View>
        <View style={styles.textContainer}>
          <ThemedText style={styles.title}>Describe your problem</ThemedText>
          <ThemedText style={styles.description}>
            Tell us what's wrong and we'll match you with the right trades
          </ThemedText>
        </View>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    marginBottom: 32,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#1F2937",
    marginBottom: 12,
  },
  container: {
    backgroundColor: "#F5F3FF",
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: "#6849a7",
    borderRadius: 12,
    padding: 20,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
  },
  pressed: {
    backgroundColor: "#EDE9FE",
  },
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#EDE9FE",
    alignItems: "center",
    justifyContent: "center",
  },
  textContainer: {
    flex: 1,
  },
  title: {
    fontSize: 16,
    fontWeight: "600",
    color: "#1F2937",
    marginBottom: 4,
  },
  description: {
    fontSize: 14,
    color: "#6B7280",
    lineHeight: 20,
  },
});
