// components/ProgressBar.jsx
// Visual progress bar component for project cards
// Shows 4 stages with a filled progress indicator

import { View, StyleSheet } from "react-native";
import ThemedText from "./ThemedText";

const PROGRESS_PURPLE = "#7C3AED";
const PROGRESS_GRAY = "#E5E7EB";
const DOT_ACTIVE = "#7C3AED";
const DOT_INACTIVE = "#D1D5DB";
const LABEL_ACTIVE = "#7C3AED";
const LABEL_INACTIVE = "#9CA3AF";

/**
 * ProgressBar Component
 *
 * @param {Object} props
 * @param {string[]} props.stages - Array of 4 stage labels (e.g., ["Posted", "Quotes", "Hired", "Done"])
 * @param {number} props.progressPosition - Progress position as percentage (0-100)
 * @param {number} [props.activeStageIndex] - Optional: which stage is currently active (0-3)
 */
export default function ProgressBar({ stages, progressPosition, activeStageIndex }) {
  // Calculate which stages are completed based on progress position
  // Stage positions: 0=12.5%, 1=37.5%, 2=62.5%, 3=87.5%
  const stagePositions = [12.5, 37.5, 62.5, 87.5];

  // Determine active stage from progress if not explicitly provided
  const computedActiveIndex = activeStageIndex !== undefined
    ? activeStageIndex
    : stagePositions.findIndex((pos, idx) => {
        const nextPos = stagePositions[idx + 1] || 100;
        return progressPosition >= pos && progressPosition < nextPos;
      });

  // Clamp progress position between 0 and 100
  const clampedProgress = Math.max(0, Math.min(100, progressPosition));

  return (
    <View style={styles.container}>
      {/* Progress bar track */}
      <View style={styles.track}>
        {/* Filled progress */}
        <View style={[styles.fill, { width: `${clampedProgress}%` }]} />

        {/* Stage dots */}
        {stagePositions.map((pos, idx) => {
          const isActive = clampedProgress >= pos;
          return (
            <View
              key={idx}
              style={[
                styles.dot,
                { left: `${pos}%` },
                isActive ? styles.dotActive : styles.dotInactive,
              ]}
            />
          );
        })}
      </View>

      {/* Stage labels */}
      <View style={styles.labels}>
        {stages.map((label, idx) => {
          const isCurrentOrPast = computedActiveIndex >= idx || clampedProgress >= stagePositions[idx];
          return (
            <View key={idx} style={styles.labelContainer}>
              <ThemedText
                style={[
                  styles.label,
                  isCurrentOrPast ? styles.labelActive : styles.labelInactive,
                ]}
                numberOfLines={1}
              >
                {label}
              </ThemedText>
            </View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: "100%",
    marginVertical: 8,
  },
  track: {
    height: 4,
    backgroundColor: PROGRESS_GRAY,
    borderRadius: 2,
    position: "relative",
  },
  fill: {
    height: "100%",
    backgroundColor: PROGRESS_PURPLE,
    borderRadius: 2,
    position: "absolute",
    left: 0,
    top: 0,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    position: "absolute",
    top: -3,
    marginLeft: -5, // Center the dot on the position
    borderWidth: 2,
    borderColor: "#FFFFFF",
  },
  dotActive: {
    backgroundColor: DOT_ACTIVE,
  },
  dotInactive: {
    backgroundColor: DOT_INACTIVE,
  },
  labels: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 8,
    paddingHorizontal: 0,
  },
  labelContainer: {
    flex: 1,
    alignItems: "center",
  },
  label: {
    fontSize: 11,
    fontWeight: "500",
    textAlign: "center",
  },
  labelActive: {
    color: LABEL_ACTIVE,
  },
  labelInactive: {
    color: LABEL_INACTIVE,
  },
});
