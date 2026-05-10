//app/(dashboard)/quotes/_layout.jsx
//
// Trade-only stack. Settled mobile is now trade-only, so the role-
// fetch + client-redirect that used to live here was removed — every
// user that lands here is a trade by construction. The stack is just
// scenery now: initial route + a couple of FAB-launched fade animations.

import { Stack } from 'expo-router';

export default function QuotesStackLayout() {
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
