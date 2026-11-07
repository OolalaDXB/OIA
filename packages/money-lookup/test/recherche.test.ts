import { describe, expect, it } from "vitest";
import type { Modele } from "../../shyrka/src/serveur/conversation.ts";
import { COUT_MAX_RECHERCHE_USD, JETONS_ENTREE_MAX, candidats, rechercher, type Opportunite } from "../src/recherche.ts";

/** Recherche assistée (mandat v9, bloc D) : modèle simulé, opportunités fictives. */
const opp = (id: string, p: Partial<Opportunite> = {}): Opportunite => ({
  id, titre: "Appel fictif", emetteur: "Émetteur fictif", nature: "GRANT", categorie: "subvention", montant: null, devise: null,
  echeance: null, recommandation: "INVESTIGATE", gate_ok: false, projets_decouverte: [], projet_etiquete: null, ...p,
});
const TOUTES = [
  opp("a", { titre: "Subvention hydroélectricité fictive", projets_decouverte: ["sillon"], echeance: "2027-01-10" }),
  opp("b", { titre: "Programme énergie hydraulique fictif", projets_decouverte: ["sillon"] }),
  opp("c", { titre: "Marché public de padel fictif", nature: "TENDER", categorie: "chiffre_affaires_contractuel_potentiel", projets_decouverte: ["padel-design"] }),
  opp("d", { titre: "Hydraulique rejetée fictive", recommandation: "REJECT", projets_decouverte: ["sillon"] }),
  opp("e", { titre: "Programme hydraulique Swift fictif" }),
];
function modele(contenu: string, requetes: Parameters<Modele>[0][] = []): Modele {
  return async (req) => (requetes.push(req), { message: { content: contenu }, usage: { prompt_tokens: 900, completion_tokens: 200 }, model: "mistral-test" });
}

describe("recherche assistée", () => {
  it("candidats par les règles : mots, projet, nature ; rejetées et Swift écartées", () => {
    // À égalité de score, l'échéance la plus proche d'abord.
    expect(candidats("subvention hydraulique pour sillon", TOUTES).map((o) => o.id)).toEqual(["a", "b"]);
    expect(candidats("hydroélectricité", TOUTES, "sillon").map((o) => o.id)).toEqual(["a", "b"]);
    expect(candidats("rien à voir", TOUTES)).toEqual([]);
  });

  it("classe et explique, seulement parmi les candidats : un identifiant inventé est écarté", async () => {
    const requetes: Parameters<Modele>[0][] = [];
    const r = await rechercher("subvention hydraulique pour sillon", TOUTES,
      modele('```json\n{"correspondances":[{"c":"c2","rang":1,"explication":"Hydro.","informations_manquantes":["montant"]},{"c":"c9","rang":2,"explication":"Inventé"},{"c":"c1","rang":3,"explication":"Énergie."}]}\n```', requetes));
    expect(r.correspondances.map((c) => [c.id, c.rang])).toEqual([["b", 1], ["a", 2]]);
    expect(r.correspondances[0]!.informations_manquantes).toEqual(["montant"]);
    expect(r.correspondances[0]!.source).toEqual({ vue: "ml_toutes_v1", id: "b" });
    expect(r.ecartes_inventes).toBe(1);
    expect(r.candidats).toBe(2);
    expect(JSON.stringify(requetes[0]!.messages)).not.toMatch(/swift|rejetée/i);
    expect(r.coutUsd).toBeLessThanOrEqual(COUT_MAX_RECHERCHE_USD);
  });

  it("Swift ou aucun candidat : rien ne part vers le modèle", async () => {
    const requetes: Parameters<Modele>[0][] = [];
    expect((await rechercher("financement Swift", TOUTES, modele("{}", requetes))).local).toBe(true);
    expect((await rechercher("rien à voir", TOUTES, modele("{}", requetes))).local).toBe(true);
    expect(requetes).toHaveLength(0);
  });

  it("plafond d'entrée : les candidats sont réduits jusqu'à tenir sous 2 000 jetons", async () => {
    const requetes: Parameters<Modele>[0][] = [];
    const longues = Array.from({ length: 12 }, (_, i) => opp(`x${i}`, { titre: `Subvention hydraulique fictive ${"détail ".repeat(22)}${i}`, emetteur: "Émetteur fictif ".repeat(5) }));
    // Fiches tronquées (titre 160, émetteur 80) et demande longue (1 000 caractères au plus).
    const r = await rechercher(`subvention hydraulique ${"contexte du projet ".repeat(60)}`, longues, modele('{"correspondances":[]}', requetes));
    expect(r.candidats).toBeLessThan(12);
    expect(Math.ceil(JSON.stringify(requetes[0]!.messages).length / 3)).toBeLessThanOrEqual(JETONS_ENTREE_MAX);
  });

  it("réponse illisible du modèle : aucune correspondance, pas d'erreur", async () => {
    const r = await rechercher("subvention hydraulique", TOUTES, modele("pas du JSON"));
    expect(r.correspondances).toEqual([]);
  });
});
