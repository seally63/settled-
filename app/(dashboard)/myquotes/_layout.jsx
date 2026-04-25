// app/(dashboard)/myquotes/_layout.jsx
import { Stack, Redirect } from 'expo-router';
import { useEffect, useState } from 'react';
import { supabase } from '../../../lib/supabase';
import { useUser } from '../../../hooks/useUser';
import ThemedView from '../../../components/ThemedView';
import { LayoutGateSkeleton } from '../../../components/Skeleton';

export default function MyQuotesClientOnly() {
  const { user } = useUser();
  const [role, setRole] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        if (!user?.id) {
          if (alive) setRole('client'); // default to client while auth boots
          return;
        }
        const { data, error } = await supabase
          .from('profiles')
          .select('role')
          .eq('id', user.id)
          .maybeSingle();
        if (alive) setRole(error ? 'client' : (data?.role || 'client'));
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

  // Trades users should not access My Quotes at all
  if (role === 'trades') return <Redirect href="/quotes" />;

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        animation: 'slide_from_right',
      }}
    >
      <Stack.Screen name="index" />
      <Stack.Screen name="completion-response" />
      <Stack.Screen name="completion-success" />
      <Stack.Screen name="report-issue" />
      <Stack.Screen name="leave-review" />
      <Stack.Screen name="appointment-response" />
      <Stack.Screen name="[id]" />
      <Stack.Screen name="request" />
      <Stack.Screen name="quotes" />
    </Stack>
  );
}

