import { describe, expect, it } from "vitest";
import { evaluateM0Gate, type M0GateInput } from "../src/gate";
import {
  DEADLINE_CONDITIONS,
  GATE_CONDITIONS,
  UNIVERSAL_CONDITIONS,
  conditionsFor,
} from "../src/gate-profiles";
import { OPPORTUNITY_KINDS, KIND_PROFILES, normalizeKind } from "../src/opportunity-kinds";

/** An input where everything a human can supply is satisfied. */
function perfect(over: Partial<M0GateInput> = {}): M0GateInput {
  return {
    fetchStatus: "OK",
    verificationStatus: "VERIFIED",
    sourceFormat: "STATIC_HTML",
    hasOfficialArtifact: true,
    isAggregatorOnly: false,
    isClosedCall: false,
    deadline: { hasVerifiableDeadline: true, hasConflict: false, isExpired: false } as M0GateInput["deadline"],
    application: "ELIGIBLE",
    award: "ELIGIBLE",
    hasExactNextAction: true,
    infoConfidence: 90,
    confidenceFloor: 70,
    ...over,
  };
}

/** The same, but with no deadline anywhere — a tax credit, an investor. */
function noDeadline(over: Partial<M0GateInput> = {}): M0GateInput {
  return perfect({
    deadline: { hasVerifiableDeadline: false, hasConflict: false, isExpired: false } as M0GateInput["deadline"],
    ...over,
  });
}

describe("the gate stays the product rule, per kind", () => {
  it("never lets any kind drop a universal condition", () => {
    // This is the test that keeps a configurable gate from becoming a dial that
    // gets turned until something passes.
    for (const kind of OPPORTUNITY_KINDS) {
      const applicable = conditionsFor(kind).filter((c) => c.applies).map((c) => c.condition);
      for (const universal of UNIVERSAL_CONDITIONS) {
        expect(applicable, `${kind} must still require ${universal}`).toContain(universal);
      }
    }
  });

  it("only ever relaxes the deadline family, and only where there is no deadline", () => {
    for (const kind of OPPORTUNITY_KINDS) {
      const relaxed = conditionsFor(kind).filter((c) => !c.applies).map((c) => c.condition);
      for (const condition of relaxed) {
        expect(DEADLINE_CONDITIONS, `${kind} relaxed ${condition}, which is not a deadline condition`).toContain(
          condition,
        );
      }
      if (KIND_PROFILES[kind].hasIssuerDeadline) expect(relaxed).toEqual([]);
    }
  });

  it("says WHY a condition was not asked, so a tick and a blank never read alike", () => {
    const report = evaluateM0Gate(noDeadline({ opportunityKind: "TAX_INCENTIVE" }));
    expect(report.notApplicable?.map((n) => n.condition).sort()).toEqual([...DEADLINE_CONDITIONS].sort());
    expect(report.notApplicable?.[0]?.reason).toContain("no issuer deadline");
  });
});

describe("the two categories that were unreachable before", () => {
  it("an acquisition is money going OUT, and the model says so", async () => {
    const { KIND_PROFILES } = await import("../src/opportunity-kinds");
    expect(KIND_PROFILES.ACQUISITION.direction).toBe("OUTBOUND");
    // Everything else brings value in or is neutral; only an acquisition spends.
    const outbound = Object.entries(KIND_PROFILES).filter(([, p]) => p.direction === "OUTBOUND");
    expect(outbound.map(([k]) => k)).toEqual(["ACQUISITION"]);
  });

  it("a marketplace project clears without a deadline it never had", () => {
    const report = evaluateM0Gate(noDeadline({ opportunityKind: "MARKETPLACE_PROJECT" }));
    expect(report.pursueEligible).toBe(true);
    expect(report.humanQuestion).toContain("speed");
  });

  it("a tax relief can now clear the gate — it never could, at any evidence level", () => {
    const input = noDeadline({ opportunityKind: "TAX_INCENTIVE" });
    expect(evaluateM0Gate({ ...input, opportunityKind: "GRANT" }).pursueEligible).toBe(false);
    expect(evaluateM0Gate(input).pursueEligible).toBe(true);
  });

  it("an investor can now clear the gate, and is asked the right question instead", () => {
    const report = evaluateM0Gate(noDeadline({ opportunityKind: "EQUITY" }));
    expect(report.pursueEligible).toBe(true);
    expect(report.humanQuestion).toContain("thesis");
    // No deadline to miss, so none is invented.
    expect(report.failedReasons).toEqual([]);
  });
});

describe("what did NOT get easier", () => {
  it("a tender still needs its verified, unexpired deadline", () => {
    const report = evaluateM0Gate(noDeadline({ opportunityKind: "TENDER" }));
    expect(report.pursueEligible).toBe(false);
    expect(report.failedReasons.join(" ")).toContain("deadline");
  });

  it("an unverified source blocks every kind without exception", () => {
    for (const kind of OPPORTUNITY_KINDS) {
      const report = evaluateM0Gate(
        noDeadline({ opportunityKind: kind, verificationStatus: "MANUAL_REVIEW_REQUIRED" }),
      );
      expect(report.pursueEligible, `${kind} passed without a human-verified source`).toBe(false);
      expect(report.failedReasons.join(" ")).toContain("human-VERIFIED");
    }
  });

  it("no exact next action blocks every kind without exception", () => {
    for (const kind of OPPORTUNITY_KINDS) {
      const report = evaluateM0Gate(noDeadline({ opportunityKind: kind, hasExactNextAction: false }));
      expect(report.pursueEligible, `${kind} passed with no next action`).toBe(false);
    }
  });

  it("a regulatory watch is never pursuable, however perfect the evidence", () => {
    const report = evaluateM0Gate(noDeadline({ opportunityKind: "REGULATORY" }));
    expect(report.pursueEligible).toBe(false);
    expect(report.failedReasons.join(" ")).toContain("watch-only");
  });
});

describe("records written before the taxonomy existed", () => {
  it("maps the old values instead of rewriting what a past run produced", () => {
    expect(normalizeKind("TENDER_RFP")).toBe("TENDER");
    expect(normalizeKind("VC_INVESTOR")).toBe("EQUITY");
    expect(normalizeKind(undefined)).toBe("GRANT");
    expect(normalizeKind("SOMETHING_ELSE")).toBe("GRANT");
  });

  it("judges a legacy tender exactly as it judged it before", () => {
    const legacy = evaluateM0Gate(perfect({ opportunityKind: "TENDER_RFP" }));
    const modern = evaluateM0Gate(perfect({ opportunityKind: "TENDER" }));
    expect(legacy.pursueEligible).toBe(modern.pursueEligible);
    expect(legacy.failedReasons).toEqual(modern.failedReasons);
  });

  it("keeps every condition on the report, applicable or not", () => {
    const report = evaluateM0Gate(noDeadline({ opportunityKind: "EQUITY" }));
    for (const condition of GATE_CONDITIONS) {
      expect(report).toHaveProperty(condition);
    }
  });
});
