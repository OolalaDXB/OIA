import { describe, it, expect } from "vitest";
import { evaluateM0Gate, automatedRecommendation, applyHumanApproval, type M0GateInput } from "../src/gate";

const baseOpen: M0GateInput = {
  fetchStatus: "BLOCKED",
  verificationStatus: "MANUAL_REVIEW_REQUIRED",
  sourceFormat: "PDF",
  hasOfficialArtifact: true,
  isAggregatorOnly: false,
  isClosedCall: false,
  deadline: { hasVerifiableDeadline: true, isExpired: false, hasConflict: false, blocksPursue: false, reasons: [] },
  application: "ELIGIBLE_TO_APPLY_NOW",
  award: "READY_FOR_AWARD",
  hasExactNextAction: true,
  infoConfidence: 85,
  confidenceFloor: 70,
};

describe("[UNIT] M0 gate (spec §7, §15)", () => {
  it("PURSUE is unreachable without a human-VERIFIED source", () => {
    const report = evaluateM0Gate(baseOpen);
    expect(report.pursueEligible).toBe(false);
    expect(report.failedReasons).toContain("source not human-VERIFIED");
    expect(automatedRecommendation(baseOpen, report)).not.toBe("PURSUE");
    expect(automatedRecommendation(baseOpen, report)).toBe("INVESTIGATE");
  });

  it("APPROVE cannot override a failed hard gate", () => {
    const report = evaluateM0Gate(baseOpen); // not verified → gate fails
    const { recommendation, note } = applyHumanApproval("APPROVE", report, "INVESTIGATE");
    expect(recommendation).toBe("INVESTIGATE");
    expect(note).toMatch(/cannot override/);
  });

  it("APPROVE promotes to PURSUE only once every hard condition holds (incl. human VERIFIED)", () => {
    const verified: M0GateInput = { ...baseOpen, verificationStatus: "VERIFIED" };
    const report = evaluateM0Gate(verified);
    expect(report.pursueEligible).toBe(true);
    expect(applyHumanApproval("APPROVE", report, "INVESTIGATE").recommendation).toBe("PURSUE");
  });

  it("an aggregator-only lead can never be PURSUE (INVESTIGATE at most)", () => {
    const agg: M0GateInput = { ...baseOpen, verificationStatus: "DISCOVERED_UNVERIFIED", hasOfficialArtifact: false, isAggregatorOnly: true };
    const report = evaluateM0Gate(agg);
    expect(report.pursueEligible).toBe(false);
    expect(automatedRecommendation(agg, report)).toBe("INVESTIGATE");
  });

  it("an expired opportunity is REJECT and never PURSUE", () => {
    const expired: M0GateInput = {
      ...baseOpen, verificationStatus: "VERIFIED",
      deadline: { hasVerifiableDeadline: false, isExpired: true, hasConflict: false, blocksPursue: true, reasons: ["expired"] },
    };
    const report = evaluateM0Gate(expired);
    expect(report.pursueEligible).toBe(false);
    expect(automatedRecommendation(expired, report)).toBe("REJECT");
  });

  it("a blocked source with no official artifact is not an accessible primary source", () => {
    const blocked: M0GateInput = { ...baseOpen, hasOfficialArtifact: false, verificationStatus: "SOURCE_UNAVAILABLE" };
    const report = evaluateM0Gate(blocked);
    expect(report.accessiblePrimarySource).toBe(false);
    expect(report.pursueEligible).toBe(false);
  });

  it("a closed call is REJECT, not an active PARTNER", () => {
    const closed: M0GateInput = { ...baseOpen, verificationStatus: "VERIFIED", isClosedCall: true };
    const report = evaluateM0Gate(closed);
    expect(automatedRecommendation(closed, report)).toBe("REJECT");
    expect(report.notClosedCall).toBe(false);
  });
});
