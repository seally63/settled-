import { Stack, Redirect } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, View, useColorScheme } from 'react-native';

import { supabase } from '../../../lib/supabase';          // ✅ up three levels from /client
import { useUser } from '../../../hooks/useUser';          // ✅ up three levels
import { Colors } from '../../../constants/Colors';        // ✅ up three levels

export default function ClientStackLayout() {
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
          if (alive) setRole('client'); // avoid flicker
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
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator size="large" color={theme.iconColorFocused || '#000'} />
      </View>
    );
  }

  // Trades users should not be in /client/*
  if (role === 'trades') return <Redirect href="/quotes" />;

  return (
    <Stack
      screenOptions={{ headerShown: false }}
      initialRouteName="index"
    >
      <Stack.Screen name="index" />
      <Stack.Screen name="clienthome" />
      <Stack.Screen name="myquotes" />
      <Stack.Screen name="find-business" />
      <Stack.Screen name="trade-profile" />
      <Stack.Screen
        name="search-modal"
        options={{
          presentation: "modal",
          animation: "slide_from_bottom",
        }}
      />
    </Stack>
  );
}




