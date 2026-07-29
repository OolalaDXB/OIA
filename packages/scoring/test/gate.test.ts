import { describe, it, expect } from "vitest";
import { evaluateGate, decideAction } from "../src/gate";
import type { GateInput, GateReport, OpportunityScores } from "../src/types";

const fullPass: GateInput = {
  accessiblePrimarySource: true,
  verifiedDeadline: true,
  confirmedOpen: true,
  eligibilityAssessed: true,
  exactNextAction: true,
  infoConfidence: 80,
  confidenceFloor: 70,
};

describe("evaluateGate", () => {
  it("passes only when every precondition holds", () => {
    const r = evaluateGate(fullPass);
    expect(r.passed).toBe(true);
    expect(r.failedReasons).toEqual([]);
  });

  it("fails if confidence is below the floor, even with everything else true", () => {
    const r = evaluateGate({ ...fullPass, infoConfidence: 69 });
    expect(r.passed).toBe(false);
    expect(r.sufficientConfidence).toBe(false);
    expect(r.failedReasons.join(" ")).toContain("info confidence");
  });

  it.each([
    ["accessiblePrimarySource", "no accessible primary source"],
    ["verifiedDeadline", "deadline not verified against source"],
    ["confirmedOpen", "not confirmed currently open"],
    ["eligibilityAssessed", "eligibility not assessed"],
    ["exactNextAction", "no exact next action"],
  ] as const)("fails when %s is false", (field, reason) => {
    const r = evaluateGate({ ...fullPass, [field]: false });
    expect(r.passed).toBe(false);
    expect(r.failedReasons).toContain(reason);
  });

  it("lists all failed reasons when multiple preconditions fail", () => {
    const r = evaluateGate({
      ...fullPass,
      verifiedDeadline: false,
      confirmedOpen: false,
    });
    expect(r.failedReasons).toHaveLength(2);
  });
});

const scores = (over: Partial<OpportunityScores> = {}): OpportunityScores => ({
  relevance: 80,
  eligibility: 80,
  winPotential: 60,
  infoConfidence: 80,
  modelVersion: "v1",
  breakdown: {},
  ...over,
});
const passedReport = (): GateReport => evaluateGate(fullPass);
const failedReport = (): GateReport =>
  evaluateGate({ ...fullPass, verifiedDeadline: false });

describe("decideAction", () => {
  it("returns PURSUE only when the gate passed", () => {
    expect(
      decideAction({
        gate: passedReport(),
        scores: scores(),
        eligibilityVerdict: "eligible",
        isCurrentlyOpen: true,
      }),
    ).toBe("PURSUE");
  });

  it("never PURSUE when the gate failed, even with high scores", () => {
    const action = decideAction({
      gate: failedReport(),
      scores: scores({ relevance: 99, eligibility: 99, winPotential: 99 }),
      eligibilityVerdict: "eligible",
      isCurrentlyOpen: true,
    });
    expect(action).not.toBe("PURSUE");
    expect(action).toBe("CONSIDER");
  });

  it("DISCARDs ineligible opportunities regardless of gate", () => {
    expect(
      decideAction({
        gate: passedReport(),
        scores: scores(),
        eligibilityVerdict: "ineligible",
        isCurrentlyOpen: true,
      }),
    ).toBe("DISCARD");
  });

  it("DISCARDs when relevance is clamped low by a hard exclusion", () => {
    expect(
      decideAction({
        gate: failedReport(),
        scores: scores({ relevance: 15 }),
        eligibilityVerdict: "likely",
        isCurrentlyOpen: true,
      }),
    ).toBe("DISCARD");
  });

  it("MONITORs relevant opportunities that are not currently open", () => {
    expect(
      decideAction({
        gate: failedReport(),
        scores: scores(),
        eligibilityVerdict: "likely",
        isCurrentlyOpen: false,
      }),
    ).toBe("MONITOR");
  });

  it("MONITORs when eligibility is still unknown", () => {
    expect(
      decideAction({
        gate: failedReport(),
        scores: scores(),
        eligibilityVerdict: "unknown",
        isCurrentlyOpen: true,
      }),
    ).toBe("MONITOR");
  });
});
