// app/(dashboard)/client/myquotes/_layout.jsx
import { Stack } from 'expo-router';

export default function ClientMyQuotesLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="[id]" />
      <Stack.Screen name="request" />
    </Stack>
  );
}
