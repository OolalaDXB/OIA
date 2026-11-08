import { describe, expect, it } from "vitest";
import { lireDemoVisibility } from "@/lib/donnees/visibility";
import {
  ajoutsVisibilityVides,
  avecReglagesVisibility,
  CLE_REGLAGES_VISIBILITY,
  contientNormalise,
  lireReglagesVisibility,
  normaliserSite,
  sauverReglagesVisibility,
  type AjoutsVisibility,
} from "@/lib/visibility-reglages";

function memoire() {
  const valeurs = new Map<string, string>();
  return {
    getItem: (cle: string) => valeurs.get(cle) ?? null,
    setItem: (cle: string, valeur: string) => { valeurs.set(cle, valeur); },
    removeItem: (cle: string) => { valeurs.delete(cle); },
  };
}

const ajouts: AjoutsVisibility = {
  sites: ["atelier-exemple.fr"],
  alias: ["Atelier Exemple Vannes"],
  profils: [{ reseau: "Instagram", handle: "@atelier.exemple" }],
  concurrents: [{ nom: "Atelier Local", categorie: "Atelier indépendant" }],
  questions: [{ id: "q-local-test", q: "Quel atelier choisir à Vannes ?", famille: "Découverte locale", langue: "fr", marque: false }],
};

describe("Réglages locaux Visibility", () => {
  it("conserve tous les ajouts dans le navigateur", () => {
    const stockage = memoire();
    expect(sauverReglagesVisibility(stockage, ajouts)).toBe(true);
    expect(lireReglagesVisibility(stockage)).toEqual(ajouts);
  });

  it("ignore une sauvegarde corrompue ou d’une autre version", () => {
    const stockage = memoire();
    stockage.setItem(CLE_REGLAGES_VISIBILITY, JSON.stringify({ version: 2, ajouts }));
    expect(lireReglagesVisibility(stockage)).toBeNull();
  });

  it("signale une sauvegarde refusée par le navigateur", () => {
    expect(sauverReglagesVisibility({ setItem: () => { throw new Error("quota"); }, removeItem: () => {} }, ajouts)).toBe(false);
  });

  it("efface la clé lorsque tous les ajouts locaux sont retirés", () => {
    const stockage = memoire();
    sauverReglagesVisibility(stockage, ajouts);
    sauverReglagesVisibility(stockage, ajoutsVisibilityVides());
    expect(stockage.getItem(CLE_REGLAGES_VISIBILITY)).toBeNull();
  });

  it("normalise les domaines et détecte les doublons sans tenir compte de la casse", () => {
    expect(normaliserSite("https://Exemple.fr/cours")).toBe("exemple.fr");
    expect(normaliserSite("pas un domaine")).toBeNull();
    expect(contientNormalise(["Studio Ardoise"], " studio ardoise ")).toBe(true);
  });

  it("intègre les ajouts sans inventer de mesure ni changer les coûts", () => {
    const base = lireDemoVisibility();
    const resultat = avecReglagesVisibility(base, ajouts);
    expect(resultat.marque.sites).toContain("atelier-exemple.fr");
    expect(resultat.concurrents.at(-1)).toEqual(ajouts.concurrents[0]);
    expect(resultat.questions.at(-1)).toEqual(ajouts.questions[0]);
    expect(resultat.etatCollecte.questions).toBe(base.questions.length + 1);
    expect(resultat.presenceQuestion["q-local-test"]).toBeUndefined();
    expect(resultat.depensesMoteurs).toEqual(base.depensesMoteurs);
    expect(resultat.moteurs).toEqual(base.moteurs);
  });
});
