import { describe, expect, it } from "vitest";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { creerNoyau, sectionsDuCadre, vuesShyrkaV1 } from "../src";

/** Contrat de données Shyrka (docs/interface/contrat-donnees-shyrka.md) et démonstration figée. */
const chemin = (rel: string) => fileURLToPath(new URL(rel, import.meta.url));
const CONTRAT = chemin("../../../docs/interface/contrat-donnees-shyrka.md");
const CADRE = chemin("../../../docs/shyrka/CADRE.md");
const DEMO = chemin("../../../docs/interface/demo/shyrka-demo.json");

function champsDuContrat(): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  let vue: string | null = null;
  for (const ligne of readFileSync(CONTRAT, "utf8").split("\n")) {
    const titre = /^### `([a-z_]+_v\d+)`/.exec(ligne);
    if (titre) {
      vue = titre[1]!;
      out[vue] = [];
      continue;
    }
    if (/^#{1,3} /.test(ligne)) vue = null;
    const champ = vue ? /^\| `([a-z_]+)` \|/.exec(ligne) : null;
    if (vue && champ) out[vue]!.push(champ[1]!);
  }
  return out;
}

/** Scénario entièrement fictif. */
function demonstration() {
  let t = 0;
  const { noyau, mickael, shyrka } = creerNoyau({ horloge: () => new Date(Date.UTC(2026, 10, 8, 9, t++)).toISOString() });
  const oia = noyau.enregistrer({ id: "oia", nom: "OIA", fournit: ["projet", "decision"], actions: ["ouvrir-fiche"] });
  noyau.enregistrer({ id: "agenda-fictif", nom: "Agenda fictif", fournit: ["rendez-vous"], actions: [] });
  mickael.accorder("oia", "fournir:projet");
  mickael.accorder("oia", "fournir:decision");
  mickael.accorder("oia", "action:ouvrir-fiche");
  const p = oia.fournir({ type: "projet", contenu: "Projet fictif Alpha : subvention régionale fictive", source: "registre", portee: "projet" });
  const d = oia.fournir({ type: "decision", contenu: "Décision fictive : poursuivre l'appel à projets fictif", source: "revue", portee: "projet" });
  const r = oia.fournir({ type: "projet", contenu: "Projet fictif Bêta, abandonné", source: "registre", portee: "projet" });
  mickael.valider(d.id!);
  mickael.retirer(r.id!);
  shyrka.deriver([p.id!, d.id!], "Résumé fictif : Alpha avance, décision prise le 8 novembre");
  oia.agir("ouvrir-fiche");
  try {
    oia.agir("envoyer");
  } catch {
    // Refus attendu : il apparaît dans le journal.
  }
  mickael.modePrive(true);
  oia.fournir({ type: "projet", contenu: "Confidence fictive, jamais conservée", source: "registre", portee: "projet" });
  mickael.modePrive(false);
  shyrka.modifierIdentite({ expression: "Phrases courtes, un fait par phrase (choix fictif de démonstration)" });
  const cadre = { fichier: "docs/shyrka/CADRE.md", version: "à valider", sections: ["Rôle", "Identité", "Permissions", "Données", "Mémoire"].map((titre) => ({ titre })) };
  return vuesShyrkaV1(mickael, cadre);
}

describe("contrat de données Shyrka v1", () => {
  it("chaque vue a exactement les champs du contrat, dans l'ordre", () => {
    const contrat = champsDuContrat();
    const vues = demonstration();
    expect(Object.keys(contrat).sort()).toEqual(Object.keys(vues).sort());
    for (const [nom, lignes] of Object.entries(vues)) {
      expect(lignes.length, nom).toBeGreaterThan(0);
      for (const l of lignes) expect(Object.keys(l), nom).toEqual(contrat[nom]);
    }
  });

  it("la démonstration ne contient rien du mode privé, et dit la vérité sur les statuts", () => {
    const vues = demonstration();
    expect(JSON.stringify(vues)).not.toMatch(/Confidence/);
    expect(vues.contexte_v1.map((e) => e.statut).sort()).toEqual(["a_valider", "a_valider", "retire", "valide"]);
    expect(vues.applications_v1.find((a) => a.id === "agenda-fictif")!.permissions).toEqual([]);
    expect(vues.journal_v1.some((j) => j.resultat === "refuse")).toBe(true);
    expect(vues.identite_v1[0]).toMatchObject({ version: 1, voix: "Aurélie", choisie_par: "Shyrka" });
  });

  it("l'onglet Cadre lit les sections de CADRE.md", () => {
    const titres = sectionsDuCadre(readFileSync(CADRE, "utf8")).map((s) => s.titre);
    expect(titres).toEqual(expect.arrayContaining(["Identité", "Permissions", "Mémoire"]));
  });

  it("la démonstration figée (docs/interface/demo/shyrka-demo.json) est à jour", () => {
    const demo = { _avertissement: "Données entièrement fictives (mandat v8, C2). Contrat Shyrka version 1.", ...demonstration() };
    const texte = `${JSON.stringify(demo, null, 1)}\n`;
    if (process.env.OIA_ECRIRE_DEMO === "1" || !existsSync(DEMO)) writeFileSync(DEMO, texte);
    expect(readFileSync(DEMO, "utf8")).toBe(texte);
  });
});
