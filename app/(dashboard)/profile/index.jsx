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
  FlatList,
  Modal,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter, useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import ImageViewing from "react-native-image-viewing";

import ThemedView from "../../../components/ThemedView";
import ThemedText from "../../../components/ThemedText";
import Spacer from "../../../components/Spacer";
import { ProfilePageSkeleton } from "../../../components/Skeleton";
import { Colors } from "../../../constants/Colors";

import { useUser } from "../../../hooks/useUser";
import { getMyRole, getMyProfile } from "../../../lib/api/profile";
import { getTradeReviews } from "../../../lib/api/trust";

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
  const [reviews, setReviews] = useState([]);
  const [loadingData, setLoadingData] = useState(true);
  const [showAllReviews, setShowAllReviews] = useState(false);

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

  // Load profile data and reviews
  const loadProfile = useCallback(async () => {
    if (!user?.id) return;
    try {
      setLoadingData(true);
      const me = await getMyProfile();
      setProfile(me || null);

      // Fetch reviews for trade profiles
      if (me?.id) {
        const reviewsData = await getTradeReviews(me.id, { limit: 20 });
        setReviews(reviewsData || []);
      }
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
        <ProfilePageSkeleton paddingTop={16} />
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

  // Review data - calculate from actual reviews array if available, fallback to profile fields
  const reviewCount = reviews.length > 0 ? reviews.length : (profile?.review_count || 0);
  const averageRating = reviews.length > 0
    ? reviews.reduce((sum, r) => sum + (r.rating || 0), 0) / reviews.length
    : (profile?.average_rating || 0);

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

        {/* Bio Section (Trades only) - No header for clean look */}
        {isTrades && profile?.bio && (
          <View style={styles.bioSection}>
            <ThemedText style={styles.bioText}>{profile.bio}</ThemedText>
          </View>
        )}

        {/* Divider between bio and reviews */}
        {isTrades && profile?.bio && (
          <View style={styles.bioDivider} />
        )}

        {/* Reviews Section (Trades only) */}
        {isTrades && (
          <ReviewsSection
            reviews={reviews}
            reviewCount={reviewCount}
            averageRating={averageRating}
            businessName={businessName}
            onShowAll={() => setShowAllReviews(true)}
          />
        )}

        <Spacer height={insets.bottom > 0 ? insets.bottom + 24 : 40} />
      </ScrollView>

      {/* All Reviews Modal */}
      {isTrades && (
        <AllReviewsModal
          visible={showAllReviews}
          onClose={() => setShowAllReviews(false)}
          reviews={reviews}
          reviewCount={reviewCount}
          averageRating={averageRating}
          insets={insets}
        />
      )}
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

// Format relative time
function formatRelativeTime(date) {
  if (!date) return "";
  const now = new Date();
  const reviewDate = new Date(date);
  const diffMs = now - reviewDate;
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays} days ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)} week${Math.floor(diffDays / 7) > 1 ? "s" : ""} ago`;
  if (diffDays < 365) return `${Math.floor(diffDays / 30)} month${Math.floor(diffDays / 30) > 1 ? "s" : ""} ago`;
  return `${Math.floor(diffDays / 365)} year${Math.floor(diffDays / 365) > 1 ? "s" : ""} ago`;
}

// Reviews Section Component - Horizontal scrolling Airbnb style
function ReviewsSection({ reviews, reviewCount, averageRating, businessName, onShowAll }) {
  const hasReviews = reviews.length > 0;

  // State for full-screen photo viewer
  const [photoViewer, setPhotoViewer] = useState({ open: false, images: [], index: 0 });

  // Star rating display
  const renderStars = (rating, size = 14) => {
    return (
      <View style={styles.starsRow}>
        {[1, 2, 3, 4, 5].map((star) => (
          <Ionicons
            key={star}
            name={star <= rating ? "star" : "star-outline"}
            size={size}
            color="#F59E0B"
          />
        ))}
      </View>
    );
  };

  // Open photo viewer for a review
  const openPhotoViewer = (photos, startIndex = 0) => {
    const images = photos.map((url) => ({ uri: url }));
    setPhotoViewer({ open: true, images, index: startIndex });
  };

  // Single review card
  const ReviewCard = ({ review }) => {
    const reviewerName = review.reviewer?.full_name || "Client";
    const reviewerPhoto = review.reviewer?.photo_url;
    const hasPhotos = review.photos && review.photos.length > 0;

    return (
      <View style={styles.reviewCard}>
        {/* Reviewer Info */}
        <View style={styles.reviewerRow}>
          {reviewerPhoto ? (
            <Image source={{ uri: reviewerPhoto }} style={styles.reviewerAvatar} />
          ) : (
            <View style={[styles.reviewerAvatar, styles.reviewerAvatarFallback]}>
              <ThemedText style={styles.reviewerInitials}>
                {getInitials(reviewerName)}
              </ThemedText>
            </View>
          )}
          <View style={styles.reviewerInfo}>
            <ThemedText style={styles.reviewerName} numberOfLines={1}>
              {reviewerName}
            </ThemedText>
            <ThemedText style={styles.reviewDate}>
              {formatRelativeTime(review.created_at)}
            </ThemedText>
          </View>
        </View>

        {/* Rating */}
        <View style={styles.reviewRatingRow}>
          {renderStars(review.rating)}
        </View>

        {/* Review Text */}
        {review.content && (
          <ThemedText style={styles.reviewContent} numberOfLines={4}>
            {review.content}
          </ThemedText>
        )}

        {/* Review Photos - Show all photos in a row, tap to zoom */}
        {hasPhotos && (
          <View style={styles.reviewPhotosRow}>
            {review.photos.map((photoUrl, idx) => (
              <Pressable
                key={idx}
                onPress={() => openPhotoViewer(review.photos, idx)}
              >
                <Image
                  source={{ uri: photoUrl }}
                  style={styles.reviewPhoto}
                />
              </Pressable>
            ))}
          </View>
        )}
      </View>
    );
  };

  // Format header title
  const headerTitle = hasReviews
    ? businessName
      ? `${businessName}'s reviews (${reviewCount})`
      : `${averageRating.toFixed(1)} (${reviewCount} review${reviewCount !== 1 ? "s" : ""})`
    : businessName
      ? `${businessName}'s reviews`
      : "Reviews";

  return (
    <View style={styles.reviewsSection}>
      {/* Header */}
      <View style={styles.reviewsSectionHeader}>
        <ThemedText style={styles.reviewsSectionTitle}>
          {headerTitle}
        </ThemedText>
      </View>

      {/* Reviews List */}
      {hasReviews ? (
        <>
          <FlatList
            data={reviews.slice(0, 5)}
            horizontal
            showsHorizontalScrollIndicator={false}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => <ReviewCard review={item} />}
            contentContainerStyle={styles.reviewsList}
            snapToInterval={340 + 12}
            decelerationRate="fast"
          />

          {/* Show All Reviews Button - always visible when reviews exist */}
          <Pressable style={styles.showMoreBtn} onPress={onShowAll}>
            <ThemedText style={styles.showMoreText}>
              Show all reviews
            </ThemedText>
          </Pressable>
        </>
      ) : (
        <View style={styles.noReviewsContainer}>
          <Ionicons name="chatbubble-outline" size={32} color="#D1D5DB" />
          <ThemedText style={styles.noReviewsMessage}>
            No reviews yet
          </ThemedText>
          <ThemedText style={styles.noReviewsSubtext}>
            Reviews from clients will appear here
          </ThemedText>
        </View>
      )}

      {/* Full-screen Image Viewer */}
      <ImageViewing
        images={photoViewer.images}
        imageIndex={photoViewer.index}
        visible={photoViewer.open}
        onRequestClose={() => setPhotoViewer({ open: false, images: [], index: 0 })}
        FooterComponent={({ imageIndex }) => (
          <View style={styles.viewerFooter}>
            <View style={styles.viewerDots}>
              {photoViewer.images.map((_, i) => (
                <View
                  key={i}
                  style={[
                    styles.viewerDot,
                    i === imageIndex && styles.viewerDotActive,
                  ]}
                />
              ))}
            </View>
          </View>
        )}
      />
    </View>
  );
}

// All Reviews Modal (Bottom Sheet Style)
function AllReviewsModal({ visible, onClose, reviews, reviewCount, averageRating, insets }) {
  // State for full-screen photo viewer
  const [photoViewer, setPhotoViewer] = useState({ open: false, images: [], index: 0 });

  // Open photo viewer for a review
  const openPhotoViewer = (photos, startIndex = 0) => {
    const images = photos.map((url) => ({ uri: url }));
    setPhotoViewer({ open: true, images, index: startIndex });
  };

  // Star rating display
  const renderStars = (rating, size = 14) => {
    return (
      <View style={styles.starsRow}>
        {[1, 2, 3, 4, 5].map((star) => (
          <Ionicons
            key={star}
            name={star <= rating ? "star" : "star-outline"}
            size={size}
            color="#F59E0B"
          />
        ))}
      </View>
    );
  };

  // Full review item - Airbnb style
  const FullReviewItem = ({ review }) => {
    const reviewerName = review.reviewer?.full_name || "Client";
    const reviewerPhoto = review.reviewer?.photo_url;
    const hasPhotos = review.photos && review.photos.length > 0;

    return (
      <View style={styles.fullReviewItem}>
        {/* Reviewer Info Row */}
        <View style={styles.fullReviewerRow}>
          {reviewerPhoto ? (
            <Image source={{ uri: reviewerPhoto }} style={styles.fullReviewerAvatar} />
          ) : (
            <View style={[styles.fullReviewerAvatar, styles.reviewerAvatarFallback]}>
              <ThemedText style={styles.fullReviewerInitials}>
                {getInitials(reviewerName)}
              </ThemedText>
            </View>
          )}
          <View style={styles.fullReviewerInfo}>
            <ThemedText style={styles.fullReviewerName}>
              {reviewerName}
            </ThemedText>
          </View>
        </View>

        {/* Stars and Date Row */}
        <View style={styles.fullReviewMeta}>
          {renderStars(review.rating, 12)}
          <ThemedText style={styles.fullReviewMetaDot}> · </ThemedText>
          <ThemedText style={styles.fullReviewDate}>
            {formatRelativeTime(review.created_at)}
          </ThemedText>
        </View>

        {/* Review Text - Full content, no truncation */}
        {review.content && (
          <ThemedText style={styles.fullReviewContent}>
            {review.content}
          </ThemedText>
        )}

        {/* Review Photos - Tap to zoom */}
        {hasPhotos && (
          <View style={styles.fullReviewPhotosRow}>
            {review.photos.map((photoUrl, idx) => (
              <Pressable
                key={idx}
                onPress={() => openPhotoViewer(review.photos, idx)}
              >
                <Image
                  source={{ uri: photoUrl }}
                  style={styles.fullReviewPhoto}
                />
              </Pressable>
            ))}
          </View>
        )}
      </View>
    );
  };

  return (
    <>
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
      onRequestClose={onClose}
    >
      <View style={styles.modalOverlay}>
        <View style={[styles.modalContent, { paddingBottom: insets.bottom + 20 }]}>
          {/* Handle bar */}
          <View style={styles.modalHandle} />

          {/* Header - Airbnb style with X on right */}
          <View style={styles.modalHeader}>
            <ThemedText style={styles.modalTitle}>
              {reviewCount} review{reviewCount !== 1 ? "s" : ""}
            </ThemedText>
            <Pressable
              onPress={onClose}
              hitSlop={10}
              style={styles.modalCloseBtn}
            >
              <Ionicons name="close" size={20} color="#111827" />
            </Pressable>
          </View>

          {/* Divider after header */}
          <View style={styles.modalDivider} />

          {/* Reviews List */}
          <FlatList
            data={reviews}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => <FullReviewItem review={item} />}
            contentContainerStyle={styles.fullReviewsList}
            showsVerticalScrollIndicator={false}
            ItemSeparatorComponent={() => <View style={styles.reviewSeparator} />}
          />
        </View>
      </View>
    </Modal>

    {/* Full-screen Image Viewer */}
    <ImageViewing
      images={photoViewer.images}
      imageIndex={photoViewer.index}
      visible={photoViewer.open}
      onRequestClose={() => setPhotoViewer({ open: false, images: [], index: 0 })}
      FooterComponent={({ imageIndex }) => (
        <View style={styles.viewerFooter}>
          <View style={styles.viewerDots}>
            {photoViewer.images.map((_, i) => (
              <View
                key={i}
                style={[
                  styles.viewerDot,
                  i === imageIndex && styles.viewerDotActive,
                ]}
              />
            ))}
          </View>
        </View>
      )}
    />
    </>
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
  // Bio Section
  bioSection: {
    marginTop: 20,
    paddingHorizontal: 4,
  },
  bioText: {
    fontSize: 18, // 2 sizes larger than review content (14px)
    color: "#374151",
    lineHeight: 26,
  },
  bioDivider: {
    height: 1,
    backgroundColor: Colors.light.border,
    marginTop: 20,
    marginHorizontal: 4,
  },
  // Reviews Section
  reviewsSection: {
    marginTop: 24,
  },
  reviewsSectionHeader: {
    marginBottom: 16,
  },
  reviewsTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  reviewsSectionTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: Colors.light.title,
  },
  starsRow: {
    flexDirection: "row",
    gap: 2,
  },
  reviewsList: {
    paddingRight: 20,
  },
  // Review Card (Horizontal) - wider to fit 5 photos without scrolling
  reviewCard: {
    width: 340,
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 16,
    marginRight: 12,
    borderWidth: 1,
    borderColor: Colors.light.border,
  },
  reviewerRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
  },
  reviewerAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  reviewerAvatarFallback: {
    backgroundColor: "#E5E7EB",
    alignItems: "center",
    justifyContent: "center",
  },
  reviewerInitials: {
    fontSize: 14,
    fontWeight: "600",
    color: "#6B7280",
  },
  reviewerInfo: {
    marginLeft: 10,
    flex: 1,
  },
  reviewerName: {
    fontSize: 14,
    fontWeight: "600",
    color: Colors.light.title,
  },
  reviewDate: {
    fontSize: 12,
    color: "#9CA3AF",
    marginTop: 2,
  },
  reviewRatingRow: {
    marginBottom: 8,
  },
  reviewRatingBadge: {
    marginLeft: "auto",
  },
  reviewContent: {
    fontSize: 14,
    color: "#374151",
    lineHeight: 20,
  },
  reviewPhotosScroll: {
    marginTop: 12,
  },
  reviewPhotosRow: {
    flexDirection: "row",
    marginTop: 12,
  },
  reviewPhoto: {
    width: 56,
    height: 56,
    borderRadius: 8,
    marginRight: 6,
  },
  // Show More Button - Airbnb style grey pill
  showMoreBtn: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 14,
    paddingHorizontal: 24,
    marginTop: 16,
    backgroundColor: "#F3F4F6",
    borderRadius: 8,
    alignSelf: "center",
  },
  showMoreText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#111827",
  },
  // No Reviews State
  noReviewsContainer: {
    alignItems: "center",
    paddingVertical: 32,
    paddingHorizontal: 20,
    backgroundColor: "#F9FAFB",
    borderRadius: 16,
  },
  noReviewsMessage: {
    fontSize: 16,
    fontWeight: "500",
    color: "#6B7280",
    marginTop: 12,
  },
  noReviewsSubtext: {
    fontSize: 14,
    color: "#9CA3AF",
    marginTop: 4,
    textAlign: "center",
  },
  // Modal Styles
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "flex-end",
  },
  modalContent: {
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    height: "80%",
    paddingTop: 12,
  },
  modalHandle: {
    width: 36,
    height: 4,
    backgroundColor: "#D1D5DB",
    borderRadius: 2,
    alignSelf: "center",
    marginBottom: 16,
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 24,
    paddingBottom: 20,
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: "700",
    color: "#111827",
  },
  modalCloseBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#F3F4F6",
    alignItems: "center",
    justifyContent: "center",
  },
  modalDivider: {
    height: 1,
    backgroundColor: Colors.light.border,
    marginHorizontal: 24,
  },
  fullReviewsList: {
    paddingHorizontal: 24,
    paddingTop: 8,
  },
  fullReviewItem: {
    paddingVertical: 20,
  },
  // Full review item styles - Airbnb style
  fullReviewerRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
  },
  fullReviewerAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
  },
  fullReviewerInitials: {
    fontSize: 16,
    fontWeight: "600",
    color: "#6B7280",
  },
  fullReviewerInfo: {
    marginLeft: 12,
    flex: 1,
  },
  fullReviewerName: {
    fontSize: 16,
    fontWeight: "600",
    color: "#111827",
  },
  fullReviewMeta: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
  },
  fullReviewMetaDot: {
    fontSize: 14,
    color: "#6B7280",
  },
  fullReviewDate: {
    fontSize: 14,
    color: "#6B7280",
  },
  fullReviewContent: {
    fontSize: 16,
    color: "#374151",
    lineHeight: 24,
  },
  fullReviewPhotosRow: {
    flexDirection: "row",
    marginTop: 12,
  },
  fullReviewPhoto: {
    width: 56,
    height: 56,
    borderRadius: 8,
    marginRight: 6,
  },
  reviewSeparator: {
    height: 1,
    backgroundColor: Colors.light.border,
  },
  // Image viewer styles
  viewerFooter: {
    alignItems: "center",
    paddingBottom: 40,
  },
  viewerDots: {
    flexDirection: "row",
    gap: 8,
  },
  viewerDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "rgba(255,255,255,0.4)",
  },
  viewerDotActive: {
    backgroundColor: "#fff",
  },
});
