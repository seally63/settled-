// components/KeyboardDoneButton.jsx
// Intentionally neutralised. The floating iOS "Done" accessory bar
// above the keyboard isn't part of the redesign — dismissing the
// keyboard works via tap-outside, drag, or the Return key on
// keyboards that have one. Multiple screens still import this file
// for backward-compat (they pass `inputAccessoryViewID={KEYBOARD_DONE_ID}`
// on their TextInputs). With no InputAccessoryView rendered for that
// nativeID anywhere in the tree, the prop is a no-op and nothing
// appears above the keyboard. Each screen can be cleaned up
// independently later, but this one change removes every Done bar
// across the app in a single sweep.
//
// Why it mattered: with the new architecture enabled (app.json
// newArchEnabled: true), an iOS InputAccessoryView mounted on one
// screen can ghost onto subsequent screens after navigation — even
// when the new screen never imports it. Killing the renderer at
// source is the reliable way to make sure no Done bar appears
// anywhere in the app until we explicitly want one back.
//
// If a future screen genuinely needs a keyboard toolbar, build a
// dedicated component per-screen rather than reviving this one —
// the generic "Done" affordance was adding chrome to screens that
// don't need it.

import React from "react";

export const KEYBOARD_DONE_ID = "keyboard-done-accessory";

export function KeyboardDoneButton() {
  return null;
}

export default KeyboardDoneButton;
