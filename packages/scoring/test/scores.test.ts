import { describe, it, expect } from "vitest";
import {
  scoreRelevance,
  scoreEligibility,
  scoreWinPotential,
  scoreInfoConfidence,
  scoreOpportunity,
} from "../src/scores";
import type {
  RelevanceSignals,
  EligibilityInput,
  WinSignals,
  ClaimStats,
} from "../src/types";

const perfectRelevance: RelevanceSignals = {
  sectorOverlap: 1,
  geographyOverlap: 1,
  fundingTypeMatch: 1,
  amountFit: 1,
  stageFit: 1,
  hardExclusionHit: false,
};

describe("scoreRelevance", () => {
  it("is 100 when every signal is perfect", () => {
    expect(scoreRelevance(perfectRelevance)).toBe(100);
  });

  it("is 0 when every signal is 0", () => {
    expect(
      scoreRelevance({
        sectorOverlap: 0,
        geographyOverlap: 0,
        fundingTypeMatch: 0,
        amountFit: 0,
        stageFit: 0,
        hardExclusionHit: false,
      }),
    ).toBe(0);
  });

  it("clamps to <= 20 when a hard exclusion is hit, even if otherwise perfect", () => {
    expect(scoreRelevance({ ...perfectRelevance, hardExclusionHit: true })).toBeLessThanOrEqual(20);
  });
});

describe("scoreEligibility", () => {
  it("orders verdicts eligible > likely > unknown > ineligible", () => {
    const base = { unresolvedCriteria: 0, totalCriteria: 3 };
    const e = scoreEligibility({ ...base, verdict: "eligible" });
    const l = scoreEligibility({ ...base, verdict: "likely" });
    const u = scoreEligibility({ ...base, verdict: "unknown" });
    const i = scoreEligibility({ ...base, verdict: "ineligible" });
    expect(e).toBeGreaterThan(l);
    expect(l).toBeGreaterThan(u);
    expect(u).toBeGreaterThan(i);
  });

  it("erodes score as unresolved criteria increase", () => {
    const none = scoreEligibility({ verdict: "likely", unresolvedCriteria: 0, totalCriteria: 4 });
    const some = scoreEligibility({ verdict: "likely", unresolvedCriteria: 4, totalCriteria: 4 });
    expect(some).toBeLessThan(none);
  });

  it("does not erode an ineligible verdict", () => {
    expect(
      scoreEligibility({ verdict: "ineligible", unresolvedCriteria: 3, totalCriteria: 3 }),
    ).toBe(scoreEligibility({ verdict: "ineligible", unresolvedCriteria: 0, totalCriteria: 3 }));
  });
});

describe("scoreWinPotential", () => {
  it("treats null (unknown) factors as neutral 0.5 → 50", () => {
    const allUnknown: WinSignals = {
      fitStrength: null,
      competition: null,
      amountEffort: null,
      trackRecord: null,
      timingHeadroom: null,
    };
    expect(scoreWinPotential(allUnknown)).toBe(50);
  });
});

describe("scoreInfoConfidence", () => {
  const strong: ClaimStats = {
    keyFieldsConfirmed: 6,
    keyFieldsTotal: 6,
    hasReachablePrimaryEvidence: true,
    evidenceRecency: 1,
    inferenceOnKeyFields: 0,
    unresolvedOnKeyFields: 0,
    sourceKindWeight: 1,
  };

  it("is high when all key fields are confirmed with fresh primary evidence", () => {
    expect(scoreInfoConfidence(strong)).toBeGreaterThanOrEqual(95);
  });

  it("drops sharply with unresolved key fields", () => {
    const weak = scoreInfoConfidence({
      ...strong,
      keyFieldsConfirmed: 2,
      unresolvedOnKeyFields: 3,
    });
    expect(weak).toBeLessThan(scoreInfoConfidence(strong));
    expect(weak).toBeLessThan(70); // would fail the default gate floor
  });

  it("is 0 when there are no key fields", () => {
    expect(scoreInfoConfidence({ ...strong, keyFieldsTotal: 0, keyFieldsConfirmed: 0 })).toBe(0);
  });
});

describe("scoreOpportunity", () => {
  it("returns four independent scores and a model version", () => {
    const out = scoreOpportunity({
      relevance: perfectRelevance,
      eligibility: { verdict: "eligible", unresolvedCriteria: 0, totalCriteria: 3 },
      win: {
        fitStrength: 0.8,
        competition: 0.5,
        amountEffort: 0.7,
        trackRecord: 0.6,
        timingHeadroom: 0.9,
      },
      claims: {
        keyFieldsConfirmed: 6,
        keyFieldsTotal: 6,
        hasReachablePrimaryEvidence: true,
        evidenceRecency: 1,
        inferenceOnKeyFields: 0,
        unresolvedOnKeyFields: 0,
        sourceKindWeight: 1,
      },
    });
    expect(out.modelVersion).toBe("v1");
    for (const k of ["relevance", "eligibility", "winPotential", "infoConfidence"] as const) {
      expect(out[k]).toBeGreaterThanOrEqual(0);
      expect(out[k]).toBeLessThanOrEqual(100);
    }
  });
});
