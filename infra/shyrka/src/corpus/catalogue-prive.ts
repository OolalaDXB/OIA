import { randomBytes } from "node:crypto";
import { chmodSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import type { DatabaseSync as TypeBase } from "node:sqlite";
import { RefusMemoire, type Niveau } from "@oia/shyrka-noyau";
import type { SourceCorpus } from "../executive/corpus.js";
import type { DossierVerifie } from "../memoire/volume.js";
import { DatabaseSync } from "../node-sqlite.js";

/**
 * Catalogue des sources privées (mandat Corpus local, § 3 B) :
 * `connaissances/catalogue-prive.sqlite`, dans le volume chiffré, jamais
 * dans Git. Métadonnées seulement (identifiant opaque, origine, type,
 * compartiment, droits, empreinte, dates, statut) ; le contenu admis vit dans
 * `brut/`, l'index dans `corpus.sqlite`. Composé en mémoire avec le
 * catalogue Git : une collision d'identifiants est une erreur.
 */

export type Origine = "depot" | "note" | "dossier";
export type StatutPrive = "indexe" | "echec" | "revoque";

export interface SourcePrivee {
  id: string;
  nom: string;
  origine: Origine;
  type: string;
  compartiment: string;
  /** Lecteurs accordés explicitement : `mickael` toujours ; `conversation` seulement si Mickaël l'a coché. */
  lecteurs: ("mickael" | "conversation")[];
  empreinte: string;
  taille: number;
  /** Chemin relatif du fichier admis sous `brut/` (jamais montré hors du Mac). */
  fichier: string;
  dateSource: string;
  dateImport: string;
  version: number;
  statut: StatutPrive;
  /** Motifs de quarantaine levés par Mickaël, s'il y en avait. */
  attestation: string | null;
  revoqueLe: string | null;
  /** Niveau de confidentialité confirmé par Mickaël (modifiable). */
  niveau: Niveau;
}

type Ligne = {
  id: string; nom: string; origine: string; type: string; compartiment: string; lecteurs: string; empreinte: string; taille: number; fichier: string;
  date_source: string; date_import: string; version: number; statut: string; attestation: string | null; revoque_le: string | null; niveau: string;
};

const versSource = (l: Ligne): SourcePrivee => ({
  id: l.id, nom: l.nom, origine: l.origine as Origine, type: l.type, compartiment: l.compartiment, lecteurs: JSON.parse(l.lecteurs) as SourcePrivee["lecteurs"],
  empreinte: l.empreinte, taille: l.taille, fichier: l.fichier, dateSource: l.date_source, dateImport: l.date_import, version: l.version,
  statut: l.statut as StatutPrive, attestation: l.attestation, revoqueLe: l.revoque_le, niveau: l.niveau as Niveau,
});

/** Identifiant stable et opaque : jamais dérivé d'un nom de fichier privé. */
export const nouvelId = () => `prive-${randomBytes(6).toString("hex")}`;

export class CataloguePrive {
  private db: TypeBase;
  constructor(dossier: DossierVerifie) {
    mkdirSync(dossier.chemin, { recursive: true, mode: 0o700 });
    const chemin = join(dossier.chemin, "catalogue-prive.sqlite");
    try {
      this.db = new DatabaseSync(chemin);
      this.db.exec(`PRAGMA busy_timeout = 5000; PRAGMA secure_delete = ON; PRAGMA journal_mode = DELETE;
        CREATE TABLE IF NOT EXISTS sources (
          id TEXT PRIMARY KEY, nom TEXT NOT NULL, origine TEXT NOT NULL, type TEXT NOT NULL, compartiment TEXT NOT NULL, lecteurs TEXT NOT NULL,
          empreinte TEXT NOT NULL, taille INTEGER NOT NULL, fichier TEXT NOT NULL, date_source TEXT NOT NULL, date_import TEXT NOT NULL,
          version INTEGER NOT NULL, statut TEXT NOT NULL, attestation TEXT, revoque_le TEXT);
        CREATE TABLE IF NOT EXISTS versions (source TEXT NOT NULL, version INTEGER NOT NULL, empreinte TEXT NOT NULL, date_import TEXT NOT NULL, PRIMARY KEY (source, version));
        CREATE TABLE IF NOT EXISTS reports (memoire_id TEXT PRIMARY KEY, jusqu_au TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS citations_oubliees (empreinte TEXT PRIMARY KEY, le TEXT NOT NULL);`);
      // Schéma 2 : niveau de confidentialité (« confidentiel » par défaut pour les sources déjà déposées).
      if (!(this.db.prepare("PRAGMA table_info(sources)").all() as { name: string }[]).some((c) => c.name === "niveau")) this.db.exec("ALTER TABLE sources ADD COLUMN niveau TEXT NOT NULL DEFAULT 'confidentiel'");
      this.db.exec("PRAGMA user_version = 2");
    } catch (e) {
      throw new RefusMemoire(`Catalogue privé illisible (${(e as Error).message}).`, "stockage_corrompu");
    }
    chmodSync(chemin, 0o600);
  }

  fermer(): void {
    if (this.db.isOpen) this.db.close();
  }

  lister(): SourcePrivee[] {
    return (this.db.prepare("SELECT * FROM sources ORDER BY date_import DESC").all() as Ligne[]).map(versSource);
  }

  lire(id: string): SourcePrivee | null {
    const l = this.db.prepare("SELECT * FROM sources WHERE id = ?").get(id) as Ligne | undefined;
    return l ? versSource(l) : null;
  }

  /** Source active portant ce contenu (dédoublonnage par empreinte, pas par nom). */
  parEmpreinte(empreinte: string): SourcePrivee | null {
    const l = this.db.prepare("SELECT * FROM sources WHERE empreinte = ? AND statut != 'revoque'").get(empreinte) as Ligne | undefined;
    return l ? versSource(l) : null;
  }

  /** Source active du même nom d'affichage : candidate à une nouvelle version. */
  parNom(nom: string): SourcePrivee | null {
    const l = this.db.prepare("SELECT * FROM sources WHERE nom = ? AND statut != 'revoque' ORDER BY date_import DESC").get(nom) as Ligne | undefined;
    return l ? versSource(l) : null;
  }

  revoqueeAvec(empreinte: string): SourcePrivee | null {
    const l = this.db.prepare("SELECT * FROM sources WHERE empreinte = ? AND statut = 'revoque' ORDER BY revoque_le DESC").get(empreinte) as Ligne | undefined;
    return l ? versSource(l) : null;
  }

  enregistrer(s: SourcePrivee): void {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      this.db
        .prepare("INSERT OR REPLACE INTO sources (id, nom, origine, type, compartiment, lecteurs, empreinte, taille, fichier, date_source, date_import, version, statut, attestation, revoque_le, niveau) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
        .run(s.id, s.nom, s.origine, s.type, s.compartiment, JSON.stringify(s.lecteurs), s.empreinte, s.taille, s.fichier, s.dateSource, s.dateImport, s.version, s.statut, s.attestation, s.revoqueLe, s.niveau);
      this.db.prepare("INSERT OR IGNORE INTO versions VALUES (?, ?, ?, ?)").run(s.id, s.version, s.empreinte, s.dateImport);
      this.db.exec("COMMIT");
    } catch (e) {
      this.db.exec("ROLLBACK");
      throw e;
    }
  }

  statut(id: string, statut: StatutPrive, quand: string | null = null): void {
    this.db.prepare("UPDATE sources SET statut = ?, revoque_le = ? WHERE id = ?").run(statut, statut === "revoque" ? quand : null, id);
  }

  fixerNiveau(id: string, niveau: Niveau): void {
    this.db.prepare("UPDATE sources SET niveau = ? WHERE id = ?").run(niveau, id);
  }

  /**
   * Empreinte (SHA-256, jamais le texte) de la citation d'une connaissance oubliée ou refusée : une proposition
   * future appuyée sur la même phrase est écartée, même reformulée (l'oubli efface le contenu, pas cette garde).
   */
  oublierCitation(empreinte: string, le: string): void {
    this.db.prepare("INSERT OR IGNORE INTO citations_oubliees VALUES (?, ?)").run(empreinte, le);
  }

  citationOubliee(empreinte: string): boolean {
    return Boolean(this.db.prepare("SELECT 1 FROM citations_oubliees WHERE empreinte = ?").get(empreinte));
  }

  reporter(memoireId: string, jusquAu: string): void {
    this.db.prepare("INSERT OR REPLACE INTO reports VALUES (?, ?)").run(memoireId, jusquAu);
  }

  reportes(maintenant: string): Set<string> {
    return new Set((this.db.prepare("SELECT memoire_id FROM reports WHERE jusqu_au > ?").all(maintenant) as { memoire_id: string }[]).map((r) => r.memoire_id));
  }

  /** Sources privées vues par le moteur du Corpus : très privées par défaut, jamais cockpit ni agent. */
  sourcesCorpus(): SourceCorpus[] {
    return this.lister().map((s) => ({
      id: s.id, application: "prive", compartiment: s.compartiment, proprietaire: "Mickaël Thomas", connecteur: s.origine === "note" ? "note" : "fichier-local",
      chemin: `prive/${s.id}`, confidentialite: "mickael_seulement", lecteurs: s.lecteurs, statut: s.statut === "revoque" ? "revoque" : "valide", objet: s.nom, niveau: s.niveau,
    }));
  }
}
