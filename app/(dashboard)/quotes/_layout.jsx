//app/(dashboard)/quotes/_layout.jsx
// Trade-only route - redirects clients to their home

import { Stack, Redirect } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, View, useColorScheme } from 'react-native';

import { supabase } from '../../../lib/supabase';
import { useUser } from '../../../hooks/useUser';
import { Colors } from '../../../constants/Colors';

export default function QuotesStackLayout() {
  const { user } = useUser();
  const scheme = useColorScheme();
  const theme = Colors[scheme] ?? Colors.light;

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
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator size="large" color={theme.iconColorFocused || '#000'} />
      </View>
    );
  }

  // Client users should not be in /quotes/* - redirect to client home
  if (role === 'client') return <Redirect href="/client" />;

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        animation: 'slide_from_right',
      }}
    />
  );
}
