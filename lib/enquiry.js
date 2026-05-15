// lib/enquiry.js
// Shared helpers for reading the web-side enquiry data model.
//
// The web consultation form packs several free-text fields into ONE
// `quote_requests.details` column as `### Heading` Markdown blocks, and
// `budget_band` now stores full labels but legacy rows may still hold
// shorthand. These helpers normalise both so every screen that renders
// an enquiry stays consistent.

/**
 * Split the `details` Markdown blob into a { heading: body } map.
 *
 * The blob looks like:
 *   ### Current state
 *   Tired kitchen, units from the 90s...
 *   ### Must-haves
 *   Island, induction hob...
 *
 * Parsing rule (per the backend contract): a new section starts on any
 * line matching `^### (.+)$`. Everything until the next such line is
 * that section's body. Lines before the first heading are ignored.
 *
 * @param {string} text - the raw `quote_requests.details` value
 * @returns {Record<string,string>} heading → trimmed body
 */
export function parseDetails(text) {
  const out = {};
  if (!text || typeof text !== "string") return out;

  const lines = text.split(/\r?\n/);
  let currentHeading = null;
  let buffer = [];

  const flush = () => {
    if (currentHeading) {
      out[currentHeading] = buffer.join("\n").trim();
    }
    buffer = [];
  };

  for (const line of lines) {
    const m = line.match(/^###\s+(.+?)\s*$/);
    if (m) {
      flush();
      currentHeading = m[1].trim();
    } else if (currentHeading) {
      buffer.push(line);
    }
  }
  flush();

  return out;
}

// The canonical headings the web form emits. Exported so screens can
// reference them without hard-coding strings everywhere — and so the
// "private" one is impossible to render on a homeowner-facing surface
// by accident (this app is trade-only, but the intent stays explicit).
export const DETAIL_HEADINGS = {
  CURRENT_STATE: "Current state",
  MUST_HAVES: "Must-haves",
  NICE_TO_HAVES: "Nice-to-haves",
  MATERIALS_TIER: "Materials tier",
  HARD_REQUIREMENTS: "Hard requirements",
  RED_FLAGS: "Red flags to avoid",
  TRADE_ONLY_NOTE: "Notes for the trade (private)",
};

// Legacy `budget_band` shorthand → full label. Newer rows already store
// the full label, so anything not in this map is returned as-is.
const BUDGET_LEGACY_MAP = {
  "<£250": "Under £250",
  "£250–£500": "£250 – £500",
  "£500–£1k": "£500 – £1,000",
  "£1k–£3k": "£1,000 – £3,000",
  "£3k–£7.5k": "£3,000 – £7,500",
  "£7.5k–£15k": "£7,500 – £15,000",
  ">£15k": "£15,000+",
  "Not specified": "Not sure",
};

/**
 * Normalise a `budget_band` value to its full display label.
 * Handles both the current full labels ("£15,000+") and the legacy
 * shorthand ("£7.5k–£15k", ">£15k"). Dash variants (hyphen / en-dash)
 * are normalised before the lookup so a stray hyphen doesn't miss.
 *
 * @param {string|null|undefined} raw
 * @returns {string|null} full label, or null when nothing was stored
 */
export function formatBudgetBand(raw) {
  if (raw == null) return null;
  const trimmed = String(raw).trim();
  if (!trimmed) return null;

  // Direct hit on the legacy map.
  if (BUDGET_LEGACY_MAP[trimmed]) return BUDGET_LEGACY_MAP[trimmed];

  // Tolerate a plain hyphen where the map key uses an en-dash.
  const enDashed = trimmed.replace(/-/g, "–");
  if (BUDGET_LEGACY_MAP[enDashed]) return BUDGET_LEGACY_MAP[enDashed];

  // Already a full label (or an unknown value) — show as-is.
  return trimmed;
}
