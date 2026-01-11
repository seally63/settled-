// app/(dashboard)/profile/client-profile.jsx
// Client Profile page - shows client profile information
import { useEffect, useState, useCallback } from "react";
import {
  StyleSheet,
  View,
  ScrollView,
  Image,
  ActivityIndicator,
  Pressable,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter, useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import ThemedView from "../../../components/ThemedView";
import ThemedText from "../../../components/ThemedText";
import Spacer from "../../../components/Spacer";
import { Colors } from "../../../constants/Colors";

import { useUser } from "../../../hooks/useUser";
import { getMyProfile } from "../../../lib/api/profile";

function getInitials(name) {
  if (!name) return "?";
  const parts = name.trim().split(" ");
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
}

function formatDate(dateString) {
  if (!dateString) return "";
  const date = new Date(dateString);
  return date.toLocaleDateString("en-GB", {
    month: "long",
    year: "numeric",
  });
}

export default function ClientProfileScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useUser();

  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  // Load profile data
  const loadProfile = useCallback(async () => {
    if (!user?.id) return;
    try {
      setLoading(true);
      const me = await getMyProfile();
      setProfile(me || null);
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  useFocusEffect(
    useCallback(() => {
      if (user?.id) {
        loadProfile();
      }
    }, [user?.id, loadProfile])
  );

  if (loading) {
    return (
      <ThemedView style={[styles.container, { paddingTop: insets.top }]}>
        <StatusBar style="dark" />
        <View style={styles.loadingContainer}>
          <ActivityIndicator />
        </View>
      </ThemedView>
    );
  }

  // Extract profile data
  const displayName = profile?.full_name || user?.email || "User";
  const email = profile?.email || user?.email;
  const photoUrl = profile?.photo_url;
  const memberSince = profile?.created_at ? formatDate(profile.created_at) : "";
  const projectCount = profile?.project_count || 0;

  return (
    <ThemedView style={[styles.container, { paddingTop: insets.top }]}>
      <StatusBar style="dark" />

      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={10}>
          <Ionicons name="chevron-back" size={24} color={Colors.light.title} />
        </Pressable>
        <ThemedText style={styles.headerTitle}>Profile</ThemedText>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Hero Card */}
        <View style={styles.heroCard}>
          {/* Avatar */}
          <View style={styles.avatarContainer}>
            {photoUrl ? (
              <Image source={{ uri: photoUrl }} style={styles.avatar} />
            ) : (
              <View style={[styles.avatar, styles.avatarFallback]}>
                <ThemedText style={styles.avatarInitials}>
                  {getInitials(displayName)}
                </ThemedText>
              </View>
            )}
          </View>

          <Spacer height={16} />

          {/* Name */}
          <ThemedText style={styles.displayName}>{displayName}</ThemedText>

          {/* Email */}
          {email && (
            <ThemedText style={styles.emailText}>{email}</ThemedText>
          )}

          <Spacer height={16} />

          {/* Stats Row */}
          <View style={styles.statsRow}>
            <View style={styles.statItem}>
              <ThemedText style={styles.statNumber}>{projectCount}</ThemedText>
              <ThemedText style={styles.statLabel}>
                Project{projectCount !== 1 ? "s" : ""} completed
              </ThemedText>
            </View>
          </View>

          {/* Member Since */}
          {memberSince && (
            <View style={styles.memberSinceRow}>
              <Ionicons name="calendar-outline" size={14} color={Colors.light.subtitle} />
              <ThemedText style={styles.memberSinceText}>
                Member since {memberSince}
              </ThemedText>
            </View>
          )}
        </View>

        {/* Edit Profile Button */}
        <Pressable
          style={({ pressed }) => [
            styles.editButton,
            pressed && styles.editButtonPressed,
          ]}
          onPress={() => router.push("/profile/photo")}
        >
          <Ionicons name="camera-outline" size={20} color={Colors.primary} />
          <ThemedText style={styles.editButtonText}>Edit photo</ThemedText>
        </Pressable>

        <Spacer height={insets.bottom > 0 ? insets.bottom + 24 : 40} />
      </ScrollView>
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
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
  },
  // Hero Card
  heroCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.light.border,
    padding: 24,
    alignItems: "center",
    marginBottom: 24,
  },
  avatarContainer: {},
  avatar: {
    width: 96,
    height: 96,
    borderRadius: 48,
  },
  avatarFallback: {
    backgroundColor: Colors.light.secondaryBackground,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarInitials: {
    fontSize: 32,
    fontWeight: "600",
    color: Colors.light.subtitle,
  },
  displayName: {
    fontSize: 24,
    fontWeight: "600",
    color: Colors.light.title,
    textAlign: "center",
  },
  emailText: {
    fontSize: 16,
    color: Colors.light.subtitle,
    marginTop: 4,
    textAlign: "center",
  },
  // Stats
  statsRow: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 32,
  },
  statItem: {
    alignItems: "center",
  },
  statNumber: {
    fontSize: 28,
    fontWeight: "700",
    color: Colors.light.title,
  },
  statLabel: {
    fontSize: 14,
    color: Colors.light.subtitle,
    marginTop: 4,
  },
  // Member Since
  memberSinceRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: Colors.light.border,
  },
  memberSinceText: {
    fontSize: 14,
    color: Colors.light.subtitle,
  },
  // Edit Button
  editButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.light.border,
    paddingVertical: 14,
  },
  editButtonPressed: {
    backgroundColor: Colors.light.secondaryBackground,
  },
  editButtonText: {
    fontSize: 16,
    fontWeight: "500",
    color: Colors.primary,
  },
});
