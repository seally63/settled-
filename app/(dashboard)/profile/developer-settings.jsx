// app/(dashboard)/profile/developer-settings.jsx
// Developer settings for environment switching and debugging

import { useState, useEffect, useCallback } from "react";
import {
  StyleSheet,
  View,
  ScrollView,
  Pressable,
  Switch,
  Alert,
  ActivityIndicator,
} from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";

import ThemedView from "../../../components/ThemedView";
import ThemedText from "../../../components/ThemedText";
import { Colors } from "../../../constants/Colors";
import { TypeVariants } from "../../../constants/Typography";
import { useTheme } from "../../../hooks/useTheme";
import {
  getEnvironmentStatus,
  switchEnvironment,
  setFallbackEnabled,
  testConnection,
  resetToPrimary,
} from "../../../lib/supabase";
import useHideTabBar from "../../../hooks/useHideTabBar";

export default function DeveloperSettings() {
  useHideTabBar();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors: c } = useTheme();

  const [envStatus, setEnvStatus] = useState(null);
  const [testing, setTesting] = useState({ production: false, local: false });
  const [testResults, setTestResults] = useState({ production: null, local: null });
  const [switching, setSwitching] = useState(false);

  // Load current status
  useEffect(() => {
    setEnvStatus(getEnvironmentStatus());
  }, []);

  // Test connection to an environment
  const handleTestConnection = useCallback(async (env) => {
    setTesting((prev) => ({ ...prev, [env]: true }));
    setTestResults((prev) => ({ ...prev, [env]: null }));

    try {
      const result = await testConnection(env);
      setTestResults((prev) => ({ ...prev, [env]: result }));
    } catch (e) {
      setTestResults((prev) => ({ ...prev, [env]: { success: false, error: e.message } }));
    } finally {
      setTesting((prev) => ({ ...prev, [env]: false }));
    }
  }, []);

  // Switch environment
  const handleSwitchEnvironment = useCallback(async (env) => {
    if (envStatus?.currentEnv === env && !envStatus?.isUsingFallback) {
      return; // Already on this environment
    }

    Alert.alert(
      "Switch Environment",
      `Switch to ${env} environment? You may need to log in again.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Switch",
          onPress: async () => {
            setSwitching(true);
            try {
              const newStatus = await switchEnvironment(env);
              setEnvStatus(newStatus);
              Alert.alert("Success", `Switched to ${env} environment. Please restart the app.`);
            } catch (e) {
              Alert.alert("Error", e.message);
            } finally {
              setSwitching(false);
            }
          },
        },
      ]
    );
  }, [envStatus]);

  // Toggle fallback
  const handleToggleFallback = useCallback(async (enabled) => {
    try {
      const newStatus = await setFallbackEnabled(enabled);
      setEnvStatus(newStatus);
    } catch (e) {
      Alert.alert("Error", e.message);
    }
  }, []);

  // Reset to primary
  const handleResetToPrimary = useCallback(() => {
    const newStatus = resetToPrimary();
    setEnvStatus(newStatus);
    Alert.alert("Reset", "Reset to primary environment. Please restart the app.");
  }, []);

  if (!envStatus) {
    return (
      <ThemedView style={[styles.container, { paddingTop: insets.top }]}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </ThemedView>
    );
  }

  return (
    <ThemedView style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={[styles.header, { backgroundColor: c.elevate, borderBottomColor: c.border }]}>
        <Pressable onPress={() => router.back()} hitSlop={10}>
          <Ionicons name="chevron-back" size={24} color={c.text} />
        </Pressable>
        <ThemedText style={[styles.headerTitle, { color: c.text }]}>Developer Settings</ThemedText>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 20 }]}
      >
        {/* Current Status */}
        <View style={styles.section}>
          <ThemedText style={[styles.sectionTitle, { color: c.textMuted }]}>CURRENT STATUS</ThemedText>
          <View style={[styles.card, { backgroundColor: c.elevate, borderColor: c.border }]}>
            <View style={[styles.statusRow, { borderBottomColor: c.border }]}>
              <ThemedText style={[styles.statusLabel, { color: c.textMid }]}>Environment:</ThemedText>
              <View style={[styles.badge, envStatus.activeEnv === "local" ? styles.badgeLocal : styles.badgeProd]}>
                <ThemedText style={styles.badgeText}>
                  {envStatus.activeEnv.toUpperCase()}
                </ThemedText>
              </View>
            </View>
            {envStatus.isUsingFallback && (
              <View style={[styles.warningRow, { borderBottomColor: c.border }]}>
                <Ionicons name="warning" size={16} color="#F59E0B" />
                <ThemedText style={styles.warningText}>
                  Using fallback (production failed)
                </ThemedText>
              </View>
            )}
            <View style={styles.statusRow}>
              <ThemedText style={[styles.statusLabel, { color: c.textMid }]}>Retry count:</ThemedText>
              <ThemedText style={[styles.statusValue, { color: c.text }]}>{envStatus.connectionRetryCount}</ThemedText>
            </View>
          </View>
        </View>

        {/* Environment Selection */}
        <View style={styles.section}>
          <ThemedText style={[styles.sectionTitle, { color: c.textMuted }]}>ENVIRONMENT</ThemedText>
          <View style={[styles.card, { backgroundColor: c.elevate, borderColor: c.border }]}>
            {/* Production */}
            <Pressable
              style={[
                styles.envOption,
                envStatus.activeEnv === "production" && { backgroundColor: Colors.primaryTint },
              ]}
              onPress={() => handleSwitchEnvironment("production")}
              disabled={switching}
            >
              <View style={styles.envOptionContent}>
                <View style={styles.envOptionHeader}>
                  <Ionicons
                    name={envStatus.activeEnv === "production" ? "radio-button-on" : "radio-button-off"}
                    size={20}
                    color={envStatus.activeEnv === "production" ? Colors.primary : c.textMuted}
                  />
                  <ThemedText style={[styles.envOptionTitle, { color: c.text }]}>Production</ThemedText>
                </View>
                <ThemedText style={[styles.envOptionUrl, { color: c.textMuted }]}>ncwbkoriohrkvulvzzuw.supabase.co</ThemedText>
              </View>
              <Pressable
                style={[styles.testButton, { backgroundColor: c.elevate2 }]}
                onPress={() => handleTestConnection("production")}
                disabled={testing.production}
              >
                {testing.production ? (
                  <ActivityIndicator size="small" color={Colors.primary} />
                ) : (
                  <ThemedText style={styles.testButtonText}>Test</ThemedText>
                )}
              </Pressable>
            </Pressable>
            {testResults.production && (
              <View style={[styles.testResult, testResults.production.success ? styles.testSuccess : styles.testFail]}>
                <Ionicons
                  name={testResults.production.success ? "checkmark-circle" : "close-circle"}
                  size={16}
                  color={testResults.production.success ? "#10B981" : "#EF4444"}
                />
                <ThemedText style={styles.testResultText}>
                  {testResults.production.success
                    ? `Connected (${testResults.production.latency}ms)`
                    : `Failed: ${testResults.production.error}`}
                </ThemedText>
              </View>
            )}

            <View style={[styles.divider, { backgroundColor: c.border }]} />

            {/* Local */}
            <Pressable
              style={[
                styles.envOption,
                envStatus.activeEnv === "local" && { backgroundColor: Colors.primaryTint },
              ]}
              onPress={() => handleSwitchEnvironment("local")}
              disabled={switching}
            >
              <View style={styles.envOptionContent}>
                <View style={styles.envOptionHeader}>
                  <Ionicons
                    name={envStatus.activeEnv === "local" ? "radio-button-on" : "radio-button-off"}
                    size={20}
                    color={envStatus.activeEnv === "local" ? Colors.primary : c.textMuted}
                  />
                  <ThemedText style={[styles.envOptionTitle, { color: c.text }]}>Local</ThemedText>
                </View>
                <ThemedText style={[styles.envOptionUrl, { color: c.textMuted }]}>127.0.0.1:54321</ThemedText>
              </View>
              <Pressable
                style={[styles.testButton, { backgroundColor: c.elevate2 }]}
                onPress={() => handleTestConnection("local")}
                disabled={testing.local}
              >
                {testing.local ? (
                  <ActivityIndicator size="small" color={Colors.primary} />
                ) : (
                  <ThemedText style={styles.testButtonText}>Test</ThemedText>
                )}
              </Pressable>
            </Pressable>
            {testResults.local && (
              <View style={[styles.testResult, testResults.local.success ? styles.testSuccess : styles.testFail]}>
                <Ionicons
                  name={testResults.local.success ? "checkmark-circle" : "close-circle"}
                  size={16}
                  color={testResults.local.success ? "#10B981" : "#EF4444"}
                />
                <ThemedText style={styles.testResultText}>
                  {testResults.local.success
                    ? `Connected (${testResults.local.latency}ms)`
                    : `Failed: ${testResults.local.error}`}
                </ThemedText>
              </View>
            )}
          </View>
        </View>

        {/* Fallback Settings */}
        <View style={styles.section}>
          <ThemedText style={[styles.sectionTitle, { color: c.textMuted }]}>FALLBACK</ThemedText>
          <View style={[styles.card, { backgroundColor: c.elevate, borderColor: c.border }]}>
            <View style={styles.settingRow}>
              <View style={styles.settingContent}>
                <ThemedText style={[styles.settingTitle, { color: c.text }]}>Auto-fallback to Local</ThemedText>
                <ThemedText style={[styles.settingDescription, { color: c.textMuted }]}>
                  If production fails, automatically switch to local database
                </ThemedText>
              </View>
              <Switch
                value={envStatus.fallbackEnabled}
                onValueChange={handleToggleFallback}
                trackColor={{ false: c.border, true: Colors.primary }}
                thumbColor="#FFFFFF"
              />
            </View>

            {envStatus.isUsingFallback && (
              <>
                <View style={[styles.divider, { backgroundColor: c.border }]} />
                <Pressable style={styles.resetButton} onPress={handleResetToPrimary}>
                  <Ionicons name="refresh" size={18} color={Colors.primary} />
                  <ThemedText style={styles.resetButtonText}>Reset to Primary</ThemedText>
                </Pressable>
              </>
            )}
          </View>
        </View>

        {/* Instructions */}
        <View style={styles.section}>
          <ThemedText style={[styles.sectionTitle, { color: c.textMuted }]}>LOCAL SETUP</ThemedText>
          <View style={[styles.card, { backgroundColor: c.elevate, borderColor: c.border }]}>
            <ThemedText style={[styles.instructionText, { color: c.textMid }]}>
              To run local Supabase:
            </ThemedText>
            <View style={styles.codeBlock}>
              <ThemedText style={styles.codeText}>cd tradify_app</ThemedText>
              <ThemedText style={styles.codeText}>npx supabase start</ThemedText>
            </View>
            <ThemedText style={[styles.instructionText, { color: c.textMid }]}>
              This will start PostgreSQL, Auth, Storage, and other services locally.
            </ThemedText>
          </View>
        </View>
      </ScrollView>

      {switching && (
        <View style={[styles.loadingOverlay, { backgroundColor: c.background + "E6" }]}>
          <ActivityIndicator size="large" color={Colors.primary} />
          <ThemedText style={[styles.loadingText, { color: c.text }]}>Switching environment...</ThemedText>
        </View>
      )}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    // bg handled by ThemedView default + theme.
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    // bg + border painted inline from theme.
  },
  headerTitle: {
    ...TypeVariants.bodyStrong,
    fontSize: 18,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: "600",
    letterSpacing: 0.5,
    marginBottom: 8,
    marginLeft: 4,
    // color painted inline from theme.
  },
  card: {
    borderRadius: 12,
    borderWidth: 1,
    overflow: "hidden",
    // bg + border painted inline from theme.
  },
  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 16,
    borderBottomWidth: 1,
    // border painted inline from theme.
  },
  statusLabel: {
    fontSize: 15,
    // color painted inline from theme.
  },
  statusValue: {
    fontSize: 15,
    fontWeight: "500",
    // color painted inline from theme.
  },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  // Semantic palette kept for environment badges.
  badgeProd: {
    backgroundColor: "#DCFCE7",
  },
  badgeLocal: {
    backgroundColor: "#FEF3C7",
  },
  badgeText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#111827",
  },
  // Semantic amber for fallback warning row.
  warningRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 12,
    backgroundColor: "#FFFBEB",
    borderBottomWidth: 1,
    // border painted inline from theme.
  },
  warningText: {
    fontSize: 13,
    color: "#92400E",
  },
  envOption: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 16,
  },
  envOptionContent: {
    flex: 1,
  },
  envOptionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  envOptionTitle: {
    fontSize: 16,
    fontWeight: "500",
    // color painted inline from theme.
  },
  envOptionUrl: {
    fontSize: 13,
    marginLeft: 30,
    marginTop: 4,
    // color painted inline from theme.
  },
  testButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    minWidth: 60,
    alignItems: "center",
    // bg painted inline from theme.
  },
  testButtonText: {
    fontSize: 14,
    fontWeight: "500",
    color: Colors.primary,
  },
  // Test result banners — semantic palette kept in both modes.
  testResult: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    marginHorizontal: 16,
    marginBottom: 12,
    borderRadius: 8,
  },
  testSuccess: {
    backgroundColor: "#ECFDF5",
  },
  testFail: {
    backgroundColor: "#FEF2F2",
  },
  testResultText: {
    fontSize: 13,
    color: "#374151",
  },
  divider: {
    height: 1,
    // bg painted inline from theme.
  },
  settingRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 16,
  },
  settingContent: {
    flex: 1,
    marginRight: 16,
  },
  settingTitle: {
    fontSize: 15,
    fontWeight: "500",
    // color painted inline from theme.
  },
  settingDescription: {
    fontSize: 13,
    marginTop: 4,
    // color painted inline from theme.
  },
  resetButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    padding: 14,
  },
  resetButtonText: {
    fontSize: 15,
    fontWeight: "500",
    color: Colors.primary,
  },
  instructionText: {
    fontSize: 14,
    padding: 16,
    paddingBottom: 8,
    // color painted inline from theme.
  },
  // Code block keeps dark palette in both modes — terminal-style.
  codeBlock: {
    backgroundColor: "#1F2937",
    marginHorizontal: 16,
    padding: 12,
    borderRadius: 8,
  },
  codeText: {
    fontFamily: "monospace",
    fontSize: 13,
    color: "#E5E7EB",
    lineHeight: 20,
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    // bg painted inline (semi-transparent theme background).
  },
  loadingText: {
    marginTop: 12,
    fontSize: 15,
    // color painted inline from theme.
  },
});
