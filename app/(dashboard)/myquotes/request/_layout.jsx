// app/(dashboard)/myquotes/request/_layout.jsx
import { Stack } from 'expo-router';

export default function MyQuotesRequestLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="[id]" />
    </Stack>
  );
}
