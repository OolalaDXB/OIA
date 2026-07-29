import type {
  GateInput,
  GateReport,
  OpportunityScores,
  RecommendationAction,
  EligibilityVerdict,
} from "./types";

/**
 * The hard PURSUE gate. This is a boolean AND over verified preconditions — NOT
 * a score threshold. A high score can never override a failed gate. Mirrored by
 * the DB constraint `pursue_requires_gate`. See docs/architecture/05.
 */
export function evaluateGate(input: GateInput): GateReport {
  const sufficientConfidence = input.infoConfidence >= input.confidenceFloor;

  const checks: Array<[keyof GateReport & string, boolean, string]> = [
    ["accessiblePrimarySource", input.accessiblePrimarySource, "no accessible primary source"],
    ["verifiedDeadline", input.verifiedDeadline, "deadline not verified against source"],
    ["confirmedOpen", input.confirmedOpen, "not confirmed currently open"],
    ["eligibilityAssessed", input.eligibilityAssessed, "eligibility not assessed"],
    ["exactNextAction", input.exactNextAction, "no exact next action"],
    [
      "sufficientConfidence",
      sufficientConfidence,
      `info confidence ${input.infoConfidence} < floor ${input.confidenceFloor}`,
    ],
  ];

  const failedReasons = checks.filter(([, ok]) => !ok).map(([, , reason]) => reason);

  return {
    accessiblePrimarySource: input.accessiblePrimarySource,
    verifiedDeadline: input.verifiedDeadline,
    confirmedOpen: input.confirmedOpen,
    eligibilityAssessed: input.eligibilityAssessed,
    exactNextAction: input.exactNextAction,
    sufficientConfidence,
    passed: failedReasons.length === 0,
    failedReasons,
  };
}

/**
 * Map scores + gate + eligibility verdict to a recommendation action.
 * PURSUE requires the gate to pass. Everything else is a downgrade with a
 * surfaced reason.
 */
export function decideAction(args: {
  gate: GateReport;
  scores: OpportunityScores;
  eligibilityVerdict: EligibilityVerdict;
  isCurrentlyOpen: boolean;
}): RecommendationAction {
  const { gate, scores, eligibilityVerdict, isCurrentlyOpen } = args;

  // Hard disqualifiers → DISCARD.
  if (eligibilityVerdict === "ineligible" || scores.relevance <= 20) {
    return "DISCARD";
  }

  if (gate.passed) return "PURSUE";

  // Relevant + plausibly eligible but not actionable *yet* because it isn't open
  // (or eligibility is still unknown pending a future window) → MONITOR.
  if (!isCurrentlyOpen || eligibilityVerdict === "unknown") {
    return "MONITOR";
  }

  // Relevant and eligible/likely, gate fails on evidence/deadline/confidence.
  return "CONSIDER";
}
