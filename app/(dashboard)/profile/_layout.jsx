// app/(dashboard)/profile/_layout.jsx
import { Stack } from "expo-router";

export default function ProfileLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="photo" options={{ presentation: "card" }} />
      <Stack.Screen name="change-email" options={{ presentation: "card" }} />
      <Stack.Screen name="change-phone" options={{ presentation: "card" }} />
      <Stack.Screen name="business" options={{ presentation: "card" }} />
      <Stack.Screen name="service-areas" options={{ presentation: "card" }} />
      <Stack.Screen name="address" options={{ presentation: "card" }} />
      <Stack.Screen name="notifications" options={{ presentation: "card" }} />
      <Stack.Screen
        name="signout"
        options={{
          presentation: "transparentModal",
          animation: "fade",
        }}
      />
    </Stack>
  );
}
