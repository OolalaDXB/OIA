import type { FetchStatus, SourceFormat, VerificationStatus } from "./models";
import type { DeadlineGateResult } from "./deadline";
import type { ApplicationEligibility, AwardEligibility } from "@oia/scoring";

/**
 * Milestone 0 deterministic gate (spec §7, §9, §15). PURSUE is unreachable
 * without a human-VERIFIED source; the automated run therefore ceilings at
 * INVESTIGATE. APPROVE (a human action) can promote to PURSUE only when every
 * hard condition already holds — it can never bypass a failed condition.
 */

export type M0Recommendation = "PURSUE" | "PARTNER" | "INVESTIGATE" | "MONITOR" | "REJECT";

export interface M0GateInput {
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
  /** True only if ALL hard conditions hold (the precondition for PURSUE). */
  pursueEligible: boolean;
  failedReasons: string[];
}

export function evaluateM0Gate(input: M0GateInput): M0GateReport {
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

  const checks: Array<[boolean, string]> = [
    [accessiblePrimarySource, "no accessible primary source"],
    [verifiedSource, "source not human-VERIFIED"],
    [verifiedDeadline, "no verified, non-conflicting, unexpired deadline"],
    [notExpired, "opportunity is expired"],
    [eligibilityAssessed, "application eligibility is UNKNOWN"],
    [notAggregatorOnly, "aggregator-only lead cannot be pursued"],
    [notClosedCall, "call is closed"],
    [input.hasExactNextAction, "no exact next action"],
    [sufficientConfidence, `info confidence ${input.infoConfidence} < floor ${input.confidenceFloor}`],
  ];
  const failedReasons = checks.filter(([ok]) => !ok).map(([, r]) => r);

  return {
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
