// app/(dashboard)/profile/change-phone.jsx
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
  ENTER_PHONE: "enter_phone",
  VERIFY_OTP: "verify_otp",
};

export default function ChangePhoneScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useUser();

  const [currentScreen, setCurrentScreen] = useState(SCREENS.ENTER_PHONE);
  const [currentPhone, setCurrentPhone] = useState("");
  const [newPhone, setNewPhone] = useState("");
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
      setCurrentPhone(profile?.phone || "");
    } catch (e) {
      console.log("Error loading profile:", e);
    } finally {
      setLoading(false);
    }
  }

  function isValidPhone(phone) {
    // Basic validation: at least 10 digits
    const digits = phone.replace(/\D/g, "");
    return digits.length >= 10;
  }

  function formatPhoneDisplay(phone) {
    if (!phone) return "Not set";
    return phone;
  }

  function handleSendCode() {
    if (!isValidPhone(newPhone)) {
      Alert.alert("Invalid phone", "Please enter a valid phone number.");
      return;
    }

    const newDigits = newPhone.replace(/\D/g, "");
    const currentDigits = currentPhone.replace(/\D/g, "");

    if (newDigits === currentDigits) {
      Alert.alert("Same number", "Please enter a different phone number.");
      return;
    }

    // In production, send OTP to new phone here
    // For now, move to OTP screen
    setCurrentScreen(SCREENS.VERIFY_OTP);
  }

  async function handleVerifyOtp(code) {
    setOtpError("");

    // Dev bypass: 0000
    const isDevBypass = code === "0000";

    if (!isDevBypass && code !== "1234") {
      // Simulated valid OTP for demo
      setOtpError("Invalid verification code. Please try again.");
      return;
    }

    try {
      setSaving(true);
      await updateMyProfile({ phone: newPhone });
      Alert.alert("Success", "Your phone number has been updated.", [
        { text: "OK", onPress: () => router.back() },
      ]);
    } catch (e) {
      Alert.alert("Error", e.message || "Failed to update phone number.");
    } finally {
      setSaving(false);
    }
  }

  function handleBack() {
    if (currentScreen === SCREENS.VERIFY_OTP) {
      setCurrentScreen(SCREENS.ENTER_PHONE);
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
        <ThemedText style={styles.headerTitle}>Change phone</ThemedText>
        <View style={{ width: 24 }} />
      </View>

      <KeyboardAvoidingView
        style={styles.keyboardView}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <View style={styles.content}>
          {currentScreen === SCREENS.ENTER_PHONE ? (
            <>
              <ThemedText style={styles.label}>Current phone number</ThemedText>
              <View style={styles.currentPhoneBox}>
                <ThemedText style={styles.currentPhoneText}>
                  {formatPhoneDisplay(currentPhone)}
                </ThemedText>
              </View>

              <Spacer height={24} />

              <ThemedText style={styles.label}>New phone number</ThemedText>
              <TextInput
                style={styles.input}
                value={newPhone}
                onChangeText={setNewPhone}
                placeholder="Enter new phone number"
                placeholderTextColor={Colors.light.subtitle}
                keyboardType="phone-pad"
                autoComplete="tel"
              />

              <Spacer height={12} />

              <ThemedText style={styles.hint}>
                We'll send a verification code to your new phone number via SMS.
              </ThemedText>

              <Spacer height={32} />

              <Pressable
                style={({ pressed }) => [
                  styles.primaryButton,
                  !isValidPhone(newPhone) && styles.buttonDisabled,
                  pressed && styles.buttonPressed,
                ]}
                onPress={handleSendCode}
                disabled={!isValidPhone(newPhone) || saving}
              >
                <ThemedText style={styles.primaryButtonText}>
                  Send verification code
                </ThemedText>
              </Pressable>
            </>
          ) : (
            <>
              <ThemedText style={styles.title}>Verify your phone</ThemedText>
              <Spacer height={8} />
              <ThemedText style={styles.subtitle}>
                Enter the 4-digit code sent to{"\n"}
                <ThemedText style={styles.phoneHighlight}>{newPhone}</ThemedText>
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

              <Pressable onPress={() => setCurrentScreen(SCREENS.ENTER_PHONE)}>
                <ThemedText style={styles.changePhoneLink}>
                  Use a different number
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
  currentPhoneBox: {
    backgroundColor: Colors.light.secondaryBackground,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 12,
  },
  currentPhoneText: {
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
  phoneHighlight: {
    color: Colors.light.title,
    fontWeight: "500",
  },
  errorText: {
    fontSize: 13,
    color: Colors.warning,
    textAlign: "center",
  },
  changePhoneLink: {
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
