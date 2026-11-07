import { mkdtempSync, realpathSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { CarnetExperiences, type NouvelleExperience } from "../src/executive/experiences.js";
import type { DossierVerifie } from "../src/memoire/volume.js";

/** Mandat v11, bloc B : carnet d'expériences gouverné (B1, B3, B5 ; T09, T10). */

let dir: string;
let n = 0;
const horloge = () => new Date(Date.UTC(2026, 10, 9) + ++n * 1000).toISOString();
beforeEach(() => (dir = realpathSync(mkdtempSync(join(tmpdir(), "shyrka-exp-")))));
afterEach(() => rmSync(dir, { recursive: true, force: true }));
// Le volume chiffré est vérifié par dossierVerifie en production ; ici un dossier de test tient lieu de DossierVerifie.
const carnet = () => new CarnetExperiences({ chemin: join(dir, "apprentissage"), volume: { point: dir, monte: true, chiffre: true, image: "test", inscriptible: true, detail: "test" } } as DossierVerifie, horloge);

const E: NouvelleExperience = {
  capacite: "routage.decisions", nature: "methode", question: "Faut-il des cas négatifs pour toute règle de routage élargie ?", hypothese: "une règle élargie sans cas négatifs crée des faux positifs",
  source: "mission eaffddbc", preuves: ["revue v10 A_CORRIGER"], cause: "« une » lu comme 1", versions: {}, methodes: [], budget: "0", metriquesInitiales: {}, metriquesFinales: {}, jeux: {},
  objections: [], verdict: "toute règle de routage élargie exige des cas négatifs", verification: "non_faite", domaine: "routage par règles", contreExemples: [], dependances: ["memoire:a92c60b5", "mission:eaffddbc"],
  politiqueOubli: "invalidée si la source est oubliée", retourArriere: "REJETE", affirmeParIA: true,
};

describe("carnet d'expériences", () => {
  it("fichier 0600 ; une proposition n'est jamais VALIDE à l'entrée", () => {
    const c = carnet();
    const e = c.proposer(E, "shyrka");
    expect(e.statut).toBe("CANDIDAT");
    expect(statSync(join(dir, "apprentissage", "experiences.sqlite")).mode & 0o777).toBe(0o600);
    c.fermer();
  });
  it("B5 : aucune auto-promotion ; VALIDE exige Mickaël ET une vérification conforme ET aucune objection critique", () => {
    const c = carnet();
    const e = c.proposer(E, "shyrka");
    expect(() => c.changerStatut(e.id, "VALIDE", "shyrka", "je me valide")).toThrow(/Mickaël seulement/);
    expect(() => c.changerStatut(e.id, "VALIDE", "mickael", "ok")).toThrow(/vérification non_faite/);
    const v = c.proposer({ ...E, verification: "conforme", objections: ["CRITIQUE généralisation : 15/26"] }, "shyrka");
    expect(() => c.changerStatut(v.id, "VALIDE", "mickael", "ok")).toThrow(/objection critique/);
    const ok = c.proposer({ ...E, verification: "conforme" }, "shyrka");
    expect(c.changerStatut(ok.id, "VALIDE", "mickael", "relu").statut).toBe("VALIDE");
    c.fermer();
  });
  it("une conclusion négative reste, et ne redevient pas candidate", () => {
    const c = carnet();
    const r = c.proposer({ ...E, statut: "REJETE", verdict: "hypothèse réfutée" }, "shyrka");
    expect(c.lister().map((x) => x.statut)).toEqual(["REJETE"]);
    expect(() => c.changerStatut(r.id, "A_CONFIRMER", "shyrka", "on réessaie")).toThrow(/nouvelle, liée/);
    c.fermer();
  });
  it("B2 : rappel après fermeture et réouverture, avec provenance et statut, sans promotion", () => {
    const c1 = carnet();
    const e = c1.proposer({ ...E, statut: "A_CONFIRMER" }, "shyrka");
    c1.fermer();
    const c2 = carnet();
    const r = c2.rappeler("règle de routage élargie cas négatifs");
    expect(r[0]!.experience.id).toBe(e.id);
    expect(r[0]!.provenance).toMatch(/proposé par une IA · mission eaffddbc · .* · A_CONFIRMER/);
    expect(c2.obtenir(e.id).statut).toBe("A_CONFIRMER");
    c2.fermer();
  });
  it("T10 : oublier la source invalide les dérivés, qui ne sont plus servis", () => {
    const c = carnet();
    const e = c.proposer(E, "shyrka");
    const autre = c.proposer({ ...E, dependances: ["mission:autre"], question: "autre routage" }, "shyrka");
    expect(c.invaliderSource("memoire:a92c60b5", "mickael", "souvenir oublié")).toEqual([e.id]);
    expect(c.rappeler("routage").map((x) => x.experience.id)).toEqual([autre.id]);
    expect(() => c.changerStatut(e.id, "VALIDE", "mickael", "x")).toThrow(/invalidée/);
    expect(c.historique(e.id).at(-1)!.note).toMatch(/source memoire:a92c60b5 retirée/);
    c.fermer();
  });
  it("T09 : une correction ambiguë est consignée mot pour mot, A_CONFIRMER, sans préférence inventée", () => {
    const c = carnet();
    const e = c.consignerCorrection("Non, pas comme ça", "mission:07e8f724");
    expect(e).toMatchObject({ statut: "A_CONFIRMER", nature: "fait", preuves: ["Non, pas comme ça"], affirmeParIA: false });
    expect(e.hypothese).toMatch(/n'est pas inférée/);
    expect(c.lister().filter((x) => x.capacite !== "corrections")).toHaveLength(0);
    c.fermer();
  });
});
