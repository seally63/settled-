// app/(dashboard)/client/myquotes/request/_layout.jsx
import { Stack } from 'expo-router';

export default function ClientRequestLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="[id]" />
    </Stack>
  );
}
