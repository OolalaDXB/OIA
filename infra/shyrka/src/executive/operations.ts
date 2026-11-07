import { createHash, randomUUID } from "node:crypto";
import { chmodSync, lstatSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import type { DatabaseSync as TypeBase } from "node:sqlite";

const { DatabaseSync } = createRequire(import.meta.url)("node:sqlite") as typeof import("node:sqlite");

/**
 * Base de fonctionnement de Shyrka exécutive (mandat v10, C4, D1, E2, E3) :
 * observations, incidents dédupliqués, notifications, missions, contrôle.
 * Hors du dépôt (`~/.oia/shyrka-executive`, 0700). Aucun contenu personnel :
 * la mémoire personnelle reste dans le volume chiffré.
 */

export type EtatControle = "actif" | "non_configure" | "acces_manquant" | "erreur";
export type Resultat = "ok" | "anomalie" | "inconnu";
export type Gravite = "critique" | "majeure" | "mineure" | "info";
export type StatutIncident = "nouveau" | "confirme" | "en_traitement" | "resolu" | "ignore_avec_motif";
export type Niveau = "urgent" | "a_decider" | "a_connaitre";

export interface Observation {
  produit: string;
  controle: string;
  cible: string;
  etat: EtatControle;
  resultat: Resultat;
  detail: string;
  preuve: string;
  /** Date de la donnée source (pas de la collecte), si connue. */
  dateDonnee: string | null;
  /** Gravité si anomalie ; un signal de sécurité est critique et alerte immédiatement. */
  gravite?: Gravite;
  securite?: boolean;
  /** Ce qui identifie le constat pour la déduplication (sans horodatage). */
  signature?: string;
}

export interface Incident {
  id: string;
  empreinte: string;
  produit: string;
  environnement: string;
  source: string;
  observation: string;
  gravite: Gravite;
  impact: string;
  premiere: string;
  derniere: string;
  occurrences: number;
  consecutives: number;
  statut: StatutIncident;
  preuve: string;
  prochaineAction: string;
  motif: string | null;
  reapparitions: number;
  resoluLe: string | null;
}

export interface Notification {
  id: number;
  cle: string;
  niveau: Niveau;
  titre: string;
  cible: string;
  le: string;
}

export const empreinteConstat = (produit: string, controle: string, cible: string, signature: string) =>
  createHash("sha256").update(`${produit}\n${controle}\n${cible}\n${signature}`).digest("hex").slice(0, 32);

export class BaseOps {
  readonly db: TypeBase;
  constructor(
    readonly dossier: string,
    private readonly horloge: () => string = () => new Date().toISOString(),
  ) {
    mkdirSync(dossier, { recursive: true, mode: 0o700 });
    if (lstatSync(dossier).isSymbolicLink()) throw new Error(`Lien symbolique refusé : ${dossier}`);
    chmodSync(dossier, 0o700);
    const chemin = join(dossier, "operations.sqlite");
    this.db = new DatabaseSync(chemin);
    this.db.exec(`PRAGMA busy_timeout = 5000; PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;
      CREATE TABLE IF NOT EXISTS observations (n INTEGER PRIMARY KEY AUTOINCREMENT, passage TEXT NOT NULL, produit TEXT NOT NULL, controle TEXT NOT NULL, cible TEXT NOT NULL,
        etat TEXT NOT NULL, resultat TEXT NOT NULL, detail TEXT NOT NULL, preuve TEXT NOT NULL, date_donnee TEXT, collecte_le TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS observations_cle ON observations (produit, controle, cible, n);
      CREATE TABLE IF NOT EXISTS incidents (id TEXT PRIMARY KEY, empreinte TEXT NOT NULL UNIQUE, produit TEXT NOT NULL, environnement TEXT NOT NULL, source TEXT NOT NULL,
        observation TEXT NOT NULL, gravite TEXT NOT NULL, impact TEXT NOT NULL, premiere TEXT NOT NULL, derniere TEXT NOT NULL, occurrences INTEGER NOT NULL,
        consecutives INTEGER NOT NULL, statut TEXT NOT NULL, preuve TEXT NOT NULL, prochaine_action TEXT NOT NULL, motif TEXT, reapparitions INTEGER NOT NULL DEFAULT 0, resolu_le TEXT);
      CREATE TABLE IF NOT EXISTS notifications (id INTEGER PRIMARY KEY AUTOINCREMENT, cle TEXT NOT NULL UNIQUE, niveau TEXT NOT NULL, titre TEXT NOT NULL, cible TEXT NOT NULL, le TEXT NOT NULL, lue INTEGER NOT NULL DEFAULT 0);
      CREATE TABLE IF NOT EXISTS controle (cle TEXT PRIMARY KEY, valeur TEXT NOT NULL, le TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS passages (id TEXT PRIMARY KEY, debut TEXT NOT NULL, fin TEXT, resume TEXT);`);
    chmodSync(chemin, 0o600);
  }

  fermer(): void {
    if (this.db.isOpen) this.db.close();
  }

  tx<T>(f: () => T): T {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const r = f();
      this.db.exec("COMMIT");
      return r;
    } catch (e) {
      this.db.exec("ROLLBACK");
      throw e;
    }
  }

  maintenant(): string {
    return this.horloge();
  }

  lireControle(cle: string): string | null {
    return (this.db.prepare("SELECT valeur FROM controle WHERE cle = ?").get(cle) as { valeur: string } | undefined)?.valeur ?? null;
  }
  ecrireControle(cle: string, valeur: string): void {
    this.db.prepare("INSERT INTO controle VALUES (?, ?, ?) ON CONFLICT(cle) DO UPDATE SET valeur = excluded.valeur, le = excluded.le").run(cle, valeur, this.horloge());
  }

  debutPassage(): string {
    const id = randomUUID();
    this.db.prepare("INSERT INTO passages (id, debut) VALUES (?, ?)").run(id, this.horloge());
    return id;
  }
  finPassage(id: string, resume: string): void {
    this.db.prepare("UPDATE passages SET fin = ?, resume = ? WHERE id = ?").run(this.horloge(), resume, id);
  }
  dernierPassage(): { id: string; debut: string; fin: string | null; resume: string | null } | null {
    return (this.db.prepare("SELECT * FROM passages WHERE fin IS NOT NULL ORDER BY debut DESC LIMIT 1").get() as never) ?? null;
  }

  /**
   * Enregistre une observation et met à jour l'incident correspondant :
   * - une anomalie ouvre (ou prolonge) un incident identifié par son empreinte ;
   * - une alerte de disponibilité n'est notifiée qu'après N observations
   *   consécutives ; un signal de sécurité l'est immédiatement ;
   * - un contrôle non exécuté (acces_manquant, erreur, non_configure) n'est ni un succès ni une panne ;
   * - une observation saine résout l'incident ouvert du même contrôle ; une réapparition est comptée.
   */
  observer(passage: string, o: Observation, seuil: number): { incident: Incident | null; notification: Notification | null } {
    return this.tx(() => {
      const le = this.horloge();
      this.db
        .prepare("INSERT INTO observations (passage, produit, controle, cible, etat, resultat, detail, preuve, date_donnee, collecte_le) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
        .run(passage, o.produit, o.controle, o.cible, o.etat, o.resultat, o.detail.slice(0, 500), o.preuve.slice(0, 500), o.dateDonnee, le);
      const ouverts = this.db
        .prepare("SELECT * FROM incidents WHERE produit = ? AND source = ? AND statut IN ('nouveau','confirme','en_traitement')")
        .all(o.produit, `${o.controle}:${o.cible}`) as Ligne[];
      if (o.etat !== "actif" || o.resultat === "inconnu") return { incident: null, notification: null };
      if (o.resultat === "ok") {
        for (const i of ouverts) {
          this.db.prepare("UPDATE incidents SET statut = 'resolu', resolu_le = ?, consecutives = 0 WHERE id = ?").run(le, i.id);
          this.notifier(`incident:${i.id}:resolu:${i.reapparitions}`, "a_connaitre", `Résolu : ${o.produit} · ${o.controle}`, i.id);
        }
        return { incident: null, notification: null };
      }
      const empreinte = empreinteConstat(o.produit, o.controle, o.cible, o.signature ?? o.detail);
      // Un autre constat du même contrôle remplace l'ancien : on ne garde qu'un incident ouvert par contrôle.
      for (const i of ouverts) if (i.empreinte !== empreinte) this.db.prepare("UPDATE incidents SET statut = 'resolu', resolu_le = ?, motif = 'remplacé par un autre constat' WHERE id = ?").run(le, i.id);
      const existant = this.db.prepare("SELECT * FROM incidents WHERE empreinte = ?").get(empreinte) as Ligne | undefined;
      let inc: Ligne;
      if (!existant) {
        inc = {
          id: randomUUID(), empreinte, produit: o.produit, environnement: "production", source: `${o.controle}:${o.cible}`, observation: o.detail.slice(0, 500), gravite: o.gravite ?? "majeure",
          impact: o.securite ? "sécurité" : "disponibilité ou qualité", premiere: le, derniere: le, occurrences: 1, consecutives: 1, statut: "nouveau", preuve: o.preuve.slice(0, 500),
          prochaine_action: o.securite ? "vérifier immédiatement" : "confirmer à l'observation suivante, puis diagnostiquer", motif: null, reapparitions: 0, resolu_le: null,
        };
        this.db
          .prepare("INSERT INTO incidents VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
          .run(inc.id, inc.empreinte, inc.produit, inc.environnement, inc.source, inc.observation, inc.gravite, inc.impact, inc.premiere, inc.derniere, inc.occurrences, inc.consecutives, inc.statut, inc.preuve, inc.prochaine_action, inc.motif, inc.reapparitions, inc.resolu_le);
      } else if (existant.statut === "ignore_avec_motif") {
        this.db.prepare("UPDATE incidents SET derniere = ?, occurrences = occurrences + 1 WHERE id = ?").run(le, existant.id);
        return { incident: versIncident({ ...existant, derniere: le }), notification: null };
      } else {
        const reapparu = existant.statut === "resolu";
        this.db
          .prepare(
            "UPDATE incidents SET derniere = ?, occurrences = occurrences + 1, consecutives = ?, statut = ?, reapparitions = reapparitions + ?, resolu_le = NULL, preuve = ?, observation = ? WHERE id = ?",
          )
          .run(le, reapparu ? 1 : existant.consecutives + 1, reapparu ? "nouveau" : existant.statut, reapparu ? 1 : 0, o.preuve.slice(0, 500), o.detail.slice(0, 500), existant.id);
        inc = this.db.prepare("SELECT * FROM incidents WHERE id = ?").get(existant.id) as Ligne;
      }
      let notification: Notification | null = null;
      if (inc.statut === "nouveau" && (o.securite || inc.consecutives >= seuil)) {
        const action = o.securite ? "vérifier immédiatement ; aucune action automatique" : `diagnostiquer à partir de la preuve (${o.preuve.slice(0, 120)}) ; aucune action automatique sur le produit`;
        this.db.prepare("UPDATE incidents SET statut = 'confirme', prochaine_action = ? WHERE id = ?").run(action, inc.id);
        inc.statut = "confirme";
        inc.prochaine_action = action;
        notification = this.notifier(`incident:${inc.id}:confirme:${inc.reapparitions}`, o.securite || inc.gravite === "critique" ? "urgent" : "a_decider", `${o.produit} · ${o.controle} : anomalie confirmée`, inc.id);
      }
      return { incident: versIncident(inc), notification };
    });
  }

  /** Une notification par clé : pas de répétition tant que le constat n'a pas changé. */
  notifier(cle: string, niveau: Niveau, titre: string, cible: string): Notification | null {
    const r = this.db.prepare("INSERT OR IGNORE INTO notifications (cle, niveau, titre, cible, le) VALUES (?, ?, ?, ?, ?)").run(cle, niveau, titre, cible, this.horloge());
    if (r.changes === 0) return null;
    return this.db.prepare("SELECT id, cle, niveau, titre, cible, le FROM notifications WHERE id = ?").get(r.lastInsertRowid) as unknown as Notification;
  }

  notifications(depuis?: string): Notification[] {
    return this.db.prepare("SELECT id, cle, niveau, titre, cible, le FROM notifications WHERE le > ? ORDER BY id").all(depuis ?? "") as unknown as Notification[];
  }

  incidents(statuts?: StatutIncident[]): Incident[] {
    const tous = (this.db.prepare("SELECT * FROM incidents ORDER BY derniere DESC").all() as Ligne[]).map(versIncident);
    return statuts ? tous.filter((i) => statuts.includes(i.statut)) : tous;
  }

  changerIncident(id: string, statut: StatutIncident, motif?: string): void {
    if (statut === "ignore_avec_motif" && !motif) throw new Error("ignorer exige un motif");
    const r = this.db.prepare("UPDATE incidents SET statut = ?, motif = COALESCE(?, motif) WHERE id LIKE ?").run(statut, motif ?? null, `${id}%`);
    if (r.changes !== 1) throw new Error("incident introuvable ou référence ambiguë");
  }

  /** Dernière observation de chaque contrôle (couverture et fraîcheur). */
  dernieresObservations(): (Observation & { collecteLe: string })[] {
    return (
      this.db
        .prepare("SELECT o.* FROM observations o JOIN (SELECT max(n) n FROM observations GROUP BY produit, controle, cible) d ON d.n = o.n ORDER BY produit, controle, cible")
        .all() as { produit: string; controle: string; cible: string; etat: EtatControle; resultat: Resultat; detail: string; preuve: string; date_donnee: string | null; collecte_le: string }[]
    ).map((l) => ({ produit: l.produit, controle: l.controle, cible: l.cible, etat: l.etat, resultat: l.resultat, detail: l.detail, preuve: l.preuve, dateDonnee: l.date_donnee, collecteLe: l.collecte_le }));
  }
}

type Ligne = {
  id: string; empreinte: string; produit: string; environnement: string; source: string; observation: string; gravite: Gravite; impact: string; premiere: string; derniere: string;
  occurrences: number; consecutives: number; statut: StatutIncident; preuve: string; prochaine_action: string; motif: string | null; reapparitions: number; resolu_le: string | null;
};
const versIncident = (l: Ligne): Incident => ({
  id: l.id, empreinte: l.empreinte, produit: l.produit, environnement: l.environnement, source: l.source, observation: l.observation, gravite: l.gravite, impact: l.impact,
  premiere: l.premiere, derniere: l.derniere, occurrences: l.occurrences, consecutives: l.consecutives, statut: l.statut, preuve: l.preuve, prochaineAction: l.prochaine_action,
  motif: l.motif, reapparitions: l.reapparitions, resoluLe: l.resolu_le,
});
