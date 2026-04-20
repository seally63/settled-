// app/index.jsx
// Cold-start entry point. The legacy LBV-logo welcome screen has been
// removed per product — users go straight to the quick-login screen
// instead. UserContext / dashboard guards take over from there if a
// session already exists.
import { Redirect } from "expo-router";

export default function Index() {
  return <Redirect href="/login" />;
}
