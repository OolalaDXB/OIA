import { describe, expect, it } from "vitest";
import { dedupKey, dedupeRecords, normalizeText, titleStem } from "../src/dedup";
import type { ConsoleRecord } from "../src/console";

function record(over: Partial<ConsoleRecord> & { id: string }): ConsoleRecord {
  return {
    title: "Digital Europe Programme — AI adoption call",
    issuer: "European Commission",
    linkedBy: "officialUrl",
    verificationStatus: "MANUAL_REVIEW_REQUIRED",
    verificationEvidence: [],
    application: "UNKNOWN",
    award: "UNKNOWN",
    strategicRoute: "UNKNOWN",
    scores: { relevance: null, winPotential: null, infoConfidence: 30 },
    recommendation: "INVESTIGATE",
    humanReview: "PENDING",
    facts: [],
    deadlines: [],
    conflicts: [],
    discrepancies: [],
    expected: {},
    unresolvedQuestions: [],
    warnings: [],
    ...over,
  } as ConsoleRecord;
}

const deadline = (iso: string) => [
  {
    normalized: iso,
    originalSourceString: iso,
    deadlineType: "APPLICATION" as const,
    isConfirmPending: false,
    locator: { type: "JSON_PATH" as const, value: "$.deadline" },
    conflicts: [],
  },
];

describe("dedup key", () => {
  it("normalizes accents, case and punctuation", () => {
    expect(normalizeText("Éligibilité — Appel à projets (2026)")).toBe("eligibilite appel a projets 2026");
  });

  it("drops publisher noise words from the title stem", () => {
    expect(titleStem("Call for tender: AI adoption services")).toBe("adoption");
  });

  it("gives the same key to the same call published by two sources", () => {
    const a = record({ id: "ted-1", officialUrl: "https://ted.europa.eu/notice/1", deadlines: deadline("2026-12-01") });
    const b = record({
      id: "manual-1",
      title: "Digital Europe Programme – AI Adoption Call",
      officialUrl: "https://ec.europa.eu/info/call",
      deadlines: deadline("2026-12-01T17:00:00Z"),
    });
    expect(dedupKey(a)).toBe(dedupKey(b));
  });

  it("keeps two editions of the same programme apart (different deadline)", () => {
    const a = record({ id: "a", deadlines: deadline("2026-12-01") });
    const b = record({ id: "b", deadlines: deadline("2027-12-01") });
    expect(dedupKey(a)).not.toBe(dedupKey(b));
  });
});

describe("dedupeRecords", () => {
  it("keeps the richer record and records what was merged into it", () => {
    const thin = record({ id: "thin", deadlines: deadline("2026-12-01"), discoveredFor: ["sillon"] });
    const rich = record({
      id: "rich",
      deadlines: deadline("2026-12-01"),
      discoveredFor: ["bawaba"],
      scores: { relevance: null, winPotential: null, infoConfidence: 70 },
      facts: [
        {
          field: "publication-date",
          normalizedValue: "2026-09-01",
          classification: "EXTRACTED_FROM_OFFICIAL_SOURCE",
          locator: { type: "JSON_PATH", value: "$.pub" },
          extractionMethod: "ted-search-api",
          extractingProvider: "ted",
          extractingModel: "search-api-v3",
          extractionConfidence: 0.85,
          originalSourceText: "2026-09-01",
        },
      ],
    });

    const { records, merged } = dedupeRecords([thin, rich]);
    expect(merged).toBe(1);
    expect(records).toHaveLength(1);
    expect(records[0]!.id).toBe("rich");
    expect(records[0]!.mergedFrom).toEqual(["thin"]);
    // Discovery provenance survives the merge for BOTH projects.
    expect(records[0]!.discoveredFor?.sort()).toEqual(["bawaba", "sillon"]);
    expect(records[0]!.warnings.join(" ")).toContain("merged duplicate thin");
  });

  it("leaves distinct opportunities untouched and preserves queue order", () => {
    const a = record({ id: "a", title: "AI adoption call", deadlines: deadline("2026-12-01") });
    const b = record({ id: "b", title: "Heritage restoration grant", issuer: "Région Bretagne" });
    const { records, merged } = dedupeRecords([a, b]);
    expect(merged).toBe(0);
    expect(records.map((r) => r.id)).toEqual(["a", "b"]);
    expect(records[0]!.dedupKey).toBeTruthy();
  });
});
