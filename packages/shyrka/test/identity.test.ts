import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { IDENTITY_V0, IdentitySchema, loadIdentity, voiceOutputAllowed } from "../src/identity.js";

const committed = fileURLToPath(new URL("../../../infra/shyrka/identite.json", import.meta.url));

describe("identité de Shyrka (CADRE.md)", () => {
  it("le fichier suivi est la version 0, sans voix ni visage (porte P0 : rien d'activé par défaut)", () => {
    const { identity, warning } = loadIdentity(committed);
    expect(warning).toBeUndefined();
    expect(identity).toEqual(IDENTITY_V0);
    expect(voiceOutputAllowed(identity)).toBe(false);
  });

  it("refuse une version 0 qui activerait la voix", () => {
    const r = IdentitySchema.safeParse({ ...IDENTITY_V0, voixEnSortie: true });
    expect(r.success).toBe(false);
  });

  it("fichier absent, illisible ou invalide : retombe sur la version 0", () => {
    expect(loadIdentity("/nulle/part.json").identity).toEqual(IDENTITY_V0);
    expect(loadIdentity("x", () => "{pas du json").warning).toMatch(/illisible/);
    const bad = loadIdentity("x", () => JSON.stringify({ ...IDENTITY_V0, champInconnu: 1 }));
    expect(bad.identity).toEqual(IDENTITY_V0);
    expect(bad.warning).toMatch(/invalide/);
  });

  it("une version 1 décidée par Mickaël peut autoriser la voix", () => {
    const v1 = { ...IDENTITY_V0, version: 1, date: "2026-12-01", voixEnSortie: true };
    const { identity } = loadIdentity("x", () => JSON.stringify(v1));
    expect(voiceOutputAllowed(identity)).toBe(true);
  });

  it("le cadre décrit bien la version 0 et la voix de référence", () => {
    const cadre = readFileSync(fileURLToPath(new URL("../../../docs/shyrka/CADRE.md", import.meta.url)), "utf8");
    expect(cadre).toContain("Version 0 (actuelle)");
    expect(cadre).toContain(IDENTITY_V0.voixDeReference);
  });
});
