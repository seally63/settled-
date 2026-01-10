// app/(dashboard)/profile/index.jsx
import { useEffect, useState, useCallback, useRef } from "react";
import {
  StyleSheet,
  View,
  ScrollView,
  Image,
  ActivityIndicator,
  Pressable,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter, useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import Constants from "expo-constants";

import ThemedView from "../../../components/ThemedView";
import ThemedText from "../../../components/ThemedText";
import Spacer from "../../../components/Spacer";
import { Colors } from "../../../constants/Colors";

import { useUser } from "../../../hooks/useUser";
import { getMyRole, getMyProfile } from "../../../lib/api/profile";

// Keep tab label + icon
export const options = {
  title: "Profile",
  tabBarIcon: ({ color, size, focused }) => (
    <Ionicons name={focused ? "person" : "person-outline"} size={size} color={color} />
  ),
};

function normalizeRole(r) {
  if (r == null) return null;
  const s = String(r).trim().toLowerCase();
  if (["trade", "trades", "tradesman", "tradesperson", "business", "pro"].includes(s)) return "trades";
  if (["client", "customer", "homeowner", "user"].includes(s)) return "client";
  return s;
}

function getInitials(name) {
  if (!name) return "?";
  const parts = name.trim().split(" ");
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
}

export default function MyProfileScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user, authChecked, logout } = useUser();

  const [role, setRole] = useState(null);
  const [roleLoading, setRoleLoading] = useState(true);
  const [profile, setProfile] = useState(null);
  const [loadingData, setLoadingData] = useState(true);

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

  // Load profile data
  const loadProfile = useCallback(async () => {
    if (!user?.id) return;
    try {
      setLoadingData(true);
      const me = await getMyProfile();
      setProfile(me || null);
    } finally {
      setLoadingData(false);
    }
  }, [user?.id]);

  // Initial load
  useEffect(() => {
    if (role) loadProfile();
  }, [user?.id, role, loadProfile]);

  // Reload when screen comes into focus (e.g., after updating photo)
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
        <StatusBar style="dark" />
        <View style={styles.loadingContainer}>
          <ActivityIndicator />
        </View>
      </ThemedView>
    );
  }

  const isTrades = role === "trades";

  // Verification status (mock for now - would come from profile data)
  const verification = profile?.verification || {
    photo_id: "not_started",
    insurance: "not_started",
    credentials: "not_started",
  };

  const verificationCount = [
    verification.photo_id === "verified",
    verification.insurance === "verified",
    verification.credentials === "verified",
  ].filter(Boolean).length;

  const isFullyVerified = verificationCount === 3;
  const hasActionNeeded = verification.insurance === "expired" || verification.insurance === "expiring_soon";

  // Get display name
  const displayName = profile?.full_name || user?.email || "User";
  const businessName = profile?.business_name;
  const email = profile?.email || user?.email;
  const phone = profile?.phone;
  const photoUrl = profile?.photo_url;

  const appVersion = Constants.expoConfig?.version || "1.0.0";

  return (
    <ThemedView style={[styles.container, { paddingTop: insets.top }]}>
      <StatusBar style="dark" />

      {/* Header */}
      <View style={styles.header}>
        <ThemedText style={styles.headerTitle}>Profile</ThemedText>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Profile Header Card */}
        <View style={styles.profileCard}>
          {/* Avatar */}
          <Pressable
            style={styles.avatarContainer}
            onPress={() => router.push("/profile/photo")}
          >
            {photoUrl ? (
              <Image source={{ uri: photoUrl }} style={styles.avatar} />
            ) : (
              <View style={[styles.avatar, styles.avatarFallback]}>
                <ThemedText style={styles.avatarInitials}>
                  {getInitials(displayName)}
                </ThemedText>
              </View>
            )}
          </Pressable>
          <Pressable onPress={() => router.push("/profile/photo")}>
            <ThemedText style={styles.photoLink}>
              {photoUrl ? "Edit" : "+ Add photo"}
            </ThemedText>
          </Pressable>

          <Spacer height={12} />

          {/* Name display */}
          {isTrades && businessName ? (
            <>
              <ThemedText style={styles.businessName}>{businessName}</ThemedText>
              <ThemedText style={styles.personalName}>{displayName}</ThemedText>
            </>
          ) : (
            <>
              <ThemedText style={styles.businessName}>{displayName}</ThemedText>
              <ThemedText style={styles.emailText}>{email}</ThemedText>
            </>
          )}

          {/* Verification badge for trades */}
          {isTrades && (
            <View style={styles.badgeContainer}>
              {isFullyVerified ? (
                <View style={styles.verifiedBadge}>
                  <Ionicons name="checkmark-circle" size={14} color={Colors.success} />
                  <ThemedText style={styles.verifiedText}>Verified</ThemedText>
                </View>
              ) : hasActionNeeded ? (
                <View style={styles.actionBadge}>
                  <Ionicons name="warning" size={14} color="#D97706" />
                  <ThemedText style={styles.actionText}>Action needed</ThemedText>
                </View>
              ) : null}
            </View>
          )}
        </View>

        {/* Verification Banner for Trades */}
        {isTrades && !isFullyVerified && !hasActionNeeded && (
          <View style={styles.verificationBanner}>
            <Ionicons name="warning" size={20} color="#D97706" />
            <View style={styles.bannerContent}>
              <ThemedText style={styles.bannerTitle}>Complete verification</ThemedText>
              <ThemedText style={styles.bannerText}>
                Verify your details to start receiving quote requests from customers.
              </ThemedText>
              <View style={styles.progressBar}>
                <View style={[styles.progressFill, { width: `${(verificationCount / 3) * 100}%` }]} />
              </View>
              <ThemedText style={styles.progressText}>{verificationCount} of 3 complete</ThemedText>
            </View>
          </View>
        )}

        {/* Action needed banner */}
        {isTrades && hasActionNeeded && (
          <View style={styles.actionBanner}>
            <Ionicons name="warning" size={20} color="#DC2626" />
            <View style={styles.bannerContent}>
              <ThemedText style={styles.actionBannerTitle}>Insurance expired</ThemedText>
              <ThemedText style={styles.bannerText}>
                Your insurance has expired. Upload a new certificate to continue receiving quotes.
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
              <ProfileRow
                icon="person-outline"
                label="Photo ID"
                value={getVerificationStatusText(verification.photo_id)}
                statusIcon={getVerificationStatusIcon(verification.photo_id)}
                onPress={() => router.push("/profile/photo-id")}
              />
              <View style={styles.divider} />
              <ProfileRow
                icon="shield-outline"
                label="Insurance"
                value={getVerificationStatusText(verification.insurance)}
                statusIcon={getVerificationStatusIcon(verification.insurance)}
                onPress={() => router.push("/profile/insurance")}
              />
              <View style={styles.divider} />
              <ProfileRow
                icon="ribbon-outline"
                label="Credentials"
                value={getVerificationStatusText(verification.credentials)}
                statusIcon={getVerificationStatusIcon(verification.credentials)}
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
              <ProfileRow
                icon="person-outline"
                label="Name"
                value={displayName}
                locked={true}
              />
              <View style={styles.divider} />
              <ProfileRow
                icon="mail-outline"
                label="Email"
                value={email || "Not added"}
                onPress={() => router.push("/profile/change-email")}
              />
              <View style={styles.divider} />
              <ProfileRow
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
              <ProfileRow
                icon="briefcase-outline"
                label="Business info"
                value={businessName || "Not set up"}
                onPress={() => router.push("/profile/business")}
              />
              <View style={styles.divider} />
              <ProfileRow
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
              <ProfileRow
                icon="person-outline"
                label="Name"
                value={displayName}
                locked={true}
              />
              <View style={styles.divider} />
              <ProfileRow
                icon="mail-outline"
                label="Email"
                value={email || "Not added"}
                onPress={() => router.push("/profile/change-email")}
              />
              <View style={styles.divider} />
              <ProfileRow
                icon="call-outline"
                label="Phone"
                value={phone || "Not added"}
                onPress={() => router.push("/profile/change-phone")}
              />
              <View style={styles.divider} />
              <ProfileRow
                icon="home-outline"
                label="Address"
                value={profile?.address?.line1 || "Not added"}
                onPress={() => router.push("/profile/address")}
              />
            </View>
          </>
        )}

        {/* Account Section */}
        <ThemedText style={styles.sectionLabel}>ACCOUNT</ThemedText>
        <View style={styles.sectionCard}>
          <ProfileRow
            icon="notifications-outline"
            label="Notifications"
            onPress={() => router.push("/profile/notifications")}
          />
          <View style={styles.divider} />
          <ProfileRow
            icon="help-circle-outline"
            label="Help & support"
            onPress={() => router.push("/profile/help")}
          />
          <View style={styles.divider} />
          <ProfileRow
            icon="log-out-outline"
            label="Sign out"
            onPress={onSignOut}
          />
        </View>

        {/* App Version */}
        <View style={styles.versionContainer}>
          <ThemedText style={styles.versionText}>App version {appVersion}</ThemedText>
        </View>

        <Spacer height={40} />
      </ScrollView>
    </ThemedView>
  );
}

// Helper functions for verification status
function getVerificationStatusText(status) {
  switch (status) {
    case "verified": return "Verified";
    case "under_review": return "Under review";
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
    case "submitted": return { name: "time-outline", color: "#3B82F6" };
    case "rejected":
    case "expired": return { name: "warning", color: "#DC2626" };
    case "expiring_soon": return { name: "warning", color: "#D97706" };
    default: return { name: "ellipse-outline", color: Colors.light.subtitle };
  }
}

// Profile Row Component
function ProfileRow({ icon, label, value, onPress, locked, statusIcon }) {
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
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 12,
    backgroundColor: "#FFFFFF",
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: "700",
    color: Colors.light.title,
  },
  scrollContent: {
    paddingHorizontal: 20,
  },
  // Profile Card
  profileCard: {
    alignItems: "center",
    paddingVertical: 24,
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.light.border,
    marginBottom: 16,
  },
  avatarContainer: {},
  avatar: {
    width: 72,
    height: 72,
    borderRadius: 36,
  },
  avatarFallback: {
    backgroundColor: Colors.light.secondaryBackground,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarInitials: {
    fontSize: 24,
    fontWeight: "600",
    color: Colors.light.subtitle,
  },
  photoLink: {
    fontSize: 12,
    color: Colors.primary,
    marginTop: 8,
  },
  businessName: {
    fontSize: 20,
    fontWeight: "600",
    color: Colors.light.title,
    textAlign: "center",
  },
  personalName: {
    fontSize: 14,
    color: Colors.light.subtitle,
    marginTop: 2,
  },
  emailText: {
    fontSize: 14,
    color: Colors.light.subtitle,
    marginTop: 4,
  },
  badgeContainer: {
    marginTop: 8,
  },
  verifiedBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  verifiedText: {
    fontSize: 14,
    color: Colors.success,
    fontWeight: "500",
  },
  actionBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  actionText: {
    fontSize: 14,
    color: "#D97706",
    fontWeight: "500",
  },
  // Verification Banner
  verificationBanner: {
    flexDirection: "row",
    backgroundColor: "#FEF3C7",
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    gap: 12,
  },
  bannerContent: {
    flex: 1,
  },
  bannerTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: Colors.light.title,
    marginBottom: 4,
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
  progressFill: {
    height: "100%",
    backgroundColor: Colors.primary,
    borderRadius: 2,
  },
  progressText: {
    fontSize: 12,
    color: Colors.light.subtitle,
  },
  // Action Banner
  actionBanner: {
    flexDirection: "row",
    backgroundColor: "#FEE2E2",
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    gap: 12,
  },
  actionBannerTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: "#DC2626",
    marginBottom: 4,
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
