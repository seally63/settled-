// Settled project-status colour system — single source of truth.
//
// Both POVs (trade and client) must show the SAME colour for the same
// underlying status. Labels can differ ("New enquiry" vs "Enquiry sent")
// but the colour chip on the Projects-tab card is identical on both
// sides so a user instantly recognises where a project is in its life.
//
// Six working colours + two edge cases:
//
//   PURPLE  (#7C5CFF, brand primary)  enquiry stage — the start of every
//                                      project. Fresh request, no quote yet.
//   BLUE    (#5BB3FF)                 quoting stage — a quote has been
//                                      drafted/sent/received/viewed but
//                                      not yet accepted.
//   TEAL    (#14B8A6)                 hired & scheduled — client has
//                                      accepted, appointment is booked.
//   AMBER   (#F4B740)                 in progress / awaiting payment —
//                                      job active, money outstanding.
//   GREEN   (#3DCF89)                 completed / reviewed — money in,
//                                      feedback captured, project closed.
//   RED     (#FF5A5F)                 declined / cancelled — killed
//                                      before completion.
//   GRAY    (#8A8A94)                 expired — timed out with no action.
//   CORAL   (#FF9B7A)                 issue reported — dispute / problem.

import { Colors } from "./Colors";

export const StatusColor = {
  ENQUIRY:        Colors.primary,   // #7C5CFF purple — brand
  QUOTING:        "#5BB3FF",        // blue
  HIRED:          "#14B8A6",        // teal
  IN_PROGRESS:    "#F4B740",        // amber
  COMPLETED:      "#3DCF89",        // green
  DECLINED:       "#FF5A5F",        // red
  EXPIRED:        "#8A8A94",        // gray
  ISSUE:          "#FF9B7A",        // coral
};

// Canonical status keys — use these when reasoning about a project's
// lifecycle. Both trade-side and client-side project rows collapse into
// these buckets.
export const ProjectStatus = {
  ENQUIRY:        "ENQUIRY",
  QUOTING:        "QUOTING",
  HIRED:          "HIRED",
  IN_PROGRESS:    "IN_PROGRESS",
  COMPLETED:      "COMPLETED",
  DECLINED:       "DECLINED",
  EXPIRED:        "EXPIRED",
  ISSUE:          "ISSUE",
};

// Legacy-stage → canonical-status mapping. The Projects tabs use
// a handful of UPPER_CASE stage codes that predate this palette
// (REQUEST/QUOTE/WORK/COMPLETED/EXPIRED/DECLINED on trade;
// POSTED/QUOTES/HIRED/DONE/EXPIRED/CANCELLED on client). This helper
// collapses them onto the canonical set above.
export function canonicalStatusFromTradeStage(stage, opts = {}) {
  const { isDraft = false, isAcceptedWithoutQuote = false } = opts;
  switch (stage) {
    case "REQUEST":   return ProjectStatus.ENQUIRY;
    case "QUOTE":     return isAcceptedWithoutQuote
                        ? ProjectStatus.QUOTING // accepted-no-quote still in quoting bucket
                        : ProjectStatus.QUOTING;
    case "WORK":      return ProjectStatus.HIRED;
    case "COMPLETED": return ProjectStatus.COMPLETED;
    case "DECLINED":  return ProjectStatus.DECLINED;
    case "EXPIRED":   return ProjectStatus.EXPIRED;
    default:          return ProjectStatus.ENQUIRY;
  }
}

export function canonicalStatusFromClientStage(stage) {
  switch (stage) {
    case "POSTED":    return ProjectStatus.ENQUIRY;
    case "QUOTES":    return ProjectStatus.QUOTING;
    case "HIRED":     return ProjectStatus.HIRED;
    case "DONE":      return ProjectStatus.COMPLETED;
    case "EXPIRED":   return ProjectStatus.EXPIRED;
    case "CANCELLED": return ProjectStatus.DECLINED;
    default:          return ProjectStatus.ENQUIRY;
  }
}

// Canonical-status → colour. Both POVs call this with the same status
// key so the chip colours line up.
export function colorForStatus(status) {
  switch (status) {
    case ProjectStatus.ENQUIRY:     return StatusColor.ENQUIRY;
    case ProjectStatus.QUOTING:     return StatusColor.QUOTING;
    case ProjectStatus.HIRED:       return StatusColor.HIRED;
    case ProjectStatus.IN_PROGRESS: return StatusColor.IN_PROGRESS;
    case ProjectStatus.COMPLETED:   return StatusColor.COMPLETED;
    case ProjectStatus.DECLINED:    return StatusColor.DECLINED;
    case ProjectStatus.EXPIRED:     return StatusColor.EXPIRED;
    case ProjectStatus.ISSUE:       return StatusColor.ISSUE;
    default:                        return StatusColor.EXPIRED;
  }
}
