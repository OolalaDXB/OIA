import { KIND_PROFILES, normalizeKind } from "@oia/ingestion/opportunity-kinds";

/**
 * Plain language.
 *
 * The console had grown a vocabulary you had to already know: INVESTIGATE,
 * MANUAL_REVIEW_REQUIRED, PURSUE-eligible, gate, provenance, aggregator-only.
 * Every one of those is precise, and precision is the point of this product —
 * but precision in the DATA does not require jargon in the INTERFACE. The
 * underlying values are untouched; only what a human reads changes.
 *
 * Where a term carries a real distinction, the plain wording keeps it. "Not
 * verified yet" is not softer than MANUAL_REVIEW_REQUIRED, it is the same claim
 * in words that do not need a manual.
 */

export const RECOMMENDATION: Record<string, { label: string; meaning: string }> = {
  PURSUE: { label: "Go after it", meaning: "Everything checks out and a human approved it." },
  PARTNER: { label: "Needs a partner", meaning: "Worth doing, but not alone." },
  INVESTIGATE: { label: "Needs a look", meaning: "Something is missing before this can be decided." },
  MONITOR: { label: "Keep an eye on it", meaning: "Nothing to do today." },
  REJECT: { label: "Not for us", meaning: "Ruled out." },
};

export const VERIFICATION: Record<string, { label: string; meaning: string }> = {
  VERIFIED: { label: "Verified", meaning: "A human confirmed the source is what it claims to be." },
  MANUAL_REVIEW_REQUIRED: {
    label: "Not verified yet",
    meaning: "The machine went as far as it honestly can. A human has to confirm the source.",
  },
  OFFICIAL_SOURCE_FOUND: { label: "Official page found", meaning: "The real page was located but not yet confirmed." },
  DISCOVERED_UNVERIFIED: { label: "Just a lead", meaning: "Seen somewhere, nothing checked." },
  VERIFICATION_FAILED: { label: "Does not check out", meaning: "The page does not match what it claims." },
  SOURCE_UNAVAILABLE: { label: "Page unreachable", meaning: "The source could not be retrieved." },
  REJECTED: { label: "Rejected", meaning: "Ruled out at verification." },
};

export const REVIEW: Record<string, string> = {
  PENDING: "Not triaged",
  APPROVE: "You approved it",
  REJECT: "You rejected it",
  NEEDS_VERIFICATION: "You asked for checks",
  COMMENT: "You commented",
};

export const FRESHNESS: Record<string, string> = {
  FRESH: "Open",
  CLOSING_SOON: "Closing soon",
  EXPIRED: "Closed",
  NO_DEADLINE: "No closing date",
};

/** The nine hard conditions, as questions rather than field names. */
export const GATE_CONDITION: Record<string, string> = {
  accessiblePrimarySource: "We have the actual source",
  verifiedSource: "A human confirmed the source",
  verifiedDeadline: "The closing date is confirmed",
  notExpired: "It has not closed",
  eligibilityAssessed: "Someone judged whether we can apply",
  notAggregatorOnly: "It is not just a listing on an aggregator",
  notClosedCall: "The call is still open",
  hasExactNextAction: "There is a specific next step",
  sufficientConfidence: "The information is good enough to act on",
};

export const GATE_FAILURE: Record<string, string> = {
  "no accessible primary source": "we do not have the source itself",
  "source not human-VERIFIED": "nobody has confirmed the source yet",
  "no verified, non-conflicting, unexpired deadline": "the closing date is unconfirmed or contradictory",
  "opportunity is expired": "it has closed",
  "application eligibility is UNKNOWN": "nobody has judged whether we can apply",
  "aggregator-only lead cannot be pursued": "we only have an aggregator listing, not the real call",
  "call is closed": "the call is closed",
  "no exact next action": "there is no specific next step written down",
};

/** Turn a gate failure into something a person can act on. */
export function plainFailure(reason: string): string {
  if (GATE_FAILURE[reason]) return GATE_FAILURE[reason]!;
  const confidence = reason.match(/^info confidence (\d+) < floor (\d+)$/);
  if (confidence) return `the information is too thin to act on (${confidence[1]} out of the ${confidence[2]} needed)`;
  return reason;
}

export function recommendationLabel(value: string): string {
  return RECOMMENDATION[value]?.label ?? value;
}

export function verificationLabel(value: string): string {
  return VERIFICATION[value]?.label ?? value;
}

export function kindLabel(value: string | undefined): string {
  return KIND_PROFILES[normalizeKind(value)].label;
}

export function kindMeaning(value: string | undefined): string {
  return KIND_PROFILES[normalizeKind(value)].description;
}

/** "in 5 days", "3 days ago" — a date nobody has to subtract in their head. */
export function relativeDays(days: number | null): string {
  if (days === null) return "";
  if (days === 0) return "today";
  if (days === 1) return "tomorrow";
  if (days === -1) return "yesterday";
  return days > 0 ? `in ${days} days` : `${Math.abs(days)} days ago`;
}
