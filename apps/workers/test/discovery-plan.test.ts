import { describe, expect, it } from "vitest";
import { PROJECT_REGISTRY, discoverableProjects, findProject } from "@oia/registry";
import { selectProjects, projectTedQuery } from "../src/discover-ted";
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
    expect(sillon).toContain("92000000"); // cultural
    expect(studio).toContain("79400000"); // consultancy
    expect(sillon).not.toEqual(studio);
    // The recency floor is never lost: every project query carries it.
    for (const p of selectProjects()) expect(projectTedQuery(p, SINCE)).toContain(`publication-date>=${SINCE}`);
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
