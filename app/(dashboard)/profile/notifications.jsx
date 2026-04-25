// app/(dashboard)/profile/notifications.jsx
import { useState, useEffect } from "react";
import {
  StyleSheet,
  View,
  Pressable,
  Switch,
  ScrollView,
  ActivityIndicator,
  Alert,
  Linking,
  Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import ThemedView from "../../../components/ThemedView";
import ThemedText from "../../../components/ThemedText";
import Spacer from "../../../components/Spacer";
import { Colors } from "../../../constants/Colors";
import { TypeVariants } from "../../../constants/Typography";
import { useTheme } from "../../../hooks/useTheme";

import { getMyProfile, updateMyProfile } from "../../../lib/api/profile";
import {
  areNotificationsEnabled,
  registerForPushNotifications,
} from "../../../lib/api/notifications";
import { useNotifications } from "../../../contexts/NotificationContext";
import ThemedStatusBar from "../../../components/ThemedStatusBar";
import useHideTabBar from "../../../hooks/useHideTabBar";

export default function NotificationsScreen() {
  useHideTabBar();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { colors: c } = useTheme();
  const { isRegistered, registerNotifications } = useNotifications();

  const [settings, setSettings] = useState({
    push_enabled: true,
    email_enabled: true,
    sms_enabled: false,
    new_messages: true,
    quote_updates: true,
    job_reminders: true,
    marketing: false,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [systemPermission, setSystemPermission] = useState(true);

  useEffect(() => {
    loadProfile();
    checkSystemPermission();
  }, []);

  async function checkSystemPermission() {
    const enabled = await areNotificationsEnabled();
    setSystemPermission(enabled);
  }

  async function loadProfile() {
    try {
      const profile = await getMyProfile();
      if (profile?.notification_settings) {
        setSettings((prev) => ({
          ...prev,
          ...profile.notification_settings,
        }));
      }
    } catch (e) {
      console.log("Error loading profile:", e);
    } finally {
      setLoading(false);
    }
  }

  async function handleEnablePushNotifications() {
    // Try to register for push notifications
    await registerNotifications();
    const enabled = await areNotificationsEnabled();
    setSystemPermission(enabled);

    if (!enabled) {
      // If still not enabled, prompt user to go to settings
      Alert.alert(
        "Notifications Disabled",
        "Please enable notifications in your device settings to receive updates.",
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Open Settings",
            onPress: () => {
              if (Platform.OS === "ios") {
                Linking.openURL("app-settings:");
              } else {
                Linking.openSettings();
              }
            },
          },
        ]
      );
    }
  }

  function updateSetting(key, value) {
    setSettings((prev) => ({
      ...prev,
      [key]: value,
    }));
  }

  async function handleSave() {
    try {
      setSaving(true);
      await updateMyProfile({ notification_settings: settings });
      Alert.alert("Success", "Notification preferences updated.", [
        { text: "OK", onPress: () => router.back() },
      ]);
    } catch (e) {
      Alert.alert("Error", e.message || "Failed to save.");
    } finally {
      setSaving(false);
    }
  }

  function NotificationRow({ label, description, settingKey }) {
    return (
      <View style={styles.settingRow}>
        <View style={styles.settingInfo}>
          <ThemedText style={[styles.settingLabel, { color: c.text }]}>
            {label}
          </ThemedText>
          {description && (
            <ThemedText style={[styles.settingDescription, { color: c.textMuted }]}>
              {description}
            </ThemedText>
          )}
        </View>
        <Switch
          value={settings[settingKey]}
          onValueChange={(value) => updateSetting(settingKey, value)}
          trackColor={{ false: c.border, true: Colors.primary }}
          thumbColor="#FFFFFF"
        />
      </View>
    );
  }

  if (loading) {
    return (
      <ThemedView style={[styles.container, { paddingTop: insets.top }]}>
        <ThemedStatusBar />
        <View style={styles.loadingContainer}>
          <ActivityIndicator />
        </View>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={[styles.container, { paddingTop: insets.top }]}>
      <ThemedStatusBar />

      {/* Header */}
      <View style={[styles.header, { borderBottomColor: c.border }]}>
        <Pressable onPress={() => router.back()} hitSlop={10}>
          <Ionicons name="chevron-back" size={24} color={c.text} />
        </Pressable>
        <ThemedText style={[styles.headerTitle, { color: c.text }]}>
          Notifications
        </ThemedText>
        <Pressable onPress={handleSave} disabled={saving} hitSlop={10}>
          {saving ? (
            <ActivityIndicator size="small" color={Colors.primary} />
          ) : (
            <ThemedText style={styles.saveButton}>Save</ThemedText>
          )}
        </Pressable>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
      >
        {/* System Permission Warning */}
        {!systemPermission && (
          <>
            <Pressable
              style={styles.warningBanner}
              onPress={handleEnablePushNotifications}
            >
              <View style={styles.warningContent}>
                <Ionicons name="warning" size={20} color="#92400E" />
                <View style={styles.warningText}>
                  <ThemedText style={styles.warningTitle}>
                    Notifications are disabled
                  </ThemedText>
                  <ThemedText style={styles.warningDescription}>
                    Tap here to enable notifications in your device settings
                  </ThemedText>
                </View>
              </View>
              <Ionicons name="chevron-forward" size={20} color="#92400E" />
            </Pressable>
            <Spacer height={16} />
          </>
        )}

        {/* Channels Section */}
        <ThemedText style={[styles.sectionTitle, { color: c.text }]}>
          Notification channels
        </ThemedText>
        <ThemedText style={[styles.sectionDescription, { color: c.textMuted }]}>
          Choose how you want to receive notifications
        </ThemedText>

        <Spacer height={16} />

        <View style={[styles.card, { backgroundColor: c.elevate, borderColor: c.border }]}>
          <NotificationRow
            label="Push notifications"
            description="Receive notifications on your device"
            settingKey="push_enabled"
          />
          <View style={[styles.separator, { backgroundColor: c.border }]} />
          <NotificationRow
            label="Email notifications"
            description="Receive updates via email"
            settingKey="email_enabled"
          />
          <View style={[styles.separator, { backgroundColor: c.border }]} />
          <NotificationRow
            label="SMS notifications"
            description="Receive text messages for urgent updates"
            settingKey="sms_enabled"
          />
        </View>

        <Spacer height={32} />

        {/* Types Section */}
        <ThemedText style={[styles.sectionTitle, { color: c.text }]}>
          Notification types
        </ThemedText>
        <ThemedText style={[styles.sectionDescription, { color: c.textMuted }]}>
          Choose what you want to be notified about
        </ThemedText>

        <Spacer height={16} />

        <View style={[styles.card, { backgroundColor: c.elevate, borderColor: c.border }]}>
          <NotificationRow
            label="New messages"
            description="When you receive a new message"
            settingKey="new_messages"
          />
          <View style={[styles.separator, { backgroundColor: c.border }]} />
          <NotificationRow
            label="Quote updates"
            description="When quotes are sent, accepted, or declined"
            settingKey="quote_updates"
          />
          <View style={[styles.separator, { backgroundColor: c.border }]} />
          <NotificationRow
            label="Job reminders"
            description="Reminders about upcoming jobs"
            settingKey="job_reminders"
          />
        </View>

        <Spacer height={32} />

        {/* Marketing Section */}
        <ThemedText style={[styles.sectionTitle, { color: c.text }]}>Marketing</ThemedText>

        <Spacer height={16} />

        <View style={[styles.card, { backgroundColor: c.elevate, borderColor: c.border }]}>
          <NotificationRow
            label="Marketing & promotions"
            description="Tips, offers, and news from Settled"
            settingKey="marketing"
          />
        </View>

        <Spacer height={insets.bottom > 0 ? insets.bottom + 20 : 40} />
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    // bg handled by ThemedView default + theme.
  },
  loadingContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  // Warning banner keeps its semantic amber palette in both modes —
  // it's a system-permission warning, not chrome.
  warningBanner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#FEF3C7",
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: "#FCD34D",
  },
  warningContent: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    gap: 12,
  },
  warningText: {
    flex: 1,
  },
  warningTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: "#92400E",
  },
  warningDescription: {
    fontSize: 12,
    color: "#A16207",
    marginTop: 2,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    // border + text painted inline from theme.
  },
  headerTitle: {
    ...TypeVariants.bodyStrong,
    fontSize: 18,
  },
  saveButton: {
    fontSize: 16,
    fontWeight: "600",
    color: Colors.primary,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 24,
    paddingTop: 16,
  },
  sectionTitle: {
    ...TypeVariants.headingSm,
    fontSize: 16,
    fontWeight: "600",
    // color painted inline from theme.
  },
  sectionDescription: {
    fontSize: 13,
    marginTop: 4,
    // color painted inline from theme.
  },
  card: {
    borderRadius: 12,
    borderWidth: 1,
    overflow: "hidden",
    // bg + border painted inline from theme.
  },
  settingRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  settingInfo: {
    flex: 1,
    marginRight: 12,
  },
  settingLabel: {
    fontSize: 15,
    fontWeight: "500",
    // color painted inline from theme.
  },
  settingDescription: {
    fontSize: 13,
    marginTop: 2,
    // color painted inline from theme.
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    marginLeft: 16,
    // bg painted inline from theme.
  },
});
