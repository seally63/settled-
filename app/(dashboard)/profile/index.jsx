// app/(dashboard)/profile/index.jsx
// Profile tab — full redesign pass.
//
// Shape + typography match the Home / Projects / Messages pattern:
//   · Public-Sans-Bold 28 page title at the top, burger icon on the right.
//   · Pill-container cards (elevate2 bg, borderStrong, radius 18)
//     with small uppercase eyebrow + content rows, same pattern used on
//     Client Request / Quote Overview.
//   · Fully dark-mode aware via useTheme — no hard-coded Colors.light.*
//     on rendered text / backgrounds.
//
// The trade variant keeps every data surface the old screen had
// (verification status, reviews, performance stats, bio, job titles,
// location, show-all-reviews modal) — just reorganised off the
// Airbnb-y two-column card into the Settled redesign language.
//
// The client variant is intentionally minimal (avatar + display name
// + project count) — the Settings screen via the burger menu is where
// their account surface lives.

import { useEffect, useState, useCallback } from "react";
import {
  StyleSheet,
  View,
  ScrollView,
  Image,
  Pressable,
  FlatList,
  Modal,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter, useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import ImageViewing from "react-native-image-viewing";

import ThemedView from "../../../components/ThemedView";
import ThemedText from "../../../components/ThemedText";
import Spacer from "../../../components/Spacer";
import { ProfilePageSkeleton } from "../../../components/Skeleton";
import { IconBtn } from "../../../components/design";
import { Colors } from "../../../constants/Colors";
import { FontFamily, TypeVariants } from "../../../constants/Typography";
import { useTheme } from "../../../hooks/useTheme";

import { useUser } from "../../../hooks/useUser";
import { getMyRole, getMyProfile } from "../../../lib/api/profile";
import { getTradeReviews } from "../../../lib/api/trust";
import { supabase } from "../../../lib/supabase";
import ThemedStatusBar from "../../../components/ThemedStatusBar";

const PRIMARY = Colors.primary;

export const options = {
  title: "Profile",
  tabBarIcon: ({ color, size, focused }) => (
    <Ionicons
      name={focused ? "person-circle" : "person-circle-outline"}
      size={size}
      color={color}
    />
  ),
};

// ---- small helpers ---------------------------------------------------

function normalizeRole(r) {
  if (r == null) return null;
  const s = String(r).trim().toLowerCase();
  if (["trade", "trades", "tradesman", "tradesperson", "business", "pro"].includes(s)) return "trades";
  if (["client", "customer", "homeowner", "user"].includes(s)) return "client";
  return s;
}

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
  if (parts.length >= 2) {
    return `${parts[0]} ${parts[parts.length - 1][0]}.`;
  }
  return fullName;
}

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

// ======================================================================
// Screen
// ======================================================================

export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user, authChecked } = useUser();
  const { colors: c, dark } = useTheme();

  const [role, setRole] = useState(null);
  const [roleLoading, setRoleLoading] = useState(true);
  const [profile, setProfile] = useState(null);
  const [reviews, setReviews] = useState([]);
  const [loadingData, setLoadingData] = useState(true);
  const [showAllReviews, setShowAllReviews] = useState(false);
  const [verificationSheetVisible, setVerificationSheetVisible] = useState(false);
  const [performanceStats, setPerformanceStats] = useState({
    responseTimeHours: null,
    quoteRate: null,
  });
  const [performanceInfoVisible, setPerformanceInfoVisible] = useState(false);

  // ---- role ---------------------------------------------------------
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

  // ---- profile + reviews + performance ------------------------------
  const loadProfile = useCallback(async () => {
    if (!user?.id) return;
    try {
      setLoadingData(true);
      const me = await getMyProfile();
      setProfile(me || null);

      if (me?.id) {
        const reviewsData = await getTradeReviews(me.id, { limit: 20 });
        setReviews(reviewsData || []);

        // Quote-rate computation (same algorithm as before — untouched
        // data logic; only the render is being redesigned).
        const myId = user.id;

        const { data: targets } = await supabase
          .from("request_targets")
          .select("request_id, state, first_action_at")
          .eq("trade_id", myId);

        const { data: quotes } = await supabase
          .from("tradify_native_app_db")
          .select("id, request_id, status")
          .eq("trade_id", myId);

        const now = new Date();
        const gracePeriodMs = 3 * 24 * 60 * 60 * 1000;

        const requestsWithQuotesSet = new Set(
          (quotes || [])
            .filter((q) =>
              ["sent", "accepted", "declined", "expired", "completed", "awaiting_completion"].includes(
                (q.status || "").toLowerCase()
              )
            )
            .map((q) => q.request_id)
        );

        const matureAcceptedRequests = (targets || []).filter((t) => {
          if (!t.state?.toLowerCase().includes("accepted")) return false;
          if (requestsWithQuotesSet.has(t.request_id)) return true;
          if (t.first_action_at) {
            const acceptedAt = new Date(t.first_action_at);
            return (now - acceptedAt) > gracePeriodMs;
          }
          return false;
        });

        const quoteRate = matureAcceptedRequests.length > 0
          ? Math.min(
              100,
              Math.round((requestsWithQuotesSet.size / matureAcceptedRequests.length) * 100)
            )
          : null;

        setPerformanceStats({
          responseTimeHours: null, // reserved — back-end RPC not wired yet
          quoteRate,
        });
      }
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

  if (roleLoading || loadingData) {
    return (
      <ThemedView style={[styles.container, { paddingTop: insets.top }]}>
        <ThemedStatusBar />
        <ProfilePageSkeleton paddingTop={16} />
      </ThemedView>
    );
  }

  const isTrades = role === "trades";

  // ---- derived display data -----------------------------------------
  const displayName = profile?.full_name || user?.email || "User";
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

  const projectCount = profile?.project_count || 0;

  return (
    <ThemedView style={[styles.container, { paddingTop: insets.top }]}>
      <ThemedStatusBar />

      {/* Top-right icon dock — same position / chrome as the 3-dots on
          the trade Home tab and the filter icon on Projects. Floats
          over the scroll content with no wrapping row or surface
          behind it.                                                */}
      <View style={[styles.topBar, { top: insets.top + 12 }]}>
        <IconBtn
          icon="menu-outline"
          onPress={() => router.push("/profile/settings")}
          testID="profile-settings-btn"
        />
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Page title — matches Home / Projects. Public Sans Bold 32,
            lives inside the scroll (no row wrapper / no block behind
            it — just free-standing text).                          */}
        <View style={styles.titleBlock}>
          <ThemedText style={[styles.pageTitle, { color: c.text }]}>
            Profile
          </ThemedText>
        </View>

        {/* ─────── Zone 1 — Identity hero ───────────────────────
            Photo, name/business, location, verification badges, and
            trade chips — all part of "who this person is". No card,
            no section headers. The chips are inline here (not in a
            separate section) because they describe identity, not a
            different surface.                                       */}
        <ProfileHero
          c={c}
          photoUrl={photoUrl}
          displayName={displayName}
          businessName={businessName}
          locationDisplay={locationDisplay}
          isTrades={isTrades}
          projectCount={projectCount}
          verification={verification}
          verifiedCount={verifiedCount}
          jobTitles={jobTitles}
          onVerificationPress={() => setVerificationSheetVisible(true)}
        />

        {isTrades && (
          <>
            {/* About — plain paragraph, no card. Only rendered when a
                bio exists; the thin divider above it separates it from
                the identity hero block.                             */}
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

            {/* Performance — a quiet inline row right above reviews.
                Two columns only (response + quote rate). The star
                rating + review count are redundant here because the
                Reviews section immediately below shows them prominently. */}
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

            {/* Reviews — no leading divider; the perf row above it is
                tight enough to act as its own separator. */}
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
          </>
        )}

        <Spacer height={insets.bottom + 180} />
      </ScrollView>

      {isTrades && (
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
      )}
      {isTrades && (
        <PerformanceInfoModal
          c={c}
          dark={dark}
          visible={performanceInfoVisible}
          onClose={() => setPerformanceInfoVisible(false)}
          insets={insets}
        />
      )}
      {isTrades && (
        <VerificationSheet
          c={c}
          visible={verificationSheetVisible}
          onClose={() => setVerificationSheetVisible(false)}
          verification={verification}
          insets={insets}
        />
      )}
    </ThemedView>
  );
}

// ======================================================================
// Hero — flat avatar + name + location, no card wrapping.
// ======================================================================

function ProfileHero({
  c,
  photoUrl,
  displayName,
  businessName,
  locationDisplay,
  isTrades,
  projectCount,
  verification,
  verifiedCount,
  jobTitles = [],
  onVerificationPress,
}) {
  const showName = isTrades ? (businessName || displayName) : displayName;
  const showSub = isTrades
    ? (businessName ? getNameWithInitial(displayName) : null)
    : `${projectCount} project${projectCount !== 1 ? "s" : ""} completed`;

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
          {isTrades && verification && (
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
              <InlineVerifyBadge
                c={c}
                icon="person-outline"
                status={verification.photo_id}
              />
              <InlineVerifyBadge
                c={c}
                icon="shield-outline"
                status={verification.insurance}
              />
              <InlineVerifyBadge
                c={c}
                icon="ribbon-outline"
                status={verification.credentials}
              />
              <ThemedText
                style={[
                  styles.heroVerifySummary,
                  { color: verifiedCount === 3 ? "#10B981" : c.textMuted },
                ]}
                numberOfLines={1}
              >
                {verifiedCount === 3
                  ? "Fully verified"
                  : `${verifiedCount}/3 verified`}
              </ThemedText>
            </Pressable>
          )}
        </View>
      </View>

      {/* Trade chips — sit inline at the bottom of the hero, under the
          verification row. Part of identity, not a separate section.
          Wraps under the avatar column so longer chip sets still read
          cleanly on narrow screens.                                */}
      {isTrades && jobTitles.length > 0 && (
        <View style={styles.heroChipsRow}>
          {jobTitles.map((t, i) => (
            <View
              key={`${t}-${i}`}
              style={[
                styles.chip,
                { backgroundColor: c.elevate, borderColor: c.border },
              ]}
            >
              <ThemedText style={[styles.chipText, { color: c.text }]}>
                {t}
              </ThemedText>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

// Small round badge that shows one verification item inline in the hero.
// Verified = green tint, otherwise muted with dashed border feel.
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
      <Ionicons
        name={icon}
        size={12}
        color={isVerified ? "#059669" : c.textMuted}
      />
      {isVerified && (
        <View style={styles.inlineBadgeCheck}>
          <Ionicons name="checkmark" size={7} color="#FFFFFF" />
        </View>
      )}
    </View>
  );
}

// ======================================================================
// PillCard — the shared container used across the redesign. eyebrow +
// optional top-right icon button + children.
// ======================================================================

function PillCard({ c, eyebrow, rightAction, children }) {
  return (
    <View
      style={[
        styles.pillCard,
        { backgroundColor: c.elevate2, borderColor: c.borderStrong },
      ]}
    >
      <View style={styles.pillEyebrowRow}>
        <ThemedText style={[styles.pillEyebrow, { color: c.textMuted }]}>
          {eyebrow}
        </ThemedText>
        {rightAction ? (
          <Pressable
            onPress={rightAction.onPress}
            hitSlop={10}
            style={({ pressed }) => [pressed && { opacity: 0.6 }]}
            accessibilityLabel="More info"
          >
            <Ionicons name={rightAction.icon} size={18} color={c.textMuted} />
          </Pressable>
        ) : null}
      </View>
      {children}
    </View>
  );
}

function Divider({ c }) {
  return <View style={{ height: 1, backgroundColor: c.border, marginVertical: 10 }} />;
}

// ======================================================================
// VerificationRow — one row per doc, with status chip on the right.
// ======================================================================

function VerificationRow({ c, icon, label, status }) {
  const map = {
    verified:        { label: "Verified",    fg: "#10B981", bg: "#D1FAE5" },
    under_review:    { label: "Under review", fg: "#3B82F6", bg: "#DBEAFE" },
    pending_review:  { label: "Under review", fg: "#3B82F6", bg: "#DBEAFE" },
    submitted:       { label: "Submitted",   fg: "#3B82F6", bg: "#DBEAFE" },
    rejected:        { label: "Rejected",    fg: "#DC2626", bg: "#FEE2E2" },
    expired:         { label: "Expired",     fg: "#DC2626", bg: "#FEE2E2" },
    expiring_soon:   { label: "Expiring",    fg: "#D97706", bg: "#FEF3C7" },
    not_started:     { label: "Not started", fg: c.textMuted, bg: c.elevate },
  };
  const meta = map[status] || map.not_started;
  return (
    <View style={styles.rowBase}>
      <View style={styles.rowLeft}>
        <View
          style={[
            styles.rowIconWrap,
            { backgroundColor: c.elevate, borderColor: c.border },
          ]}
        >
          <Ionicons name={icon} size={16} color={c.textMid} />
        </View>
        <ThemedText style={[styles.rowLabel, { color: c.text }]}>{label}</ThemedText>
      </View>
      <View style={[styles.statusChip, { backgroundColor: meta.bg }]}>
        <ThemedText style={[styles.statusChipText, { color: meta.fg }]}>
          {meta.label}
        </ThemedText>
      </View>
    </View>
  );
}

// ======================================================================
// PerfStat — one column of the 3-col performance row.
// ======================================================================

function PerfStat({ c, icon, iconColor, value, label }) {
  return (
    <View style={styles.perfStat}>
      <View style={styles.perfValueRow}>
        <Ionicons name={icon} size={14} color={iconColor} />
        <ThemedText style={[styles.perfValue, { color: c.text }]}>
          {value}
        </ThemedText>
      </View>
      <ThemedText style={[styles.perfLabel, { color: c.textMuted }]}>
        {label}
      </ThemedText>
    </View>
  );
}

// ======================================================================
// Reviews section + individual review card.
// ======================================================================

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
        <View style={styles.reviewRatingRow}>
          {renderStars(review.rating)}
        </View>
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
      {/* No REVIEWS eyebrow — the user wanted headline-free flowing
          sections; the title alone carries the section.             */}
      <ThemedText style={[styles.reviewsTitle, { color: c.text }]}>
        {headerTitle}
      </ThemedText>
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
            <ThemedText style={[styles.showAllText, { color: c.text }]}>
              Show all reviews
            </ThemedText>
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

// ======================================================================
// AllReviewsModal — bottom sheet. Dark-mode-aware.
// ======================================================================

function AllReviewsModal({ c, dark, visible, onClose, reviews, reviewCount, averageRating, businessName, insets }) {
  const [photoViewer, setPhotoViewer] = useState({ open: false, images: [], index: 0 });
  const openPhotoViewer = (photos, startIndex = 0) =>
    setPhotoViewer({ open: true, images: photos.map((u) => ({ uri: u })), index: startIndex });

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
                {"  ·  "}{formatRelativeTime(review.created_at)}
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
                  {averageRating > 0 ? averageRating.toFixed(1) : "–"} · {reviewCount} review{reviewCount !== 1 ? "s" : ""}
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

// ======================================================================
// PerformanceInfoModal — matches the same sheet chrome.
// ======================================================================

// ======================================================================
// VerificationSheet — per-doc detail, opened from the hero badge row.
// ======================================================================

function VerificationSheet({ c, visible, onClose, verification, insets }) {
  const statusMeta = {
    verified:        { label: "Verified",    fg: "#10B981", bg: "#D1FAE5" },
    under_review:    { label: "Under review", fg: "#3B82F6", bg: "#DBEAFE" },
    pending_review:  { label: "Under review", fg: "#3B82F6", bg: "#DBEAFE" },
    submitted:       { label: "Submitted",   fg: "#3B82F6", bg: "#DBEAFE" },
    rejected:        { label: "Rejected",    fg: "#DC2626", bg: "#FEE2E2" },
    expired:         { label: "Expired",     fg: "#DC2626", bg: "#FEE2E2" },
    expiring_soon:   { label: "Expiring",    fg: "#D97706", bg: "#FEF3C7" },
    not_started:     { label: "Not started", fg: c.textMuted, bg: c.elevate },
  };
  const rows = [
    { icon: "person-outline", label: "Photo ID",    status: verification?.photo_id    || "not_started" },
    { icon: "shield-outline", label: "Insurance",   status: verification?.insurance   || "not_started" },
    { icon: "ribbon-outline", label: "Credentials", status: verification?.credentials || "not_started" },
  ];
  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.sheetOverlay}>
        <View
          style={[
            styles.sheetContent,
            { backgroundColor: c.background, paddingBottom: (insets?.bottom || 0) + 20, height: "54%" },
          ]}
        >
          <View style={[styles.sheetHandle, { backgroundColor: c.borderStrong }]} />
          <View style={styles.sheetHeaderRow}>
            <View style={{ flex: 1 }}>
              <ThemedText style={[styles.sheetEyebrow, { color: c.textMuted }]}>
                VERIFICATION
              </ThemedText>
              <ThemedText style={[styles.sheetTitle, { color: c.text }]}>
                Documents
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
                <ThemedText style={[styles.perfInfoTitle, { color: c.text }]}>
                  Response time
                </ThemedText>
              </View>
              <ThemedText style={[styles.perfInfoBody, { color: c.textMid }]}>
                How quickly the business replies to new requests and messages. Clients
                often reach out to several trades — a quick first reply is one of the
                biggest drivers of winning the job.
              </ThemedText>
            </View>
            <View style={[styles.perfInfoDivider, { backgroundColor: c.border }]} />
            <View style={styles.perfInfoSection}>
              <View style={styles.perfInfoHeader}>
                <Ionicons name="checkmark" size={18} color={PRIMARY} />
                <ThemedText style={[styles.perfInfoTitle, { color: c.text }]}>
                  Quote rate
                </ThemedText>
              </View>
              <ThemedText style={[styles.perfInfoBody, { color: c.textMid }]}>
                The percentage of accepted requests that get a real quote. A 3-day grace
                period is applied after accepting so new requests don't drag your rate
                down unfairly.
              </ThemedText>
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

// ======================================================================
// Styles
// ======================================================================

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  // Top-right icon dock — absolute position so it floats above the
  // scroll content (no background / row / block behind it). Same
  // treatment used on the trade Home tab and Projects tab.
  topBar: {
    position: "absolute",
    right: 16,
    flexDirection: "row",
    gap: 8,
    zIndex: 20,
  },
  // Title block — free-standing inside the ScrollView, matches the
  // Home / Projects tab pattern. No row wrapper, no surface behind.
  // scrollContent already handles the 20-px horizontal inset, so this
  // only sets vertical rhythm.
  titleBlock: {
    paddingTop: 4,
    paddingBottom: 10,
  },
  pageTitle: {
    fontFamily: FontFamily.headerBold,
    fontSize: 32,
    lineHeight: 34,
    letterSpacing: -0.8,
  },
  // ScrollView content — 54 top-padding so the titleBlock clears the
  // absolutely-positioned icon dock (which sits at top: 12 + 36 tall,
  // so ~48 from safe-area top). Matches the Projects tab value.
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 54,
  },

  // Hero — outer wrap is column so chips can sit under the avatar+text
  // row instead of squeezed into the right column.
  hero: {
    paddingVertical: 8,
  },
  heroTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },
  heroChipsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 14,
  },
  heroAvatar: {
    width: 76,
    height: 76,
    borderRadius: 38,
  },
  heroAvatarFallback: {
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
  },
  heroAvatarInitials: {
    fontFamily: FontFamily.headerBold,
    fontSize: 26,
  },
  heroTextCol: {
    flex: 1,
    minWidth: 0,
  },
  heroName: {
    fontFamily: FontFamily.headerBold,
    fontSize: 22,
    lineHeight: 26,
    letterSpacing: -0.4,
  },
  heroSub: {
    fontFamily: FontFamily.bodyRegular,
    fontSize: 13,
    marginTop: 2,
  },
  heroLocRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 6,
  },
  heroLoc: {
    fontFamily: FontFamily.bodyMedium,
    fontSize: 13,
    flexShrink: 1,
  },
  heroVerifyRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 8,
  },
  heroVerifySummary: {
    fontFamily: FontFamily.bodyMedium,
    fontSize: 12.5,
    marginLeft: 4,
  },

  // Small round verification badge rendered inline in the hero.
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

  // Zone 2 wrapper — borderless area for stats + specialty chips.
  zone: {
    marginTop: 18,
  },
  statsRow: {
    flexDirection: "row",
    alignItems: "stretch",
    gap: 8,
    paddingVertical: 4,
  },

  // Flowing sections — bio / perf / reviews as vertically stacked
  // blocks with thin dividers, no card chrome around the blocks.
  flowDivider: {
    height: 1,
    marginTop: 20,
    marginBottom: 4,
  },
  flowBlock: {
    paddingTop: 14,
  },

  // Inline performance row — lives just above Reviews. Deliberately
  // quieter than the old 3-col grid: smaller type, tighter padding,
  // only Response + Quote rate (no star rating, that's below).
  perfInlineWrap: {
    paddingTop: 10,
    paddingBottom: 4,
  },
  perfInlineRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },
  perfInlineItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  perfInlineValueRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  perfInlineValue: {
    fontFamily: FontFamily.headerSemibold,
    fontSize: 14,
    letterSpacing: -0.2,
  },
  perfInlineLabel: {
    fontFamily: FontFamily.bodyRegular,
    fontSize: 13,
  },
  perfInlineDivider: {
    width: 1,
    height: 14,
  },

  // Pill card
  pillCard: {
    borderWidth: 1,
    borderRadius: 18,
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 14,
  },
  pillEyebrowRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  pillEyebrow: {
    fontFamily: FontFamily.headerBold,
    fontSize: 11,
    letterSpacing: 1.2,
    textTransform: "uppercase",
  },
  eyebrow: {
    fontFamily: FontFamily.headerBold,
    fontSize: 11,
    letterSpacing: 1.2,
    textTransform: "uppercase",
  },

  // Row base (verification)
  rowBase: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  rowLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
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
  rowLabel: {
    fontFamily: FontFamily.bodyMedium,
    fontSize: 15,
    flex: 1,
  },
  statusChip: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  statusChipText: {
    fontFamily: FontFamily.headerSemibold,
    fontSize: 12,
  },

  // Perf stats
  perfRow: {
    flexDirection: "row",
    alignItems: "stretch",
    gap: 8,
  },
  perfStat: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 4,
  },
  perfDivider: {
    width: 1,
  },
  perfValueRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    marginBottom: 4,
  },
  perfValue: {
    fontFamily: FontFamily.headerBold,
    fontSize: 17,
    letterSpacing: -0.3,
  },
  perfLabel: {
    fontFamily: FontFamily.bodyRegular,
    fontSize: 12,
    textAlign: "center",
  },

  // About / bio
  bodyText: {
    fontFamily: FontFamily.bodyRegular,
    fontSize: 15,
    lineHeight: 22,
  },

  // Chips (trades offered)
  chipsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
  },
  chipText: {
    fontFamily: FontFamily.bodyMedium,
    fontSize: 13,
  },

  // Reviews section
  reviewsSection: {
    marginTop: 6,
  },
  reviewsHeaderRow: {
    marginBottom: 6,
  },
  reviewsTitle: {
    fontFamily: FontFamily.headerBold,
    fontSize: 22,
    letterSpacing: -0.4,
  },
  ratingSubRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 6,
  },
  ratingSubText: {
    fontFamily: FontFamily.bodyMedium,
    fontSize: 13,
  },
  starsRow: {
    flexDirection: "row",
    gap: 2,
  },
  reviewsList: {
    paddingRight: 20,
  },
  reviewCard: {
    width: 340,
    borderRadius: 18,
    borderWidth: 1,
    padding: 16,
    marginRight: 12,
  },
  reviewerRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 10,
  },
  reviewerAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  reviewerInitials: {
    fontFamily: FontFamily.headerSemibold,
    fontSize: 14,
  },
  reviewerInfo: {
    marginLeft: 10,
    flex: 1,
  },
  reviewerName: {
    fontFamily: FontFamily.headerSemibold,
    fontSize: 14,
  },
  reviewDate: {
    fontFamily: FontFamily.bodyRegular,
    fontSize: 12,
    marginTop: 2,
  },
  reviewRatingRow: {
    marginBottom: 8,
  },
  reviewContent: {
    fontFamily: FontFamily.bodyRegular,
    fontSize: 14,
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
  noReviewsTitle: {
    fontFamily: FontFamily.headerSemibold,
    fontSize: 15,
    marginTop: 10,
  },
  noReviewsSub: {
    fontFamily: FontFamily.bodyRegular,
    fontSize: 13,
    marginTop: 4,
    textAlign: "center",
  },

  // Bottom-sheet modal (reviews + perf info)
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
  sheetDivider: {
    height: 1,
    marginHorizontal: 20,
  },

  fullReviewsList: {
    paddingHorizontal: 20,
    paddingTop: 8,
  },
  fullReviewItem: {
    paddingVertical: 18,
  },
  fullReviewerRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 10,
  },
  fullReviewerAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
  },
  fullReviewerInitials: {
    fontFamily: FontFamily.headerSemibold,
    fontSize: 15,
  },
  fullReviewerInfo: {
    marginLeft: 12,
    flex: 1,
  },
  fullReviewerName: {
    fontFamily: FontFamily.headerSemibold,
    fontSize: 15,
  },
  fullReviewMeta: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 2,
  },
  fullReviewDate: {
    fontFamily: FontFamily.bodyRegular,
    fontSize: 13,
  },
  fullReviewContent: {
    fontFamily: FontFamily.bodyRegular,
    fontSize: 15,
    lineHeight: 22,
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
  },

  // Perf info modal body
  perfInfoScroll: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 24,
  },
  perfInfoSection: {
    paddingVertical: 14,
  },
  perfInfoHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 8,
  },
  perfInfoTitle: {
    fontFamily: FontFamily.headerSemibold,
    fontSize: 16,
  },
  perfInfoBody: {
    fontFamily: FontFamily.bodyRegular,
    fontSize: 14,
    lineHeight: 21,
  },
  perfInfoDivider: {
    height: 1,
    marginHorizontal: 0,
  },
});
