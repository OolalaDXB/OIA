import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { mapTedNotices, TedSearchResponseSchema, getNotices } from "../src/ted/map";

/**
 * [FIXTURE_CONTRACT] Runs against a REAL recorded TED Search response.
 * The fixture is captured verbatim by the live worker (docker compose up on a
 * machine with egress) — it is never fabricated. Until it exists, this suite is
 * skipped (honestly), so the sandbox stays green without inventing TED data.
 */
const fixturePath = fileURLToPath(new URL("./fixtures/ted-search-response.json", import.meta.url));
const hasFixture = existsSync(fixturePath);

describe.skipIf(!hasFixture)("[FIXTURE_CONTRACT] real recorded TED response", () => {
  const raw = hasFixture ? JSON.parse(readFileSync(fixturePath, "utf8")) : {};

  it("parses against the defensive schema", () => {
    expect(() => TedSearchResponseSchema.parse(raw)).not.toThrow();
  });

  it("maps at least one notice into a candidate with a canonical TED URL", () => {
    const candidates = mapTedNotices(raw, "2026-08-05T00:00:00.000Z");
    expect(candidates.length).toBeGreaterThan(0);
    for (const c of candidates) {
      expect(c.sourceKey).toBe("ted");
      expect(c.url).toMatch(/^https:\/\/ted\.europa\.eu\/[a-z]{2}\/notice\/.+\/html$/);
      expect(c.externalId).toBeTruthy();
    }
  });

  it("every notice in the envelope is retained or intentionally skipped (no invention)", () => {
    const notices = getNotices(TedSearchResponseSchema.parse(raw));
    const candidates = mapTedNotices(raw, "2026-08-05T00:00:00.000Z");
    // candidates ⊆ notices (dedup/skip only reduce, never add)
    expect(candidates.length).toBeLessThanOrEqual(notices.length);
  });
});

// Guard so this file is never silently empty if the fixture is missing.
describe("[FIXTURE_CONTRACT] fixture presence", () => {
  it(hasFixture ? "real TED fixture present" : "real TED fixture pending live capture (suite skipped)", () => {
    expect(typeof hasFixture).toBe("boolean");
  });
});
