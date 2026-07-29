import { describe, it, expect } from "vitest";
import { createFakeProvider } from "@oia/providers";
import { createPolicy } from "@oia/audit";
import type { ProjectProfile } from "@oia/database";
import type { RawOpportunity, FetchedEvidence } from "@oia/connectors";
import { qualify } from "../src/qualifier";

const project: ProjectProfile = {
  slug: "bawaba",
  name: "BAWABA",
  legalEntities: [{ name: "Oolala France SAS", jurisdiction: "FR", role: "applicant" }],
  sectors: ["creative industries", "AI"],
  geographies: ["EU", "FR"],
  stage: "growth",
  fundingTypes: ["grant"],
  keywords: ["creative", "AI"],
  exclusions: ["defence"],
};

const opp: RawOpportunity = {
  sourceKey: "eu-funding-tenders",
  externalId: "HORIZON-CL4-2026-DIGITAL-01",
  title: "AI for Creative Industries",
  url: "https://ec.europa.eu/info/funding-tenders/opportunities/portal/x",
  discoveredAt: "2026-07-29T00:00:00.000Z",
  hints: {
    programmeName: "Horizon Europe",
    funder: "European Commission",
    deadlineAt: "2026-09-15T17:00:00+02:00",
    status: "open",
    summary: "Support for AI-enabled creative industries.",
    currency: "EUR",
  },
  raw: {},
};

// Evidence that CORROBORATES the deadline (2026-09-15) and the open status.
const strongEvidence: FetchedEvidence = {
  url: opp.url,
  httpStatus: 200,
  fetchedAt: "2026-07-29T00:00:00.000Z",
  contentType: "text/html",
  text: "This call is open for submission. Deadline: 2026-09-15. Topic: AI for creative industries in the EU.",
  contentHash: "hash-strong",
};

// Evidence that does NOT show the deadline or status.
const weakEvidence: FetchedEvidence = {
  url: opp.url,
  httpStatus: 200,
  fetchedAt: "2026-07-29T00:00:00.000Z",
  contentType: "text/html",
  text: "A programme about creative industries. See the portal for details.",
  contentHash: "hash-weak",
};

const eligibleProvider = createFakeProvider({
  assess_eligibility: () => ({
    verdict: "eligible",
    criteria: [
      { criterion: "Applicant established in EU member state", met: true },
      { criterion: "Sector matches call scope", met: true },
    ],
    rationale: "French SAS in a creative/AI call.",
  }),
});

describe("qualify — invariants", () => {
  it("confirms facts only when corroborated, and every confirmed fact cites evidence", async () => {
    const res = await qualify({
      project,
      opportunity: opp,
      evidence: strongEvidence,
      sourceKind: "official_programme",
      provider: eligibleProvider,
      policy: createPolicy(),
      confidenceFloor: 70,
    });

    const facts = res.claims.filter((c) => c.claimType === "confirmed_official_fact");
    expect(facts.length).toBeGreaterThan(0);
    for (const f of facts) expect(f.citesEvidence).toBe(true);

    // deadline is corroborated in the strong evidence → confirmed fact.
    const deadline = res.claims.find((c) => c.field === "deadline");
    expect(deadline?.claimType).toBe("confirmed_official_fact");
  });

  it("passes the gate on strong evidence but downgrades PURSUE→CONSIDER pending human sign-off (OD-6)", async () => {
    const res = await qualify({
      project,
      opportunity: opp,
      evidence: strongEvidence,
      sourceKind: "official_programme",
      provider: eligibleProvider,
      policy: createPolicy(), // default: PURSUE needs sign-off
      confidenceFloor: 70,
    });
    expect(res.gate.passed).toBe(true);
    expect(res.recommendation.action).toBe("CONSIDER");
    expect(res.recommendation.rationale).toContain("sign-off");
  });

  it("emits PURSUE when policy permits auto-recommend and the gate passes", async () => {
    const permissive = createPolicy({
      fetchAllowlist: ["ec.europa.eu"],
      autoRecommendActions: ["PURSUE", "CONSIDER", "MONITOR", "DISCARD"],
    });
    const res = await qualify({
      project,
      opportunity: opp,
      evidence: strongEvidence,
      sourceKind: "official_programme",
      provider: eligibleProvider,
      policy: permissive,
      confidenceFloor: 70,
    });
    expect(res.gate.passed).toBe(true);
    expect(res.recommendation.action).toBe("PURSUE");
    expect(res.recommendation.nextAction).toBeTruthy();
  });

  it("never reaches PURSUE when the deadline cannot be corroborated", async () => {
    const res = await qualify({
      project,
      opportunity: opp,
      evidence: weakEvidence,
      sourceKind: "official_programme",
      provider: eligibleProvider,
      policy: createPolicy({
        fetchAllowlist: ["ec.europa.eu"],
        autoRecommendActions: ["PURSUE", "CONSIDER", "MONITOR", "DISCARD"],
      }),
      confidenceFloor: 70,
    });
    expect(res.gate.passed).toBe(false);
    expect(res.gate.failedReasons.join(" ")).toContain("deadline");
    expect(res.recommendation.action).not.toBe("PURSUE");
  });

  it("DISCARDs when a hard exclusion term is present", async () => {
    const excludedOpp: RawOpportunity = {
      ...opp,
      title: "Defence research programme",
      hints: { ...opp.hints, summary: "defence and military applications" },
    };
    const res = await qualify({
      project,
      opportunity: excludedOpp,
      evidence: { ...strongEvidence, text: strongEvidence.text + " defence" },
      sourceKind: "official_programme",
      provider: eligibleProvider,
      policy: createPolicy(),
      confidenceFloor: 70,
    });
    expect(res.scores.relevance).toBeLessThanOrEqual(20);
    expect(res.recommendation.action).toBe("DISCARD");
  });
});
