// app/(dashboard)/_layout.jsx
//
// Trade-only tab bar. Settled mobile is no longer multi-role — the
// homeowner side has moved off to the web directory project. Before
// this branch, this layout fetched the user's role and conditionally
// rendered either Home/Projects (trade) or Home/Projects (client) tabs
// while gating the screen behind a LayoutGateSkeleton during the role
// fetch. None of that is needed any more — every signed-in user on
// this app is a trade, so the tabs render statically.
//
// What was removed:
//   · role state + useEffect that selected from `profiles.role`
//   · isTrades branching on Tabs.Screen `href`
//   · `client` and `myquotes` Tabs.Screen entries (those route groups
//     are deleted in this same change)
//   · clientNeedsReset state + handleClientTabPress handler
//   · LayoutGateSkeleton wrapper that hid the screen during role fetch
//
// What stayed:
//   · UserOnly auth gate (kicks unauthenticated visitors back to /login)
//   · Reset-on-tab-press handlers for messages + quotes (so tapping
//     the active tab pops back to the stack root, like Twitter / IG)
//   · The hidden /sales route (still a deep link, just not a tab)
import { Tabs, useRouter, useSegments } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';

import UserOnly from '../../components/auth/UserOnly';
import { useTheme } from '../../hooks/useTheme';
import FloatingTabBar from '../../components/design/FloatingTabBar';
import { getPendingInviteToken } from '../../lib/api/invites';

// NOTE — hiding the floating pill on nested sub-routes (settings, chat
// threads, detail pages) is handled inside FloatingTabBar itself via
// getFocusedRouteNameFromRoute. Doing it there lets the `options` here
// stay plain object literals, which is required for expo-router's
// `href: null` → hide-tab shortcut to work (that transformation is
// skipped when `options` is a function).

export default function DashboardLayout() {
  const { colors: theme } = useTheme();
  const router = useRouter();
  const segments = useSegments();

  // Track if we need to reset tabs when switching to them.
  const [messagesNeedsReset, setMessagesNeedsReset] = useState(false);
  const [quotesNeedsReset, setQuotesNeedsReset] = useState(false);

  // Post-auth invite handoff. If a trade tapped a `tradifyapp://invite`
  // deep link while signed out, the invite screen parked the token in
  // SecureStore and sent them to log in / register. Auth then lands
  // them in the dashboard (GuestOnly bounces to /profile). This one-
  // shot effect catches the parked token on that first dashboard mount
  // and bounces them back to /invite to finish accepting. The token is
  // cleared by the invite screen on accept/decline, so a normal login
  // with no pending invite is a no-op here.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const pending = await getPendingInviteToken();
      if (!cancelled && pending) {
        router.replace('/invite');
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // When navigating to nested routes, mark for reset
  useEffect(() => {
    const currentTab = segments[1];
    // If we're in messages nested route, mark that we need to reset when leaving
    if (currentTab === 'messages' && segments.length > 2) {
      setMessagesNeedsReset(true);
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

  return (
    <UserOnly>
      <Tabs
        tabBar={(props) => <FloatingTabBar {...props} />}
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: theme.iconColorFocused,
          tabBarInactiveTintColor: theme.iconColor,
          // react-navigation reads `height` from tabBarStyle for layout —
          // 0 tells it "don't reserve a slot". The actual pill is rendered
          // absolutely by FloatingTabBar so it floats over scene content.
          tabBarStyle: {
            height: 0,
            backgroundColor: 'transparent',
            borderTopWidth: 0,
            elevation: 0,
            shadowColor: 'transparent',
            shadowOpacity: 0,
          },
          sceneStyle: { backgroundColor: theme.background },
        }}
      >
        {/* ===== HOME (Trade dashboard) ===== */}
        <Tabs.Screen
          name="trades"
          options={{
            title: 'Home',
            tabBarIcon: ({ focused, color, size = 24 }) => (
              <Ionicons
                size={size}
                name={focused ? 'home-sharp' : 'home-outline'}
                color={color}
              />
            ),
          }}
        />

        {/* ===== PROJECTS (Quote requests + active projects) ===== */}
        <Tabs.Screen
          name="quotes"
          options={{
            title: 'Projects',
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

        {/* ===== MESSAGES ===== */}
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

        {/* ===== PROFILE ===== */}
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

        {/* Hidden routes — accessible by deep link, not shown in tabs. */}
        <Tabs.Screen name="sales" options={{ href: null }} />
      </Tabs>
    </UserOnly>
  );
}
