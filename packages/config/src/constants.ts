/**
 * Scoring / gate constants. Changing these should bump SCORING_MODEL_VERSION so
 * stored scores remain comparable to the model that produced them.
 * See docs/architecture/05-scoring-model.md.
 */

export const SCORING_MODEL_VERSION = "v1";

/** Info-confidence (0..100) required for the PURSUE gate to pass. */
export const DEFAULT_CONFIDENCE_FLOOR = 70;

/** Relevance factor weights (sum ≈ 1.0). */
export const RELEVANCE_WEIGHTS = {
  sector: 0.35,
  geography: 0.25,
  fundingType: 0.2,
  amount: 0.1,
  stage: 0.1,
} as const;

/** Win-potential factor weights (sum ≈ 1.0). */
export const WIN_WEIGHTS = {
  fitStrength: 0.3,
  competition: 0.2,
  amountEffort: 0.2,
  trackRecord: 0.2,
  timingHeadroom: 0.1,
} as const;

/** Key fields used by the information-confidence score and the gate. */
export const KEY_FIELDS = [
  "deadline",
  "open_status",
  "eligibility",
  "funder",
  "amount",
  "primary_url",
] as const;

export type KeyField = (typeof KEY_FIELDS)[number];
