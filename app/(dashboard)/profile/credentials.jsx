// app/(dashboard)/profile/credentials.jsx
// Credentials verification screen - multi-step flow with different paths
import { useState, useEffect } from "react";
import {
  StyleSheet,
  View,
  ScrollView,
  Pressable,
  Alert,
  ActivityIndicator,
  TextInput,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as DocumentPicker from "expo-document-picker";

import ThemedView from "../../../components/ThemedView";
import ThemedText from "../../../components/ThemedText";
import Spacer from "../../../components/Spacer";
import { SettingsFormSkeleton } from "../../../components/Skeleton";
import { Colors } from "../../../constants/Colors";
import { TypeVariants } from "../../../constants/Typography";
import { useTheme } from "../../../hooks/useTheme";

import { useUser } from "../../../hooks/useUser";
import { supabase } from "../../../lib/supabase";
import { getMyProfile } from "../../../lib/api/profile";
import {
  getMyVerificationStatus,
  submitCredentialApiLookup,
  submitCredentialManualEntry,
  submitCredentialDocumentUpload,
} from "../../../lib/api/verification";
import ThemedStatusBar from "../../../components/ThemedStatusBar";
import useHideTabBar from "../../../hooks/useHideTabBar";

const PRIMARY = Colors?.primary || "#7C3AED";

// Credential types
const CREDENTIAL_TYPES = {
  popular: [
    { id: "gas_safe", label: "Gas Safe Register", type: "api", icon: "flame-outline" },
    { id: "niceic", label: "NICEIC", type: "manual", icon: "flash-outline" },
    { id: "oftec", label: "OFTEC", type: "manual", icon: "flame-outline" },
    { id: "napit", label: "NAPIT", type: "manual", icon: "flash-outline" },
  ],
  qualifications: [
    { id: "cscs", label: "CSCS Card", type: "manual", icon: "card-outline" },
    { id: "city_guilds", label: "City & Guilds", type: "upload", icon: "school-outline" },
    { id: "nvq", label: "NVQ", type: "upload", icon: "school-outline" },
  ],
  background_checks: [
    { id: "dbs", label: "DBS Certificate", type: "upload", icon: "shield-checkmark-outline" },
    { id: "disclosure_scotland", label: "Disclosure Scotland", type: "upload", icon: "shield-checkmark-outline" },
  ],
  other: [
    { id: "other", label: "Other certification", type: "upload", icon: "document-outline" },
  ],
};

export default function CredentialsScreen() {
  useHideTabBar();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useUser();
  const { colors: c } = useTheme();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [currentStep, setCurrentStep] = useState("intro"); // intro, select, gas_safe, manual_entry, upload, verified
  const [verificationStatus, setVerificationStatus] = useState("not_started");
  const [selectedCredential, setSelectedCredential] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");

  // Form state for different credential types
  const [licenceNumber, setLicenceNumber] = useState("");
  const [registrationNumber, setRegistrationNumber] = useState("");
  const [uploadedFile, setUploadedFile] = useState(null);
  const [customCertName, setCustomCertName] = useState("");

  // Verified credentials list
  const [verifiedCredentials, setVerifiedCredentials] = useState([]);

  // Gas Safe verification result
  const [gasSafeResult, setGasSafeResult] = useState(null);

  useEffect(() => {
    loadVerificationStatus();
  }, []);

  async function loadVerificationStatus() {
    try {
      const verificationData = await getMyVerificationStatus();
      const status = verificationData?.credentials_status || "not_started";
      setVerificationStatus(status);

      // Set initial step based on status
      if (status === "verified") {
        // Fetch verified credentials from submissions table
        try {
          const { data: creds } = await supabase
            .from("credential_submissions")
            .select("credential_type, registration_number, review_status, created_at")
            .eq("profile_id", user.id)
            .eq("review_status", "approved");
          if (creds && creds.length > 0) {
            setVerifiedCredentials(creds.map(c => ({
              type: c.credential_type || "Credential",
              number: c.registration_number || "N/A",
              expiry: null,
            })));
          } else {
            setVerifiedCredentials([]);
          }
        } catch {
          setVerifiedCredentials([]);
        }
        setCurrentStep("verified");
      } else if (status === "under_review" || status === "pending_review") {
        setCurrentStep("submitted");
      } else {
        setCurrentStep("intro");
      }
    } catch (e) {
      console.log("Error loading verification status:", e);
    } finally {
      setLoading(false);
    }
  }

  function handleSelectCredential(credential) {
    setSelectedCredential(credential);

    // Route to appropriate step based on credential type
    if (credential.type === "api") {
      setCurrentStep("gas_safe");
    } else if (credential.type === "manual") {
      setCurrentStep("manual_entry");
    } else {
      setCurrentStep("upload");
    }
  }

  async function handleGasSafeVerify() {
    if (!licenceNumber.trim()) {
      Alert.alert("Required", "Please enter your Gas Safe licence number.");
      return;
    }

    try {
      setSaving(true);

      // Call the API to submit Gas Safe registration for manual review
      const result = await submitCredentialApiLookup({
        credentialType: "gas_safe",
        registrationNumber: licenceNumber.trim(),
      });

      console.log("Gas Safe submission result:", result);

      // All Gas Safe submissions now go to manual review
      setCurrentStep("submitted");
    } catch (e) {
      console.log("Gas Safe submission error:", e);
      Alert.alert("Error", e.message || "Failed to submit. Please check your licence number.");
    } finally {
      setSaving(false);
    }
  }

  async function handleManualSubmit() {
    if (!registrationNumber.trim()) {
      Alert.alert("Required", "Please enter your registration number.");
      return;
    }

    try {
      setSaving(true);

      // Submit credential for manual verification
      const result = await submitCredentialManualEntry({
        credentialType: selectedCredential?.id || "niceic",
        registrationNumber: registrationNumber.trim(),
      });

      console.log("Manual credential submission result:", result);
      setCurrentStep("submitted");
    } catch (e) {
      console.log("Manual credential submission error:", e);
      Alert.alert("Error", e.message || "Failed to submit. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  async function handleUploadFile() {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ["application/pdf", "image/jpeg", "image/png"],
        copyToCacheDirectory: true,
      });

      if (!result.canceled && result.assets[0]) {
        setUploadedFile({
          name: result.assets[0].name,
          uri: result.assets[0].uri,
          size: (result.assets[0].size / 1024 / 1024).toFixed(1),
        });
      }
    } catch (e) {
      Alert.alert("Error", "Failed to select file.");
    }
  }

  async function handleUploadSubmit() {
    if (!uploadedFile) {
      Alert.alert("Required", "Please upload your certificate.");
      return;
    }

    // For "other" credential type, require custom name
    if (selectedCredential?.id === "other" && !customCertName.trim()) {
      Alert.alert("Required", "Please enter the certificate name.");
      return;
    }

    try {
      setSaving(true);

      // Submit credential with document upload
      const result = await submitCredentialDocumentUpload({
        credentialType: selectedCredential?.id || "other",
        file: {
          uri: uploadedFile.uri,
          mimeType: uploadedFile.name?.endsWith(".pdf") ? "application/pdf" : "image/jpeg",
        },
        customCredentialName: selectedCredential?.id === "other" ? customCertName.trim() : null,
      });

      console.log("Document credential submission result:", result);
      setCurrentStep("submitted");
    } catch (e) {
      console.log("Document credential submission error:", e);
      Alert.alert("Error", e.message || "Failed to submit. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  function handleAddAnother() {
    setSelectedCredential(null);
    setLicenceNumber("");
    setRegistrationNumber("");
    setUploadedFile(null);
    setGasSafeResult(null);
    setCustomCertName("");
    setCurrentStep("select");
  }

  function handleSkip() {
    router.back();
  }

  // Handle back navigation based on current step
  function handleBack() {
    switch (currentStep) {
      case "intro":
      case "submitted":
      case "verified":
      case "gas_safe_verified":
        // These are entry/exit points - go back to settings
        router.back();
        break;
      case "select":
        // Go back to intro
        setCurrentStep("intro");
        break;
      case "gas_safe":
      case "manual_entry":
      case "upload":
        // Go back to select, clear form state
        setSelectedCredential(null);
        setLicenceNumber("");
        setRegistrationNumber("");
        setUploadedFile(null);
        setCustomCertName("");
        setCurrentStep("select");
        break;
      default:
        router.back();
    }
  }

  // Filter credentials based on search
  function getFilteredCredentials() {
    const query = searchQuery.toLowerCase().trim();
    if (!query) return CREDENTIAL_TYPES;

    const filtered = {};
    Object.entries(CREDENTIAL_TYPES).forEach(([category, credentials]) => {
      const matches = credentials.filter(c =>
        c.label.toLowerCase().includes(query)
      );
      if (matches.length > 0) {
        filtered[category] = matches;
      }
    });
    return filtered;
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
        <ThemedText style={[styles.headerTitle, { color: c.text }]}>
          {currentStep === "gas_safe" ? "Gas Safe Register" :
            currentStep === "manual_entry" ? selectedCredential?.label :
              currentStep === "upload" && selectedCredential?.id === "dbs" ? "DBS Certificate" :
                "Credentials"}
        </ThemedText>
        <View style={{ width: 24 }} />
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
        {/* Step: Introduction */}
        {currentStep === "intro" && (
          <IntroStep
            onAddCredential={() => setCurrentStep("select")}
            onSkip={handleSkip}
          />
        )}

        {/* Step: Select Credential Type */}
        {currentStep === "select" && (
          <SelectTypeStep
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            filteredCredentials={getFilteredCredentials()}
            onSelect={handleSelectCredential}
          />
        )}

        {/* Step: Gas Safe API Verification */}
        {currentStep === "gas_safe" && (
          <GasSafeStep
            licenceNumber={licenceNumber}
            onLicenceNumberChange={setLicenceNumber}
            onVerify={handleGasSafeVerify}
            saving={saving}
          />
        )}

        {/* Step: Gas Safe Verified */}
        {currentStep === "gas_safe_verified" && (
          <GasSafeVerifiedStep
            result={gasSafeResult}
            onAddAnother={handleAddAnother}
            onDone={() => router.back()}
          />
        )}

        {/* Step: Manual Entry (NICEIC, NAPIT, etc.) */}
        {currentStep === "manual_entry" && (
          <ManualEntryStep
            credential={selectedCredential}
            registrationNumber={registrationNumber}
            onRegistrationNumberChange={setRegistrationNumber}
            onSubmit={handleManualSubmit}
            saving={saving}
          />
        )}

        {/* Step: Upload Document (DBS, City & Guilds, etc.) */}
        {currentStep === "upload" && (
          <UploadStep
            credential={selectedCredential}
            uploadedFile={uploadedFile}
            onUploadFile={handleUploadFile}
            onSubmit={handleUploadSubmit}
            saving={saving}
            customCertName={customCertName}
            onCustomCertNameChange={setCustomCertName}
          />
        )}

        {/* Step: Submitted */}
        {currentStep === "submitted" && (
          <SubmittedStep
            onAddAnother={handleAddAnother}
            onBackToSettings={() => router.back()}
          />
        )}

        {/* Step: Verified */}
        {currentStep === "verified" && (
          <VerifiedStep
            credentials={verifiedCredentials}
            onAddAnother={handleAddAnother}
            onDone={() => router.back()}
          />
        )}

        <Spacer height={insets.bottom > 0 ? insets.bottom + 24 : 40} />
      </ScrollView>
      </KeyboardAvoidingView>
    </ThemedView>
  );
}

// Introduction Step
function IntroStep({ onAddCredential, onSkip }) {
  const { colors: c } = useTheme();
  return (
    <View style={styles.stepContainer}>
      <View style={[styles.iconContainer, { backgroundColor: c.elevate }]}>
        <Ionicons name="ribbon-outline" size={48} color={c.text} />
      </View>

      <ThemedText style={[styles.stepTitle, { color: c.text }]}>Professional Qualifications</ThemedText>

      <ThemedText style={[styles.stepDescription, { color: c.textMuted }]}>
        Add your certifications to stand out to prospects.
      </ThemedText>

      <View style={[styles.infoBox, { backgroundColor: c.elevate, borderColor: c.border, borderWidth: 1 }]}>
        <ThemedText style={[styles.infoTitle, { color: c.text }]}>Examples:</ThemedText>
        <View style={styles.infoList}>
          <ThemedText style={[styles.infoItem, { color: c.textMid }]}>{"•"} Gas Safe registration</ThemedText>
          <ThemedText style={[styles.infoItem, { color: c.textMid }]}>{"•"} NICEIC certification</ThemedText>
          <ThemedText style={[styles.infoItem, { color: c.textMid }]}>{"•"} City & Guilds</ThemedText>
          <ThemedText style={[styles.infoItem, { color: c.textMid }]}>{"•"} NVQ qualifications</ThemedText>
          <ThemedText style={[styles.infoItem, { color: c.textMid }]}>{"•"} OFTEC registration</ThemedText>
        </View>
      </View>

      <Spacer height={32} />

      <Pressable style={styles.primaryButton} onPress={onAddCredential}>
        <ThemedText style={styles.primaryButtonText}>Add credential</ThemedText>
      </Pressable>
    </View>
  );
}

// Select Credential Type Step
function SelectTypeStep({ searchQuery, onSearchChange, filteredCredentials, onSelect }) {
  const { colors: c } = useTheme();
  const categoryLabels = {
    popular: "POPULAR",
    qualifications: "QUALIFICATIONS",
    background_checks: "BACKGROUND CHECKS",
    other: "OTHER",
  };

  return (
    <View style={styles.stepContainer}>
      <ThemedText style={[styles.stepTitle, { color: c.text }]}>Select credential type</ThemedText>

      <Spacer height={16} />

      {/* Search input */}
      <View style={[styles.searchContainer, { backgroundColor: c.elevate, borderColor: c.border }]}>
        <Ionicons name="search" size={20} color={c.textMuted} />
        <TextInput
          style={[styles.searchInput, { color: c.text }]}
          placeholder="Search credentials..."
          placeholderTextColor={c.textMuted}
          value={searchQuery}
          onChangeText={onSearchChange}
        />
      </View>

      <Spacer height={16} />

      {/* Credential categories */}
      {Object.entries(filteredCredentials).map(([category, credentials]) => (
        <View key={category}>
          <ThemedText style={[styles.categoryLabel, { color: c.textMuted }]}>
            {categoryLabels[category] || category.toUpperCase()}
          </ThemedText>

          {credentials.map((credential) => (
            <Pressable
              key={credential.id}
              style={({ pressed }) => [
                styles.optionRow,
                { backgroundColor: c.elevate, borderColor: c.border },
                pressed && { backgroundColor: c.elevate2 },
              ]}
              onPress={() => onSelect(credential)}
            >
              <View style={styles.optionLeft}>
                <Ionicons name={credential.icon} size={24} color={c.text} />
                <ThemedText style={[styles.optionLabel, { color: c.text }]}>{credential.label}</ThemedText>
              </View>
              <Ionicons name="chevron-forward" size={20} color={c.textMuted} />
            </Pressable>
          ))}

          <Spacer height={16} />
        </View>
      ))}
    </View>
  );
}

// Gas Safe Verification Step
function GasSafeStep({ licenceNumber, onLicenceNumberChange, onVerify, saving }) {
  const { colors: c } = useTheme();
  return (
    <View style={styles.stepContainer}>
      <View style={[styles.iconContainer, { backgroundColor: c.elevate }]}>
        <Ionicons name="flame-outline" size={48} color={c.text} />
      </View>

      <ThemedText style={[styles.stepTitle, { color: c.text }]}>Enter your Gas Safe number</ThemedText>

      <ThemedText style={[styles.stepDescription, { color: c.textMuted }]}>
        We'll verify your registration on the Gas Safe Register and notify you within 1-2 business days.
      </ThemedText>

      <Spacer height={24} />

      <ThemedText style={[styles.inputLabel, { color: c.textMuted }]}>Gas Safe licence number</ThemedText>
      <TextInput
        style={[styles.textInput, { backgroundColor: c.elevate, borderColor: c.border, color: c.text }]}
        placeholder="e.g. 123456"
        placeholderTextColor={c.textMuted}
        value={licenceNumber}
        onChangeText={onLicenceNumberChange}
        keyboardType="number-pad"
      />

      <Spacer height={16} />

      <View style={[styles.infoBox, { backgroundColor: c.elevate, borderColor: c.border, borderWidth: 1 }]}>
        <View style={styles.infoBoxRow}>
          <Ionicons name="information-circle" size={20} color={c.textMuted} />
          <ThemedText style={[styles.infoBoxText, { color: c.textMuted }]}>
            Your Gas Safe number is on your ID card and all official correspondence.
          </ThemedText>
        </View>
      </View>

      <Spacer height={32} />

      <Pressable
        style={[styles.primaryButton, saving && styles.buttonDisabled]}
        onPress={onVerify}
        disabled={saving}
      >
        {saving ? (
          <ActivityIndicator color="#FFFFFF" />
        ) : (
          <ThemedText style={styles.primaryButtonText}>Submit for review</ThemedText>
        )}
      </Pressable>
    </View>
  );
}

// Gas Safe Verified Step
function GasSafeVerifiedStep({ result, onAddAnother, onDone }) {
  const { colors: c } = useTheme();
  return (
    <View style={styles.stepContainer}>
      <View style={styles.successIconContainer}>
        <View style={styles.successIconCircle}>
          <Ionicons name="checkmark" size={32} color="#FFFFFF" />
        </View>
      </View>

      <Spacer height={24} />

      <ThemedText style={[styles.stepTitle, { color: Colors.success }]}>Verified!</ThemedText>

      <Spacer height={24} />

      <View style={styles.verifiedResultCard}>
        <ThemedText style={styles.verifiedResultTitle}>Gas Safe Register</ThemedText>
        <Spacer height={12} />
        <ThemedText style={styles.verifiedResultRow}>
          <ThemedText style={styles.verifiedResultLabel}>Licence: </ThemedText>
          {result?.licence}
        </ThemedText>
        <ThemedText style={styles.verifiedResultRow}>
          <ThemedText style={styles.verifiedResultLabel}>Name: </ThemedText>
          {result?.name}
        </ThemedText>
        <ThemedText style={styles.verifiedResultRow}>
          <ThemedText style={styles.verifiedResultLabel}>Expiry: </ThemedText>
          {result?.expiry}
        </ThemedText>

        {result?.qualifications && (
          <>
            <Spacer height={12} />
            <ThemedText style={styles.verifiedResultLabel}>Qualified for:</ThemedText>
            {result.qualifications.map((q, idx) => (
              <ThemedText key={idx} style={styles.qualificationItem}>
                {"•"} {q}
              </ThemedText>
            ))}
          </>
        )}
      </View>

      <Spacer height={32} />

      <Pressable style={[styles.secondaryButton, { backgroundColor: c.elevate, borderColor: c.border }]} onPress={onAddAnother}>
        <ThemedText style={styles.secondaryButtonText}>Add another</ThemedText>
      </Pressable>

      <Spacer height={12} />

      <Pressable style={styles.primaryButton} onPress={onDone}>
        <ThemedText style={styles.primaryButtonText}>Done</ThemedText>
      </Pressable>
    </View>
  );
}

// Manual Entry Step (NICEIC, NAPIT, etc.)
function ManualEntryStep({ credential, registrationNumber, onRegistrationNumberChange, onSubmit, saving }) {
  const { colors: c } = useTheme();
  return (
    <View style={styles.stepContainer}>
      <View style={[styles.iconContainer, { backgroundColor: c.elevate }]}>
        <Ionicons name={credential?.icon || "flash-outline"} size={48} color={c.text} />
      </View>

      <ThemedText style={[styles.stepTitle, { color: c.text }]}>Enter your registration number</ThemedText>

      <ThemedText style={[styles.stepDescription, { color: c.textMuted }]}>
        We'll verify this with {credential?.label} and notify you once confirmed.
      </ThemedText>

      <Spacer height={24} />

      <ThemedText style={[styles.inputLabel, { color: c.textMuted }]}>{credential?.label} registration number</ThemedText>
      <TextInput
        style={[styles.textInput, { backgroundColor: c.elevate, borderColor: c.border, color: c.text }]}
        placeholder="Enter registration number"
        placeholderTextColor={c.textMuted}
        value={registrationNumber}
        onChangeText={onRegistrationNumberChange}
      />

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
    </View>
  );
}

// Upload Document Step
function UploadStep({ credential, uploadedFile, onUploadFile, onSubmit, saving, customCertName, onCustomCertNameChange }) {
  const { colors: c } = useTheme();
  const isDBS = credential?.id === "dbs" || credential?.id === "disclosure_scotland";
  const isOther = credential?.id === "other";

  // For "other" certification, require both name and file
  const canSubmit = isOther
    ? uploadedFile && customCertName.trim().length > 0
    : uploadedFile;

  return (
    <View style={styles.stepContainer}>
      {isOther && (
        <View style={[styles.iconContainer, { backgroundColor: c.elevate }]}>
          <Ionicons name="document-outline" size={48} color={c.text} />
        </View>
      )}

      <ThemedText style={[styles.stepTitle, { color: c.text }]}>
        {isDBS ? "Background check" : isOther ? "Add certification" : `Upload your ${credential?.label}`}
      </ThemedText>

      {isDBS && (
        <ThemedText style={[styles.stepDescription, { color: c.textMuted }]}>
          Upload your DBS certificate or Disclosure Scotland.
        </ThemedText>
      )}

      {isOther && (
        <ThemedText style={[styles.stepDescription, { color: c.textMuted }]}>
          Upload any professional certification or qualification.
        </ThemedText>
      )}

      <Spacer height={24} />

      {/* Certificate name field for "other" */}
      {isOther && (
        <>
          <TextInput
            style={[styles.textInput, { backgroundColor: c.elevate, borderColor: c.border, color: c.text }]}
            placeholder="Certificate name"
            placeholderTextColor={c.textMuted}
            value={customCertName}
            onChangeText={onCustomCertNameChange}
          />
          <Spacer height={16} />
        </>
      )}

      {/* Upload area */}
      {uploadedFile ? (
        <View style={[styles.uploadedFileCard, { backgroundColor: c.elevate, borderColor: c.border }]}>
          <Ionicons name="checkmark-circle" size={24} color={Colors.success} />
          <View style={styles.uploadedFileInfo}>
            <ThemedText style={[styles.uploadedFileName, { color: c.text }]}>{uploadedFile.name}</ThemedText>
            <ThemedText style={[styles.uploadedFileSize, { color: c.textMuted }]}>{uploadedFile.size} MB</ThemedText>
          </View>
          <Pressable onPress={onUploadFile}>
            <ThemedText style={styles.linkText}>Change</ThemedText>
          </Pressable>
        </View>
      ) : (
        <Pressable style={[styles.uploadArea, { backgroundColor: c.elevate, borderColor: c.border }]} onPress={onUploadFile}>
          <Ionicons name="cloud-upload-outline" size={48} color={c.textMuted} />
          <ThemedText style={[styles.uploadAreaText, { color: c.textMuted }]}>Tap to upload</ThemedText>
        </Pressable>
      )}

      <Spacer height={24} />

      {isDBS && (
        <>
          <ThemedText style={[styles.tipsTitle, { color: c.text }]}>Requirements:</ThemedText>
          <View style={styles.tipsList}>
            <ThemedText style={[styles.tipItem, { color: c.textMuted }]}>{"•"} Basic DBS or Basic Disclosure</ThemedText>
            <ThemedText style={[styles.tipItem, { color: c.textMuted }]}>{"•"} Must be dated within 3 years</ThemedText>
            <ThemedText style={[styles.tipItem, { color: c.textMuted }]}>{"•"} Name must match your account</ThemedText>
          </View>

          <Spacer height={16} />

          <ThemedText style={[styles.helpText, { color: c.textMuted }]}>Don't have one?</ThemedText>
          <Pressable>
            <ThemedText style={styles.linkText}>Get a DBS check online →</ThemedText>
          </Pressable>
        </>
      )}

      <Spacer height={32} />

      <Pressable
        style={[styles.primaryButton, (!canSubmit || saving) && styles.buttonDisabled]}
        onPress={onSubmit}
        disabled={!canSubmit || saving}
      >
        {saving ? (
          <ActivityIndicator color="#FFFFFF" />
        ) : (
          <ThemedText style={styles.primaryButtonText}>Submit</ThemedText>
        )}
      </Pressable>
    </View>
  );
}

// Submitted Step
function SubmittedStep({ onAddAnother, onBackToSettings }) {
  const { colors: c } = useTheme();
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
        We'll review your credential and notify you within 1-2 business days.
      </ThemedText>

      <Spacer height={32} />

      <Pressable style={[styles.secondaryButton, { backgroundColor: c.elevate, borderColor: c.border }]} onPress={onAddAnother}>
        <ThemedText style={styles.secondaryButtonText}>Add another credential</ThemedText>
      </Pressable>

      <Spacer height={12} />

      <Pressable style={styles.primaryButton} onPress={onBackToSettings}>
        <ThemedText style={styles.primaryButtonText}>Back to Settings</ThemedText>
      </Pressable>
    </View>
  );
}

// Verified Step (shows list of verified credentials)
function VerifiedStep({ credentials, onAddAnother, onDone }) {
  const { colors: c } = useTheme();
  return (
    <View style={styles.stepContainer}>
      <View style={styles.verifiedBanner}>
        <Ionicons name="checkmark-circle" size={20} color={Colors.success} />
        <View style={styles.verifiedBannerContent}>
          <ThemedText style={styles.verifiedBannerTitle}>
            {credentials.length} credential{credentials.length !== 1 ? "s" : ""} verified
          </ThemedText>
        </View>
      </View>

      <Spacer height={24} />

      {credentials.map((cred, idx) => (
        <View key={idx} style={[styles.credentialCard, { backgroundColor: c.elevate, borderColor: c.border }]}>
          <Ionicons name="ribbon" size={24} color={PRIMARY} />
          <View style={styles.credentialCardInfo}>
            <ThemedText style={[styles.credentialCardTitle, { color: c.text }]}>{cred.type}</ThemedText>
            <ThemedText style={[styles.credentialCardDetail, { color: c.textMuted }]}>
              {cred.number} • Expires {cred.expiry}
            </ThemedText>
          </View>
          <Ionicons name="checkmark-circle" size={20} color={Colors.success} />
        </View>
      ))}

      <Spacer height={32} />

      <Pressable style={[styles.secondaryButton, { backgroundColor: c.elevate, borderColor: c.border }]} onPress={onAddAnother}>
        <ThemedText style={styles.secondaryButtonText}>Add another</ThemedText>
      </Pressable>

      <Spacer height={12} />

      <Pressable style={styles.primaryButton} onPress={onDone}>
        <ThemedText style={styles.primaryButtonText}>Done</ThemedText>
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
  infoBoxRow: {
    flexDirection: "row",
    gap: 12,
  },
  infoBoxText: {
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
    // color painted inline from theme.
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
  // Search
  searchContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    // bg + border painted inline from theme.
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    // color painted inline from theme.
  },
  // Category labels
  categoryLabel: {
    fontSize: 12,
    fontWeight: "600",
    letterSpacing: 0.5,
    marginBottom: 8,
    marginTop: 8,
    // color painted inline from theme.
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
    marginBottom: 8,
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
  // Form inputs
  inputLabel: {
    fontSize: 14,
    marginBottom: 8,
    // color painted inline from theme.
  },
  textInput: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    // bg + border + text color painted inline from theme.
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
  uploadAreaText: {
    fontSize: 14,
    marginTop: 8,
    // color painted inline from theme.
  },
  // Uploaded file card
  uploadedFileCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    // bg + border painted inline from theme.
  },
  uploadedFileInfo: {
    flex: 1,
  },
  uploadedFileName: {
    fontSize: 14,
    fontWeight: "500",
    // color painted inline from theme.
  },
  uploadedFileSize: {
    fontSize: 12,
    marginTop: 2,
    // color painted inline from theme.
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
  helpText: {
    fontSize: 14,
    marginBottom: 4,
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
  // Verified result card — semantic green palette kept in both modes.
  verifiedResultCard: {
    backgroundColor: "#D1FAE5",
    borderWidth: 1,
    borderColor: Colors.success,
    borderRadius: 12,
    padding: 16,
  },
  verifiedResultTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#065F46",
  },
  verifiedResultRow: {
    fontSize: 14,
    color: "#065F46",
    marginTop: 4,
  },
  verifiedResultLabel: {
    fontWeight: "500",
    color: "#065F46",
  },
  qualificationItem: {
    fontSize: 14,
    color: "#065F46",
    marginTop: 4,
    marginLeft: 8,
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
  // Credential card
  credentialCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 12,
    // bg + border painted inline from theme.
  },
  credentialCardInfo: {
    flex: 1,
  },
  credentialCardTitle: {
    fontSize: 16,
    fontWeight: "500",
    // color painted inline from theme.
  },
  credentialCardDetail: {
    fontSize: 13,
    marginTop: 2,
    // color painted inline from theme.
  },
});
