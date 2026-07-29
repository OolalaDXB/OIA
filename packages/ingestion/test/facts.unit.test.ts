import { describe, it, expect } from "vitest";
import { extractFactsFromPages, reconcileFacts } from "../src/facts";
import type { MaterialFact } from "../src/models";

describe("[UNIT] fact provenance + locators (spec §8)", () => {
  it("PDF facts retain their page locators", () => {
    const facts = extractFactsFromPages(
      [
        { pageNumber: 1, text: "Call topic HORIZON-CL4-2026-DIGITAL-01 overview." },
        { pageNumber: 3, text: "Indicative budget EUR 2 000 000 for the topic." },
      ],
      { artifactId: "art_x", officialSource: true },
    );
    const topic = facts.find((f) => f.field === "topic_identifier");
    expect(topic?.locator.type).toBe("PDF_PAGE");
    expect(topic?.locator.page).toBe(1);
    const amount = facts.find((f) => f.field === "amount");
    expect(amount?.locator.page).toBe(3);
    // Official artifact → EXTRACTED_FROM_OFFICIAL_SOURCE, never auto CONFIRMED_OFFICIAL.
    expect(topic?.classification).toBe("EXTRACTED_FROM_OFFICIAL_SOURCE");
  });

  it("an inferred value never overwrites an official value", () => {
    const official: MaterialFact = {
      field: "deadline", normalizedValue: "2026-09-15", originalSourceText: "2026-09-15",
      classification: "EXTRACTED_FROM_OFFICIAL_SOURCE", sourceArtifactId: "a",
      locator: { type: "PDF_PAGE", value: "page 1", page: 1 }, extractionMethod: "pdf-text",
      extractingProvider: "deterministic", extractingModel: "rules-v1", extractionConfidence: 0.9,
      validationResult: "unchecked",
    };
    const inferred: MaterialFact = { ...official, normalizedValue: "2026-12-01", classification: "INFERRED" };
    const [view] = reconcileFacts([inferred, official]);
    expect(view!.chosen.classification).toBe("EXTRACTED_FROM_OFFICIAL_SOURCE");
    expect(view!.chosen.normalizedValue).toBe("2026-09-15");
  });

  it("conflicting OFFICIAL values are preserved and flagged as a conflict", () => {
    const base: MaterialFact = {
      field: "deadline", normalizedValue: "2026-09-15", originalSourceText: "", classification: "EXTRACTED_FROM_OFFICIAL_SOURCE",
      sourceArtifactId: "a", locator: { type: "PDF_PAGE", value: "page 1", page: 1 }, extractionMethod: "pdf-text",
      extractingProvider: "deterministic", extractingModel: "rules-v1", extractionConfidence: 0.9, validationResult: "unchecked",
    };
    const other: MaterialFact = { ...base, normalizedValue: "2026-10-01" };
    const [view] = reconcileFacts([base, other]);
    expect(view!.hasOfficialConflict).toBe(true);
    expect(view!.conflicts.length).toBeGreaterThan(0);
  });
});
