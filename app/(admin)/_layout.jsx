// app/(admin)/_layout.jsx
// Admin layout with access protection
import { Stack, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { View, ActivityIndicator } from "react-native";

import { Colors } from "../../constants/Colors";
import { useUser } from "../../hooks/useUser";
import { isCurrentUserAdmin } from "../../lib/api/admin";
import ThemedView from "../../components/ThemedView";
import ThemedText from "../../components/ThemedText";

export default function AdminLayout() {
  const router = useRouter();
  const { user, loading: userLoading } = useUser();
  const [isAdmin, setIsAdmin] = useState(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    async function checkAdminAccess() {
      if (userLoading) return;

      if (!user) {
        // Not logged in, redirect to auth
        router.replace("/");
        return;
      }

      const adminStatus = await isCurrentUserAdmin();
      setIsAdmin(adminStatus);
      setChecking(false);

      if (!adminStatus) {
        // Not an admin, redirect away
        router.replace("/profile");
      }
    }

    checkAdminAccess();
  }, [user, userLoading]);

  // Show loading while checking
  if (checking || userLoading) {
    return (
      <ThemedView style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator size="large" color={Colors.primary} />
        <ThemedText style={{ marginTop: 16, color: Colors.light.subtitle }}>
          Checking access...
        </ThemedText>
      </ThemedView>
    );
  }

  // Not admin - this shouldn't show as we redirect above, but just in case
  if (!isAdmin) {
    return (
      <ThemedView style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 24 }}>
        <ThemedText style={{ fontSize: 18, fontWeight: "600", marginBottom: 8 }}>
          Access Denied
        </ThemedText>
        <ThemedText style={{ color: Colors.light.subtitle, textAlign: "center" }}>
          You don't have permission to access this area.
        </ThemedText>
      </ThemedView>
    );
  }

  return (
    <Stack
      screenOptions={{
        headerShown: false,
      }}
    >
      <Stack.Screen name="reviews" />
    </Stack>
  );
}
