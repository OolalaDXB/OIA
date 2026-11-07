import { randomUUID } from "node:crypto";
import type { BaseOps } from "./operations.js";

/**
 * Registre durable des missions (mandat v10, D1 à D5 ; E3). Petit registre
 * transactionnel dans la base de fonctionnement, pas un framework
 * multi-agents.
 *
 * - Transitions contrôlées par le code (table TRANSITIONS).
 * - Bail (lease) avec battement : un bail expiré remet la mission en file,
 *   tentative comptée ; aucun « exactement une fois » promis, mais la clé
 *   d'idempotence empêche les missions et effets dupliqués.
 * - Une approbation est liée à la mission, à l'action et à l'empreinte du
 *   diff présenté : un nouveau diff exige une nouvelle approbation.
 * - L'agent auteur ne s'approuve pas ; aucune fusion n'existe dans ce code.
 */

export const STATUTS = ["proposee", "autorisee", "en_file", "en_cours", "en_verification", "attente_validation", "terminee", "bloquee", "echouee", "annulee"] as const;
export type StatutMission = (typeof STATUTS)[number];
export type Automatisation = "automatique" | "assiste" | "simule";

const TRANSITIONS: Record<StatutMission, StatutMission[]> = {
  proposee: ["autorisee", "annulee"],
  autorisee: ["en_file", "annulee"],
  en_file: ["en_cours", "annulee", "bloquee"],
  en_cours: ["en_verification", "bloquee", "echouee", "en_file", "annulee"],
  en_verification: ["attente_validation", "en_cours", "echouee", "bloquee"],
  // v11 : une revue indépendante qui rejette le patch le bloque, sans consommer de tentative.
  attente_validation: ["terminee", "en_cours", "annulee", "bloquee"],
  bloquee: ["en_file", "annulee"],
  terminee: [],
  echouee: [],
  annulee: [],
};

export interface Perimetre {
  repo: string;
  /** Chemins (préfixes exacts) que le développement peut modifier. */
  fichiers: string[];
  /** Commandes que la vérification peut exécuter, mot pour mot. */
  commandes: string[][];
}

export interface Mission {
  id: string;
  cle: string;
  objectif: string;
  demandeur: string;
  perimetre: Perimetre;
  contexteAutorise: string[];
  repo: string;
  shaBase: string;
  preuvesEntree: string[];
  agent: string;
  outils: string[];
  budgetUsd: number;
  coutConstate: number | null;
  tentativesMax: number;
  tentatives: number;
  dureeMaxMin: number;
  statut: StatutMission;
  resultats: Record<string, unknown>;
  validation: { action: string; empreinte: string; par: string; le: string } | null;
  causeBlocage: string | null;
  automatisation: Automatisation;
  incident: string | null;
  bailPar: string | null;
  bailJusqua: string | null;
  creeLe: string;
  majLe: string;
}

export interface NouvelleMission {
  cle: string;
  objectif: string;
  demandeur: string;
  perimetre: Perimetre;
  contexteAutorise?: string[];
  shaBase: string;
  preuvesEntree?: string[];
  agent: string;
  outils?: string[];
  budgetUsd?: number;
  tentativesMax?: number;
  dureeMaxMin?: number;
  automatisation: Automatisation;
  incident?: string | null;
}

export class RefusMission extends Error {}

type Ligne = Record<string, string | number | null>;

export class Missions {
  constructor(private readonly ops: BaseOps) {
    ops.db.exec(`
      CREATE TABLE IF NOT EXISTS missions (id TEXT PRIMARY KEY, cle TEXT NOT NULL UNIQUE, objectif TEXT NOT NULL, demandeur TEXT NOT NULL, perimetre TEXT NOT NULL,
        contexte TEXT NOT NULL, repo TEXT NOT NULL, sha_base TEXT NOT NULL, preuves TEXT NOT NULL, agent TEXT NOT NULL, outils TEXT NOT NULL, budget_usd REAL NOT NULL,
        cout REAL, tentatives_max INTEGER NOT NULL, tentatives INTEGER NOT NULL DEFAULT 0, duree_max_min INTEGER NOT NULL, statut TEXT NOT NULL, resultats TEXT NOT NULL,
        validation TEXT, cause TEXT, automatisation TEXT NOT NULL, incident TEXT, bail_par TEXT, bail_jusqua TEXT, cree_le TEXT NOT NULL, maj_le TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS mission_journal (n INTEGER PRIMARY KEY AUTOINCREMENT, mission TEXT NOT NULL, le TEXT NOT NULL, acteur TEXT NOT NULL, de TEXT, vers TEXT, note TEXT NOT NULL);`);
  }

  private lire(l: Ligne): Mission {
    return {
      id: l.id as string, cle: l.cle as string, objectif: l.objectif as string, demandeur: l.demandeur as string, perimetre: JSON.parse(l.perimetre as string), contexteAutorise: JSON.parse(l.contexte as string),
      repo: l.repo as string, shaBase: l.sha_base as string, preuvesEntree: JSON.parse(l.preuves as string), agent: l.agent as string, outils: JSON.parse(l.outils as string), budgetUsd: l.budget_usd as number,
      coutConstate: l.cout as number | null, tentativesMax: l.tentatives_max as number, tentatives: l.tentatives as number, dureeMaxMin: l.duree_max_min as number, statut: l.statut as StatutMission,
      resultats: JSON.parse(l.resultats as string), validation: l.validation ? JSON.parse(l.validation as string) : null, causeBlocage: l.cause as string | null,
      automatisation: l.automatisation as Automatisation, incident: l.incident as string | null, bailPar: l.bail_par as string | null, bailJusqua: l.bail_jusqua as string | null,
      creeLe: l.cree_le as string, majLe: l.maj_le as string,
    };
  }

  private journal(id: string, acteur: string, de: string | null, vers: string | null, note: string): void {
    this.ops.db.prepare("INSERT INTO mission_journal (mission, le, acteur, de, vers, note) VALUES (?, ?, ?, ?, ?, ?)").run(id, this.ops.maintenant(), acteur, de, vers, note.slice(0, 1000));
  }

  /** Idempotent : la même clé rend la mission existante, sans en créer une seconde. */
  proposer(n: NouvelleMission): { mission: Mission; creee: boolean } {
    return this.ops.tx(() => {
      const deja = this.ops.db.prepare("SELECT * FROM missions WHERE cle = ?").get(n.cle) as Ligne | undefined;
      if (deja) return { mission: this.lire(deja), creee: false };
      const id = randomUUID();
      const le = this.ops.maintenant();
      this.ops.db
        .prepare("INSERT INTO missions (id, cle, objectif, demandeur, perimetre, contexte, repo, sha_base, preuves, agent, outils, budget_usd, tentatives_max, duree_max_min, statut, resultats, automatisation, incident, cree_le, maj_le) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'proposee', '{}', ?, ?, ?, ?)")
        .run(id, n.cle, n.objectif, n.demandeur, JSON.stringify(n.perimetre), JSON.stringify(n.contexteAutorise ?? []), n.perimetre.repo, n.shaBase, JSON.stringify(n.preuvesEntree ?? []), n.agent,
          JSON.stringify(n.outils ?? []), n.budgetUsd ?? 0, Math.min(n.tentativesMax ?? 2, 2), n.dureeMaxMin ?? 60, n.automatisation, n.incident ?? null, le, le);
      this.journal(id, n.demandeur, null, "proposee", n.objectif);
      return { mission: this.obtenir(id), creee: true };
    });
  }

  obtenir(ref: string): Mission {
    const l = this.ops.db.prepare("SELECT * FROM missions WHERE id LIKE ?").all(`${ref}%`) as Ligne[];
    if (l.length !== 1) throw new RefusMission(l.length ? "référence de mission ambiguë" : "mission introuvable");
    return this.lire(l[0]!);
  }

  lister(): Mission[] {
    return (this.ops.db.prepare("SELECT * FROM missions ORDER BY cree_le DESC").all() as Ligne[]).map((l) => this.lire(l));
  }

  historique(id: string): { le: string; acteur: string; de: string | null; vers: string | null; note: string }[] {
    return this.ops.db.prepare("SELECT le, acteur, de, vers, note FROM mission_journal WHERE mission = ? ORDER BY n").all(id) as never;
  }

  /** Transition contrôlée. `acteur` est consigné ; certaines transitions sont réservées à Mickaël. */
  passer(ref: string, vers: StatutMission, acteur: string, note: string, maj: Partial<{ resultats: Record<string, unknown>; cause: string; cout: number }> = {}): Mission {
    return this.ops.tx(() => {
      const m = this.obtenir(ref);
      if (!TRANSITIONS[m.statut].includes(vers)) throw new RefusMission(`transition refusée : ${m.statut} → ${vers}`);
      // Autoriser : Mickaël, ou un mandat écrit de Mickaël qui délègue cette mission (consigné tel quel).
      if (vers === "autorisee" && acteur !== "mickael" && !/^mandat:[\w.-]+$/.test(acteur)) throw new RefusMission("autorisee : décision de Mickaël ou d'un mandat écrit seulement");
      if (["terminee", "annulee"].includes(vers) && acteur !== "mickael") throw new RefusMission(`${vers} : décision de Mickaël seulement`);
      if (vers === "terminee") {
        const empreinte = (m.resultats as { empreinteDiff?: string }).empreinteDiff;
        if (!m.validation || m.validation.empreinte !== empreinte || m.validation.action !== "accepter_patch") throw new RefusMission("aucune approbation valable pour le diff actuel");
      }
      if (vers === "en_cours" && m.statut !== "en_file") {
        // Correction demandée (après vérification ou par Mickaël) : une tentative de plus, bornée.
        if (m.tentatives >= m.tentativesMax) throw new RefusMission(`limite de ${m.tentativesMax} tentatives atteinte : la mission se bloque, pas d'escalade`);
      }
      const resultats = maj.resultats ? { ...m.resultats, ...maj.resultats } : m.resultats;
      // Un nouveau diff invalide toute approbation antérieure.
      const validation = maj.resultats && "empreinteDiff" in maj.resultats && m.validation && m.validation.empreinte !== maj.resultats.empreinteDiff ? null : m.validation;
      this.ops.db
        .prepare("UPDATE missions SET statut = ?, resultats = ?, validation = ?, cause = COALESCE(?, cause), cout = COALESCE(?, cout), tentatives = tentatives + ?, bail_par = CASE WHEN ? IN ('en_cours') THEN bail_par ELSE NULL END, bail_jusqua = CASE WHEN ? IN ('en_cours') THEN bail_jusqua ELSE NULL END, maj_le = ? WHERE id = ?")
        .run(vers, JSON.stringify(resultats), validation ? JSON.stringify(validation) : null, maj.cause ?? null, maj.cout ?? null, vers === "en_cours" && m.statut !== "en_file" ? 1 : 0, vers, vers, this.ops.maintenant(), m.id);
      this.journal(m.id, acteur, m.statut, vers, note);
      if (vers === "attente_validation") this.ops.notifier(`mission:${m.id}:attente:${(resultats as { empreinteDiff?: string }).empreinteDiff ?? ""}`, "a_decider", `Mission prête à relire : ${m.objectif.slice(0, 60)}`, m.id);
      if (vers === "bloquee" || vers === "echouee") this.ops.notifier(`mission:${m.id}:${vers}:${m.tentatives}`, "a_decider", `Mission ${vers} : ${m.objectif.slice(0, 60)}`, m.id);
      return this.obtenir(m.id);
    });
  }

  /**
   * Prend une mission en file sous bail. Refuse si les départs sont suspendus
   * ou si une mission d'écriture est déjà en cours (une seule à la fois en v1).
   */
  prendre(ref: string, par: string, dureeMs: number): Mission {
    return this.ops.tx(() => {
      if (this.ops.lireControle("pause") === "1") throw new RefusMission("départs suspendus (pause)");
      const m = this.obtenir(ref);
      if (m.statut !== "en_file") throw new RefusMission(`mission ${m.statut}, pas en file`);
      const enCours = this.ops.db.prepare("SELECT count(*) n FROM missions WHERE statut IN ('en_cours','en_verification') AND id != ?").get(m.id) as { n: number };
      if (enCours.n > 0) throw new RefusMission("une mission d'écriture est déjà en cours");
      if (m.tentatives >= m.tentativesMax) throw new RefusMission("limite de tentatives atteinte");
      const jusqua = new Date(Date.parse(this.ops.maintenant()) + dureeMs).toISOString();
      this.ops.db.prepare("UPDATE missions SET statut = 'en_cours', bail_par = ?, bail_jusqua = ?, tentatives = tentatives + 1, maj_le = ? WHERE id = ? AND statut = 'en_file'").run(par, jusqua, this.ops.maintenant(), m.id);
      this.journal(m.id, par, "en_file", "en_cours", `bail jusqu'à ${jusqua}, tentative ${m.tentatives + 1}/${m.tentativesMax}`);
      return this.obtenir(m.id);
    });
  }

  battement(ref: string, par: string, dureeMs: number): void {
    const r = this.ops.db
      .prepare("UPDATE missions SET bail_jusqua = ?, maj_le = ? WHERE id LIKE ? AND statut IN ('en_cours','en_verification') AND bail_par = ?")
      .run(new Date(Date.parse(this.ops.maintenant()) + dureeMs).toISOString(), this.ops.maintenant(), `${ref}%`, par);
    if (r.changes !== 1) throw new RefusMission("bail perdu : arrêter le travail, ne rien publier");
  }

  /** Reprise après crash : un bail expiré remet la mission en file (ou la bloque si les tentatives sont épuisées). */
  reprendreExpires(): Mission[] {
    return this.ops.tx(() => {
      const expires = this.ops.db.prepare("SELECT * FROM missions WHERE statut IN ('en_cours','en_verification') AND bail_jusqua IS NOT NULL AND bail_jusqua < ?").all(this.ops.maintenant()) as Ligne[];
      return expires.map((l) => {
        const m = this.lire(l);
        const vers: StatutMission = m.tentatives >= m.tentativesMax ? "bloquee" : "en_file";
        this.ops.db.prepare("UPDATE missions SET statut = ?, bail_par = NULL, bail_jusqua = NULL, cause = ?, maj_le = ? WHERE id = ?").run(vers, vers === "bloquee" ? "bail expiré, tentatives épuisées" : null, this.ops.maintenant(), m.id);
        this.journal(m.id, "registre", m.statut, vers, `bail de ${m.bailPar} expiré (${m.bailJusqua}) : reprise traçable`);
        return this.obtenir(m.id);
      });
    });
  }

  /** Approbation de Mickaël, liée à l'action et à l'empreinte du diff qu'il a vu. */
  approuver(ref: string, action: "accepter_patch", empreinte: string, par: string): Mission {
    if (par !== "mickael") throw new RefusMission("seul Mickaël approuve");
    return this.ops.tx(() => {
      const m = this.obtenir(ref);
      if (m.statut !== "attente_validation") throw new RefusMission(`mission ${m.statut} : rien à approuver`);
      const actuelle = (m.resultats as { empreinteDiff?: string }).empreinteDiff;
      if (!actuelle || empreinte !== actuelle) throw new RefusMission(`approbation refusée : empreinte ${empreinte.slice(0, 12)} ≠ diff actuel ${actuelle?.slice(0, 12) ?? "(aucun)"}`);
      const validation = { action, empreinte, par, le: this.ops.maintenant() };
      this.ops.db.prepare("UPDATE missions SET validation = ?, maj_le = ? WHERE id = ?").run(JSON.stringify(validation), this.ops.maintenant(), m.id);
      this.journal(m.id, par, m.statut, m.statut, `approbation ${action} pour le diff ${empreinte.slice(0, 12)} (aucune fusion automatique)`);
      return this.obtenir(m.id);
    });
  }
}

/** Fichiers modifiés hors du périmètre autorisé (refus technique, A2). */
export function horsPerimetre(fichiers: string[], perimetre: Perimetre): string[] {
  return fichiers.filter((f) => !perimetre.fichiers.some((p) => f === p || (p.endsWith("/") && f.startsWith(p))));
}

/** Chemins qu'aucune mission ne touche, quel que soit son périmètre déclaré. */
const INTERDITS = [/(^|\/)\.env/, /(^|\/)\.github\//, /supabase\/migrations\//, /docs\/shyrka\/CADRE\.md$/, /identite\.json$/, /permissions\.json$/, /(^|\/)package\.json$/, /pnpm-lock\.yaml$/, /vercel\.json$/];
export function interdits(fichiers: string[]): string[] {
  return fichiers.filter((f) => INTERDITS.some((re) => re.test(f)));
}
