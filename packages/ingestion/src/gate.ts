import type { FetchStatus, SourceFormat, VerificationStatus } from "./models";
import type { DeadlineGateResult } from "./deadline";
import type { ApplicationEligibility, AwardEligibility } from "@oia/scoring";
import { normalizeKind, KIND_PROFILES, type OpportunityKind } from "./opportunity-kinds";
import { conditionsFor, isActionable, KIND_SPECIFIC_QUESTION, type GateCondition } from "./gate-profiles";

/**
 * Milestone 0 deterministic gate (spec §7, §9, §15). PURSUE is unreachable
 * without a human-VERIFIED source; the automated run therefore ceilings at
 * INVESTIGATE. APPROVE (a human action) can promote to PURSUE only when every
 * hard condition already holds — it can never bypass a failed condition.
 */

export type M0Recommendation = "PURSUE" | "PARTNER" | "INVESTIGATE" | "MONITOR" | "REJECT";

export interface M0GateInput {
  /**
   * What kind of opportunity this is. Decides which hard conditions APPLY —
   * never how strictly they are judged. Absent means the historical default.
   */
  opportunityKind?: string;
  fetchStatus: FetchStatus;
  verificationStatus: VerificationStatus;
  sourceFormat: SourceFormat;
  hasOfficialArtifact: boolean;
  isAggregatorOnly: boolean;
  isClosedCall: boolean;
  deadline: DeadlineGateResult;
  application: ApplicationEligibility;
  award: AwardEligibility;
  hasExactNextAction: boolean;
  infoConfidence: number; // 0..100
  confidenceFloor: number;
}

export interface M0GateReport {
  accessiblePrimarySource: boolean;
  verifiedSource: boolean;
  verifiedDeadline: boolean;
  notExpired: boolean;
  eligibilityAssessed: boolean;
  notAggregatorOnly: boolean;
  notClosedCall: boolean;
  hasExactNextAction: boolean;
  sufficientConfidence: boolean;
  /** True only if ALL APPLICABLE hard conditions hold (the precondition for PURSUE). */
  pursueEligible: boolean;
  failedReasons: string[];
  /** The kind the conditions were selected for. */
  kind?: OpportunityKind;
  /**
   * Conditions that were not asked, and why. A reader must be able to tell a
   * condition that passed from one that never applied — otherwise "9 green
   * ticks" would mean different things on different records.
   */
  notApplicable?: { condition: GateCondition; reason: string }[];
  /** What a human must answer instead, for kinds with no deadline. */
  humanQuestion?: string;
}

export function evaluateM0Gate(input: M0GateInput): M0GateReport {
  const kind = normalizeKind(input.opportunityKind);
  const applicability = conditionsFor(kind);
  const applies = (c: GateCondition): boolean =>
    applicability.find((a) => a.condition === c)?.applies ?? true;

  const accessiblePrimarySource =
    input.hasOfficialArtifact &&
    input.verificationStatus !== "DISCOVERED_UNVERIFIED" &&
    input.verificationStatus !== "REJECTED";
  const verifiedSource = input.verificationStatus === "VERIFIED";
  const verifiedDeadline = input.deadline.hasVerifiableDeadline && !input.deadline.hasConflict && !input.deadline.isExpired;
  const notExpired = !input.deadline.isExpired;
  const eligibilityAssessed = input.application !== "UNKNOWN";
  const notAggregatorOnly = !input.isAggregatorOnly;
  const notClosedCall = !input.isClosedCall;
  const sufficientConfidence = input.infoConfidence >= input.confidenceFloor;

  const checks: Array<[GateCondition, boolean, string]> = [
    ["accessiblePrimarySource", accessiblePrimarySource, "no accessible primary source"],
    ["verifiedSource", verifiedSource, "source not human-VERIFIED"],
    ["verifiedDeadline", verifiedDeadline, "no verified, non-conflicting, unexpired deadline"],
    ["notExpired", notExpired, "opportunity is expired"],
    ["eligibilityAssessed", eligibilityAssessed, "application eligibility is UNKNOWN"],
    ["notAggregatorOnly", notAggregatorOnly, "aggregator-only lead cannot be pursued"],
    ["notClosedCall", notClosedCall, "call is closed"],
    ["hasExactNextAction", input.hasExactNextAction, "no exact next action"],
    [
      "sufficientConfidence",
      sufficientConfidence,
      `info confidence ${input.infoConfidence} < floor ${input.confidenceFloor}`,
    ],
  ];
  // Only conditions that APPLY to this kind can fail it. A tax relief is not
  // blocked for lacking a deadline it could never have had.
  const failedReasons = checks.filter(([c, ok]) => applies(c) && !ok).map(([, , r]) => r);
  const notApplicable = applicability
    .filter((a) => !a.applies)
    .map((a) => ({ condition: a.condition, reason: a.reason }));

  // Watch-only kinds are never pursuable, whatever the evidence.
  if (!isActionable(kind)) {
    failedReasons.push(`${KIND_PROFILES[kind].label.toLowerCase()} is watch-only — there is nothing to apply to`);
  }

  const question = KIND_SPECIFIC_QUESTION[kind];

  return {
    kind,
    ...(notApplicable.length > 0 ? { notApplicable } : {}),
    ...(question ? { humanQuestion: question } : {}),
    accessiblePrimarySource,
    verifiedSource,
    verifiedDeadline,
    notExpired,
    eligibilityAssessed,
    notAggregatorOnly,
    notClosedCall,
    hasExactNextAction: input.hasExactNextAction,
    sufficientConfidence,
    pursueEligible: failedReasons.length === 0,
    failedReasons,
  };
}

/** Conservative automated recommendation (no human). Never PURSUE. */
export function automatedRecommendation(input: M0GateInput, report: M0GateReport): M0Recommendation {
  if (input.verificationStatus === "REJECTED") return "REJECT";
  if (input.award === "STRUCTURALLY_INELIGIBLE") return "REJECT";
  if (input.isClosedCall || input.deadline.isExpired) return "REJECT";
  if (input.isAggregatorOnly) return "INVESTIGATE";
  if (input.application === "UNKNOWN") return "INVESTIGATE";
  // Official artifact present but not human-verified → needs investigation/verification.
  if (report.accessiblePrimarySource) return "INVESTIGATE";
  return "MONITOR";
}

/**
 * Apply a human APPROVE/REJECT. APPROVE promotes to PURSUE ONLY when the gate is
 * fully satisfied; otherwise the recommendation is unchanged (hard gate wins).
 */
export function applyHumanApproval(
  decision: "APPROVE" | "REJECT" | "NEEDS_VERIFICATION",
  report: M0GateReport,
  current: M0Recommendation,
): { recommendation: M0Recommendation; note: string } {
  if (decision === "REJECT") return { recommendation: "REJECT", note: "human rejected" };
  if (decision === "NEEDS_VERIFICATION") return { recommendation: "INVESTIGATE", note: "human flagged for verification" };
  // APPROVE:
  if (report.pursueEligible) return { recommendation: "PURSUE", note: "human approved a gate-compliant recommendation" };
  return {
    recommendation: current,
    note: `APPROVE cannot override failed hard gate(s): ${report.failedReasons.join("; ")}`,
  };
}
