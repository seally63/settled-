// app/(public)/invite.jsx
//
// Trade-invite preview + accept screen.
//
// Reached via the deep link `tradifyapp://invite?token=<uuid>` (custom-
// scheme links only resolve in a dev build or store build — NOT Expo
// Go). Also reached without params after the auth round-trip, in which
// case the token is read back from expo-secure-store.
//
// Flow: preview (pre-auth) → register/login → accept. The token is
// parked in SecureStore on mount so it survives the auth screens; the
// dashboard layout bounces a freshly-signed-in trade back here, and the
// token is cleared once the invite is accepted or declined.
//
// TODO (follow-up, out of scope here): the "not installed" path. If a
// trade doesn't have the app, the web CTA sends them to the App/Play
// Store instead — surviving the install (deferred deep link) needs a
// service like Branch, or a manual "enter your invite code" screen.

import { useState, useEffect, useCallback } from "react";
import {
  StyleSheet,
  View,
  ScrollView,
  Pressable,
  Image,
  ActivityIndicator,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";

import ThemedView from "../../components/ThemedView";
import ThemedText from "../../components/ThemedText";
import ThemedStatusBar from "../../components/ThemedStatusBar";
import Spacer from "../../components/Spacer";
import { Colors } from "../../constants/Colors";
import { TypeVariants, FontFamily } from "../../constants/Typography";
import { useTheme } from "../../hooks/useTheme";
import { useUser } from "../../hooks/useUser";
import { formatBudgetBand } from "../../lib/enquiry";
import {
  getTradeInvite,
  acceptTradeInvite,
  setPendingInviteToken,
  getPendingInviteToken,
  clearPendingInviteToken,
} from "../../lib/api/invites";

const PRIMARY = Colors.primary;

/* ─────────────────────────── small pieces ─────────────────────────── */

// Eyebrow + card section wrapper.
function Section({ c, eyebrow, children }) {
  return (
    <View style={{ marginBottom: 18 }}>
      <ThemedText style={[styles.eyebrow, { color: c.textMuted }]}>
        {eyebrow}
      </ThemedText>
      <Spacer height={8} />
      <View
        style={[
          styles.card,
          { backgroundColor: c.elevate, borderColor: c.border },
        ]}
      >
        {children}
      </View>
    </View>
  );
}

// Label / value row inside a card. Skips itself when the value is empty.
function Row({ c, label, value, last }) {
  if (value == null || value === "") return null;
  return (
    <View
      style={[
        styles.row,
        !last && { borderBottomColor: c.border, borderBottomWidth: StyleSheet.hairlineWidth },
      ]}
    >
      <ThemedText style={[styles.rowLabel, { color: c.textMuted }]}>
        {label}
      </ThemedText>
      <ThemedText style={[styles.rowValue, { color: c.text }]}>
        {value}
      </ThemedText>
    </View>
  );
}

// Free-text block (multi-line body copy) inside a card.
function TextBlock({ c, label, body, last }) {
  const trimmed = (body || "").trim();
  if (!trimmed) return null;
  return (
    <View
      style={[
        styles.block,
        !last && { borderBottomColor: c.border, borderBottomWidth: StyleSheet.hairlineWidth },
      ]}
    >
      <ThemedText style={[styles.blockLabel, { color: c.textMuted }]}>
        {label}
      </ThemedText>
      <Spacer height={4} />
      <ThemedText style={[styles.blockBody, { color: c.text }]}>
        {trimmed}
      </ThemedText>
    </View>
  );
}

// Horizontal photo strip.
function PhotoStrip({ urls }) {
  const list = Array.isArray(urls) ? urls.filter(Boolean) : [];
  if (!list.length) return null;
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.photoStrip}
    >
      {list.map((uri, i) => (
        <Image key={`${uri}-${i}`} source={{ uri }} style={styles.photo} />
      ))}
    </ScrollView>
  );
}

// Style-tag chips.
function Chips({ c, tags }) {
  const list = Array.isArray(tags) ? tags.filter(Boolean) : [];
  if (!list.length) return null;
  return (
    <View style={styles.chipsWrap}>
      {list.map((tag, i) => (
        <View
          key={`${tag}-${i}`}
          style={[styles.chip, { backgroundColor: c.elevate2, borderColor: c.border }]}
        >
          <ThemedText style={[styles.chipText, { color: c.text }]}>
            {tag}
          </ThemedText>
        </View>
      ))}
    </View>
  );
}

/* ──────────────────────────── screen ──────────────────────────────── */

export default function InviteScreen() {
  const params = useLocalSearchParams();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors: c } = useTheme();
  const { user, authChecked } = useUser();

  const [token, setToken] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [data, setData] = useState(null); // { invite, preview }
  const [accepting, setAccepting] = useState(false);
  const [acceptError, setAcceptError] = useState(null);
  const [claimedLocally, setClaimedLocally] = useState(false);

  // Resolve the token: deep-link param (`token` or `inviteToken`) on a
  // cold start, or SecureStore when we've returned from the auth screens
  // with no params. Persist whatever we resolve so it survives auth.
  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      let t =
        (typeof params.token === "string" && params.token) ||
        (typeof params.inviteToken === "string" && params.inviteToken) ||
        null;

      if (!t) {
        t = await getPendingInviteToken();
      }

      if (!t) {
        setError("No invite link found. Open the link from your email again.");
        setLoading(false);
        return;
      }

      setToken(t);
      await setPendingInviteToken(t);

      const result = await getTradeInvite(t);
      setData(result);
    } catch (e) {
      setError(e?.message || "Couldn't load this enquiry.");
    } finally {
      setLoading(false);
    }
  }, [params.token, params.inviteToken]);

  useEffect(() => {
    load();
  }, [load]);

  // Accept — only reachable when signed in.
  const handleAccept = async () => {
    if (!token || accepting) return;
    setAcceptError(null);
    setAccepting(true);
    try {
      const result = await acceptTradeInvite(token);
      await clearPendingInviteToken();
      // Route the trade straight into the enquiry in their inbox.
      if (result?.request_id) {
        router.replace({
          pathname: "/quotes/request/[id]",
          params: { id: String(result.request_id) },
        });
      } else {
        router.replace("/quotes");
      }
    } catch (e) {
      if (e?.code === "ALREADY_CLAIMED") {
        setClaimedLocally(true);
      } else if (e?.code === "SESSION_EXPIRED") {
        // The trade's session lapsed between preview and accept. The
        // token is still parked in SecureStore, so once they log back
        // in the dashboard layout bounces them straight back here.
        router.push("/login");
      } else {
        setAcceptError(e?.message || "Couldn't accept this enquiry.");
      }
    } finally {
      setAccepting(false);
    }
  };

  // Decline / dismiss — clears the parked token and leaves the flow.
  const handleDecline = async () => {
    await clearPendingInviteToken();
    if (user) {
      router.replace("/quotes");
    } else {
      router.replace("/login");
    }
  };

  /* ── loading ── */
  if (loading || !authChecked) {
    return (
      <ThemedView style={styles.container}>
        <ThemedStatusBar />
        <View style={styles.centred}>
          <ActivityIndicator color={PRIMARY} />
          <Spacer height={12} />
          <ThemedText style={[styles.centredText, { color: c.textMuted }]}>
            Loading enquiry…
          </ThemedText>
        </View>
      </ThemedView>
    );
  }

  /* ── error ── */
  if (error) {
    return (
      <ThemedView style={styles.container}>
        <ThemedStatusBar />
        <View style={[styles.centred, { paddingTop: insets.top + 40 }]}>
          <Ionicons name="alert-circle-outline" size={44} color={c.textMuted} />
          <Spacer height={12} />
          <ThemedText style={[styles.stateTitle, { color: c.text }]}>
            Something went wrong
          </ThemedText>
          <Spacer height={6} />
          <ThemedText style={[styles.stateBody, { color: c.textMid }]}>
            {error}
          </ThemedText>
          <Spacer height={20} />
          <Pressable style={styles.primaryBtn} onPress={load}>
            <ThemedText style={styles.primaryBtnText}>Try again</ThemedText>
          </Pressable>
        </View>
      </ThemedView>
    );
  }

  const invite = data?.invite || {};
  const preview = data?.preview || {};

  const expired =
    invite.status === "expired" ||
    (invite.expires_at && new Date(invite.expires_at).getTime() < Date.now());
  const claimed = claimedLocally || invite.status === "claimed";

  /* ── expired ── */
  if (expired) {
    return (
      <ThemedView style={styles.container}>
        <ThemedStatusBar />
        <View style={[styles.centred, { paddingTop: insets.top + 40 }]}>
          <Ionicons name="time-outline" size={44} color={c.textMuted} />
          <Spacer height={12} />
          <ThemedText style={[styles.stateTitle, { color: c.text }]}>
            This invite has expired
          </ThemedText>
          <Spacer height={6} />
          <ThemedText style={[styles.stateBody, { color: c.textMid }]}>
            Invites are valid for 14 days. Ask the Settled team to send a
            fresh link.
          </ThemedText>
          <Spacer height={20} />
          <Pressable style={styles.ghostBtn} onPress={handleDecline}>
            <ThemedText style={[styles.ghostBtnText, { color: c.text }]}>
              Close
            </ThemedText>
          </Pressable>
        </View>
      </ThemedView>
    );
  }

  /* ── already accepted ── */
  if (claimed) {
    return (
      <ThemedView style={styles.container}>
        <ThemedStatusBar />
        <View style={[styles.centred, { paddingTop: insets.top + 40 }]}>
          <Ionicons
            name="checkmark-done-circle-outline"
            size={44}
            color={c.textMuted}
          />
          <Spacer height={12} />
          <ThemedText style={[styles.stateTitle, { color: c.text }]}>
            Already accepted
          </ThemedText>
          <Spacer height={6} />
          <ThemedText style={[styles.stateBody, { color: c.textMid }]}>
            Another trade has already accepted this enquiry. It's first come,
            first served on Settled.
          </ThemedText>
          <Spacer height={20} />
          <Pressable style={styles.ghostBtn} onPress={handleDecline}>
            <ThemedText style={[styles.ghostBtnText, { color: c.text }]}>
              Close
            </ThemedText>
          </Pressable>
        </View>
      </ThemedView>
    );
  }

  /* ── preview ── */
  const budget = formatBudgetBand(preview.budget_band);
  const priorities = Array.isArray(preview.client_priorities)
    ? preview.client_priorities.filter(Boolean)
    : [];

  return (
    <ThemedView style={styles.container}>
      <ThemedStatusBar />
      <ScrollView
        contentContainerStyle={[
          styles.scroll,
          { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 140 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <ThemedText style={[styles.eyebrow, { color: PRIMARY }]}>
          NEW ENQUIRY
        </ThemedText>
        <Spacer height={6} />
        <ThemedText style={[styles.title, { color: c.text }]}>
          {preview.work_type || preview.category_name || "Enquiry"}
          {preview.service_type_name ? ` · ${preview.service_type_name}` : ""}
        </ThemedText>
        <Spacer height={4} />
        <ThemedText style={[styles.subtitle, { color: c.textMid }]}>
          {invite.trade_name
            ? `Sent to ${invite.trade_name}`
            : "Invited via Settled"}
        </ThemedText>

        <Spacer height={20} />

        {/* 1 — Homeowner basics */}
        <Section c={c} eyebrow="HOMEOWNER">
          <Row c={c} label="Homeowner" value={preview.homeowner_initial} />
          <Row c={c} label="Postcode" value={preview.postcode} />
          <Row c={c} label="Property" value={preview.property_type_name} />
          <Row
            c={c}
            label="Ownership"
            value={preview.ownership_status}
            last
          />
        </Section>

        {/* 2 — Project overview */}
        <Section c={c} eyebrow="PROJECT OVERVIEW">
          <Row c={c} label="Work type" value={preview.work_type} />
          <Row c={c} label="Category" value={preview.category_name} />
          <Row c={c} label="Service" value={preview.service_type_name} />
          <Row c={c} label="Timing" value={preview.timing_label} last />
        </Section>

        {/* 3 — Current state */}
        {(preview.condition_notes ||
          (preview.photo_urls && preview.photo_urls.length > 0)) && (
          <Section c={c} eyebrow="CURRENT STATE">
            <TextBlock
              c={c}
              label="Condition notes"
              body={preview.condition_notes}
              last={!preview.photo_urls || preview.photo_urls.length === 0}
            />
            {preview.photo_urls && preview.photo_urls.length > 0 && (
              <View style={styles.block}>
                <ThemedText style={[styles.blockLabel, { color: c.textMuted }]}>
                  Photos · {preview.photo_count ?? preview.photo_urls.length}
                </ThemedText>
                <Spacer height={8} />
                <PhotoStrip urls={preview.photo_urls} />
              </View>
            )}
          </Section>
        )}

        {/* 4 — Desired outcome */}
        {(preview.style_tags?.length ||
          preview.style_reference_urls?.length ||
          preview.materials_tier ||
          preview.must_haves ||
          preview.nice_to_haves) && (
          <Section c={c} eyebrow="DESIRED OUTCOME">
            {preview.style_tags && preview.style_tags.length > 0 && (
              <View
                style={[
                  styles.block,
                  { borderBottomColor: c.border, borderBottomWidth: StyleSheet.hairlineWidth },
                ]}
              >
                <ThemedText style={[styles.blockLabel, { color: c.textMuted }]}>
                  Style
                </ThemedText>
                <Spacer height={8} />
                <Chips c={c} tags={preview.style_tags} />
              </View>
            )}
            {preview.style_reference_urls &&
              preview.style_reference_urls.length > 0 && (
                <View
                  style={[
                    styles.block,
                    { borderBottomColor: c.border, borderBottomWidth: StyleSheet.hairlineWidth },
                  ]}
                >
                  <ThemedText
                    style={[styles.blockLabel, { color: c.textMuted }]}
                  >
                    Style references ·{" "}
                    {preview.style_reference_count ??
                      preview.style_reference_urls.length}
                  </ThemedText>
                  <Spacer height={8} />
                  <PhotoStrip urls={preview.style_reference_urls} />
                </View>
              )}
            <Row c={c} label="Materials tier" value={preview.materials_tier} />
            <TextBlock c={c} label="Must-haves" body={preview.must_haves} />
            <TextBlock
              c={c}
              label="Nice-to-haves"
              body={preview.nice_to_haves}
              last
            />
          </Section>
        )}

        {/* 5 — Constraints */}
        {(budget || preview.hard_requirements) && (
          <Section c={c} eyebrow="CONSTRAINTS">
            <Row c={c} label="Budget" value={budget} />
            <TextBlock
              c={c}
              label="Hard requirements"
              body={preview.hard_requirements}
              last
            />
          </Section>
        )}

        {/* 6 — Decision criteria */}
        {(priorities.length > 0 || preview.red_flags) && (
          <Section c={c} eyebrow="DECISION CRITERIA">
            {priorities.length > 0 && (
              <View
                style={[
                  styles.block,
                  preview.red_flags && {
                    borderBottomColor: c.border,
                    borderBottomWidth: StyleSheet.hairlineWidth,
                  },
                ]}
              >
                <ThemedText style={[styles.blockLabel, { color: c.textMuted }]}>
                  What matters most to this homeowner
                </ThemedText>
                <Spacer height={8} />
                {priorities.map((p, i) => {
                  // The array order IS the rank; the top 3 are the
                  // homeowner's pinned "heavy" priorities.
                  const heavy = i < 3;
                  return (
                    <View key={`${p}-${i}`} style={styles.priorityRow}>
                      <View
                        style={[
                          styles.priorityRank,
                          {
                            backgroundColor: heavy ? PRIMARY : c.elevate2,
                          },
                        ]}
                      >
                        <ThemedText
                          style={[
                            styles.priorityRankText,
                            { color: heavy ? "#FFFFFF" : c.textMuted },
                          ]}
                        >
                          {i + 1}
                        </ThemedText>
                      </View>
                      <ThemedText
                        style={[
                          styles.priorityText,
                          {
                            color: heavy ? c.text : c.textMid,
                            fontFamily: heavy
                              ? FontFamily.bodyMedium
                              : FontFamily.bodyRegular,
                          },
                        ]}
                      >
                        {p}
                      </ThemedText>
                    </View>
                  );
                })}
              </View>
            )}
            <TextBlock
              c={c}
              label="Red flags to avoid"
              body={preview.red_flags}
              last
            />
          </Section>
        )}

        {/* Private trade-only note — admin + trade only. */}
        {preview.trade_only_note ? (
          <View
            style={[
              styles.noteCard,
              { backgroundColor: Colors.primaryTint, borderColor: c.border },
            ]}
          >
            <View style={styles.noteHeader}>
              <Ionicons name="lock-closed" size={13} color={PRIMARY} />
              <ThemedText style={[styles.noteEyebrow, { color: PRIMARY }]}>
                NOTE FOR THE TRADE
              </ThemedText>
            </View>
            <Spacer height={6} />
            <ThemedText style={[styles.noteBody, { color: c.text }]}>
              {preview.trade_only_note}
            </ThemedText>
          </View>
        ) : null}

        {acceptError ? (
          <>
            <Spacer height={12} />
            <ThemedText style={[styles.acceptError, { color: Colors.status.declined }]}>
              {acceptError}
            </ThemedText>
          </>
        ) : null}
      </ScrollView>

      {/* Sticky CTA bar */}
      <View
        style={[
          styles.ctaBar,
          {
            backgroundColor: c.background,
            borderTopColor: c.border,
            paddingBottom: insets.bottom + 12,
          },
        ]}
      >
        {user ? (
          <>
            <Pressable
              style={[styles.primaryBtn, accepting && styles.btnDisabled]}
              onPress={handleAccept}
              disabled={accepting}
            >
              {accepting ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <ThemedText style={styles.primaryBtnText}>
                  Accept enquiry
                </ThemedText>
              )}
            </Pressable>
            <Spacer height={8} />
            <Pressable
              onPress={handleDecline}
              disabled={accepting}
              hitSlop={8}
            >
              <ThemedText style={[styles.declineLink, { color: c.textMuted }]}>
                Not now
              </ThemedText>
            </Pressable>
          </>
        ) : (
          <>
            <Pressable
              style={styles.primaryBtn}
              onPress={() => router.push("/register")}
            >
              <ThemedText style={styles.primaryBtnText}>
                Create account to accept
              </ThemedText>
            </Pressable>
            <Spacer height={8} />
            <Pressable
              style={[styles.ghostBtn, { borderColor: c.borderStrong }]}
              onPress={() => router.push("/login")}
            >
              <ThemedText style={[styles.ghostBtnText, { color: c.text }]}>
                Log in
              </ThemedText>
            </Pressable>
          </>
        )}
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  centred: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
  },
  centredText: { ...TypeVariants.bodySm },
  scroll: { paddingHorizontal: 20 },

  eyebrow: { ...TypeVariants.eyebrow },
  title: { ...TypeVariants.h1 },
  subtitle: { ...TypeVariants.bodySm },

  // State screens (error / expired / claimed)
  stateTitle: { ...TypeVariants.h2, textAlign: "center" },
  stateBody: { ...TypeVariants.body, textAlign: "center" },

  // Section card
  card: {
    borderRadius: 14,
    borderWidth: 1,
    overflow: "hidden",
  },
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 12,
  },
  rowLabel: { ...TypeVariants.bodySm, flexShrink: 0 },
  rowValue: {
    ...TypeVariants.bodyStrong,
    flex: 1,
    textAlign: "right",
  },
  block: {
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  blockLabel: { ...TypeVariants.bodySm },
  blockBody: { ...TypeVariants.body },

  // Photos
  photoStrip: { gap: 8, paddingRight: 4 },
  photo: {
    width: 104,
    height: 104,
    borderRadius: 10,
  },

  // Chips
  chipsWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
  },
  chipText: { ...TypeVariants.bodySm },

  // Priorities
  priorityRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 5,
  },
  priorityRank: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
  },
  priorityRankText: {
    fontFamily: FontFamily.headerBold,
    fontSize: 11,
  },
  priorityText: { ...TypeVariants.body, flex: 1 },

  // Private trade-only note
  noteCard: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
    marginBottom: 4,
  },
  noteHeader: { flexDirection: "row", alignItems: "center", gap: 6 },
  noteEyebrow: { ...TypeVariants.eyebrow },
  noteBody: { ...TypeVariants.body },

  acceptError: { ...TypeVariants.bodySm, textAlign: "center" },

  // Sticky CTA bar
  ctaBar: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 20,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  primaryBtn: {
    backgroundColor: PRIMARY,
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryBtnText: {
    ...TypeVariants.button,
    color: "#FFFFFF",
  },
  ghostBtn: {
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
  },
  ghostBtnText: { ...TypeVariants.button },
  btnDisabled: { opacity: 0.6 },
  declineLink: { ...TypeVariants.bodySm, textAlign: "center", paddingVertical: 6 },
});
