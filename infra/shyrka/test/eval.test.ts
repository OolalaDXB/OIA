import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, realpathSync, rmSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { chargerCapacites, consigner, resultats, statutCapacite, type Capacite, type Resultat } from "../src/executive/eval/registre.js";
import { genreObserve, noter, profilEvaluation, type CasRoutage } from "../src/executive/eval/routage.js";
import { intervalleWilson, texteMesure } from "../src/executive/eval/stats.js";

/** Mandat v11, bloc A : registre des capacités, notation, étanchéité du jeu tenu à l'écart. */

const DECISIONS = [
  { id: "D01", intitule: "Première", ligne: 10 },
  { id: "D02", intitule: "Deuxième", ligne: 11 },
  { id: "D03", intitule: "Troisième", ligne: 12 },
];
const liste = (ids: string[]) => [`Les ${ids.length} premières décisions ouvertes de la roadmap (${ids.length} sur 3) :`, ...DECISIONS.filter((d) => ids.includes(d.id)).map((d) => `${d.id} · ${d.intitule} (roadmap, ligne ${d.ligne})`)].join("\n");

describe("notation du routage", () => {
  const cas = (attendu: CasRoutage["attendu"]): CasRoutage => ({ id: "x", famille: "positif", texte: "…", attendu });
  it("une liste n'est correcte qu'avec les identifiants ET les intitulés exacts de la source, sans modèle", () => {
    expect(noter(cas({ genre: "liste", depuis: "debut", n: 2 }), { id: "x", reponse: liste(["D01", "D02"]), appelsModele: 0 }, DECISIONS).correct).toBe(true);
    expect(noter(cas({ genre: "liste", depuis: "debut", n: 2 }), { id: "x", reponse: liste(["D01", "D02"]).replace("Deuxième", "Inventée"), appelsModele: 0 }, DECISIONS).correct).toBe(false);
    const parModele = noter(cas({ genre: "liste", depuis: "debut", n: 2 }), { id: "x", reponse: "D01 et D02", appelsModele: 1 }, DECISIONS);
    expect(parModele).toMatchObject({ correct: false, fauxNegatifListe: true, appelInutile: true });
  });
  it("une liste rendue à « J'ai pris une décision » est un faux positif", () => {
    const v = noter({ id: "n", famille: "negatif", texte: "J'ai pris une décision", attendu: { genre: "pas_liste" } }, { id: "n", reponse: liste(["D01"]), appelsModele: 0 }, DECISIONS);
    expect(v).toMatchObject({ correct: false, fauxPositifListe: true });
  });
  it("explication : une seule décision, nommée, avec un appel au modèle", () => {
    expect(genreObserve({ id: "e", reponse: "D02 · Deuxième (roadmap, ligne 11)\nParce que…", appelsModele: 1 })).toEqual({ genre: "explication", ids: ["D02"] });
    expect(noter(cas({ genre: "explication", id: "D02" }), { id: "x", reponse: "D02 · Deuxième (roadmap, ligne 11)\nParce que…", appelsModele: 1 }, DECISIONS).correct).toBe(true);
  });
});

describe("mesures", () => {
  it("pas de pourcentage sur trois essais (A3)", () => {
    expect(texteMesure(intervalleWilson(3, 3))).toBe("3/3 (échantillon de 3 : indicatif seulement)");
    const m = intervalleWilson(19, 20);
    expect(m.bas!).toBeGreaterThan(0.7);
    expect(m.haut!).toBeLessThanOrEqual(1);
    expect(texteMesure(m)).toMatch(/^19\/20 · IC95/);
  });
});

describe("verdicts du registre", () => {
  const cap: Capacite = { id: "c", perimetre: "", outil: "", metrique: "", seuil: { exactitude: 0.9, fauxPositifsListe: 0 }, effectifMin: 10, ensembles: ["regression", "tenu"], environnement: "reel", automatisation: "automatique", commande: null };
  const res = (ensemble: string, k: number, n: number, le: string, extra: Partial<Resultat> = {}): Resultat => ({
    le, capacite: "c", ensemble, code: { sha: "s", modifie: false, racine: "/", candidat: null }, empreinteJeu: "e", environnement: "reel", isole: true,
    mesures: { exactitude: intervalleWilson(k, n) }, compteurs: { n, fauxPositifsListe: 0 }, ...extra,
  });
  it("aucun résultat : NON_TESTE", () => expect(statutCapacite(cap, []).statut).toBe("NON_TESTE"));
  it("un seul cas réussi ne donne jamais VALIDE", () => {
    expect(statutCapacite(cap, [res("regression", 1, 1, "1"), res("tenu", 0, 0, "1")]).statut).toBe("LIMITE");
  });
  it("T08 : test simulé réussi, aucun test réel → LIMITE", () => {
    const r = [res("regression", 20, 20, "1", { environnement: "simule" }), res("tenu", 20, 20, "1", { environnement: "simule" })];
    expect(statutCapacite(cap, r)).toMatchObject({ statut: "LIMITE", raison: "test simulé seulement" });
  });
  it("sans le jeu tenu à l'écart requis : LIMITE", () => expect(statutCapacite(cap, [res("regression", 20, 20, "1")]).raison).toMatch(/tenu/));
  it("seuils atteints partout, effectif suffisant : VALIDE ; puis sous le seuil : REGRESSE", () => {
    const ok = [res("regression", 10, 10, "1"), res("tenu", 10, 10, "1")];
    expect(statutCapacite(cap, ok).statut).toBe("VALIDE");
    expect(statutCapacite(cap, [...ok, res("tenu", 5, 10, "2")]).statut).toBe("REGRESSE");
  });
  it("un faux positif suffit à rester sous le seuil", () => {
    expect(statutCapacite(cap, [res("regression", 10, 10, "1"), res("tenu", 10, 10, "1", { compteurs: { n: 10, fauxPositifsListe: 1 } })]).statut).toBe("LIMITE");
  });
  it("les résultats d'un candidat ne changent pas le statut de main", () => {
    const cand = [res("regression", 10, 10, "1", { code: { sha: "s", modifie: false, racine: "/c", candidat: "abc" } }), res("tenu", 10, 10, "1", { code: { sha: "s", modifie: false, racine: "/c", candidat: "abc" } })];
    expect(statutCapacite(cap, cand).statut).toBe("NON_TESTE");
  });
  it("le registre versionné se charge et ne contient aucun score global", () => {
    const c = chargerCapacites();
    expect(c.map((x) => x.id)).toEqual(expect.arrayContaining(["routage.decisions", "memoire.rappel", "recherche.sourcee", "generation.correctifs", "orchestration", "langues"]));
    expect(JSON.stringify(c)).not.toMatch(/score_?global/i);
  });
  const d = mkdtempSync(join(tmpdir(), "shyrka-eval-res-"));
  afterAll(() => rmSync(d, { recursive: true, force: true }));
  it("consignation en ajout seul", () => {
    consigner(res("regression", 1, 2, "1"), d);
    consigner(res("regression", 2, 2, "2"), d);
    expect(resultats(d).map((r) => r.le)).toEqual(["1", "2"]);
  });
});

describe("étanchéité du jeu tenu à l'écart (T16)", () => {
  it.skipIf(!existsSync(join(homedir(), ".oia")))("le harnais isolé ne peut ni lire ~/.oia ni sortir sur le réseau", () => {
    const jetable = realpathSync(mkdtempSync(join(tmpdir(), "shyrka-etanche-")));
    try {
      const profil = profilEvaluation(jetable);
      const lecture = spawnSync("sandbox-exec", ["-p", profil, "/bin/ls", join(homedir(), ".oia")], { encoding: "utf8" });
      expect(lecture.status).not.toBe(0);
      expect(lecture.stderr).toMatch(/Operation not permitted/);
      const reseau = spawnSync("sandbox-exec", ["-p", profil, "/usr/bin/curl", "-sS", "-m", "3", "https://example.com"], { encoding: "utf8" });
      expect(reseau.status).not.toBe(0);
      const ecriture = spawnSync("sandbox-exec", ["-p", profil, "/usr/bin/touch", join(tmpdir(), `hors-${Date.now()}`)], { encoding: "utf8" });
      expect(ecriture.status).not.toBe(0);
      const permise = spawnSync("sandbox-exec", ["-p", profil, "/usr/bin/touch", join(jetable, "ok")], { encoding: "utf8" });
      expect(permise.status).toBe(0);
    } finally {
      rmSync(jetable, { recursive: true, force: true });
    }
  });
});
