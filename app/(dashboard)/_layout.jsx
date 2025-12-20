// app/(dashboard)/_layout.jsx
import { Tabs } from 'expo-router';
import { useColorScheme, ActivityIndicator, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';

import { Colors } from '../../constants/Colors';
import UserOnly from '../../components/auth/UserOnly';
import { useUser } from '../../hooks/useUser';
import { supabase } from '../../lib/supabase';

export default function DashboardLayout() {
  const colorScheme = useColorScheme();
  const theme = Colors[colorScheme] ?? Colors.light;

  const { user } = useUser();
  const [role, setRole] = useState(null);

  // DEBUG: Log to confirm new layout is loaded
  console.log('🔥 NEW DASHBOARD LAYOUT LOADED - Dec 20 2025');

  useEffect(() => {
    let mounted = true;

    (async () => {
      if (!user?.id) {
        setRole('client');
        return;
      }

      const { data, error } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single();

      if (mounted) {
        const userRole = !error ? (data?.role || 'client') : 'client';
        console.log('🔥 USER ROLE DETECTED:', userRole);
        setRole(userRole);
      }
    })();

    return () => {
      mounted = false;
    };
  }, [user?.id]);

  if (!role) {
    return (
      <UserOnly>
        <View
          style={{
            flex: 1,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <ActivityIndicator size="large" color={theme.iconColorFocused} />
        </View>
      </UserOnly>
    );
  }

  const isTrades = role === 'trades';

  console.log('🔥 RENDERING TABS - isTrades:', isTrades, 'role:', role);

  return (
    <UserOnly>
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarStyle: {
            backgroundColor: theme.navBackground,
            paddingTop: 10,
            height: 90,
          },
          tabBarActiveTintColor: theme.iconColorFocused,
          tabBarInactiveTintColor: theme.iconColor,
        }}
      >
        {/* ===== TRADES ONLY: Home (Dashboard), Projects (Quotes + Sales combined) ===== */}
        <Tabs.Screen
          name="trades"
          options={{
            title: 'Home',
            href: isTrades ? undefined : null,
            tabBarIcon: ({ focused, color, size = 24 }) => (
              <Ionicons
                size={size}
                name={focused ? 'home' : 'home-outline'}
                color={color}
              />
            ),
          }}
        />
        <Tabs.Screen
          name="quotes"
          options={{
            title: 'Projects',
            href: isTrades ? undefined : null,
            tabBarIcon: ({ focused, color, size = 24 }) => (
              <Ionicons
                size={size}
                name={focused ? 'briefcase' : 'briefcase-outline'}
                color={color}
              />
            ),
          }}
        />

        {/* ===== CLIENT ONLY: Home, Projects (renamed from My Quotes) ===== */}
        <Tabs.Screen
          name="client"
          options={{
            title: 'Home',
            href: isTrades ? null : undefined,
            tabBarIcon: ({ focused, color, size = 24 }) => (
              <Ionicons
                size={size}
                name={focused ? 'home' : 'home-outline'}
                color={color}
              />
            ),
          }}
        />
        <Tabs.Screen
          name="myquotes"
          options={{
            title: 'Projects',
            href: isTrades ? null : undefined,
            tabBarIcon: ({ focused, color, size = 24 }) => (
              <Ionicons
                size={size}
                name={focused ? 'briefcase' : 'briefcase-outline'}
                color={color}
              />
            ),
          }}
        />

        {/* ===== COMMON: MESSAGES ===== */}
        <Tabs.Screen
          name="messages"
          options={{
            title: 'Messages',
            tabBarIcon: ({ focused, color, size = 24 }) => (
              <Ionicons
                size={size}
                name={focused ? 'chatbubbles' : 'chatbubbles-outline'}
                color={color}
              />
            ),
          }}
        />

        {/* ===== COMMON: PROFILE ===== */}
        <Tabs.Screen
          name="profile"
          options={{
            title: 'Profile',
            tabBarIcon: ({ focused, color, size = 24 }) => (
              <Ionicons
                size={size}
                name={focused ? 'person' : 'person-outline'}
                color={color}
              />
            ),
          }}
        />

        {/* Hidden routes - these are still accessible but not shown in tabs */}
        <Tabs.Screen name="sales" options={{ href: null }} />
        <Tabs.Screen name="appointments" options={{ href: null }} />
      </Tabs>
    </UserOnly>
  );
}
