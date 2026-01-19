// components/client/home/ServiceTypeBottomSheet.jsx
// Bottom sheet for selecting service type within a category
import {
  Modal,
  View,
  Pressable,
  StyleSheet,
  ScrollView,
  Dimensions,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import ThemedText from "../../ThemedText";

const { height: SCREEN_HEIGHT } = Dimensions.get("window");

function ServiceTypeItem({ serviceName, onPress, isLast }) {
  return (
    <Pressable
      style={({ pressed }) => [
        styles.serviceItem,
        pressed && styles.serviceItemPressed,
        isLast && styles.serviceItemLast,
      ]}
      onPress={onPress}
      accessibilityLabel={serviceName}
      accessibilityRole="button"
    >
      <ThemedText style={styles.serviceName}>{serviceName}</ThemedText>
      <Ionicons name="chevron-forward" size={20} color="#9CA3AF" />
    </Pressable>
  );
}

export default function ServiceTypeBottomSheet({
  isVisible,
  category,
  onClose,
  onSelect,
}) {
  if (!category) return null;

  const handleSelect = (serviceType) => {
    onSelect(category.name, serviceType);
    onClose();
  };

  return (
    <Modal
      visible={isVisible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        {/* Backdrop */}
        <Pressable style={styles.backdrop} onPress={onClose} />

        {/* Sheet */}
        <View style={styles.sheet}>
          {/* Drag handle */}
          <View style={styles.handleContainer}>
            <View style={styles.handle} />
          </View>

          {/* Header */}
          <View style={styles.header}>
            <ThemedText style={styles.headerIcon}>{category.icon}</ThemedText>
            <View style={styles.headerText}>
              <ThemedText style={styles.headerTitle}>{category.name}</ThemedText>
              <ThemedText style={styles.headerSubtitle}>
                What do you need?
              </ThemedText>
            </View>
            <Pressable
              style={styles.closeButton}
              onPress={onClose}
              hitSlop={8}
            >
              <Ionicons name="close" size={24} color="#6B7280" />
            </Pressable>
          </View>

          {/* Service types list */}
          <ScrollView
            style={styles.list}
            showsVerticalScrollIndicator={false}
            bounces={false}
          >
            {category.services.map((service, index) => (
              <ServiceTypeItem
                key={service}
                serviceName={service}
                onPress={() => handleSelect(service)}
                isLast={index === category.services.length - 1}
              />
            ))}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: "flex-end",
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
  },
  sheet: {
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    maxHeight: SCREEN_HEIGHT * 0.6,
    paddingBottom: 34, // Safe area padding
  },
  handleContainer: {
    alignItems: "center",
    paddingTop: 12,
    paddingBottom: 8,
  },
  handle: {
    width: 36,
    height: 4,
    backgroundColor: "#D1D5DB",
    borderRadius: 2,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
  },
  headerIcon: {
    fontSize: 32,
    marginRight: 12,
  },
  headerText: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#1F2937",
  },
  headerSubtitle: {
    fontSize: 14,
    color: "#6B7280",
    marginTop: 2,
  },
  closeButton: {
    padding: 4,
  },
  list: {
    flex: 1,
  },
  serviceItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
  },
  serviceItemPressed: {
    backgroundColor: "#F3F4F6",
  },
  serviceItemLast: {
    borderBottomWidth: 0,
  },
  serviceName: {
    fontSize: 16,
    color: "#1F2937",
    flex: 1,
  },
});
