// app/(public)/_layout.jsx
//
// The (public) route group is intentionally UNGATED — no GuestOnly,
// no UserOnly. Screens here are reachable whether or not a trade is
// signed in. That's exactly what the invite-preview flow needs: a
// trade taps a deep link, sees the enquiry preview, and only then
// decides to register / log in.
//
// This layout exists so the group has its own Stack with headers off
// (the root layout doesn't declare (public), and without a layout the
// screens would inherit the default header).
import { Stack } from "expo-router";

export default function PublicLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
