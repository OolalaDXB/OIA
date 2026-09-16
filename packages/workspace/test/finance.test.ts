import { describe, expect, it } from "vitest";
import type { ConsoleRecord } from "@oia/ingestion/console";
import { amountOf, financeByProject, formatTotals, parseAmount, projectFinance } from "../src/finance";

const NOW = "2026-09-16T00:00:00.000Z";

function fact(field: string, value: string) {
  return {
    field,
    normalizedValue: value,
    classification: "EXTRACTED_FROM_OFFICIAL_SOURCE" as const,
    locator: { type: "DOCUMENT_SECTION" as const, value: field },
    extractionMethod: "regex",
    extractingProvider: "deterministic",
    extractingModel: "tender-rules-v1",
    extractionConfidence: 0.7,
    originalSourceText: value,
  };
}

function record(over: Partial<ConsoleRecord> & { id: string }): ConsoleRecord {
  return {
    title: "A call", issuer: "An issuer", linkedBy: "officialUrl",
    verificationStatus: "MANUAL_REVIEW_REQUIRED", verificationEvidence: [],
    application: "UNKNOWN", award: "UNKNOWN", strategicRoute: "UNKNOWN",
    scores: { relevance: null, winPotential: null, infoConfidence: 40 },
    recommendation: "INVESTIGATE", humanReview: "PENDING",
    facts: [], deadlines: [], conflicts: [], discrepancies: [], expected: {},
    unresolvedQuestions: [], warnings: [],
    ...over,
  } as ConsoleRecord;
}

const input = (records: ConsoleRecord[], tags: Record<string, string> = {}) => ({
  records, tags, auditLog: [], nowIso: NOW,
});

describe("reading an amount out of extracted text", () => {
  it("handles the grouping styles that actually appear", () => {
    expect(parseAmount("EUR 480 000")).toMatchObject({ currency: "EUR", value: 480000, confidence: "HIGH" });
    expect(parseAmount("€1.234.567")).toMatchObject({ currency: "EUR", value: 1234567 });
    expect(parseAmount("USD 2,500,000")).toMatchObject({ currency: "USD", value: 2500000 });
    expect(parseAmount("EUR 8 500 000 .")).toMatchObject({ currency: "EUR", value: 8500000 });
    expect(parseAmount("EUR 1 200,50")).toMatchObject({ value: 1200.5 });
  });

  it("expands a written multiplier", () => {
    expect(parseAmount("EUR 2 million")?.value).toBe(2_000_000);
  });

  it("flags a ragged parse instead of quietly trusting it", () => {
    // "EUR 5 0 00 000" is real output from a real PDF extraction in this repo.
    const ragged = parseAmount("EUR 5 0 00 000");
    expect(ragged?.confidence).toBe("LOW");
  });

  it("flags an amount with no currency rather than assuming euros", () => {
    expect(parseAmount("480 000")?.confidence).toBe("LOW");
    expect(parseAmount("480 000")?.currency).toBe("UNKNOWN");
  });

  it("returns nothing rather than a guess when there is no number", () => {
    expect(parseAmount("to be confirmed")).toBeNull();
    expect(parseAmount("")).toBeNull();
  });

  it("prefers the notice's own estimated-value section to a number found anywhere", () => {
    const r = record({ id: "a", facts: [fact("amount", "EUR 99"), fact("estimated_value", "EUR 480 000")] });
    expect(amountOf(r)).toMatchObject({ value: 480000, confidence: "HIGH" });
  });
});

describe("the project table", () => {
  it("shows coverage, so a total is never read as the whole pipeline", () => {
    const f = projectFinance(
      input([
        record({ id: "a", opportunityKind: "GRANT", facts: [fact("estimated_value", "EUR 100 000")] }),
        record({ id: "b", opportunityKind: "GRANT" }),
        record({ id: "c", opportunityKind: "GRANT" }),
      ], { a: "sillon", b: "sillon", c: "sillon" }),
      "sillon",
    );
    expect(f.records).toBe(3);
    expect(f.withAmount).toBe(1); // one figure out of three records
    expect(formatTotals(f.inbound)).toBe("EUR 100,000");
  });

  it("NEVER adds an acquisition to the funding total", () => {
    const f = projectFinance(
      input([
        record({ id: "grant", opportunityKind: "GRANT", facts: [fact("estimated_value", "EUR 100 000")] }),
        record({ id: "buy", opportunityKind: "ACQUISITION", facts: [fact("estimated_value", "EUR 900 000")] }),
      ], { grant: "studio", buy: "studio" }),
      "studio",
    );
    expect(f.inbound["EUR"]).toBe(100_000);
    expect(f.outbound["EUR"]).toBe(900_000);
    // The one arithmetic mistake that would make this table worse than nothing.
    expect(f.inbound["EUR"]).not.toBe(1_000_000);
  });

  it("separates what the gate blocks from what a human could promote today", () => {
    const openGate = {
      accessiblePrimarySource: true, verifiedSource: true, verifiedDeadline: true, notExpired: true,
      eligibilityAssessed: true, notAggregatorOnly: true, notClosedCall: true, hasExactNextAction: true,
      sufficientConfidence: true, pursueEligible: true, failedReasons: [],
    };
    const f = projectFinance(
      input([
        record({ id: "ok", opportunityKind: "GRANT", gate: openGate, facts: [fact("estimated_value", "EUR 50 000")] }),
        record({ id: "blocked", opportunityKind: "GRANT", facts: [fact("estimated_value", "EUR 200 000")] }),
      ], { ok: "p", blocked: "p" }),
      "p",
    );
    expect(f.clear["EUR"]).toBe(50_000);
    expect(f.blocked["EUR"]).toBe(200_000);
  });

  it("keeps currencies apart rather than inventing a conversion", () => {
    const f = projectFinance(
      input([
        record({ id: "a", opportunityKind: "GRANT", facts: [fact("estimated_value", "EUR 100 000")] }),
        record({ id: "b", opportunityKind: "GRANT", facts: [fact("estimated_value", "AED 400 000")] }),
      ], { a: "p", b: "p" }),
      "p",
    );
    expect(formatTotals(f.inbound)).toBe("AED 400,000 · EUR 100,000");
  });

  it("counts a record for the project that discovered it until a human says otherwise", () => {
    const f = projectFinance(
      input([record({ id: "a", opportunityKind: "TENDER", discoveredFor: ["sillon"] })]),
      "sillon",
    );
    expect(f.records).toBe(1);
  });

  it("ranks projects by what is actually in play", () => {
    const rows = financeByProject(
      input([
        record({ id: "small", opportunityKind: "GRANT", discoveredFor: ["a"], facts: [fact("estimated_value", "EUR 10 000")] }),
        record({ id: "big", opportunityKind: "GRANT", discoveredFor: ["b"], facts: [fact("estimated_value", "EUR 900 000")] }),
      ]),
      ["a", "b", "c"],
    );
    expect(rows.map((r) => r.projectSlug)).toEqual(["b", "a"]); // "c" has nothing, so it is absent
  });
});

describe("records attached to nothing", () => {
  it("shows them as a row instead of making them vanish", async () => {
    const { untriagedFinance } = await import("../src/finance");
    // The real situation on the shipped dataset: nothing tagged, no discovery
    // provenance. A money page that showed an empty table here would report an
    // empty pipeline when the truth is an untriaged one.
    const f = untriagedFinance(
      input([
        record({ id: "a", opportunityKind: "GRANT", facts: [fact("estimated_value", "EUR 120 000")] }),
        record({ id: "b", opportunityKind: "TENDER" }),
      ]),
      ["sillon", "bawaba"],
    );
    expect(f.records).toBe(2);
    expect(f.withAmount).toBe(1);
    expect(f.inbound["EUR"]).toBe(120_000);
  });

  it("excludes what a project already owns", async () => {
    const { untriagedFinance } = await import("../src/finance");
    const f = untriagedFinance(
      input([record({ id: "a", opportunityKind: "GRANT", discoveredFor: ["sillon"] })]),
      ["sillon"],
    );
    expect(f.records).toBe(0);
  });
});
