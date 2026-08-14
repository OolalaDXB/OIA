import { describe, expect, it } from "vitest";
import type { ConsoleRecord } from "@oia/ingestion";
import { THESTUDIO_PROJECTS, createSuggestionService, scoreProject } from "../src/index";

const svc = createSuggestionService(THESTUDIO_PROJECTS);

function record(title: string, issuer: string, factValues: string[] = []): ConsoleRecord {
  return {
    id: "t1",
    title,
    issuer,
    linkedBy: "officialUrl",
    verificationStatus: "MANUAL_REVIEW_REQUIRED",
    verificationEvidence: [],
    application: "UNKNOWN",
    award: "UNKNOWN",
    strategicRoute: "UNKNOWN",
    scores: { relevance: null, winPotential: null, infoConfidence: 30 },
    recommendation: "INVESTIGATE",
    humanReview: "PENDING",
    facts: factValues.map((v, i) => ({
      field: `f${i}`,
      normalizedValue: v,
      classification: "EXTRACTED_FROM_OFFICIAL_SOURCE",
      locator: { type: "JSON_PATH", value: `f${i}` },
      extractionMethod: "t",
      extractingProvider: "t",
      extractingModel: "t",
      extractionConfidence: 0.9,
      originalSourceText: v,
    })),
    deadlines: [],
    conflicts: [],
    discrepancies: [],
    expected: {},
    unresolvedQuestions: [],
    warnings: [],
  } as unknown as ConsoleRecord;
}

describe("[P2] SuggestionService (deterministic, explainable)", () => {
  it("ranks BAWABA first for an AI/data digital call", async () => {
    const r = record("AI and data platform for creative industries", "European Commission", [
      "artificial intelligence",
      "digital",
    ]);
    const out = await svc.suggestProjects(r);
    expect(out.length).toBeGreaterThan(0);
    expect(out[0]?.projectSlug).toBe("bawaba");
    expect(out[0]?.rationale).toContain("keywords:");
    expect(out[0]?.rationale).toContain("not a verdict");
  });

  it("ranks Maisons.co first for a hospitality/tourism opportunity", async () => {
    const r = record("Rural heritage renovation grant for tourism accommodation", "Region Bretagne");
    const out = await svc.suggestProjects(r);
    expect(out[0]?.projectSlug).toBe("maisons-co");
  });

  it("returns NO suggestion when nothing matches (honesty over coverage)", async () => {
    const r = record("Machine tools procurement", "Ferservizi SpA");
    const out = await svc.suggestProjects(r);
    expect(out.find((s) => s.projectSlug === "maisons-co")).toBeUndefined();
  });

  it("hard-caps confidence below certainty", async () => {
    const kitchen = record(
      "AI data digital creative culture media software innovation platform",
      "EU",
      ["artificial intelligence", "ai", "digital", "creative", "culture", "media", "software"],
    );
    const out = await svc.suggestProjects(kitchen);
    for (const s of out) expect(s.confidence).toBeLessThanOrEqual(70);
  });

  it("word-boundary matching: 'ai' does not fire inside 'maintenance'", () => {
    const r = record("Building maintenance services", "City of X");
    const bawaba = THESTUDIO_PROJECTS.find((p) => p.slug === "bawaba")!;
    const s = scoreProject(r, bawaba);
    expect(s?.rationale ?? "").not.toContain("keywords: ai");
  });

  it("exclusions veto a project match", () => {
    const withExclusion = { ...THESTUDIO_PROJECTS[0]!, exclusions: ["defence"] };
    const r = record("AI platform for defence applications", "NATO");
    expect(scoreProject(r, withExclusion)).toBeNull();
  });
});
