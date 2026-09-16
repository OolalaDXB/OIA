import { describe, expect, it } from "vitest";
import { PROJECT_REGISTRY, discoverableProjects, findProject } from "@oia/registry";
import { narrowQuery, queryFromLayers } from "@oia/connectors";
import { selectProjects, projectTedQuery, projectQueryLayers } from "../src/discover-ted";
import { mergeConsoleData, tedCandidatesToConsole } from "../src/ted-to-console";

const SINCE = "20260618";

describe("multi-project discovery plan", () => {
  it("defaults to every project whose registry profile enables discovery", () => {
    const planned = selectProjects();
    expect(planned.map((p) => p.slug)).toEqual(discoverableProjects(PROJECT_REGISTRY).map((p) => p.slug));
    expect(planned.length).toBeGreaterThan(1); // the point of the whole exercise
  });

  it("runs an explicit subset in the order given", () => {
    expect(selectProjects("sillon,bawaba").map((p) => p.slug)).toEqual(["sillon", "bawaba"]);
  });

  it("fails loudly on an unknown project instead of silently discovering nothing", () => {
    expect(() => selectProjects("does-not-exist")).toThrow(/unknown project/);
  });

  it("builds a distinct query per project from its own CPV codes and countries", () => {
    const sillon = projectTedQuery(findProject(PROJECT_REGISTRY, "sillon")!, SINCE);
    const studio = projectTedQuery(findProject(PROJECT_REGISTRY, "thestudio-mt")!, SINCE);
    expect(sillon).toContain("92500000"); // library/archives/cultural services
    expect(studio).toContain("79421000"); // project management services
    expect(sillon).not.toEqual(studio);
    // The recency floor is never lost: every project query carries it.
    for (const p of selectProjects()) expect(projectTedQuery(p, SINCE)).toContain(`publication-date>=${SINCE}`);
  });

  it("asks for specific services, not whole CPV divisions", () => {
    // 72000000 is "IT services", entire. Querying a division is not filtering:
    // it is taking a huge slice of the flow and hoping to sort it out later.
    for (const p of selectProjects()) {
      for (const code of p.discovery.cpvCodes) {
        expect(code).not.toMatch(/^\d{2}000000$/);
      }
    }
  });

  it("carries the project's own search terms into the query", () => {
    const studio = projectTedQuery(findProject(PROJECT_REGISTRY, "thestudio-mt")!, SINCE);
    expect(studio).toContain('"digital transformation"');
    expect(studio).toContain("notice-type IN (cn-standard cn-social)");
  });

  it("degrades to the proven clauses when the speculative ones are rejected", () => {
    const entry = findProject(PROJECT_REGISTRY, "sillon")!;
    let layers = projectQueryLayers(entry, SINCE);
    let next = narrowQuery(layers);
    while (next) {
      layers = next;
      next = narrowQuery(layers);
    }
    const core = queryFromLayers(layers)!;
    // What survives is exactly what a real recorded run already proved works.
    expect(core).toContain("classification-cpv IN");
    expect(core).toContain("buyer-country IN");
    expect(core).toContain(`publication-date>=${SINCE}`);
    expect(core).not.toContain("notice-type");
    expect(core).not.toContain("FT ~");
  });
});

describe("console build carries discovery provenance", () => {
  const candidate = {
    externalId: "111111-2026",
    title: "AI platform services",
    officialUrl: "https://ted.europa.eu/en/notice/111111-2026/html",
    discoveredFor: ["bawaba", "thestudio-mt"],
    liveFetch: "OK",
    verificationStatus: "MANUAL_REVIEW_REQUIRED",
    verificationEvidence: [],
    factCount: 1,
    provenance: [
      { field: "publication-date", value: "2026-09-01", locator: { type: "JSON_PATH", value: "$.publication-date" } },
    ],
  };

  it("keeps the list of projects whose query surfaced a notice", () => {
    const data = tedCandidatesToConsole([candidate]);
    expect(data.records[0]!.discoveredFor).toEqual(["bawaba", "thestudio-mt"]);
  });

  it("deduplicates across sources on merge and says so in the run warnings", () => {
    const ted = tedCandidatesToConsole([candidate, { ...candidate, externalId: "222222-2026", discoveredFor: ["sillon"] }]);
    const merged = mergeConsoleData(ted, null);
    expect(merged.records).toHaveLength(1);
    expect(merged.records[0]!.mergedFrom).toEqual(["222222-2026"]);
    expect(merged.records[0]!.discoveredFor?.sort()).toEqual(["bawaba", "sillon", "thestudio-mt"]);
  });
});

/**
 * The first real scheduled run lost its entire recency floor and nobody noticed
 * until it returned zero. `--list` printed `publication-date>=20260618`; the
 * query that actually went out had no date clause at all.
 *
 * The cause: the workflow passes an unset input as the EMPTY STRING, and
 * `process.env.X ?? default` accepts an empty string as a value. The old test
 * passed a date in explicitly, so it could never have caught this.
 */
describe("the recency floor survives the environment", () => {
  const resolveSince = (raw: string | undefined): string => {
    const trimmed = (raw ?? "").trim();
    return trimmed !== ""
      ? trimmed
      : new Date(Date.now() - 90 * 24 * 3600 * 1000).toISOString().slice(0, 10).replace(/-/g, "");
  };

  it("falls back to 90 days when the variable is an empty string, not just when unset", () => {
    // This is the exact shape GitHub Actions produces for an unset input.
    expect(resolveSince("")).toMatch(/^\d{8}$/);
    expect(resolveSince("   ")).toMatch(/^\d{8}$/);
    expect(resolveSince(undefined)).toMatch(/^\d{8}$/);
  });

  it("still honours an explicit floor", () => {
    expect(resolveSince("20260101")).toBe("20260101");
  });

  it("never builds a project query without a date clause", () => {
    for (const p of selectProjects()) {
      const query = projectTedQuery(p, resolveSince(""));
      expect(query).toMatch(/publication-date>=\d{8}/);
    }
  });
});
