import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { IDENTITY_V0, IDENTITE_DE_REPLI, loadIdentity, voiceOutputAllowed } from "../src/identity.js";

const suivi = fileURLToPath(new URL("../identite.json", import.meta.url));

describe("identité de Shyrka (amendement du 7 novembre, § 3)", () => {
  it("la version 0 suivie : présence en points et voix Aurélie, voix en sortie comprise", () => {
    const { identity, warning } = loadIdentity(suivi);
    expect(warning).toBeUndefined();
    expect(identity).toEqual(IDENTITY_V0);
    expect(identity).toMatchObject({ version: 0, presence: "points", voix: "Aurélie", voixEnSortie: true, decidePar: "Mickaël Thomas", date: "2026-11-07" });
    expect(voiceOutputAllowed(identity)).toBe(true);
  });

  it("fichier absent, illisible ou invalide : repli en texte seul, avec avertissement", () => {
    expect(loadIdentity("/nulle/part.json")).toMatchObject({ identity: IDENTITE_DE_REPLI });
    expect(loadIdentity("x", () => "{pas du json").warning).toMatch(/illisible/);
    expect(loadIdentity("x", () => JSON.stringify({ ...IDENTITY_V0, champInconnu: 1 })).warning).toMatch(/invalide/);
    expect(voiceOutputAllowed(IDENTITE_DE_REPLI)).toBe(false);
  });

  it("le cadre consigne la version 0 avec la voix Aurélie", () => {
    const cadre = readFileSync(fileURLToPath(new URL("../../../docs/shyrka/CADRE.md", import.meta.url)), "utf8");
    expect(cadre).toMatch(/Version 0 \(actuelle\), décidée par Mickaël le 7 novembre 2026 :\s+présence en points et voix Aurélie/);
    expect(cadre).toContain("Aurélie");
  });
});
