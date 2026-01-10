// app/(dashboard)/profile/change-email.jsx
import { useState, useEffect } from "react";
import {
  StyleSheet,
  View,
  Pressable,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import ThemedView from "../../../components/ThemedView";
import ThemedText from "../../../components/ThemedText";
import Spacer from "../../../components/Spacer";
import OTPInput from "../../../components/OTPInput";
import { Colors } from "../../../constants/Colors";

import { useUser } from "../../../hooks/useUser";
import { getMyProfile, updateMyProfile } from "../../../lib/api/profile";

const SCREENS = {
  ENTER_EMAIL: "enter_email",
  VERIFY_OTP: "verify_otp",
};

export default function ChangeEmailScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useUser();

  const [currentScreen, setCurrentScreen] = useState(SCREENS.ENTER_EMAIL);
  const [currentEmail, setCurrentEmail] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [otpError, setOtpError] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadProfile();
  }, []);

  async function loadProfile() {
    try {
      const profile = await getMyProfile();
      setCurrentEmail(profile?.email || user?.email || "");
    } catch (e) {
      console.log("Error loading profile:", e);
    } finally {
      setLoading(false);
    }
  }

  function isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }

  function handleSendCode() {
    if (!isValidEmail(newEmail)) {
      Alert.alert("Invalid email", "Please enter a valid email address.");
      return;
    }

    if (newEmail.toLowerCase() === currentEmail.toLowerCase()) {
      Alert.alert("Same email", "Please enter a different email address.");
      return;
    }

    // In production, send OTP to new email here
    // For now, move to OTP screen
    setCurrentScreen(SCREENS.VERIFY_OTP);
  }

  async function handleVerifyOtp(code) {
    setOtpError("");

    // Dev bypass: 0000 or test domains
    const isDevBypass =
      code === "0000" ||
      newEmail.endsWith("@test.settled.com") ||
      newEmail.endsWith("@ninja.dev");

    if (!isDevBypass && code !== "1234") {
      // Simulated valid OTP for demo
      setOtpError("Invalid verification code. Please try again.");
      return;
    }

    try {
      setSaving(true);
      await updateMyProfile({ email: newEmail });
      Alert.alert("Success", "Your email has been updated.", [
        { text: "OK", onPress: () => router.back() },
      ]);
    } catch (e) {
      Alert.alert("Error", e.message || "Failed to update email.");
    } finally {
      setSaving(false);
    }
  }

  function handleBack() {
    if (currentScreen === SCREENS.VERIFY_OTP) {
      setCurrentScreen(SCREENS.ENTER_EMAIL);
      setOtp("");
      setOtpError("");
    } else {
      router.back();
    }
  }

  if (loading) {
    return (
      <ThemedView style={[styles.container, { paddingTop: insets.top }]}>
        <StatusBar style="dark" />
        <View style={styles.loadingContainer}>
          <ActivityIndicator />
        </View>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={[styles.container, { paddingTop: insets.top }]}>
      <StatusBar style="dark" />

      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={handleBack} hitSlop={10}>
          <Ionicons name="arrow-back" size={24} color={Colors.light.title} />
        </Pressable>
        <ThemedText style={styles.headerTitle}>Change email</ThemedText>
        <View style={{ width: 24 }} />
      </View>

      <KeyboardAvoidingView
        style={styles.keyboardView}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <View style={styles.content}>
          {currentScreen === SCREENS.ENTER_EMAIL ? (
            <>
              <ThemedText style={styles.label}>Current email</ThemedText>
              <View style={styles.currentEmailBox}>
                <ThemedText style={styles.currentEmailText}>
                  {currentEmail}
                </ThemedText>
              </View>

              <Spacer height={24} />

              <ThemedText style={styles.label}>New email address</ThemedText>
              <TextInput
                style={styles.input}
                value={newEmail}
                onChangeText={setNewEmail}
                placeholder="Enter new email"
                placeholderTextColor={Colors.light.subtitle}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="email"
              />

              <Spacer height={12} />

              <ThemedText style={styles.hint}>
                We'll send a verification code to your new email address.
              </ThemedText>

              <Spacer height={32} />

              <Pressable
                style={({ pressed }) => [
                  styles.primaryButton,
                  !isValidEmail(newEmail) && styles.buttonDisabled,
                  pressed && styles.buttonPressed,
                ]}
                onPress={handleSendCode}
                disabled={!isValidEmail(newEmail) || saving}
              >
                <ThemedText style={styles.primaryButtonText}>
                  Send verification code
                </ThemedText>
              </Pressable>
            </>
          ) : (
            <>
              <ThemedText style={styles.title}>Verify your email</ThemedText>
              <Spacer height={8} />
              <ThemedText style={styles.subtitle}>
                Enter the 4-digit code sent to{"\n"}
                <ThemedText style={styles.emailHighlight}>{newEmail}</ThemedText>
              </ThemedText>

              <Spacer height={32} />

              <OTPInput
                value={otp}
                onChange={setOtp}
                onComplete={handleVerifyOtp}
                error={otpError}
                disabled={saving}
              />

              {otpError ? (
                <>
                  <Spacer height={12} />
                  <ThemedText style={styles.errorText}>{otpError}</ThemedText>
                </>
              ) : null}

              <Spacer height={24} />

              <Pressable onPress={() => setCurrentScreen(SCREENS.ENTER_EMAIL)}>
                <ThemedText style={styles.changeEmailLink}>
                  Use a different email
                </ThemedText>
              </Pressable>

              {saving && (
                <View style={styles.savingOverlay}>
                  <ActivityIndicator color={Colors.primary} />
                </View>
              )}
            </>
          )}
        </View>
      </KeyboardAvoidingView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#FFFFFF",
  },
  loadingContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: Colors.light.title,
  },
  keyboardView: {
    flex: 1,
  },
  content: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 24,
  },
  label: {
    fontSize: 14,
    fontWeight: "500",
    color: Colors.light.title,
    marginBottom: 8,
  },
  currentEmailBox: {
    backgroundColor: Colors.light.secondaryBackground,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 12,
  },
  currentEmailText: {
    fontSize: 16,
    color: Colors.light.subtitle,
  },
  input: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: Colors.light.border,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: Colors.light.title,
  },
  hint: {
    fontSize: 13,
    color: Colors.light.subtitle,
    lineHeight: 18,
  },
  primaryButton: {
    backgroundColor: Colors.primary,
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "600",
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonPressed: {
    opacity: 0.8,
  },
  title: {
    fontSize: 24,
    fontWeight: "700",
    color: Colors.light.title,
    textAlign: "center",
  },
  subtitle: {
    fontSize: 15,
    color: Colors.light.subtitle,
    textAlign: "center",
    lineHeight: 22,
  },
  emailHighlight: {
    color: Colors.light.title,
    fontWeight: "500",
  },
  errorText: {
    fontSize: 13,
    color: Colors.warning,
    textAlign: "center",
  },
  changeEmailLink: {
    fontSize: 14,
    color: Colors.primary,
    textAlign: "center",
  },
  savingOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(255,255,255,0.7)",
    alignItems: "center",
    justifyContent: "center",
  },
});
