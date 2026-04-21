// app/(dashboard)/profile/signout.jsx
// Sign-out confirm sheet. Now fully dark-mode aware via useTheme and
// on the same typography system (Public Sans / DM Sans) as the rest
// of the profile redesign.

import { useState } from "react";
import {
  StyleSheet,
  View,
  Pressable,
  ActivityIndicator,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";

import ThemedView from "../../../components/ThemedView";
import ThemedText from "../../../components/ThemedText";
import Spacer from "../../../components/Spacer";
import { Colors } from "../../../constants/Colors";
import { FontFamily } from "../../../constants/Typography";

import { useUser } from "../../../hooks/useUser";
import { useTheme } from "../../../hooks/useTheme";
import ThemedStatusBar from "../../../components/ThemedStatusBar";

const DESTRUCTIVE = Colors.status.declined; // red pill for Sign out

export default function SignOutScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { logout } = useUser();
  const { colors: c } = useTheme();

  const [loading, setLoading] = useState(false);

  async function handleSignOut() {
    try {
      setLoading(true);
      await logout?.();
      router.replace("/login");
    } catch (e) {
      console.log("Sign out error:", e);
      router.replace("/login");
    }
  }

  function handleCancel() {
    router.back();
  }

  return (
    // Scrim uses a fixed rgba(0,0,0,0.4) so it reads as a translucent
    // overlay in both themes. Only the sheet itself flips with theme.
    <ThemedView
      style={[
        styles.container,
        { paddingTop: insets.top, backgroundColor: "rgba(0,0,0,0.4)" },
      ]}
    >
      <ThemedStatusBar />

      <View style={styles.spacer} />

      {/* Bottom sheet — themed background + border, handle bar up top,
          theme-aware typography, ghost Cancel button that respects
          dark mode (previously was baked to the light secondaryBg).   */}
      <View
        style={[
          styles.sheet,
          { backgroundColor: c.background, borderColor: c.border },
        ]}
      >
        <View style={[styles.handle, { backgroundColor: c.borderStrong }]} />

        <ThemedText style={[styles.title, { color: c.text }]}>
          Sign out?
        </ThemedText>
        <Spacer height={8} />
        <ThemedText style={[styles.subtitle, { color: c.textMid }]}>
          Are you sure you want to sign out of your account?
        </ThemedText>

        <Spacer height={24} />

        {/* Sign out — destructive pill. */}
        <Pressable
          style={({ pressed }) => [
            styles.primaryBtn,
            { backgroundColor: DESTRUCTIVE },
            pressed && styles.btnPressed,
            loading && { opacity: 0.7 },
          ]}
          onPress={handleSignOut}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <ThemedText style={styles.primaryBtnText}>Sign out</ThemedText>
          )}
        </Pressable>

        <Spacer height={10} />

        {/* Cancel — ghost pill, theme-aware surface. */}
        <Pressable
          style={({ pressed }) => [
            styles.ghostBtn,
            { backgroundColor: c.elevate, borderColor: c.borderStrong },
            pressed && styles.btnPressed,
          ]}
          onPress={handleCancel}
          disabled={loading}
        >
          <ThemedText style={[styles.ghostBtnText, { color: c.text }]}>
            Cancel
          </ThemedText>
        </Pressable>

        <Spacer height={insets.bottom > 0 ? insets.bottom : 20} />
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  spacer: {
    flex: 1,
  },
  sheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 24,
    paddingTop: 12,
    borderTopWidth: 1,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    alignSelf: "center",
    marginBottom: 18,
  },
  title: {
    fontFamily: FontFamily.headerBold,
    fontSize: 20,
    letterSpacing: -0.3,
    textAlign: "center",
  },
  subtitle: {
    fontFamily: FontFamily.bodyRegular,
    fontSize: 14,
    lineHeight: 20,
    textAlign: "center",
  },
  primaryBtn: {
    height: 52,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryBtnText: {
    fontFamily: FontFamily.headerSemibold,
    fontSize: 15,
    letterSpacing: -0.1,
    color: "#FFFFFF",
  },
  ghostBtn: {
    height: 52,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  ghostBtnText: {
    fontFamily: FontFamily.headerSemibold,
    fontSize: 15,
    letterSpacing: -0.1,
  },
  btnPressed: {
    opacity: 0.85,
  },
});
