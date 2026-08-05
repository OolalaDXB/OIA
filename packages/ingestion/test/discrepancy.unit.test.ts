import { describe, it, expect } from "vitest";
import { compareRecord, type ObservedForRecord } from "../src/discrepancy";
import type { SeedRecord } from "../src/seed-manifest";

const obs = (over: Partial<ObservedForRecord> = {}): ObservedForRecord => ({
  linkedBy: "localArtifact",
  hasArtifact: true,
  artifactId: "art_1",
  sourceFormat: "PDF",
  verificationStatus: "MANUAL_REVIEW_REQUIRED",
  recommendation: "INVESTIGATE",
  liveFetchStatus: "BLOCKED",
  factFields: ["amount", "topic_identifier"],
  ...over,
});

describe("[UNIT] seed↔observed comparator", () => {
  it("flags a recommendation hypothesis that the pipeline contradicts", () => {
    const seed = { id: "hub71", title: "t", issuer: "i", officialUrl: "https://hub71.com/x", expectedRecommendation: "PURSUE" } as SeedRecord;
    const d = compareRecord(seed, obs({ recommendation: "REJECT", hasArtifact: false, linkedBy: "officialUrl" }));
    const rec = d.find((x) => x.field === "recommendation");
    expect(rec).toBeTruthy();
    expect(rec!.seedExpectation).toBe("PURSUE");
    expect(rec!.observed).toBe("REJECT");
    expect(rec!.humanReviewRequired).toBe(true);
  });

  it("produces no recommendation discrepancy when expectation matches observation", () => {
    const seed = { id: "x", title: "t", issuer: "i", officialUrl: "https://ec.europa.eu/x", expectedRecommendation: "INVESTIGATE" } as SeedRecord;
    const d = compareRecord(seed, obs({ recommendation: "INVESTIGATE" }));
    expect(d.find((x) => x.field === "recommendation")).toBeUndefined();
  });

  it("treats two records on the same artifact as distinct angles", () => {
    const closed = { id: "genai-pa", title: "t", issuer: "EC", localArtifact: "f.pdf", isClosedCall: true, expectedRecommendation: "REJECT" } as SeedRecord;
    const fixture = { id: "pdf-fixture", title: "t", issuer: "EC", localArtifact: "f.pdf", expectedRecommendation: "INVESTIGATE" } as SeedRecord;
    // Same artifact, but each observed with its own context-derived recommendation.
    const dClosed = compareRecord(closed, obs({ recommendation: "REJECT" }));
    const dFixture = compareRecord(fixture, obs({ recommendation: "INVESTIGATE" }));
    expect(dClosed.find((x) => x.field === "recommendation")).toBeUndefined();
    expect(dFixture.find((x) => x.field === "recommendation")).toBeUndefined();
  });

  it("flags a verification hypothesis mismatch", () => {
    const seed = { id: "x", title: "t", issuer: "i", officialUrl: "https://ec.europa.eu/x", expectedVerificationStatus: "VERIFIED" } as SeedRecord;
    const d = compareRecord(seed, obs({ verificationStatus: "MANUAL_REVIEW_REQUIRED" }));
    expect(d.find((x) => x.field === "verificationStatus")?.observed).toBe("MANUAL_REVIEW_REQUIRED");
  });

  it("flags expected facts absent from the official source", () => {
    const seed = { id: "x", title: "t", issuer: "i", localArtifact: "f.pdf", expectedExtractedFacts: { deadline: "2026-03-03", grant_ceiling: "EUR 5M" } } as SeedRecord;
    const d = compareRecord(seed, obs({ factFields: ["amount"] }));
    const fields = d.map((x) => x.field);
    expect(fields).toContain("fact:deadline");
    expect(fields).toContain("fact:grant_ceiling");
  });

  it("flags an aggregator-only lead that nonetheless carries observed facts", () => {
    const seed = { id: "agg", title: "t", issuer: "blog", discoveryUrl: "https://medium.com/x", isAggregatorOnly: true } as SeedRecord;
    const d = compareRecord(seed, obs({ linkedBy: "discoveryUrl", factFields: ["amount"] }));
    expect(d.find((x) => x.field === "aggregatorFacts")).toBeTruthy();
  });
});
