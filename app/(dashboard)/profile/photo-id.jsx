// app/(dashboard)/profile/photo-id.jsx
// Photo ID verification screen - multi-step flow
import { useState, useEffect } from "react";
import {
  StyleSheet,
  View,
  ScrollView,
  Pressable,
  Alert,
  ActivityIndicator,
  Image,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";

import ThemedView from "../../../components/ThemedView";
import ThemedText from "../../../components/ThemedText";
import Spacer from "../../../components/Spacer";
import { SettingsFormSkeleton } from "../../../components/Skeleton";
import { Colors } from "../../../constants/Colors";
import { TypeVariants } from "../../../constants/Typography";
import { useTheme } from "../../../hooks/useTheme";

import { useUser } from "../../../hooks/useUser";
import { getMyProfile } from "../../../lib/api/profile";
import {
  getMyVerificationStatus,
  submitPhotoId,
  uploadVerificationDocument,
} from "../../../lib/api/verification";
import ThemedStatusBar from "../../../components/ThemedStatusBar";
import useHideTabBar from "../../../hooks/useHideTabBar";

const PRIMARY = Colors?.primary || "#7C3AED";

// ID Types available
const ID_TYPES = [
  { id: "passport", label: "Passport", icon: "document-text-outline" },
  { id: "driving_licence", label: "Driving licence", icon: "car-outline" },
  { id: "national_id", label: "National ID card", icon: "card-outline" },
];

export default function PhotoIDScreen() {
  useHideTabBar();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useUser();
  const { colors: c } = useTheme();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [currentStep, setCurrentStep] = useState("intro"); // intro, select, upload, review, submitted, verified, issue
  const [selectedIdType, setSelectedIdType] = useState(null);
  const [photoUri, setPhotoUri] = useState(null);
  const [verificationStatus, setVerificationStatus] = useState("not_started");
  const [submittedDate, setSubmittedDate] = useState(null);

  useEffect(() => {
    loadVerificationStatus();
  }, []);

  async function loadVerificationStatus() {
    try {
      const verificationData = await getMyVerificationStatus();
      const status = verificationData?.photo_id_status || "not_started";
      setVerificationStatus(status);

      // Set initial step based on status
      if (status === "verified") {
        setCurrentStep("verified");
      } else if (status === "under_review" || status === "pending_review") {
        setCurrentStep("submitted");
        setSubmittedDate(new Date().toLocaleDateString("en-GB", {
          day: "numeric",
          month: "short",
          year: "numeric"
        }));
      } else if (status === "rejected") {
        setCurrentStep("issue");
      } else {
        setCurrentStep("intro");
      }
    } catch (e) {
      console.log("Error loading verification status:", e);
    } finally {
      setLoading(false);
    }
  }

  async function handleTakePhoto() {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Permission needed", "Camera permission is required to take photos.");
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [4, 3],
      quality: 0.8,
    });

    if (!result.canceled && result.assets[0]) {
      setPhotoUri(result.assets[0].uri);
      setCurrentStep("review");
    }
  }

  async function handleChooseFromGallery() {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Permission needed", "Photo library permission is required.");
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [4, 3],
      quality: 0.8,
    });

    if (!result.canceled && result.assets[0]) {
      setPhotoUri(result.assets[0].uri);
      setCurrentStep("review");
    }
  }

  async function handleSubmit() {
    try {
      setSaving(true);

      // Submit photo ID using the verification API
      const result = await submitPhotoId({
        documentType: selectedIdType?.id || "passport",
        file: {
          uri: photoUri,
          mimeType: "image/jpeg",
        },
      });

      console.log("Photo ID submission result:", result);

      setSubmittedDate(new Date().toLocaleDateString("en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric"
      }));
      setCurrentStep("submitted");
    } catch (e) {
      console.log("Photo ID submission error:", e);
      Alert.alert("Error", e.message || "Failed to submit. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  function handleRetake() {
    setPhotoUri(null);
    setCurrentStep("upload");
  }

  // Handle back navigation based on current step
  function handleBack() {
    switch (currentStep) {
      case "intro":
      case "submitted":
      case "verified":
      case "issue":
        // These are entry/exit points - go back to settings
        router.back();
        break;
      case "select":
        // Go back to intro
        setCurrentStep("intro");
        break;
      case "upload":
        // Go back to select
        setSelectedIdType(null);
        setCurrentStep("select");
        break;
      case "review":
        // Go back to upload
        setPhotoUri(null);
        setCurrentStep("upload");
        break;
      default:
        router.back();
    }
  }

  if (loading) {
    return (
      <ThemedView style={[styles.container, { paddingTop: insets.top }]}>
        <ThemedStatusBar />
        <SettingsFormSkeleton paddingTop={16} />
      </ThemedView>
    );
  }

  return (
    <ThemedView style={[styles.container, { paddingTop: insets.top }]}>
      <ThemedStatusBar />

      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={handleBack} hitSlop={10}>
          <Ionicons name="chevron-back" size={24} color={c.text} />
        </Pressable>
        <ThemedText style={[styles.headerTitle, { color: c.text }]}>Photo ID</ThemedText>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Step: Introduction */}
        {currentStep === "intro" && (
          <IntroStep onContinue={() => setCurrentStep("select")} />
        )}

        {/* Step: Select ID Type */}
        {currentStep === "select" && (
          <SelectTypeStep
            selectedType={selectedIdType}
            onSelect={(type) => {
              setSelectedIdType(type);
              setCurrentStep("upload");
            }}
          />
        )}

        {/* Step: Upload Photo */}
        {currentStep === "upload" && (
          <UploadStep
            idType={selectedIdType}
            onTakePhoto={handleTakePhoto}
            onChooseFromGallery={handleChooseFromGallery}
          />
        )}

        {/* Step: Review Photo */}
        {currentStep === "review" && (
          <ReviewStep
            photoUri={photoUri}
            onSubmit={handleSubmit}
            onRetake={handleRetake}
            saving={saving}
          />
        )}

        {/* Step: Submitted Confirmation */}
        {currentStep === "submitted" && (
          <SubmittedStep
            idType={selectedIdType}
            submittedDate={submittedDate}
            onBackToSettings={() => router.back()}
          />
        )}

        {/* Step: Verified */}
        {currentStep === "verified" && (
          <VerifiedStep
            onDone={() => router.back()}
            onChangeDocument={() => setCurrentStep("select")}
          />
        )}

        {/* Step: Issue/Rejected */}
        {currentStep === "issue" && (
          <IssueStep
            onUploadNew={() => setCurrentStep("select")}
          />
        )}

        <Spacer height={insets.bottom > 0 ? insets.bottom + 24 : 40} />
      </ScrollView>
    </ThemedView>
  );
}

// Introduction Step
function IntroStep({ onContinue }) {
  const { colors: c } = useTheme();
  return (
    <View style={styles.stepContainer}>
      <View style={[styles.iconContainer, { backgroundColor: c.elevate }]}>
        <Ionicons name="person-outline" size={48} color={c.text} />
      </View>

      <ThemedText style={[styles.stepTitle, { color: c.text }]}>Verify your identity</ThemedText>

      <ThemedText style={[styles.stepDescription, { color: c.textMuted }]}>
        We need to confirm you are who you say you are. This helps keep Settled safe for everyone.
      </ThemedText>

      <View style={[styles.infoBox, { backgroundColor: c.elevate, borderColor: c.border, borderWidth: 1 }]}>
        <ThemedText style={[styles.infoTitle, { color: c.text }]}>What you'll need:</ThemedText>
        <View style={styles.infoList}>
          <ThemedText style={[styles.infoItem, { color: c.textMid }]}>
            {"•"} Valid passport, driving licence, or national ID
          </ThemedText>
          <ThemedText style={[styles.infoItem, { color: c.textMid }]}>
            {"•"} Good lighting
          </ThemedText>
          <ThemedText style={[styles.infoItem, { color: c.textMid }]}>
            {"•"} Clear, unobstructed photo of the document
          </ThemedText>
        </View>
      </View>

      <Spacer height={32} />

      <Pressable style={styles.primaryButton} onPress={onContinue}>
        <ThemedText style={styles.primaryButtonText}>Continue</ThemedText>
      </Pressable>
    </View>
  );
}

// Select ID Type Step
function SelectTypeStep({ selectedType, onSelect }) {
  const { colors: c } = useTheme();
  return (
    <View style={styles.stepContainer}>
      <ThemedText style={[styles.stepTitle, { color: c.text }]}>Select your ID type</ThemedText>

      <Spacer height={24} />

      {ID_TYPES.map((idType) => (
        <Pressable
          key={idType.id}
          style={({ pressed }) => [
            styles.optionRow,
            { backgroundColor: c.elevate, borderColor: c.border },
            pressed && { backgroundColor: c.elevate2 },
          ]}
          onPress={() => onSelect(idType)}
        >
          <View style={styles.optionLeft}>
            <Ionicons name={idType.icon} size={24} color={c.textMuted} />
            <ThemedText style={[styles.optionLabel, { color: c.text }]}>{idType.label}</ThemedText>
          </View>
          <Ionicons name="chevron-forward" size={20} color={c.textMuted} />
        </Pressable>
      ))}
    </View>
  );
}

// Upload Photo Step
function UploadStep({ idType, onTakePhoto, onChooseFromGallery }) {
  const { colors: c } = useTheme();
  const idLabel = idType?.label?.toLowerCase() || "document";

  return (
    <View style={styles.stepContainer}>
      <ThemedText style={[styles.stepTitle, { color: c.text }]}>
        Take a photo of your {idLabel}
      </ThemedText>

      <Spacer height={24} />

      <View style={[styles.uploadArea, { backgroundColor: c.elevate, borderColor: c.border }]}>
        <View style={styles.documentOutline}>
          <Ionicons name="document-outline" size={48} color={c.textMuted} />
        </View>
      </View>

      <Spacer height={24} />

      <ThemedText style={[styles.tipsTitle, { color: c.text }]}>Tips for a good photo:</ThemedText>
      <View style={styles.tipsList}>
        <ThemedText style={[styles.tipItem, { color: c.textMuted }]}>
          {"•"} Place document on flat surface
        </ThemedText>
        <ThemedText style={[styles.tipItem, { color: c.textMuted }]}>
          {"•"} Ensure all corners visible
        </ThemedText>
        <ThemedText style={[styles.tipItem, { color: c.textMuted }]}>
          {"•"} Avoid glare and shadows
        </ThemedText>
      </View>

      <Spacer height={32} />

      <Pressable style={styles.primaryButton} onPress={onTakePhoto}>
        <Ionicons name="camera-outline" size={20} color="#FFFFFF" style={{ marginRight: 8 }} />
        <ThemedText style={styles.primaryButtonText}>Take photo</ThemedText>
      </Pressable>

      <Spacer height={12} />

      <Pressable style={[styles.secondaryButton, { backgroundColor: c.elevate, borderColor: c.border }]} onPress={onChooseFromGallery}>
        <Ionicons name="folder-outline" size={20} color={PRIMARY} style={{ marginRight: 8 }} />
        <ThemedText style={styles.secondaryButtonText}>Upload from gallery</ThemedText>
      </Pressable>
    </View>
  );
}

// Review Photo Step
function ReviewStep({ photoUri, onSubmit, onRetake, saving }) {
  const { colors: c } = useTheme();
  return (
    <View style={styles.stepContainer}>
      <ThemedText style={[styles.stepTitle, { color: c.text }]}>Review your photo</ThemedText>

      <Spacer height={24} />

      <View style={[styles.photoPreviewContainer, { backgroundColor: c.elevate }]}>
        <Image source={{ uri: photoUri }} style={styles.photoPreview} resizeMode="cover" />
      </View>

      <Spacer height={24} />

      <View style={styles.checklistContainer}>
        <View style={styles.checklistItem}>
          <Ionicons name="checkmark-circle" size={20} color={Colors.success} />
          <ThemedText style={[styles.checklistText, { color: c.text }]}>Document is clear and readable</ThemedText>
        </View>
        <View style={styles.checklistItem}>
          <Ionicons name="checkmark-circle" size={20} color={Colors.success} />
          <ThemedText style={[styles.checklistText, { color: c.text }]}>All corners are visible</ThemedText>
        </View>
        <View style={styles.checklistItem}>
          <Ionicons name="checkmark-circle" size={20} color={Colors.success} />
          <ThemedText style={[styles.checklistText, { color: c.text }]}>No glare or shadows</ThemedText>
        </View>
      </View>

      <Spacer height={32} />

      <Pressable
        style={[styles.primaryButton, saving && styles.buttonDisabled]}
        onPress={onSubmit}
        disabled={saving}
      >
        {saving ? (
          <ActivityIndicator color="#FFFFFF" />
        ) : (
          <ThemedText style={styles.primaryButtonText}>Submit for review</ThemedText>
        )}
      </Pressable>

      <Spacer height={16} />

      <Pressable onPress={onRetake} disabled={saving}>
        <ThemedText style={styles.linkText}>Retake photo</ThemedText>
      </Pressable>
    </View>
  );
}

// Submitted Confirmation Step
function SubmittedStep({ idType, submittedDate, onBackToSettings }) {
  const { colors: c } = useTheme();
  const idLabel = idType?.label || "Passport";

  return (
    <View style={styles.stepContainer}>
      <View style={styles.successIconContainer}>
        <View style={styles.successIconCircle}>
          <Ionicons name="checkmark" size={32} color="#FFFFFF" />
        </View>
      </View>

      <Spacer height={24} />

      <ThemedText style={[styles.stepTitle, { color: c.text }]}>Submitted for review</ThemedText>

      <ThemedText style={[styles.stepDescription, { color: c.textMuted }]}>
        We'll review your document and notify you within 24-48 hours.
      </ThemedText>

      <Spacer height={24} />

      <View style={[styles.submittedCard, { backgroundColor: c.elevate, borderColor: c.border }]}>
        <Ionicons name="document-text-outline" size={24} color={c.textMuted} />
        <View style={styles.submittedCardInfo}>
          <ThemedText style={[styles.submittedCardTitle, { color: c.text }]}>{idLabel}</ThemedText>
          <ThemedText style={styles.submittedCardStatus}>Submitted</ThemedText>
          <ThemedText style={[styles.submittedCardDate, { color: c.textMuted }]}>{submittedDate}</ThemedText>
        </View>
      </View>

      <Spacer height={32} />

      <Pressable style={styles.primaryButton} onPress={onBackToSettings}>
        <ThemedText style={styles.primaryButtonText}>Back to Settings</ThemedText>
      </Pressable>
    </View>
  );
}

// Verified Step
function VerifiedStep({ onDone, onChangeDocument }) {
  const { colors: c } = useTheme();
  return (
    <View style={styles.stepContainer}>
      <View style={styles.verifiedBanner}>
        <Ionicons name="checkmark-circle" size={20} color={Colors.success} />
        <View style={styles.verifiedBannerContent}>
          <ThemedText style={styles.verifiedBannerTitle}>Verified</ThemedText>
          <ThemedText style={styles.verifiedBannerText}>
            Your photo ID has been verified.
          </ThemedText>
        </View>
      </View>

      <Spacer height={24} />

      <View style={[styles.documentCard, { backgroundColor: c.elevate, borderColor: c.border }]}>
        <View style={[styles.documentThumbnail, { backgroundColor: c.elevate2 }]}>
          <Ionicons name="document-text" size={32} color={c.textMuted} />
        </View>
        <View style={styles.documentCardInfo}>
          <ThemedText style={[styles.documentCardFilename, { color: c.text }]}>driving_licence.jpg</ThemedText>
          <Ionicons name="checkmark-circle" size={18} color={Colors.success} />
        </View>
        <Pressable onPress={onChangeDocument}>
          <ThemedText style={styles.linkText}>Change</ThemedText>
        </Pressable>
      </View>

      <Spacer height={32} />

      <Pressable style={styles.primaryButton} onPress={onDone}>
        <ThemedText style={styles.primaryButtonText}>Done</ThemedText>
      </Pressable>
    </View>
  );
}

// Issue/Rejected Step
function IssueStep({ onUploadNew }) {
  const { colors: c } = useTheme();
  return (
    <View style={styles.stepContainer}>
      <View style={styles.issueBanner}>
        <Ionicons name="warning" size={20} color="#DC2626" />
        <View style={styles.issueBannerContent}>
          <ThemedText style={styles.issueBannerTitle}>Issue with your ID</ThemedText>
          <ThemedText style={styles.issueBannerText}>
            We couldn't verify your ID. Please upload a clearer photo.
          </ThemedText>
        </View>
      </View>

      <Spacer height={24} />

      <View style={[styles.documentCard, { backgroundColor: c.elevate, borderColor: c.border }]}>
        <View style={[styles.documentThumbnail, { backgroundColor: c.elevate2 }]}>
          <Ionicons name="document-text" size={32} color={c.textMuted} />
        </View>
        <View style={styles.documentCardInfo}>
          <ThemedText style={[styles.documentCardFilename, { color: c.text }]}>driving_licence.jpg</ThemedText>
          <Ionicons name="warning" size={18} color="#DC2626" />
        </View>
      </View>

      <Spacer height={24} />

      <ThemedText style={[styles.tipsTitle, { color: c.text }]}>Common issues:</ThemedText>
      <View style={styles.tipsList}>
        <ThemedText style={[styles.tipItem, { color: c.textMuted }]}>{"•"} Photo is blurry</ThemedText>
        <ThemedText style={[styles.tipItem, { color: c.textMuted }]}>{"•"} Document is expired</ThemedText>
        <ThemedText style={[styles.tipItem, { color: c.textMuted }]}>{"•"} Part of the ID is cut off</ThemedText>
      </View>

      <Spacer height={32} />

      <Pressable style={styles.primaryButton} onPress={onUploadNew}>
        <ThemedText style={styles.primaryButtonText}>Upload new photo</ThemedText>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    // bg handled by ThemedView default + theme.
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  headerTitle: {
    ...TypeVariants.bodyStrong,
    fontSize: 18,
  },
  scrollContent: {
    paddingHorizontal: 20,
  },
  stepContainer: {
    flex: 1,
  },
  // Icon container
  iconContainer: {
    alignItems: "center",
    marginVertical: 32,
    width: 80,
    height: 80,
    borderRadius: 40,
    justifyContent: "center",
    alignSelf: "center",
    // bg painted inline from theme.
  },
  // Titles
  stepTitle: {
    fontSize: 24,
    fontWeight: "600",
    textAlign: "center",
    marginBottom: 12,
    // color painted inline from theme.
  },
  stepDescription: {
    fontSize: 14,
    textAlign: "center",
    lineHeight: 20,
    paddingHorizontal: 16,
    // color painted inline from theme.
  },
  // Info box
  infoBox: {
    borderRadius: 12,
    padding: 16,
    marginTop: 24,
    // bg + border painted inline from theme.
  },
  infoTitle: {
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 12,
    // color painted inline from theme.
  },
  infoList: {
    gap: 8,
  },
  infoItem: {
    fontSize: 14,
    lineHeight: 20,
    // color painted inline from theme.
  },
  // Buttons
  primaryButton: {
    backgroundColor: PRIMARY,
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
  },
  primaryButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "600",
  },
  secondaryButton: {
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    // bg + border painted inline from theme.
  },
  secondaryButtonText: {
    color: PRIMARY,
    fontSize: 16,
    fontWeight: "600",
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  linkText: {
    fontSize: 14,
    color: PRIMARY,
    textAlign: "center",
  },
  // Option rows
  optionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 16,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 12,
    // bg + border painted inline from theme.
  },
  optionLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  optionLabel: {
    fontSize: 16,
    // color painted inline from theme.
  },
  // Upload area
  uploadArea: {
    borderWidth: 2,
    borderStyle: "dashed",
    borderRadius: 12,
    padding: 40,
    alignItems: "center",
    justifyContent: "center",
    // bg + border painted inline from theme.
  },
  documentOutline: {
    padding: 24,
  },
  // Tips
  tipsTitle: {
    fontSize: 14,
    fontWeight: "600",
    marginBottom: 8,
    // color painted inline from theme.
  },
  tipsList: {
    gap: 4,
  },
  tipItem: {
    fontSize: 14,
    lineHeight: 20,
    // color painted inline from theme.
  },
  // Photo preview
  photoPreviewContainer: {
    borderRadius: 12,
    overflow: "hidden",
    // bg painted inline from theme.
  },
  photoPreview: {
    width: "100%",
    height: 200,
  },
  // Checklist
  checklistContainer: {
    gap: 12,
  },
  checklistItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  checklistText: {
    fontSize: 14,
    // color painted inline from theme.
  },
  // Success icon
  successIconContainer: {
    alignItems: "center",
    marginTop: 48,
  },
  successIconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: Colors.success,
    alignItems: "center",
    justifyContent: "center",
  },
  // Submitted card
  submittedCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    // bg + border painted inline from theme.
  },
  submittedCardInfo: {
    flex: 1,
  },
  submittedCardTitle: {
    fontSize: 16,
    fontWeight: "500",
    // color painted inline from theme.
  },
  submittedCardStatus: {
    fontSize: 14,
    color: "#F59E0B",
    marginTop: 2,
  },
  submittedCardDate: {
    fontSize: 12,
    marginTop: 2,
    // color painted inline from theme.
  },
  // Verified banner — semantic green palette kept in both modes.
  verifiedBanner: {
    flexDirection: "row",
    backgroundColor: "#D1FAE5",
    borderRadius: 12,
    padding: 16,
    gap: 12,
  },
  verifiedBannerContent: {
    flex: 1,
  },
  verifiedBannerTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: Colors.success,
  },
  verifiedBannerText: {
    fontSize: 14,
    color: "#065F46",
    marginTop: 4,
  },
  // Issue banner — semantic red palette kept in both modes.
  issueBanner: {
    flexDirection: "row",
    backgroundColor: "#FEE2E2",
    borderRadius: 12,
    padding: 16,
    gap: 12,
  },
  issueBannerContent: {
    flex: 1,
  },
  issueBannerTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: "#DC2626",
  },
  issueBannerText: {
    fontSize: 14,
    color: "#991B1B",
    marginTop: 4,
  },
  // Document card
  documentCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    // bg + border painted inline from theme.
  },
  documentThumbnail: {
    width: 56,
    height: 56,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    // bg painted inline from theme.
  },
  documentCardInfo: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  documentCardFilename: {
    fontSize: 14,
    // color painted inline from theme.
  },
});
