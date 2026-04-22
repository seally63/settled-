// components/trade/TradeProfileView.jsx
//
// Shared trade profile presentation. One shell, three modes:
//
//   · mode="owner"   — the trade's own Profile tab. Top-right Settings
//                      burger. No primary CTAs. Avatar / verification
//                      / chips all tap to their detail sheets (or the
//                      settings sub-pages, via caller-supplied
//                      handlers).
//
//   · mode="visitor" — a client viewing a trade via discovery / search
//                      / saved. Chevron back top-left, Report text
//                      link under the reviews, and two bottom CTAs —
//                      Message (ghost) + Request a quote (primary).
//
//   · mode="preview" — a trade previewing their own public-facing page
//                      (how a client sees me). Same shell as visitor
//                      but with the CTAs hidden and a small "Preview"
//                      affordance so the trade knows they're not
//                      looking at a real client view.
//
// Everything else — the identity hero (avatar, name, location, inline
// verification badges, trade chips), the bio, the performance inline
// row, and the reviews section — is IDENTICAL across all three modes
// so the trade sees exactly what a client sees (and vice versa).
//
// Data loading is the caller's job. This file is presentational.

import { useState } from "react";
import {
  StyleSheet,
  View,
  ScrollView,
  Image,
  Pressable,
  FlatList,
  Modal,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import ImageViewing from "react-native-image-viewing";

import ThemedView from "../ThemedView";
import ThemedText from "../ThemedText";
import Spacer from "../Spacer";
import ThemedStatusBar from "../ThemedStatusBar";
import { IconBtn } from "../design";
import { Colors } from "../../constants/Colors";
import { FontFamily } from "../../constants/Typography";
import { useTheme } from "../../hooks/useTheme";

const PRIMARY = Colors.primary;

// ---- helpers ---------------------------------------------------------

function getInitials(name) {
  if (!name) return "?";
  const parts = String(name).trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function getNameWithInitial(fullName) {
  if (!fullName) return "";
  const parts = fullName.trim().split(" ");
  if (parts.length >= 2) return `${parts[0]} ${parts[parts.length - 1][0]}.`;
  return fullName;
}

function formatRelativeTime(date) {
  if (!date) return "";
  const now = new Date();
  const d = new Date(date);
  const diffDays = Math.floor((now - d) / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays} days ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)} week${Math.floor(diffDays / 7) > 1 ? "s" : ""} ago`;
  if (diffDays < 365) return `${Math.floor(diffDays / 30)} month${Math.floor(diffDays / 30) > 1 ? "s" : ""} ago`;
  return `${Math.floor(diffDays / 365)} year${Math.floor(diffDays / 365) > 1 ? "s" : ""} ago`;
}

// ======================================================================
// Shared trade profile view
// ======================================================================

export default function TradeProfileView({
  profile,
  reviews = [],
  performanceStats = { responseTimeHours: null, quoteRate: null },
  insets,
  mode = "owner",
  // Chrome handlers
  onBack,
  onSettings,
  // Action handlers (visitor mode)
  onRequestQuote,
  onMessage,
  onReport,
}) {
  const { colors: c, dark } = useTheme();

  const [showAllReviews, setShowAllReviews] = useState(false);
  const [verificationSheetVisible, setVerificationSheetVisible] = useState(false);
  const [performanceInfoVisible, setPerformanceInfoVisible] = useState(false);

  const isOwner = mode === "owner";
  const isVisitor = mode === "visitor";
  const isPreview = mode === "preview";

  // ---- derived --------------------------------------------------------
  const displayName = profile?.full_name || "Trade";
  const businessName = profile?.business_name;
  const photoUrl = profile?.photo_url || null;
  const jobTitles = Array.isArray(profile?.job_titles) ? profile.job_titles : [];
  const basePostcode = profile?.base_postcode;
  const baseCity = profile?.town_city;
  const serviceRadiusKm = profile?.service_radius_km;
  const serviceRadiusMiles = serviceRadiusKm
    ? Math.round(serviceRadiusKm * 0.621371)
    : null;
  const locationDisplay = baseCity
    ? (serviceRadiusMiles ? `${baseCity} · ${serviceRadiusMiles} mi` : baseCity)
    : basePostcode || null;

  const verification = profile?.verification || {
    photo_id: "not_started",
    insurance: "not_started",
    credentials: "not_started",
  };
  const verifiedCount = [
    verification.photo_id === "verified",
    verification.insurance === "verified",
    verification.credentials === "verified",
  ].filter(Boolean).length;

  const reviewCount = reviews.length > 0 ? reviews.length : (profile?.review_count || 0);
  const averageRating = reviews.length > 0
    ? reviews.reduce((sum, r) => sum + (r.rating || 0), 0) / reviews.length
    : (profile?.average_rating || 0);

  // ---- scroll padding — leaves room for absolute top-right icons -----
  const scrollTopPad = isOwner ? 54 : 12; // visitor/preview use an
  // inline chevron in the scroll, not an absolute dock, so less pad.
  const scrollBottomPad = (insets?.bottom || 0) + (isVisitor ? 140 : 180);

  return (
    <ThemedView style={[styles.container, { paddingTop: insets?.top || 0 }]}>
      <ThemedStatusBar />

      {/* Top-right icon dock — owner only. Floats over scroll content
          with no wrapping row / surface, same treatment as the three-
          dots on the trade Home tab and Projects filter icon.         */}
      {isOwner && (
        <View style={[styles.topBar, { top: (insets?.top || 0) + 12 }]}>
          <IconBtn
            icon="menu-outline"
            onPress={onSettings}
            testID="profile-settings-btn"
          />
        </View>
      )}

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingTop: scrollTopPad, paddingBottom: scrollBottomPad },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* Inline chevron (visitor + preview) — scrolls with content,
            no block behind. Same pattern as the Client Request page.  */}
        {(isVisitor || isPreview) && (
          <Pressable
            onPress={onBack}
            hitSlop={10}
            accessibilityLabel="Back"
            style={({ pressed }) => [
              styles.inlineChevron,
              { backgroundColor: c.elevate, borderColor: c.border },
              pressed && { opacity: 0.6 },
            ]}
          >
            <Ionicons name="chevron-back" size={18} color={c.text} />
          </Pressable>
        )}

        {/* Page title — on the Profile TAB it says "Profile". In
            visitor and preview mode the hero itself carries the name
            so no separate title is rendered. */}
        {isOwner && (
          <View style={styles.titleBlock}>
            <ThemedText style={[styles.pageTitle, { color: c.text }]}>
              Profile
            </ThemedText>
          </View>
        )}

        {/* Preview-mode affordance: a subtle banner so the trade knows
            this is how clients see them, not a live client view.     */}
        {isPreview && (
          <View
            style={[
              styles.previewBanner,
              { backgroundColor: c.elevate, borderColor: c.border },
            ]}
          >
            <Ionicons name="eye-outline" size={14} color={c.textMid} />
            <ThemedText style={[styles.previewBannerText, { color: c.textMid }]}>
              Preview — this is what clients see.
            </ThemedText>
          </View>
        )}

        {/* ─────── Zone 1 — Identity hero ───────────────────────── */}
        <ProfileHero
          c={c}
          photoUrl={photoUrl}
          displayName={displayName}
          businessName={businessName}
          locationDisplay={locationDisplay}
          verification={verification}
          verifiedCount={verifiedCount}
          jobTitles={jobTitles}
          onVerificationPress={() => setVerificationSheetVisible(true)}
        />

        {/* ─────── About ─────────────────────────────────────────── */}
        {!!profile?.bio && (
          <>
            <View style={[styles.flowDivider, { backgroundColor: c.border }]} />
            <View style={styles.flowBlock}>
              <ThemedText style={[styles.bodyText, { color: c.text }]}>
                {profile.bio}
              </ThemedText>
            </View>
          </>
        )}

        {/* ─────── Performance inline row ─────────────────────────
            Visible in ALL modes — social proof for the client,
            a self-view metric for the trade.                        */}
        <View style={[styles.flowDivider, { backgroundColor: c.border }]} />
        <View style={[styles.flowBlock, styles.perfInlineWrap]}>
          <View style={styles.perfInlineRow}>
            <View style={styles.perfInlineItem}>
              <View style={styles.perfInlineValueRow}>
                <Ionicons name="flash" size={13} color={PRIMARY} />
                <ThemedText style={[styles.perfInlineValue, { color: c.text }]}>
                  {performanceStats.responseTimeHours != null
                    ? `${performanceStats.responseTimeHours}h`
                    : "–"}
                </ThemedText>
              </View>
              <ThemedText style={[styles.perfInlineLabel, { color: c.textMuted }]}>
                Response
              </ThemedText>
            </View>
            <View style={[styles.perfInlineDivider, { backgroundColor: c.border }]} />
            <Pressable
              onPress={() => setPerformanceInfoVisible(true)}
              hitSlop={6}
              style={styles.perfInlineItem}
              accessibilityLabel="Quote rate — tap for details"
            >
              <View style={styles.perfInlineValueRow}>
                <Ionicons name="checkmark" size={13} color={PRIMARY} />
                <ThemedText style={[styles.perfInlineValue, { color: c.text }]}>
                  {performanceStats.quoteRate != null
                    ? `${performanceStats.quoteRate}%`
                    : "–"}
                </ThemedText>
              </View>
              <ThemedText style={[styles.perfInlineLabel, { color: c.textMuted }]}>
                Quote rate
              </ThemedText>
            </Pressable>
          </View>
        </View>

        {/* ─────── Reviews ───────────────────────────────────────── */}
        <View style={styles.flowBlock}>
          <ReviewsSection
            c={c}
            dark={dark}
            reviews={reviews}
            reviewCount={reviewCount}
            averageRating={averageRating}
            businessName={businessName}
            onShowAll={() => setShowAllReviews(true)}
          />
        </View>

        {/* Report text link — visitor only. Subtle, under the reviews,
            no chrome. Per product call: plain link is enough.        */}
        {isVisitor && onReport && (
          <>
            <View style={[styles.flowDivider, { backgroundColor: c.border, marginTop: 28 }]} />
            <Pressable
              onPress={onReport}
              hitSlop={8}
              style={({ pressed }) => [
                styles.reportLink,
                pressed && { opacity: 0.6 },
              ]}
              accessibilityRole="button"
            >
              <Ionicons name="flag-outline" size={14} color={c.textMuted} />
              <ThemedText style={[styles.reportLinkText, { color: c.textMuted }]}>
                Report this trade
              </ThemedText>
            </Pressable>
          </>
        )}

        <Spacer height={24} />
      </ScrollView>

      {/* Visitor CTA dock — pinned bottom. Message (ghost) + Request a
          quote (primary). Hidden in owner + preview modes.            */}
      {isVisitor && (onMessage || onRequestQuote) && (
        <View
          style={[
            styles.ctaDock,
            {
              backgroundColor: c.background,
              borderTopColor: c.border,
              paddingBottom: (insets?.bottom || 0) + 14,
            },
          ]}
        >
          {onMessage && (
            <Pressable
              onPress={onMessage}
              style={({ pressed }) => [
                styles.ctaGhost,
                { backgroundColor: c.elevate, borderColor: c.borderStrong },
                pressed && { opacity: 0.85 },
              ]}
              accessibilityLabel="Message trade"
            >
              <Ionicons
                name="chatbubble-ellipses-outline"
                size={16}
                color={c.text}
                style={{ marginRight: 8 }}
              />
              <ThemedText style={[styles.ctaGhostText, { color: c.text }]}>
                Message
              </ThemedText>
            </Pressable>
          )}
          {onRequestQuote && (
            <Pressable
              onPress={onRequestQuote}
              style={({ pressed }) => [
                styles.ctaPrimary,
                { backgroundColor: PRIMARY },
                pressed && { opacity: 0.85 },
              ]}
              accessibilityLabel="Request a quote"
            >
              <Ionicons name="send" size={15} color="#fff" style={{ marginRight: 8 }} />
              <ThemedText style={styles.ctaPrimaryText}>Request a quote</ThemedText>
            </Pressable>
          )}
        </View>
      )}

      {/* Modals — shared across all modes. */}
      <AllReviewsModal
        c={c}
        dark={dark}
        visible={showAllReviews}
        onClose={() => setShowAllReviews(false)}
        reviews={reviews}
        reviewCount={reviewCount}
        averageRating={averageRating}
        businessName={businessName}
        insets={insets}
      />
      <PerformanceInfoModal
        c={c}
        visible={performanceInfoVisible}
        onClose={() => setPerformanceInfoVisible(false)}
        insets={insets}
      />
      <VerificationSheet
        c={c}
        visible={verificationSheetVisible}
        onClose={() => setVerificationSheetVisible(false)}
        verification={verification}
        insets={insets}
      />
    </ThemedView>
  );
}

// ======================================================================
// Sub-components
// ======================================================================

function ProfileHero({
  c,
  photoUrl,
  displayName,
  businessName,
  locationDisplay,
  verification,
  verifiedCount,
  jobTitles = [],
  onVerificationPress,
}) {
  const showName = businessName || displayName;
  const showSub = businessName ? getNameWithInitial(displayName) : null;

  return (
    <View style={styles.hero}>
      <View style={styles.heroTop}>
        {photoUrl ? (
          <Image source={{ uri: photoUrl }} style={styles.heroAvatar} />
        ) : (
          <View
            style={[
              styles.heroAvatar,
              styles.heroAvatarFallback,
              { backgroundColor: c.elevate, borderColor: c.border },
            ]}
          >
            <ThemedText style={[styles.heroAvatarInitials, { color: c.textMid }]}>
              {getInitials(showName)}
            </ThemedText>
          </View>
        )}

        <View style={styles.heroTextCol}>
          <ThemedText style={[styles.heroName, { color: c.text }]} numberOfLines={2}>
            {showName}
          </ThemedText>
          {!!showSub && (
            <ThemedText style={[styles.heroSub, { color: c.textMid }]} numberOfLines={1}>
              {showSub}
            </ThemedText>
          )}
          {!!locationDisplay && (
            <View style={styles.heroLocRow}>
              <Ionicons name="location-outline" size={14} color={c.textMuted} />
              <ThemedText style={[styles.heroLoc, { color: c.textMuted }]} numberOfLines={1}>
                {locationDisplay}
              </ThemedText>
            </View>
          )}
          {verification && (
            <Pressable
              onPress={onVerificationPress}
              hitSlop={6}
              style={({ pressed }) => [
                styles.heroVerifyRow,
                pressed && { opacity: 0.6 },
              ]}
              accessibilityRole="button"
              accessibilityLabel={`Verification: ${verifiedCount} of 3 verified. Tap for details.`}
            >
              <InlineVerifyBadge c={c} icon="person-outline" status={verification.photo_id} />
              <InlineVerifyBadge c={c} icon="shield-outline" status={verification.insurance} />
              <InlineVerifyBadge c={c} icon="ribbon-outline" status={verification.credentials} />
              <ThemedText
                style={[
                  styles.heroVerifySummary,
                  { color: verifiedCount === 3 ? "#10B981" : c.textMuted },
                ]}
                numberOfLines={1}
              >
                {verifiedCount === 3 ? "Fully verified" : `${verifiedCount}/3 verified`}
              </ThemedText>
            </Pressable>
          )}
        </View>
      </View>

      {jobTitles.length > 0 && (
        <View style={styles.heroChipsRow}>
          {jobTitles.map((t, i) => (
            <View
              key={`${t}-${i}`}
              style={[styles.chip, { backgroundColor: c.elevate, borderColor: c.border }]}
            >
              <ThemedText style={[styles.chipText, { color: c.text }]}>{t}</ThemedText>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

function InlineVerifyBadge({ c, icon, status }) {
  const isVerified = status === "verified";
  return (
    <View
      style={[
        styles.inlineBadge,
        {
          backgroundColor: isVerified ? "#D1FAE5" : c.elevate,
          borderColor: isVerified ? "#10B981" : c.border,
        },
      ]}
    >
      <Ionicons name={icon} size={12} color={isVerified ? "#059669" : c.textMuted} />
      {isVerified && (
        <View style={styles.inlineBadgeCheck}>
          <Ionicons name="checkmark" size={7} color="#FFFFFF" />
        </View>
      )}
    </View>
  );
}

function ReviewsSection({ c, dark, reviews, reviewCount, averageRating, businessName, onShowAll }) {
  const [photoViewer, setPhotoViewer] = useState({ open: false, images: [], index: 0 });
  const hasReviews = reviews.length > 0;

  const openPhotoViewer = (photos, startIndex = 0) => {
    setPhotoViewer({ open: true, images: photos.map((url) => ({ uri: url })), index: startIndex });
  };

  const renderStars = (rating, size = 14) => (
    <View style={styles.starsRow}>
      {[1, 2, 3, 4, 5].map((s) => (
        <Ionicons
          key={s}
          name={s <= rating ? "star" : "star-outline"}
          size={size}
          color="#F59E0B"
        />
      ))}
    </View>
  );

  const ReviewCard = ({ review }) => {
    const reviewerName = review.reviewer?.full_name || "Client";
    const reviewerPhoto = review.reviewer?.photo_url;
    const hasPhotos = review.photos && review.photos.length > 0;
    return (
      <View
        style={[
          styles.reviewCard,
          { backgroundColor: c.elevate2, borderColor: c.borderStrong },
        ]}
      >
        <View style={styles.reviewerRow}>
          {reviewerPhoto ? (
            <Image source={{ uri: reviewerPhoto }} style={styles.reviewerAvatar} />
          ) : (
            <View
              style={[
                styles.reviewerAvatar,
                { backgroundColor: c.elevate, borderColor: c.border, borderWidth: 1 },
                { alignItems: "center", justifyContent: "center" },
              ]}
            >
              <ThemedText style={[styles.reviewerInitials, { color: c.textMid }]}>
                {getInitials(reviewerName)}
              </ThemedText>
            </View>
          )}
          <View style={styles.reviewerInfo}>
            <ThemedText style={[styles.reviewerName, { color: c.text }]} numberOfLines={1}>
              {reviewerName}
            </ThemedText>
            <ThemedText style={[styles.reviewDate, { color: c.textMuted }]}>
              {formatRelativeTime(review.created_at)}
            </ThemedText>
          </View>
        </View>
        <View style={styles.reviewRatingRow}>{renderStars(review.rating)}</View>
        {!!review.content && (
          <ThemedText style={[styles.reviewContent, { color: c.textMid }]} numberOfLines={4}>
            {review.content}
          </ThemedText>
        )}
        {hasPhotos && (
          <View style={styles.reviewPhotosRow}>
            {review.photos.map((url, i) => (
              <Pressable key={i} onPress={() => openPhotoViewer(review.photos, i)}>
                <Image source={{ uri: url }} style={styles.reviewPhoto} />
              </Pressable>
            ))}
          </View>
        )}
      </View>
    );
  };

  const headerTitle = hasReviews
    ? (businessName
        ? `${businessName}'s reviews`
        : `${averageRating.toFixed(1)} · ${reviewCount} review${reviewCount !== 1 ? "s" : ""}`)
    : "Reviews";

  return (
    <View style={styles.reviewsSection}>
      <ThemedText style={[styles.reviewsTitle, { color: c.text }]}>{headerTitle}</ThemedText>
      {hasReviews && (
        <View style={styles.ratingSubRow}>
          {renderStars(Math.round(averageRating), 16)}
          <ThemedText style={[styles.ratingSubText, { color: c.textMid }]}>
            {averageRating.toFixed(1)} · {reviewCount} review{reviewCount !== 1 ? "s" : ""}
          </ThemedText>
        </View>
      )}
      {hasReviews ? (
        <>
          <FlatList
            data={reviews.slice(0, 5)}
            horizontal
            showsHorizontalScrollIndicator={false}
            keyExtractor={(it) => it.id}
            renderItem={({ item }) => <ReviewCard review={item} />}
            contentContainerStyle={styles.reviewsList}
            snapToInterval={340 + 12}
            decelerationRate="fast"
            style={{ marginTop: 14 }}
          />
          <Pressable
            onPress={onShowAll}
            style={({ pressed }) => [
              styles.showAllBtn,
              { borderColor: c.borderStrong, backgroundColor: c.elevate },
              pressed && { opacity: 0.8 },
            ]}
          >
            <ThemedText style={[styles.showAllText, { color: c.text }]}>Show all reviews</ThemedText>
          </Pressable>
        </>
      ) : (
        <View
          style={[
            styles.noReviewsCard,
            { backgroundColor: c.elevate2, borderColor: c.borderStrong },
          ]}
        >
          <Ionicons name="chatbubble-outline" size={28} color={c.textMuted} />
          <ThemedText style={[styles.noReviewsTitle, { color: c.textMid }]}>
            No reviews yet
          </ThemedText>
          <ThemedText style={[styles.noReviewsSub, { color: c.textMuted }]}>
            Reviews from clients will appear here.
          </ThemedText>
        </View>
      )}
      <ImageViewing
        images={photoViewer.images}
        imageIndex={photoViewer.index}
        visible={photoViewer.open}
        onRequestClose={() => setPhotoViewer({ open: false, images: [], index: 0 })}
      />
    </View>
  );
}

function AllReviewsModal({ c, dark, visible, onClose, reviews, reviewCount, averageRating, businessName, insets }) {
  const [photoViewer, setPhotoViewer] = useState({ open: false, images: [], index: 0 });
  const openPhotoViewer = (photos, startIndex = 0) =>
    setPhotoViewer({ open: true, images: photos.map((u) => ({ uri: u })), index: startIndex });

  const renderStars = (rating, size = 14) => (
    <View style={styles.starsRow}>
      {[1, 2, 3, 4, 5].map((s) => (
        <Ionicons key={s} name={s <= rating ? "star" : "star-outline"} size={size} color="#F59E0B" />
      ))}
    </View>
  );

  const FullReviewItem = ({ review }) => {
    const reviewerName = review.reviewer?.full_name || "Client";
    const reviewerPhoto = review.reviewer?.photo_url;
    const hasPhotos = review.photos && review.photos.length > 0;
    return (
      <View style={styles.fullReviewItem}>
        <View style={styles.fullReviewerRow}>
          {reviewerPhoto ? (
            <Image source={{ uri: reviewerPhoto }} style={styles.fullReviewerAvatar} />
          ) : (
            <View
              style={[
                styles.fullReviewerAvatar,
                { backgroundColor: c.elevate, borderColor: c.border, borderWidth: 1 },
                { alignItems: "center", justifyContent: "center" },
              ]}
            >
              <ThemedText style={[styles.fullReviewerInitials, { color: c.textMid }]}>
                {getInitials(reviewerName)}
              </ThemedText>
            </View>
          )}
          <View style={styles.fullReviewerInfo}>
            <ThemedText style={[styles.fullReviewerName, { color: c.text }]}>
              {reviewerName}
            </ThemedText>
            <View style={styles.fullReviewMeta}>
              {renderStars(review.rating, 12)}
              <ThemedText style={[styles.fullReviewDate, { color: c.textMuted }]}>
                {"  ·  "}
                {formatRelativeTime(review.created_at)}
              </ThemedText>
            </View>
          </View>
        </View>
        {!!review.content && (
          <ThemedText style={[styles.fullReviewContent, { color: c.textMid }]}>
            {review.content}
          </ThemedText>
        )}
        {hasPhotos && (
          <View style={styles.fullReviewPhotosRow}>
            {review.photos.map((u, i) => (
              <Pressable key={i} onPress={() => openPhotoViewer(review.photos, i)}>
                <Image source={{ uri: u }} style={styles.fullReviewPhoto} />
              </Pressable>
            ))}
          </View>
        )}
      </View>
    );
  };

  return (
    <>
      <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
        <View style={styles.sheetOverlay}>
          <View
            style={[
              styles.sheetContent,
              { backgroundColor: c.background, paddingBottom: (insets?.bottom || 0) + 20 },
            ]}
          >
            <View style={[styles.sheetHandle, { backgroundColor: c.borderStrong }]} />
            <View style={styles.sheetHeaderRow}>
              <View style={{ flex: 1 }}>
                <ThemedText style={[styles.sheetEyebrow, { color: c.textMuted }]}>
                  {businessName ? `${businessName.toUpperCase()} · REVIEWS` : "REVIEWS"}
                </ThemedText>
                <ThemedText style={[styles.sheetTitle, { color: c.text }]}>
                  {averageRating > 0 ? averageRating.toFixed(1) : "–"} · {reviewCount} review
                  {reviewCount !== 1 ? "s" : ""}
                </ThemedText>
              </View>
              <Pressable
                onPress={onClose}
                hitSlop={10}
                style={[styles.sheetCloseBtn, { backgroundColor: c.elevate, borderColor: c.border }]}
              >
                <Ionicons name="close" size={18} color={c.text} />
              </Pressable>
            </View>
            <View style={[styles.sheetDivider, { backgroundColor: c.border }]} />
            <FlatList
              data={reviews}
              keyExtractor={(it) => it.id}
              renderItem={({ item }) => <FullReviewItem review={item} />}
              contentContainerStyle={styles.fullReviewsList}
              showsVerticalScrollIndicator={false}
              ItemSeparatorComponent={() => (
                <View style={[styles.reviewSeparator, { backgroundColor: c.border }]} />
              )}
            />
          </View>
        </View>
      </Modal>
      <ImageViewing
        images={photoViewer.images}
        imageIndex={photoViewer.index}
        visible={photoViewer.open}
        onRequestClose={() => setPhotoViewer({ open: false, images: [], index: 0 })}
      />
    </>
  );
}

function PerformanceInfoModal({ c, visible, onClose, insets }) {
  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.sheetOverlay}>
        <View
          style={[
            styles.sheetContent,
            { backgroundColor: c.background, paddingBottom: (insets?.bottom || 0) + 20 },
          ]}
        >
          <View style={[styles.sheetHandle, { backgroundColor: c.borderStrong }]} />
          <View style={styles.sheetHeaderRow}>
            <View style={{ flex: 1 }}>
              <ThemedText style={[styles.sheetEyebrow, { color: c.textMuted }]}>
                PERFORMANCE
              </ThemedText>
              <ThemedText style={[styles.sheetTitle, { color: c.text }]}>
                How it's measured
              </ThemedText>
            </View>
            <Pressable
              onPress={onClose}
              hitSlop={10}
              style={[styles.sheetCloseBtn, { backgroundColor: c.elevate, borderColor: c.border }]}
            >
              <Ionicons name="close" size={18} color={c.text} />
            </Pressable>
          </View>
          <View style={[styles.sheetDivider, { backgroundColor: c.border }]} />
          <ScrollView contentContainerStyle={styles.perfInfoScroll}>
            <View style={styles.perfInfoSection}>
              <View style={styles.perfInfoHeader}>
                <Ionicons name="flash" size={18} color={PRIMARY} />
                <ThemedText style={[styles.perfInfoTitle, { color: c.text }]}>Response time</ThemedText>
              </View>
              <ThemedText style={[styles.perfInfoBody, { color: c.textMid }]}>
                How quickly the business replies to new requests and messages. Clients often reach
                out to several trades — a quick first reply is one of the biggest drivers of winning
                the job.
              </ThemedText>
            </View>
            <View style={[styles.perfInfoDivider, { backgroundColor: c.border }]} />
            <View style={styles.perfInfoSection}>
              <View style={styles.perfInfoHeader}>
                <Ionicons name="checkmark" size={18} color={PRIMARY} />
                <ThemedText style={[styles.perfInfoTitle, { color: c.text }]}>Quote rate</ThemedText>
              </View>
              <ThemedText style={[styles.perfInfoBody, { color: c.textMid }]}>
                The percentage of accepted requests that get a real quote. A 3-day grace period is
                applied after accepting so new requests don't drag the rate down unfairly.
              </ThemedText>
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function VerificationSheet({ c, visible, onClose, verification, insets }) {
  const statusMeta = {
    verified: { label: "Verified", fg: "#10B981", bg: "#D1FAE5" },
    under_review: { label: "Under review", fg: "#3B82F6", bg: "#DBEAFE" },
    pending_review: { label: "Under review", fg: "#3B82F6", bg: "#DBEAFE" },
    submitted: { label: "Submitted", fg: "#3B82F6", bg: "#DBEAFE" },
    rejected: { label: "Rejected", fg: "#DC2626", bg: "#FEE2E2" },
    expired: { label: "Expired", fg: "#DC2626", bg: "#FEE2E2" },
    expiring_soon: { label: "Expiring", fg: "#D97706", bg: "#FEF3C7" },
    not_started: { label: "Not started", fg: c.textMuted, bg: c.elevate },
  };
  const rows = [
    { icon: "person-outline", label: "Photo ID", status: verification?.photo_id || "not_started" },
    { icon: "shield-outline", label: "Insurance", status: verification?.insurance || "not_started" },
    { icon: "ribbon-outline", label: "Credentials", status: verification?.credentials || "not_started" },
  ];
  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.sheetOverlay}>
        <View
          style={[
            styles.sheetContent,
            {
              backgroundColor: c.background,
              paddingBottom: (insets?.bottom || 0) + 20,
              height: "54%",
            },
          ]}
        >
          <View style={[styles.sheetHandle, { backgroundColor: c.borderStrong }]} />
          <View style={styles.sheetHeaderRow}>
            <View style={{ flex: 1 }}>
              <ThemedText style={[styles.sheetEyebrow, { color: c.textMuted }]}>
                VERIFICATION
              </ThemedText>
              <ThemedText style={[styles.sheetTitle, { color: c.text }]}>Documents</ThemedText>
            </View>
            <Pressable
              onPress={onClose}
              hitSlop={10}
              style={[styles.sheetCloseBtn, { backgroundColor: c.elevate, borderColor: c.border }]}
            >
              <Ionicons name="close" size={18} color={c.text} />
            </Pressable>
          </View>
          <View style={[styles.sheetDivider, { backgroundColor: c.border }]} />
          <View style={{ paddingHorizontal: 20, paddingTop: 12 }}>
            {rows.map((r, i) => {
              const meta = statusMeta[r.status] || statusMeta.not_started;
              return (
                <View key={r.label}>
                  <View style={styles.rowBase}>
                    <View style={styles.rowLeft}>
                      <View
                        style={[
                          styles.rowIconWrap,
                          { backgroundColor: c.elevate, borderColor: c.border },
                        ]}
                      >
                        <Ionicons name={r.icon} size={16} color={c.textMid} />
                      </View>
                      <ThemedText style={[styles.rowLabel, { color: c.text }]}>
                        {r.label}
                      </ThemedText>
                    </View>
                    <View style={[styles.statusChip, { backgroundColor: meta.bg }]}>
                      <ThemedText style={[styles.statusChipText, { color: meta.fg }]}>
                        {meta.label}
                      </ThemedText>
                    </View>
                  </View>
                  {i < rows.length - 1 && (
                    <View style={{ height: 1, backgroundColor: c.border, marginVertical: 12 }} />
                  )}
                </View>
              );
            })}
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ======================================================================
// Styles
// ======================================================================

const styles = StyleSheet.create({
  container: { flex: 1 },
  topBar: {
    position: "absolute",
    right: 16,
    flexDirection: "row",
    gap: 8,
    zIndex: 20,
  },
  inlineChevron: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  titleBlock: { paddingTop: 4, paddingBottom: 10 },
  pageTitle: {
    fontFamily: FontFamily.headerBold,
    fontSize: 32,
    lineHeight: 34,
    letterSpacing: -0.8,
  },
  scrollContent: { paddingHorizontal: 20 },
  previewBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    alignSelf: "flex-start",
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 5,
    marginBottom: 10,
  },
  previewBannerText: {
    fontFamily: FontFamily.bodyMedium,
    fontSize: 12,
  },

  // Hero
  hero: { paddingVertical: 8 },
  heroTop: { flexDirection: "row", alignItems: "center", gap: 14 },
  heroChipsRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 14 },
  heroAvatar: { width: 76, height: 76, borderRadius: 38 },
  heroAvatarFallback: { alignItems: "center", justifyContent: "center", borderWidth: 1 },
  heroAvatarInitials: { fontFamily: FontFamily.headerBold, fontSize: 26 },
  heroTextCol: { flex: 1, minWidth: 0 },
  heroName: {
    fontFamily: FontFamily.headerBold,
    fontSize: 22,
    lineHeight: 26,
    letterSpacing: -0.4,
  },
  heroSub: { fontFamily: FontFamily.bodyRegular, fontSize: 13, marginTop: 2 },
  heroLocRow: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 6 },
  heroLoc: { fontFamily: FontFamily.bodyMedium, fontSize: 13, flexShrink: 1 },
  heroVerifyRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 8 },
  heroVerifySummary: {
    fontFamily: FontFamily.bodyMedium,
    fontSize: 12.5,
    marginLeft: 4,
  },

  inlineBadge: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  inlineBadgeCheck: {
    position: "absolute",
    top: -3,
    right: -3,
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: "#10B981",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
    borderColor: "#FFFFFF",
  },

  // Flow
  flowDivider: { height: 1, marginTop: 20, marginBottom: 4 },
  flowBlock: { paddingTop: 14 },

  // Perf inline
  perfInlineWrap: { paddingTop: 10, paddingBottom: 4 },
  perfInlineRow: { flexDirection: "row", alignItems: "center", gap: 14 },
  perfInlineItem: { flexDirection: "row", alignItems: "center", gap: 6 },
  perfInlineValueRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  perfInlineValue: {
    fontFamily: FontFamily.headerSemibold,
    fontSize: 14,
    letterSpacing: -0.2,
  },
  perfInlineLabel: { fontFamily: FontFamily.bodyRegular, fontSize: 13 },
  perfInlineDivider: { width: 1, height: 14 },

  // Body text
  bodyText: { fontFamily: FontFamily.bodyRegular, fontSize: 15, lineHeight: 22 },

  // Chips
  chip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, borderWidth: 1 },
  chipText: { fontFamily: FontFamily.bodyMedium, fontSize: 13 },

  // Reviews
  reviewsSection: { marginTop: 6 },
  reviewsTitle: {
    fontFamily: FontFamily.headerBold,
    fontSize: 22,
    letterSpacing: -0.4,
  },
  ratingSubRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 6 },
  ratingSubText: { fontFamily: FontFamily.bodyMedium, fontSize: 13 },
  starsRow: { flexDirection: "row", gap: 2 },
  reviewsList: { paddingRight: 20 },
  reviewCard: { width: 340, borderRadius: 18, borderWidth: 1, padding: 16, marginRight: 12 },
  reviewerRow: { flexDirection: "row", alignItems: "center", marginBottom: 10 },
  reviewerAvatar: { width: 40, height: 40, borderRadius: 20 },
  reviewerInitials: { fontFamily: FontFamily.headerSemibold, fontSize: 14 },
  reviewerInfo: { marginLeft: 10, flex: 1 },
  reviewerName: { fontFamily: FontFamily.headerSemibold, fontSize: 14 },
  reviewDate: { fontFamily: FontFamily.bodyRegular, fontSize: 12, marginTop: 2 },
  reviewRatingRow: { marginBottom: 8 },
  reviewContent: { fontFamily: FontFamily.bodyRegular, fontSize: 14, lineHeight: 20 },
  reviewPhotosRow: { flexDirection: "row", marginTop: 12 },
  reviewPhoto: { width: 56, height: 56, borderRadius: 8, marginRight: 6 },
  showAllBtn: {
    alignSelf: "center",
    paddingVertical: 12,
    paddingHorizontal: 22,
    marginTop: 18,
    borderRadius: 999,
    borderWidth: 1,
  },
  showAllText: {
    fontFamily: FontFamily.headerSemibold,
    fontSize: 14,
    letterSpacing: -0.1,
  },
  noReviewsCard: {
    marginTop: 12,
    borderRadius: 18,
    borderWidth: 1,
    paddingVertical: 28,
    paddingHorizontal: 20,
    alignItems: "center",
  },
  noReviewsTitle: { fontFamily: FontFamily.headerSemibold, fontSize: 15, marginTop: 10 },
  noReviewsSub: {
    fontFamily: FontFamily.bodyRegular,
    fontSize: 13,
    marginTop: 4,
    textAlign: "center",
  },

  // Report link (visitor)
  reportLink: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "center",
    gap: 6,
    paddingVertical: 14,
    paddingHorizontal: 18,
    marginTop: 10,
  },
  reportLinkText: {
    fontFamily: FontFamily.bodyMedium,
    fontSize: 13,
    textDecorationLine: "underline",
  },

  // Visitor CTA dock
  ctaDock: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: "row",
    gap: 10,
    paddingHorizontal: 20,
    paddingTop: 12,
    borderTopWidth: 1,
  },
  ctaGhost: {
    flex: 1,
    height: 52,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
  },
  ctaGhostText: {
    fontFamily: FontFamily.headerSemibold,
    fontSize: 15,
    letterSpacing: -0.1,
  },
  ctaPrimary: {
    flex: 2,
    height: 52,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
  },
  ctaPrimaryText: {
    fontFamily: FontFamily.headerSemibold,
    fontSize: 15,
    color: "#FFFFFF",
    letterSpacing: -0.1,
  },

  // Sheet chrome
  sheetOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
  },
  sheetContent: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    height: "82%",
    paddingTop: 12,
  },
  sheetHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    alignSelf: "center",
    marginBottom: 14,
  },
  sheetHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingBottom: 14,
  },
  sheetEyebrow: {
    fontFamily: FontFamily.headerBold,
    fontSize: 11,
    letterSpacing: 1.2,
    textTransform: "uppercase",
    marginBottom: 4,
  },
  sheetTitle: {
    fontFamily: FontFamily.headerBold,
    fontSize: 22,
    letterSpacing: -0.4,
  },
  sheetCloseBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  sheetDivider: { height: 1, marginHorizontal: 20 },

  fullReviewsList: { paddingHorizontal: 20, paddingTop: 8 },
  fullReviewItem: { paddingVertical: 18 },
  fullReviewerRow: { flexDirection: "row", alignItems: "center", marginBottom: 10 },
  fullReviewerAvatar: { width: 44, height: 44, borderRadius: 22 },
  fullReviewerInitials: { fontFamily: FontFamily.headerSemibold, fontSize: 15 },
  fullReviewerInfo: { marginLeft: 12, flex: 1 },
  fullReviewerName: { fontFamily: FontFamily.headerSemibold, fontSize: 15 },
  fullReviewMeta: { flexDirection: "row", alignItems: "center", marginTop: 2 },
  fullReviewDate: { fontFamily: FontFamily.bodyRegular, fontSize: 13 },
  fullReviewContent: { fontFamily: FontFamily.bodyRegular, fontSize: 15, lineHeight: 22 },
  fullReviewPhotosRow: { flexDirection: "row", marginTop: 12 },
  fullReviewPhoto: { width: 56, height: 56, borderRadius: 8, marginRight: 6 },
  reviewSeparator: { height: 1 },

  perfInfoScroll: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 24 },
  perfInfoSection: { paddingVertical: 14 },
  perfInfoHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 8,
  },
  perfInfoTitle: { fontFamily: FontFamily.headerSemibold, fontSize: 16 },
  perfInfoBody: { fontFamily: FontFamily.bodyRegular, fontSize: 14, lineHeight: 21 },
  perfInfoDivider: { height: 1, marginHorizontal: 0 },

  // Row base (verification)
  rowBase: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  rowLeft: { flexDirection: "row", alignItems: "center", gap: 10, flex: 1, minWidth: 0 },
  rowIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  rowLabel: { fontFamily: FontFamily.bodyMedium, fontSize: 15, flex: 1 },
  statusChip: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  statusChipText: { fontFamily: FontFamily.headerSemibold, fontSize: 12 },
});
