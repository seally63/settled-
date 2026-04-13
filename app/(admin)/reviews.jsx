// app/(admin)/reviews.jsx
// Admin review dashboard for verification submissions
import { useState, useEffect, useCallback } from "react";
import {
  StyleSheet,
  View,
  ScrollView,
  Pressable,
  Alert,
  ActivityIndicator,
  TextInput,
  Linking,
  RefreshControl,
  Platform,
} from "react-native";
import * as Clipboard from "expo-clipboard";
import { StatusBar } from "expo-status-bar";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import ThemedView from "../../components/ThemedView";
import ThemedText from "../../components/ThemedText";
import Spacer from "../../components/Spacer";
import { KeyboardDoneButton, KEYBOARD_DONE_ID } from "../../components/KeyboardDoneButton";
import { Colors } from "../../constants/Colors";

import {
  getPendingReviews,
  getDocumentSignedUrl,
  approveSubmission,
  rejectSubmission,
  getPendingTradeApprovals,
  approveTradeProfile,
  rejectTradeProfile,
} from "../../lib/api/admin";

const PRIMARY = Colors?.primary || "#7C3AED";

const FILTER_OPTIONS = [
  { id: null, label: "All" },
  { id: "photo_id", label: "Photo ID" },
  { id: "insurance", label: "Insurance" },
  { id: "credentials", label: "Credentials" },
  { id: "applications", label: "Applications" },
];

export default function AdminReviewsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [submissions, setSubmissions] = useState([]);
  const [activeFilter, setActiveFilter] = useState(null);
  const [processingId, setProcessingId] = useState(null);
  const [rejectModalItem, setRejectModalItem] = useState(null);
  const [rejectReason, setRejectReason] = useState("");
  const [pendingTrades, setPendingTrades] = useState([]);

  const isApplicationsTab = activeFilter === "applications";

  const loadSubmissions = useCallback(async () => {
    try {
      if (isApplicationsTab) {
        const trades = await getPendingTradeApprovals();
        setPendingTrades(trades || []);
        setSubmissions([]);
      } else {
        const data = await getPendingReviews(activeFilter);
        setSubmissions(data || []);
        setPendingTrades([]);
      }
    } catch (e) {
      console.log("Error loading submissions:", e);
      Alert.alert("Error", "Failed to load submissions");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [activeFilter, isApplicationsTab]);

  useEffect(() => {
    loadSubmissions();
  }, [loadSubmissions]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadSubmissions();
  }, [loadSubmissions]);

  async function handleViewDocument(documentPath) {
    if (!documentPath) {
      Alert.alert("No Document", "No document attached to this submission.");
      return;
    }

    try {
      const url = await getDocumentSignedUrl(documentPath);
      if (url) {
        Linking.openURL(url);
      } else {
        Alert.alert("Error", "Could not generate document URL");
      }
    } catch (e) {
      Alert.alert("Error", "Failed to open document");
    }
  }

  async function handleApprove(item) {
    Alert.alert(
      "Approve Submission",
      `Are you sure you want to approve this ${formatVerificationType(item.verification_type)} submission?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Approve",
          style: "default",
          onPress: async () => {
            try {
              setProcessingId(item.id);
              await approveSubmission({
                queueId: item.id,
                verificationType: item.verification_type,
                submissionId: item.submission_id,
                profileId: item.profile_id,
              });
              // Remove from list
              setSubmissions((prev) => prev.filter((s) => s.id !== item.id));
              Alert.alert("Success", "Submission approved");
            } catch (e) {
              Alert.alert("Error", e.message || "Failed to approve");
            } finally {
              setProcessingId(null);
            }
          },
        },
      ]
    );
  }

  function handleRejectPress(item) {
    setRejectModalItem(item);
    setRejectReason("");
  }

  async function handleRejectConfirm() {
    if (!rejectReason.trim()) {
      Alert.alert("Required", "Please enter a rejection reason.");
      return;
    }

    const item = rejectModalItem;
    try {
      setProcessingId(item.id);
      await rejectSubmission({
        queueId: item.id,
        verificationType: item.verification_type,
        submissionId: item.submission_id,
        profileId: item.profile_id,
        reason: rejectReason.trim(),
      });
      // Remove from list
      setSubmissions((prev) => prev.filter((s) => s.id !== item.id));
      setRejectModalItem(null);
      Alert.alert("Success", "Submission rejected");
    } catch (e) {
      Alert.alert("Error", e.message || "Failed to reject");
    } finally {
      setProcessingId(null);
    }
  }

  function handleApproveApplication(trade) {
    Alert.alert(
      "Approve Trade",
      `Approve ${trade.business_name || trade.full_name}? They will become visible to clients.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Approve",
          onPress: async () => {
            try {
              setProcessingId(trade.id);
              await approveTradeProfile(trade.id);
              setPendingTrades((prev) => prev.filter((t) => t.id !== trade.id));
              Alert.alert("Approved", `${trade.business_name || trade.full_name} is now live on Settled.`);
            } catch (e) {
              Alert.alert("Error", e.message || "Failed to approve");
            } finally {
              setProcessingId(null);
            }
          },
        },
      ]
    );
  }

  function handleRejectApplication(trade) {
    Alert.alert(
      "Reject Trade",
      `Reject ${trade.business_name || trade.full_name}? They will not be visible to clients.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Reject",
          style: "destructive",
          onPress: async () => {
            try {
              setProcessingId(trade.id);
              await rejectTradeProfile(trade.id);
              setPendingTrades((prev) => prev.filter((t) => t.id !== trade.id));
              Alert.alert("Rejected", "Trade application has been rejected.");
            } catch (e) {
              Alert.alert("Error", e.message || "Failed to reject");
            } finally {
              setProcessingId(null);
            }
          },
        },
      ]
    );
  }

  function formatVerificationType(type) {
    switch (type) {
      case "photo_id":
        return "Photo ID";
      case "insurance":
        return "Insurance";
      case "credentials":
        return "Credentials";
      default:
        return type;
    }
  }

  function formatDate(dateString) {
    if (!dateString) return "N/A";
    const date = new Date(dateString);
    return date.toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  function getSubmissionDetails(item) {
    const submission = item.submission;
    if (!submission) return null;

    switch (item.verification_type) {
      case "photo_id":
        return {
          type: submission.document_type?.replace("_", " ") || "Photo ID",
          documentPath: submission.document_path,
        };
      case "insurance":
        return {
          type: `${submission.policy_provider || "Insurance"} - ${submission.policy_number || ""}`,
          documentPath: submission.pli_document_path,
          extra: submission.coverage_amount_pence
            ? `Coverage: £${(submission.coverage_amount_pence / 100).toLocaleString()}`
            : null,
        };
      case "credentials":
        return {
          type: formatCredentialType(submission.credential_type),
          credentialType: submission.credential_type,
          registrationNumber: submission.registration_number,
          documentPath: submission.document_path,
          verifyUrl: getCredentialVerifyUrl(submission.credential_type),
          verifyLabel: getCredentialVerifyLabel(submission.credential_type),
        };
      default:
        return null;
    }
  }

  function formatCredentialType(type) {
    const labels = {
      gas_safe: "Gas Safe Register",
      niceic: "NICEIC",
      napit: "NAPIT",
      oftec: "OFTEC",
      cscs: "CSCS Card",
      city_guilds: "City & Guilds",
      nvq: "NVQ",
      dbs: "DBS Certificate",
      disclosure_scotland: "Disclosure Scotland",
      other: "Other",
    };
    return labels[type] || type;
  }

  function getCredentialVerifyUrl(type) {
    const urls = {
      gas_safe: "https://www.gassaferegister.co.uk/find-an-engineer/",
      niceic: "https://www.niceic.com/find-a-contractor",
      napit: "https://www.napit.org.uk/find-an-installer.html",
      oftec: "https://www.oftec.org/find-a-technician",
      cscs: "https://www.cscs.uk.com/card-checker/",
    };
    return urls[type] || null;
  }

  function getCredentialVerifyLabel(type) {
    const labels = {
      gas_safe: "Gas Safe Search",
      niceic: "NICEIC Search",
      napit: "NAPIT Search",
      oftec: "OFTEC Search",
      cscs: "CSCS Card Checker",
    };
    return labels[type] || "Verify Online";
  }

  async function handleCopyToClipboard(text, label) {
    await Clipboard.setStringAsync(text);
    Alert.alert("Copied", `${label} copied to clipboard`);
  }

  if (loading) {
    return (
      <ThemedView style={[styles.container, { paddingTop: insets.top }]}>
        <StatusBar style="dark" />
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={PRIMARY} />
        </View>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={[styles.container, { paddingTop: insets.top }]}>
      <StatusBar style="dark" />

      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={10}>
          <Ionicons name="chevron-back" size={24} color={Colors.light.title} />
        </Pressable>
        <ThemedText style={styles.headerTitle}>Review Queue</ThemedText>
        <Pressable onPress={onRefresh} hitSlop={10}>
          <Ionicons name="refresh" size={24} color={Colors.light.title} />
        </Pressable>
      </View>

      {/* Filter Tabs */}
      <View style={styles.filterContainer}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          {FILTER_OPTIONS.map((option) => (
            <Pressable
              key={option.id || "all"}
              style={[
                styles.filterTab,
                activeFilter === option.id && styles.filterTabActive,
              ]}
              onPress={() => {
                setActiveFilter(option.id);
                setLoading(true);
              }}
            >
              <ThemedText
                style={[
                  styles.filterTabText,
                  activeFilter === option.id && styles.filterTabTextActive,
                ]}
              >
                {option.label}
              </ThemedText>
            </Pressable>
          ))}
        </ScrollView>
      </View>

      {/* Submissions List */}
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {/* Trade Applications Tab */}
        {isApplicationsTab ? (
          pendingTrades.length === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons name="checkmark-circle-outline" size={48} color={Colors.light.subtitle} />
              <ThemedText style={styles.emptyTitle}>All caught up!</ThemedText>
              <ThemedText style={styles.emptyText}>
                No pending trade applications.
              </ThemedText>
            </View>
          ) : (
            pendingTrades.map((trade) => {
              const isProcessingTrade = processingId === trade.id;
              return (
                <View key={trade.id} style={styles.submissionCard}>
                  <View style={styles.cardHeader}>
                    <View style={styles.cardHeaderLeft}>
                      <View style={[styles.typeBadge, { backgroundColor: "rgba(104,73,167,0.08)" }]}>
                        <ThemedText style={styles.typeBadgeText}>Application</ThemedText>
                      </View>
                    </View>
                    <ThemedText style={styles.dateText}>{formatDate(trade.created_at)}</ThemedText>
                  </View>

                  <View style={styles.userInfo}>
                    <ThemedText style={styles.businessName}>
                      {trade.business_name || trade.full_name}
                    </ThemedText>
                    {trade.business_name && trade.full_name && (
                      <ThemedText style={styles.email}>{trade.full_name}</ThemedText>
                    )}
                  </View>

                  {(trade.trade_title || trade.town_city || trade.base_postcode) && (
                    <View style={styles.detailsSection}>
                      {trade.trade_title && (
                        <ThemedText style={styles.detailLabel}>{trade.trade_title}</ThemedText>
                      )}
                      {(trade.town_city || trade.base_postcode) && (
                        <ThemedText style={styles.detailValue}>
                          {trade.town_city || trade.base_postcode}
                        </ThemedText>
                      )}
                    </View>
                  )}

                  <View style={styles.actionButtons}>
                    <View style={styles.decisionButtons}>
                      <Pressable
                        style={[styles.rejectButton, isProcessingTrade && styles.buttonDisabled]}
                        onPress={() => handleRejectApplication(trade)}
                        disabled={isProcessingTrade}
                      >
                        {isProcessingTrade ? (
                          <ActivityIndicator size="small" color="#DC2626" />
                        ) : (
                          <>
                            <Ionicons name="close" size={18} color="#DC2626" />
                            <ThemedText style={styles.rejectButtonText}>Reject</ThemedText>
                          </>
                        )}
                      </Pressable>

                      <Pressable
                        style={[styles.approveButton, isProcessingTrade && styles.buttonDisabled]}
                        onPress={() => handleApproveApplication(trade)}
                        disabled={isProcessingTrade}
                      >
                        {isProcessingTrade ? (
                          <ActivityIndicator size="small" color="#FFFFFF" />
                        ) : (
                          <>
                            <Ionicons name="checkmark" size={18} color="#FFFFFF" />
                            <ThemedText style={styles.approveButtonText}>Approve</ThemedText>
                          </>
                        )}
                      </Pressable>
                    </View>
                  </View>
                </View>
              );
            })
          )
        ) : submissions.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="checkmark-circle-outline" size={48} color={Colors.light.subtitle} />
            <ThemedText style={styles.emptyTitle}>All caught up!</ThemedText>
            <ThemedText style={styles.emptyText}>
              No pending submissions to review.
            </ThemedText>
          </View>
        ) : (
          submissions.map((item) => {
            const profile = item.profiles;
            const details = getSubmissionDetails(item);
            const isProcessing = processingId === item.id;

            return (
              <View key={item.id} style={styles.submissionCard}>
                {/* Header */}
                <View style={styles.cardHeader}>
                  <View style={styles.cardHeaderLeft}>
                    <View style={styles.typeBadge}>
                      <ThemedText style={styles.typeBadgeText}>
                        {formatVerificationType(item.verification_type)}
                      </ThemedText>
                    </View>
                    {item.priority > 1 && (
                      <View style={styles.priorityBadge}>
                        <ThemedText style={styles.priorityBadgeText}>Priority</ThemedText>
                      </View>
                    )}
                  </View>
                  <ThemedText style={styles.dateText}>
                    {formatDate(item.created_at)}
                  </ThemedText>
                </View>

                {/* User Info */}
                <View style={styles.userInfo}>
                  <ThemedText style={styles.businessName}>
                    {profile?.business_name || profile?.full_name || "Unknown"}
                  </ThemedText>
                  <ThemedText style={styles.email}>
                    {profile?.email || "No email"}
                  </ThemedText>
                </View>

                {/* Submission Details */}
                {details && (
                  <View style={styles.detailsSection}>
                    <ThemedText style={styles.detailLabel}>
                      {details.type}
                    </ThemedText>
                    {details.registrationNumber && (
                      <View style={styles.registrationRow}>
                        <ThemedText style={styles.detailValue}>
                          Reg #: {details.registrationNumber}
                        </ThemedText>
                        <Pressable
                          style={styles.copyButton}
                          onPress={() => handleCopyToClipboard(details.registrationNumber, "Registration number")}
                          hitSlop={8}
                        >
                          <Ionicons name="copy-outline" size={16} color={PRIMARY} />
                        </Pressable>
                      </View>
                    )}
                    {details.extra && (
                      <ThemedText style={styles.detailValue}>
                        {details.extra}
                      </ThemedText>
                    )}
                  </View>
                )}

                {/* Action Buttons */}
                <View style={styles.actionButtons}>
                  {/* View Document */}
                  {details?.documentPath && (
                    <Pressable
                      style={styles.viewDocButton}
                      onPress={() => handleViewDocument(details.documentPath)}
                    >
                      <Ionicons name="document-outline" size={18} color={PRIMARY} />
                      <ThemedText style={styles.viewDocText}>View Document</ThemedText>
                    </Pressable>
                  )}

                  {/* Verification Link - for all credentials with verify URLs */}
                  {details?.verifyUrl && details.registrationNumber && (
                    <Pressable
                      style={styles.viewDocButton}
                      onPress={() => Linking.openURL(details.verifyUrl)}
                    >
                      <Ionicons name="open-outline" size={18} color={PRIMARY} />
                      <ThemedText style={styles.viewDocText}>{details.verifyLabel}</ThemedText>
                    </Pressable>
                  )}

                  {/* Approve / Reject */}
                  <View style={styles.decisionButtons}>
                    <Pressable
                      style={[styles.rejectButton, isProcessing && styles.buttonDisabled]}
                      onPress={() => handleRejectPress(item)}
                      disabled={isProcessing}
                    >
                      {isProcessing ? (
                        <ActivityIndicator size="small" color="#DC2626" />
                      ) : (
                        <>
                          <Ionicons name="close" size={18} color="#DC2626" />
                          <ThemedText style={styles.rejectButtonText}>Reject</ThemedText>
                        </>
                      )}
                    </Pressable>

                    <Pressable
                      style={[styles.approveButton, isProcessing && styles.buttonDisabled]}
                      onPress={() => handleApprove(item)}
                      disabled={isProcessing}
                    >
                      {isProcessing ? (
                        <ActivityIndicator size="small" color="#FFFFFF" />
                      ) : (
                        <>
                          <Ionicons name="checkmark" size={18} color="#FFFFFF" />
                          <ThemedText style={styles.approveButtonText}>Approve</ThemedText>
                        </>
                      )}
                    </Pressable>
                  </View>
                </View>
              </View>
            );
          })
        )}

        <Spacer height={insets.bottom > 0 ? insets.bottom + 24 : 40} />
      </ScrollView>

      {/* Reject Modal */}
      {rejectModalItem && (
        <View style={styles.modalOverlay}>
          <Pressable
            style={styles.modalBackdrop}
            onPress={() => setRejectModalItem(null)}
          />
          <View style={styles.modalContent}>
            <ThemedText style={styles.modalTitle}>Reject Submission</ThemedText>
            <ThemedText style={styles.modalSubtitle}>
              Please provide a reason for rejection. This will be shown to the user.
            </ThemedText>

            <TextInput
              style={styles.reasonInput}
              placeholder="Enter rejection reason..."
              placeholderTextColor={Colors.light.subtitle}
              value={rejectReason}
              onChangeText={setRejectReason}
              multiline
              numberOfLines={4}
              textAlignVertical="top"
              inputAccessoryViewID={Platform.OS === "ios" ? KEYBOARD_DONE_ID : undefined}
            />

            <View style={styles.modalButtons}>
              <Pressable
                style={styles.modalCancelButton}
                onPress={() => setRejectModalItem(null)}
              >
                <ThemedText style={styles.modalCancelText}>Cancel</ThemedText>
              </Pressable>

              <Pressable
                style={[
                  styles.modalRejectButton,
                  !rejectReason.trim() && styles.buttonDisabled,
                ]}
                onPress={handleRejectConfirm}
                disabled={!rejectReason.trim() || processingId}
              >
                {processingId ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <ThemedText style={styles.modalRejectText}>Reject</ThemedText>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      )}
      <KeyboardDoneButton />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#FFFFFF",
  },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: "#FFFFFF",
    borderBottomWidth: 1,
    borderBottomColor: Colors.light.border,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: Colors.light.title,
  },
  filterContainer: {
    backgroundColor: "#FFFFFF",
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: Colors.light.border,
  },
  filterTab: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    marginRight: 8,
    borderRadius: 20,
    backgroundColor: "#F3F4F6",
  },
  filterTabActive: {
    backgroundColor: PRIMARY,
  },
  filterTabText: {
    fontSize: 14,
    color: Colors.light.subtitle,
  },
  filterTabTextActive: {
    color: "#FFFFFF",
    fontWeight: "500",
  },
  scrollContent: {
    padding: 16,
  },
  emptyState: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 80,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: Colors.light.title,
    marginTop: 16,
  },
  emptyText: {
    fontSize: 14,
    color: Colors.light.subtitle,
    marginTop: 8,
  },
  submissionCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: Colors.light.border,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  cardHeaderLeft: {
    flexDirection: "row",
    gap: 8,
  },
  typeBadge: {
    backgroundColor: "#EEF2FF",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  typeBadgeText: {
    fontSize: 12,
    fontWeight: "500",
    color: PRIMARY,
  },
  priorityBadge: {
    backgroundColor: "#FEF3C7",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  priorityBadgeText: {
    fontSize: 12,
    fontWeight: "500",
    color: "#D97706",
  },
  dateText: {
    fontSize: 12,
    color: Colors.light.subtitle,
  },
  userInfo: {
    marginBottom: 12,
  },
  businessName: {
    fontSize: 16,
    fontWeight: "600",
    color: Colors.light.title,
  },
  email: {
    fontSize: 14,
    color: Colors.light.subtitle,
    marginTop: 2,
  },
  detailsSection: {
    backgroundColor: "#F9FAFB",
    padding: 12,
    borderRadius: 8,
    marginBottom: 12,
  },
  detailLabel: {
    fontSize: 14,
    fontWeight: "500",
    color: Colors.light.title,
  },
  detailValue: {
    fontSize: 13,
    color: Colors.light.subtitle,
    marginTop: 4,
  },
  registrationRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 4,
  },
  copyButton: {
    padding: 4,
  },
  actionButtons: {
    gap: 12,
  },
  viewDocButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 8,
  },
  viewDocText: {
    fontSize: 14,
    color: PRIMARY,
    fontWeight: "500",
  },
  decisionButtons: {
    flexDirection: "row",
    gap: 12,
  },
  rejectButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#DC2626",
    backgroundColor: "#FEF2F2",
  },
  rejectButtonText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#DC2626",
  },
  approveButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 12,
    borderRadius: 8,
    backgroundColor: "#10B981",
  },
  approveButtonText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#FFFFFF",
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  // Modal styles
  modalOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: "center",
    alignItems: "center",
  },
  modalBackdrop: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
  },
  modalContent: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 24,
    marginHorizontal: 24,
    width: "90%",
    maxWidth: 400,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: Colors.light.title,
    marginBottom: 8,
  },
  modalSubtitle: {
    fontSize: 14,
    color: Colors.light.subtitle,
    marginBottom: 16,
  },
  reasonInput: {
    borderWidth: 1,
    borderColor: Colors.light.border,
    borderRadius: 8,
    padding: 12,
    fontSize: 14,
    color: Colors.light.title,
    minHeight: 100,
    marginBottom: 16,
  },
  modalButtons: {
    flexDirection: "row",
    gap: 12,
  },
  modalCancelButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.light.border,
    alignItems: "center",
  },
  modalCancelText: {
    fontSize: 14,
    fontWeight: "600",
    color: Colors.light.subtitle,
  },
  modalRejectButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    backgroundColor: "#DC2626",
    alignItems: "center",
  },
  modalRejectText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#FFFFFF",
  },
});
