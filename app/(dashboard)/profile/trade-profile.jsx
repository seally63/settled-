// app/(dashboard)/profile/trade-profile.jsx
// Trade Profile page - shows detailed trade profile with reviews, services, etc.
// Supports both self-view (trades viewing own profile) and public view (clients viewing a trade)
// Uses IDENTICAL layout to profile/index.jsx for consistency
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
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter, useFocusEffect, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import ImageViewing from "react-native-image-viewing";

import ThemedView from "../../../components/ThemedView";
import ThemedText from "../../../components/ThemedText";
import Spacer from "../../../components/Spacer";
import { ProfilePageSkeleton } from "../../../components/Skeleton";
import { KeyboardDoneButton, KEYBOARD_DONE_ID } from "../../../components/KeyboardDoneButton";
import { Colors } from "../../../constants/Colors";

import { useUser } from "../../../hooks/useUser";
import { getMyProfile, getTradePublicById } from "../../../lib/api/profile";
import { getTradeReviews } from "../../../lib/api/trust";
import { supabase } from "../../../lib/supabase";
import ThemedStatusBar from "../../../components/ThemedStatusBar";

const PRIMARY = Colors?.light?.tint || "#7C3AED";

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

export default function TradeProfileScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useUser();
  const { tradeId } = useLocalSearchParams();

  // Determine if viewing own profile or another trade's profile
  const isPublicView = !!tradeId && tradeId !== user?.id;

  const [profile, setProfile] = useState(null);
  const [reviews, setReviews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAllReviews, setShowAllReviews] = useState(false);
  const [performanceStats, setPerformanceStats] = useState({
    responseTimeHours: null,
    quoteRate: null,
  });
  const [performanceInfoVisible, setPerformanceInfoVisible] = useState(false);
  const [quoteModalVisible, setQuoteModalVisible] = useState(false);
  const [quoteMessage, setQuoteMessage] = useState("");
  const [sendingQuote, setSendingQuote] = useState(false);

  // Load profile data
  const loadProfile = useCallback(async () => {
    // For public view, we don't need the current user to be logged in
    if (!isPublicView && !user?.id) return;

    try {
      setLoading(true);
      const targetId = isPublicView ? tradeId : user?.id;

      if (isPublicView) {
        // Load the trade's public profile
        const tradeProfile = await getTradePublicById(tradeId);
        setProfile(tradeProfile || null);
      } else {
        // Load own profile
        const me = await getMyProfile();
        setProfile(me || null);
      }

      // Fetch reviews for this trade
      if (targetId) {
        const reviewsData = await getTradeReviews(targetId, { limit: 20 });
        setReviews(reviewsData || []);
      }

      // Load performance stats (quote rate)
      const { data: targets } = await supabase
        .from("request_targets")
        .select("request_id, state")
        .eq("trade_id", targetId);

      const { data: quotes } = await supabase
        .from("tradify_native_app_db")
        .select("id, request_id, status")
        .eq("trade_id", targetId);

      const acceptedRequests = (targets || []).filter((t) =>
        t.state?.toLowerCase().includes("accepted")
      ).length;
      const requestsWithQuotes = new Set(
        (quotes || [])
          .filter((q) => ["sent", "accepted", "declined", "expired", "completed", "awaiting_completion"].includes(q.status?.toLowerCase()))
          .map((q) => q.request_id)
      ).size;
      const quoteRate = acceptedRequests > 0
        ? Math.min(100, Math.round((requestsWithQuotes / acceptedRequests) * 100))
        : null;

      setPerformanceStats({
        responseTimeHours: null,
        quoteRate,
      });
    } finally {
      setLoading(false);
    }
  }, [user?.id, tradeId, isPublicView]);

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  useFocusEffect(
    useCallback(() => {
      // For public view, load even without user being logged in
      if (isPublicView || user?.id) {
        loadProfile();
      }
    }, [user?.id, loadProfile, isPublicView])
  );

  // Handle Request a Quote submission
  const handleRequestQuote = async () => {
    if (!user?.id || !tradeId) return;

    setSendingQuote(true);
    try {
      setQuoteModalVisible(false);
      setQuoteMessage("");
      Alert.alert("Request sent", "The trade will be notified of your enquiry.");
    } catch (err) {
      Alert.alert("Error", err.message || "Failed to send request. Please try again.");
    } finally {
      setSendingQuote(false);
    }
  };

  if (loading) {
    return (
      <ThemedView style={[styles.container, { paddingTop: insets.top }]}>
        <ThemedStatusBar />
        <ProfilePageSkeleton paddingTop={16} />
      </ThemedView>
    );
  }

  // Extract profile data
  const displayName = profile?.full_name || "User";
  const businessName = profile?.business_name || "Business Name";
  const photoUrl = profile?.photo_url;
  const jobTitles = profile?.job_titles || [];
  const basePostcode = profile?.base_postcode;
  const baseCity = profile?.town_city;
  const serviceRadiusKm = profile?.service_radius_km;

  // Convert km to miles for display
  const serviceRadiusMiles = serviceRadiusKm
    ? Math.round(serviceRadiusKm * 0.621371)
    : null;

  // Format location display
  const locationDisplay = baseCity
    ? (serviceRadiusMiles ? `${baseCity} · ${serviceRadiusMiles} mi` : baseCity)
    : basePostcode || null;

  // Verification status
  const verification = profile?.verification || {
    photo_id: "not_started",
    insurance: "not_started",
    credentials: "not_started",
  };

  // Review data
  const reviewCount = reviews.length > 0 ? reviews.length : (profile?.review_count || 0);
  const averageRating = reviews.length > 0
    ? reviews.reduce((sum, r) => sum + (r.rating || 0), 0) / reviews.length
    : (profile?.average_rating || 0);

  return (
    <ThemedView style={[styles.container, { paddingTop: insets.top }]}>
      <ThemedStatusBar />

      {/* Header - with back button for public view */}
      <View style={styles.header}>
        {isPublicView ? (
          <>
            <Pressable onPress={() => router.push("/client/search-modal")} hitSlop={10}>
              <Ionicons name="chevron-back" size={24} color={Colors.light.title} />
            </Pressable>
            <ThemedText style={styles.headerTitle} numberOfLines={1}>{businessName}</ThemedText>
            <View style={{ width: 24 }} />
          </>
        ) : (
          <>
            <ThemedText style={styles.headerTitleLarge}>Profile</ThemedText>
            <Pressable
              onPress={() => router.push("/profile/settings")}
              hitSlop={10}
              style={({ pressed }) => [pressed && { opacity: 0.7 }]}
            >
              <Ionicons name="menu-outline" size={26} color={Colors.light.title} />
            </Pressable>
          </>
        )}
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Profile Card - Same two-column layout as index.jsx */}
        <TradeProfileCard
          photoUrl={photoUrl}
          businessName={businessName}
          displayName={displayName}
          verification={verification}
          jobTitles={jobTitles}
          locationDisplay={locationDisplay}
        />

        {/* Performance Section - Horizontal 3-column layout */}
        <View style={styles.performanceSection}>
          {/* Info Button positioned top-right */}
          <Pressable
            style={styles.performanceInfoButtonTopRight}
            onPress={() => setPerformanceInfoVisible(true)}
            hitSlop={10}
          >
            <Ionicons name="information-circle-outline" size={18} color="#9CA3AF" />
          </Pressable>

          {/* Horizontal 3-column layout: Rating | Response | Quotes */}
          <View style={styles.performanceRowThreeCol}>
            {/* Rating */}
            <View style={styles.performanceColItem}>
              <View style={styles.performanceValueRow}>
                <Ionicons name="star" size={16} color="#F59E0B" />
                <ThemedText style={styles.performanceValueText}>
                  {averageRating > 0 ? averageRating.toFixed(1) : "--"}
                </ThemedText>
              </View>
              <ThemedText style={styles.performanceColLabel}>
                {reviewCount > 0 ? `${reviewCount} review${reviewCount !== 1 ? "s" : ""}` : "No reviews"}
              </ThemedText>
            </View>

            {/* Response Time */}
            <View style={styles.performanceColItem}>
              <View style={styles.performanceValueRow}>
                <Ionicons name="flash" size={16} color={PRIMARY} />
                <ThemedText style={styles.performanceValueText}>
                  {performanceStats.responseTimeHours !== null
                    ? `${performanceStats.responseTimeHours} hrs`
                    : "--"}
                </ThemedText>
              </View>
              <ThemedText style={styles.performanceColLabel}>response</ThemedText>
            </View>

            {/* Quote Rate */}
            <View style={styles.performanceColItem}>
              <View style={styles.performanceValueRow}>
                <Ionicons name="checkmark" size={16} color={PRIMARY} />
                <ThemedText style={styles.performanceValueText}>
                  {performanceStats.quoteRate !== null ? `${performanceStats.quoteRate}%` : "--"}
                </ThemedText>
              </View>
              <ThemedText style={styles.performanceColLabel}>quotes</ThemedText>
            </View>
          </View>
        </View>

        {/* Divider before Bio */}
        <View style={styles.sectionDivider} />

        {/* Bio Section - No header for clean look */}
        {profile?.bio && (
          <View style={styles.bioSection}>
            <ThemedText style={styles.bioText}>{profile.bio}</ThemedText>
          </View>
        )}

        {/* Divider between bio and reviews */}
        {profile?.bio && (
          <View style={styles.bioDivider} />
        )}

        {/* Reviews Section */}
        <ReviewsSection
          reviews={reviews}
          reviewCount={reviewCount}
          averageRating={averageRating}
          businessName={businessName}
          onShowAll={() => setShowAllReviews(true)}
        />

        {/* Request a Quote Button - only for public view (clients viewing a trade) */}
        {isPublicView && (
          <Pressable
            style={styles.requestQuoteButton}
            onPress={() => setQuoteModalVisible(true)}
          >
            <ThemedText style={styles.requestQuoteButtonText}>Request a Quote</ThemedText>
          </Pressable>
        )}

        {/* Report Link - only show for public view */}
        {isPublicView && (
          <Pressable style={styles.reportLink} onPress={() => {}}>
            <Ionicons name="flag-outline" size={18} color="#DC2626" />
            <ThemedText style={styles.reportText}>Report this trade</ThemedText>
          </Pressable>
        )}

        <Spacer height={insets.bottom > 0 ? insets.bottom + 24 : 40} />
      </ScrollView>

      {/* All Reviews Modal */}
      <AllReviewsModal
        visible={showAllReviews}
        onClose={() => setShowAllReviews(false)}
        reviews={reviews}
        reviewCount={reviewCount}
        averageRating={averageRating}
        insets={insets}
      />

      {/* Performance Info Modal */}
      <PerformanceInfoModal
        visible={performanceInfoVisible}
        onClose={() => setPerformanceInfoVisible(false)}
        insets={insets}
      />

      {/* Request a Quote Modal */}
      <RequestQuoteModal
        visible={quoteModalVisible}
        onClose={() => {
          setQuoteModalVisible(false);
          setQuoteMessage("");
        }}
        businessName={businessName}
        message={quoteMessage}
        onChangeMessage={setQuoteMessage}
        onSubmit={handleRequestQuote}
        loading={sendingQuote}
        insets={insets}
      />
    </ThemedView>
  );
}

// Trade Profile Card Component - Two column layout with 2 rows on right (SAME AS index.jsx)
function TradeProfileCard({
  photoUrl,
  businessName,
  displayName,
  verification,
  jobTitles,
  locationDisplay,
}) {
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

        {/* Right Column: Job Titles, Location (2 rows only) */}
        <View style={styles.cardRightColumn}>
          {/* Job Titles - more space for content */}
          <View style={styles.rightSectionLarge}>
            {jobTitles.length > 0 ? (
              <ThemedText style={styles.jobTitlesText} numberOfLines={3}>
                {jobTitles.join(" · ")}
              </ThemedText>
            ) : (
              <ThemedText style={styles.emptyText}>No job titles</ThemedText>
            )}
          </View>

          {/* Divider */}
          <View style={styles.horizontalDivider} />

          {/* Location - City · X mi format */}
          <View style={styles.rightSectionLarge}>
            <View style={styles.locationRow}>
              <Ionicons name="location" size={16} color={Colors.light.title} />
              <ThemedText style={styles.locationText} numberOfLines={1}>
                {locationDisplay || "No location set"}
              </ThemedText>
            </View>
          </View>
        </View>
      </View>
    </View>
  );
}

// Verification Badge Component - No dots (SAME AS index.jsx)
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

// Reviews Section Component - Horizontal scrolling Airbnb style (SAME AS index.jsx)
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

// Performance Info Modal Component
function PerformanceInfoModal({ visible, onClose, insets }) {
  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
      onRequestClose={onClose}
    >
      <View style={styles.modalOverlay}>
        <View style={[styles.perfInfoModalContent80, { paddingBottom: (insets?.bottom || 0) + 20 }]}>
          {/* Handle bar */}
          <View style={styles.modalHandle} />

          <View style={styles.perfInfoModalHeader}>
            <ThemedText style={styles.perfInfoModalTitle}>Performance Metrics</ThemedText>
            <Pressable onPress={onClose} hitSlop={10} style={styles.modalCloseBtn}>
              <Ionicons name="close" size={20} color="#111827" />
            </Pressable>
          </View>

          <ScrollView style={styles.perfInfoModalScrollContent} showsVerticalScrollIndicator={false}>
            {/* Response Time */}
            <View style={styles.perfInfoSection}>
              <View style={styles.perfInfoSectionHeader}>
                <Ionicons name="flash" size={20} color={PRIMARY} />
                <ThemedText style={styles.perfInfoSectionTitle}>Response Time</ThemedText>
              </View>
              <ThemedText style={styles.perfInfoSectionText}>
                This measures how quickly the business responds to new quote requests and messages from clients.
              </ThemedText>
              <View style={styles.perfInfoTipBox}>
                <ThemedText style={styles.perfInfoTipTitle}>Why it matters</ThemedText>
                <ThemedText style={styles.perfInfoTipText}>
                  Clients often reach out to multiple businesses. Those who respond within a few hours are much more likely to win the job. A fast response time indicates a reliable and attentive service provider.
                </ThemedText>
              </View>
            </View>

            {/* Quote Rate */}
            <View style={styles.perfInfoSection}>
              <View style={styles.perfInfoSectionHeader}>
                <Ionicons name="checkmark" size={20} color={PRIMARY} />
                <ThemedText style={styles.perfInfoSectionTitle}>Quote Rate</ThemedText>
              </View>
              <ThemedText style={styles.perfInfoSectionText}>
                This shows the percentage of accepted quote requests that received a formal quote from the business.
              </ThemedText>
              <View style={styles.perfInfoTipBox}>
                <ThemedText style={styles.perfInfoTipTitle}>How it's calculated</ThemedText>
                <ThemedText style={styles.perfInfoTipText}>
                  A high quote rate means the business follows through on enquiries and provides clear pricing. This helps clients compare options and make informed decisions.
                </ThemedText>
              </View>
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
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

// Request Quote Modal Component
function RequestQuoteModal({ visible, onClose, businessName, message, onChangeMessage, onSubmit, loading, insets }) {
  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={styles.quoteModalOverlay}
      >
        <Pressable style={styles.quoteModalBackdrop} onPress={onClose} />
        <View style={[styles.quoteModalSheet, { paddingBottom: (insets?.bottom || 0) + 20 }]}>
          {/* Handle bar */}
          <View style={styles.quoteModalHandle} />

          <View style={styles.quoteModalHeader}>
            <ThemedText style={styles.quoteModalTitle}>Request a Quote</ThemedText>
            <Pressable onPress={onClose} hitSlop={10} style={styles.quoteModalCloseBtn}>
              <Ionicons name="close" size={20} color="#111827" />
            </Pressable>
          </View>

          <View style={styles.quoteModalContent}>
            <ThemedText style={styles.quoteModalSubtitle}>
              Send a message to {businessName}
            </ThemedText>

            <TextInput
              style={styles.quoteMessageInput}
              placeholder="Describe what you need help with..."
              placeholderTextColor="#9CA3AF"
              multiline
              numberOfLines={4}
              textAlignVertical="top"
              value={message}
              onChangeText={onChangeMessage}
              inputAccessoryViewID={Platform.OS === "ios" ? KEYBOARD_DONE_ID : undefined}
            />

            <Pressable
              style={[styles.quoteSubmitButton, loading && styles.quoteSubmitButtonDisabled]}
              onPress={onSubmit}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <ThemedText style={styles.quoteSubmitButtonText}>Send Request</ThemedText>
              )}
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
      <KeyboardDoneButton />
    </Modal>
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
    fontSize: 18,
    fontWeight: "600",
    color: Colors.light.title,
  },
  headerTitleLarge: {
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
  rightSectionLarge: {
    paddingVertical: 12,
    flex: 1,
    justifyContent: "center",
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
  // Performance Section - Horizontal 3-column layout
  performanceSection: {
    marginTop: 20,
    marginBottom: 4,
    position: "relative",
  },
  performanceInfoButtonTopRight: {
    position: "absolute",
    top: 0,
    right: 0,
    padding: 4,
    zIndex: 1,
  },
  performanceRowThreeCol: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-around",
    paddingVertical: 12,
    paddingHorizontal: 8,
  },
  performanceColItem: {
    alignItems: "center",
    flex: 1,
  },
  performanceValueRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginBottom: 4,
  },
  performanceValueText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#111827",
  },
  performanceColLabel: {
    fontSize: 12,
    color: Colors.light.subtitle,
    textAlign: "center",
  },
  sectionDivider: {
    height: 1,
    backgroundColor: Colors.light.border,
    marginTop: 16,
    marginBottom: 4,
  },
  // Performance Info Modal (80% height bottom sheet)
  perfInfoModalContent80: {
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    height: "80%",
    paddingTop: 12,
  },
  perfInfoModalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 24,
    paddingTop: 8,
    paddingBottom: 16,
  },
  perfInfoModalTitle: {
    fontSize: 22,
    fontWeight: "700",
    color: "#111827",
  },
  perfInfoModalScrollContent: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 16,
  },
  perfInfoSection: {
    marginBottom: 28,
  },
  perfInfoSectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 12,
  },
  perfInfoSectionTitle: {
    fontSize: 17,
    fontWeight: "600",
    color: "#111827",
  },
  perfInfoSectionText: {
    fontSize: 15,
    color: "#374151",
    lineHeight: 22,
    marginBottom: 12,
  },
  perfInfoTipBox: {
    backgroundColor: "#F9FAFB",
    borderRadius: 10,
    padding: 14,
    borderLeftWidth: 3,
    borderLeftColor: PRIMARY,
  },
  perfInfoTipTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: "#111827",
    marginBottom: 6,
  },
  perfInfoTipText: {
    fontSize: 14,
    color: "#4B5563",
    lineHeight: 20,
  },
  // Bio Section
  bioSection: {
    marginTop: 20,
    paddingHorizontal: 4,
  },
  bioText: {
    fontSize: 18,
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
  reviewContent: {
    fontSize: 14,
    color: "#374151",
    lineHeight: 20,
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
  // Report Link
  reportLink: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 16,
    marginTop: 24,
  },
  reportText: {
    fontSize: 14,
    color: "#DC2626",
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
  // Request a Quote Button (inline in scroll content)
  requestQuoteButton: {
    backgroundColor: Colors.primary,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 24,
  },
  requestQuoteButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "600",
  },
  // Quote Modal
  quoteModalOverlay: {
    flex: 1,
    justifyContent: "flex-end",
  },
  quoteModalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
  },
  quoteModalSheet: {
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 12,
  },
  quoteModalHandle: {
    width: 36,
    height: 4,
    backgroundColor: "#D1D5DB",
    borderRadius: 2,
    alignSelf: "center",
    marginBottom: 16,
  },
  quoteModalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 24,
    paddingBottom: 16,
  },
  quoteModalTitle: {
    fontSize: 22,
    fontWeight: "700",
    color: "#111827",
  },
  quoteModalCloseBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#F3F4F6",
    alignItems: "center",
    justifyContent: "center",
  },
  quoteModalContent: {
    paddingHorizontal: 24,
  },
  quoteModalSubtitle: {
    fontSize: 15,
    color: "#6B7280",
    marginBottom: 16,
  },
  quoteMessageInput: {
    backgroundColor: "#F9FAFB",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.light.border,
    padding: 16,
    fontSize: 15,
    color: "#111827",
    minHeight: 120,
    marginBottom: 20,
  },
  quoteSubmitButton: {
    backgroundColor: Colors.primary,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  quoteSubmitButtonDisabled: {
    opacity: 0.7,
  },
  quoteSubmitButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "600",
  },
});
