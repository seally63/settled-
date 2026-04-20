// app/(dashboard)/profile/settings.jsx
// Settings page - accessed via burger menu from Profile page
import { useEffect, useState, useCallback } from "react";
import {
  StyleSheet,
  View,
  ScrollView,
  ActivityIndicator,
  Pressable,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter, useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import Constants from "expo-constants";

import ThemedView from "../../../components/ThemedView";
import ThemedText from "../../../components/ThemedText";
import Spacer from "../../../components/Spacer";
import { SettingsFormSkeleton } from "../../../components/Skeleton";
import { Colors } from "../../../constants/Colors";

import { useUser } from "../../../hooks/useUser";
import { useTheme } from "../../../hooks/useTheme";
import useHideTabBar from "../../../hooks/useHideTabBar";
import { getMyRole, getMyProfile } from "../../../lib/api/profile";
import { getMyVerificationStatus } from "../../../lib/api/verification";
import { isCurrentUserAdmin } from "../../../lib/api/admin";
import ThemedStatusBar from "../../../components/ThemedStatusBar";

function normalizeRole(r) {
  if (r == null) return null;
  const s = String(r).trim().toLowerCase();
  if (["trade", "trades", "tradesman", "tradesperson", "business", "pro"].includes(s)) return "trades";
  if (["client", "customer", "homeowner", "user"].includes(s)) return "client";
  return s;
}

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user, authChecked } = useUser();
  const { mode: themeMode, setMode: setThemeMode } = useTheme();
  // Settings is a deep page (chevron-back) — hide the floating tab bar.
  useHideTabBar();

  const [role, setRole] = useState(null);
  const [roleLoading, setRoleLoading] = useState(true);
  const [profile, setProfile] = useState(null);
  const [verification, setVerification] = useState(null);
  const [loadingData, setLoadingData] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);

  // Determine role
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        if (!authChecked) return;
        if (!user?.id) {
          if (alive) { setRole("guest"); setRoleLoading(false); }
          return;
        }
        const r = await getMyRole();
        const norm = normalizeRole(r);
        if (alive) { setRole(norm ?? "unknown"); setRoleLoading(false); }
      } catch {
        if (alive) { setRole("unknown"); setRoleLoading(false); }
      }
    })();
    return () => { alive = false; };
  }, [user?.id, authChecked]);

  // Load profile data and verification status
  const loadProfile = useCallback(async () => {
    if (!user?.id) return;
    try {
      setLoadingData(true);

      // Load profile, verification status, and admin status in parallel
      const [me, verificationData, adminStatus] = await Promise.all([
        getMyProfile(),
        getMyVerificationStatus().catch(e => {
          console.log("Error loading verification status:", e);
          return null;
        }),
        isCurrentUserAdmin().catch(() => false),
      ]);

      setProfile(me || null);
      setVerification(verificationData || {
        photo_id_status: "not_started",
        insurance_status: "not_started",
        credentials_status: "not_started",
        overall_complete: false,
      });
      setIsAdmin(adminStatus);
    } finally {
      setLoadingData(false);
    }
  }, [user?.id]);

  // Initial load
  useEffect(() => {
    if (role) loadProfile();
  }, [user?.id, role, loadProfile]);

  // Reload when screen comes into focus
  useFocusEffect(
    useCallback(() => {
      if (role && user?.id) {
        loadProfile();
      }
    }, [role, user?.id, loadProfile])
  );

  const onSignOut = useCallback(() => {
    router.push("/profile/signout");
  }, [router]);

  if (roleLoading || loadingData) {
    return (
      <ThemedView style={[styles.container, { paddingTop: insets.top }]}>
        <ThemedStatusBar />
        <SettingsFormSkeleton paddingTop={16} />
      </ThemedView>
    );
  }

  const isTrades = role === "trades";

  // Verification status (from real API data)
  const verificationData = verification || {
    photo_id_status: "not_started",
    insurance_status: "not_started",
    credentials_status: "not_started",
  };

  // Map to shorter names for easier access
  const verificationStatus = {
    photo_id: verificationData.photo_id_status || "not_started",
    insurance: verificationData.insurance_status || "not_started",
    credentials: verificationData.credentials_status || "not_started",
  };

  const verificationCount = [
    verificationStatus.photo_id === "verified",
    verificationStatus.insurance === "verified",
    verificationStatus.credentials === "verified",
  ].filter(Boolean).length;

  const isFullyVerified = verificationCount === 3;
  const hasActionNeeded = verificationStatus.insurance === "expired" ||
    verificationStatus.photo_id === "rejected" ||
    verificationStatus.insurance === "rejected" ||
    verificationStatus.credentials === "rejected";
  const isExpiringSoon = verificationStatus.insurance === "expiring_soon";

  // Check if any verification is under review
  const hasUnderReview = [
    verificationStatus.photo_id,
    verificationStatus.insurance,
    verificationStatus.credentials,
  ].some(s => s === "under_review" || s === "pending_review");

  // Determine banner state
  const getBannerState = () => {
    if (hasActionNeeded) return "action";
    if (isExpiringSoon) return "expiring";
    if (isFullyVerified) return "complete";
    if (hasUnderReview && verificationCount < 3) return "review";
    if (verificationCount < 3) return "incomplete";
    return null;
  };

  const bannerState = getBannerState();

  // Get display data
  const displayName = profile?.full_name || user?.email || "User";
  const businessName = profile?.business_name;
  const email = profile?.email || user?.email;
  const phone = profile?.phone;

  const appVersion = Constants.expoConfig?.version || "1.0.0";

  return (
    <ThemedView style={[styles.container, { paddingTop: insets.top }]}>
      <ThemedStatusBar />

      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={10}>
          <Ionicons name="chevron-back" size={24} color={Colors.light.title} />
        </Pressable>
        <ThemedText style={styles.headerTitle}>Settings</ThemedText>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Verification Banners for Trades */}
        {isTrades && bannerState === "incomplete" && (
          <View style={styles.incompleteBanner}>
            <Ionicons name="warning" size={20} color="#F59E0B" />
            <View style={styles.bannerContent}>
              <ThemedText style={styles.incompleteBannerTitle}>Complete verification</ThemedText>
              <ThemedText style={styles.bannerText}>
                {verificationCount === 0
                  ? "Verify your details to start receiving quote requests from customers."
                  : `${3 - verificationCount} more step${3 - verificationCount !== 1 ? "s" : ""} to start receiving quotes.`}
              </ThemedText>
              <View style={styles.progressBar}>
                <View style={[styles.progressFillAmber, { width: `${(verificationCount / 3) * 100}%` }]} />
              </View>
              <ThemedText style={styles.progressText}>{verificationCount} of 3 complete</ThemedText>
            </View>
          </View>
        )}

        {/* Under Review Banner */}
        {isTrades && bannerState === "review" && (
          <View style={styles.reviewBanner}>
            <Ionicons name="time-outline" size={20} color="#3B82F6" />
            <View style={styles.bannerContent}>
              <ThemedText style={styles.reviewBannerTitle}>Under review</ThemedText>
              <ThemedText style={styles.bannerText}>
                We're checking your documents. This usually takes 1-2 business days.
              </ThemedText>
            </View>
          </View>
        )}

        {/* Complete Banner */}
        {isTrades && bannerState === "complete" && (
          <View style={styles.completeBanner}>
            <Ionicons name="checkmark-circle" size={20} color="#10B981" />
            <View style={styles.bannerContent}>
              <ThemedText style={styles.completeBannerTitle}>Verification complete</ThemedText>
              <ThemedText style={styles.bannerText}>
                You're all set! Clients can now find you and request quotes.
              </ThemedText>
              <View style={styles.progressBar}>
                <View style={[styles.progressFillGreen, { width: "100%" }]} />
              </View>
              <ThemedText style={styles.progressText}>3 of 3 complete</ThemedText>
            </View>
          </View>
        )}

        {/* Expiring Soon Banner */}
        {isTrades && bannerState === "expiring" && (
          <View style={styles.expiringBanner}>
            <Ionicons name="warning" size={20} color="#F59E0B" />
            <View style={styles.bannerContent}>
              <ThemedText style={styles.expiringBannerTitle}>Insurance expiring soon</ThemedText>
              <ThemedText style={styles.bannerText}>
                Your insurance is expiring soon. Upload your renewal to continue receiving quotes.
              </ThemedText>
              <Pressable
                style={styles.updateButton}
                onPress={() => router.push("/profile/insurance")}
              >
                <ThemedText style={styles.updateButtonText}>Update now</ThemedText>
              </Pressable>
            </View>
          </View>
        )}

        {/* Action Needed Banner (Expired/Rejected) */}
        {isTrades && bannerState === "action" && (
          <View style={styles.actionBanner}>
            <Ionicons name="warning" size={20} color="#DC2626" />
            <View style={styles.bannerContent}>
              <ThemedText style={styles.actionBannerTitle}>Action required</ThemedText>
              <ThemedText style={styles.bannerText}>
                {verificationStatus.insurance === "expired"
                  ? "Your insurance has expired. Upload a new certificate to continue receiving quotes."
                  : "There's an issue with your verification. Please check and resubmit."}
              </ThemedText>
              <Pressable
                style={styles.updateButton}
                onPress={() => router.push("/profile/insurance")}
              >
                <ThemedText style={styles.updateButtonText}>Update now</ThemedText>
              </Pressable>
            </View>
          </View>
        )}

        {/* Verification Section (Trades only) */}
        {isTrades && (
          <>
            <ThemedText style={styles.sectionLabel}>VERIFICATION</ThemedText>
            <View style={styles.sectionCard}>
              <SettingsRow
                icon="person-outline"
                label="Photo ID"
                value={getVerificationStatusText(verificationStatus.photo_id)}
                statusIcon={getVerificationStatusIcon(verificationStatus.photo_id)}
                onPress={() => router.push("/profile/photo-id")}
              />
              <View style={styles.divider} />
              <SettingsRow
                icon="shield-outline"
                label="Insurance"
                value={getVerificationStatusText(verificationStatus.insurance)}
                statusIcon={getVerificationStatusIcon(verificationStatus.insurance)}
                onPress={() => router.push("/profile/insurance")}
              />
              <View style={styles.divider} />
              <SettingsRow
                icon="ribbon-outline"
                label="Credentials"
                value={getVerificationStatusText(verificationStatus.credentials)}
                statusIcon={getVerificationStatusIcon(verificationStatus.credentials)}
                onPress={() => router.push("/profile/credentials")}
              />
            </View>
          </>
        )}

        {/* Personal Details Section (Trades) */}
        {isTrades && (
          <>
            <ThemedText style={styles.sectionLabel}>PERSONAL DETAILS</ThemedText>
            <View style={styles.sectionCard}>
              <SettingsRow
                icon="person-outline"
                label="Name"
                value={displayName}
                locked={true}
              />
              <View style={styles.divider} />
              <SettingsRow
                icon="mail-outline"
                label="Email"
                value={email || "Not added"}
                onPress={() => router.push("/profile/change-email")}
              />
              <View style={styles.divider} />
              <SettingsRow
                icon="call-outline"
                label="Phone"
                value={phone || "Not added"}
                onPress={() => router.push("/profile/change-phone")}
              />
            </View>
          </>
        )}

        {/* Business Section (Trades only) */}
        {isTrades && (
          <>
            <ThemedText style={styles.sectionLabel}>BUSINESS</ThemedText>
            <View style={styles.sectionCard}>
              <SettingsRow
                icon="briefcase-outline"
                label="Business info"
                value={businessName || "Not set up"}
                onPress={() => router.push("/profile/business")}
              />
              <View style={styles.divider} />
              <SettingsRow
                icon="location-outline"
                label="Service areas"
                value={profile?.base_postcode || "Not set up"}
                onPress={() => router.push("/profile/service-areas")}
              />
            </View>
          </>
        )}

        {/* Personal Details Section (Client) */}
        {!isTrades && (
          <>
            <ThemedText style={styles.sectionLabel}>PERSONAL DETAILS</ThemedText>
            <View style={styles.sectionCard}>
              <SettingsRow
                icon="person-outline"
                label="Name"
                value={displayName}
                locked={true}
              />
              <View style={styles.divider} />
              <SettingsRow
                icon="mail-outline"
                label="Email"
                value={email || "Not added"}
                onPress={() => router.push("/profile/change-email")}
              />
              <View style={styles.divider} />
              <SettingsRow
                icon="call-outline"
                label="Phone"
                value={phone || "Not added"}
                onPress={() => router.push("/profile/change-phone")}
              />
              <View style={styles.divider} />
              <SettingsRow
                icon="home-outline"
                label="Address"
                value={profile?.address?.line1 || "Not added"}
                onPress={() => router.push("/profile/address")}
              />
            </View>
          </>
        )}

        {/* Appearance Section */}
        <ThemedText style={styles.sectionLabel}>APPEARANCE</ThemedText>
        <View style={styles.sectionCard}>
          <View style={styles.rowContainer}>
            <View style={styles.rowLeft}>
              <Ionicons name="contrast-outline" size={20} color={Colors.light.subtitle} />
              <View style={styles.rowTextContainer}>
                <ThemedText style={styles.rowLabel}>Theme</ThemedText>
                <ThemedText style={styles.rowValue}>
                  {themeMode === "system" ? "Match device" : themeMode === "dark" ? "Dark" : "Light"}
                </ThemedText>
              </View>
            </View>
            <View style={styles.themeSeg}>
              {[
                { key: "light",  label: "Light"  },
                { key: "dark",   label: "Dark"   },
                { key: "system", label: "Auto"   },
              ].map((opt) => {
                const on = themeMode === opt.key;
                return (
                  <Pressable
                    key={opt.key}
                    onPress={() => setThemeMode(opt.key)}
                    style={[
                      styles.themeSegBtn,
                      on && styles.themeSegBtnActive,
                    ]}
                  >
                    <ThemedText
                      style={[
                        styles.themeSegLabel,
                        on && styles.themeSegLabelActive,
                      ]}
                    >
                      {opt.label}
                    </ThemedText>
                  </Pressable>
                );
              })}
            </View>
          </View>
        </View>

        {/* Account Section */}
        <ThemedText style={styles.sectionLabel}>ACCOUNT</ThemedText>
        <View style={styles.sectionCard}>
          {isAdmin && (
            <>
              <SettingsRow
                icon="shield-checkmark-outline"
                label="Admin"
                onPress={() => router.push("/(admin)/reviews")}
              />
              <View style={styles.divider} />
            </>
          )}
          {__DEV__ && (
            <>
              <SettingsRow
                icon="code-slash-outline"
                label="Developer Settings"
                value="Environment & Debug"
                onPress={() => router.push("/profile/developer-settings")}
              />
              <View style={styles.divider} />
            </>
          )}
          <SettingsRow
            icon="notifications-outline"
            label="Notifications"
            onPress={() => router.push("/profile/notifications")}
          />
          <View style={styles.divider} />
          <SettingsRow
            icon="help-circle-outline"
            label="Help & support"
            onPress={() => router.push("/profile/help")}
          />
          <View style={styles.divider} />
          <SettingsRow
            icon="log-out-outline"
            label="Sign out"
            onPress={onSignOut}
          />
        </View>

        {/* App Version */}
        <View style={styles.versionContainer}>
          <ThemedText style={styles.versionText}>App version {appVersion}</ThemedText>
        </View>

        <Spacer height={insets.bottom + 180} />
      </ScrollView>
    </ThemedView>
  );
}

// Helper functions for verification status
function getVerificationStatusText(status) {
  switch (status) {
    case "verified": return "Verified";
    case "under_review":
    case "pending_review": return "Under review";
    case "submitted": return "Submitted";
    case "rejected": return "Rejected";
    case "expired": return "Expired";
    case "expiring_soon": return "Expiring soon";
    default: return "Not started";
  }
}

function getVerificationStatusIcon(status) {
  switch (status) {
    case "verified": return { name: "checkmark-circle", color: Colors.success };
    case "under_review":
    case "pending_review":
    case "submitted": return { name: "time-outline", color: "#3B82F6" };
    case "rejected":
    case "expired": return { name: "warning", color: "#DC2626" };
    case "expiring_soon": return { name: "warning", color: "#D97706" };
    default: return { name: "ellipse-outline", color: Colors.light.subtitle };
  }
}

// Settings Row Component
function SettingsRow({ icon, label, value, onPress, locked, statusIcon }) {
  const content = (
    <View style={styles.rowContainer}>
      <View style={styles.rowLeft}>
        <Ionicons name={icon} size={20} color={Colors.light.subtitle} />
        <View style={styles.rowTextContainer}>
          <ThemedText style={styles.rowLabel}>{label}</ThemedText>
          {value && (
            <ThemedText
              style={[
                styles.rowValue,
                statusIcon?.color && { color: statusIcon.color },
              ]}
              numberOfLines={1}
            >
              {value}
            </ThemedText>
          )}
        </View>
      </View>
      <View style={styles.rowRight}>
        {statusIcon && (
          <Ionicons name={statusIcon.name} size={18} color={statusIcon.color} style={{ marginRight: 8 }} />
        )}
        {locked ? (
          <Ionicons name="lock-closed" size={18} color={Colors.light.subtitle} />
        ) : onPress ? (
          <Ionicons name="chevron-forward" size={18} color={Colors.light.subtitle} />
        ) : null}
      </View>
    </View>
  );

  if (onPress && !locked) {
    return (
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [pressed && styles.rowPressed]}
      >
        {content}
      </Pressable>
    );
  }

  return content;
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
  scrollContent: {
    paddingHorizontal: 20,
  },
  // Banner base styles
  bannerContent: {
    flex: 1,
  },
  bannerText: {
    fontSize: 14,
    color: Colors.light.subtitle,
    lineHeight: 20,
    marginBottom: 12,
  },
  progressBar: {
    height: 4,
    backgroundColor: "#E5E7EB",
    borderRadius: 2,
    overflow: "hidden",
    marginBottom: 8,
  },
  progressFillAmber: {
    height: "100%",
    backgroundColor: "#F59E0B",
    borderRadius: 2,
  },
  progressFillGreen: {
    height: "100%",
    backgroundColor: "#10B981",
    borderRadius: 2,
  },
  progressText: {
    fontSize: 12,
    color: Colors.light.subtitle,
  },
  updateButton: {
    backgroundColor: Colors.primary,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    alignSelf: "flex-start",
    marginTop: 8,
  },
  updateButtonText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "600",
  },
  // Incomplete Banner (Amber)
  incompleteBanner: {
    flexDirection: "row",
    backgroundColor: "#FEF3C7",
    borderWidth: 1,
    borderColor: "#F59E0B",
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    gap: 12,
  },
  incompleteBannerTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: Colors.light.title,
    marginBottom: 4,
  },
  // Under Review Banner (Blue)
  reviewBanner: {
    flexDirection: "row",
    backgroundColor: "#DBEAFE",
    borderWidth: 1,
    borderColor: "#3B82F6",
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    gap: 12,
  },
  reviewBannerTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#3B82F6",
    marginBottom: 4,
  },
  // Complete Banner (Green)
  completeBanner: {
    flexDirection: "row",
    backgroundColor: "#D1FAE5",
    borderWidth: 1,
    borderColor: "#10B981",
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    gap: 12,
  },
  completeBannerTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#10B981",
    marginBottom: 4,
  },
  // Expiring Soon Banner (Amber)
  expiringBanner: {
    flexDirection: "row",
    backgroundColor: "#FEF3C7",
    borderWidth: 1,
    borderColor: "#F59E0B",
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    gap: 12,
  },
  expiringBannerTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#D97706",
    marginBottom: 4,
  },
  // Action Banner (Red)
  actionBanner: {
    flexDirection: "row",
    backgroundColor: "#FEE2E2",
    borderWidth: 1,
    borderColor: "#DC2626",
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    gap: 12,
  },
  actionBannerTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#DC2626",
    marginBottom: 4,
  },
  // Section
  sectionLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: Colors.light.subtitle,
    letterSpacing: 0.5,
    marginBottom: 8,
    marginTop: 8,
  },
  sectionCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.light.border,
    marginBottom: 16,
    overflow: "hidden",
  },
  divider: {
    height: 1,
    backgroundColor: Colors.light.border,
    marginLeft: 52,
  },
  // Row
  rowContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  rowPressed: {
    backgroundColor: Colors.light.secondaryBackground,
  },
  rowLeft: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  rowTextContainer: {
    marginLeft: 12,
    flex: 1,
  },
  rowLabel: {
    fontSize: 16,
    color: Colors.light.title,
  },
  rowValue: {
    fontSize: 14,
    color: Colors.light.subtitle,
    marginTop: 2,
  },
  rowRight: {
    flexDirection: "row",
    alignItems: "center",
  },
  // Theme segmented control (Appearance row)
  themeSeg: {
    flexDirection: "row",
    backgroundColor: "#F0F0F3",
    borderRadius: 9,
    padding: 3,
    gap: 2,
  },
  themeSegBtn: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 7,
  },
  themeSegBtnActive: {
    backgroundColor: "#0B0B0D",
  },
  themeSegLabel: {
    fontSize: 11.5,
    fontWeight: "600",
    color: Colors.light.subtitle,
  },
  themeSegLabelActive: {
    color: "#FFFFFF",
  },
  // Version
  versionContainer: {
    alignItems: "center",
    paddingVertical: 16,
    borderTopWidth: 1,
    borderTopColor: Colors.light.border,
    marginTop: 8,
  },
  versionText: {
    fontSize: 12,
    color: Colors.light.subtitle,
  },
});
