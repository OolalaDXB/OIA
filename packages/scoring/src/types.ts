/**
 * Scoring operates on primitive, pre-normalized signals so it stays pure and
 * decoupled from domain shapes (no ProjectProfile import). Turning a profile +
 * opportunity + claims into these signals is the job of @oia/intelligence.
 */

/** All values 0..1 unless noted. */
export interface RelevanceSignals {
  sectorOverlap: number;
  geographyOverlap: number;
  fundingTypeMatch: number;
  amountFit: number;
  stageFit: number;
  /** A hard exclusion term from the profile was found → clamp relevance low. */
  hardExclusionHit: boolean;
}

export type EligibilityVerdict = "eligible" | "likely" | "unknown" | "ineligible";

export interface EligibilityInput {
  verdict: EligibilityVerdict;
  /** Number of criteria that could not be resolved (met === null). */
  unresolvedCriteria: number;
  totalCriteria: number;
}

/** Win-potential signals; unknown factors should be passed as `null` (→ neutral). */
export interface WinSignals {
  fitStrength: number | null;
  competition: number | null; // lower competition = higher value; pass the *favourability* 0..1
  amountEffort: number | null;
  trackRecord: number | null;
  timingHeadroom: number | null;
}

/** Statistics over the opportunity's typed claims, for info-confidence. */
export interface ClaimStats {
  /** Key fields (deadline, open_status, …) backed by confirmed_official_fact w/ evidence. */
  keyFieldsConfirmed: number;
  keyFieldsTotal: number;
  hasReachablePrimaryEvidence: boolean;
  /** 0..1, 1 = fresh, decays with age of the primary evidence. */
  evidenceRecency: number;
  inferenceOnKeyFields: number;
  unresolvedOnKeyFields: number;
  /** Source kind weighting: official_programme=1, aggregator=0.7, manual=0.5. */
  sourceKindWeight: number;
}

export interface OpportunityScores {
  relevance: number; // 0..100
  eligibility: number; // 0..100
  winPotential: number; // 0..100
  infoConfidence: number; // 0..100
  modelVersion: string;
  breakdown: Record<string, number>;
}

export interface ScoringInput {
  relevance: RelevanceSignals;
  eligibility: EligibilityInput;
  win: WinSignals;
  claims: ClaimStats;
}

/** Inputs to the hard PURSUE gate. All booleans are verified facts, not scores. */
export interface GateInput {
  accessiblePrimarySource: boolean;
  /** deadline present AND corroborated in stored evidence. */
  verifiedDeadline: boolean;
  confirmedOpen: boolean;
  eligibilityAssessed: boolean; // verdict in {eligible, likely} with criteria
  exactNextAction: boolean; // non-empty concrete next action exists
  infoConfidence: number; // 0..100
  confidenceFloor: number; // e.g. 70
}

export interface GateReport {
  accessiblePrimarySource: boolean;
  verifiedDeadline: boolean;
  confirmedOpen: boolean;
  eligibilityAssessed: boolean;
  exactNextAction: boolean;
  sufficientConfidence: boolean;
  passed: boolean;
  failedReasons: string[];
}

export type RecommendationAction = "PURSUE" | "CONSIDER" | "MONITOR" | "DISCARD";
