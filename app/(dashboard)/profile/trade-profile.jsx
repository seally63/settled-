// app/(dashboard)/profile/trade-profile.jsx
// Trade Profile page - shows detailed trade profile with reviews, services, etc.
import { useEffect, useState, useCallback } from "react";
import {
  StyleSheet,
  View,
  ScrollView,
  Image,
  ActivityIndicator,
  Pressable,
  FlatList,
  Dimensions,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter, useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import ThemedView from "../../../components/ThemedView";
import ThemedText from "../../../components/ThemedText";
import Spacer from "../../../components/Spacer";
import { ProfilePageSkeleton } from "../../../components/Skeleton";
import { Colors } from "../../../constants/Colors";

import { useUser } from "../../../hooks/useUser";
import { getMyProfile } from "../../../lib/api/profile";
import { getServiceCategories, getServiceTypes } from "../../../lib/api/services";

const { width: SCREEN_WIDTH } = Dimensions.get("window");

function getInitials(name) {
  if (!name) return "?";
  const parts = name.trim().split(" ");
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
}

export default function TradeProfileScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useUser();

  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [serviceNames, setServiceNames] = useState({});
  const [loadingServices, setLoadingServices] = useState(false);

  // Load profile data
  const loadProfile = useCallback(async () => {
    if (!user?.id) return;
    try {
      setLoading(true);
      const me = await getMyProfile();
      setProfile(me || null);
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  // Load service names for display
  const loadServiceNames = useCallback(async () => {
    try {
      setLoadingServices(true);
      const cats = await getServiceCategories();
      const namesMap = {};

      for (const cat of cats) {
        const types = await getServiceTypes(cat.id);
        for (const type of types) {
          namesMap[type.id] = { name: type.name, category: cat.name };
        }
      }
      setServiceNames(namesMap);
    } catch (e) {
      console.log("Error loading service names:", e);
    } finally {
      setLoadingServices(false);
    }
  }, []);

  useEffect(() => {
    loadProfile();
    loadServiceNames();
  }, [loadProfile, loadServiceNames]);

  useFocusEffect(
    useCallback(() => {
      if (user?.id) {
        loadProfile();
      }
    }, [user?.id, loadProfile])
  );

  if (loading) {
    return (
      <ThemedView style={[styles.container, { paddingTop: insets.top }]}>
        <StatusBar style="dark" />
        <ProfilePageSkeleton paddingTop={16} />
      </ThemedView>
    );
  }

  // Extract profile data
  const displayName = profile?.full_name || "User";
  const businessName = profile?.business_name || "Business Name";
  const photoUrl = profile?.photo_url;
  const bio = profile?.bio;
  const jobTitles = profile?.job_titles || [];
  const serviceTypeIds = profile?.service_type_ids || [];
  const basePostcode = profile?.base_postcode;

  // Verification status
  const verification = profile?.verification || {
    photo_id: "not_started",
    insurance: "not_started",
    credentials: "not_started",
  };

  // Review data (mock for now)
  const reviewCount = profile?.review_count || 0;
  const averageRating = profile?.average_rating || 0;
  const reviews = profile?.reviews || [];

  // Group services by category
  const groupedServices = {};
  for (const id of serviceTypeIds) {
    const service = serviceNames[id];
    if (service) {
      if (!groupedServices[service.category]) {
        groupedServices[service.category] = [];
      }
      groupedServices[service.category].push(service.name);
    }
  }

  return (
    <ThemedView style={[styles.container, { paddingTop: insets.top }]}>
      <StatusBar style="dark" />

      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={10}>
          <Ionicons name="chevron-back" size={24} color={Colors.light.title} />
        </Pressable>
        <ThemedText style={styles.headerTitle}>Profile</ThemedText>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Hero Card */}
        <View style={styles.heroCard}>
          {/* Avatar */}
          <View style={styles.avatarContainer}>
            {photoUrl ? (
              <Image source={{ uri: photoUrl }} style={styles.avatar} />
            ) : (
              <View style={[styles.avatar, styles.avatarFallback]}>
                <ThemedText style={styles.avatarInitials}>
                  {getInitials(businessName || displayName)}
                </ThemedText>
              </View>
            )}
          </View>

          <Spacer height={16} />

          {/* Names */}
          <ThemedText style={styles.businessName}>{businessName}</ThemedText>
          <ThemedText style={styles.personalName}>{displayName}</ThemedText>

          <Spacer height={16} />

          {/* Verification Badges */}
          <View style={styles.badgesRow}>
            <VerificationBadge
              icon="person-outline"
              label="ID"
              status={verification.photo_id}
            />
            <VerificationBadge
              icon="shield-outline"
              label="Insurance"
              status={verification.insurance}
            />
            <VerificationBadge
              icon="ribbon-outline"
              label="Credentials"
              status={verification.credentials}
            />
          </View>

          <Spacer height={16} />

          {/* Rating */}
          {reviewCount > 0 ? (
            <Pressable style={styles.ratingRow} onPress={() => {}}>
              <Ionicons name="star" size={18} color="#F59E0B" />
              <ThemedText style={styles.ratingText}>
                {averageRating.toFixed(1)} ({reviewCount} review{reviewCount !== 1 ? "s" : ""})
              </ThemedText>
            </Pressable>
          ) : (
            <ThemedText style={styles.noRatingText}>No reviews yet</ThemedText>
          )}
        </View>

        {/* About Section */}
        <ThemedText style={styles.sectionLabel}>ABOUT</ThemedText>
        <View style={styles.sectionCard}>
          {/* Job Titles */}
          {jobTitles.length > 0 && (
            <ThemedText style={styles.jobTitlesText}>
              {jobTitles.join(" · ")}
            </ThemedText>
          )}

          {/* Location */}
          {basePostcode && (
            <View style={styles.locationRow}>
              <Ionicons name="location-outline" size={16} color={Colors.light.subtitle} />
              <ThemedText style={styles.locationText}>{basePostcode}</ThemedText>
            </View>
          )}

          {/* Bio */}
          {bio && (
            <>
              <Spacer height={12} />
              <ThemedText style={styles.bioText}>{bio}</ThemedText>
            </>
          )}

          {!jobTitles.length && !basePostcode && !bio && (
            <ThemedText style={styles.emptyText}>No information added yet</ThemedText>
          )}
        </View>

        {/* Services Offered Section */}
        {Object.keys(groupedServices).length > 0 && (
          <>
            <ThemedText style={styles.sectionLabel}>SERVICES OFFERED</ThemedText>
            <View style={styles.sectionCard}>
              {Object.entries(groupedServices).map(([category, services]) => (
                <View key={category} style={styles.serviceCategoryGroup}>
                  <ThemedText style={styles.serviceCategoryLabel}>{category}</ThemedText>
                  <View style={styles.serviceChipsContainer}>
                    {services.map((service) => (
                      <View key={service} style={styles.serviceChip}>
                        <ThemedText style={styles.serviceChipText}>{service}</ThemedText>
                      </View>
                    ))}
                  </View>
                </View>
              ))}
            </View>
          </>
        )}

        {/* Reviews Section */}
        <ThemedText style={styles.sectionLabel}>REVIEWS</ThemedText>
        <View style={styles.sectionCard}>
          {reviews.length > 0 ? (
            <>
              {reviews.slice(0, 3).map((review, index) => (
                <View key={review.id || index}>
                  {index > 0 && <View style={styles.reviewDivider} />}
                  <ReviewCard review={review} />
                </View>
              ))}
              {reviews.length > 3 && (
                <Pressable style={styles.seeAllLink} onPress={() => {}}>
                  <ThemedText style={styles.seeAllText}>
                    See all {reviewCount} reviews
                  </ThemedText>
                  <Ionicons name="chevron-forward" size={16} color={Colors.primary} />
                </Pressable>
              )}
            </>
          ) : (
            <ThemedText style={styles.emptyText}>No reviews yet</ThemedText>
          )}
        </View>

        {/* Previous Work Section (placeholder) */}
        {/* TODO: Add previous work photo gallery */}

        {/* Report Link */}
        <Pressable style={styles.reportLink} onPress={() => {}}>
          <Ionicons name="flag-outline" size={18} color="#DC2626" />
          <ThemedText style={styles.reportText}>Report this trade</ThemedText>
        </Pressable>

        <Spacer height={insets.bottom > 0 ? insets.bottom + 24 : 40} />
      </ScrollView>
    </ThemedView>
  );
}

// Verification Badge Component
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
          size={20}
          color={isVerified ? Colors.light.title : "#9CA3AF"}
        />
        {isVerified && (
          <View style={styles.badgeCheckmark}>
            <Ionicons name="checkmark" size={10} color="#FFFFFF" />
          </View>
        )}
      </View>
      <ThemedText style={styles.badgeLabel}>{label}</ThemedText>
    </View>
  );
}

// Review Card Component
function ReviewCard({ review }) {
  const stars = review.rating || 5;
  const timeAgo = review.created_at
    ? formatTimeAgo(new Date(review.created_at))
    : "";

  return (
    <View style={styles.reviewCard}>
      <View style={styles.reviewHeader}>
        <View style={styles.reviewAvatar}>
          {review.photo_url ? (
            <Image source={{ uri: review.photo_url }} style={styles.reviewAvatarImage} />
          ) : (
            <View style={[styles.reviewAvatarImage, styles.reviewAvatarFallback]}>
              <ThemedText style={styles.reviewAvatarInitials}>
                {getInitials(review.name)}
              </ThemedText>
            </View>
          )}
        </View>
        <View style={styles.reviewHeaderInfo}>
          <ThemedText style={styles.reviewerName}>{review.name || "Anonymous"}</ThemedText>
          <View style={styles.reviewMeta}>
            <View style={styles.starsRow}>
              {[1, 2, 3, 4, 5].map((star) => (
                <Ionicons
                  key={star}
                  name={star <= stars ? "star" : "star-outline"}
                  size={14}
                  color="#F59E0B"
                />
              ))}
            </View>
            {timeAgo && (
              <ThemedText style={styles.reviewTime}>{timeAgo}</ThemedText>
            )}
          </View>
        </View>
      </View>
      {review.comment && (
        <ThemedText style={styles.reviewComment}>"{review.comment}"</ThemedText>
      )}
    </View>
  );
}

function formatTimeAgo(date) {
  const now = new Date();
  const diff = now - date;
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));

  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days} days ago`;
  if (days < 30) return `${Math.floor(days / 7)} week${Math.floor(days / 7) > 1 ? "s" : ""} ago`;
  if (days < 365) return `${Math.floor(days / 30)} month${Math.floor(days / 30) > 1 ? "s" : ""} ago`;
  return `${Math.floor(days / 365)} year${Math.floor(days / 365) > 1 ? "s" : ""} ago`;
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
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
  },
  // Hero Card
  heroCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.light.border,
    padding: 24,
    alignItems: "center",
    marginBottom: 24,
  },
  avatarContainer: {},
  avatar: {
    width: 96,
    height: 96,
    borderRadius: 48,
  },
  avatarFallback: {
    backgroundColor: Colors.light.secondaryBackground,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarInitials: {
    fontSize: 32,
    fontWeight: "600",
    color: Colors.light.subtitle,
  },
  businessName: {
    fontSize: 24,
    fontWeight: "600",
    color: Colors.light.title,
    textAlign: "center",
  },
  personalName: {
    fontSize: 16,
    color: Colors.light.subtitle,
    marginTop: 4,
    textAlign: "center",
  },
  // Badges
  badgesRow: {
    flexDirection: "row",
    gap: 24,
  },
  badgeWrapper: {
    alignItems: "center",
  },
  badgeIconContainer: {
    width: 44,
    height: 44,
    borderRadius: 10,
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
    borderColor: "#E5E7EB",
    borderStyle: "dashed",
  },
  badgeCheckmark: {
    position: "absolute",
    bottom: -4,
    right: -4,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: "#10B981",
    alignItems: "center",
    justifyContent: "center",
  },
  badgeLabel: {
    fontSize: 12,
    color: Colors.light.subtitle,
    marginTop: 8,
  },
  // Rating
  ratingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  ratingText: {
    fontSize: 16,
    color: Colors.light.title,
    fontWeight: "500",
  },
  noRatingText: {
    fontSize: 14,
    color: Colors.light.subtitle,
  },
  // Section
  sectionLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: Colors.light.subtitle,
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  sectionCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.light.border,
    padding: 16,
    marginBottom: 24,
  },
  // About
  jobTitlesText: {
    fontSize: 16,
    fontWeight: "500",
    color: Colors.light.title,
  },
  locationRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 8,
  },
  locationText: {
    fontSize: 14,
    color: Colors.light.subtitle,
  },
  bioText: {
    fontSize: 15,
    color: Colors.light.title,
    lineHeight: 22,
  },
  emptyText: {
    fontSize: 14,
    color: Colors.light.subtitle,
    fontStyle: "italic",
  },
  // Services
  serviceCategoryGroup: {
    marginBottom: 16,
  },
  serviceCategoryLabel: {
    fontSize: 14,
    fontWeight: "500",
    color: Colors.light.subtitle,
    marginBottom: 8,
  },
  serviceChipsContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  serviceChip: {
    backgroundColor: Colors.light.secondaryBackground,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  serviceChipText: {
    fontSize: 14,
    color: Colors.light.title,
  },
  // Reviews
  reviewDivider: {
    height: 1,
    backgroundColor: Colors.light.border,
    marginVertical: 16,
  },
  reviewCard: {},
  reviewHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
  },
  reviewAvatar: {},
  reviewAvatarImage: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  reviewAvatarFallback: {
    backgroundColor: Colors.light.secondaryBackground,
    alignItems: "center",
    justifyContent: "center",
  },
  reviewAvatarInitials: {
    fontSize: 14,
    fontWeight: "600",
    color: Colors.light.subtitle,
  },
  reviewHeaderInfo: {
    marginLeft: 12,
    flex: 1,
  },
  reviewerName: {
    fontSize: 16,
    fontWeight: "500",
    color: Colors.light.title,
  },
  reviewMeta: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 4,
    gap: 12,
  },
  starsRow: {
    flexDirection: "row",
    gap: 2,
  },
  reviewTime: {
    fontSize: 12,
    color: Colors.light.subtitle,
  },
  reviewComment: {
    fontSize: 15,
    color: Colors.light.title,
    marginTop: 12,
    lineHeight: 22,
    fontStyle: "italic",
  },
  seeAllLink: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: Colors.light.border,
    marginTop: 16,
    gap: 4,
  },
  seeAllText: {
    fontSize: 14,
    color: Colors.primary,
    fontWeight: "500",
  },
  // Report
  reportLink: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 16,
  },
  reportText: {
    fontSize: 14,
    color: "#DC2626",
  },
});
