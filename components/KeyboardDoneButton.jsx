// components/KeyboardDoneButton.jsx
// Reusable keyboard accessory with Done button for multiline inputs
import { Platform, InputAccessoryView, View, Pressable, Text, Keyboard, StyleSheet } from "react-native";

/**
 * iOS keyboard accessory view with a "Done" button to dismiss keyboard
 * For multiline TextInputs, add: inputAccessoryViewID={KEYBOARD_DONE_ID}
 *
 * Usage:
 * import { KeyboardDoneButton, KEYBOARD_DONE_ID } from '../components/KeyboardDoneButton';
 *
 * <TextInput
 *   multiline
 *   inputAccessoryViewID={Platform.OS === "ios" ? KEYBOARD_DONE_ID : undefined}
 * />
 *
 * // At the end of your component (before closing tags):
 * <KeyboardDoneButton />
 */

export const KEYBOARD_DONE_ID = "keyboard-done-accessory";

export function KeyboardDoneButton() {
  // Only render on iOS - Android handles this differently
  if (Platform.OS !== "ios") {
    return null;
  }

  return (
    <InputAccessoryView nativeID={KEYBOARD_DONE_ID}>
      <View style={styles.container}>
        <View style={{ flex: 1 }} />
        <Pressable
          onPress={() => Keyboard.dismiss()}
          style={styles.doneButton}
          hitSlop={8}
        >
          <Text style={styles.doneText}>Done</Text>
        </Pressable>
      </View>
    </InputAccessoryView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F3F4F6",
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#D1D5DB",
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  doneButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  doneText: {
    color: "#6849a7",
    fontSize: 16,
    fontWeight: "600",
  },
});

export default KeyboardDoneButton;
