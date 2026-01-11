// app/(dashboard)/profile/index.jsx
// Profile page - shows profile card with burger menu to settings
import { useEffect, useState, useCallback } from "react";
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

import ThemedView from "../../../components/ThemedView";
import ThemedText from "../../../components/ThemedText";
import Spacer from "../../../components/Spacer";
import { Colors } from "../../../constants/Colors";

import { useUser } from "../../../hooks/useUser";
import { getMyRole, getMyProfile } from "../../../lib/api/profile";

const PRIMARY = Colors?.light?.tint || "#7C3AED";

// Keep tab label + icon
export const options = {
  title: "Profile",
  tabBarIcon: ({ color, size, focused }) => (
    <Ionicons name={focused ? "person-circle" : "person-circle-outline"} size={size} color={color} />
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

function getNameWithInitial(fullName) {
  if (!fullName) return "";
  const parts = fullName.trim().split(" ");
  if (parts.length >= 2) {
    return `${parts[0]} ${parts[parts.length - 1][0]}.`;
  }
  return fullName;
}

export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user, authChecked } = useUser();

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

  // Reload when screen comes into focus
  useFocusEffect(
    useCallback(() => {
      if (role && user?.id) {
        loadProfile();
      }
    }, [role, user?.id, loadProfile])
  );

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

  // Get display data
  const displayName = profile?.full_name || user?.email || "User";
  const businessName = profile?.business_name;
  const photoUrl = profile?.photo_url;
  const jobTitles = profile?.job_titles || [];
  const basePostcode = profile?.base_postcode;

  // Verification status
  const verification = profile?.verification || {
    photo_id: "not_started",
    insurance: "not_started",
    credentials: "not_started",
  };

  // Review data
  const reviewCount = profile?.review_count || 0;
  const averageRating = profile?.average_rating || 0;

  // Client data
  const projectCount = profile?.project_count || 0;

  return (
    <ThemedView style={[styles.container, { paddingTop: insets.top }]}>
      <StatusBar style="dark" />

      {/* Header */}
      <View style={styles.header}>
        <ThemedText style={styles.headerTitle}>Profile</ThemedText>
        <Pressable
          onPress={() => router.push("/profile/settings")}
          hitSlop={10}
          style={({ pressed }) => [pressed && { opacity: 0.7 }]}
        >
          <Ionicons name="menu-outline" size={26} color={Colors.light.title} />
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Profile Card */}
        {isTrades ? (
          <TradeProfileCard
            photoUrl={photoUrl}
            businessName={businessName}
            displayName={displayName}
            reviewCount={reviewCount}
            averageRating={averageRating}
            verification={verification}
            jobTitles={jobTitles}
            basePostcode={basePostcode}
          />
        ) : (
          <ClientProfileCard
            photoUrl={photoUrl}
            displayName={displayName}
            projectCount={projectCount}
          />
        )}

        <Spacer height={insets.bottom > 0 ? insets.bottom + 24 : 40} />
      </ScrollView>
    </ThemedView>
  );
}

// Trade Profile Card Component - Two column layout
function TradeProfileCard({
  photoUrl,
  businessName,
  displayName,
  reviewCount,
  averageRating,
  verification,
  jobTitles,
  basePostcode,
}) {
  const hasReviews = reviewCount > 0;

  return (
    <View style={styles.profileCard}>
      <View style={styles.cardColumns}>
        {/* Left Column: Avatar, Name, Badges */}
        <View style={styles.cardLeftColumn}>
          {/* Avatar */}
          <View style={styles.avatarContainer}>
            {photoUrl ? (
              <Image source={{ uri: photoUrl }} style={styles.cardAvatar} />
            ) : (
              <View style={[styles.cardAvatar, styles.avatarFallback]}>
                <ThemedText style={styles.avatarInitials}>
                  {getInitials(businessName || displayName)}
                </ThemedText>
              </View>
            )}
          </View>

          {/* Name Section */}
          <View style={styles.nameSection}>
            <ThemedText style={styles.cardBusinessName} numberOfLines={2}>
              {businessName || "Business Name"}
            </ThemedText>
            <ThemedText style={styles.cardPersonalName}>
              {getNameWithInitial(displayName)}
            </ThemedText>
          </View>

          {/* Verification Badges */}
          <View style={styles.badgesRow}>
            <VerificationBadge
              icon="person-outline"
              label="ID"
              status={verification.photo_id}
            />
            <VerificationBadge
              icon="shield-outline"
              label="Ins"
              status={verification.insurance}
            />
            <VerificationBadge
              icon="ribbon-outline"
              label="Cred"
              status={verification.credentials}
            />
          </View>
        </View>

        {/* Vertical Divider */}
        <View style={styles.verticalDivider} />

        {/* Right Column: Job Titles, Location, Reviews */}
        <View style={styles.cardRightColumn}>
          {/* Job Titles */}
          <View style={styles.rightSection}>
            {jobTitles.length > 0 ? (
              <ThemedText style={styles.jobTitlesText} numberOfLines={2}>
                {jobTitles.join(" · ")}
              </ThemedText>
            ) : (
              <ThemedText style={styles.emptyText}>No job titles</ThemedText>
            )}
          </View>

          {/* Divider */}
          <View style={styles.horizontalDivider} />

          {/* Location */}
          <View style={styles.rightSection}>
            <View style={styles.locationRow}>
              <Ionicons name="location" size={16} color={Colors.light.title} />
              <ThemedText style={styles.locationText} numberOfLines={1}>
                {basePostcode || "No location set"}
              </ThemedText>
            </View>
          </View>

          {/* Divider */}
          <View style={styles.horizontalDivider} />

          {/* Reviews */}
          <View style={styles.rightSection}>
            <View style={styles.reviewsRow}>
              <Ionicons name="star" size={16} color={Colors.light.title} />
              {hasReviews ? (
                <ThemedText style={styles.reviewsText}>
                  <ThemedText style={styles.ratingValue}>{averageRating.toFixed(1)}</ThemedText>
                  {" "}({reviewCount} review{reviewCount !== 1 ? "s" : ""})
                </ThemedText>
              ) : (
                <ThemedText style={styles.noReviewsText}>No reviews yet</ThemedText>
              )}
            </View>
          </View>
        </View>
      </View>
    </View>
  );
}

// Client Profile Card Component
function ClientProfileCard({ photoUrl, displayName, projectCount }) {
  return (
    <View style={styles.profileCard}>
      <View style={styles.clientCardContent}>
        {/* Avatar */}
        <View style={styles.avatarContainer}>
          {photoUrl ? (
            <Image source={{ uri: photoUrl }} style={styles.cardAvatar} />
          ) : (
            <View style={[styles.cardAvatar, styles.avatarFallback]}>
              <ThemedText style={styles.avatarInitials}>
                {getInitials(displayName)}
              </ThemedText>
            </View>
          )}
        </View>

        {/* Info */}
        <View style={styles.clientCardInfo}>
          <ThemedText style={styles.cardBusinessName}>{displayName}</ThemedText>
          <ThemedText style={styles.cardPersonalName}>
            {projectCount} project{projectCount !== 1 ? "s" : ""} completed
          </ThemedText>
        </View>
      </View>
    </View>
  );
}

// Verification Badge Component - No dots
function VerificationBadge({ icon, label, status }) {
  const isVerified = status === "verified";

  return (
    <View style={styles.badgeWrapper}>
      <View style={[
        styles.badgeIconContainer,
        isVerified ? styles.badgeVerified : styles.badgeNotVerified,
      ]}>
        <Ionicons
          name={icon}
          size={16}
          color={isVerified ? PRIMARY : "#D1D5DB"}
        />
        {isVerified && (
          <View style={styles.badgeCheckmark}>
            <Ionicons name="checkmark" size={8} color="#FFFFFF" />
          </View>
        )}
      </View>
      <ThemedText style={[
        styles.badgeLabel,
        isVerified ? styles.badgeLabelVerified : styles.badgeLabelNotVerified,
      ]}>
        {label}
      </ThemedText>
    </View>
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
    paddingTop: 8,
  },
  // Profile Card
  profileCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.light.border,
    padding: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
  },
  // Two-column layout
  cardColumns: {
    flexDirection: "row",
  },
  cardLeftColumn: {
    width: "40%",
    paddingRight: 12,
  },
  verticalDivider: {
    width: 1,
    backgroundColor: Colors.light.border,
  },
  cardRightColumn: {
    flex: 1,
    paddingLeft: 12,
    justifyContent: "space-between",
  },
  // Avatar
  avatarContainer: {
    alignItems: "center",
    marginBottom: 12,
  },
  cardAvatar: {
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
  // Name section
  nameSection: {
    alignItems: "center",
    marginBottom: 12,
  },
  cardBusinessName: {
    fontSize: 16,
    fontWeight: "600",
    color: Colors.light.title,
    textAlign: "center",
  },
  cardPersonalName: {
    fontSize: 13,
    color: Colors.light.subtitle,
    marginTop: 2,
    textAlign: "center",
  },
  // Badges Row
  badgesRow: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 8,
  },
  badgeWrapper: {
    alignItems: "center",
  },
  badgeIconContainer: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  badgeVerified: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: Colors.light.border,
  },
  badgeNotVerified: {
    backgroundColor: "#F9FAFB",
    borderWidth: 1,
    borderColor: "#D1D5DB",
    borderStyle: "dashed",
  },
  badgeCheckmark: {
    position: "absolute",
    top: -4,
    right: -4,
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: "#10B981",
    alignItems: "center",
    justifyContent: "center",
  },
  badgeLabel: {
    fontSize: 10,
    marginTop: 4,
  },
  badgeLabelVerified: {
    color: "#374151",
  },
  badgeLabelNotVerified: {
    color: "#9CA3AF",
  },
  // Right column sections
  rightSection: {
    paddingVertical: 8,
  },
  horizontalDivider: {
    height: 1,
    backgroundColor: Colors.light.border,
  },
  // Job titles
  jobTitlesText: {
    fontSize: 14,
    color: "#374151",
    fontWeight: "500",
    lineHeight: 20,
  },
  emptyText: {
    fontSize: 14,
    color: Colors.light.subtitle,
    fontStyle: "italic",
  },
  // Location
  locationRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  locationText: {
    fontSize: 14,
    color: "#374151",
    flex: 1,
  },
  // Reviews
  reviewsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  reviewsText: {
    fontSize: 14,
    color: Colors.light.subtitle,
  },
  ratingValue: {
    fontSize: 14,
    fontWeight: "600",
    color: Colors.light.title,
  },
  noReviewsText: {
    fontSize: 14,
    color: Colors.light.subtitle,
  },
  // Client card
  clientCardContent: {
    flexDirection: "row",
    alignItems: "center",
  },
  clientCardInfo: {
    marginLeft: 16,
    flex: 1,
  },
});
