// app/(dashboard)/profile/settings.jsx
// Settings — the burger-menu destination from the Profile tab.
//
// Dark-mode aware, typography tokens, pill-container grouping with
// eyebrow labels — same redesign language used on the Profile tab.
// Keeps every existing row, verification banners, theme switcher,
// and sign-out path intact.

import { useEffect, useState, useCallback } from "react";
import {
  StyleSheet,
  View,
  ScrollView,
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
import { FontFamily } from "../../../constants/Typography";

import { useUser } from "../../../hooks/useUser";
import { useTheme } from "../../../hooks/useTheme";
import useHideTabBar from "../../../hooks/useHideTabBar";
import { getMyRole, getMyProfile } from "../../../lib/api/profile";
import { getMyVerificationStatus } from "../../../lib/api/verification";
import { isCurrentUserAdmin } from "../../../lib/api/admin";
import ThemedStatusBar from "../../../components/ThemedStatusBar";

const PRIMARY = Colors.primary;

function normalizeRole(r) {
  if (r == null) return null;
  const s = String(r).trim().toLowerCase();
  if (["trade", "trades", "tradesman", "tradesperson", "business", "pro"].includes(s)) return "trades";
  if (["client", "customer", "homeowner", "user"].includes(s)) return "client";
  return s;
}

function verificationStatusText(status) {
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

function verificationStatusIcon(status, c) {
  switch (status) {
    case "verified": return { name: "checkmark-circle", color: "#10B981" };
    case "under_review":
    case "pending_review":
    case "submitted": return { name: "time-outline", color: "#3B82F6" };
    case "rejected":
    case "expired": return { name: "alert-circle", color: "#DC2626" };
    case "expiring_soon": return { name: "warning", color: "#D97706" };
    default: return { name: "ellipse-outline", color: c.textMuted };
  }
}

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user, authChecked } = useUser();
  const { colors: c, dark, mode: themeMode, setMode: setThemeMode } = useTheme();
  useHideTabBar();

  const [role, setRole] = useState(null);
  const [roleLoading, setRoleLoading] = useState(true);
  const [profile, setProfile] = useState(null);
  const [verification, setVerification] = useState(null);
  const [loadingData, setLoadingData] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);

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

  const loadProfile = useCallback(async () => {
    if (!user?.id) return;
    try {
      setLoadingData(true);
      const [me, verificationData, adminStatus] = await Promise.all([
        getMyProfile(),
        getMyVerificationStatus().catch(() => null),
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

  useEffect(() => {
    if (role) loadProfile();
  }, [user?.id, role, loadProfile]);

  useFocusEffect(
    useCallback(() => {
      if (role && user?.id) loadProfile();
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

  const verificationData = verification || {
    photo_id_status: "not_started",
    insurance_status: "not_started",
    credentials_status: "not_started",
  };
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
  const hasActionNeeded =
    verificationStatus.insurance === "expired" ||
    verificationStatus.photo_id === "rejected" ||
    verificationStatus.insurance === "rejected" ||
    verificationStatus.credentials === "rejected";
  const isExpiringSoon = verificationStatus.insurance === "expiring_soon";
  const hasUnderReview = [
    verificationStatus.photo_id,
    verificationStatus.insurance,
    verificationStatus.credentials,
  ].some((s) => s === "under_review" || s === "pending_review");

  const bannerState = (() => {
    if (hasActionNeeded) return "action";
    if (isExpiringSoon) return "expiring";
    if (isFullyVerified) return "complete";
    if (hasUnderReview && verificationCount < 3) return "review";
    if (verificationCount < 3) return "incomplete";
    return null;
  })();

  const displayName = profile?.full_name || user?.email || "User";
  const businessName = profile?.business_name;
  const email = profile?.email || user?.email;
  const phone = profile?.phone;
  const appVersion = Constants.expoConfig?.version || "1.0.0";

  return (
    <ThemedView style={[styles.container, { paddingTop: insets.top }]}>
      <ThemedStatusBar />

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Inline chevron — scrolls with the content. Same treatment
            as the Client Request page. Free-standing, no row chrome
            behind it.                                               */}
        <Pressable
          onPress={() => router.back()}
          hitSlop={10}
          style={({ pressed }) => [
            styles.chevronBtn,
            { backgroundColor: c.elevate, borderColor: c.border },
            pressed && { opacity: 0.7 },
          ]}
          accessibilityLabel="Back"
        >
          <Ionicons name="chevron-back" size={18} color={c.text} />
        </Pressable>

        {/* Standalone big title — same size / weight / position as
            Profile / Projects / Home.                              */}
        <View style={styles.titleBlock}>
          <ThemedText style={[styles.pageTitle, { color: c.text }]}>
            Settings
          </ThemedText>
        </View>

        {/* Verification banners (trades only) */}
        {isTrades && bannerState && (
          <VerificationBanner
            state={bannerState}
            c={c}
            verificationCount={verificationCount}
            verificationStatus={verificationStatus}
            onUpdatePress={() => router.push("/profile/insurance")}
          />
        )}

        {isTrades && (
          <Section c={c} eyebrow="VERIFICATION">
            <SettingsRow
              c={c}
              icon="person-outline"
              label="Photo ID"
              value={verificationStatusText(verificationStatus.photo_id)}
              statusIcon={verificationStatusIcon(verificationStatus.photo_id, c)}
              onPress={() => router.push("/profile/photo-id")}
            />
            <RowDivider c={c} />
            <SettingsRow
              c={c}
              icon="shield-outline"
              label="Insurance"
              value={verificationStatusText(verificationStatus.insurance)}
              statusIcon={verificationStatusIcon(verificationStatus.insurance, c)}
              onPress={() => router.push("/profile/insurance")}
            />
            <RowDivider c={c} />
            <SettingsRow
              c={c}
              icon="ribbon-outline"
              label="Credentials"
              value={verificationStatusText(verificationStatus.credentials)}
              statusIcon={verificationStatusIcon(verificationStatus.credentials, c)}
              onPress={() => router.push("/profile/credentials")}
            />
          </Section>
        )}

        <Section c={c} eyebrow="PERSONAL DETAILS">
          <SettingsRow
            c={c}
            icon="person-outline"
            label="Name"
            value={displayName}
            locked
          />
          <RowDivider c={c} />
          <SettingsRow
            c={c}
            icon="mail-outline"
            label="Email"
            value={email || "Not added"}
            onPress={() => router.push("/profile/change-email")}
          />
          <RowDivider c={c} />
          <SettingsRow
            c={c}
            icon="call-outline"
            label="Phone"
            value={phone || "Not added"}
            onPress={() => router.push("/profile/change-phone")}
          />
          {!isTrades && (
            <>
              <RowDivider c={c} />
              <SettingsRow
                c={c}
                icon="home-outline"
                label="Address"
                value={profile?.address?.line1 || "Not added"}
                onPress={() => router.push("/profile/address")}
              />
            </>
          )}
        </Section>

        {isTrades && (
          <Section c={c} eyebrow="BUSINESS">
            <SettingsRow
              c={c}
              icon="briefcase-outline"
              label="Business info"
              value={businessName || "Not set up"}
              onPress={() => router.push("/profile/business")}
            />
            <RowDivider c={c} />
            <SettingsRow
              c={c}
              icon="location-outline"
              label="Service areas"
              value={profile?.base_postcode || "Not set up"}
              onPress={() => router.push("/profile/service-areas")}
            />
          </Section>
        )}

        <Section c={c} eyebrow="APPEARANCE">
          <View style={styles.rowContainer}>
            <View style={styles.rowLeft}>
              <View style={[
                styles.rowIconWrap,
                { backgroundColor: c.elevate, borderColor: c.border },
              ]}>
                <Ionicons name="contrast-outline" size={16} color={c.textMid} />
              </View>
              <View style={styles.rowTextCol}>
                <ThemedText style={[styles.rowLabel, { color: c.text }]}>Theme</ThemedText>
                <ThemedText style={[styles.rowValue, { color: c.textMid }]}>
                  {themeMode === "system" ? "Match device" : themeMode === "dark" ? "Dark" : "Light"}
                </ThemedText>
              </View>
            </View>
            <View style={[
              styles.themeSeg,
              { backgroundColor: c.elevate, borderColor: c.border },
            ]}>
              {[
                { key: "light",  label: "Light" },
                { key: "dark",   label: "Dark"  },
                { key: "system", label: "Auto"  },
              ].map((opt) => {
                const on = themeMode === opt.key;
                return (
                  <Pressable
                    key={opt.key}
                    onPress={() => setThemeMode(opt.key)}
                    style={[
                      styles.themeSegBtn,
                      on && { backgroundColor: c.text },
                    ]}
                  >
                    <ThemedText
                      style={[
                        styles.themeSegLabel,
                        { color: on ? c.background : c.textMid },
                      ]}
                    >
                      {opt.label}
                    </ThemedText>
                  </Pressable>
                );
              })}
            </View>
          </View>
        </Section>

        <Section c={c} eyebrow="ACCOUNT">
          {isAdmin && (
            <>
              <SettingsRow
                c={c}
                icon="shield-checkmark-outline"
                label="Admin"
                onPress={() => router.push("/(admin)/reviews")}
              />
              <RowDivider c={c} />
            </>
          )}
          {__DEV__ && (
            <>
              <SettingsRow
                c={c}
                icon="code-slash-outline"
                label="Developer settings"
                value="Environment & debug"
                onPress={() => router.push("/profile/developer-settings")}
              />
              <RowDivider c={c} />
            </>
          )}
          <SettingsRow
            c={c}
            icon="notifications-outline"
            label="Notifications"
            onPress={() => router.push("/profile/notifications")}
          />
          <RowDivider c={c} />
          <SettingsRow
            c={c}
            icon="help-circle-outline"
            label="Help & support"
            onPress={() => router.push("/profile/help")}
          />
          <RowDivider c={c} />
          <SettingsRow
            c={c}
            icon="log-out-outline"
            label="Sign out"
            onPress={onSignOut}
            destructive
          />
        </Section>

        <View style={[styles.versionContainer, { borderTopColor: c.border }]}>
          <ThemedText style={[styles.versionText, { color: c.textMuted }]}>
            App version {appVersion}
          </ThemedText>
        </View>

        <Spacer height={insets.bottom + 180} />
      </ScrollView>
    </ThemedView>
  );
}

// ======================================================================
// Sub-components
// ======================================================================

function Section({ c, eyebrow, children }) {
  return (
    <>
      <ThemedText style={[styles.sectionEyebrow, { color: c.textMuted }]}>
        {eyebrow}
      </ThemedText>
      <View style={[
        styles.sectionCard,
        { backgroundColor: c.elevate2, borderColor: c.borderStrong },
      ]}>
        {children}
      </View>
    </>
  );
}

function RowDivider({ c }) {
  return <View style={[styles.rowDivider, { backgroundColor: c.border }]} />;
}

function SettingsRow({ c, icon, label, value, onPress, locked, statusIcon, destructive }) {
  const labelColor = destructive ? "#DC2626" : c.text;
  const content = (
    <View style={styles.rowContainer}>
      <View style={styles.rowLeft}>
        <View style={[
          styles.rowIconWrap,
          {
            backgroundColor: destructive ? "#FEE2E2" : c.elevate,
            borderColor: destructive ? "#FCA5A5" : c.border,
          },
        ]}>
          <Ionicons
            name={icon}
            size={16}
            color={destructive ? "#DC2626" : c.textMid}
          />
        </View>
        <View style={styles.rowTextCol}>
          <ThemedText style={[styles.rowLabel, { color: labelColor }]}>
            {label}
          </ThemedText>
          {!!value && (
            <ThemedText
              style={[
                styles.rowValue,
                { color: statusIcon?.color || c.textMid },
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
          <Ionicons
            name={statusIcon.name}
            size={16}
            color={statusIcon.color}
            style={{ marginRight: 8 }}
          />
        )}
        {locked ? (
          <Ionicons name="lock-closed" size={16} color={c.textMuted} />
        ) : onPress ? (
          <Ionicons name="chevron-forward" size={16} color={c.textMuted} />
        ) : null}
      </View>
    </View>
  );

  if (onPress && !locked) {
    return (
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [pressed && { opacity: 0.6 }]}
      >
        {content}
      </Pressable>
    );
  }
  return content;
}

function VerificationBanner({ state, c, verificationCount, verificationStatus, onUpdatePress }) {
  const configs = {
    incomplete: {
      bg: "#FEF3C7", border: "#F59E0B", titleColor: c.text,
      icon: "warning", iconColor: "#F59E0B",
      title: "Complete verification",
      body: verificationCount === 0
        ? "Verify your details to start receiving quote requests from customers."
        : `${3 - verificationCount} more step${3 - verificationCount !== 1 ? "s" : ""} to start receiving quotes.`,
      progress: verificationCount,
      progressColor: "#F59E0B",
      action: null,
    },
    review: {
      bg: "#DBEAFE", border: "#3B82F6", titleColor: "#3B82F6",
      icon: "time-outline", iconColor: "#3B82F6",
      title: "Under review",
      body: "We're checking your documents. This usually takes 1–2 business days.",
      progress: null,
      action: null,
    },
    complete: {
      bg: "#D1FAE5", border: "#10B981", titleColor: "#10B981",
      icon: "checkmark-circle", iconColor: "#10B981",
      title: "Verification complete",
      body: "You're all set! Clients can now find you and request quotes.",
      progress: 3,
      progressColor: "#10B981",
      action: null,
    },
    expiring: {
      bg: "#FEF3C7", border: "#F59E0B", titleColor: "#D97706",
      icon: "warning", iconColor: "#F59E0B",
      title: "Insurance expiring soon",
      body: "Your insurance is expiring soon. Upload your renewal to continue receiving quotes.",
      progress: null,
      action: "Update now",
    },
    action: {
      bg: "#FEE2E2", border: "#DC2626", titleColor: "#DC2626",
      icon: "alert-circle", iconColor: "#DC2626",
      title: "Action required",
      body: verificationStatus.insurance === "expired"
        ? "Your insurance has expired. Upload a new certificate to continue receiving quotes."
        : "There's an issue with your verification. Please check and resubmit.",
      progress: null,
      action: "Update now",
    },
  };
  const cfg = configs[state];
  if (!cfg) return null;
  return (
    <View style={[styles.banner, { backgroundColor: cfg.bg, borderColor: cfg.border }]}>
      <Ionicons name={cfg.icon} size={20} color={cfg.iconColor} />
      <View style={{ flex: 1 }}>
        <ThemedText style={[styles.bannerTitle, { color: cfg.titleColor }]}>
          {cfg.title}
        </ThemedText>
        <ThemedText style={[styles.bannerBody, { color: "#374151" }]}>
          {cfg.body}
        </ThemedText>
        {cfg.progress != null && (
          <>
            <View style={styles.progressTrack}>
              <View
                style={[
                  styles.progressFill,
                  {
                    width: `${(cfg.progress / 3) * 100}%`,
                    backgroundColor: cfg.progressColor,
                  },
                ]}
              />
            </View>
            <ThemedText style={[styles.progressText, { color: "#6B7280" }]}>
              {cfg.progress} of 3 complete
            </ThemedText>
          </>
        )}
        {cfg.action && (
          <Pressable
            onPress={onUpdatePress}
            style={({ pressed }) => [
              styles.bannerAction,
              pressed && { opacity: 0.85 },
            ]}
          >
            <ThemedText style={styles.bannerActionText}>{cfg.action}</ThemedText>
          </Pressable>
        )}
      </View>
    </View>
  );
}

// ======================================================================
// Styles
// ======================================================================

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  // Inline chevron — sits at the top of the ScrollView content so it
  // scrolls away with the page (matches Client Request). Free-standing,
  // no row or background block behind it.
  chevronBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 14,
  },
  // Title block — standalone Public Sans Bold 32pt, matches Profile /
  // Projects / Home tabs exactly.
  titleBlock: {
    paddingTop: 0,
    paddingBottom: 16,
  },
  pageTitle: {
    fontFamily: FontFamily.headerBold,
    fontSize: 32,
    lineHeight: 34,
    letterSpacing: -0.8,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 12,
  },

  // Banners
  banner: {
    flexDirection: "row",
    gap: 12,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 18,
  },
  bannerTitle: {
    fontFamily: FontFamily.headerSemibold,
    fontSize: 15,
    marginBottom: 4,
  },
  bannerBody: {
    fontFamily: FontFamily.bodyRegular,
    fontSize: 13.5,
    lineHeight: 19,
    marginBottom: 8,
  },
  progressTrack: {
    height: 4,
    backgroundColor: "rgba(0,0,0,0.06)",
    borderRadius: 2,
    overflow: "hidden",
    marginBottom: 6,
  },
  progressFill: {
    height: "100%",
    borderRadius: 2,
  },
  progressText: {
    fontFamily: FontFamily.bodyRegular,
    fontSize: 11.5,
  },
  bannerAction: {
    alignSelf: "flex-start",
    backgroundColor: PRIMARY,
    paddingVertical: 9,
    paddingHorizontal: 14,
    borderRadius: 10,
    marginTop: 10,
  },
  bannerActionText: {
    fontFamily: FontFamily.headerSemibold,
    fontSize: 13,
    color: "#FFFFFF",
    letterSpacing: -0.1,
  },

  // Section
  sectionEyebrow: {
    fontFamily: FontFamily.headerBold,
    fontSize: 11,
    letterSpacing: 1.2,
    textTransform: "uppercase",
    marginTop: 12,
    marginBottom: 8,
    paddingHorizontal: 2,
  },
  sectionCard: {
    borderRadius: 18,
    borderWidth: 1,
    overflow: "hidden",
  },
  rowDivider: {
    height: 1,
    marginLeft: 60,
  },

  // Row
  rowContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  rowLeft: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    minWidth: 0,
  },
  rowIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  rowTextCol: {
    marginLeft: 12,
    flex: 1,
    minWidth: 0,
  },
  rowLabel: {
    fontFamily: FontFamily.bodyMedium,
    fontSize: 15,
  },
  rowValue: {
    fontFamily: FontFamily.bodyRegular,
    fontSize: 13,
    marginTop: 2,
  },
  rowRight: {
    flexDirection: "row",
    alignItems: "center",
    paddingLeft: 8,
  },

  // Theme segmented control
  themeSeg: {
    flexDirection: "row",
    borderRadius: 9,
    borderWidth: 1,
    padding: 3,
    gap: 2,
  },
  themeSegBtn: {
    paddingVertical: 5,
    paddingHorizontal: 9,
    borderRadius: 7,
  },
  themeSegLabel: {
    fontFamily: FontFamily.headerSemibold,
    fontSize: 11.5,
  },

  // Version footer
  versionContainer: {
    alignItems: "center",
    paddingVertical: 18,
    borderTopWidth: 1,
    marginTop: 14,
  },
  versionText: {
    fontFamily: FontFamily.bodyRegular,
    fontSize: 12,
  },
});
