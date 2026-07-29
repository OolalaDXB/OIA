import { KEY_FIELDS } from "@oia/config";
import type { ProjectProfile, EligibilityAssessment, SourceKind } from "@oia/database";
import type { RawOpportunity, FetchedEvidence } from "@oia/connectors";
import type { LLMProvider } from "@oia/providers";
import type { PolicyHooks } from "@oia/audit";
import {
  scoreOpportunity,
  evaluateGate,
  decideAction,
  type OpportunityScores,
  type GateReport,
  type ClaimStats,
  type RecommendationAction,
  type EligibilityVerdict,
} from "@oia/scoring";
import { computeRelevanceSignals } from "./relevance";
import { buildClaims, type BuiltClaim } from "./corroborate";
import { assessEligibility } from "./eligibility";

export interface QualificationResult {
  claims: BuiltClaim[];
  eligibility: EligibilityAssessment;
  scores: OpportunityScores;
  gate: GateReport;
  recommendation: {
    action: RecommendationAction;
    nextAction?: string;
    gatePassed: boolean;
    rationale?: string;
  };
  llmRuns: Array<{ provider: string; model: string; promptHash: string; purpose: string; inputTokens?: number; outputTokens?: number; costUsd?: number }>;
}

const SOURCE_KIND_WEIGHT: Record<SourceKind, number> = {
  official_programme: 1,
  aggregator: 0.7,
  manual: 0.5,
};

/** Best (most authoritative) claim per field. */
function claimFor(claims: BuiltClaim[], field: string): BuiltClaim | undefined {
  return claims.find((c) => c.field === field);
}

function computeClaimStats(
  claims: BuiltClaim[],
  verdict: EligibilityVerdict,
  evidence: FetchedEvidence | null,
  sourceKind: SourceKind,
): ClaimStats {
  let confirmed = 0;
  let inference = 0;
  let unresolved = 0;

  for (const field of KEY_FIELDS) {
    if (field === "eligibility") {
      if (verdict === "unknown") unresolved++;
      else confirmed++; // a resolved assessment = knowledge present
      continue;
    }
    const c = claimFor(claims, field);
    if (!c) {
      unresolved++;
    } else if (c.claimType === "confirmed_official_fact") {
      confirmed++;
    } else if (c.claimType === "inference") {
      inference++;
    } else if (c.claimType === "unresolved_uncertainty") {
      unresolved++;
    }
    // 'extracted' and 'recommendation' contribute neither to confirmed nor penalties.
  }

  const reachable = !!evidence && evidence.httpStatus >= 200 && evidence.httpStatus < 400;
  return {
    keyFieldsConfirmed: confirmed,
    keyFieldsTotal: KEY_FIELDS.length,
    hasReachablePrimaryEvidence: reachable,
    evidenceRecency: 1,
    inferenceOnKeyFields: inference,
    unresolvedOnKeyFields: unresolved,
    sourceKindWeight: SOURCE_KIND_WEIGHT[sourceKind],
  };
}

function buildNextAction(
  opp: RawOpportunity,
  deadlineConfirmed: boolean,
  isOpen: boolean,
): string | undefined {
  if (!deadlineConfirmed || !isOpen) return undefined;
  const when = opp.hints.deadlineAt ? ` before ${opp.hints.deadlineAt}` : "";
  const prog = opp.hints.programmeName ? ` (${opp.hints.programmeName})` : "";
  return `Prepare and submit the application for "${opp.title}"${prog}${when} via ${opp.url}.`;
}

export interface QualifyInput {
  project: ProjectProfile;
  opportunity: RawOpportunity;
  evidence: FetchedEvidence | null;
  sourceKind: SourceKind;
  provider: LLMProvider;
  policy: PolicyHooks;
  confidenceFloor: number;
}

/**
 * Turn a discovered opportunity + evidence into typed claims, an eligibility
 * assessment, four scores, and a gated recommendation. Facts are corroborated
 * deterministically; the LLM only proposes the eligibility judgement. PURSUE is
 * decided by the hard gate, never by a score.
 */
export async function qualify(input: QualifyInput): Promise<QualificationResult> {
  const { project, opportunity, evidence, sourceKind, provider, policy, confidenceFloor } = input;
  const sourceText = evidence?.text ?? "";

  // 1. Deterministic claims (facts require evidence).
  const claims = buildClaims(opportunity, evidence);

  // 2. Eligibility assessment (LLM proposes; recorded as inference).
  const elig = await assessEligibility(provider, project, sourceText);
  const assessment = elig.data;
  claims.push({
    field: "eligibility",
    claimType: "inference",
    valueText: assessment.verdict,
    valueJson: assessment,
    citesEvidence: false,
    confidence: assessment.verdict === "unknown" ? 0.3 : 0.7,
    producedBy: `llm:${elig.run.provider}`,
  });

  // 3. Scores.
  const relevance = computeRelevanceSignals(project, opportunity, sourceText);
  const unresolvedCriteria = assessment.criteria.filter((c) => c.met === null).length;
  const stats = computeClaimStats(claims, assessment.verdict, evidence, sourceKind);
  const scores = scoreOpportunity({
    relevance,
    eligibility: {
      verdict: assessment.verdict,
      unresolvedCriteria,
      totalCriteria: assessment.criteria.length,
    },
    win: {
      fitStrength: Math.min(1, (relevance.sectorOverlap + relevance.geographyOverlap) / 2),
      competition: null,
      amountEffort: null,
      trackRecord: null,
      timingHeadroom: null,
    },
    claims: stats,
  });

  // 4. Gate (hard preconditions).
  const deadlineClaim = claimFor(claims, "deadline");
  const statusClaim = claimFor(claims, "open_status");
  const deadlineConfirmed = deadlineClaim?.claimType === "confirmed_official_fact";
  const confirmedOpen =
    statusClaim?.claimType === "confirmed_official_fact" && opportunity.hints.status === "open";
  const isOpen = opportunity.hints.status === "open";
  const eligibilityAssessed =
    (assessment.verdict === "eligible" || assessment.verdict === "likely") &&
    assessment.criteria.length > 0;
  const nextAction = buildNextAction(opportunity, deadlineConfirmed, confirmedOpen);

  const gate = evaluateGate({
    accessiblePrimarySource: stats.hasReachablePrimaryEvidence,
    verifiedDeadline: deadlineConfirmed,
    confirmedOpen,
    eligibilityAssessed,
    exactNextAction: !!nextAction,
    infoConfidence: scores.infoConfidence,
    confidenceFloor,
  });

  // 5. Action + policy check (PURSUE requires human sign-off in V0 → OD-6).
  let action = decideAction({
    gate,
    scores,
    eligibilityVerdict: assessment.verdict,
    isCurrentlyOpen: isOpen,
  });
  let rationale: string | undefined;
  if (action === "PURSUE") {
    const decision = await policy.canAutoRecommend("PURSUE");
    if (!decision.allowed) {
      action = "CONSIDER";
      rationale = `Gate passed; downgraded pending human sign-off (${decision.reason}).`;
    }
  } else if (gate.failedReasons.length > 0) {
    rationale = `Gate not met: ${gate.failedReasons.join("; ")}.`;
  }

  return {
    claims,
    eligibility: assessment,
    scores,
    gate,
    recommendation: { action, nextAction, gatePassed: gate.passed, rationale },
    llmRuns: [{ ...elig.run, purpose: "assess_eligibility" }],
  };
}
