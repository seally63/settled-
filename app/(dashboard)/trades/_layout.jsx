// app/(dashboard)/trades/_layout.jsx
// Trade-only route - redirects clients to their home
// Gates unapproved trades to a pending screen

import { Stack, Redirect } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, View, useColorScheme } from 'react-native';

import { supabase } from '../../../lib/supabase';
import { useUser } from '../../../hooks/useUser';
import { Colors } from '../../../constants/Colors';
import PendingApprovalScreen from './pending-approval';

export default function TradesStackLayout() {
  const { user } = useUser();
  const scheme = useColorScheme();
  const theme = Colors[scheme] ?? Colors.light;

  const [role, setRole] = useState(null);
  const [approvalStatus, setApprovalStatus] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        if (!user?.id) {
          if (alive) {
            setRole('trades');
            setApprovalStatus('approved');
          }
          return;
        }
        const { data, error } = await supabase
          .from('profiles')
          .select('role, approval_status')
          .eq('id', user.id)
          .maybeSingle();
        if (alive) {
          setRole(error ? 'trades' : (data?.role || 'client'));
          setApprovalStatus(data?.approval_status || 'pending');
        }
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

  // Client users should not be in /trades/* - redirect to client home
  if (role === 'client') return <Redirect href="/client" />;

  // Unapproved trades see the pending screen
  if (approvalStatus !== 'approved') {
    return <PendingApprovalScreen status={approvalStatus} />;
  }

  return <Stack screenOptions={{ headerShown: false }} />;
}
