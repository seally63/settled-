// components/client/home/PostcodePrompt.jsx
// Modal asking the client for their postcode so we can show nearby trades.
import { useState } from "react";
import {
  Modal,
  View,
  TextInput,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  Keyboard,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";

import ThemedText from "../../ThemedText";
import { Colors } from "../../../constants/Colors";
import { geocodeUKPostcode } from "../../../lib/api/places";
import { setClientLocation } from "../../../lib/api/profile";

const UK_POSTCODE_PATTERN = /^[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}$/i;

export default function PostcodePrompt({ visible, onClose, onSaved }) {
  const [postcode, setPostcode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit() {
    const clean = postcode.trim().toUpperCase();
    if (!UK_POSTCODE_PATTERN.test(clean)) {
      setError("Please enter a valid UK postcode.");
      return;
    }

    setLoading(true);
    setError("");
    try {
      const geo = await geocodeUKPostcode(clean);
      if (!geo) {
        setError("We couldn't find that postcode. Please check and try again.");
        setLoading(false);
        return;
      }

      await setClientLocation({
        postcode: geo.postcode,
        lat: geo.latitude,
        lon: geo.longitude,
        town: geo.admin_district || null,
      });

      Keyboard.dismiss();
      onSaved?.({
        postcode: geo.postcode,
        lat: geo.latitude,
        lon: geo.longitude,
        town: geo.admin_district,
      });
    } catch (e) {
      setError(e?.message || "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  function handleClose() {
    if (loading) return;
    Keyboard.dismiss();
    setPostcode("");
    setError("");
    onClose?.();
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={handleClose}
    >
      <Pressable style={styles.backdrop} onPress={handleClose}>
        <Pressable style={styles.card} onPress={(e) => e.stopPropagation()}>
          <View style={styles.iconWrap}>
            <Ionicons name="location-outline" size={28} color={Colors.primary} />
          </View>

          <ThemedText style={styles.title}>Where are you based?</ThemedText>
          <ThemedText style={styles.subtitle}>
            Enter your postcode so we can show you trades in your area.
          </ThemedText>

          <TextInput
            style={[styles.input, error ? styles.inputError : null]}
            placeholder="e.g. SW1A 1AA"
            placeholderTextColor="#9CA3AF"
            value={postcode}
            onChangeText={(v) => {
              setPostcode(v);
              if (error) setError("");
            }}
            autoCapitalize="characters"
            autoCorrect={false}
            editable={!loading}
            returnKeyType="done"
            onSubmitEditing={handleSubmit}
          />

          {!!error && <ThemedText style={styles.errorText}>{error}</ThemedText>}

          <Pressable
            style={[styles.submitBtn, loading && styles.submitBtnDisabled]}
            onPress={handleSubmit}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <ThemedText style={styles.submitText}>Continue</ThemedText>
            )}
          </Pressable>

          <Pressable onPress={handleClose} disabled={loading} style={styles.cancelBtn}>
            <ThemedText style={styles.cancelText}>Skip for now</ThemedText>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
  },
  card: {
    width: "100%",
    maxWidth: 400,
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 24,
    alignItems: "center",
  },
  iconWrap: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "rgba(104,73,167,0.08)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  title: {
    fontSize: 19,
    fontWeight: "700",
    color: "#0F172A",
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 14,
    color: "#64748B",
    textAlign: "center",
    lineHeight: 20,
    marginBottom: 20,
  },
  input: {
    width: "100%",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: "#0F172A",
    backgroundColor: "#F9FAFB",
  },
  inputError: {
    borderColor: Colors.warning,
  },
  errorText: {
    marginTop: 8,
    fontSize: 13,
    color: Colors.warning,
    alignSelf: "flex-start",
  },
  submitBtn: {
    width: "100%",
    backgroundColor: Colors.primary,
    paddingVertical: 13,
    borderRadius: 10,
    alignItems: "center",
    marginTop: 16,
  },
  submitBtnDisabled: {
    opacity: 0.6,
  },
  submitText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#FFFFFF",
  },
  cancelBtn: {
    paddingVertical: 10,
    marginTop: 4,
  },
  cancelText: {
    fontSize: 14,
    color: "#64748B",
  },
});
