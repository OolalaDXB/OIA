// Test du prototype Lovable « OIA Dashoard » (commit c6470e86), repris tel quel.
import { describe, expect, it } from "vitest";
import { commandesShyrka, modulesPersonnels, simulerShyrka } from "@/data/demo";

describe("Shyrka : démonstration uniquement", () => {
  it("garde toutes les commandes rapides simulées", () => {
    for (const commande of commandesShyrka) expect(simulerShyrka(commande).simulee).toBe(true);
  });
  it("consigne automatiquement une mission et sa décision sans l’exécuter", () => {
    const reponse = simulerShyrka("Confier une mission à SEO Command");
    expect(reponse.actions).toEqual(["Préparer la mission SEO Command : rendre les prix lisibles"]);
    expect(reponse.decisions).toEqual(["Garder la mission en attente de validation"]);
  });
  it("consigne une décision explicite", () => {
    expect(simulerShyrka("Je décide de prioriser les prix").decisions).toEqual(["Je décide de prioriser les prix"]);
  });
  it("prévoit les trois modules personnels demandés", () => {
    expect(modulesPersonnels.map((m) => m.slug)).toEqual(["agenda", "sante", "famille"]);
  });
});