import { describe, expect, it } from "vitest";
import { looksLikeOwnPage, scoutedId, scoutedToConsoleRecord, type ScoutedRecord } from "../src/scout-to-console";

/**
 * A scouted call and a TED notice both land at "not verified yet", but they must
 * not land EQUAL. One came from an official API with typed metadata; the other
 * from a model reading a web page. If the console cannot tell them apart, the
 * weakest evidence in the system is presented with the same weight as the
 * strongest.
 */

const call = (over: Partial<ScoutedRecord> = {}): ScoutedRecord => ({
  title: "Pass Investissement",
  issuer: "Région Bretagne",
  kind: "GRANT",
  sourceUrl: "https://www.bretagne.bzh/aides/pass-investissement/",
  summary: "Soutien aux PME bretonnes",
  eligibility: "PME bretonnes",
  amountText: "jusqu'à 50 000 €",
  deadlineText: "en continu",
  quote: "Le dispositif Pass Investissement soutient les PME bretonnes.",
  sourceId: "region-bretagne",
  contentHash: "abc123",
  facts: [],
  ...over,
});

const opts = {
  sourcePageUrl: "https://www.bretagne.bzh/aides/",
  forProjects: ["sillon"],
  model: "mistral-large-latest",
};

describe("scouted calls become records that know how weak they are", () => {
  it("never claims more than 35 information confidence, where TED reaches 60", () => {
    const rich = scoutedToConsoleRecord(
      call({
        facts: Array.from({ length: 20 }, () => ({
          field: "scope",
          normalizedValue: "x",
          originalSourceText: "x",
          classification: "EXTRACTED_FROM_OFFICIAL_SOURCE" as const,
          sourceArtifactId: "a",
          locator: { type: "DOCUMENT_SECTION" as const, value: "u" },
          extractionMethod: "llm",
          extractingProvider: "mistral",
          extractingModel: "m",
          extractionConfidence: 0.5,
          validationResult: "unchecked" as const,
        })),
      }),
      opts,
    );
    expect(rich.scores.infoConfidence).toBeLessThanOrEqual(35);
  });

  it("can never be PURSUE-eligible, and says a model read it", () => {
    const r = scoutedToConsoleRecord(call(), opts);
    expect(r.gate.pursueEligible).toBe(false);
    expect(r.gate.verifiedSource).toBe(false);
    expect(r.gate.failedReasons).toContain("read by a model, not verified by a human");
    expect(r.verificationStatus).toBe("MANUAL_REVIEW_REQUIRED");
  });

  it("names the model in the questions, because who said this is part of the claim", () => {
    const r = scoutedToConsoleRecord(call(), opts);
    expect(r.unresolvedQuestions.join(" ")).toContain("mistral-large-latest");
  });

  it("flags a call found on the portal's index rather than its own page", () => {
    // sourceUrl === the listing page itself: this is a directory entry, not a call page.
    const r = scoutedToConsoleRecord(call({ sourceUrl: "https://www.bretagne.bzh/aides/" }), opts);
    expect(r.gate.notAggregatorOnly).toBe(false);
    expect(r.gate.failedReasons).toContain("this is the portal's listing page, not the call's own page");
    expect(r.warnings.length).toBeGreaterThan(0);
  });

  it("accepts a deeper path on the same host as the call's own page", () => {
    expect(looksLikeOwnPage({ sourceUrl: "https://a.fr/aides/x/" }, "https://a.fr/aides/")).toBe(true);
    expect(looksLikeOwnPage({ sourceUrl: "https://a.fr/aides/" }, "https://a.fr/aides/")).toBe(false);
  });

  it("treats leaving the portal entirely as the call's own page", () => {
    expect(looksLikeOwnPage({ sourceUrl: "https://autre.fr/appel" }, "https://a.fr/aides/")).toBe(true);
  });

  it("keeps the same id for the same call across runs, so the watch can track it", () => {
    expect(scoutedId(call())).toBe(scoutedId(call({ title: "renamed on the page" })));
    expect(scoutedId(call())).not.toBe(scoutedId(call({ sourceUrl: "https://www.bretagne.bzh/aides/autre/" })));
  });

  it("records both URLs: where it was found and where the call lives", () => {
    const r = scoutedToConsoleRecord(call(), opts);
    expect(r.discoveryUrl).toBe("https://www.bretagne.bzh/aides/");
    expect(r.officialUrl).toBe("https://www.bretagne.bzh/aides/pass-investissement/");
  });

  it("says plainly when the page stated no deadline, instead of implying one", () => {
    const r = scoutedToConsoleRecord(call({ deadlineText: "" }), opts);
    expect(r.unresolvedQuestions.join(" ")).toMatch(/No deadline was stated/);
  });
});
