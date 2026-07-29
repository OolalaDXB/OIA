import { describe, it, expect } from "vitest";
import { validateSeedDataset, detectSeedInconsistencies, type SeedDataset } from "../src/seed-manifest";

describe("[UNIT] seed schema + inconsistency detection (spec §1, §10)", () => {
  it("rejects a malformed dataset", () => {
    expect(validateSeedDataset({ version: 1, records: [] }).ok).toBe(false);
    expect(validateSeedDataset({ records: [{ id: "x" }] }).ok).toBe(false);
  });

  it("requires at least one URL / artifact per record", () => {
    const r = validateSeedDataset({ version: 1, records: [{ id: "a", title: "t", issuer: "i" }] });
    expect(r.ok).toBe(false);
    expect(r.errors.join(" ")).toMatch(/officialUrl|discoveryUrl|localArtifact/);
  });

  it("flags PURSUE that is not backed by VERIFIED", () => {
    const ds: SeedDataset = {
      version: 1,
      records: [{ id: "hub71", title: "Access Cohort 20", issuer: "Hub71", officialUrl: "https://hub71.com/x", expectedRecommendation: "PURSUE", expectedVerificationStatus: "OFFICIAL_SOURCE_FOUND" }],
    };
    const issues = detectSeedInconsistencies(ds);
    expect(issues.map((i) => i.rule)).toContain("pursue-requires-verified");
  });

  it("flags an aggregator-only lead that carries confirmed facts or PURSUE", () => {
    const ds: SeedDataset = {
      version: 1,
      records: [{ id: "agg", title: "Lead", issuer: "Blog", discoveryUrl: "https://medium.com/x", isAggregatorOnly: true, expectedRecommendation: "PURSUE", expectedExtractedFacts: { amount: "€1M" } }],
    };
    const rules = detectSeedInconsistencies(ds).map((i) => i.rule);
    expect(rules).toContain("aggregator-cannot-pursue");
    expect(rules).toContain("aggregator-no-confirmed-facts");
  });

  it("flags ELIGIBLE_AFTER_NEW_ENTITY for an EU/FR opportunity (France SAS exists)", () => {
    const ds: SeedDataset = {
      version: 1,
      records: [{ id: "eic", title: "EIC Accelerator", issuer: "European Innovation Council", officialUrl: "https://eic.ec.europa.eu/x", expectedStrategicRoute: "ELIGIBLE_AFTER_NEW_ENTITY" }],
    };
    expect(detectSeedInconsistencies(ds).map((i) => i.rule)).toContain("new-entity-vs-existing-fr");
  });

  it("flags a seed strategic route that disagrees with the deterministic derivation", () => {
    const ds: SeedDataset = {
      version: 1,
      records: [{ id: "x", title: "t", issuer: "i", officialUrl: "https://ec.europa.eu/x", expectedApplicationEligibility: "ELIGIBLE_TO_APPLY_NOW", expectedAwardEligibility: "REQUIRES_NEW_ENTITY", expectedStrategicRoute: "ELIGIBLE_NOW" }],
    };
    expect(detectSeedInconsistencies(ds).map((i) => i.rule)).toContain("strategic-route-mismatch");
  });

  it("flags a closed call presented as an active PARTNER", () => {
    const ds: SeedDataset = {
      version: 1,
      records: [{ id: "genai", title: "GENAI closed", issuer: "EC", officialUrl: "https://ec.europa.eu/x", isClosedCall: true, expectedRecommendation: "PARTNER" }],
    };
    expect(detectSeedInconsistencies(ds).map((i) => i.rule)).toContain("closed-call-not-partner");
  });
});
