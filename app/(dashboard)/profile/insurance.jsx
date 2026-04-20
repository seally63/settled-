// app/(dashboard)/profile/insurance.jsx
// Insurance verification screen - multi-step flow
import { useState, useEffect } from "react";
import {
  StyleSheet,
  View,
  ScrollView,
  Pressable,
  Alert,
  ActivityIndicator,
  TextInput,
  Image,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import * as DocumentPicker from "expo-document-picker";

import ThemedView from "../../../components/ThemedView";
import ThemedText from "../../../components/ThemedText";
import Spacer from "../../../components/Spacer";
import { SettingsFormSkeleton } from "../../../components/Skeleton";
import { Colors } from "../../../constants/Colors";

import { useUser } from "../../../hooks/useUser";
import { supabase } from "../../../lib/supabase";
import { getMyProfile } from "../../../lib/api/profile";
import {
  getMyVerificationStatus,
  submitInsurance,
  coverageToPence,
  formatCoverage,
} from "../../../lib/api/verification";
import ThemedStatusBar from "../../../components/ThemedStatusBar";
import useHideTabBar from "../../../hooks/useHideTabBar";

const PRIMARY = Colors?.primary || "#7C3AED";

// Coverage amount options
const COVERAGE_OPTIONS = [
  { value: "1000000", label: "£1,000,000" },
  { value: "2000000", label: "£2,000,000" },
  { value: "5000000", label: "£5,000,000" },
  { value: "10000000", label: "£10,000,000" },
];

export default function InsuranceScreen() {
  useHideTabBar();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useUser();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [currentStep, setCurrentStep] = useState("intro"); // intro, upload, details, submitted, verified, expiring, expired
  const [verificationStatus, setVerificationStatus] = useState("not_started");

  // Form state
  const [uploadedFile, setUploadedFile] = useState(null);
  const [hasEmployees, setHasEmployees] = useState(false);
  const [eliFile, setEliFile] = useState(null);
  const [provider, setProvider] = useState("");
  const [policyNumber, setPolicyNumber] = useState("");
  const [coverageAmount, setCoverageAmount] = useState("2000000");
  const [expiryDay, setExpiryDay] = useState("");
  const [expiryMonth, setExpiryMonth] = useState("");
  const [expiryYear, setExpiryYear] = useState("");
  const [showCoverageDropdown, setShowCoverageDropdown] = useState(false);

  // Verification data (if already verified)
  const [insuranceData, setInsuranceData] = useState(null);

  useEffect(() => {
    loadVerificationStatus();
  }, []);

  async function loadVerificationStatus() {
    try {
      const verificationData = await getMyVerificationStatus();
      const status = verificationData?.insurance_status || "not_started";
      const expiresAt = verificationData?.insurance_expires_at;
      setVerificationStatus(status);

      // Calculate days until expiry if we have an expiry date
      let daysLeft = null;
      if (expiresAt) {
        const expiryDate = new Date(expiresAt);
        const today = new Date();
        daysLeft = Math.ceil((expiryDate - today) / (1000 * 60 * 60 * 24));
      }

      // Set initial step based on status
      if (status === "verified") {
        setCurrentStep("verified");
        // Fetch real coverage from submission data
        let coverageDisplay = "N/A";
        try {
          const { data: sub } = await supabase
            .from("insurance_submissions")
            .select("coverage_amount_pence")
            .eq("profile_id", user.id)
            .eq("review_status", "approved")
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();
          if (sub?.coverage_amount_pence) {
            coverageDisplay = `£${(sub.coverage_amount_pence / 100).toLocaleString()}`;
          }
        } catch { /* fall back to N/A */ }

        setInsuranceData({
          coverage: coverageDisplay,
          expiry: expiresAt ? new Date(expiresAt).toLocaleDateString("en-GB", {
            day: "numeric",
            month: "short",
            year: "numeric"
          }) : "N/A",
        });
      } else if (status === "under_review" || status === "pending_review") {
        setCurrentStep("submitted");
      } else if (status === "expiring_soon") {
        setCurrentStep("expiring");
        setInsuranceData({
          coverage: "£2,000,000",
          expiry: expiresAt ? new Date(expiresAt).toLocaleDateString("en-GB", {
            day: "numeric",
            month: "short",
            year: "numeric"
          }) : "N/A",
          daysLeft: daysLeft || 14,
        });
      } else if (status === "expired") {
        setCurrentStep("expired");
      } else {
        setCurrentStep("intro");
      }
    } catch (e) {
      console.log("Error loading verification status:", e);
    } finally {
      setLoading(false);
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

  async function handleUploadELI() {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ["application/pdf", "image/jpeg", "image/png"],
        copyToCacheDirectory: true,
      });

      if (!result.canceled && result.assets[0]) {
        setEliFile({
          name: result.assets[0].name,
          uri: result.assets[0].uri,
          size: (result.assets[0].size / 1024 / 1024).toFixed(1),
        });
      }
    } catch (e) {
      Alert.alert("Error", "Failed to select file.");
    }
  }

  function handleContinueToDetails() {
    if (!uploadedFile) {
      Alert.alert("Required", "Please upload your insurance certificate.");
      return;
    }
    if (hasEmployees && !eliFile) {
      Alert.alert("Required", "Please upload your Employer's Liability Insurance certificate.");
      return;
    }
    setCurrentStep("details");
  }

  async function handleSubmit() {
    // Validate form
    if (!provider.trim()) {
      Alert.alert("Required", "Please enter your insurance provider.");
      return;
    }
    if (!policyNumber.trim()) {
      Alert.alert("Required", "Please enter your policy number.");
      return;
    }
    if (!expiryDay || !expiryMonth || !expiryYear) {
      Alert.alert("Required", "Please enter the expiry date.");
      return;
    }

    // Validate expiry date format
    const day = parseInt(expiryDay, 10);
    const month = parseInt(expiryMonth, 10);
    const year = parseInt(expiryYear, 10);
    if (isNaN(day) || isNaN(month) || isNaN(year) || day < 1 || day > 31 || month < 1 || month > 12 || year < 2024) {
      Alert.alert("Invalid Date", "Please enter a valid expiry date.");
      return;
    }

    // Format expiry date as YYYY-MM-DD
    const policyExpiryDate = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

    try {
      setSaving(true);

      // Submit insurance using the verification API
      const result = await submitInsurance({
        policyProvider: provider.trim(),
        policyNumber: policyNumber.trim(),
        coverageAmountPence: coverageToPence(coverageAmount),
        policyExpiryDate,
        pliFile: {
          uri: uploadedFile.uri,
          mimeType: uploadedFile.name?.endsWith(".pdf") ? "application/pdf" : "image/jpeg",
        },
        hasEmployees,
        eliFile: hasEmployees && eliFile ? {
          uri: eliFile.uri,
          mimeType: eliFile.name?.endsWith(".pdf") ? "application/pdf" : "image/jpeg",
        } : null,
        eliCoverageAmountPence: hasEmployees ? 500000000 : null, // Default £5M for ELI
        eliExpiryDate: hasEmployees ? policyExpiryDate : null, // Same expiry as PLI
      });

      console.log("Insurance submission result:", result);
      setCurrentStep("submitted");
    } catch (e) {
      console.log("Insurance submission error:", e);
      Alert.alert("Error", e.message || "Failed to submit. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  // Handle back navigation based on current step
  function handleBack() {
    switch (currentStep) {
      case "intro":
      case "submitted":
      case "verified":
      case "expiring":
      case "expired":
        // These are entry/exit points - go back to settings
        router.back();
        break;
      case "upload":
        // Go back to intro
        setCurrentStep("intro");
        break;
      case "details":
        // Go back to upload
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
          <Ionicons name="chevron-back" size={24} color={Colors.light.title} />
        </Pressable>
        <ThemedText style={styles.headerTitle}>Insurance</ThemedText>
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
          <IntroStep onContinue={() => setCurrentStep("upload")} />
        )}

        {/* Step: Upload Certificate */}
        {currentStep === "upload" && (
          <UploadStep
            uploadedFile={uploadedFile}
            hasEmployees={hasEmployees}
            eliFile={eliFile}
            onUploadFile={handleUploadFile}
            onUploadELI={handleUploadELI}
            onHasEmployeesChange={setHasEmployees}
            onContinue={handleContinueToDetails}
          />
        )}

        {/* Step: Policy Details */}
        {currentStep === "details" && (
          <DetailsStep
            uploadedFile={uploadedFile}
            provider={provider}
            policyNumber={policyNumber}
            coverageAmount={coverageAmount}
            expiryDay={expiryDay}
            expiryMonth={expiryMonth}
            expiryYear={expiryYear}
            showCoverageDropdown={showCoverageDropdown}
            onProviderChange={setProvider}
            onPolicyNumberChange={setPolicyNumber}
            onCoverageAmountChange={setCoverageAmount}
            onExpiryDayChange={setExpiryDay}
            onExpiryMonthChange={setExpiryMonth}
            onExpiryYearChange={setExpiryYear}
            onShowCoverageDropdown={setShowCoverageDropdown}
            onChangeFile={() => setCurrentStep("upload")}
            onSubmit={handleSubmit}
            saving={saving}
          />
        )}

        {/* Step: Submitted */}
        {currentStep === "submitted" && (
          <SubmittedStep onBackToSettings={() => router.back()} />
        )}

        {/* Step: Verified */}
        {currentStep === "verified" && (
          <VerifiedStep
            insuranceData={insuranceData}
            onDone={() => router.back()}
            onChangeDocument={() => setCurrentStep("upload")}
          />
        )}

        {/* Step: Expiring Soon */}
        {currentStep === "expiring" && (
          <ExpiringStep
            insuranceData={insuranceData}
            onUploadNew={handleUploadFile}
            uploadedFile={uploadedFile}
            onSubmit={() => setCurrentStep("details")}
          />
        )}

        {/* Step: Expired */}
        {currentStep === "expired" && (
          <ExpiredStep onUploadNew={() => setCurrentStep("upload")} />
        )}

        <Spacer height={insets.bottom > 0 ? insets.bottom + 24 : 40} />
      </ScrollView>
      </KeyboardAvoidingView>
    </ThemedView>
  );
}

// Introduction Step
function IntroStep({ onContinue }) {
  return (
    <View style={styles.stepContainer}>
      <View style={styles.iconContainer}>
        <Ionicons name="shield-outline" size={48} color={Colors.light.title} />
      </View>

      <ThemedText style={styles.stepTitle}>Public Liability Insurance</ThemedText>

      <ThemedText style={styles.stepDescription}>
        All tradespeople on Settled must have valid public liability insurance.
      </ThemedText>

      <View style={styles.infoBox}>
        <ThemedText style={styles.infoTitle}>Minimum requirements:</ThemedText>
        <View style={styles.infoList}>
          <ThemedText style={styles.infoItem}>
            {"\u2022"} £1,000,000 coverage (£2,000,000 recommended)
          </ThemedText>
          <ThemedText style={styles.infoItem}>
            {"\u2022"} Valid and in-date
          </ThemedText>
          <ThemedText style={styles.infoItem}>
            {"\u2022"} Your name or business name on the certificate
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

// Upload Step
function UploadStep({
  uploadedFile,
  hasEmployees,
  eliFile,
  onUploadFile,
  onUploadELI,
  onHasEmployeesChange,
  onContinue,
}) {
  return (
    <View style={styles.stepContainer}>
      <ThemedText style={styles.stepTitle}>Upload your insurance certificate</ThemedText>

      <Spacer height={24} />

      {/* Upload area */}
      {uploadedFile ? (
        <View style={styles.uploadedFileCard}>
          <Ionicons name="checkmark-circle" size={24} color={Colors.success} />
          <View style={styles.uploadedFileInfo}>
            <ThemedText style={styles.uploadedFileName}>{uploadedFile.name}</ThemedText>
            <ThemedText style={styles.uploadedFileSize}>{uploadedFile.size} MB</ThemedText>
          </View>
          <Pressable onPress={onUploadFile}>
            <ThemedText style={styles.linkText}>Change</ThemedText>
          </Pressable>
        </View>
      ) : (
        <Pressable style={styles.uploadArea} onPress={onUploadFile}>
          <Ionicons name="cloud-upload-outline" size={48} color="#D1D5DB" />
          <ThemedText style={styles.uploadAreaText}>Tap to upload</ThemedText>
        </Pressable>
      )}

      <ThemedText style={styles.acceptedFormats}>
        Accepted formats: PDF, JPG, PNG (max 10MB)
      </ThemedText>

      <Spacer height={24} />

      {/* Employees question */}
      <ThemedText style={styles.questionTitle}>Do you have employees?</ThemedText>

      <Spacer height={12} />

      <Pressable
        style={[styles.radioOption, !hasEmployees && styles.radioOptionSelected]}
        onPress={() => onHasEmployeesChange(false)}
      >
        <View style={[styles.radioCircle, !hasEmployees && styles.radioCircleSelected]}>
          {!hasEmployees && <View style={styles.radioCircleInner} />}
        </View>
        <ThemedText style={styles.radioLabel}>No, it's just me</ThemedText>
      </Pressable>

      <Pressable
        style={[styles.radioOption, hasEmployees && styles.radioOptionSelected]}
        onPress={() => onHasEmployeesChange(true)}
      >
        <View style={[styles.radioCircle, hasEmployees && styles.radioCircleSelected]}>
          {hasEmployees && <View style={styles.radioCircleInner} />}
        </View>
        <ThemedText style={styles.radioLabel}>Yes, I have employees</ThemedText>
      </Pressable>

      {/* ELI Upload if has employees */}
      {hasEmployees && (
        <>
          <Spacer height={24} />
          <ThemedText style={styles.questionTitle}>
            Employer's Liability Insurance
          </ThemedText>
          <ThemedText style={styles.questionSubtitle}>
            Required if you have employees (minimum £5,000,000)
          </ThemedText>

          <Spacer height={12} />

          {eliFile ? (
            <View style={styles.uploadedFileCard}>
              <Ionicons name="checkmark-circle" size={24} color={Colors.success} />
              <View style={styles.uploadedFileInfo}>
                <ThemedText style={styles.uploadedFileName}>{eliFile.name}</ThemedText>
                <ThemedText style={styles.uploadedFileSize}>{eliFile.size} MB</ThemedText>
              </View>
              <Pressable onPress={onUploadELI}>
                <ThemedText style={styles.linkText}>Change</ThemedText>
              </Pressable>
            </View>
          ) : (
            <Pressable style={styles.uploadAreaSmall} onPress={onUploadELI}>
              <Ionicons name="add" size={24} color="#D1D5DB" />
              <ThemedText style={styles.uploadAreaTextSmall}>Upload ELI certificate</ThemedText>
            </Pressable>
          )}
        </>
      )}

      <Spacer height={32} />

      <Pressable
        style={[styles.primaryButton, !uploadedFile && styles.buttonDisabled]}
        onPress={onContinue}
        disabled={!uploadedFile}
      >
        <ThemedText style={styles.primaryButtonText}>Continue</ThemedText>
      </Pressable>
    </View>
  );
}

// Policy Details Step
function DetailsStep({
  uploadedFile,
  provider,
  policyNumber,
  coverageAmount,
  expiryDay,
  expiryMonth,
  expiryYear,
  showCoverageDropdown,
  onProviderChange,
  onPolicyNumberChange,
  onCoverageAmountChange,
  onExpiryDayChange,
  onExpiryMonthChange,
  onExpiryYearChange,
  onShowCoverageDropdown,
  onChangeFile,
  onSubmit,
  saving,
}) {
  const selectedCoverage = COVERAGE_OPTIONS.find(opt => opt.value === coverageAmount);

  return (
    <View style={styles.stepContainer}>
      <ThemedText style={styles.stepTitle}>Policy details</ThemedText>

      <Spacer height={24} />

      {/* Uploaded file card */}
      <View style={styles.uploadedFileCard}>
        <Ionicons name="checkmark-circle" size={24} color={Colors.success} />
        <View style={styles.uploadedFileInfo}>
          <ThemedText style={styles.uploadedFileName}>{uploadedFile?.name}</ThemedText>
          <ThemedText style={styles.uploadedFileSize}>{uploadedFile?.size} MB</ThemedText>
        </View>
        <Pressable onPress={onChangeFile}>
          <ThemedText style={styles.linkText}>Change</ThemedText>
        </Pressable>
      </View>

      <Spacer height={24} />

      {/* Insurance provider */}
      <ThemedText style={styles.inputLabel}>Insurance provider</ThemedText>
      <TextInput
        style={styles.textInput}
        placeholder="e.g. Hiscox, Simply Business..."
        placeholderTextColor={Colors.light.subtitle}
        value={provider}
        onChangeText={onProviderChange}
      />

      <Spacer height={16} />

      {/* Policy number */}
      <ThemedText style={styles.inputLabel}>Policy number</ThemedText>
      <TextInput
        style={styles.textInput}
        placeholder="e.g. PLI-12345678"
        placeholderTextColor={Colors.light.subtitle}
        value={policyNumber}
        onChangeText={onPolicyNumberChange}
      />

      <Spacer height={16} />

      {/* Coverage amount */}
      <ThemedText style={styles.inputLabel}>Coverage amount</ThemedText>
      <Pressable
        style={styles.dropdownButton}
        onPress={() => onShowCoverageDropdown(!showCoverageDropdown)}
      >
        <ThemedText style={styles.dropdownButtonText}>
          {selectedCoverage?.label || "Select coverage"}
        </ThemedText>
        <Ionicons
          name={showCoverageDropdown ? "chevron-up" : "chevron-down"}
          size={20}
          color={Colors.light.subtitle}
        />
      </Pressable>

      {showCoverageDropdown && (
        <View style={styles.dropdownMenu}>
          {COVERAGE_OPTIONS.map((option) => (
            <Pressable
              key={option.value}
              style={[
                styles.dropdownOption,
                coverageAmount === option.value && styles.dropdownOptionSelected,
              ]}
              onPress={() => {
                onCoverageAmountChange(option.value);
                onShowCoverageDropdown(false);
              }}
            >
              <ThemedText
                style={[
                  styles.dropdownOptionText,
                  coverageAmount === option.value && styles.dropdownOptionTextSelected,
                ]}
              >
                {option.label}
              </ThemedText>
              {coverageAmount === option.value && (
                <Ionicons name="checkmark" size={18} color={PRIMARY} />
              )}
            </Pressable>
          ))}
        </View>
      )}

      <Spacer height={16} />

      {/* Expiry date */}
      <ThemedText style={styles.inputLabel}>Expiry date</ThemedText>
      <View style={styles.dateInputRow}>
        <TextInput
          style={[styles.textInput, styles.dateInputDay]}
          placeholder="DD"
          placeholderTextColor={Colors.light.subtitle}
          value={expiryDay}
          onChangeText={onExpiryDayChange}
          keyboardType="number-pad"
          maxLength={2}
        />
        <ThemedText style={styles.dateSeparator}>/</ThemedText>
        <TextInput
          style={[styles.textInput, styles.dateInputMonth]}
          placeholder="MM"
          placeholderTextColor={Colors.light.subtitle}
          value={expiryMonth}
          onChangeText={onExpiryMonthChange}
          keyboardType="number-pad"
          maxLength={2}
        />
        <ThemedText style={styles.dateSeparator}>/</ThemedText>
        <TextInput
          style={[styles.textInput, styles.dateInputYear]}
          placeholder="YYYY"
          placeholderTextColor={Colors.light.subtitle}
          value={expiryYear}
          onChangeText={onExpiryYearChange}
          keyboardType="number-pad"
          maxLength={4}
        />
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
    </View>
  );
}

// Submitted Step
function SubmittedStep({ onBackToSettings }) {
  return (
    <View style={styles.stepContainer}>
      <View style={styles.successIconContainer}>
        <View style={styles.successIconCircle}>
          <Ionicons name="checkmark" size={32} color="#FFFFFF" />
        </View>
      </View>

      <Spacer height={24} />

      <ThemedText style={styles.stepTitle}>Submitted for review</ThemedText>

      <ThemedText style={styles.stepDescription}>
        We'll review your insurance certificate and notify you within 1-2 business days.
      </ThemedText>

      <Spacer height={32} />

      <Pressable style={styles.primaryButton} onPress={onBackToSettings}>
        <ThemedText style={styles.primaryButtonText}>Back to Settings</ThemedText>
      </Pressable>
    </View>
  );
}

// Verified Step
function VerifiedStep({ insuranceData, onDone, onChangeDocument }) {
  return (
    <View style={styles.stepContainer}>
      <View style={styles.verifiedBanner}>
        <Ionicons name="checkmark-circle" size={20} color={Colors.success} />
        <View style={styles.verifiedBannerContent}>
          <ThemedText style={styles.verifiedBannerTitle}>Verified</ThemedText>
          <ThemedText style={styles.verifiedBannerText}>
            Public Liability Insurance{"\n"}
            {insuranceData?.coverage} cover
          </ThemedText>
          <ThemedText style={[styles.verifiedBannerText, { marginTop: 8 }]}>
            Expires: {insuranceData?.expiry}
          </ThemedText>
        </View>
      </View>

      <Spacer height={24} />

      <View style={styles.documentCard}>
        <View style={styles.documentThumbnail}>
          <Ionicons name="document-text" size={32} color={Colors.light.subtitle} />
        </View>
        <View style={styles.documentCardInfo}>
          <ThemedText style={styles.documentCardFilename}>pli_cert.pdf</ThemedText>
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

// Expiring Soon Step
function ExpiringStep({ insuranceData, onUploadNew, uploadedFile, onSubmit }) {
  return (
    <View style={styles.stepContainer}>
      <View style={styles.expiringBanner}>
        <Ionicons name="warning" size={20} color="#F59E0B" />
        <View style={styles.expiringBannerContent}>
          <ThemedText style={styles.expiringBannerTitle}>
            Expires in {insuranceData?.daysLeft} days
          </ThemedText>
          <ThemedText style={styles.expiringBannerText}>
            Your insurance expires on {insuranceData?.expiry}. Upload your renewal before then.
          </ThemedText>
        </View>
      </View>

      <Spacer height={24} />

      <ThemedText style={styles.questionTitle}>Current certificate</ThemedText>

      <Spacer height={12} />

      <View style={styles.documentCard}>
        <View style={styles.documentThumbnail}>
          <Ionicons name="document-text" size={32} color={Colors.light.subtitle} />
        </View>
        <View style={styles.documentCardInfo}>
          <ThemedText style={styles.documentCardFilename}>pli_cert.pdf</ThemedText>
          <ThemedText style={styles.expiryWarning}>Expires {insuranceData?.expiry}</ThemedText>
        </View>
        <Ionicons name="warning" size={18} color="#F59E0B" />
      </View>

      <Spacer height={24} />

      <ThemedText style={styles.questionTitle}>Upload new certificate</ThemedText>

      <Spacer height={12} />

      {uploadedFile ? (
        <View style={styles.uploadedFileCard}>
          <Ionicons name="checkmark-circle" size={24} color={Colors.success} />
          <View style={styles.uploadedFileInfo}>
            <ThemedText style={styles.uploadedFileName}>{uploadedFile.name}</ThemedText>
            <ThemedText style={styles.uploadedFileSize}>{uploadedFile.size} MB</ThemedText>
          </View>
          <Pressable onPress={onUploadNew}>
            <ThemedText style={styles.linkText}>Change</ThemedText>
          </Pressable>
        </View>
      ) : (
        <Pressable style={styles.uploadAreaSmall} onPress={onUploadNew}>
          <Ionicons name="add" size={24} color="#D1D5DB" />
          <ThemedText style={styles.uploadAreaTextSmall}>Upload</ThemedText>
        </Pressable>
      )}

      <Spacer height={32} />

      <Pressable
        style={[styles.primaryButton, !uploadedFile && styles.buttonDisabled]}
        onPress={onSubmit}
        disabled={!uploadedFile}
      >
        <ThemedText style={styles.primaryButtonText}>Submit</ThemedText>
      </Pressable>
    </View>
  );
}

// Expired Step
function ExpiredStep({ onUploadNew }) {
  return (
    <View style={styles.stepContainer}>
      <View style={styles.expiredBanner}>
        <Ionicons name="warning" size={20} color="#DC2626" />
        <View style={styles.expiredBannerContent}>
          <ThemedText style={styles.expiredBannerTitle}>Insurance expired</ThemedText>
          <ThemedText style={styles.expiredBannerText}>
            Your insurance has expired. Upload a new certificate to continue receiving quotes.
          </ThemedText>
        </View>
      </View>

      <Spacer height={32} />

      <Pressable style={styles.primaryButton} onPress={onUploadNew}>
        <ThemedText style={styles.primaryButtonText}>Upload new certificate</ThemedText>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#FFFFFF",
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
    backgroundColor: "#F9FAFB",
    justifyContent: "center",
    alignSelf: "center",
  },
  // Titles
  stepTitle: {
    fontSize: 24,
    fontWeight: "600",
    color: Colors.light.title,
    textAlign: "center",
    marginBottom: 12,
  },
  stepDescription: {
    fontSize: 14,
    color: Colors.light.subtitle,
    textAlign: "center",
    lineHeight: 20,
    paddingHorizontal: 16,
  },
  // Info box
  infoBox: {
    backgroundColor: "#F9FAFB",
    borderRadius: 12,
    padding: 16,
    marginTop: 24,
  },
  infoTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: Colors.light.title,
    marginBottom: 12,
  },
  infoList: {
    gap: 8,
  },
  infoItem: {
    fontSize: 14,
    color: "#374151",
    lineHeight: 20,
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
  buttonDisabled: {
    opacity: 0.6,
  },
  linkText: {
    fontSize: 14,
    color: PRIMARY,
    textAlign: "center",
  },
  // Upload area
  uploadArea: {
    borderWidth: 2,
    borderStyle: "dashed",
    borderColor: "#D1D5DB",
    borderRadius: 12,
    padding: 40,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F9FAFB",
  },
  uploadAreaText: {
    fontSize: 14,
    color: Colors.light.subtitle,
    marginTop: 8,
  },
  uploadAreaSmall: {
    borderWidth: 2,
    borderStyle: "dashed",
    borderColor: "#D1D5DB",
    borderRadius: 12,
    padding: 20,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F9FAFB",
    gap: 8,
  },
  uploadAreaTextSmall: {
    fontSize: 14,
    color: Colors.light.subtitle,
  },
  acceptedFormats: {
    fontSize: 12,
    color: Colors.light.subtitle,
    marginTop: 8,
    textAlign: "center",
  },
  // Uploaded file card
  uploadedFileCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 16,
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.light.border,
  },
  uploadedFileInfo: {
    flex: 1,
  },
  uploadedFileName: {
    fontSize: 14,
    color: Colors.light.title,
    fontWeight: "500",
  },
  uploadedFileSize: {
    fontSize: 12,
    color: Colors.light.subtitle,
    marginTop: 2,
  },
  // Radio options
  questionTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: Colors.light.title,
  },
  questionSubtitle: {
    fontSize: 13,
    color: Colors.light.subtitle,
    marginTop: 4,
  },
  radioOption: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 16,
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.light.border,
    marginBottom: 8,
  },
  radioOptionSelected: {
    borderColor: PRIMARY,
  },
  radioCircle: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: Colors.light.border,
    alignItems: "center",
    justifyContent: "center",
  },
  radioCircleSelected: {
    borderColor: PRIMARY,
  },
  radioCircleInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: PRIMARY,
  },
  radioLabel: {
    fontSize: 16,
    color: Colors.light.title,
  },
  // Form inputs
  inputLabel: {
    fontSize: 14,
    color: Colors.light.subtitle,
    marginBottom: 8,
  },
  textInput: {
    borderWidth: 1,
    borderColor: Colors.light.border,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: Colors.light.title,
    backgroundColor: "#FFFFFF",
  },
  // Date input
  dateInputRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  dateInputDay: {
    flex: 1,
    textAlign: "center",
  },
  dateInputMonth: {
    flex: 1,
    textAlign: "center",
  },
  dateInputYear: {
    flex: 1.5,
    textAlign: "center",
  },
  dateSeparator: {
    fontSize: 18,
    color: Colors.light.subtitle,
    marginHorizontal: 8,
  },
  // Dropdown
  dropdownButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderWidth: 1,
    borderColor: Colors.light.border,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: "#FFFFFF",
  },
  dropdownButtonText: {
    fontSize: 16,
    color: Colors.light.title,
  },
  dropdownMenu: {
    borderWidth: 1,
    borderColor: Colors.light.border,
    borderRadius: 12,
    marginTop: 8,
    backgroundColor: "#FFFFFF",
    overflow: "hidden",
  },
  dropdownOption: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: Colors.light.border,
  },
  dropdownOptionSelected: {
    backgroundColor: "#F3F0FF",
  },
  dropdownOptionText: {
    fontSize: 16,
    color: Colors.light.title,
  },
  dropdownOptionTextSelected: {
    color: PRIMARY,
    fontWeight: "500",
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
  // Verified banner
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
    color: Colors.light.subtitle,
    marginTop: 4,
  },
  // Expiring banner
  expiringBanner: {
    flexDirection: "row",
    backgroundColor: "#FEF3C7",
    borderRadius: 12,
    padding: 16,
    gap: 12,
  },
  expiringBannerContent: {
    flex: 1,
  },
  expiringBannerTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: "#D97706",
  },
  expiringBannerText: {
    fontSize: 14,
    color: Colors.light.subtitle,
    marginTop: 4,
    lineHeight: 20,
  },
  expiryWarning: {
    fontSize: 12,
    color: "#F59E0B",
    marginTop: 2,
  },
  // Expired banner
  expiredBanner: {
    flexDirection: "row",
    backgroundColor: "#FEE2E2",
    borderRadius: 12,
    padding: 16,
    gap: 12,
  },
  expiredBannerContent: {
    flex: 1,
  },
  expiredBannerTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: "#DC2626",
  },
  expiredBannerText: {
    fontSize: 14,
    color: Colors.light.subtitle,
    marginTop: 4,
    lineHeight: 20,
  },
  // Document card
  documentCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 16,
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.light.border,
  },
  documentThumbnail: {
    width: 56,
    height: 56,
    borderRadius: 8,
    backgroundColor: "#F9FAFB",
    alignItems: "center",
    justifyContent: "center",
  },
  documentCardInfo: {
    flex: 1,
  },
  documentCardFilename: {
    fontSize: 14,
    color: Colors.light.title,
  },
});
