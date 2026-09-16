import { describe, expect, it } from "vitest";
import { applyFreshness, assessFreshness, CLOSING_SOON_DAYS } from "../src/freshness";
import type { ConsoleRecord } from "../src/console";
import type { M0GateReport } from "../src/gate";

const passingGate: M0GateReport = {
  accessiblePrimarySource: true,
  verifiedSource: true,
  verifiedDeadline: true,
  notExpired: true,
  eligibilityAssessed: true,
  notAggregatorOnly: true,
  notClosedCall: true,
  hasExactNextAction: true,
  sufficientConfidence: true,
  pursueEligible: true,
  failedReasons: [],
};

function record(deadlineIso?: string, publishedIso?: string): ConsoleRecord {
  return {
    id: "r1",
    title: "A call",
    issuer: "European Commission",
    linkedBy: "officialUrl",
    verificationStatus: "VERIFIED",
    verificationEvidence: [],
    application: "ELIGIBLE",
    award: "ELIGIBLE",
    strategicRoute: "UNKNOWN",
    scores: { relevance: 70, winPotential: 60, infoConfidence: 80 },
    gate: passingGate,
    recommendation: "PURSUE",
    humanReview: "APPROVE",
    facts: publishedIso
      ? [
          {
            field: "publication-date",
            normalizedValue: publishedIso,
            classification: "EXTRACTED_FROM_OFFICIAL_SOURCE",
            locator: { type: "JSON_PATH", value: "$.pub" },
            extractionMethod: "ted-search-api",
            extractingProvider: "ted",
            extractingModel: "search-api-v3",
            extractionConfidence: 0.85,
            originalSourceText: publishedIso,
          },
        ]
      : [],
    deadlines: deadlineIso
      ? [
          {
            normalized: deadlineIso,
            originalSourceString: deadlineIso,
            deadlineType: "APPLICATION",
            isConfirmPending: false,
            locator: { type: "JSON_PATH", value: "$.deadline" },
            conflicts: [],
          },
        ]
      : [],
    conflicts: [],
    discrepancies: [],
    expected: {},
    unresolvedQuestions: [],
    warnings: [],
  } as ConsoleRecord;
}

const NOW = "2026-09-16T00:00:00Z";

describe("assessFreshness", () => {
  it("flags a call whose deadline has passed", () => {
    const f = assessFreshness(record("2026-08-01"), NOW);
    expect(f.status).toBe("EXPIRED");
    expect(f.daysToDeadline).toBeLessThan(0);
  });

  it("flags a call closing within the window", () => {
    const f = assessFreshness(record("2026-09-20"), NOW);
    expect(f.status).toBe("CLOSING_SOON");
    expect(f.daysToDeadline).toBeLessThanOrEqual(CLOSING_SOON_DAYS);
  });

  it("leaves a distant deadline fresh and reports the notice age", () => {
    const f = assessFreshness(record("2026-12-31", "2026-08-17"), NOW);
    expect(f.status).toBe("FRESH");
    expect(f.ageDays).toBe(30);
  });

  it("does not pretend a record with no deadline is open", () => {
    const f = assessFreshness(record(undefined), NOW);
    expect(f.status).toBe("NO_DEADLINE");
    expect(f.reasons.join(" ")).toContain("only a human can confirm");
  });
});

describe("applyFreshness", () => {
  it("strips PURSUE-eligibility from an expired record, whatever the human clicked", () => {
    const out = applyFreshness(record("2026-08-01"), NOW);
    expect(out.gate?.notExpired).toBe(false);
    expect(out.gate?.pursueEligible).toBe(false);
    expect(out.gate?.failedReasons).toContain("opportunity is expired");
    expect(out.recommendation).toBe("REJECT");
    expect(out.warnings.join(" ")).toContain("freshness:");
  });

  it("never upgrades: a fresh record keeps exactly the pipeline's verdict", () => {
    const input = record("2026-12-31");
    const out = applyFreshness(input, NOW);
    expect(out.recommendation).toBe(input.recommendation);
    expect(out.gate).toEqual(input.gate);
    expect(out.freshness?.status).toBe("FRESH");
  });
});
