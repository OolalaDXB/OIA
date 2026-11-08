import { describe, expect, it } from "vitest";
import { besoinSchema, validerAnalyse } from "@/lib/money-recherche";

describe("Recherche Money sur le catalogue fictif", () => {
  const analyse = { resume: "Besoin logiciel", correspondances: [{ id: "m1", pertinence: "Forte", raisons: ["Innovation numérique"], manquants: ["Budget"] }], manquants: ["Localisation"] };
  it("accepte une correspondance et ses informations manquantes", () => expect(validerAnalyse(analyse).correspondances[0]?.manquants).toEqual(["Budget"]));
  it("refuse toute opportunité hors démonstration", () => expect(() => validerAnalyse({ ...analyse, correspondances: [{ ...analyse.correspondances[0], id: "reelle" }] })).toThrow());
  it("refuse les doublons", () => expect(() => validerAnalyse({ ...analyse, correspondances: [analyse.correspondances[0], analyse.correspondances[0]] })).toThrow());
  it("autorise l'absence de correspondance", () => expect(validerAnalyse({ ...analyse, correspondances: [] }).correspondances).toEqual([]));
  it("refuse un besoin vide", () => expect(besoinSchema.safeParse({ texte: "  " }).success).toBe(false));
});