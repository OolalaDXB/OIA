import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  mapSediaResults,
  buildSediaQuery,
} from "../src/connectors/eu-funding-tenders";
import type { ProjectProfile } from "@oia/database";

const fixture = JSON.parse(
  readFileSync(fileURLToPath(new URL("./fixtures/sedia-response.json", import.meta.url)), "utf8"),
);

const AT = "2026-07-29T00:00:00.000Z";

describe("mapSediaResults", () => {
  const results = mapSediaResults(fixture, AT);

  it("maps well-formed results, skipping ones missing id/url/title", () => {
    // 3 in fixture, 1 lacks identifier+title → skipped.
    expect(results).toHaveLength(2);
    expect(results.map((r) => r.externalId)).toEqual([
      "HORIZON-CL4-2026-DIGITAL-01",
      "CREA-MEDIA-2026-DEV",
    ]);
  });

  it("prefers metadata.title over the fallback result title", () => {
    expect(results[0]!.title).toBe("AI for Creative Industries");
  });

  it("maps SEDIA status codes to our vocabulary", () => {
    expect(results[0]!.hints.status).toBe("open"); // 31094502
    expect(results[1]!.hints.status).toBe("upcoming"); // 31094501
  });

  it("carries the source-claimed deadline as a hint (not yet a fact)", () => {
    expect(results[0]!.hints.deadlineAt).toBe("2026-09-15T17:00:00+02:00");
  });

  it("retains the raw payload for provenance", () => {
    expect(results[0]!.raw).toBeTruthy();
  });

  it("tags every result with the EU source key and EC funder", () => {
    for (const r of results) {
      expect(r.sourceKey).toBe("eu-funding-tenders");
      expect(r.hints.funder).toBe("European Commission");
    }
  });
});

describe("buildSediaQuery", () => {
  const profile = { keywords: ["creative industries", "AI"] } as ProjectProfile;

  it("uses profile keywords as the free-text query", () => {
    expect(buildSediaQuery(profile).text).toBe("creative industries AI");
  });

  it("falls back to *** when there are no keywords", () => {
    expect(buildSediaQuery({ keywords: [] } as unknown as ProjectProfile).text).toBe("***");
  });

  it("filters to grants that are forthcoming or open", () => {
    const q = buildSediaQuery(profile).query as {
      bool: { must: Array<{ terms: Record<string, string[]> }> };
    };
    expect(q.bool.must[0]!.terms.type).toEqual(["1"]);
    expect(q.bool.must[1]!.terms.status).toEqual(["31094501", "31094502"]);
  });
});
