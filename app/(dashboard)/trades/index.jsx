// app/(dashboard)/trades/index.jsx - Tradesman Home Dashboard
import { useEffect, useState, useCallback } from "react";
import {
  StyleSheet,
  View,
  ScrollView,
  Pressable,
  RefreshControl,
  ActivityIndicator,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import ThemedView from "../../../components/ThemedView";
import ThemedText from "../../../components/ThemedText";
import ThemedCard from "../../../components/ThemedCard";
import Spacer from "../../../components/Spacer";
import { HomePageSkeleton } from "../../../components/Skeleton";
import { Colors } from "../../../constants/Colors";
import { useUser } from "../../../hooks/useUser";
import { supabase } from "../../../lib/supabase";

export default function TradesmanHome() {
  const router = useRouter();
  const { user } = useUser();
  const insets = useSafeAreaInsets();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [profile, setProfile] = useState(null);
  const [stats, setStats] = useState({
    quotesWaiting: 0,
    appointmentsNeedConfirm: 0,
    jobsScheduled: 0,
    weekInvoiced: 0,
    weekCollected: 0,
  });
  const [todaySchedule, setTodaySchedule] = useState([]);

  const load = useCallback(async () => {
    try {
      if (!user?.id) return;

      // Fetch profile for greeting
      const { data: profileData } = await supabase
        .from("profiles")
        .select("full_name, business_name")
        .eq("id", user.id)
        .single();
      setProfile(profileData);

      // Fetch quotes waiting for response (inbox items with state !== accepted/declined)
      const { data: quotesData } = await supabase
        .from("request_targets")
        .select("id, state")
        .eq("trade_id", user.id)
        .in("state", ["pending", "invited"]);

      // Fetch appointments needing confirmation
      const { data: appointmentsData } = await supabase
        .from("appointments")
        .select("id, status")
        .eq("tradesperson_id", user.id)
        .eq("status", "pending");

      // Fetch this week's jobs
      const startOfWeek = new Date();
      startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay());
      startOfWeek.setHours(0, 0, 0, 0);

      const { data: jobsData } = await supabase
        .from("appointments")
        .select("id")
        .eq("tradesperson_id", user.id)
        .gte("scheduled_at", startOfWeek.toISOString());

      // Fetch today's schedule
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);

      const { data: todayData } = await supabase
        .from("appointments")
        .select("id, scheduled_at, title, client_name, location")
        .eq("tradesperson_id", user.id)
        .gte("scheduled_at", today.toISOString())
        .lt("scheduled_at", tomorrow.toISOString())
        .order("scheduled_at", { ascending: true });

      setStats({
        quotesWaiting: quotesData?.length || 0,
        appointmentsNeedConfirm: appointmentsData?.length || 0,
        jobsScheduled: jobsData?.length || 0,
        weekInvoiced: 0, // TODO: Calculate from invoices
        weekCollected: 0, // TODO: Calculate from payments
      });

      setTodaySchedule(todayData || []);
    } catch (error) {
      console.error("Error loading dashboard:", error);
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    load();
  }, [load]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return "Good morning";
    if (hour < 18) return "Good afternoon";
    return "Good evening";
  };

  const firstName = profile?.full_name?.split(" ")[0] || "there";

  if (loading) {
    return (
      <ThemedView style={[styles.container, { paddingTop: insets.top }]}>
        <StatusBar style="dark" />
        <HomePageSkeleton paddingTop={20} />
      </ThemedView>
    );
  }

  return (
    <ThemedView style={[styles.container, { paddingTop: insets.top }]}>
      <StatusBar style="dark" />
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        showsVerticalScrollIndicator={false}
      >
        {/* Greeting */}
        <View style={styles.greeting}>
          <ThemedText style={styles.greetingText}>
            {getGreeting()}, {firstName} 👋
          </ThemedText>
        </View>

        {/* Action Needed Section */}
        {(stats.quotesWaiting > 0 || stats.appointmentsNeedConfirm > 0) && (
          <>
            <View style={styles.sectionHeader}>
              <Ionicons name="alert-circle" size={20} color="#F59E0B" />
              <ThemedText style={styles.sectionTitle}>Action Needed</ThemedText>
            </View>

            {stats.quotesWaiting > 0 && (
              <Pressable
                style={styles.actionCard}
                onPress={() => router.push("/quotes")}
              >
                <View style={styles.actionCardContent}>
                  <View style={[styles.actionDot, { backgroundColor: "#F59E0B" }]} />
                  <View style={{ flex: 1 }}>
                    <ThemedText style={styles.actionText}>
                      {stats.quotesWaiting} quote{stats.quotesWaiting > 1 ? "s" : ""} waiting for response
                    </ThemedText>
                  </View>
                  <Ionicons name="chevron-forward" size={20} color="#9CA3AF" />
                </View>
              </Pressable>
            )}

            {stats.appointmentsNeedConfirm > 0 && (
              <Pressable
                style={styles.actionCard}
                onPress={() => router.push("/appointments")}
              >
                <View style={styles.actionCardContent}>
                  <View style={[styles.actionDot, { backgroundColor: "#F59E0B" }]} />
                  <View style={{ flex: 1 }}>
                    <ThemedText style={styles.actionText}>
                      {stats.appointmentsNeedConfirm} appointment{stats.appointmentsNeedConfirm > 1 ? "s" : ""} need{stats.appointmentsNeedConfirm === 1 ? "s" : ""} confirmation
                    </ThemedText>
                  </View>
                  <Ionicons name="chevron-forward" size={20} color="#9CA3AF" />
                </View>
              </Pressable>
            )}

            <Spacer height={24} />
          </>
        )}

        {/* This Week Stats */}
        <View style={styles.sectionHeader}>
          <Ionicons name="calendar-outline" size={20} color="#6B7280" />
          <ThemedText style={styles.sectionTitle}>This Week</ThemedText>
        </View>

        <View style={styles.statsGrid}>
          <View style={styles.statCard}>
            <ThemedText style={styles.statValue}>{stats.jobsScheduled}</ThemedText>
            <ThemedText style={styles.statLabel}>Jobs scheduled</ThemedText>
          </View>

          <View style={styles.statCard}>
            <ThemedText style={styles.statValue}>£{stats.weekInvoiced.toFixed(0)}</ThemedText>
            <ThemedText style={styles.statLabel}>Invoiced</ThemedText>
          </View>

          <View style={styles.statCard}>
            <ThemedText style={styles.statValue}>£{stats.weekCollected.toFixed(0)}</ThemedText>
            <ThemedText style={styles.statLabel}>Collected</ThemedText>
          </View>
        </View>

        <Spacer height={24} />

        {/* Today's Schedule */}
        <View style={styles.sectionHeader}>
          <Ionicons name="time-outline" size={20} color="#6B7280" />
          <ThemedText style={styles.sectionTitle}>Today</ThemedText>
        </View>

        {todaySchedule.length === 0 ? (
          <ThemedCard style={styles.emptyCard}>
            <ThemedText style={styles.emptyText}>No appointments scheduled for today</ThemedText>
          </ThemedCard>
        ) : (
          todaySchedule.map((appointment) => {
            const time = new Date(appointment.scheduled_at);
            const timeStr = time.toLocaleTimeString("en-US", {
              hour: "numeric",
              minute: "2-digit",
              hour12: true,
            });

            return (
              <Pressable
                key={appointment.id}
                style={styles.scheduleCard}
                onPress={() => router.push(`/appointments/${appointment.id}`)}
              >
                <View style={styles.scheduleTime}>
                  <ThemedText style={styles.scheduleTimeText}>{timeStr}</ThemedText>
                </View>
                <View style={styles.scheduleDetails}>
                  <ThemedText style={styles.scheduleTitle}>
                    {appointment.title || "Appointment"}
                  </ThemedText>
                  {appointment.client_name && (
                    <ThemedText style={styles.scheduleSubtitle}>
                      {appointment.client_name}
                    </ThemedText>
                  )}
                  {appointment.location && (
                    <View style={styles.scheduleLocation}>
                      <Ionicons name="location-outline" size={14} color="#6B7280" />
                      <ThemedText style={styles.scheduleLocationText}>
                        {appointment.location}
                      </ThemedText>
                    </View>
                  )}
                </View>
                <Ionicons name="chevron-forward" size={20} color="#9CA3AF" />
              </Pressable>
            );
          })
        )}

        <Spacer height={16} />

        {/* Quick Actions */}
        <Pressable
          style={styles.viewAllButton}
          onPress={() => router.push("/quotes")}
        >
          <ThemedText style={styles.viewAllText}>View All Projects →</ThemedText>
        </Pressable>

        <Spacer height={40} />
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#FFFFFF",
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 20,
  },
  greeting: {
    marginBottom: 28,
  },
  greetingText: {
    fontSize: 28,
    fontWeight: "700",
    lineHeight: 36,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#374151",
  },
  actionCard: {
    backgroundColor: "#FFF",
    borderRadius: 12,
    padding: 16,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: "#F3F4F6",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  actionCardContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  actionDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  actionText: {
    fontSize: 15,
    lineHeight: 20,
  },
  statsGrid: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 8,
  },
  statCard: {
    flex: 1,
    backgroundColor: "#FFF",
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: "#F3F4F6",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  statValue: {
    fontSize: 24,
    fontWeight: "700",
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 13,
    color: "#6B7280",
  },
  emptyCard: {
    padding: 24,
    alignItems: "center",
    backgroundColor: "#FFF",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#F3F4F6",
  },
  emptyText: {
    fontSize: 15,
    color: "#6B7280",
    textAlign: "center",
  },
  scheduleCard: {
    backgroundColor: "#FFF",
    borderRadius: 12,
    padding: 16,
    marginBottom: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
    borderWidth: 1,
    borderColor: "#F3F4F6",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  scheduleTime: {
    minWidth: 70,
  },
  scheduleTimeText: {
    fontSize: 15,
    fontWeight: "600",
    color: Colors.light?.tint || "#0ea5e9",
  },
  scheduleDetails: {
    flex: 1,
  },
  scheduleTitle: {
    fontSize: 15,
    fontWeight: "600",
    marginBottom: 2,
  },
  scheduleSubtitle: {
    fontSize: 14,
    color: "#6B7280",
    marginBottom: 4,
  },
  scheduleLocation: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  scheduleLocationText: {
    fontSize: 13,
    color: "#6B7280",
  },
  viewAllButton: {
    backgroundColor: "#FFF",
    borderRadius: 12,
    padding: 16,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#F3F4F6",
  },
  viewAllText: {
    fontSize: 15,
    fontWeight: "600",
    color: Colors.light?.tint || "#0ea5e9",
  },
});
