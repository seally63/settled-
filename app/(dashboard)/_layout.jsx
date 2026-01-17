// app/(dashboard)/_layout.jsx
import { Tabs, useRouter, useSegments } from 'expo-router';
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
  const router = useRouter();
  const segments = useSegments();

  const { user } = useUser();
  const [role, setRole] = useState(null);

  // Track if we need to reset tabs when switching to them
  const [messagesNeedsReset, setMessagesNeedsReset] = useState(false);

  // When navigating to messages from another screen (like project card), mark for reset
  useEffect(() => {
    const currentTab = segments[1];
    // If we're in messages nested route, mark that we need to reset when leaving
    if (currentTab === 'messages' && segments.length > 2) {
      setMessagesNeedsReset(true);
    }
  }, [segments]);

  // Handle tab press to reset to main screen
  const handleMessagesTabPress = () => {
    const currentTab = segments[1];

    // If coming from a different tab and messages needs reset, go to messages index
    if (currentTab !== 'messages' && messagesNeedsReset) {
      setMessagesNeedsReset(false);
      router.replace('/messages');
      return true;
    }

    // If already on messages tab in a nested route, go to index
    if (currentTab === 'messages' && segments.length > 2) {
      router.replace('/messages');
      return true;
    }

    return false;
  };

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
                name={focused ? 'home-sharp' : 'home-outline'}
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
                name={focused ? 'folder-open' : 'folder-open-outline'}
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
                name={focused ? 'home-sharp' : 'home-outline'}
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
                name={focused ? 'folder-open' : 'folder-open-outline'}
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
                name={focused ? 'chatbubble-ellipses' : 'chatbubble-ellipses-outline'}
                color={color}
              />
            ),
          }}
          listeners={{
            tabPress: (e) => {
              if (handleMessagesTabPress()) {
                e.preventDefault();
              }
            },
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
                name={focused ? 'person-circle' : 'person-circle-outline'}
                color={color}
              />
            ),
          }}
        />

        {/* Hidden routes - these are still accessible but not shown in tabs */}
        <Tabs.Screen name="sales" options={{ href: null }} />
      </Tabs>
    </UserOnly>
  );
}
