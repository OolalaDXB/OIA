import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { RefusMemoire, type Demandeur } from "@oia/shyrka-noyau";
import { ServiceMemoire } from "../src/memoire/commandes.js";
import { MemoireLocale } from "../src/memoire/sqlite.js";
import { dossierVerifie, etatVolume, VOLUME_SHYRKA, type DossierVerifie } from "../src/memoire/volume.js";

/** Vrai quand le test tourne dans le bac à sable de vérification (lecture de ~/.oia refusée) : certains essais réels y sont impossibles et sont alors sautés, pas comptés réussis. */
const dansBacASable = (() => {
  try {
    readdirSync(join(homedir(), ".oia"));
    return false;
  } catch (e) {
    return (e as NodeJS.ErrnoException).code === "EPERM";
  }
})();

const MICKAEL = { type: "mickael" as const, via: "test" };
const MOI: Demandeur = { type: "mickael" };
const PROJETS = [
  { slug: "oia", noms: ["OIA"] },
  { slug: "sillon", noms: ["SILLON", "Sillon"] },
  { slug: "maisons-co", noms: ["Maisons.co", "Maisons"] },
];

let dir: string;
let dossier: DossierVerifie;
// Les tests de logique utilisent un dossier temporaire présenté comme vérifié ;
// la seule voie de production pour obtenir un DossierVerifie est dossierVerifie().
beforeEach(() => {
  dir = realpathSync(mkdtempSync(join(tmpdir(), "shyrka-mem-")));
  dossier = { chemin: join(dir, "memoire"), volume: { point: dir, monte: true, chiffre: true, image: "test", inscriptible: true, detail: "test" } };
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

const ouvrir = () => new MemoireLocale(dossier);
const fictif = (contenu: string, extra: Partial<Parameters<MemoireLocale["enregistrer"]>[0]> = {}) => ({
  compartiment: "personnel" as const,
  forme: "preference" as const,
  contenu,
  source: { voie: "instruction" as const, ref: "conversation test" },
  ...extra,
});

describe("M1 · retenir, fermer, rouvrir", () => {
  it("rend le même id, contenu, voie, source et date depuis le stockage", () => {
    const a = ouvrir();
    const e = a.enregistrer(fictif("Je préfère les outils locaux (fictif)"), MICKAEL);
    a.fermer();
    const b = ouvrir();
    const [r] = b.retrouver({ texte: "outils locaux" }, MOI);
    expect(r?.element).toMatchObject({ id: e.id, contenu: e.contenu, statut: "valide", date: e.date, source: { voie: "instruction", ref: "conversation test" } });
    expect(r?.provenance).toContain("dit par Mickaël");
    b.fermer();
  });
  it("une proposition (voie 2) reste à confirmer ; une IA ne peut pas déclarer une instruction", () => {
    const m = ouvrir();
    expect(m.enregistrer(fictif("Proposition fictive", { source: { voie: "proposition", ref: "entretien 1", affirmeParIA: true } }), { type: "shyrka" }).statut).toBe("a_confirmer");
    expect(() => m.enregistrer(fictif("Fausse instruction"), { type: "shyrka" })).toThrow(/instruction de Mickaël/);
    m.fermer();
  });
});

describe("M2 · corriger", () => {
  it("une seule version actuelle ; l'ancienne n'est plus trouvée ; ses dérivés disparaissent", () => {
    const m = ouvrir();
    const e = m.enregistrer(fictif("Le budget mensuel fictif est de 7 dollars"), MICKAEL);
    const d = m.enregistrer(fictif("Résumé : budget 7", { deriveDe: [e.id], source: { voie: "proposition", ref: "dérivé" } }), { type: "shyrka" });
    const c = m.corriger(e.id, { contenu: "Le budget mensuel fictif est de 5 dollars" }, MICKAEL);
    m.fermer();
    const n = ouvrir();
    expect(c.version).toBe(2);
    expect(n.retrouver({ texte: "7 dollars budget" }, MOI).map((r) => r.element.contenu)).toEqual(["Le budget mensuel fictif est de 5 dollars"]);
    expect(n.retrouver({}, MOI).filter((r) => r.element.id === e.id)).toHaveLength(1);
    expect(n.retrouver({}, MOI).some((r) => r.element.id === d.id)).toBe(false);
    expect(n.historique(e.id).map((v) => v.version)).toEqual([1, 2]);
    expect(() => m.corriger(e.id, { contenu: "x" }, { type: "shyrka" })).toThrow();
    n.fermer();
  });
});

describe("M3 · oublier, puis restaurer une ancienne sauvegarde", () => {
  it("souvenir et dérivés absents, export propre, sauvegarde sans effet, réenregistrement refusé", () => {
    const m = ouvrir();
    const e = m.enregistrer(fictif("Souvenir fictif à oublier : code couleur turquoise"), MICKAEL);
    m.enregistrer(fictif("Dérivé fictif turquoise", { deriveDe: [e.id], source: { voie: "proposition", ref: "d" } }), { type: "shyrka" });
    const sauvegarde = m.exporter(MICKAEL);
    expect(m.oublier(e.id, MICKAEL)).toEqual({ oublies: 2 });
    expect(m.retrouver({ texte: "turquoise" }, MOI)).toEqual([]);
    expect(JSON.stringify(m.exporter(MICKAEL))).not.toContain("turquoise");
    expect(m.restaurer(sauvegarde, MICKAEL)).toEqual({ restaures: 0, ecartes: 2 });
    expect(m.retrouver({ texte: "turquoise" }, MOI)).toEqual([]);
    expect(() => m.enregistrer(fictif("Souvenir fictif à oublier : code couleur turquoise"), MICKAEL)).toThrow(/oublié/);
    expect(m.comptes()).toMatchObject({ elements: 0, index: 0 });
    m.fermer();
    // Le fichier ne contient plus le texte en clair (secure_delete + optimize FTS).
    expect(readFileSync(join(dossier.chemin, "memoire.sqlite")).includes(Buffer.from("turquoise"))).toBe(false);
  });
  it("réapprendre exige une instruction explicite de Mickaël", () => {
    const m = ouvrir();
    const e = m.enregistrer(fictif("Fait fictif réappris"), MICKAEL);
    m.oublier(e.id, MICKAEL);
    expect(() => m.reapprendre("personnel", "Fait fictif réappris", { type: "shyrka" })).toThrow();
    m.reapprendre("personnel", "Fait fictif réappris", MICKAEL);
    expect(m.enregistrer(fictif("Fait fictif réappris"), MICKAEL).id).not.toBe(e.id);
    m.fermer();
  });
});

describe("M4 · mode privé", () => {
  it("rien n'est enregistré ni retrouvé pendant le mode", () => {
    const m = ouvrir();
    const s = new ServiceMemoire(m, { projets: PROJETS });
    s.traiter("Retiens que je préfère le thé (fictif)");
    s.traiter("Active le mode privé");
    expect(s.traiter("Retiens que secret fictif de la session privée")?.texte).toMatch(/Mode privé/);
    expect(s.rappel("thé", { type: "conversation", modele: "local" })).toEqual([]);
    s.traiter("Désactive le mode privé");
    expect(m.comptes().elements).toBe(1);
    m.fermer();
    expect(readFileSync(join(dossier.chemin, "memoire.sqlite")).includes(Buffer.from("session privée"))).toBe(false);
  });
});

describe("M5/M7 · droits appliqués par le code", () => {
  it("local_seulement : jamais au cockpit, à un agent, ni à un modèle en ligne", () => {
    const m = ouvrir();
    m.enregistrer(fictif("Préférence fictive locale sur Sillon", { compartiment: "projet:sillon" }), MICKAEL);
    m.enregistrer(fictif("Décision fictive partagée sur Sillon", { compartiment: "projet:sillon", portee: "cockpit", forme: "decision" }), MICKAEL);
    const q = { texte: "fictive sillon" };
    expect(m.retrouver(q, { type: "conversation", modele: "local" })).toHaveLength(2);
    expect(m.retrouver(q, { type: "conversation", modele: "en_ligne" }).map((r) => r.element.portee)).toEqual(["cockpit"]);
    expect(m.retrouver(q, { type: "cockpit" }).map((r) => r.element.portee)).toEqual(["cockpit"]);
    expect(m.retrouver(q, { type: "agent", id: "a1", compartiments: ["projet:oia"] })).toEqual([]);
    expect(m.retrouver(q, { type: "agent", id: "a1", compartiments: ["projet:sillon"] })).toHaveLength(1);
    m.fermer();
  });
  it("un dérivé d'une source locale ou retirée ne fuit pas", () => {
    const m = ouvrir();
    const local = m.enregistrer(fictif("Source locale fictive kiwi"), MICKAEL);
    const partage = m.enregistrer(fictif("Source partagée fictive kiwi", { portee: "cockpit" }), MICKAEL);
    m.enregistrer(fictif("Synthèse fictive kiwi", { deriveDe: [local.id, partage.id], source: { voie: "proposition", ref: "d" } }), { type: "shyrka" });
    expect(m.retrouver({ texte: "kiwi" }, { type: "cockpit" }).map((r) => r.element.contenu)).toEqual(["Source partagée fictive kiwi"]);
    m.retirer(partage.id, "révoquée", MICKAEL);
    expect(m.retrouver({ texte: "kiwi" }, { type: "cockpit" })).toEqual([]);
    expect(m.retrouver({ texte: "kiwi" }, { type: "conversation", modele: "local" }).map((r) => r.element.contenu)).toEqual(["Source locale fictive kiwi"]);
    m.fermer();
  });
  it("portée cockpit : décision de Mickaël seulement", () => {
    const m = ouvrir();
    expect(() => m.enregistrer(fictif("x fictif", { portee: "cockpit", source: { voie: "proposition", ref: "r" } }), { type: "agent", id: "a" })).toThrow(/Mickaël/);
    m.fermer();
  });
});

describe("Exclusions à l'entrée", () => {
  it("Swift et secrets refusés, sans écrire", () => {
    const m = ouvrir();
    expect(() => m.enregistrer(fictif("Le client Swift fictif veut un devis"), MICKAEL)).toThrow(/Swift/);
    expect(() => m.enregistrer(fictif("api_key = sk-test-ABCDEFGH12345678"), MICKAEL)).toThrow(RefusMemoire);
    expect(m.comptes().elements).toBe(0);
    m.fermer();
  });
});

describe("M6 · stockage absent, non chiffré, lien, base corrompue", () => {
  it("volume absent : refus, aucun dossier créé", () => {
    const p = join(dir, "Absent");
    expect(() => dossierVerifie("memoire", { point: p, sonde: () => ({ monte: true, chiffre: true, image: "x", inscriptible: true }) })).toThrow(/non activée/);
    expect(existsSync(p)).toBe(false);
  });
  it("dossier ordinaire à la place du volume : refus", () => {
    const p = join(dir, "Shyrka-corpus");
    mkdirSync(p);
    expect(etatVolume(p, () => ({ monte: true, chiffre: true, image: "x", inscriptible: true })).detail).toMatch(/dossier ordinaire/);
  });
  it("lien symbolique à la place du volume : refus", () => {
    const p = join(dir, "lien");
    symlinkSync(dir, p);
    expect(etatVolume(p).detail).toMatch(/lien symbolique/);
  });
  it.skipIf(dansBacASable || !existsSync(VOLUME_SHYRKA))("image non chiffrée : refus (sonde ; exige le vrai point de montage)", () => {
    expect(etatVolume(VOLUME_SHYRKA, () => ({ monte: true, chiffre: false, image: "x", inscriptible: true })).chiffre).toBe(false);
  });
  it("base illisible : erreur explicite, jamais recréée vide", () => {
    mkdirSync(dossier.chemin, { recursive: true });
    writeFileSync(join(dossier.chemin, "memoire.sqlite"), "ceci n'est pas une base");
    expect(() => ouvrir()).toThrow(/illisible/);
    expect(readFileSync(join(dossier.chemin, "memoire.sqlite"), "utf8")).toBe("ceci n'est pas une base");
  });
  it("base supprimée après avoir existé : refus (témoin)", () => {
    ouvrir().fermer();
    rmSync(join(dossier.chemin, "memoire.sqlite"));
    expect(() => ouvrir()).toThrow(/témoin/);
  });
  it("lien symbolique à la place de la base : refus", () => {
    mkdirSync(dossier.chemin, { recursive: true });
    symlinkSync(join(dir, "ailleurs.sqlite"), join(dossier.chemin, "memoire.sqlite"));
    expect(() => ouvrir()).toThrow(/Lien symbolique/);
  });
});

describe("Concurrence", () => {
  it("deux connexions : les écritures s'enchaînent sans perte", () => {
    const a = ouvrir();
    const b = ouvrir();
    for (let i = 0; i < 20; i++) (i % 2 ? a : b).enregistrer(fictif(`Élément fictif numéro ${i}`), MICKAEL);
    expect(a.comptes().elements).toBe(20);
    a.fermer();
    b.fermer();
  });
});

describe("Commandes de conversation (A3)", () => {
  it("retenir, lister paginé, décision par projet, corriger, oublier par texte avec désambiguïsation", () => {
    const m = ouvrir();
    const s = new ServiceMemoire(m, { projets: PROJETS });
    const r = s.traiter("Shyrka, retiens que pour SILLON on a décidé de garder Stripe (fictif)")!;
    expect(r.texte).toMatch(/Retenu sur le Mac \[[0-9a-f]{8}\].*projet:sillon, decision/);
    expect(r.sensible).toBe(true);
    for (let i = 0; i < 9; i++) s.traiter(`Retiens que préférence fictive numéro ${i}`);
    expect(s.traiter("De quoi te souviens-tu ?")!.texte).toMatch(/page 1[\s\S]*page suivante/);
    expect(s.traiter("page suivante")!.texte).toMatch(/page 2[\s\S]*Fin de la liste/);
    expect(s.traiter("Qu'avais-je décidé pour Sillon ?")!.texte).toMatch(/garder Stripe/);
    expect(s.traiter("Qu'avais-je décidé pour Maisons ?")!.texte).toMatch(/aucune décision/);
    const ref = /\[([0-9a-f]{8})\]/.exec(r.texte)![1]!;
    expect(s.traiter(`Corrige le souvenir ${ref} : pour SILLON on a décidé de garder Stripe et Paddle (fictif)`)!.texte).toMatch(/version 2/);
    expect(s.traiter("Oublie préférence fictive")!.texte).toMatch(/Plusieurs souvenirs/);
    const o = s.traiter(`Oublie ${ref}`)!;
    expect(o.texte).toMatch(/Oublié : 1/);
    expect(o.oublies?.some((c) => c.includes("Paddle"))).toBe(true);
    expect(s.traiter("Qu'avais-je décidé pour Sillon ?")!.texte).toMatch(/aucune décision/);
    expect(s.traiter("Bonjour")).toBeNull();
    m.fermer();
  });
  it("mémoire indisponible : le dit, n'écrit rien", () => {
    const s = new ServiceMemoire(null, { projets: PROJETS, indisponible: "volume non monté" });
    expect(s.traiter("Retiens que x")!.texte).toMatch(/non activée : volume non monté/);
  });
});
