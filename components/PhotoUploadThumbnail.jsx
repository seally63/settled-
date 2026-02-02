// components/PhotoUploadThumbnail.jsx
// Thumbnail component with inline upload progress for quote request photos
import { useState, useEffect, useRef } from "react";
import {
  View,
  Image,
  Pressable,
  StyleSheet,
  Animated,
  Easing,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import ThemedText from "./ThemedText";
import { Colors } from "../constants/Colors";

/**
 * Photo status states:
 * - 'pending': Just added, waiting to start upload
 * - 'optimizing': Being resized/compressed locally
 * - 'uploading': Upload in progress
 * - 'uploaded': Successfully uploaded to temp storage
 * - 'error': Upload failed (will auto-retry)
 * - 'retrying': Retrying after error
 */

export default function PhotoUploadThumbnail({
  photo,
  index,
  onRemove,
  onPress,
  onRetry,
}) {
  const { uri, status, progress = 0, error } = photo;

  // Spinning animation for loading states
  const spinValue = useRef(new Animated.Value(0)).current;
  const isLoading = ["pending", "optimizing", "uploading", "retrying"].includes(status);

  useEffect(() => {
    if (isLoading) {
      spinValue.setValue(0);
      Animated.loop(
        Animated.timing(spinValue, {
          toValue: 1,
          duration: 1000,
          easing: Easing.linear,
          useNativeDriver: true,
        })
      ).start();
    } else {
      spinValue.stopAnimation();
    }
  }, [isLoading]);

  const spin = spinValue.interpolate({
    inputRange: [0, 1],
    outputRange: ["0deg", "360deg"],
  });

  // Status badge content
  const renderStatusBadge = () => {
    switch (status) {
      case "pending":
      case "optimizing":
        return (
          <View style={[styles.statusBadge, styles.statusPending]}>
            <Animated.View style={{ transform: [{ rotate: spin }] }}>
              <Ionicons name="sync" size={12} color="#6B7280" />
            </Animated.View>
          </View>
        );

      case "uploading":
      case "retrying":
        return (
          <View style={[styles.statusBadge, styles.statusUploading]}>
            <Animated.View style={{ transform: [{ rotate: spin }] }}>
              <Ionicons name="cloud-upload" size={12} color="#3B82F6" />
            </Animated.View>
          </View>
        );

      case "uploaded":
        return (
          <View style={[styles.statusBadge, styles.statusUploaded]}>
            <Ionicons name="checkmark" size={12} color="#FFFFFF" />
          </View>
        );

      case "error":
        return (
          <Pressable
            style={[styles.statusBadge, styles.statusError]}
            onPress={() => onRetry?.(index)}
            hitSlop={8}
          >
            <Ionicons name="refresh" size={12} color="#FFFFFF" />
          </Pressable>
        );

      default:
        return null;
    }
  };

  // Progress overlay for uploading state
  const renderProgressOverlay = () => {
    if (status !== "uploading" && status !== "retrying") return null;

    // Show progress percentage
    const displayProgress = Math.round(progress);

    return (
      <View style={styles.progressOverlay}>
        <View style={styles.progressTextContainer}>
          <ThemedText style={styles.progressText}>
            {displayProgress}%
          </ThemedText>
        </View>
        {/* Progress bar at bottom */}
        <View style={styles.progressBarTrack}>
          <View style={[styles.progressBarFill, { width: `${progress}%` }]} />
        </View>
      </View>
    );
  };

  // Dim overlay for pending/optimizing states
  const renderDimOverlay = () => {
    if (status !== "pending" && status !== "optimizing") return null;

    return (
      <View style={styles.dimOverlay}>
        <ThemedText style={styles.dimText}>
          {status === "optimizing" ? "Processing..." : "Queued"}
        </ThemedText>
      </View>
    );
  };

  // Error overlay
  const renderErrorOverlay = () => {
    if (status !== "error") return null;

    return (
      <Pressable
        style={styles.errorOverlay}
        onPress={() => onRetry?.(index)}
      >
        <Ionicons name="alert-circle" size={20} color="#FFFFFF" />
        <ThemedText style={styles.errorText}>Tap to retry</ThemedText>
      </Pressable>
    );
  };

  return (
    <View style={styles.container}>
      <Pressable
        style={styles.imageContainer}
        onPress={() => onPress?.(index)}
        disabled={status === "error"}
      >
        <Image source={{ uri }} style={styles.image} />
        {renderDimOverlay()}
        {renderProgressOverlay()}
        {renderErrorOverlay()}
      </Pressable>

      {/* Status badge - top left */}
      {renderStatusBadge()}

      {/* Remove button - top right */}
      <Pressable
        onPress={() => onRemove?.(index)}
        style={styles.removeButton}
        hitSlop={8}
      >
        <Ionicons name="close" size={14} color="#FFFFFF" />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: 100,
    height: 100,
    borderRadius: 12,
    overflow: "hidden",
    backgroundColor: "#E5E7EB",
    marginRight: 10,
    position: "relative",
  },
  imageContainer: {
    flex: 1,
  },
  image: {
    width: "100%",
    height: "100%",
  },

  // Remove button
  removeButton: {
    position: "absolute",
    top: 6,
    right: 6,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: "rgba(0,0,0,0.6)",
    alignItems: "center",
    justifyContent: "center",
  },

  // Status badges
  statusBadge: {
    position: "absolute",
    top: 6,
    left: 6,
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
  },
  statusPending: {
    backgroundColor: "rgba(255,255,255,0.9)",
    borderWidth: 1,
    borderColor: "#D1D5DB",
  },
  statusUploading: {
    backgroundColor: "rgba(255,255,255,0.95)",
    borderWidth: 1,
    borderColor: "#3B82F6",
  },
  statusUploaded: {
    backgroundColor: "#10B981",
  },
  statusError: {
    backgroundColor: "#EF4444",
  },

  // Overlays
  dimOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.4)",
    alignItems: "center",
    justifyContent: "center",
  },
  dimText: {
    color: "#FFFFFF",
    fontSize: 11,
    fontWeight: "600",
  },

  progressOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.3)",
    justifyContent: "flex-end",
  },
  progressTextContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  progressText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "700",
    textShadowColor: "rgba(0,0,0,0.5)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  progressBarTrack: {
    height: 4,
    backgroundColor: "rgba(255,255,255,0.3)",
  },
  progressBarFill: {
    height: "100%",
    backgroundColor: "#3B82F6",
  },

  errorOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(239, 68, 68, 0.85)",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
  },
  errorText: {
    color: "#FFFFFF",
    fontSize: 10,
    fontWeight: "600",
  },
});
