// app/(dashboard)/trades/_layout.jsx
//
// Stack layout for the trade home tab. Settled mobile is now trade-
// only, so the legacy `if (role === 'client') redirect` was removed —
// every signed-in user that lands here is a trade. The remaining
// concern is the approval gate: a freshly-registered trade whose
// admin review hasn't approved them yet sees PendingApprovalScreen
// instead of the actual home tab.

import { Stack } from 'expo-router';
import { useEffect, useState } from 'react';

import { supabase } from '../../../lib/supabase';
import { useUser } from '../../../hooks/useUser';
import ThemedView from '../../../components/ThemedView';
import { LayoutGateSkeleton } from '../../../components/Skeleton';
import PendingApprovalScreen from './pending-approval';

export default function TradesStackLayout() {
  const { user } = useUser();

  const [approvalStatus, setApprovalStatus] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        if (!user?.id) {
          if (alive) setApprovalStatus('approved');
          return;
        }
        const { data } = await supabase
          .from('profiles')
          .select('approval_status')
          .eq('id', user.id)
          .maybeSingle();
        if (alive) {
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
      <ThemedView style={{ flex: 1 }}>
        <LayoutGateSkeleton />
      </ThemedView>
    );
  }

  // Unapproved trades see the pending screen.
  if (approvalStatus !== 'approved') {
    return <PendingApprovalScreen status={approvalStatus} />;
  }

  return <Stack screenOptions={{ headerShown: false }} />;
}
