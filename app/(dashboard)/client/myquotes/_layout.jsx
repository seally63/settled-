// app/(dashboard)/client/myquotes/_layout.jsx
import { Stack } from 'expo-router';

export default function ClientMyQuotesLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        animation: 'slide_from_right',
      }}
    >
      <Stack.Screen name="index" />
      <Stack.Screen name="completion-response" />
      <Stack.Screen name="completion-success" />
      <Stack.Screen name="report-issue" />
      <Stack.Screen name="leave-review" />
      <Stack.Screen name="appointment-response" />
      <Stack.Screen name="[id]" />
      <Stack.Screen name="request" />
    </Stack>
  );
}
