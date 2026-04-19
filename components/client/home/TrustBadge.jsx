// components/client/home/TrustBadge.jsx
// Verified-trades CTA + Learn-more bottom sheet. Theme-aware.
import React, { useState, useCallback } from "react";
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
import { useTheme } from "../../../hooks/useTheme";
import { TypeVariants, Radius, FontFamily } from "../../../constants/Typography";

const { height: SCREEN_HEIGHT } = Dimensions.get("window");
const MODAL_MAX_HEIGHT = SCREEN_HEIGHT * 0.9;

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

function VerificationBadgeLarge({ icon, label }) {
  const { colors: c } = useTheme();
  return (
    <View style={styles.badgeContainer}>
      <View
        style={[
          styles.badgeIconBox,
          { backgroundColor: c.elevate, borderColor: c.border },
        ]}
      >
        <Ionicons name={icon} size={18} color={Colors.primary} />
        <View style={styles.badgeCheckmark}>
          <Ionicons name="checkmark" size={10} color="#FFFFFF" />
        </View>
      </View>
      <ThemedText style={[styles.badgeLabelText, { color: Colors.primary }]}>
        {label}
      </ThemedText>
    </View>
  );
}

function VerificationItem({ item, isLast }) {
  const { colors: c } = useTheme();
  return (
    <>
      <View style={styles.verificationItem}>
        <VerificationBadgeLarge icon={item.icon} label={item.label} />
        <View style={styles.verificationContent}>
          <ThemedText style={[TypeVariants.h3, { color: c.text, marginBottom: 6 }]}>
            {item.title}
          </ThemedText>
          <ThemedText style={[TypeVariants.bodySm, { color: c.textMid }]}>
            {item.description}
          </ThemedText>
        </View>
      </View>
      {!isLast && (
        <View style={[styles.divider, { backgroundColor: c.border }]} />
      )}
    </>
  );
}

function LearnMoreModal({ visible, onClose }) {
  const insets = useSafeAreaInsets();
  const { colors: c, dark } = useTheme();

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <View style={styles.modalOverlay}>
        <Pressable style={styles.modalBackdrop} onPress={onClose} />
        <View
          style={[
            styles.modalContent,
            { backgroundColor: c.bg, height: MODAL_MAX_HEIGHT },
          ]}
        >
          <View style={[styles.handleBar, { backgroundColor: c.borderStrong }]} />
          <Pressable
            onPress={onClose}
            style={[styles.closeButton, { backgroundColor: c.elevate2 }]}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Ionicons name="close" size={22} color={c.textMid} />
          </Pressable>

          <ScrollView
            style={styles.modalScroll}
            contentContainerStyle={[
              styles.modalScrollContent,
              { paddingBottom: insets.bottom + 20 },
            ]}
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.headerSection}>
              <View style={styles.shieldIconContainer}>
                <Ionicons name="shield-checkmark" size={48} color={Colors.primary} />
              </View>
              <ThemedText style={[TypeVariants.display, { color: c.text, textAlign: "center", marginBottom: 10 }]}>
                Verification Badges
              </ThemedText>
              <ThemedText style={[TypeVariants.body, { color: c.textMid, textAlign: "center" }]}>
                Trades on Settled can voluntarily verify their credentials to earn trust badges. Look for these badges when choosing a tradesperson.
              </ThemedText>
            </View>

            <View style={[styles.divider, { backgroundColor: c.border }]} />

            {VERIFICATION_ITEMS.map((item, index) => (
              <VerificationItem
                key={item.id}
                item={item}
                isLast={index === VERIFICATION_ITEMS.length - 1}
              />
            ))}

            <View style={[styles.infoNote, { backgroundColor: c.elevate2 }]}>
              <Ionicons name="information-circle-outline" size={20} color={c.textMuted} />
              <ThemedText style={[TypeVariants.bodySm, { color: c.textMid, flex: 1 }]}>
                Not all trades have all badges. We recommend prioritising trades with verified credentials for your peace of mind.
              </ThemedText>
            </View>

            <Pressable
              style={({ pressed }) => [
                styles.gotItButton,
                pressed && { opacity: 0.85 },
              ]}
              onPress={onClose}
            >
              <ThemedText style={styles.gotItButtonText}>Got it</ThemedText>
            </Pressable>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

export default function TrustBadge() {
  const [modalVisible, setModalVisible] = useState(false);
  const { colors: c } = useTheme();

  const handleLearnMore = useCallback(() => setModalVisible(true), []);
  const handleCloseModal = useCallback(() => setModalVisible(false), []);

  return (
    <>
      <View
        style={[
          styles.container,
          {
            backgroundColor: c.elevate,
            borderColor: c.border,
          },
        ]}
      >
        <View style={styles.content}>
          <View style={styles.textContainer}>
            <ThemedText style={[TypeVariants.h3, { color: c.text, marginBottom: 2 }]}>
              Verified trades you can trust
            </ThemedText>
            <ThemedText style={[TypeVariants.captionMuted, { color: c.textMid }]}>
              Not all businesses are equal on Settled
            </ThemedText>
          </View>
          <Pressable
            onPress={handleLearnMore}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <ThemedText
              style={{
                fontSize: 14,
                fontFamily: FontFamily.headerSemibold,
                color: Colors.primary,
              }}
            >
              Learn more
            </ThemedText>
          </Pressable>
        </View>
      </View>

      <LearnMoreModal visible={modalVisible} onClose={handleCloseModal} />
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: Radius.lg,
    borderWidth: 1,
    padding: 16,
    marginBottom: 16,
  },
  content: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  textContainer: { flex: 1 },

  // Modal
  modalOverlay: { flex: 1, justifyContent: "flex-end" },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.55)",
  },
  modalContent: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    overflow: "hidden",
  },
  handleBar: {
    width: 36,
    height: 4,
    borderRadius: 2,
    alignSelf: "center",
    marginTop: 12,
    marginBottom: 8,
  },
  closeButton: {
    position: "absolute",
    top: 14,
    right: 14,
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 10,
  },
  modalScroll: { flex: 1 },
  modalScrollContent: {
    paddingHorizontal: 24,
    paddingTop: 16,
  },

  headerSection: {
    alignItems: "center",
    paddingVertical: 24,
  },
  shieldIconContainer: {
    marginBottom: 16,
  },

  divider: {
    height: 1,
    marginVertical: 20,
  },

  badgeContainer: {
    alignItems: "center",
    width: 52,
  },
  badgeIconBox: {
    width: 40,
    height: 40,
    borderRadius: 10,
    borderWidth: 1,
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
    fontFamily: FontFamily.headerSemibold,
    marginTop: 4,
  },

  verificationItem: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 16,
  },
  verificationContent: { flex: 1 },

  infoNote: {
    flexDirection: "row",
    alignItems: "flex-start",
    borderRadius: Radius.md,
    padding: 16,
    marginTop: 20,
    gap: 12,
  },

  gotItButton: {
    backgroundColor: Colors.primary,
    borderRadius: Radius.md + 2,
    paddingVertical: 16,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 24,
  },
  gotItButtonText: {
    fontSize: 16,
    fontFamily: FontFamily.headerSemibold,
    color: "#FFFFFF",
  },
});
