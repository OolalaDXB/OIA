import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { genererCss, modules, etats, couleurs, shyrka } from "../src/index.js";

describe("jetons de design", () => {
  it("tokens.css est à jour avec tokens.ts", () => {
    const css = readFileSync(fileURLToPath(new URL("../tokens.css", import.meta.url)), "utf8");
    expect(css).toBe(genererCss());
  });

  it("chaque module de la navigation proposée a sa couleur", () => {
    for (const m of ["visibility", "opportunites", "crm", "portefeuille", "data", "training", "personnel"]) {
      expect(modules).toHaveProperty(m);
    }
  });

  it("toutes les couleurs sont en oklch", () => {
    for (const v of [...Object.values(couleurs), ...Object.values(etats), ...Object.values(modules), ...Object.values(shyrka)]) {
      expect(v).toMatch(/^oklch\(/);
    }
  });

  it("les points d'état restent désaturés (chroma au plus 0,1)", () => {
    for (const v of Object.values(etats)) {
      const chroma = Number(/^oklch\(\S+ (\S+)/.exec(v)?.[1]);
      expect(chroma).toBeLessThanOrEqual(0.1);
    }
  });

  it("les couleurs de module restent sourdes (chroma au plus 0,08)", () => {
    for (const v of Object.values(modules)) {
      const chroma = Number(/^oklch\(\S+ (\S+)/.exec(v)?.[1]);
      expect(chroma).toBeLessThanOrEqual(0.08);
    }
  });
});
