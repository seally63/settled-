//app/(dashboard)/quotes/_layout.jsx
// Trade-only route - redirects clients to their home

import { Stack, Redirect } from 'expo-router';
import { useEffect, useState } from 'react';

import { supabase } from '../../../lib/supabase';
import { useUser } from '../../../hooks/useUser';
import ThemedView from '../../../components/ThemedView';
import { LayoutGateSkeleton } from '../../../components/Skeleton';

export default function QuotesStackLayout() {
  const { user } = useUser();

  const [role, setRole] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        if (!user?.id) {
          // Default to trades to avoid flicker for trades users
          if (alive) setRole('trades');
          return;
        }
        const { data, error } = await supabase
          .from('profiles')
          .select('role')
          .eq('id', user.id)
          .maybeSingle();
        if (alive) setRole(error ? 'trades' : (data?.role || 'client'));
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [user?.id]);

  if (loading) {
    return (
      <ThemedView style={{ flex: 1 }}>
        <LayoutGateSkeleton />
      </ThemedView>
    );
  }

  // Client users should not be in /quotes/* - redirect to client home
  if (role === 'client') return <Redirect href="/client" />;

  return (
    <Stack
      // `initialRouteName` is critical here: once you declare any
      // `<Stack.Screen>` child below, expo-router falls back to the
      // FIRST declared child as the initial route unless told
      // otherwise. Without this line, tapping the Projects tab would
      // boot the stack into /quotes/create instead of /quotes (index).
      initialRouteName="index"
      screenOptions={{
        headerShown: false,
        // Default for main tab + list navigation.
        animation: 'slide_from_right',
      }}
    >
      <Stack.Screen name="index" />
      {/* Everything inherits slide_from_right EXCEPT the full-screen
          action pages launched from the FAB (quote builder + schedule).
          Those feel more like a new sheet/action than a push, so they
          fade in from centre (no sliding).                           */}
      <Stack.Screen name="create" options={{ animation: 'fade' }} />
      <Stack.Screen name="schedule" options={{ animation: 'fade' }} />
    </Stack>
  );
}
