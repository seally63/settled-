// app/(dashboard)/myquotes/quotes/_layout.jsx
import { Stack } from 'expo-router';

export default function QuotesListLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="[requestId]" />
    </Stack>
  );
}
