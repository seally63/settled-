// hooks/useHideTabBar.js
//
// NO-OP. Earlier versions of this hook called
// `navigation.getParent()?.setOptions({ tabBarStyle: ... })` to hide the
// floating bar on detail screens. In react-navigation v7 with a custom
// tabBar component, that pattern poisons the navigator's global state
// and breaks tab tap-to-navigate (the bar stays visible but the tap
// targets misalign / wedge).
//
// We now intentionally let the floating tab bar STAY VISIBLE on detail
// screens. Bottom docks (Accept/Decline, Send quote, Draft quote, etc.)
// are positioned ABOVE the tab bar via a constant offset so they stay
// reachable. This file is kept so existing call sites don't need to be
// touched yet — the hook simply does nothing.
//
// To remove a dock-cover collision on a new screen, position your dock
// at:  bottom: insets.bottom + 92  (FLOATING_BAR_HEIGHT)
// instead of bottom: 0.

export default function useHideTabBar() {
  // intentionally empty
}

// Total height the floating tab bar occupies above the safe-area inset.
// Use this to lift bottom docks so they don't get covered.
export const FLOATING_BAR_HEIGHT = 92;
