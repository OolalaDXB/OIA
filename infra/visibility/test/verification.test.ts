import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { applicableChecks, checksForFamily, checksForTool, flatChecks, loadFamilies } from "../src/verification";
import { resolveCheckIds } from "../src/seo-command/executor";
import type { Mission } from "../src/seo-command/mission";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const EXPECTED_FAMILIES = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L", "M"];

function fakeMission(partial: Partial<Mission> = {}): Mission {
  return {
    id: partial.id ?? "msn-test-01",
    type: partial.type ?? "audit-technique",
    clientId: partial.clientId ?? "cli-test",
    subjectId: partial.subjectId ?? "sub-test",
    trigger: partial.trigger ?? "manual",
    agents: partial.agents ?? ["technique"],
    reservedBudgetUsd: partial.reservedBudgetUsd ?? 0,
    actualCostUsd: partial.actualCostUsd ?? 0,
    state: partial.state ?? "planned",
    createdAt: partial.createdAt ?? "2026-11-07",
    updatedAt: partial.updatedAt ?? "2026-11-07",
    results: partial.results ?? { recommendationIds: [], evidenceIds: [] },
    checkIds: partial.checkIds ?? [],
  } as Mission;
}

describe("modèle de vérification (données)", () => {
  it("couvre les treize familles A à M", () => {
    const fams = loadFamilies();
    expect(fams.map((f) => f.family)).toEqual(EXPECTED_FAMILIES);
  });

  it("tous les IDs sont uniques et conformes", () => {
    const ids = flatChecks().map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^[A-M]\d{2}$/);
  });

  it("chaque contrôle auto ou mixte nomme un outil non manuel", () => {
    for (const c of flatChecks()) {
      if (c.mode === "auto" || c.mode === "mixte") expect(c.tool).not.toBe("manual");
    }
  });

  it("toutes les lettres citées dans le document d'origine (modele-verification-compte.md) sont reprises", () => {
    const md = readFileSync(join(root, "agents/modele-verification-compte.md"), "utf8");
    for (const fam of EXPECTED_FAMILIES) {
      expect(md).toMatch(new RegExp(`##\\s+${fam}\\s`));
    }
  });

  it("chaque ID du document d'origine existe dans le YAML", () => {
    const md = readFileSync(join(root, "agents/modele-verification-compte.md"), "utf8");
    const mdIds = Array.from(new Set(md.match(/\|\s([A-M]\d{2})\s\|/g)?.map((m) => m.slice(2, 5)) ?? []));
    expect(mdIds.length).toBeGreaterThan(50);
    const dataIds = new Set(flatChecks().map((c) => c.id));
    for (const id of mdIds) expect(dataIds.has(id), `${id} absent du YAML`).toBe(true);
  });

  it("A09 (accord client) n'est applicable qu'à une relation externe", () => {
    const internal = applicableChecks({ ownership: "internal", languages: ["en"] });
    const external = applicableChecks({ ownership: "external", languages: ["en"] });
    expect(internal.find((c) => c.id === "A09")).toBeUndefined();
    expect(external.find((c) => c.id === "A09")).toBeDefined();
  });

  it("B10 (hreflang) n'est applicable qu'à un sujet multilingue", () => {
    const mono = applicableChecks({ ownership: "internal", languages: ["fr"] });
    const multi = applicableChecks({ ownership: "internal", languages: ["fr", "en"] });
    expect(mono.find((c) => c.id === "B10")).toBeUndefined();
    expect(multi.find((c) => c.id === "B10")).toBeDefined();
  });

  it("checksForFamily rend toutes les entrées d'une famille", () => {
    const b = checksForFamily("B");
    expect(b.length).toBeGreaterThanOrEqual(10);
    expect(b.every((c) => c.id.startsWith("B"))).toBe(true);
  });

  it("checksForTool filtre par outil", () => {
    const crawlie = checksForTool("crawlie");
    expect(crawlie.length).toBeGreaterThan(5);
    expect(crawlie.every((c) => c.tool === "crawlie")).toBe(true);
  });
});

describe("SEO Command · resolveCheckIds", () => {
  it("vide = toute la couverture de l'outil", () => {
    const ids = resolveCheckIds(fakeMission({ checkIds: [] }), "crawlie");
    expect(new Set(ids)).toEqual(new Set(checksForTool("crawlie").map((c) => c.id)));
  });

  it("filtre les IDs demandés à l'intersection avec l'outil", () => {
    const ids = resolveCheckIds(fakeMission({ checkIds: ["B02", "B07"] }), "crawlie");
    expect(ids.sort()).toEqual(["B02", "B07"]);
  });

  it("refuse une mission qui demande un contrôle hors couverture de l'outil", () => {
    expect(() =>
      resolveCheckIds(fakeMission({ checkIds: ["A01", "B02"] }), "crawlie"),
    ).toThrow(/A01/);
  });
});
