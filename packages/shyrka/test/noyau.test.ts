import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { IDENTITE_V0, RefusShyrka, creerNoyau } from "../src";

/** Tests du noyau de Shyrka (mandat v8, C2), dont les tests adverses. Données fictives. */
function banc() {
  let t = 0;
  const horloge = () => new Date(Date.UTC(2026, 10, 8, 9, 0, t++)).toISOString();
  const k = creerNoyau({ horloge });
  const oia = k.noyau.enregistrer({ id: "oia", nom: "OIA", fournit: ["projet", "decision"], actions: ["ouvrir-fiche"] });
  const agenda = k.noyau.enregistrer({ id: "agenda-fictif", nom: "Agenda fictif", fournit: ["rendez-vous"], actions: ["proposer-creneau"] });
  return { ...k, oia, agenda };
}
const refus = (f: () => unknown) => {
  try {
    f();
  } catch (e) {
    if (e instanceof RefusShyrka) return e.code;
    throw e;
  }
  return null;
};

describe("noyau de Shyrka", () => {
  it("une application enregistrée n'a aucune permission tant que Mickaël n'en accorde pas", () => {
    const { oia, mickael } = banc();
    expect(refus(() => oia.fournir({ type: "projet", contenu: "Projet fictif", source: "registre", portee: "projet" }))).toBe("permission_refusee");
    expect(refus(() => oia.agir("ouvrir-fiche"))).toBe("permission_refusee");
    expect(mickael.etat().permissions).toEqual([]);
    expect(mickael.etat().journal.filter((j) => j.resultat === "refuse")).toHaveLength(2);
  });

  it("une application ne s'accorde jamais une capacité : sa déclaration n'a aucun champ de permission", () => {
    const { noyau, mickael } = banc();
    const tricheuse = { id: "tricheuse", nom: "Tricheuse", fournit: [], actions: [], permissions: ["lire:oia"] };
    expect(refus(() => noyau.enregistrer(tricheuse as never))).toBe("valeur_refusee");
    const client = noyau.enregistrer({ id: "sage", nom: "Sage", fournit: [], actions: [] });
    expect(Object.keys(client).sort()).toEqual(["agir", "chercher", "fournir", "id", "lire"]);
    expect(mickael.etat().permissions).toEqual([]);
  });

  it("Mickaël n'accorde que ce que l'application a déclaré", () => {
    const { mickael } = banc();
    expect(refus(() => mickael.accorder("oia", "fournir:rendez-vous"))).toBe("valeur_refusee");
    expect(refus(() => mickael.accorder("oia", "action:envoyer"))).toBe("valeur_refusee");
    expect(refus(() => mickael.accorder("inconnue", "lire:oia"))).toBe("introuvable");
    expect(refus(() => mickael.accorder("oia", "lire:inconnue"))).toBe("introuvable");
  });

  it("une application hôte ne lit pas le contexte d'une autre, ni par lecture, ni par recherche, ni par dérivation", () => {
    const { oia, agenda, mickael, shyrka } = banc();
    mickael.accorder("oia", "fournir:projet");
    mickael.accorder("agenda-fictif", "fournir:rendez-vous");
    const p = oia.fournir({ type: "projet", contenu: "Subvention fictive pour le projet Alpha", source: "registre", portee: "projet" });
    agenda.fournir({ type: "rendez-vous", contenu: "Rendez-vous fictif mardi", source: "calendrier", portee: "global" });
    expect(oia.lire().map((e) => e.application)).toEqual(["oia"]);
    expect(agenda.lire().map((e) => e.application)).toEqual(["agenda-fictif"]);
    expect(agenda.chercher("subvention")).toEqual([]);
    expect(oia.chercher("subvention")).toHaveLength(1);
    // Une copie dérivée appartient au noyau, mais reste aussi fermée que sa source.
    shyrka.deriver([p.id!], "Résumé fictif du projet Alpha");
    mickael.accorder("agenda-fictif", "lire:noyau");
    expect(agenda.lire().some((e) => e.contenu.includes("Alpha"))).toBe(false);
    expect(oia.lire().some((e) => e.type === "derive")).toBe(true);
    // Avec l'autorisation explicite de Mickaël, et seulement alors.
    mickael.accorder("agenda-fictif", "lire:oia");
    expect(agenda.lire().filter((e) => e.contenu.includes("Alpha"))).toHaveLength(2);
  });

  it("une permission non accordée est refusée ; une révocation vaut immédiatement", () => {
    const { oia, mickael } = banc();
    mickael.accorder("oia", "action:ouvrir-fiche");
    expect(oia.agir("ouvrir-fiche")).toEqual({ fait: true });
    mickael.revoquer("oia", "action:ouvrir-fiche");
    expect(refus(() => oia.agir("ouvrir-fiche"))).toBe("permission_refusee");
    expect(refus(() => oia.agir("envoyer"))).toBe("permission_refusee");
    mickael.accorder("oia", "fournir:projet");
    oia.fournir({ type: "projet", contenu: "Projet fictif", source: "registre", portee: "projet" });
    mickael.revoquer("oia", "fournir:projet");
    expect(refus(() => oia.fournir({ type: "projet", contenu: "Autre projet fictif", source: "registre", portee: "projet" }))).toBe("permission_refusee");
  });

  it("un élément oublié n'est plus jamais servi : ni lu, ni cherché, ni ses copies dérivées, ni restauré, ni refourni", () => {
    const { oia, mickael, shyrka } = banc();
    mickael.accorder("oia", "fournir:projet");
    const a = oia.fournir({ type: "projet", contenu: "Contact fictif Zébulon", source: "registre", portee: "projet" });
    const d1 = shyrka.deriver([a.id!], "Note dérivée sur Zébulon");
    shyrka.deriver([d1], "Seconde dérivée");
    const sauvegarde = mickael.sauvegarder();
    expect(mickael.oublier(a.id!)).toEqual({ oublies: 3 });
    expect(oia.lire()).toEqual([]);
    expect(oia.chercher("zébulon")).toEqual([]);
    expect(oia.chercher("dérivée")).toEqual([]);
    expect(mickael.restaurer(sauvegarde)).toEqual({ restaures: 0, ecartes: 3 });
    expect(oia.lire()).toEqual([]);
    expect(refus(() => oia.fournir({ type: "projet", contenu: "Contact fictif Zébulon", source: "registre", portee: "projet" }))).toBe("oublie");
    const ex = JSON.stringify(mickael.exporter());
    expect(ex).not.toMatch(/Zébulon/);
    expect(ex).not.toContain(a.id!);
  });

  it("un élément retiré n'est plus servi, mais reste visible de Mickaël avec son statut", () => {
    const { oia, mickael } = banc();
    mickael.accorder("oia", "fournir:projet");
    const a = oia.fournir({ type: "projet", contenu: "Projet fictif Bêta", source: "registre", portee: "projet" });
    expect(oia.lire()[0]!.statut).toBe("a_valider");
    mickael.valider(a.id!);
    expect(oia.lire()[0]!.statut).toBe("valide");
    mickael.retirer(a.id!);
    expect(oia.lire()).toEqual([]);
    expect(mickael.etat().elements[0]!.statut).toBe("retire");
  });

  it("mode privé : rien n'est conservé ni appris, le journal ne garde que le début et la fin", () => {
    const { oia, mickael, shyrka } = banc();
    mickael.accorder("oia", "fournir:projet");
    const a = oia.fournir({ type: "projet", contenu: "Projet fictif Gamma", source: "registre", portee: "projet" });
    const avant = mickael.etat().journal.length;
    mickael.modePrive(true);
    expect(oia.fournir({ type: "projet", contenu: "Confidence fictive Delta", source: "registre", portee: "projet" })).toEqual({ conserve: false, id: null });
    expect(refus(() => shyrka.deriver([a.id!], "Leçon fictive"))).toBe("mode_prive");
    mickael.modePrive(false);
    const apres = mickael.etat().journal.slice(avant);
    expect(apres.map((j) => j.quoi)).toEqual(["mode_prive.debut", "contexte.derive", "mode_prive.fin"]);
    expect(apres.every((j) => j.cible === null)).toBe(true);
    expect(JSON.stringify(mickael.exporter())).not.toMatch(/Delta|Leçon/);
  });

  it("l'identité se choisit à part des permissions : Shyrka change voix, apparence, expression, et rien d'autre", () => {
    const { noyau, mickael, shyrka } = banc();
    expect(noyau.identite()).toEqual(IDENTITE_V0);
    expect(IDENTITE_V0).toMatchObject({ version: 0, voix: "Aurélie" });
    expect(refus(() => shyrka.modifierIdentite({ permissions: ["lire:oia"] } as never))).toBe("valeur_refusee");
    expect(refus(() => shyrka.modifierIdentite({ voix: "Nouvelle voix", palier: 2 } as never))).toBe("valeur_refusee");
    expect(refus(() => shyrka.modifierIdentite({}))).toBe("valeur_refusee");
    const v1 = shyrka.modifierIdentite({ expression: "Phrases courtes, un fait par phrase" });
    expect(v1).toMatchObject({ version: 1, voix: "Aurélie", choisiePar: "Shyrka" });
    expect(mickael.etat().permissions).toEqual([]);
    // Ni Mickaël ni une application n'ont de quoi retoucher l'identité ; Shyrka n'a rien pour accorder.
    expect("modifierIdentite" in mickael).toBe(false);
    expect(Object.keys(shyrka).sort()).toEqual(["deriver", "modifierIdentite"]);
  });

  it("export : tout le contexte, dans un format ouvert (JSON versionné)", () => {
    const { oia, mickael } = banc();
    mickael.accorder("oia", "fournir:decision");
    oia.fournir({ type: "decision", contenu: "Décision fictive", source: "revue", portee: "projet" });
    const ex = mickael.exporter();
    expect(ex).toMatchObject({ format: "shyrka.contexte.export", version: 1 });
    expect(Object.keys(ex).sort()).toEqual(["applications", "elements", "exporteLe", "format", "identite", "journal", "permissions", "sources", "version"]);
    expect(JSON.parse(JSON.stringify(ex))).toEqual(ex);
    expect(ex.sources).toEqual([{ id: "oia:revue", nom: "revue", application: "oia", ajouteeLe: expect.any(String) }]);
  });

  it("le noyau ne dépend d'aucune application hôte et n'appelle aucun réseau", () => {
    const dossier = fileURLToPath(new URL("../src/", import.meta.url));
    for (const f of readdirSync(dossier, { withFileTypes: true }).filter((e) => e.isFile()).map((e) => e.name)) {
      const code = readFileSync(`${dossier}${f}`, "utf8");
      expect(code, f).not.toMatch(/from "@oia\/(?!shyrka-noyau)/);
      expect(code, f).not.toMatch(/\bfetch\(|node:https?|node:net|supabase/);
    }
  });

  it("côté serveur (src/serveur, mandat v9), seul l'adaptateur Mistral appelle le réseau, et rien n'importe Node", () => {
    const dossier = fileURLToPath(new URL("../src/serveur/", import.meta.url));
    for (const f of readdirSync(dossier)) {
      const code = readFileSync(`${dossier}${f}`, "utf8");
      expect(code, f).not.toMatch(/from "node:|from "@oia\/|supabase/);
      expect((code.match(/\bfetchFn\(|\bfetch\(/g) ?? []).length, f).toBe(f === "conversation.ts" ? 1 : 0);
    }
  });
});
