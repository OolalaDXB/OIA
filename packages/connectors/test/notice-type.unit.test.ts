import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { classifyNoticeType, isWorthProcessing, skipReason } from "../src/ted/notice-type";
import { getNotices, pickText, TedSearchResponseSchema } from "../src/ted/map";
import { buildTedQueryLayers, narrowQuery, queryFromLayers } from "../src/ted/query";

describe("notice classification", () => {
  it("recognises what can be bid on, and what cannot", () => {
    expect(classifyNoticeType("cn-standard")).toBe("BIDDABLE");
    expect(classifyNoticeType("cn-social")).toBe("BIDDABLE");
    expect(classifyNoticeType("qu-sy")).toBe("QUALIFICATION_SYSTEM");
    expect(classifyNoticeType("corr")).toBe("CORRECTION");
    expect(classifyNoticeType("pin-only")).toBe("PRE_SOLICITATION");
    expect(classifyNoticeType("can-standard")).toBe("AWARD_RESULT");
  });

  it("keeps a notice type it does not recognise instead of dropping it", () => {
    // eForms subtypes change; discarding the unfamiliar would repeat the very
    // mistake this module exists to fix, in the other direction.
    expect(classifyNoticeType("some-new-2029-subtype")).toBe("UNKNOWN");
    expect(isWorthProcessing("some-new-2029-subtype")).toBe(true);
    expect(skipReason("some-new-2029-subtype")).toBeNull();
  });

  it("states why a notice was set aside", () => {
    expect(skipReason("qu-sy")).toContain("standing supplier register");
    expect(skipReason("cn-standard")).toBeNull();
  });
});

describe("[FIXTURE_CONTRACT] against the real recorded TED response", () => {
  const path = fileURLToPath(new URL("./fixtures/ted-search-response.json", import.meta.url));
  const raw = JSON.parse(readFileSync(path, "utf8"));
  const notices = getNotices(TedSearchResponseSchema.parse(raw));

  it("filters out the majority that is not an opportunity", () => {
    const kept = notices.filter((n) => isWorthProcessing(pickText(n["notice-type"])));
    expect(notices.length).toBe(100);
    // 81 qualification systems + 2 corrigenda in this recorded response.
    expect(kept.length).toBe(17);
    for (const n of kept) {
      expect(classifyNoticeType(pickText(n["notice-type"]))).not.toBe("QUALIFICATION_SYSTEM");
    }
  });
});

describe("query layers", () => {
  const input = {
    cpv: ["72212000"],
    countries: ["FRA"],
    publishedSince: "20260618",
    noticeTypes: ["cn-standard"],
    fullText: ["digital transformation"],
  };

  it("orders proven clauses before speculative ones", () => {
    const layers = buildTedQueryLayers(input);
    expect(layers.map((l) => l.name)).toEqual(["cpv", "country", "recency", "notice-type", "full-text"]);
    expect(layers.filter((l) => l.proven).map((l) => l.name)).toEqual(["cpv", "country", "recency"]);
  });

  it("degrades one speculative layer at a time, and stops at the proven core", () => {
    let layers = buildTedQueryLayers(input);
    expect(queryFromLayers(layers)).toContain("FT ~ ");

    layers = narrowQuery(layers)!;
    expect(queryFromLayers(layers)).not.toContain("FT ~ ");
    expect(queryFromLayers(layers)).toContain("notice-type IN");

    layers = narrowQuery(layers)!;
    const core = queryFromLayers(layers)!;
    expect(core).toBe(
      "classification-cpv IN (72212000) AND buyer-country IN (FRA) AND publication-date>=20260618",
    );

    // Nothing speculative left: a rejection here is a real problem, not a guess.
    expect(narrowQuery(layers)).toBeNull();
  });

  it("never loses the recency floor while degrading", () => {
    let layers: ReturnType<typeof buildTedQueryLayers> | null = buildTedQueryLayers(input);
    while (layers && narrowQuery(layers)) layers = narrowQuery(layers);
    expect(queryFromLayers(layers!)).toContain("publication-date>=20260618");
  });
});
