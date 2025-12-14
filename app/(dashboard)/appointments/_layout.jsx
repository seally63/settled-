// app/(dashboard)/appointments/_layout.jsx
import { Stack } from 'expo-router';

export default function AppointmentsLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      {/* List of appointments (trade or client view depending on folder) */}
      <Stack.Screen name="index" />
      {/* Optional: appointment detail route, create later */}
      <Stack.Screen name="[id]" />
    </Stack>
  );
}
