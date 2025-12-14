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
        setRole(!error ? (data?.role || 'client') : 'client');
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
        {/* Hide folder index */}
        <Tabs.Screen name="index" options={{ href: null }} />

        {/* ===== TRADES ONLY: Quotes, Sales ===== */}
        <Tabs.Screen
          name="quotes"
          options={{
            title: 'Quotes',
            href: isTrades ? undefined : null,
            tabBarIcon: ({ focused, color, size = 24 }) => (
              <Ionicons
                size={size}
                name={focused ? 'document-text' : 'document-text-outline'}
                color={color}
              />
            ),
          }}
        />
        <Tabs.Screen
          name="sales"
          options={{
            title: 'Sales',
            href: isTrades ? undefined : null,
            tabBarIcon: ({ focused, color, size = 24 }) => (
              <Ionicons
                size={size}
                name={focused ? 'stats-chart' : 'stats-chart-outline'}
                color={color}
              />
            ),
          }}
        />

        {/* ===== CLIENT ONLY: Home, My Quotes ===== */}
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
            title: 'My Quotes',
            href: isTrades ? null : undefined,
            tabBarIcon: ({ focused, color, size = 24 }) => (
              <Ionicons
                size={size}
                name={focused ? 'document-text' : 'document-text-outline'}
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

        {/* ===== COMMON: APPOINTMENTS ===== */}
        <Tabs.Screen
          name="appointments"
          options={{
            title: 'Appointments',
            tabBarIcon: ({ focused, color, size = 24 }) => (
              <Ionicons
                size={size}
                name={focused ? 'calendar' : 'calendar-outline'}
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

        {/* Hidden helpers / non-tab routes */}
        <Tabs.Screen name="create" options={{ href: null }} />
        <Tabs.Screen name="trades" options={{ href: null }} />
        <Tabs.Screen name="clienthome" options={{ href: null }} />
      </Tabs>
    </UserOnly>
  );
}
