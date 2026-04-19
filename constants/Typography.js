// Settled typography tokens.
// Public Sans: titles, numerics, uppercase section labels.
// DM Sans: body copy, row titles, inputs.
//
// Font family strings match the names registered via useFonts in app/_layout.jsx.

export const FontFamily = {
  // Headings / numerics
  headerRegular:  "PublicSans_400Regular",
  headerMedium:   "PublicSans_500Medium",
  headerSemibold: "PublicSans_600SemiBold",
  headerBold:     "PublicSans_700Bold",
  headerExtra:    "PublicSans_800ExtraBold",
  // Body
  bodyRegular:  "DMSans_400Regular",
  bodyMedium:   "DMSans_500Medium",
  bodySemibold: "DMSans_600SemiBold",
  bodyBold:     "DMSans_700Bold",
};

// Variant presets. Numbers chosen to match the design spec (tight letter-spacing
// on large headers, positive tracking on uppercase labels).
export const TypeVariants = {
  // Page titles
  displayXL: {
    fontFamily: FontFamily.headerBold,
    fontSize: 32, lineHeight: 34, letterSpacing: -0.8,
  },
  display: {
    fontFamily: FontFamily.headerBold,
    fontSize: 28, lineHeight: 30, letterSpacing: -0.6,
  },
  h1: {
    fontFamily: FontFamily.headerBold,
    fontSize: 22, lineHeight: 26, letterSpacing: -0.4,
  },
  h2: {
    fontFamily: FontFamily.headerBold,
    fontSize: 17, lineHeight: 22, letterSpacing: -0.3,
  },
  h3: {
    fontFamily: FontFamily.headerSemibold,
    fontSize: 15, lineHeight: 20, letterSpacing: -0.2,
  },
  // Eyebrow / uppercase section label
  eyebrow: {
    fontFamily: FontFamily.headerBold,
    fontSize: 11, lineHeight: 13, letterSpacing: 1.2,
    textTransform: "uppercase",
  },
  // Body
  body: {
    fontFamily: FontFamily.bodyRegular,
    fontSize: 15, lineHeight: 21, letterSpacing: 0,
  },
  bodyStrong: {
    fontFamily: FontFamily.bodyMedium,
    fontSize: 15, lineHeight: 21, letterSpacing: 0,
  },
  bodySm: {
    fontFamily: FontFamily.bodyRegular,
    fontSize: 13, lineHeight: 18, letterSpacing: 0,
  },
  caption: {
    fontFamily: FontFamily.bodyRegular,
    fontSize: 12, lineHeight: 16, letterSpacing: 0.1,
  },
  captionMuted: {
    fontFamily: FontFamily.bodyRegular,
    fontSize: 11.5, lineHeight: 15, letterSpacing: 0.1,
  },
  // Buttons
  button: {
    fontFamily: FontFamily.headerSemibold,
    fontSize: 15, lineHeight: 18, letterSpacing: -0.1,
  },
  buttonSm: {
    fontFamily: FontFamily.headerSemibold,
    fontSize: 13, lineHeight: 16, letterSpacing: -0.1,
  },
  // Numerics — Public Sans tabular-friendly for totals / prices
  numericXL: {
    fontFamily: FontFamily.headerBold,
    fontSize: 44, lineHeight: 46, letterSpacing: -1.2,
  },
  numericLg: {
    fontFamily: FontFamily.headerBold,
    fontSize: 30, lineHeight: 32, letterSpacing: -1.0,
  },
};

// Radii spec from the redesign.
export const Radius = {
  sm: 8,
  md: 12,
  lg: 18,
  xl: 24,
  pill: 9999,
};

// Spacing scale.
export const Spacing = {
  xs: 4, sm: 8, md: 12, base: 16, lg: 20, xl: 24, xxl: 32, xxxl: 48,
};
