import { describe, expect, it } from "vitest";
import { formatMontant, sousTotaux, opportunites } from "@/data/money";
import { permissionsInitiales } from "@/data/shyrka-contexte";
import { apprendreSi, etatInitial } from "@/lib/shyrka-contexte";
import { texteChiffre } from "@/components/oia/mesure";
import { assistants, fenetres } from "@/data/visibility";

describe("Money Lookup", () => {
  it("affiche un montant inconnu comme « inconnu », jamais zéro", () => expect(formatMontant(null, "EUR")).toBe("inconnu"));
  it("ne mélange jamais types ni devises dans un total", () => {
    const t = sousTotaux([{ montant: 100, devise: "EUR", typeMontant: "Subvention" }, { montant: 50, devise: "EUR", typeMontant: "Prêt" }, { montant: 10, devise: "USD", typeMontant: "Subvention" }]);
    expect(t).toHaveLength(3);
  });
  it("compte les montants inconnus à part", () => expect(sousTotaux([{ montant: null, devise: "EUR", typeMontant: "Aide fiscale" }])[0]).toMatchObject({ total: 0, inconnus: 1 }));
  it("signale au moins une opportunité non vérifiée", () => expect(opportunites.some((o) => o.verification === "Non vérifié")).toBe(true));
});

describe("Permissions et mode privé de Shyrka", () => {
  it("ferme toutes les permissions par défaut", () => expect(new Set(Object.values(permissionsInitiales()))).toEqual(new Set(["Aucun"])));
  it("n'apprend rien en mode privé", () => { const e = etatInitial(); expect(apprendreSi(e, true, { categorie: "Décisions", texte: "x", source: "Conversation" }, "7 nov.").elements).toHaveLength(e.elements.length); });
  it("propose ce qu'elle apprend à valider hors mode privé", () => expect(apprendreSi(etatInitial(), false, { categorie: "Décisions", texte: "x", source: "Conversation" }, "7 nov.").elements[0]?.statut).toBe("À valider"));
});

describe("Affichage des chiffres Visibility", () => {
  const enCours = fenetres.find((f) => f.enCours)!; const fini = fenetres.find((f) => !f.enCours)!;
  it("identifie chaque version d'assistant inventée comme un exemple fictif", () => expect(assistants.every((a) => a.version.includes("exemple fictif"))).toBe(true));
  it("affiche la mesure en cours au lieu d'un chiffre", () => expect(texteChiffre({ v: 15, min: 6, max: 24 }, enCours).principal).toBe("Mesure en cours, jour 2 sur 5"));
  it("affiche « non mesurable », jamais zéro", () => expect(texteChiffre({ v: null, min: 0, max: 0 }, fini).principal).toBe("non mesurable"));
  it("donne l'intervalle sous un chiffre définitif", () => expect(texteChiffre({ v: 12, min: 8, max: 16 }, fini).intervalle).toBe("8 à 16 %"));
});
