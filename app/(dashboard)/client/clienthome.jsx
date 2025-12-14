// app/(dashboard)/client/clienthome.jsx
import {
  StyleSheet,
  View,
  Platform,
  KeyboardAvoidingView,
  ScrollView,
  Pressable,
  Alert,
  Image,
  Modal,
  ActivityIndicator,
} from "react-native";
import { useState, useRef, useEffect } from "react";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import * as ImagePicker from "expo-image-picker";
import * as ImageManipulator from "expo-image-manipulator";

import { supabase } from "../../../lib/supabase";
import { useUser } from "../../../hooks/useUser";

import ThemedView from "../../../components/ThemedView";
import ThemedText from "../../../components/ThemedText";
import ThemedTextInput from "../../../components/ThemedTextInput";
import ThemedButton from "../../../components/ThemedButton";
import { Colors } from "../../../constants/Colors";
import { uploadRequestImages } from "../../../lib/api/attachments";

/**
 * Minimal home:
 * - Keep header
 * - Single CTA → /client/find-business
 * - Bathroom flow kept (no redesign)
 */

// Same relaxed outcode validator used in /client/find-business/[id].jsx
function normalizeOutcode(s) {
  const x = String(s || "").toUpperCase().replace(/\s+/g, "");
  const ok = /^[A-Z]{1,2}(?:\d{1,2}[A-Z]?)?$/.test(x);
  return ok ? x : null;
}

// Ensure at least N frames paint
const paintFrames = (n = 2) =>
  new Promise((resolve) => {
    const step = () => (n-- <= 0 ? resolve() : requestAnimationFrame(step));
    requestAnimationFrame(step);
  });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const MIN_PREP_MS = 600; // keep overlay at least this long (avoid flicker)

const MIN_PHOTOS = 1;
const CELL = 96;

// Create lightweight thumbnails so the grid renders fast (with base64 for upload)
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

export default function ClientHome() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useUser();

  // ===== Bathroom flow (+ Photos step) =====
  const [step, setStep] = useState(0);
  const [bathroomMain, setBathroomMain] = useState(null);
  const [bathroomRefitType, setBathroomRefitType] = useState(null);

  const [outcode, setOutcode] = useState("");
  const [photos, setPhotos] = useState([]); // array of { uri, base64? }

  // PREPARING overlay: track newly added URIs until they finish rendering
  const [prepVisible, setPrepVisible] = useState(false);
  const [prepUris, setPrepUris] = useState(new Set()); // Set<uri> (thumb URIs)
  const [prepStartedAt, setPrepStartedAt] = useState(0);
  const [prepPhase, setPrepPhase] = useState("preparing"); // "preparing" | "rendering"
  const [prepDone, setPrepDone] = useState(0);
  const [prepTotal, setPrepTotal] = useState(0);

  const [viewer, setViewer] = useState({ open: false, index: 0 }); // full-screen preview
  const [startWhen, setStartWhen] = useState(null);
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Upload overlay (actual upload progress on submit)
  const [uploading, setUploading] = useState(false);
  const [uploadIdx, setUploadIdx] = useState(0);
  const [uploadTotal, setUploadTotal] = useState(0);

  const outcodeRef = useRef(null);

  // Helper to hard-reset all overlay state (prevents the "last overlay" flash)
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

  // Helper: start preparing for a batch of URIs
  function beginPreparing(count) {
    if (!count || count <= 0) return;
    setPrepStartedAt(Date.now());
    setPrepVisible(true);
    setPrepPhase("preparing");
    setPrepDone(0);
    setPrepTotal(count);
  }

  // When all picked images have fired onLoadEnd, hide overlay (after min duration)
  useEffect(() => {
    if (!prepVisible) return;
    if (prepUris.size > 0) return;
    const elapsed = Date.now() - prepStartedAt;
    const remain = Math.max(0, MIN_PREP_MS - elapsed);
    const t = setTimeout(() => setPrepVisible(false), remain);
    return () => clearTimeout(t);
  }, [prepUris, prepVisible, prepStartedAt]);

  // Mark a single URI as rendered
  const markThumbLoaded = (uri) => {
    setPrepUris((prev) => {
      if (!prev.size) return prev;
      const next = new Set(prev);
      next.delete(uri);
      return next;
    });
  };

  // Keep flow available if you choose to use it later
  const isBathroom = true;

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

      // 1) Show overlay BEFORE any heavy work
      beginPreparing(newUris.length);
      await paintFrames(2);
      await sleep(0);

      // 2) Create thumbnails with progress
      const thumbs = [];
      for (const uri of newUris) {
        const [thumb] = await makeThumbnails([uri]);
        thumbs.push(thumb);
        setPrepDone((d) => d + 1);
        await sleep(0);
      }

      // 3) Switch to rendering phase and mount thumbnails
      setPrepPhase("rendering");
      const thumbUris = thumbs.map((t) => t.uri);
      setPrepUris(new Set(thumbUris));
      await paintFrames(1);

      setPhotos((prev) => [...prev, ...thumbs].slice(0, 5));
      // overlay hides after all onLoadEnd fire (see effect + markThumbLoaded)
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

      // 1) Overlay first
      beginPreparing(1);
      await paintFrames(2);
      await sleep(0);

      // 2) Make one thumbnail (progress 1/1)
      const [thumb] = await makeThumbnails([asset.uri]);
      setPrepDone(1);

      // 3) Rendering phase + mount
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

  async function submitRequest() {
    try {
      if (!user?.id) return Alert.alert("Please log in to submit a request.");

      const oc = normalizeOutcode(outcode);
      if (!oc) return Alert.alert("Postcode area required", "Main postcode only.");
      if (!startWhen) return Alert.alert("Select timing", "Please choose when you'd like the job to start.");

      setSubmitting(true);

      const details = [
        `Category: Bathrooms`,
        bathroomMain ? `Main: ${bathroomMain}` : null,
        bathroomRefitType ? `Refit type: ${bathroomRefitType}` : null,
        `Address: ${oc}`,
        `Start: ${startWhen}`,
        notes?.trim() ? `Notes: ${notes.trim()}` : null,
      ]
        .filter(Boolean)
        .join("\n");

      // 1) Create the request and get its id
      const { data: created, error: reqError } = await supabase
        .from("quote_requests")
        .insert({
          requester_id: user.id,
          details,
          status: "open",
          job_outcode: oc,
        })
        .select("id")
        .single();

      if (reqError) throw reqError;

      // 2) Upload selected images and link via RPC (best effort)
      await uploadAndAttach(created.id);

      // ensure no overlay flash after uploads
      resetPhotoUI();

      // 3) Best-effort match
      try {
        await supabase.functions.invoke("match-trades", {
          body: { request_id: created.id, limit: 5 },
        });
      } catch (fnErr) {
        console.log("match-trades failed:", fnErr?.message || fnErr);
      }

      Alert.alert("Request submitted", "Your quote request was sent.");
      // reset form state
      setStep(0);
      setBathroomMain(null);
      setBathroomRefitType(null);
      setOutcode("");
      setPhotos([]);
      setStartWhen(null);
      setNotes("");
      // extra safety
      resetPhotoUI();
    } catch (e) {
      Alert.alert("Error", e.message);
    } finally {
      setSubmitting(false);
    }
  }

  // ===== Upload/Preparing overlay — always mounted, instant show =====
  const UploadOverlay = () => {
    // Only show when actually preparing OR actively uploading with a positive total
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

  // ======= Headers =======
  const AppHeader = () => (
    <View style={[styles.appHeader, { backgroundColor: Colors.primary, paddingTop: insets.top }]}>
      <StatusBar style="light" />
      <ThemedText style={styles.appTitle}>Settled</ThemedText>
    </View>
  );

  const SubHeader = ({ onBack }) => {
    const stepIndex = step; // 1..5 (Photos inserted before Timing)
    const total = 5;
    const pct =
      stepIndex === 1 ? "20%" :
      stepIndex === 2 ? "40%" :
      stepIndex === 3 ? "60%" :
      stepIndex === 4 ? "80%" : "100%";
    const backLabel = step === 1 ? "Search" : "Back";
    return (
      <View style={[styles.subHeader, { paddingTop: insets.top }]}>
        <Pressable onPress={onBack} style={styles.backButton} hitSlop={10}>
          <Ionicons name="chevron-back" size={24} color="#111" />
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

  const QuestionHeader = ({ title }) => (
    <View style={styles.questionHeader}>
      <ThemedText title style={styles.questionTitle}>
        {title}
      </ThemedText>
    </View>
  );

  const Option = ({ label, selected, onPress, subtitle, inset = false }) => (
    <Pressable
      onPress={onPress}
      style={[
        styles.optionCard,
        { backgroundColor: "#fff", borderColor: selected ? Colors.primary : "rgba(0,0,0,0.15)" },
        inset && styles.subOption,
      ]}
    >
      <View style={styles.optionContent}>
        <View
          style={[
            styles.dot,
            { borderColor: "#111" },
            selected && { backgroundColor: "#111" },
          ]}
        />
        <View style={{ flex: 1 }}>
          <ThemedText style={styles.optionLabel}>{label}</ThemedText>
          {!!subtitle && <ThemedText style={styles.optionSubtitle}>{subtitle}</ThemedText>}
        </View>
      </View>
    </Pressable>
  );

  // ======= Screens =======

  // Landing — single CTA
  const Landing = (
    <ThemedView style={styles.container} safe={false}>
      <AppHeader />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ padding: 24 }}
          contentInsetAdjustmentBehavior="never"
          showsVerticalScrollIndicator={false}
        >
          <ThemedText title style={{ fontSize: 20, fontWeight: "800", marginBottom: 12 }}>
            Find trusted trades
          </ThemedText>
          <ThemedText style={{ marginBottom: 16, lineHeight: 20 }}>
            Discover suggested businesses or search directly — all in one place.
          </ThemedText>

          <ThemedButton onPress={() => router.push("/client/find-business")} style={{ borderRadius: 28 }}>
            <ThemedText style={{ color: "#fff", fontWeight: "700", textAlign: "center" }}>
              Find a business
            </ThemedText>
          </ThemedButton>
        </ScrollView>
      </KeyboardAvoidingView>
      <UploadOverlay />
    </ThemedView>
  );

  // Step 1
  const BathroomQ1 = (
    <ThemedView style={[styles.container]} safe={false}>
      <SubHeader onBack={() => setStep(0)} />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={Platform.select({ ios: 0, android: 0 })}
      >
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingBottom: 40 + insets.bottom }}
          contentInsetAdjustmentBehavior="never"
          showsVerticalScrollIndicator={false}
        >
          <QuestionHeader title="What does your bathroom job involve?" />

          <Option
            label="Bathroom refit"
            subtitle="fitting a brand new bathroom"
            selected={bathroomMain === "Bathroom refit"}
            onPress={() => setBathroomMain("Bathroom refit")}
          />
          {bathroomMain === "Bathroom refit" && (
            <>
              <Option
                inset
                label="Fit only"
                selected={bathroomRefitType === "Fit only"}
                onPress={() => setBathroomRefitType("Fit only")}
              />
              <Option
                inset
                label="Supply & fit"
                selected={bathroomRefitType === "Supply & fit"}
                onPress={() => setBathroomRefitType("Supply & fit")}
              />
              <Option
                inset
                label="Supply only"
                selected={bathroomRefitType === "Supply only"}
                onPress={() => setBathroomRefitType("Supply only")}
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
          />
          <Option
            label="Plumbing and heating"
            subtitle="radiators, blockages, etc."
            selected={bathroomMain === "Plumbing and heating"}
            onPress={() => {
              setBathroomMain("Plumbing and heating");
              setBathroomRefitType(null);
            }}
          />
          <Option
            label="Tiling"
            selected={bathroomMain === "Tiling"}
            onPress={() => {
              setBathroomMain("Tiling");
              setBathroomRefitType(null);
            }}
          />
          <Option
            label="Bathroom design"
            selected={bathroomMain === "Bathroom design"}
            onPress={() => {
              setBathroomMain("Bathroom design");
              setBathroomRefitType(null);
            }}
          />
          <Option
            label="Sealant"
            selected={bathroomMain === "Sealant"}
            onPress={() => {
              setBathroomMain("Sealant");
              setBathroomRefitType(null);
            }}
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
      <UploadOverlay />
    </ThemedView>
  );

  // Step 2 — Postcode area
  const AddressQ = (
    <ThemedView style={[styles.container]} safe={false}>
      <SubHeader onBack={() => setStep(1)} />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingBottom: 40 + insets.bottom }}
          contentInsetAdjustmentBehavior="never"
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
      <UploadOverlay />
    </ThemedView>
  );

  // Step 3 — Photos (MANDATORY + PREVIEW)
  const PhotosQ = (
    <ThemedView style={[styles.container]} safe={false}>
      <SubHeader onBack={() => setStep(2)} />
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
                  <Image source={{ uri: p.uri }} style={styles.thumbImg} onLoadEnd={() => markThumbLoaded(p.uri)} />
                </Pressable>
                <Pressable onPress={() => removePhoto(i)} style={styles.removeBtn} hitSlop={8}>
                  <Ionicons name="close" size={14} color="#fff" />
                </Pressable>
              </View>
            ))}
            {photos.length < 5 && (
              <Pressable onPress={pickFromLibrary} style={[styles.addCell]} hitSlop={8}>
                <Ionicons name="images-outline" size={26} color="#666" />
                <ThemedText style={{ fontSize: 12, marginTop: 6 }}>Add photos</ThemedText>
              </Pressable>
            )}
            {photos.length < 5 && (
              <Pressable onPress={takePhoto} style={[styles.addCell]} hitSlop={8}>
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
      <Modal visible={viewer.open} transparent animationType="fade" onRequestClose={() => setViewer((v) => ({ ...v, open: false }))}>
        <View style={styles.viewerBackdrop}>
          <Pressable style={styles.viewerClose} hitSlop={8} onPress={() => setViewer((v) => ({ ...v, open: false }))}>
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

          {photos[viewer.index] && <Image source={{ uri: photos[viewer.index].uri }} style={styles.viewerImg} />}

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
      <UploadOverlay />
    </ThemedView>
  );

  // Step 4 — Timing
  const TimingQ = (
    <ThemedView style={[styles.container]} safe={false}>
      <SubHeader onBack={() => setStep(3)} />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingBottom: 40 + insets.bottom }}
          contentInsetAdjustmentBehavior="never"
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
            <Option key={opt} label={opt} selected={startWhen === opt} onPress={() => setStartWhen(opt)} />
          ))}

          <View style={styles.continueButtonContainer}>
            <ThemedButton onPress={() => setStep(5)} disabled={!startWhen} style={styles.continueButton}>
              <ThemedText style={styles.continueButtonText}>Continue</ThemedText>
            </ThemedButton>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
      <UploadOverlay />
    </ThemedView>
  );

  // Step 5 — Notes
  const NotesQ = (
    <ThemedView style={[styles.container]} safe={false}>
      <SubHeader onBack={() => setStep(4)} />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingBottom: 40 + insets.bottom }}
          contentInsetAdjustmentBehavior="never"
          showsVerticalScrollIndicator={false}
        >
          <QuestionHeader title="Any additional details that you want to add?" />
          <ThemedTextInput
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
            <ThemedButton disabled={submitting} onPress={submitRequest} style={styles.continueButton}>
              <ThemedText style={styles.continueButtonText}>{submitting ? "Submitting…" : "Request quote"}</ThemedText>
            </ThemedButton>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
      <UploadOverlay />
    </ThemedView>
  );

  if (step === 0) return Landing;
  if (isBathroom && step === 1) return BathroomQ1;
  if (isBathroom && step === 2) return AddressQ;
  if (isBathroom && step === 3) return PhotosQ; // NEW (mandatory + preview)
  if (isBathroom && step === 4) return TimingQ;
  if (isBathroom && step === 5) return NotesQ;
  return Landing;
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: "stretch" },

  // Header (home)
  appHeader: {
    paddingBottom: 16,
    paddingHorizontal: 20,
    alignItems: "center",
  },
  appTitle: {
    fontSize: 24,
    fontWeight: "bold",
    color: "white",
    letterSpacing: 0.5,
  },

  // Subheader (steps)
  subHeader: {
    paddingBottom: 12,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(0,0,0,0.08)",
    backgroundColor: "#fff",
  },
  backButton: { flexDirection: "row", alignItems: "center" },
  backText: { fontSize: 16, marginLeft: 4 },
  stepRow: { marginTop: 10, flexDirection: "row", justifyContent: "flex-end" },
  stepText: { fontSize: 12 },
  progressTrack: {
    height: 3,
    marginTop: 8,
    borderRadius: 2,
    backgroundColor: "rgba(0,0,0,0.08)",
    overflow: "hidden",
  },
  progressFill: { height: 3, borderRadius: 2 },

  // Question title
  questionHeader: { paddingHorizontal: 20, paddingVertical: 24 },
  questionTitle: { fontSize: 22, fontWeight: "bold", lineHeight: 28, textAlign: "left" },

  // Options (radio)
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
    backgroundColor: "#fff",
  },
  optionContent: { flexDirection: "row", alignItems: "center", gap: 12 },
  optionLabel: { fontSize: 16, fontWeight: "600", marginBottom: 2 },
  optionSubtitle: { fontSize: 14 },
  dot: { width: 18, height: 18, borderRadius: 9, borderWidth: 2 },

  // Suboptions indentation
  subOption: { marginLeft: 28 },

  // Inputs
  addressInput: { marginHorizontal: 20, marginTop: 8, fontSize: 16 },
  notesInput: { marginHorizontal: 20, marginTop: 8, fontSize: 16, minHeight: 120, textAlignVertical: "top" },
  characterCount: { fontSize: 12, marginHorizontal: 20, marginTop: 8, textAlign: "right" },

  // CTA
  continueButtonContainer: { paddingHorizontal: 20, marginTop: 24 },
  continueButton: { borderRadius: 28, paddingVertical: 14, marginVertical: 0 },
  continueButtonText: { color: "white", fontSize: 16, fontWeight: "600", textAlign: "center" },

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
