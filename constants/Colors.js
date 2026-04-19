// Settled design tokens — flat, dark-first.
// Palette follows the redesign spec: one primary, status colours only
// as left-bars / dots. Legacy field names are preserved on each palette
// so existing screens keep compiling while screens are migrated.

export const Colors = {
  // Brand primary — used sparingly: active tab, FAB, primary CTA, link.
  primary: "#7C5CFF",
  primaryDeep: "#6849A7",
  primaryTint: "rgba(124,92,255,0.12)",

  tint: "#7C5CFF",

  // Semantic status — the ONLY other colours allowed in the app.
  status: {
    pending:   "#F4B740", // awaiting
    quoted:    "#7C5CFF", // quoted (matches primary)
    accepted:  "#3DCF89", // accepted / completed
    declined:  "#FF5A5F", // declined / expired / error
    scheduled: "#5BB3FF", // scheduled / in progress
  },

  // Back-compat aliases (some legacy screens still read these).
  warning: "#FF5A5F",
  success: "#3DCF89",

  // ────────────────────────────────────────────
  // DARK palette (primary experience)
  // ────────────────────────────────────────────
  dark: {
    bg:            "#0B0B0D",
    elevate:       "#141418",
    elevate2:      "#1C1C22",
    border:        "rgba(255,255,255,0.06)",
    borderStrong:  "rgba(255,255,255,0.12)",
    divider:       "rgba(255,255,255,0.04)",
    text:          "#F5F5F7",
    textMid:       "#A6A6AD",
    textMuted:     "#6B6B75",
    textFaint:     "#4A4A55",
    chipBg:        "rgba(255,255,255,0.05)",
    pillBg:        "#1C1C22",
    pillActive:    "#2A2A33",
    tint:          "#7C5CFF",

    // Legacy aliases (kept so unmigrated screens render sensibly in dark)
    title:              "#F5F5F7",
    subtitle:           "#A6A6AD",
    background:         "#0B0B0D",
    secondaryBackground:"#141418",
    navBackground:      "#0B0B0D",
    uiBackground:       "#141418",
    cardBackground:     "#141418",
    iconColor:          "#A6A6AD",
    iconColorFocused:   "#F5F5F7",
  },

  // ────────────────────────────────────────────
  // LIGHT palette
  // ────────────────────────────────────────────
  light: {
    bg:            "#FAFAFB",
    elevate:       "#FFFFFF",
    elevate2:      "#F4F4F6",
    border:        "rgba(15,15,20,0.08)",
    borderStrong:  "rgba(15,15,20,0.14)",
    divider:       "rgba(15,15,20,0.06)",
    text:          "#0B0B0D",
    textMid:       "#5C5C66",
    textMuted:     "#8A8A94",
    textFaint:     "#C2C2CA",
    chipBg:        "rgba(15,15,20,0.04)",
    pillBg:        "#F0F0F3",
    pillActive:    "#FFFFFF",
    tint:          "#7C5CFF",

    // Legacy aliases
    title:              "#0B0B0D",
    subtitle:           "#5C5C66",
    background:         "#FFFFFF",
    secondaryBackground:"#F4F4F6",
    navBackground:      "#FFFFFF",
    uiBackground:       "#FFFFFF",
    cardBackground:     "#FFFFFF",
    iconColor:          "#0B0B0D",
    iconColorFocused:   "#7C5CFF",
  },
};
