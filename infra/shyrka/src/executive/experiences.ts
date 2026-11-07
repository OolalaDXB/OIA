import { randomUUID } from "node:crypto";
import { chmodSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import type { DatabaseSync as TypeBase } from "node:sqlite";
import type { DossierVerifie } from "../memoire/volume.js";
import { DatabaseSync } from "../node-sqlite.js";

/**
 * Carnet d'expériences gouverné (mandat v11, bloc B). Dans le volume chiffré
 * (`/Volumes/Shyrka-corpus/apprentissage/experiences.sqlite`, 0600).
 *
 * Quatre natures, jamais confondues : apprendre un FAIT, une MÉTHODE,
 * CHOISIR un outil ou un modèle, MODIFIER du code ou un prompt.
 *
 * - Une conclusion de Shyrka n'est pas une vérité : elle entre CANDIDAT ou
 *   A_CONFIRMER. Seul Mickaël promeut en VALIDE (B5), et jamais une
 *   expérience dont la vérification n'est pas conforme ou dont une propriété
 *   critique régresse.
 * - Les conclusions négatives restent : REJETE (« hypothèse réfutée »,
 *   « amélioration non démontrée »).
 * - Une source oubliée ou invalidée invalide ses dérivés : ils ne sont plus
 *   servis par `rappeler` (T10).
 * - Une correction de Mickaël est consignée telle qu'il l'a dite, A_CONFIRMER,
 *   sans en déduire de préférence durable (B3, T09).
 */

export const NATURES = ["fait", "methode", "outil", "code"] as const;
export const STATUTS_EXP = ["CANDIDAT", "A_CONFIRMER", "VALIDE", "REJETE", "REGRESSE"] as const;
export type Nature = (typeof NATURES)[number];
export type StatutExp = (typeof STATUTS_EXP)[number];

export interface Experience {
  id: string;
  capacite: string;
  nature: Nature;
  question: string;
  hypothese: string;
  source: string;
  preuves: string[];
  cause: string | null;
  versions: Record<string, string>;
  methodes: { nom: string; description: string; resultat?: string }[];
  budget: string;
  metriquesInitiales: Record<string, unknown>;
  metriquesFinales: Record<string, unknown>;
  jeux: Record<string, string>;
  objections: string[];
  verdict: string;
  verification: "conforme" | "non_conforme" | "non_faite";
  responsable: string;
  statut: StatutExp;
  domaine: string | null;
  contreExemples: string[];
  dependances: string[];
  politiqueOubli: string;
  retourArriere: string;
  affirmeParIA: boolean;
  invalidePar: string | null;
  creeLe: string;
  majLe: string;
}

export type NouvelleExperience = Omit<Experience, "id" | "statut" | "invalidePar" | "creeLe" | "majLe" | "responsable"> & { statut?: "CANDIDAT" | "A_CONFIRMER" | "REJETE" };

export class RefusExperience extends Error {}

const JSON_COLS = ["preuves", "versions", "methodes", "metriquesInitiales", "metriquesFinales", "jeux", "objections", "contreExemples", "dependances"] as const;

export class CarnetExperiences {
  private db: TypeBase;
  constructor(dossier: DossierVerifie, private readonly horloge: () => string = () => new Date().toISOString()) {
    mkdirSync(dossier.chemin, { recursive: true, mode: 0o700 });
    const chemin = join(dossier.chemin, "experiences.sqlite");
    const neuf = !existsSync(chemin);
    this.db = new DatabaseSync(chemin);
    if (neuf) chmodSync(chemin, 0o600);
    this.db.exec(`CREATE TABLE IF NOT EXISTS experiences (id TEXT PRIMARY KEY, doc TEXT NOT NULL, statut TEXT NOT NULL, invalide_par TEXT, cree_le TEXT NOT NULL, maj_le TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS experiences_journal (n INTEGER PRIMARY KEY AUTOINCREMENT, experience TEXT NOT NULL, le TEXT NOT NULL, acteur TEXT NOT NULL, de TEXT, vers TEXT, note TEXT NOT NULL);`);
  }

  fermer(): void {
    this.db.close();
  }

  private lire(l: { doc: string; statut: string; invalide_par: string | null; cree_le: string; maj_le: string }): Experience {
    return { ...(JSON.parse(l.doc) as Experience), statut: l.statut as StatutExp, invalidePar: l.invalide_par, creeLe: l.cree_le, majLe: l.maj_le };
  }

  private journal(id: string, acteur: string, de: string | null, vers: string | null, note: string): void {
    this.db.prepare("INSERT INTO experiences_journal (experience, le, acteur, de, vers, note) VALUES (?, ?, ?, ?, ?, ?)").run(id, this.horloge(), acteur, de, vers, note.slice(0, 1000));
  }

  /** Une proposition : jamais VALIDE à l'entrée, quel que soit l'auteur. */
  proposer(n: NouvelleExperience, par: string): Experience {
    const id = randomUUID();
    const statut = n.statut ?? "CANDIDAT";
    const le = this.horloge();
    const doc: Experience = { ...n, id, statut, responsable: "mickael", invalidePar: null, creeLe: le, majLe: le };
    for (const k of JSON_COLS) if (!(k in doc)) (doc as unknown as Record<string, unknown>)[k] = Array.isArray(doc[k]) ? [] : {};
    this.db.prepare("INSERT INTO experiences (id, doc, statut, invalide_par, cree_le, maj_le) VALUES (?, ?, ?, NULL, ?, ?)").run(id, JSON.stringify(doc), statut, le, le);
    this.journal(id, par, null, statut, `${n.nature} · ${n.question}`);
    return this.obtenir(id);
  }

  obtenir(ref: string): Experience {
    const l = this.db.prepare("SELECT * FROM experiences WHERE id LIKE ?").all(`${ref}%`) as never[];
    if (l.length !== 1) throw new RefusExperience(l.length ? "référence ambiguë" : "expérience introuvable");
    return this.lire(l[0]!);
  }

  lister(): Experience[] {
    return (this.db.prepare("SELECT * FROM experiences ORDER BY cree_le").all() as never[]).map((l) => this.lire(l));
  }

  historique(id: string): { le: string; acteur: string; de: string | null; vers: string | null; note: string }[] {
    return this.db.prepare("SELECT le, acteur, de, vers, note FROM experiences_journal WHERE experience = ? ORDER BY n").all(id) as never;
  }

  /**
   * Changement de statut. VALIDE : Mickaël seulement, vérification conforme,
   * aucune objection critique ouverte. REJETE et REGRESSE : toujours permis
   * (on peut toujours retirer sa confiance).
   */
  changerStatut(ref: string, vers: StatutExp, par: string, motif: string): Experience {
    const e = this.obtenir(ref);
    if (e.invalidePar && vers !== "REJETE") throw new RefusExperience(`invalidée par ${e.invalidePar} : seule la mise au rebut est permise`);
    if (vers === "VALIDE") {
      if (par !== "mickael") throw new RefusExperience("VALIDE : décision de Mickaël seulement (aucune auto-promotion)");
      if (e.verification !== "conforme") throw new RefusExperience(`VALIDE refusé : vérification ${e.verification}`);
      if (e.objections.some((o) => /^CRITIQUE/.test(o))) throw new RefusExperience("VALIDE refusé : objection critique ouverte");
    }
    if (vers === "A_CONFIRMER" && e.statut === "REJETE") throw new RefusExperience("une expérience rejetée ne redevient pas candidate : en ouvrir une nouvelle, liée");
    this.db.prepare("UPDATE experiences SET statut = ?, maj_le = ? WHERE id = ?").run(vers, this.horloge(), e.id);
    this.journal(e.id, par, e.statut, vers, motif);
    return this.obtenir(e.id);
  }

  /** Une source oubliée ou invalidée : tous ses dérivés sont invalidés et ne sont plus servis (T10). */
  invaliderSource(dependance: string, par: string, motif: string): string[] {
    const touches = this.lister().filter((e) => e.dependances.includes(dependance) && !e.invalidePar);
    for (const e of touches) {
      this.db.prepare("UPDATE experiences SET invalide_par = ?, maj_le = ? WHERE id = ?").run(dependance, this.horloge(), e.id);
      this.journal(e.id, par, e.statut, e.statut, `invalidée : source ${dependance} retirée (${motif})`);
    }
    return touches.map((e) => e.id);
  }

  /**
   * Rappel des enseignements pertinents (B2, mémoire de l'erreur) : jamais
   * une expérience invalidée ; chacune avec sa provenance, son statut et ses
   * limites. Rien n'est promu par le rappel.
   */
  rappeler(texte: string, limite = 5): { experience: Experience; provenance: string }[] {
    const mots = [...new Set(texte.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").match(/[a-z0-9.]{3,}/g) ?? [])];
    const score = (e: Experience) => {
      const t = `${e.capacite} ${e.question} ${e.hypothese} ${e.domaine ?? ""} ${e.verdict}`.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
      return mots.filter((m) => t.includes(m)).length;
    };
    return this.lister()
      .filter((e) => !e.invalidePar)
      .map((e) => ({ e, s: score(e) }))
      .filter((x) => x.s > 0)
      .sort((a, b) => b.s - a.s || b.e.creeLe.localeCompare(a.e.creeLe))
      .slice(0, limite)
      .map(({ e }) => ({ experience: e, provenance: `${e.affirmeParIA ? "proposé par une IA" : "consigné par Mickaël"} · ${e.source} · ${e.creeLe.slice(0, 16)}Z · ${e.statut}` }));
  }

  /** Correction de Mickaël, consignée mot pour mot : A_CONFIRMER, aucune préférence déduite (B3, T09). */
  consignerCorrection(texte: string, lien: string): Experience {
    return this.proposer({
      capacite: "corrections", nature: "fait", question: `Correction de Mickaël liée à ${lien}`, hypothese: "aucune : la portée durable de cette correction n'est pas inférée", source: `mickael ${lien}`, preuves: [texte],
      cause: null, versions: {}, methodes: [], budget: "0", metriquesInitiales: {}, metriquesFinales: {}, jeux: {}, objections: [], verdict: "à confirmer par Mickaël : portée (ponctuelle ou durable) non déduite",
      verification: "non_faite", domaine: null, contreExemples: [], dependances: [lien], politiqueOubli: "oubli sur demande ; invalide ses dérivés", retourArriere: "changer le statut en REJETE", affirmeParIA: false, statut: "A_CONFIRMER",
    }, "mickael");
  }
}
