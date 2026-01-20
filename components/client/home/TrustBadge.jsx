// components/client/home/TrustBadge.jsx
// Trust badge section showing verification info with Learn more modal
import { useState, useCallback } from "react";
import {
  View,
  Pressable,
  StyleSheet,
  Modal,
  ScrollView,
  Dimensions,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import ThemedText from "../../ThemedText";
import { Colors } from "../../../constants/Colors";

const { height: SCREEN_HEIGHT } = Dimensions.get("window");
const MODAL_MAX_HEIGHT = SCREEN_HEIGHT * 0.9;

// Verification badge data matching the trade profile badges
const VERIFICATION_ITEMS = [
  {
    id: "id",
    icon: "person-outline",
    label: "ID",
    title: "Identity & Business Verified",
    description:
      "Trades can verify their identity using government-issued photo ID. For businesses, we confirm Companies House registration or UTR number.",
  },
  {
    id: "ins",
    icon: "shield-outline",
    label: "Ins",
    title: "Insurance Verified",
    description:
      "Trades can submit proof of valid public liability insurance (minimum £1 million). We check policy documents and expiry dates.",
  },
  {
    id: "cred",
    icon: "ribbon-outline",
    label: "Cred",
    title: "Credentials & Qualifications",
    description:
      "Trade-specific qualifications can be verified where required. This includes Gas Safe registration, NICEIC certification, and other industry accreditations.",
  },
];

// Badge component matching the trade profile design
function VerificationBadgeLarge({ icon, label }) {
  return (
    <View style={styles.badgeContainer}>
      <View style={styles.badgeIconBox}>
        <Ionicons name={icon} size={18} color={Colors.primary} />
        <View style={styles.badgeCheckmark}>
          <Ionicons name="checkmark" size={10} color="#FFFFFF" />
        </View>
      </View>
      <ThemedText style={styles.badgeLabelText}>{label}</ThemedText>
    </View>
  );
}

function VerificationItem({ item, isLast }) {
  return (
    <>
      <View style={styles.verificationItem}>
        <VerificationBadgeLarge icon={item.icon} label={item.label} />
        <View style={styles.verificationContent}>
          <ThemedText style={styles.verificationTitle}>{item.title}</ThemedText>
          <ThemedText style={styles.verificationDescription}>
            {item.description}
          </ThemedText>
        </View>
      </View>
      {!isLast && <View style={styles.divider} />}
    </>
  );
}

function LearnMoreModal({ visible, onClose }) {
  const insets = useSafeAreaInsets();

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <View style={styles.modalOverlay}>
        <Pressable style={styles.modalBackdrop} onPress={onClose} />
        <View style={[styles.modalContent, { height: MODAL_MAX_HEIGHT }]}>
          {/* Handle bar */}
          <View style={styles.handleBar} />

          {/* Close button */}
          <Pressable
            onPress={onClose}
            style={styles.closeButton}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Ionicons name="close" size={24} color="#6B7280" />
          </Pressable>

          <ScrollView
            style={styles.modalScroll}
            contentContainerStyle={[
              styles.modalScrollContent,
              { paddingBottom: insets.bottom + 20 },
            ]}
            showsVerticalScrollIndicator={false}
          >
            {/* Header with shield icon */}
            <View style={styles.headerSection}>
              <View style={styles.shieldIconContainer}>
                <Ionicons name="shield-checkmark" size={48} color={Colors.primary} />
              </View>
              <ThemedText style={styles.modalTitle}>
                Verification Badges
              </ThemedText>
              <ThemedText style={styles.modalSubtitle}>
                Trades on Settled can voluntarily verify their credentials to earn trust badges. Look for these badges when choosing a tradesperson.
              </ThemedText>
            </View>

            {/* Divider */}
            <View style={styles.divider} />

            {/* Verification items */}
            {VERIFICATION_ITEMS.map((item, index) => (
              <VerificationItem
                key={item.id}
                item={item}
                isLast={index === VERIFICATION_ITEMS.length - 1}
              />
            ))}

            {/* Info note */}
            <View style={styles.infoNote}>
              <Ionicons name="information-circle-outline" size={20} color="#6B7280" />
              <ThemedText style={styles.infoNoteText}>
                Not all trades have all badges. We recommend prioritising trades with verified credentials for your peace of mind.
              </ThemedText>
            </View>

            {/* Got It button */}
            <Pressable
              style={({ pressed }) => [
                styles.gotItButton,
                pressed && styles.gotItButtonPressed,
              ]}
              onPress={onClose}
            >
              <ThemedText style={styles.gotItButtonText}>Got It</ThemedText>
            </Pressable>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

export default function TrustBadge() {
  const [modalVisible, setModalVisible] = useState(false);

  const handleLearnMore = useCallback(() => {
    setModalVisible(true);
  }, []);

  const handleCloseModal = useCallback(() => {
    setModalVisible(false);
  }, []);

  return (
    <>
      <View style={styles.container}>
        <View style={styles.content}>
          <View style={styles.textContainer}>
            <ThemedText style={styles.title}>
              Verified trades you can trust
            </ThemedText>
            <ThemedText style={styles.subtitle}>
              Not all businesses are equal on Settled
            </ThemedText>
          </View>
          <Pressable
            onPress={handleLearnMore}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <ThemedText style={styles.learnMore}>Learn more</ThemedText>
          </Pressable>
        </View>
      </View>

      <LearnMoreModal visible={modalVisible} onClose={handleCloseModal} />
    </>
  );
}

const styles = StyleSheet.create({
  // Main badge container
  container: {
    backgroundColor: "#F5F3FF",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: `${Colors.primary}20`,
    padding: 16,
    marginBottom: 24,
  },
  content: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  textContainer: {
    flex: 1,
  },
  title: {
    fontSize: 14,
    fontWeight: "600",
    color: "#1F2937",
    marginBottom: 2,
  },
  subtitle: {
    fontSize: 13,
    color: "#6B7280",
  },
  learnMore: {
    fontSize: 14,
    fontWeight: "600",
    color: Colors.primary,
  },

  // Modal styles
  modalOverlay: {
    flex: 1,
    justifyContent: "flex-end",
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
  },
  modalContent: {
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    overflow: "hidden",
  },
  handleBar: {
    width: 36,
    height: 4,
    backgroundColor: "#D1D5DB",
    borderRadius: 2,
    alignSelf: "center",
    marginTop: 12,
    marginBottom: 8,
  },
  closeButton: {
    position: "absolute",
    top: 16,
    right: 16,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#F3F4F6",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 10,
  },
  modalScroll: {
    flex: 1,
  },
  modalScrollContent: {
    paddingHorizontal: 24,
    paddingTop: 16,
  },

  // Header section
  headerSection: {
    alignItems: "center",
    paddingVertical: 24,
  },
  shieldIconContainer: {
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 24,
    fontWeight: "700",
    color: "#1F2937",
    textAlign: "center",
    marginBottom: 12,
  },
  modalSubtitle: {
    fontSize: 15,
    color: "#6B7280",
    textAlign: "center",
    lineHeight: 22,
    paddingHorizontal: 8,
  },

  // Divider
  divider: {
    height: 1,
    backgroundColor: "#E5E7EB",
    marginVertical: 20,
  },

  // Badge component (matching trade profile design)
  badgeContainer: {
    alignItems: "center",
    width: 52,
  },
  badgeIconBox: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: Colors.light.border,
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  badgeCheckmark: {
    position: "absolute",
    top: -5,
    right: -5,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: Colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  badgeLabelText: {
    fontSize: 12,
    fontWeight: "600",
    color: Colors.primary,
    marginTop: 4,
  },

  // Verification item
  verificationItem: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 16,
  },
  verificationContent: {
    flex: 1,
  },
  verificationTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#1F2937",
    marginBottom: 6,
  },
  verificationDescription: {
    fontSize: 14,
    color: "#6B7280",
    lineHeight: 21,
  },

  // Info note
  infoNote: {
    flexDirection: "row",
    alignItems: "flex-start",
    backgroundColor: "#F9FAFB",
    borderRadius: 12,
    padding: 16,
    marginTop: 20,
    gap: 12,
  },
  infoNoteText: {
    fontSize: 13,
    color: "#6B7280",
    lineHeight: 19,
    flex: 1,
  },

  // Got It button
  gotItButton: {
    backgroundColor: Colors.primary,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 24,
  },
  gotItButtonPressed: {
    opacity: 0.9,
  },
  gotItButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#FFFFFF",
  },
});
