// app/(dashboard)/profile/photo.jsx
import { useState, useEffect } from "react";
import {
  StyleSheet,
  View,
  Image,
  Pressable,
  Alert,
  ActivityIndicator,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";

import ThemedView from "../../../components/ThemedView";
import ThemedText from "../../../components/ThemedText";
import Spacer from "../../../components/Spacer";
import { SettingsFormSkeleton } from "../../../components/Skeleton";
import { Colors } from "../../../constants/Colors";

import { useUser } from "../../../hooks/useUser";
import { getMyProfile, updateMyProfile } from "../../../lib/api/profile";
import { supabase } from "../../../lib/supabase";
import ThemedStatusBar from "../../../components/ThemedStatusBar";

export default function ProfilePhotoScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useUser();

  const [photoUrl, setPhotoUrl] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadProfile();
  }, []);

  async function loadProfile() {
    try {
      const profile = await getMyProfile();
      setPhotoUrl(profile?.photo_url || null);
    } catch (e) {
      console.log("Error loading profile:", e);
    } finally {
      setLoading(false);
    }
  }

  async function handleTakePhoto() {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Permission needed", "Camera permission is required to take photos.");
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });

    if (!result.canceled && result.assets[0]) {
      await savePhoto(result.assets[0].uri);
    }
  }

  async function handleChooseFromLibrary() {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Permission needed", "Photo library permission is required.");
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });

    if (!result.canceled && result.assets[0]) {
      await savePhoto(result.assets[0].uri);
    }
  }

  async function savePhoto(uri) {
    try {
      setSaving(true);

      // Get file extension from URI
      const ext = uri.split('.').pop()?.toLowerCase() || 'jpg';
      const fileName = `${user.id}/avatar.${ext}`;

      // Fetch the image as a blob
      const response = await fetch(uri);
      const blob = await response.blob();

      // Convert blob to array buffer for upload
      const arrayBuffer = await new Response(blob).arrayBuffer();

      // Upload to Supabase Storage
      const { data, error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(fileName, arrayBuffer, {
          contentType: `image/${ext === 'jpg' ? 'jpeg' : ext}`,
          upsert: true,
        });

      if (uploadError) throw uploadError;

      // Get public URL
      const { data: urlData } = supabase.storage
        .from('avatars')
        .getPublicUrl(fileName);

      const publicUrl = urlData.publicUrl;

      // Save URL to profile
      await updateMyProfile({ photo_url: publicUrl });
      setPhotoUrl(publicUrl);
      Alert.alert("Success", "Profile photo updated.");
    } catch (e) {
      console.log("Upload error:", e);
      Alert.alert("Error", e.message || "Failed to save photo.");
    } finally {
      setSaving(false);
    }
  }

  async function handleRemovePhoto() {
    Alert.alert(
      "Remove photo",
      "Are you sure you want to remove your profile photo?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: async () => {
            try {
              setSaving(true);

              // Try to delete from storage (list and remove all files in user folder)
              const { data: files } = await supabase.storage
                .from('avatars')
                .list(user.id);

              if (files && files.length > 0) {
                const filesToRemove = files.map(f => `${user.id}/${f.name}`);
                await supabase.storage.from('avatars').remove(filesToRemove);
              }

              await updateMyProfile({ photo_url: null });
              setPhotoUrl(null);
            } catch (e) {
              Alert.alert("Error", e.message || "Failed to remove photo.");
            } finally {
              setSaving(false);
            }
          },
        },
      ]
    );
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
        <Pressable onPress={() => router.back()} hitSlop={10}>
          <Ionicons name="chevron-back" size={24} color={Colors.light.title} />
        </Pressable>
        <ThemedText style={styles.headerTitle}>Profile photo</ThemedText>
        <View style={{ width: 24 }} />
      </View>

      <View style={styles.content}>
        {/* Photo Preview */}
        <View style={styles.photoContainer}>
          {photoUrl ? (
            <Image source={{ uri: photoUrl }} style={styles.photo} />
          ) : (
            <View style={[styles.photo, styles.photoPlaceholder]}>
              <Ionicons name="person" size={48} color={Colors.light.subtitle} />
            </View>
          )}
        </View>

        <Spacer height={40} />

        {/* Actions */}
        <Pressable
          style={({ pressed }) => [styles.actionButton, pressed && styles.actionButtonPressed]}
          onPress={handleTakePhoto}
          disabled={saving}
        >
          <Ionicons name="camera-outline" size={24} color={Colors.light.title} />
          <ThemedText style={styles.actionButtonText}>Take photo</ThemedText>
        </Pressable>

        <Spacer height={12} />

        <Pressable
          style={({ pressed }) => [styles.actionButton, pressed && styles.actionButtonPressed]}
          onPress={handleChooseFromLibrary}
          disabled={saving}
        >
          <Ionicons name="image-outline" size={24} color={Colors.light.title} />
          <ThemedText style={styles.actionButtonText}>Choose from library</ThemedText>
        </Pressable>

        {photoUrl && (
          <>
            <Spacer height={32} />
            <Pressable onPress={handleRemovePhoto} disabled={saving}>
              <ThemedText style={styles.removeText}>Remove photo</ThemedText>
            </Pressable>
          </>
        )}

        {saving && (
          <View style={styles.savingOverlay}>
            <ActivityIndicator color={Colors.primary} />
          </View>
        )}
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#FFFFFF",
  },
  loadingContainer: {
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
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: Colors.light.title,
  },
  content: {
    flex: 1,
    alignItems: "center",
    paddingHorizontal: 24,
    paddingTop: 40,
  },
  photoContainer: {
    alignItems: "center",
  },
  photo: {
    width: 120,
    height: 120,
    borderRadius: 60,
  },
  photoPlaceholder: {
    backgroundColor: Colors.light.secondaryBackground,
    alignItems: "center",
    justifyContent: "center",
  },
  actionButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    width: "100%",
    paddingVertical: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.light.border,
    backgroundColor: "#FFFFFF",
  },
  actionButtonPressed: {
    backgroundColor: Colors.light.secondaryBackground,
  },
  actionButtonText: {
    fontSize: 16,
    color: Colors.light.title,
    fontWeight: "500",
  },
  removeText: {
    fontSize: 14,
    color: Colors.warning,
    textAlign: "center",
  },
  savingOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(255,255,255,0.7)",
    alignItems: "center",
    justifyContent: "center",
  },
});
