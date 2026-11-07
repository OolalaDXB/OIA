import { describe, it, expect } from "vitest";
import { mkdtempSync, mkdirSync, symlinkSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { RACINE_DEPOT, assertModeleLocal, estDans, refuserDansLeDepot } from "../src/local.js";

describe("rien de personnel dans le dépôt (amendement, § 4)", () => {
  it("refuse un chemin dans le dépôt, même inexistant", () => {
    expect(() => refuserDansLeDepot(join(RACINE_DEPOT, "infra/shyrka/sortie/x.wav"))).toThrow(/dans le dépôt/);
    expect(() => refuserDansLeDepot(RACINE_DEPOT)).toThrow(/dans le dépôt/);
  });

  it("refuse un lien symbolique hors du dépôt qui pointe dans le dépôt", () => {
    const t = mkdtempSync(join(tmpdir(), "shyrka-lien-"));
    try {
      symlinkSync(join(RACINE_DEPOT, "infra"), join(t, "piege"));
      expect(() => refuserDansLeDepot(join(t, "piege", "shyrka", "fiche.md"))).toThrow(/dans le dépôt/);
      expect(estDans(join(t, "piege"), RACINE_DEPOT)).toBe(true);
    } finally {
      rmSync(t, { recursive: true, force: true });
    }
  });

  it("accepte un vrai chemin hors du dépôt", () => {
    const t = mkdtempSync(join(tmpdir(), "shyrka-ok-"));
    try {
      mkdirSync(join(t, "a"));
      expect(refuserDansLeDepot(join(t, "a", "b", "c.txt"))).toMatch(/\/a\/b\/c\.txt$/);
    } finally {
      rmSync(t, { recursive: true, force: true });
    }
  });

  it("refuse un chemin qui remonte dans le dépôt par ..", () => {
    expect(() => refuserDansLeDepot(join(tmpdir(), "..", RACINE_DEPOT, "x"))).toThrow(/dans le dépôt/);
  });

  it("n'accepte que des modèles locaux", () => {
    expect(() => assertModeleLocal({ name: "openai:gpt", chat: async () => "" })).toThrow(/locaux/);
    expect(() => assertModeleLocal({ name: "ollama:qwen3:8b", chat: async () => "" })).not.toThrow();
  });
});
