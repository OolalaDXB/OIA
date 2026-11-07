// Test du prototype Lovable « OIA Dashoard » (commit c6470e86), repris tel quel.
import { describe, expect, it } from "vitest";
import { modules, depenses, presenceInitiale, etatPresence } from "@/data/demo";
describe("Règles des modules OIA", () => {
  // Adapté au mandat v7 (F2) : la navigation vient de src/oia/config/navigation.ts.
  it("conserve l’ordre demandé", () => expect(modules.map((m) => m.nom)).toEqual(["Visibility", "Opportunités", "CRM", "Portefeuille", "Data", "Training"]));
  it("place Visibility en priorité", () => expect(modules[0]!.etat).toBe("Priorité"));
  it("garde Opportunités (ex-Funding) en pause", () => expect(modules[1]!.etat).toBe("En pause"));
  it("garde CRM et Portefeuille sur les pages en place", () => expect(modules.slice(2,4).map((m) => m.etat)).toEqual(["Page en place", "Page en place"]));
  it("garde Data et Training à cadrer", () => expect(modules.slice(4).map((m) => m.etat)).toEqual(["À cadrer", "À cadrer"]));
  it("conserve le plafond Visibility de 30 dollars", () => expect(depenses.plafond).toBe(30));
});
describe("Présence simulée", () => {
  it("démarre micro coupé", () => expect(presenceInitiale.microActif).toBe(false));
  it("écoute avec le micro actif", () => expect(etatPresence(true,false,false)).toBe("Écoute"));
  it("la pause prévaut sur écoute et parole", () => expect(etatPresence(true,true,true)).toBe("En pause"));
  it("reflète la parole simulée", () => expect(etatPresence(false,false,true)).toBe("Shyrka parle"));
});
