import { describe, expect, it } from "vitest";
import { applyReview, reviewReport, type ReviewerSource } from "../src/cross-review";
import { createFakeVisibilityLLM } from "../src/llm";
import type { Recommendation } from "../src/recommendation";

const reco: Recommendation = {
  id: "rec-fictive-ut1",
  schemaVersion: 1,
  type: "TECH_FIX",
  clientId: "fictive-client",
  siteId: "fictive-site",
  subjectId: "fictive-subject",
  title: "robots.txt manquant",
  statement: "Donnée fictive : pas de robots.txt.",
  evidence: [{ kind: "crawlie-report", ref: "crawlie.json#issues[0]" }],
  impact: { level: "medium" },
  effort: { level: "XS" },
  risk: "low",
  confidence: "high",
  decision: { status: "pending" },
  createdBy: "seo-command-technique",
  createdAt: "2026-11-08",
};

function fakeReviewer(role: string, findings: Array<{ kind: "error" | "missing-evidence" | "nuance"; text: string }>): ReviewerSource {
  return {
    role,
    llm: createFakeVisibilityLLM({
      "report.review": () => ({ findings }),
    }),
  };
}

describe("reviewReport", () => {
  it("collects critiques from every reviewer", async () => {
    const outcome = await reviewReport("report body", [
      fakeReviewer("seo", [{ kind: "error", text: "donnée fictive erronée" }]),
      fakeReviewer("aeo", [{ kind: "nuance", text: "formulation discutable" }]),
    ]);
    expect(outcome.critiques).toHaveLength(2);
  });

  it("accepts errors and missing-evidence, rejects nuances", async () => {
    const outcome = await reviewReport("report body", [
      fakeReviewer("seo", [
        { kind: "error", text: "e1" },
        { kind: "missing-evidence", text: "m1" },
        { kind: "nuance", text: "n1" },
      ]),
    ]);
    expect(outcome.decisions.filter((d) => d.decision === "accepted")).toHaveLength(2);
    expect(outcome.decisions.filter((d) => d.decision === "rejected")).toHaveLength(1);
  });
});

describe("applyReview", () => {
  it("drops confidence to low on an accepted error", async () => {
    const outcome = await reviewReport("x", [fakeReviewer("seo", [{ kind: "error", text: "e1" }])]);
    const applied = applyReview(reco, outcome);
    expect(applied.confidence).toBe("low");
    expect(applied.decision.status).toBe("pending");
  });

  it("drops confidence from high to medium on an accepted missing-evidence only", async () => {
    const outcome = await reviewReport("x", [fakeReviewer("seo", [{ kind: "missing-evidence", text: "m1" }])]);
    const applied = applyReview(reco, outcome);
    expect(applied.confidence).toBe("medium");
  });

  it("leaves the recommendation untouched when only nuances come back", async () => {
    const outcome = await reviewReport("x", [fakeReviewer("seo", [{ kind: "nuance", text: "n1" }])]);
    const applied = applyReview(reco, outcome);
    expect(applied).toEqual(reco);
  });
});
