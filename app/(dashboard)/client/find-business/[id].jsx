// app/(dashboard)/client/find-business/[id].jsx
import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import {
  StyleSheet,
  View,
  ScrollView,
  Image,
  Pressable,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Modal,
  ActivityIndicator,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useColorScheme } from "react-native";
import * as ImagePicker from "expo-image-picker";
import * as ImageManipulator from "expo-image-manipulator";

import ThemedView from "../../../../components/ThemedView";
import ThemedText from "../../../../components/ThemedText";
import ThemedButton from "../../../../components/ThemedButton";
import Spacer from "../../../../components/Spacer";
import ThemedTextInput from "../../../../components/ThemedTextInput";
import { Colors } from "../../../../constants/Colors";
import { getTradeById, getMyRole } from "../../../../lib/api/profile";
import { requestDirectQuote } from "../../../../lib/api/directRequest";
import { getBusinessVerificationPublic, getTradePublicMetrics90d } from "../../../../lib/api/trust";
import { supabase } from "../../../../lib/supabase";
import { uploadRequestImages } from "../../../../lib/api/attachments";

const TEST_PROFILE = {
  id: "test-demo",
  full_name: "TEST Business",
  business_name: "Demo Plumbing Co.",
  trade_title: "Plumber",
  bio: "We’re a demo company for testing your flow. Fast, friendly, and fictional.",
  service_areas: "Shoreditch, Hackney, Camden",
  photo_url: null,
  created_at: new Date().toISOString(),
  rating_avg: 4.9,
  rating_count: 30,
};

const MIN_PHOTOS = 1;
const CELL = 96;

function monthsSince(ts) {
  if (!ts) return null;
  const a = new Date(ts);
  const b = new Date();
  const months = (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth());
  return Math.max(0, months);
}

function Stars({ rating = 0 }) {
  const full = Math.round(rating);
  return (
    <View style={{ flexDirection: "row", alignItems: "center" }}>
      {Array.from({ length: 5 }).map((_, i) => (
        <Ionicons
          key={i}
          name={i < full ? "star" : "star-outline"}
          size={14}
          color="#fbbc04"
          style={{ marginRight: 2 }}
        />
      ))}
    </View>
  );
}

function fmtHours(n) {
  if (n == null || isNaN(n)) return "—";
  const v = Number(n);
  if (v < 1) return `${(v * 60).toFixed(0)}m`;
  if (v < 10) return `${v.toFixed(1)}h`;
  return `${Math.round(v)}h`;
}
function fmtPct(n) {
  if (n == null || isNaN(n)) return "—";
  return `${Math.round(Number(n) * 100)}%`;
}

const QuestionHeader = ({ title }) => (
  <View style={styles.questionHeader}>
    <ThemedText title style={styles.questionTitle}>
      {title}
    </ThemedText>
  </View>
);

const Option = ({ label, subtitle, selected, onPress, inset = false, theme }) => (
  <Pressable
    onPress={onPress}
    style={[
      styles.optionCard,
      { backgroundColor: theme.uiBackground, borderColor: selected ? Colors.primary : theme.iconColor },
      inset && styles.subOption,
    ]}
  >
    <View style={styles.optionContent}>
      <View style={[styles.dot, { borderColor: theme.text }, selected && { backgroundColor: theme.text }]} />
      <View style={{ flex: 1 }}>
        <ThemedText style={styles.optionLabel}>{label}</ThemedText>
        {!!subtitle && <ThemedText style={styles.optionSubtitle}>{subtitle}</ThemedText>}
      </View>
    </View>
  </Pressable>
);

const SubHeader = ({ onBack, stepIndex, theme, insets }) => {
  const total = 6; // Photos inserted before Timing
  const pct =
    stepIndex === 1 ? "16%" :
    stepIndex === 2 ? "33%" :
    stepIndex === 3 ? "50%" :
    stepIndex === 4 ? "66%" :
    stepIndex === 5 ? "83%" : "100%";
  const backLabel = stepIndex === 1 ? "Search" : "Back";
  return (
    <View
      style={[
        styles.subHeader,
        { paddingTop: insets.top, backgroundColor: theme.uiBackground, borderBottomColor: theme.iconColor },
      ]}
    >
      <Pressable onPress={onBack} style={styles.backButton} hitSlop={10}>
        <Ionicons name="chevron-back" size={24} color={theme.text} />
        <ThemedText style={styles.backText}>{backLabel}</ThemedText>
      </Pressable>
      <View style={styles.stepRow}>
        <ThemedText style={styles.stepText}>
          Step {stepIndex} of {total}
        </ThemedText>
      </View>
      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: pct, backgroundColor: Colors.primary }]} />
      </View>
    </View>
  );
};

const VerifyRow = ({ label, verified }) => (
  <View style={styles.verifyRow}>
    <Ionicons
      name={verified ? "checkmark-circle" : "checkmark-circle-outline"}
      size={18}
      color={verified ? Colors.primary : "rgba(0,0,0,0.28)"}
      style={styles.verifyIcon}
    />
    <ThemedText style={[styles.verifyLabel, !verified && styles.verifyLabelMuted]}>{label}</ThemedText>
  </View>
);

// UPDATED: allow 1–2 letters, optionally digits + letter (G, EH, G3, G14, EH1, etc.)
function normalizeOutcode(s) {
  const x = String(s || "").toUpperCase().replace(/\s+/g, "");
  const ok = /^[A-Z]{1,2}(?:\d{1,2}[A-Z]?)?$/.test(x);
  return ok ? x : null;
}

function mapBudgetLabelToBand(label) {
  switch (label) {
    case "£0–£3k":
      return "<£3k";
    case "£3k–£6k":
      return "£3k–£6k";
    case "£6k–£9k":
      return "£6k–£9k";
    case "£9k–£12k":
      return "£9k–£12k";
    case "More than £12k":
      return ">£12k";
    default:
      return null;
  }
}

/* ensure overlay paints before work */
const paintFrames = (n = 2) =>
  new Promise((resolve) => {
    const step = () => (n-- <= 0 ? resolve() : requestAnimationFrame(step));
    requestAnimationFrame(step);
  });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* yield back to UI between big async ops (per file) */
const yieldToUI = () => new Promise((res) => setTimeout(res, 0));

const MIN_PREP_MS = 600;

// Create lightweight thumbnails (with base64 for upload)
async function makeThumbnails(uris) {
  const out = [];
  for (const uri of uris) {
    const { uri: thumb, base64 } = await ImageManipulator.manipulateAsync(
      uri,
      [{ resize: { width: 1200 } }],
      {
        compress: 0.8,
        format: ImageManipulator.SaveFormat.JPEG,
        base64: true,
      }
    );
    out.push({ uri: thumb, base64 });
  }
  return out;
}

export default function BusinessDetail() {
  const { id } = useLocalSearchParams();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const scheme = useColorScheme();
  const theme = Colors[scheme] ?? Colors.light;
  const isTest = id === "test-demo";

  const [trade, setTrade] = useState(isTest ? TEST_PROFILE : null);
  const [role, setRole] = useState(null);
  const [badges, setBadges] = useState(null);
  const [metrics, setMetrics] = useState(null);

  // Steps (+ Photos)
  const [step, setStep] = useState(0);
  const [bathroomMain, setBathroomMain] = useState(null);
  const [bathroomRefitType, setBathroomRefitType] = useState(null);
  const [outcode, setOutcode] = useState("");
  const [photos, setPhotos] = useState([]); // array of { uri, base64? }

  // per-thumb loading
  const [thumbLoading, setThumbLoading] = useState({}); // { [uri]: true|false }

  // PREPARING overlay for newly picked URIs
  const [prepVisible, setPrepVisible] = useState(false);
  const [prepUris, setPrepUris] = useState(new Set()); // thumb URIs being rendered
  const [prepStartedAt, setPrepStartedAt] = useState(0);
  const [prepPhase, setPrepPhase] = useState("preparing"); // "preparing" | "rendering"
  const [prepDone, setPrepDone] = useState(0);
  const [prepTotal, setPrepTotal] = useState(0);

  const [viewer, setViewer] = useState({ open: false, index: 0 }); // full-screen preview
  const [startWhen, setStartWhen] = useState(null);
  const [budget, setBudget] = useState(null);
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // upload overlay state
  const [uploading, setUploading] = useState(false);
  const [uploadIdx, setUploadIdx] = useState(0);
  const [uploadTotal, setUploadTotal] = useState(0);

  const outcodeRef = useRef(null);
  const notesInputRef = useRef(null);

  // Hard reset utility to prevent "last overlay" flash
  function resetPhotoUI() {
    setPrepVisible(false);
    setPrepUris(new Set());
    setPrepPhase("preparing");
    setPrepDone(0);
    setPrepTotal(0);
    setUploading(false);
    setUploadIdx(0);
    setUploadTotal(0);
  }

  const load = useCallback(async () => {
    try {
      const myRole = await getMyRole();
      setRole(myRole || null);
      if (isTest) {
        setBadges({ companies_house_active: true, payments_verified: true, insurance_verified: true });
        setMetrics({ response_time_p50_hours: 2.5, acceptance_rate: 0.78 });
        return;
      }
      const [t, b, m] = await Promise.all([
        getTradeById(id),
        getBusinessVerificationPublic(id).catch(() => null),
        getTradePublicMetrics90d(id).catch(() => null),
      ]);
      setTrade(t);
      setBadges(b);
      setMetrics(m);
    } catch (e) {
      Alert.alert("Error", e?.message || "Failed to load business");
    }
  }, [id, isTest]);

  useEffect(() => {
    if (id) load();
  }, [id, load]);

  const monthsHosting = useMemo(() => monthsSince(trade?.created_at), [trade?.created_at]);
  const ratingText = useMemo(() => {
    const r = Number(trade?.rating_avg || 0);
    const c = Number(trade?.rating_count || 0);
    if (!r || !c) return "No reviews yet";
    return `${r.toFixed(2)} (${c} reviews)`;
  }, [trade?.rating_avg, trade?.rating_count]);

  // Prep helpers
  function beginPreparing(count) {
    if (!count || count <= 0) return;
    setPrepStartedAt(Date.now());
    setPrepVisible(true);
    setPrepPhase("preparing");
    setPrepDone(0);
    setPrepTotal(count);
  }

  useEffect(() => {
    if (!prepVisible) return;
    if (prepUris.size > 0) return;
    const elapsed = Date.now() - prepStartedAt;
    const remain = Math.max(0, MIN_PREP_MS - elapsed);
    const t = setTimeout(() => setPrepVisible(false), remain);
    return () => clearTimeout(t);
  }, [prepUris, prepVisible, prepStartedAt]);

  const markThumbLoaded = (uri) => {
    setPrepUris((prev) => {
      if (!prev.size) return prev;
      const next = new Set(prev);
      next.delete(uri);
      return next;
    });
    setThumbLoading((prev) => (prev[uri] ? { ...prev, [uri]: false } : prev));
  };

  async function pickFromLibrary() {
    try {
      const remaining = 5 - photos.length;
      if (remaining <= 0) {
        Alert.alert("Limit reached", "You can add up to 5 photos.");
        return;
      }
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (perm.status !== "granted") {
        Alert.alert("Permission needed", "Please allow photo access to attach images.");
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        allowsMultipleSelection: true,
        selectionLimit: remaining,
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 1,
      });
      if (result.canceled) return;

      const newUris = (result.assets || []).slice(0, remaining).map((a) => a.uri);
      if (!newUris.length) return;

      // 1) Overlay immediately -> paint before heavy work
      beginPreparing(newUris.length);
      await paintFrames(2);
      await sleep(0);

      // 2) Thumbnails with progress + seed cell spinners
      const thumbs = [];
      for (const uri of newUris) {
        const [thumb] = await makeThumbnails([uri]);
        thumbs.push(thumb);
        setThumbLoading((prev) => ({ ...prev, [thumb.uri]: true }));
        setPrepDone((d) => d + 1);
        await sleep(0);
      }

      // 3) Rendering phase + mount
      setPrepPhase("rendering");
      const thumbUris = thumbs.map((t) => t.uri);
      setPrepUris(new Set(thumbUris));
      await paintFrames(1);

      setPhotos((prev) => [...prev, ...thumbs].slice(0, 5));
    } catch {}
  }

  async function takePhoto() {
    try {
      if (photos.length >= 5) {
        Alert.alert("Limit reached", "You can add up to 5 photos.");
        return;
      }
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (perm.status !== "granted") {
        Alert.alert("Permission needed", "Please allow camera access to take photos.");
        return;
      }
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 1,
      });
      if (result.canceled) return;
      const asset = result.assets?.[0];
      if (!asset?.uri) return;

      // 1) Overlay -> paint before work
      beginPreparing(1);
      await paintFrames(2);
      await sleep(0);

      // 2) Make thumb (progress 1/1)
      const [thumb] = await makeThumbnails([asset.uri]);
      setThumbLoading((prev) => ({ ...prev, [thumb.uri]: true }));
      setPrepDone(1);

      // 3) Rendering + mount
      setPrepPhase("rendering");
      setPrepUris(new Set([thumb.uri]));
      await paintFrames(1);

      setPhotos((prev) => [...prev, thumb].slice(0, 5));
    } catch {}
  }

  function removePhoto(idx) {
    setPhotos((prev) => {
      const list = [...prev];
      const removed = list[idx];
      if (removed?.uri) {
        setPrepUris((prevSet) => {
          if (!prevSet.size) return prevSet;
          const next = new Set(prevSet);
          next.delete(removed.uri);
          return next;
        });
        setThumbLoading((s) => {
          if (!s[removed.uri]) return s;
          const copy = { ...s };
          delete copy[removed.uri];
          return copy;
        });
      }
      list.splice(idx, 1);
      return list;
    });
  }

  async function uploadAndAttach(requestId) {
    const totalPhotos = photos.length;

    if (totalPhotos === 0) {
      setUploading(false);
      setUploadIdx(0);
      setUploadTotal(0);
      return;
    }

    // Show overlay and give it time to paint
    setUploadTotal(totalPhotos);
    setUploadIdx(0);
    setUploading(true);
    await new Promise((r) => requestAnimationFrame(r));
    await new Promise((r) => requestAnimationFrame(r)); // extra frame = snappier show

    let uploadedPaths = [];
    try {
      uploadedPaths = await uploadRequestImages(String(requestId), photos, (done, total) => {
        setUploadTotal(total);
        setUploadIdx(done);
      });
    } catch (e) {
      console.warn("uploadRequestImages error:", e?.message || e);
    } finally {
      setUploading(false);
      setUploadIdx(0);
      setUploadTotal(0);
    }

    if (totalPhotos) {
      if (!uploadedPaths.length) {
        Alert.alert(
          "Photos not attached",
          "We couldn’t upload your photos, but your request was still sent."
        );
      } else if (uploadedPaths.length !== totalPhotos) {
        Alert.alert(
          "Partial upload",
          `Attached ${uploadedPaths.length} of ${totalPhotos} photos.`
        );
      }
    }
  }

  async function submitDirectRequest() {
    try {
      if (isTest) {
        // make sure no overlays can appear for demo
        resetPhotoUI();
        Alert.alert("Demo", "This is a demo business — request not sent.");
        return;
      }
      if (!bathroomMain || (bathroomMain === "Bathroom refit" && !bathroomRefitType)) {
        Alert.alert("Incomplete", "Please choose your bathroom job details.");
        return;
      }
      const oc = normalizeOutcode(outcode);
      if (!oc) {
        Alert.alert("Postcode area required", "Main postcode only.");
        return;
      }
      if (!startWhen) {
        Alert.alert("Select timing", "Please choose when you'd like the job to start.");
        return;
      }
      if (!budget) {
        Alert.alert("Select budget", "Please pick your budget.");
        return;
      }

      setSubmitting(true);

      const details = [
        `Direct request to: ${trade?.business_name || trade?.full_name || id}`,
        `Category: Bathrooms`,
        bathroomMain ? `Main: ${bathroomMain}` : null,
        bathroomRefitType ? `Refit type: ${bathroomRefitType}` : null,
        `Address: ${oc}`,
        `Start: ${startWhen}`,
        notes?.trim() ? `Notes: ${notes.trim()}` : null,
      ]
        .filter(Boolean)
        .join("\n");

      const suggested_title =
        bathroomMain === "Bathroom refit" && bathroomRefitType
          ? `Bathroom - ${bathroomRefitType}`
          : `Bathroom - ${bathroomMain}`;

      const dbBand = mapBudgetLabelToBand(budget);

      const res = await requestDirectQuote(id, {
        details,
        suggested_title,
        budget_band: dbBand,
        job_outcode: oc,
      });

      const newRequestId =
        res?.id || res?.request_id || res?.data?.id || res?.data?.request_id || null;

      if (newRequestId) {
        await uploadAndAttach(String(newRequestId));
      } else {
        try {
          const since = new Date(Date.now() - 2 * 60 * 1000).toISOString();
          const { data: maybe } = await supabase
            .from("quote_requests")
            .select("id")
            .gte("created_at", since)
            .eq("job_outcode", oc)
            .order("created_at", { ascending: false })
            .limit(1);
          if (maybe?.[0]?.id) {
            await uploadAndAttach(String(maybe[0].id));
          }
        } catch {}
      }

      // make 100% sure no overlay remains after uploads
      resetPhotoUI();

      Alert.alert("Request sent", "Your quote request has been sent.", [
        { text: "OK", onPress: () => router.replace("/client") },
      ]);
    } catch (e) {
      Alert.alert("Unable to request", e?.message || "Failed to send request.");
    } finally {
      setSubmitting(false);
    }
  }

  if (role && role !== "client") {
    return (
      <ThemedView style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
        <ThemedText>Not available for your role.</ThemedText>
      </ThemedView>
    );
  }

  // Combined Preparing/Upload overlay — now only visible when truly active
  const UploadOverlay = () => {
    const isVisible = prepVisible || (uploading && uploadTotal > 0);
    if (!isVisible) return null;

    const pct = uploading && uploadTotal ? Math.round((uploadIdx / uploadTotal) * 100) : 0;
    const title = prepVisible
      ? prepPhase === "preparing"
        ? "Preparing your photos…"
        : "Rendering your photos…"
      : "Uploading your photos…";
    return (
      <Modal
        visible
        transparent
        animationType="none"
        statusBarTranslucent
        hardwareAccelerated
        presentationStyle="overFullScreen"
        onRequestClose={() => {}}
      >
        <View style={styles.uploadBackdrop}>
          <View style={styles.uploadCard}>
            <ActivityIndicator size="large" />
            <ThemedText style={styles.uploadTitle}>{title}</ThemedText>

            {prepVisible && prepPhase === "preparing" ? (
              <ThemedText style={styles.uploadSub}>
                {prepDone} of {prepTotal}
              </ThemedText>
            ) : null}

            {!prepVisible && uploading && uploadTotal > 0 ? (
              <>
                <ThemedText style={styles.uploadSub}>
                  {uploadIdx} of {uploadTotal}
                </ThemedText>
                <View style={styles.uploadBar}>
                  <View style={[styles.uploadFill, { width: `${pct}%`, backgroundColor: Colors.primary }]} />
                </View>
              </>
            ) : null}
          </View>
        </View>
      </Modal>
    );
  };

  // ====== Screens ======
  const AboutCard = (
    <ScrollView
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
      contentContainerStyle={{
        paddingTop: insets.top + 16,
        paddingHorizontal: 16,
        paddingBottom: 16 + insets.bottom,
      }}
      showsVerticalScrollIndicator={false}
    >
      {trade && (
        <>
          <View style={styles.topCard}>
            <View style={{ alignItems: "center" }}>
              {trade.photo_url ? (
                <Image source={{ uri: trade.photo_url }} style={styles.avatar} />
              ) : (
                <View style={[styles.avatar, styles.avatarFallback]} />
              )}
            </View>
            <Spacer height={8} />
            <ThemedText style={styles.name}>{trade.business_name || trade.full_name || "Business"}</ThemedText>

            <View style={styles.metricsRow}>
              <Stars rating={Number(trade?.rating_avg || 0)} />
              <ThemedText style={styles.metricText}>{ratingText}</ThemedText>
              {monthsHosting != null && (
                <ThemedText style={styles.metricText}>
                  • {monthsHosting} {monthsHosting === 1 ? "month" : "months"} on Settled
                </ThemedText>
              )}
            </View>

            {badges ? (
              <>
                <Spacer height={12} />
                <View style={styles.verifyWrap}>
                  <ThemedText style={styles.infoLabel}>Verification</ThemedText>
                  <View style={styles.verifyList}>
                    <VerifyRow label="Companies House" verified={!!badges?.companies_house_active} />
                    <VerifyRow label="Payments verified" verified={!!badges?.payments_verified} />
                    <VerifyRow label="Insurance" verified={!!badges?.insurance_verified} />
                  </View>
                </View>
              </>
            ) : null}

            {metrics && (metrics.response_time_p50_hours != null || metrics.acceptance_rate != null) ? (
              <>
                <Spacer height={12} />
                <View style={styles.kpiRow}>
                  <View style={styles.kpiCol}>
                    <ThemedText style={styles.kpiLabel}>Median reply</ThemedText>
                    <ThemedText style={styles.kpiValue}>{fmtHours(metrics.response_time_p50_hours)}</ThemedText>
                  </View>
                  <View style={styles.kpiCol}>
                    <ThemedText style={styles.kpiLabel}>Acceptance</ThemedText>
                    <ThemedText style={styles.kpiValue}>{fmtPct(metrics.acceptance_rate)}</ThemedText>
                  </View>
                </View>
              </>
            ) : null}

            <View style={styles.divider} />

            {!!trade.business_name && (
              <>
                <ThemedText style={styles.infoLabel}>Business name</ThemedText>
                <ThemedText style={styles.infoValue}>{trade.business_name}</ThemedText>
                <Spacer height={10} />
              </>
            )}
            {!!trade.trade_title && (
              <>
                <ThemedText style={styles.infoLabel}>Trade</ThemedText>
                <ThemedText style={styles.infoValue}>{trade.trade_title}</ThemedText>
                <Spacer height={10} />
              </>
            )}
            {!!trade.bio && (
              <>
                <ThemedText style={styles.infoLabel}>About</ThemedText>
                <ThemedText style={styles.infoBody}>{trade.bio}</ThemedText>
                <Spacer height={10} />
              </>
            )}
            {!!trade.service_areas && (
              <>
                <ThemedText style={styles.infoLabel}>Service areas</ThemedText>
                <ThemedText style={styles.infoBody}>{trade.service_areas}</ThemedText>
              </>
            )}
          </View>

          <Spacer height={16} />
          <ThemedButton onPress={() => setStep(1)}>
            <ThemedText style={{ color: "#fff", fontWeight: "700", textAlign: "center" }}>
              Request a quote
            </ThemedText>
          </ThemedButton>
        </>
      )}
    </ScrollView>
  );

  const Step1 = (
    <ThemedView style={[styles.container, { backgroundColor: theme.background }]} safe={false}>
      <SubHeader onBack={() => setStep(0)} stepIndex={1} theme={theme} insets={insets} />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={Platform.select({ ios: 0, android: 0 })}
      >
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingBottom: 40 + insets.bottom }}
          showsVerticalScrollIndicator={false}
        >
          <QuestionHeader title="What does your bathroom job involve?" />
          <Option
            label="Bathroom refit"
            subtitle="fitting a brand new bathroom"
            selected={bathroomMain === "Bathroom refit"}
            onPress={() => setBathroomMain("Bathroom refit")}
            theme={theme}
          />
          {bathroomMain === "Bathroom refit" && (
            <>
              <Option
                inset
                label="Fit only"
                selected={bathroomRefitType === "Fit only"}
                onPress={() => setBathroomRefitType("Fit only")}
                theme={theme}
              />
              <Option
                inset
                label="Supply & fit"
                selected={bathroomRefitType === "Supply & fit"}
                onPress={() => setBathroomRefitType("Supply & fit")}
                theme={theme}
              />
              <Option
                inset
                label="Supply only"
                selected={bathroomRefitType === "Supply only"}
                onPress={() => setBathroomRefitType("Supply only")}
                theme={theme}
              />
            </>
          )}
          <Option
            label="Bathroom fixtures"
            subtitle="e.g., showers, baths, sinks, toilets"
            selected={bathroomMain === "Bathroom fixtures"}
            onPress={() => {
              setBathroomMain("Bathroom fixtures");
              setBathroomRefitType(null);
            }}
            theme={theme}
          />
          <Option
            label="Plumbing and heating"
            subtitle="radiators, blockages, etc."
            selected={bathroomMain === "Plumbing and heating"}
            onPress={() => {
              setBathroomMain("Plumbing and heating");
              setBathroomRefitType(null);
            }}
            theme={theme}
          />
          <Option
            label="Tiling"
            selected={bathroomMain === "Tiling"}
            onPress={() => {
              setBathroomMain("Tiling");
              setBathroomRefitType(null);
            }}
            theme={theme}
          />
          <Option
            label="Bathroom design"
            selected={bathroomMain === "Bathroom design"}
            onPress={() => {
              setBathroomMain("Bathroom design");
              setBathroomRefitType(null);
            }}
            theme={theme}
          />
          <Option
            label="Sealant"
            selected={bathroomMain === "Sealant"}
            onPress={() => {
              setBathroomMain("Sealant");
              setBathroomRefitType(null);
            }}
            theme={theme}
          />
          <View style={styles.continueButtonContainer}>
            <ThemedButton
              onPress={() => setStep(2)}
              disabled={!bathroomMain || (bathroomMain === "Bathroom refit" && !bathroomRefitType)}
              style={styles.continueButton}
            >
              <ThemedText style={styles.continueButtonText}>Continue</ThemedText>
            </ThemedButton>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </ThemedView>
  );

  const Step2 = (
    <ThemedView style={[styles.container, { backgroundColor: theme.background }]} safe={false}>
      <SubHeader onBack={() => setStep(1)} stepIndex={2} theme={theme} insets={insets} />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingBottom: 40 + insets.bottom }}
          showsVerticalScrollIndicator={false}
        >
          <QuestionHeader title="What is your postcode area?" />
          <ThemedTextInput
            ref={outcodeRef}
            style={styles.addressInput}
            placeholder="Main postcode only"
            value={outcode}
            onChangeText={setOutcode}
            autoCapitalize="characters"
          />
          <View style={styles.continueButtonContainer}>
            <ThemedButton onPress={() => setStep(3)} disabled={!normalizeOutcode(outcode)} style={styles.continueButton}>
              <ThemedText style={styles.continueButtonText}>Continue</ThemedText>
            </ThemedButton>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </ThemedView>
  );

  // Step 3 — Photos (MANDATORY + PREVIEW)
  const Step3_Photos = (
    <ThemedView style={[styles.container, { backgroundColor: theme.background }]} safe={false}>
      <SubHeader onBack={() => setStep(2)} stepIndex={3} theme={theme} insets={insets} />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingBottom: 40 + insets.bottom }}
          showsVerticalScrollIndicator={false}
        >
          <QuestionHeader title="Add up to 5 images to help us understand the job." />

          <View style={styles.gridWrap}>
            {photos.map((p, i) => (
              <View key={`${p.uri}-${i}`} style={styles.thumbCell}>
                <Pressable style={{ flex: 1 }} onPress={() => setViewer({ open: true, index: i })}>
                  <Image
                    source={{ uri: p.uri }}
                    style={styles.thumbImg}
                    onLoad={() => markThumbLoaded(p.uri)}
                    onLoadEnd={() => markThumbLoaded(p.uri)}
                    onError={() => markThumbLoaded(p.uri)}
                  />
                  {thumbLoading[p.uri] && (
                    <View style={styles.thumbLoadingOverlay}>
                      <ActivityIndicator size="small" />
                    </View>
                  )}
                </Pressable>
                <Pressable onPress={() => setPhotos((prev) => prev.filter((_, idx) => idx !== i))} style={styles.removeBtn} hitSlop={8}>
                  <Ionicons name="close" size={14} color="#fff" />
                </Pressable>
              </View>
            ))}
            {photos.length < 5 && (
              <Pressable onPress={pickFromLibrary} style={styles.addCell} hitSlop={8}>
                <Ionicons name="images-outline" size={26} color="#666" />
                <ThemedText style={{ fontSize: 12, marginTop: 6 }}>Add photos</ThemedText>
              </Pressable>
            )}
            {photos.length < 5 && (
              <Pressable onPress={takePhoto} style={styles.addCell} hitSlop={8}>
                <Ionicons name="camera-outline" size={26} color="#666" />
                <ThemedText style={{ fontSize: 12, marginTop: 6 }}>Take photo</ThemedText>
              </Pressable>
            )}
          </View>

          <View style={styles.continueButtonContainer}>
            <ThemedButton
              onPress={() => {
                if (photos.length < MIN_PHOTOS) {
                  Alert.alert("Photos required", `Please add at least ${MIN_PHOTOS} photo to continue.`);
                  return;
                }
                setStep(4);
              }}
              disabled={photos.length < MIN_PHOTOS}
              style={styles.continueButton}
            >
              <ThemedText style={styles.continueButtonText}>Continue</ThemedText>
            </ThemedButton>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Full-screen preview modal */}
      <Modal
        visible={viewer.open}
        transparent
        animationType="fade"
        onRequestClose={() => setViewer((v) => ({ ...v, open: false }))}
      >
        <View style={styles.viewerBackdrop}>
          <Pressable
            style={styles.viewerClose}
            hitSlop={8}
            onPress={() => setViewer((v) => ({ ...v, open: false }))}
          >
            <Ionicons name="close" size={22} color="#fff" />
          </Pressable>

          {viewer.index > 0 && (
            <Pressable
              style={[styles.viewerNav, { left: 12 }]}
              hitSlop={10}
              onPress={() => setViewer((v) => ({ ...v, index: Math.max(0, v.index - 1) }))}
            >
              <Ionicons name="chevron-back" size={28} color="#fff" />
            </Pressable>
          )}

          {photos[viewer.index] && (
            <Image source={{ uri: photos[viewer.index].uri }} style={styles.viewerImg} />
          )}

          {viewer.index < photos.length - 1 && (
            <Pressable
              style={[styles.viewerNav, { right: 12 }]}
              hitSlop={10}
              onPress={() => setViewer((v) => ({ ...v, index: Math.min(photos.length - 1, v.index + 1) }))}
            >
              <Ionicons name="chevron-forward" size={28} color="#fff" />
            </Pressable>
          )}

          {photos[viewer.index] && (
            <Pressable
              style={styles.viewerDelete}
              hitSlop={10}
              onPress={() => {
                const idx = viewer.index;
                removePhoto(idx);
                setViewer((v) => {
                  const remaining = photos.length - 1; // after removal
                  if (remaining <= 0) return { open: false, index: 0 };
                  const next = Math.min(idx, remaining - 1);
                  return { open: true, index: next };
                });
              }}
            >
              <Ionicons name="trash-outline" size={18} color="#fff" />
            </Pressable>
          )}
        </View>
      </Modal>
    </ThemedView>
  );

  const Step4 = (
    <ThemedView style={[styles.container, { backgroundColor: theme.background }]} safe={false}>
      <SubHeader onBack={() => setStep(3)} stepIndex={4} theme={theme} insets={insets} />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingBottom: 40 + insets.bottom }}
          showsVerticalScrollIndicator={false}
        >
          <QuestionHeader title="When would you like the job to start?" />
          {[
            "I'm flexible on start date",
            "It's urgent (within 48 hours)",
            "Within 2 weeks",
            "Within 1 month",
            "I'm planning and budgeting",
          ].map((opt) => (
            <Option key={opt} label={opt} selected={startWhen === opt} onPress={() => setStartWhen(opt)} theme={theme} />
          ))}
          <View style={styles.continueButtonContainer}>
            <ThemedButton onPress={() => setStep(5)} disabled={!startWhen} style={styles.continueButton}>
              <ThemedText style={styles.continueButtonText}>Continue</ThemedText>
            </ThemedButton>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </ThemedView>
  );

  const Step5 = (
    <ThemedView style={[styles.container, { backgroundColor: theme.background }]} safe={false}>
      <SubHeader onBack={() => setStep(4)} stepIndex={5} theme={theme} insets={insets} />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingBottom: 40 + insets.bottom }}
          showsVerticalScrollIndicator={false}
        >
          <QuestionHeader title="How much budget do you have?" />
          {["£0–£3k", "£3k–£6k", "£6k–£9k", "£9k–£12k", "More than £12k"].map((opt) => (
            <Option key={opt} label={opt} selected={budget === opt} onPress={() => setBudget(opt)} theme={theme} />
          ))}
          <View style={styles.continueButtonContainer}>
            <ThemedButton onPress={() => setStep(6)} disabled={!budget} style={styles.continueButton}>
              <ThemedText style={styles.continueButtonText}>Continue</ThemedText>
            </ThemedButton>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </ThemedView>
  );

  const Step6 = (
    <ThemedView style={[styles.container, { backgroundColor: theme.background }]} safe={false}>
      <SubHeader onBack={() => setStep(5)} stepIndex={6} theme={theme} insets={insets} />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingBottom: 40 + insets.bottom }}
          showsVerticalScrollIndicator={false}
        >
          <QuestionHeader title="Any additional details that you want to add?" />
          <ThemedTextInput
            ref={notesInputRef}
            style={styles.notesInput}
            placeholder="Add details (max 500 characters)"
            value={notes}
            onChangeText={(t) => {
              if (t.length <= 500) setNotes(t);
            }}
            multiline
          />
          <ThemedText style={styles.characterCount}>{notes.length}/500</ThemedText>
          <View style={styles.continueButtonContainer}>
            <ThemedButton disabled={submitting} onPress={submitDirectRequest} style={styles.continueButton}>
              <ThemedText style={styles.continueButtonText}>{submitting ? "Submitting…" : "Request quote"}</ThemedText>
            </ThemedButton>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </ThemedView>
  );

  return (
    <ThemedView style={{ flex: 1, backgroundColor: Colors.light.background }}>
      {step === 0 ? (
        <>
          <StatusBar style="light" backgroundColor={Colors.primary} />
          <View style={[styles.header, { paddingTop: insets.top }]}>
            <Pressable
              onPress={() => {
                if (router.canGoBack()) router.back();
                else router.replace("/client/find-business");
              }}
              hitSlop={8}
              style={styles.backBtn}
            >
              <Ionicons name="chevron-back" size={22} color="#fff" />
            </Pressable>
            <ThemedText style={styles.headerTitle}>Select a business</ThemedText>
          </View>
          <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
            {AboutCard}
          </KeyboardAvoidingView>
        </>
      ) : null}
      {step === 1 && Step1}
      {step === 2 && Step2}
      {step === 3 && Step3_Photos}
      {step === 4 && Step4}
      {step === 5 && Step5}
      {step === 6 && Step6}

      {/* Overlay covers all steps — always mounted */}
      <UploadOverlay />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: "stretch" },
  header: { backgroundColor: Colors.primary, paddingBottom: 12, alignItems: "center", justifyContent: "center" },
  backBtn: { position: "absolute", left: 12, bottom: 14 },
  headerTitle: { color: "#fff", fontSize: 18, fontWeight: "bold" },

  subHeader: { paddingBottom: 12, paddingHorizontal: 20, borderBottomWidth: 1 },
  backButton: { flexDirection: "row", alignItems: "center" },
  backText: { fontSize: 16, marginLeft: 4 },
  stepRow: { marginTop: 10, flexDirection: "row", justifyContent: "flex-end" },
  stepText: { fontSize: 12 },
  progressTrack: { height: 3, marginTop: 8, borderRadius: 2, backgroundColor: "rgba(0,0,0,0.08)", overflow: "hidden" },
  progressFill: { height: 3, borderRadius: 2 },

  questionHeader: { paddingHorizontal: 20, paddingVertical: 24 },
  questionTitle: { fontSize: 22, fontWeight: "bold", lineHeight: 28, textAlign: "left" },

  optionCard: {
    borderRadius: 12,
    padding: 16,
    marginHorizontal: 20,
    marginBottom: 12,
    borderWidth: 1,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 2,
    elevation: 1,
  },
  optionContent: { flexDirection: "row", alignItems: "center", gap: 12 },
  optionLabel: { fontSize: 16, fontWeight: "600", marginBottom: 2 },
  optionSubtitle: { fontSize: 14 },
  dot: { width: 18, height: 18, borderRadius: 9, borderWidth: 2 },
  subOption: { marginLeft: 28 },

  addressInput: { marginHorizontal: 20, marginTop: 8, fontSize: 16 },
  notesInput: { marginHorizontal: 20, marginTop: 8, fontSize: 16, minHeight: 120, textAlignVertical: "top" },
  characterCount: { fontSize: 12, marginHorizontal: 20, marginTop: 8, textAlign: "right" },

  continueButtonContainer: { paddingHorizontal: 20, marginTop: 24 },
  continueButton: { borderRadius: 28, paddingVertical: 14, marginVertical: 0 },
  continueButtonText: { color: "white", fontSize: 16, fontWeight: "600", textAlign: "center" },

  topCard: {
    borderRadius: 16,
    padding: 16,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.08)",
    alignItems: "stretch",
    margin: 16,
  },
  avatar: { width: 96, height: 96, borderRadius: 48, backgroundColor: "#eee", alignSelf: "center" },
  avatarFallback: { borderWidth: StyleSheet.hairlineWidth, borderColor: "rgba(0,0,0,0.15)" },
  name: { fontWeight: "800", fontSize: 18, textAlign: "center" },
  metricsRow: { marginTop: 6, flexDirection: "row", alignItems: "center", flexWrap: "wrap", justifyContent: "center" },
  metricText: { marginLeft: 6, color: "#555" },

  verifyWrap: { marginTop: 2 },
  verifyList: {
    marginTop: 8,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: "#f8fafc",
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.06)",
  },
  verifyRow: { flexDirection: "row", alignItems: "center", paddingVertical: 6, paddingHorizontal: 10 },
  verifyIcon: { marginRight: 8 },
  verifyLabel: { fontSize: 15, fontWeight: "700" },
  verifyLabelMuted: { color: "#6b7280", fontWeight: "600" },

  kpiRow: { flexDirection: "row", justifyContent: "space-between" },
  kpiCol: { flex: 1, alignItems: "flex-start", paddingRight: 8 },
  kpiLabel: { fontSize: 12, color: "#666", fontWeight: "700", textTransform: "uppercase" },
  kpiValue: { fontSize: 18, fontWeight: "800", marginTop: 2 },

  divider: { height: 1, backgroundColor: "rgba(0,0,0,0.08)", marginVertical: 12 },
  infoLabel: {
    fontSize: 12,
    color: "#666",
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.2,
  },
  infoValue: { fontSize: 16, fontWeight: "600" },
  infoBody: { fontSize: 15, lineHeight: 20 },

  // Photos grid
  gridWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    paddingHorizontal: 20,
    paddingTop: 6,
  },
  thumbCell: {
    width: CELL,
    height: CELL,
    borderRadius: 10,
    overflow: "hidden",
    backgroundColor: "#eee",
    position: "relative",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(0,0,0,0.1)",
  },
  thumbImg: { width: "100%", height: "100%" },
  thumbLoadingOverlay: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.35)",
  },
  removeBtn: {
    position: "absolute",
    top: 6,
    right: 6,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: "rgba(0,0,0,0.6)",
    alignItems: "center",
    justifyContent: "center",
  },
  addCell: {
    width: CELL,
    height: CELL,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(0,0,0,0.15)",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#fafafa",
  },

  // Viewer modal
  viewerBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.95)",
    alignItems: "center",
    justifyContent: "center",
  },
  viewerImg: { width: "90%", height: "70%", resizeMode: "contain" },
  viewerClose: {
    position: "absolute",
    top: 18,
    right: 18,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.18)",
    alignItems: "center",
    justifyContent: "center",
  },
  viewerNav: {
    position: "absolute",
    top: "50%",
    marginTop: -18,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.18)",
    alignItems: "center",
    justifyContent: "center",
  },
  viewerDelete: {
    position: "absolute",
    bottom: 28,
    alignSelf: "center",
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(255,0,0,0.35)",
    alignItems: "center",
    justifyContent: "center",
  },

  // Upload / Preparing overlay styles
  uploadBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.35)",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  uploadCard: {
    width: "86%",
    maxWidth: 360,
    borderRadius: 16,
    paddingVertical: 20,
    paddingHorizontal: 18,
    backgroundColor: "#fff",
    alignItems: "center",
  },
  uploadTitle: { marginTop: 12, fontWeight: "800", fontSize: 16 },
  uploadSub: { marginTop: 4, fontSize: 13, color: "#666" },
  uploadBar: {
    marginTop: 12,
    width: "100%",
    height: 6,
    borderRadius: 3,
    backgroundColor: "rgba(0,0,0,0.08)",
    overflow: "hidden",
  },
  uploadFill: { height: 6, borderRadius: 3 },
});
