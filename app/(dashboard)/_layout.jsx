// app/(dashboard)/_layout.jsx
import { Tabs, useRouter, useSegments } from 'expo-router';
import { ActivityIndicator, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';

import UserOnly from '../../components/auth/UserOnly';
import { useUser } from '../../hooks/useUser';
import { useTheme } from '../../hooks/useTheme';
import { supabase } from '../../lib/supabase';
import FloatingTabBar from '../../components/design/FloatingTabBar';

export default function DashboardLayout() {
  const { colors: theme } = useTheme();
  const router = useRouter();
  const segments = useSegments();

  const { user } = useUser();
  const [role, setRole] = useState(null);

  // Track if we need to reset tabs when switching to them
  const [messagesNeedsReset, setMessagesNeedsReset] = useState(false);
  const [clientNeedsReset, setClientNeedsReset] = useState(false);
  const [quotesNeedsReset, setQuotesNeedsReset] = useState(false);

  // When navigating to nested routes, mark for reset
  useEffect(() => {
    const currentTab = segments[1];
    // If we're in messages nested route, mark that we need to reset when leaving
    if (currentTab === 'messages' && segments.length > 2) {
      setMessagesNeedsReset(true);
    }
    // If we're in client nested route, mark that we need to reset when leaving
    if (currentTab === 'client' && segments.length > 2) {
      setClientNeedsReset(true);
    }
    // If we're in quotes nested route (e.g. /quotes/[id]), mark for reset
    if (currentTab === 'quotes' && segments.length > 2) {
      setQuotesNeedsReset(true);
    }
  }, [segments]);

  // Pop all pushed screens in the current stack (returns true if anything was dismissed).
  // Falls back to router.replace for environments without dismissAll support.
  const popAllPushedScreens = (fallbackPath) => {
    try {
      if (typeof router.canDismiss === 'function' && router.canDismiss()) {
        router.dismissAll();
        return true;
      }
    } catch {}
    if (fallbackPath) router.replace(fallbackPath);
    return true;
  };

  // Handle tab press to reset to main screen
  const handleMessagesTabPress = () => {
    const currentTab = segments[1];

    // If already on messages tab in a nested route, pop the stack
    if (currentTab === 'messages' && segments.length > 2) {
      setMessagesNeedsReset(false);
      return popAllPushedScreens('/(dashboard)/messages');
    }

    // Coming from another tab with a queued reset
    if (currentTab !== 'messages' && messagesNeedsReset) {
      setMessagesNeedsReset(false);
      // Let default tab switch happen, then dismiss pushed screens after focus
      setTimeout(() => { try { if (router.canDismiss?.()) router.dismissAll(); } catch {} }, 50);
      return false;
    }

    return false;
  };

  // Handle client tab press to reset to home screen
  const handleClientTabPress = () => {
    const currentTab = segments[1];

    // If already on client tab in a nested route, pop all pushed screens
    if (currentTab === 'client' && segments.length > 2) {
      setClientNeedsReset(false);
      return popAllPushedScreens('/client');
    }

    // Coming from another tab with a queued reset
    if (currentTab !== 'client' && clientNeedsReset) {
      setClientNeedsReset(false);
      setTimeout(() => { try { if (router.canDismiss?.()) router.dismissAll(); } catch {} }, 50);
      return false;
    }

    return false;
  };

  // Handle quotes/projects tab press to reset to index
  const handleQuotesTabPress = () => {
    const currentTab = segments[1];

    // If already on quotes tab in a nested route, pop the stack
    if (currentTab === 'quotes' && segments.length > 2) {
      setQuotesNeedsReset(false);
      return popAllPushedScreens('/(dashboard)/quotes');
    }

    // Coming from another tab with a queued reset
    if (currentTab !== 'quotes' && quotesNeedsReset) {
      setQuotesNeedsReset(false);
      setTimeout(() => { try { if (router.canDismiss?.()) router.dismissAll(); } catch {} }, 50);
      return false;
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
        tabBar={(props) => <FloatingTabBar {...props} />}
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: theme.iconColorFocused,
          tabBarInactiveTintColor: theme.iconColor,
          sceneStyle: { backgroundColor: theme.background },
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
          listeners={{
            tabPress: (e) => {
              if (handleQuotesTabPress()) {
                e.preventDefault();
              }
            },
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
          listeners={{
            tabPress: (e) => {
              if (handleClientTabPress()) {
                e.preventDefault();
              }
            },
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
