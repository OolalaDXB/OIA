import {
  RELEVANCE_WEIGHTS,
  WIN_WEIGHTS,
  SCORING_MODEL_VERSION,
} from "@oia/config";
import type {
  ScoringInput,
  OpportunityScores,
  RelevanceSignals,
  EligibilityInput,
  WinSignals,
  ClaimStats,
} from "./types";

const clamp = (n: number, lo = 0, hi = 100): number =>
  Math.max(lo, Math.min(hi, n));
const round1 = (n: number): number => Math.round(n * 10) / 10;

/** Relevance 0..100. Hard exclusion clamps the result to ≤ 20. */
export function scoreRelevance(s: RelevanceSignals): number {
  const w = RELEVANCE_WEIGHTS;
  const raw =
    s.sectorOverlap * w.sector +
    s.geographyOverlap * w.geography +
    s.fundingTypeMatch * w.fundingType +
    s.amountFit * w.amount +
    s.stageFit * w.stage;
  const score = raw * 100;
  return round1(s.hardExclusionHit ? Math.min(score, 20) : clamp(score));
}

/** Eligibility 0..100 from the assessment verdict + unresolved criteria. */
export function scoreEligibility(e: EligibilityInput): number {
  const base: Record<EligibilityInput["verdict"], number> = {
    eligible: 100,
    likely: 82,
    unknown: 40,
    ineligible: 8,
  };
  let score = base[e.verdict];
  // Each unresolved criterion erodes confidence in eligibility (except when
  // already ineligible, where a hard failure dominates).
  if (e.verdict !== "ineligible" && e.totalCriteria > 0) {
    const unresolvedRatio = e.unresolvedCriteria / e.totalCriteria;
    score -= unresolvedRatio * 25;
  }
  return round1(clamp(score));
}

/** Win potential 0..100. Unknown factors (null) contribute a neutral 0.5. */
export function scoreWinPotential(win: WinSignals): number {
  const w = WIN_WEIGHTS;
  const neutral = (v: number | null): number => (v === null ? 0.5 : v);
  const raw =
    neutral(win.fitStrength) * w.fitStrength +
    neutral(win.competition) * w.competition +
    neutral(win.amountEffort) * w.amountEffort +
    neutral(win.trackRecord) * w.trackRecord +
    neutral(win.timingHeadroom) * w.timingHeadroom;
  return round1(clamp(raw * 100));
}

/** Information confidence 0..100 — a meta-score over the typed claims. */
export function scoreInfoConfidence(c: ClaimStats): number {
  if (c.keyFieldsTotal <= 0) return 0;
  const confirmedRatio = c.keyFieldsConfirmed / c.keyFieldsTotal;

  // Core: share of key fields that are confirmed official facts.
  let score = confirmedRatio * 70;
  // Primary evidence reachable is a prerequisite for trust.
  score += c.hasReachablePrimaryEvidence ? 15 : 0;
  // Freshness of the primary evidence.
  score += c.evidenceRecency * 10;
  // Source authority weighting on the remaining headroom.
  score += c.sourceKindWeight * 5;

  // Penalties for reasoning-heavy or unknown key fields.
  const penaltyBase = c.keyFieldsTotal;
  score -= (c.inferenceOnKeyFields / penaltyBase) * 20;
  score -= (c.unresolvedOnKeyFields / penaltyBase) * 30;

  return round1(clamp(score));
}

/** Compute all four independent scores. */
export function scoreOpportunity(input: ScoringInput): OpportunityScores {
  const relevance = scoreRelevance(input.relevance);
  const eligibility = scoreEligibility(input.eligibility);
  const winPotential = scoreWinPotential(input.win);
  const infoConfidence = scoreInfoConfidence(input.claims);

  return {
    relevance,
    eligibility,
    winPotential,
    infoConfidence,
    modelVersion: SCORING_MODEL_VERSION,
    breakdown: {
      relevance,
      eligibility,
      winPotential,
      infoConfidence,
      confirmedKeyFieldRatio:
        input.claims.keyFieldsTotal > 0
          ? round1(
              (input.claims.keyFieldsConfirmed / input.claims.keyFieldsTotal) *
                100,
            )
          : 0,
    },
  };
}
