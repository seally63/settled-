// app/(dashboard)/profile/signout.jsx
import { useState } from "react";
import {
  StyleSheet,
  View,
  Pressable,
  ActivityIndicator,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import ThemedView from "../../../components/ThemedView";
import ThemedText from "../../../components/ThemedText";
import Spacer from "../../../components/Spacer";
import { Colors } from "../../../constants/Colors";

import { useUser } from "../../../hooks/useUser";
import ThemedStatusBar from "../../../components/ThemedStatusBar";

export default function SignOutScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { logout } = useUser();

  const [loading, setLoading] = useState(false);

  async function handleSignOut() {
    try {
      setLoading(true);
      await logout?.();
      router.replace("/");
    } catch (e) {
      console.log("Sign out error:", e);
      router.replace("/");
    }
  }

  function handleCancel() {
    router.back();
  }

  return (
    <ThemedView style={[styles.container, { paddingTop: insets.top }]}>
      <ThemedStatusBar />

      {/* Spacer to push content to bottom */}
      <View style={styles.spacer} />

      {/* Bottom Sheet */}
      <View style={styles.sheet}>
        <ThemedText style={styles.title}>Sign out?</ThemedText>
        <Spacer height={8} />
        <ThemedText style={styles.subtitle}>
          Are you sure you want to sign out of your account?
        </ThemedText>

        <Spacer height={24} />

        {/* Sign Out Button (destructive) */}
        <Pressable
          style={({ pressed }) => [
            styles.signOutButton,
            pressed && styles.buttonPressed,
          ]}
          onPress={handleSignOut}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <ThemedText style={styles.signOutButtonText}>Sign out</ThemedText>
          )}
        </Pressable>

        <Spacer height={12} />

        {/* Cancel Button */}
        <Pressable
          style={({ pressed }) => [
            styles.cancelButton,
            pressed && styles.buttonPressed,
          ]}
          onPress={handleCancel}
          disabled={loading}
        >
          <ThemedText style={styles.cancelButtonText}>Cancel</ThemedText>
        </Pressable>

        <Spacer height={insets.bottom > 0 ? insets.bottom : 20} />
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
  },
  spacer: {
    flex: 1,
  },
  sheet: {
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 24,
    paddingTop: 32,
  },
  title: {
    fontSize: 18,
    fontWeight: "600",
    color: Colors.light.title,
    textAlign: "center",
  },
  subtitle: {
    fontSize: 14,
    color: Colors.light.subtitle,
    textAlign: "center",
    lineHeight: 20,
  },
  signOutButton: {
    backgroundColor: Colors.warning,
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  signOutButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "600",
  },
  cancelButton: {
    backgroundColor: Colors.light.secondaryBackground,
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  cancelButtonText: {
    color: Colors.light.title,
    fontSize: 16,
    fontWeight: "600",
  },
  buttonPressed: {
    opacity: 0.8,
  },
});
