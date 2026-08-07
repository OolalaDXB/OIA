import { describe, it, expect } from "vitest";
import { buildTedExpertQuery, sectorsToCpv } from "../src/ted/query";
import { mapTedNotices, noticeUrl, pickText, pickList } from "../src/ted/map";

describe("[UNIT] TED query builder", () => {
  it("builds a CPV + country expert query", () => {
    expect(buildTedExpertQuery({ cpv: ["72000000", "48000000"], countries: ["FRA"] })).toBe(
      "classification-cpv IN (72000000 48000000) AND buyer-country IN (FRA)",
    );
  });
  it("returns undefined when there is nothing to filter on", () => {
    expect(buildTedExpertQuery({})).toBeUndefined();
  });
  it("maps BAWABA-ish sectors to CPV codes", () => {
    const cpv = sectorsToCpv(["AI", "creative industries"]);
    expect(cpv).toContain("72000000");
    expect(cpv).toContain("92000000");
  });
});

describe("[UNIT] TED value helpers", () => {
  it("builds the canonical official notice URL", () => {
    expect(noticeUrl("123456-2026")).toBe("https://ted.europa.eu/en/notice/123456-2026/html");
  });
  it("pickText handles string / language-map / array", () => {
    expect(pickText("hello")).toBe("hello");
    expect(pickText({ fra: "Bonjour", eng: "Hello" })).toBe("Hello"); // prefers English
    expect(pickText(["", "second"])).toBe("second");
  });
  it("pickList flattens arrays of values", () => {
    expect(pickList(["72000000", "48000000"])).toEqual(["72000000", "48000000"]);
  });
});

// SHAPE-ONLY input — this exercises the pure mapper. It is NOT a recorded TED
// response; the real-recorded-response contract test lives in ted.contract.test.ts
// and runs once the live run records the fixture.
const SHAPE_ONLY_RESPONSE = {
  totalNoticeCount: 2,
  iterationNextToken: "tok",
  notices: [
    {
      "publication-number": "111111-2026",
      "notice-title": { eng: "AI data platform services", fra: "Services de plateforme IA" },
      "buyer-name": { eng: "Ministry X" },
      "buyer-country": "FRA",
      "publication-date": "2026-07-01",
      deadline: "2026-09-30T17:00:00+02:00",
      "classification-cpv": ["72000000", "48000000"],
      "notice-type": { eng: "Contract notice" },
    },
    // duplicate publication-number → must be deduped
    { "publication-number": "111111-2026", "notice-title": "dup" },
    // missing publication-number → skipped
    { "notice-title": "no id" },
  ],
};

describe("[UNIT] mapTedNotices (shape-only)", () => {
  const out = mapTedNotices(SHAPE_ONLY_RESPONSE, "2026-08-05T00:00:00.000Z");

  it("maps notices, dedups by publication-number, skips id-less ones", () => {
    expect(out).toHaveLength(1);
    expect(out[0]!.externalId).toBe("111111-2026");
  });
  it("uses the canonical TED URL as the candidate's primary source", () => {
    expect(out[0]!.url).toBe("https://ted.europa.eu/en/notice/111111-2026/html");
    expect(out[0]!.sourceKey).toBe("ted");
  });
  it("carries deadline + buyer as hints and retains the full notice in raw", () => {
    expect(out[0]!.hints.deadlineAt).toContain("2026-09-30");
    expect(out[0]!.hints.funder).toBe("Ministry X");
    expect((out[0]!.raw as Record<string, unknown>)["classification-cpv"]).toEqual([
      "72000000",
      "48000000",
    ]);
  });
});
