import { describe, expect, it } from "vitest";
import {
  EvidenceRef,
  RecommendationSchema,
  loadRecommendationJsonSchema,
} from "../src/recommendation";

const base = {
  id: "rec-fictive-123",
  schemaVersion: 1 as const,
  type: "TECH_FIX" as const,
  clientId: "fictive-client",
  siteId: "fictive-site",
  subjectId: "fictive-subject",
  title: "Ajouter une sitemap.xml",
  statement: "Donnée fictive : le site n'a pas de sitemap. Le CI SEO échoue.",
  evidence: [{ kind: "crawlie-report" as const, ref: "crawlie.json#issues[sitemap-missing]" }],
  impact: { level: "medium" as const },
  effort: { level: "XS" as const },
  risk: "low" as const,
  confidence: "high" as const,
  decision: { status: "pending" as const },
  createdBy: "seo-command-technique",
  createdAt: "2026-11-08",
};

describe("Recommendation (E2)", () => {
  it("accepts a well-formed recommendation", () => {
    expect(() => RecommendationSchema.parse(base)).not.toThrow();
  });

  it("refuses an id that does not start with rec-", () => {
    expect(() => RecommendationSchema.parse({ ...base, id: "bad-id" })).toThrow();
  });

  it("refuses an evidence array of zero", () => {
    expect(() => RecommendationSchema.parse({ ...base, evidence: [] })).toThrow();
  });

  it("refuses a high-risk recommendation that is `accepted`", () => {
    const r = {
      ...base,
      risk: "high" as const,
      decision: { status: "accepted" as const, by: "mt", at: "2026-11-08" },
    };
    expect(() => RecommendationSchema.parse(r)).toThrow();
  });

  it("accepts a high-risk recommendation when `pending` or `rejected`", () => {
    for (const status of ["pending", "rejected", "obsolete"] as const) {
      expect(() =>
        RecommendationSchema.parse({ ...base, risk: "high", decision: { status } }),
      ).not.toThrow();
    }
  });

  it("the EvidenceRef requires a sha256 of 64 hex chars when provided", () => {
    expect(() => EvidenceRef.parse({ kind: "evidence-row", ref: "x", sha256: "not-hex" })).toThrow();
    expect(() =>
      EvidenceRef.parse({ kind: "evidence-row", ref: "x", sha256: "a".repeat(64) }),
    ).not.toThrow();
  });

  it("JSON Schema file loads and references the same enum values", () => {
    const schema = loadRecommendationJsonSchema() as {
      properties: { type: { enum: string[] } };
    };
    expect(schema.properties.type.enum).toEqual([
      "FIX_FACT",
      "CONTENT_GAP",
      "ENTITY_INCONSISTENCY",
      "SOURCE_TARGET",
      "TECH_FIX",
      "WATCH",
    ]);
  });
});
