import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { PHASES, SHYRKA_STEPS } from "../src/lib/oiaOverview";

const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8");

describe("[OIA_INTERFACE] contenu fidèle à la roadmap", () => {
  const roadmap = read("../../../docs/roadmap-oia-shyrka-souffleur.md");

  it("chaque phase affichée a sa section dans la roadmap", () => {
    for (const p of PHASES) expect(roadmap).toMatch(new RegExp(`^## ${p.id} · `, "m"));
  });

  it("P7 et P8 ne sont plus des phases", () => {
    expect(PHASES.map((p) => p.id)).not.toContain("P7");
    expect(roadmap).not.toMatch(/^## P7 · /m);
    expect(roadmap).not.toMatch(/^## P8 · /m);
  });

  it("les quatre étapes Shyrka sont alignées sur P1, P2, P5, P6", () => {
    expect(SHYRKA_STEPS.map((s) => [s.id, s.phase])).toEqual([
      ["S1", "P1"],
      ["S2", "P2"],
      ["S3", "P5"],
      ["S4", "P6"],
    ]);
    for (const s of SHYRKA_STEPS) {
      expect(PHASES.find((p) => p.id === s.phase)?.shyrka).toBe(s.id);
      expect(roadmap).toContain(s.name.fr);
    }
  });
});
