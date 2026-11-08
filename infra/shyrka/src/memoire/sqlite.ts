import { randomUUID } from "node:crypto";
import { chmodSync, existsSync, lstatSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { DatabaseSync as TypeBase } from "node:sqlite";
import {
  ChangementSchema, empreinteContenu, empreinteId, motifExclusion, NIVEAUX, NouvelElementSchema, peutLire, provenance, RefusMemoire, restrictionsPour, type Niveau,
  type Acteur, type Changement, type Demandeur, type ElementMemoire, type ExportMemoire, type Memoire, type NouvelElement, type Requete, type Resultat,
} from "@oia/shyrka-noyau";
import type { DossierVerifie } from "./volume.js";

/**
 * Stockage local de la mémoire (ADR 0004, § 2 ; mandat v10, A2) : SQLite dans
 * le volume chiffré, recherche plein texte FTS5.
 *
 * - Une ligne par version ; une seule version « actuelle » par identifiant.
 * - L'index FTS ne contient que les versions actuelles et non retirées.
 * - Oublier supprime toutes les versions, les dérivés et leurs index, et
 *   inscrit des empreintes (jamais le contenu) qui empêchent tout retour,
 *   y compris par restauration d'une sauvegarde.
 * - Chaque écriture est une transaction ; on ne répond « retenu » qu'après
 *   COMMIT.
 * - Base illisible : erreur explicite, jamais recréée vide en silence. Un
 *   témoin à côté de la base signale qu'une base a existé : s'il est là et la
 *   base absente, on refuse.
 */

import { DatabaseSync } from "../node-sqlite.js";
type DatabaseSync = TypeBase;

const SCHEMA = 1;
const FICHIER = "memoire.sqlite";
const TEMOIN = "memoire.temoin";

type Ligne = {
  id: string; version: number; actuelle: number; compartiment: string; forme: string; contenu: string; details: string; voie: string; source_ref: string;
  affirme_ia: number; date: string; valide_le: string | null; statut: string; emplacement: string; portee: string; remplace: number | null; derive_de: string;
  restrictions: string; motif_retrait: string | null;
};

const versElement = (l: Ligne): ElementMemoire => ({
  id: l.id,
  compartiment: l.compartiment,
  forme: l.forme as ElementMemoire["forme"],
  contenu: l.contenu,
  details: JSON.parse(l.details) as Record<string, string>,
  source: { voie: l.voie as ElementMemoire["source"]["voie"], ref: l.source_ref, ...(l.affirme_ia ? { affirmeParIA: true } : {}) },
  date: l.date,
  valideLe: l.valide_le,
  statut: l.statut as ElementMemoire["statut"],
  emplacement: l.emplacement as ElementMemoire["emplacement"],
  portee: l.portee as ElementMemoire["portee"],
  version: l.version,
  remplace: l.remplace,
  deriveDe: JSON.parse(l.derive_de) as string[],
  restrictions: JSON.parse(l.restrictions) as string[],
});

/** Requête FTS5 sûre : mots seulement, chacun entre guillemets, réunis par OR. */
function requeteFts(texte: string): string | null {
  const mots = [...new Set(texte.toLowerCase().normalize("NFC").match(/[\p{L}\p{N}]{3,}/gu) ?? [])].filter((m) => !VIDES.has(m.normalize("NFD").replace(/[̀-ͯ]/g, "")));
  return mots.length ? mots.map((m) => `"${m.replace(/"/g, "")}"`).join(" OR ") : null;
}
const VIDES = new Set([
  "les", "des", "une", "que", "qui", "quoi", "est", "pour", "dans", "avec", "sur", "pas", "mes", "tes", "ses", "aux", "par", "mais", "donc", "cette", "ces", "son", "sont",
  "avais", "avait", "decide", "souviens", "rappelle", "sais", "quel", "quelle", "quels", "quelles", "comment", "moi", "toi", "tout", "fait", "faire", "projet",
]);

/** Vrai pour tout lien symbolique, y compris pendant (existsSync suit le lien). */
function estLien(p: string): boolean {
  try {
    return lstatSync(p).isSymbolicLink();
  } catch {
    return false;
  }
}

export interface OptionsMemoireLocale {
  horloge?: () => string;
}

export class MemoireLocale implements Memoire {
  private db: DatabaseSync;
  private readonly horloge: () => string;
  readonly chemin: string;

  constructor(dossier: DossierVerifie, opts: OptionsMemoireLocale = {}) {
    this.horloge = opts.horloge ?? (() => new Date().toISOString());
    if (estLien(dossier.chemin)) throw new RefusMemoire("Lien symbolique refusé pour la mémoire.", "stockage_indisponible");
    mkdirSync(dossier.chemin, { recursive: true, mode: 0o700 });
    if (estLien(dossier.chemin)) throw new RefusMemoire("Lien symbolique refusé pour la mémoire.", "stockage_indisponible");
    chmodSync(dossier.chemin, 0o700);
    this.chemin = join(dossier.chemin, FICHIER);
    const temoin = join(dossier.chemin, TEMOIN);
    if (estLien(this.chemin)) throw new RefusMemoire("Lien symbolique refusé pour la base.", "stockage_indisponible");
    const existait = existsSync(this.chemin);
    if (!existait && existsSync(temoin)) {
      throw new RefusMemoire(
        `Base de mémoire absente alors qu'elle a existé (témoin ${TEMOIN}, créé le ${readFileSync(temoin, "utf8").trim()}). Je ne recrée pas une base vide : restaurer une sauvegarde, ou supprimer le témoin sciemment.`,
        "stockage_corrompu",
      );
    }
    try {
      this.db = new DatabaseSync(this.chemin);
      this.db.exec("PRAGMA busy_timeout = 5000; PRAGMA journal_mode = DELETE; PRAGMA secure_delete = ON; PRAGMA foreign_keys = ON;");
      if (existait) {
        const ok = (this.db.prepare("PRAGMA quick_check").get() as { quick_check: string }).quick_check;
        if (ok !== "ok") throw new Error(`contrôle d'intégrité : ${ok}`);
        const v = this.db.prepare("SELECT valeur FROM meta WHERE cle = 'schema'").get() as { valeur: string } | undefined;
        if (!v) throw new Error("table meta absente : ce n'est pas une base de mémoire de Shyrka");
        if (Number(v.valeur) !== SCHEMA) throw new Error(`schéma ${v.valeur} inattendu (attendu ${SCHEMA})`);
      } else this.creer();
    } catch (e) {
      if (e instanceof RefusMemoire) throw e;
      throw new RefusMemoire(`Base de mémoire illisible (${(e as Error).message}). Rien n'est recréé ; aucune donnée n'a été écrite.`, "stockage_corrompu");
    }
    chmodSync(this.chemin, 0o600);
    if (!existsSync(temoin)) {
      writeFileSync(temoin, `${this.horloge()}\n`, { mode: 0o600 });
    }
  }

  private creer(): void {
    this.db.exec(`
      BEGIN;
      CREATE TABLE meta (cle TEXT PRIMARY KEY, valeur TEXT NOT NULL);
      INSERT INTO meta VALUES ('schema', '${SCHEMA}');
      CREATE TABLE versions (
        id TEXT NOT NULL, version INTEGER NOT NULL, actuelle INTEGER NOT NULL CHECK (actuelle IN (0,1)),
        compartiment TEXT NOT NULL, forme TEXT NOT NULL, contenu TEXT NOT NULL, details TEXT NOT NULL,
        voie TEXT NOT NULL, source_ref TEXT NOT NULL, affirme_ia INTEGER NOT NULL DEFAULT 0,
        date TEXT NOT NULL, valide_le TEXT, statut TEXT NOT NULL, emplacement TEXT NOT NULL, portee TEXT NOT NULL,
        remplace INTEGER, derive_de TEXT NOT NULL, restrictions TEXT NOT NULL, motif_retrait TEXT,
        PRIMARY KEY (id, version)
      );
      CREATE UNIQUE INDEX versions_actuelle ON versions (id) WHERE actuelle = 1;
      CREATE TABLE derives (enfant TEXT NOT NULL, parent TEXT NOT NULL, PRIMARY KEY (enfant, parent));
      CREATE INDEX derives_parent ON derives (parent);
      CREATE VIRTUAL TABLE recherche USING fts5(contenu, details, id UNINDEXED, tokenize = 'unicode61 remove_diacritics 2');
      CREATE TABLE oublis (empreinte TEXT PRIMARY KEY, le TEXT NOT NULL);
      CREATE TABLE journal (n INTEGER PRIMARY KEY AUTOINCREMENT, le TEXT NOT NULL, acteur TEXT NOT NULL, quoi TEXT NOT NULL, cible TEXT);
      COMMIT;`);
  }

  fermer(): void {
    if (this.db.isOpen) this.db.close();
  }

  private tx<T>(f: () => T): T {
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

  private noter(par: Acteur, quoi: string, cible: string | null): void {
    // Le journal ne garde jamais de contenu ; la cible est une empreinte courte.
    const acteur = par.type === "mickael" ? `mickael:${par.via}` : par.type === "shyrka" ? "shyrka" : `${par.type}:${par.id}`;
    this.db.prepare("INSERT INTO journal (le, acteur, quoi, cible) VALUES (?, ?, ?, ?)").run(this.horloge(), acteur, quoi, cible ? empreinteId(cible).slice(0, 12) : null);
  }

  private actuelle(id: string): Ligne | undefined {
    return this.db.prepare("SELECT * FROM versions WHERE id = ? AND actuelle = 1").get(id) as Ligne | undefined;
  }

  /** Résout un identifiant complet ou un préfixe d'au moins 6 caractères. */
  resoudre(ref: string): string {
    const r = ref.trim().toLowerCase();
    if (!/^[0-9a-f-]{6,36}$/.test(r)) throw new RefusMemoire("référence de souvenir invalide", "introuvable");
    const ids = (this.db.prepare("SELECT DISTINCT id FROM versions WHERE id LIKE ? LIMIT 3").all(`${r}%`) as { id: string }[]).map((x) => x.id);
    if (ids.length === 0) throw new RefusMemoire("souvenir introuvable", "introuvable");
    if (ids.length > 1) throw new RefusMemoire("référence ambiguë : préciser davantage de caractères", "ambigu");
    return ids[0]!;
  }

  private exiger(id: string): Ligne {
    const l = this.actuelle(id);
    if (!l) throw new RefusMemoire("souvenir introuvable", "introuvable");
    return l;
  }

  private estOublie(id: string | null, compartiment: string, contenu: string): boolean {
    const q = this.db.prepare("SELECT 1 FROM oublis WHERE empreinte = ?");
    return Boolean((id && q.get(empreinteId(id))) || q.get(empreinteContenu(compartiment, contenu)));
  }

  private indexer(l: Pick<Ligne, "id" | "contenu" | "details">): void {
    this.db.prepare("INSERT INTO recherche (contenu, details, id) VALUES (?, ?, ?)").run(l.contenu, Object.values(JSON.parse(l.details) as Record<string, string>).join(" "), l.id);
  }
  private desindexer(id: string): void {
    this.db.prepare("DELETE FROM recherche WHERE id = ?").run(id);
  }

  enregistrer(element: NouvelElement, par: Acteur): ElementMemoire {
    const p = NouvelElementSchema.safeParse(element);
    if (!p.success) throw new RefusMemoire(`élément refusé : ${p.error.issues.map((i) => `${i.path.join(".")} ${i.message}`).join(", ")}`, "valeur_refusee");
    const e = p.data;
    const exclu = motifExclusion(`${e.contenu}\n${Object.values(e.details).join("\n")}`);
    if (exclu) throw new RefusMemoire(`refusé à l'entrée : ${exclu}`, "exclu");
    // ADR § 4 : l'instruction vaut validation seulement si elle vient de Mickaël ; une IA ne valide jamais.
    if (e.source.voie === "instruction" && par.type !== "mickael") throw new RefusMemoire("seule une instruction de Mickaël est une instruction", "non_autorise");
    if (e.portee === "cockpit" && par.type !== "mickael") throw new RefusMemoire("la portée cockpit est une décision de Mickaël", "non_autorise");
    return this.tx(() => {
      if (this.estOublie(null, e.compartiment, e.contenu)) throw new RefusMemoire("cet élément a été oublié : il ne revient que sur une nouvelle instruction explicite de Mickaël", "oublie");
      const doublon = this.db.prepare("SELECT id FROM versions v WHERE actuelle = 1 AND compartiment = ? AND statut != 'retire'").all(e.compartiment) as { id: string }[];
      for (const d of doublon) {
        const l = this.actuelle(d.id)!;
        if (empreinteContenu(l.compartiment, l.contenu) === empreinteContenu(e.compartiment, e.contenu)) throw new RefusMemoire(`déjà retenu (${d.id.slice(0, 8)})`, "doublon");
      }
      for (const parent of e.deriveDe) this.exiger(parent);
      const statut = e.source.voie === "instruction" ? "valide" : e.source.voie === "observation" ? "observe" : "a_confirmer";
      const maintenant = this.horloge();
      // Un dérivé hérite des restrictions de toutes ses sources.
      const restrictions = new Set(e.restrictions);
      let portee = e.portee;
      for (const parent of e.deriveDe) {
        const pl = this.actuelle(parent)!;
        for (const r of JSON.parse(pl.restrictions) as string[]) restrictions.add(r);
        if (pl.portee === "local_seulement") portee = "local_seulement";
      }
      // ADR § 2 : la portée cockpit vivrait dans la base OIA. `shy_contexte` ne sait pas encore porter ces
      // champs (migration à relire, non appliquée) : l'élément reste sur le Mac, emplacement déclaré.
      const ligne: Ligne = {
        id: randomUUID(), version: 1, actuelle: 1, compartiment: e.compartiment, forme: e.forme, contenu: e.contenu.trim(), details: JSON.stringify(e.details),
        voie: e.source.voie, source_ref: e.source.ref, affirme_ia: e.source.affirmeParIA ? 1 : 0, date: e.date ?? maintenant, valide_le: statut === "valide" ? maintenant : null,
        statut, emplacement: "mac", portee, remplace: null, derive_de: JSON.stringify(e.deriveDe), restrictions: JSON.stringify([...restrictions]), motif_retrait: null,
      };
      this.inserer(ligne);
      for (const parent of e.deriveDe) this.db.prepare("INSERT OR IGNORE INTO derives VALUES (?, ?)").run(ligne.id, parent);
      this.indexer(ligne);
      this.noter(par, "enregistrer", ligne.id);
      return versElement(ligne);
    });
  }

  private inserer(l: Ligne): void {
    this.db
      .prepare(
        `INSERT INTO versions (id, version, actuelle, compartiment, forme, contenu, details, voie, source_ref, affirme_ia, date, valide_le, statut, emplacement, portee, remplace, derive_de, restrictions, motif_retrait)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(l.id, l.version, l.actuelle, l.compartiment, l.forme, l.contenu, l.details, l.voie, l.source_ref, l.affirme_ia, l.date, l.valide_le, l.statut, l.emplacement, l.portee, l.remplace, l.derive_de, l.restrictions, l.motif_retrait);
  }

  retrouver(requete: Requete, pour: Demandeur): Resultat[] {
    const limite = Math.min(Math.max(requete.limite ?? 10, 1), 100);
    const apres = Math.max(requete.apres ?? 0, 0);
    let lignes: Ligne[];
    const fts = requete.texte ? requeteFts(requete.texte) : null;
    if (requete.texte && !fts) return [];
    if (fts) {
      lignes = this.db
        .prepare("SELECT v.* FROM recherche r JOIN versions v ON v.id = r.id AND v.actuelle = 1 WHERE recherche MATCH ? ORDER BY bm25(recherche), v.date DESC")
        .all(fts) as Ligne[];
    } else {
      lignes = this.db.prepare("SELECT * FROM versions WHERE actuelle = 1 ORDER BY date DESC, id").all() as Ligne[];
    }
    const comp = requete.compartiment;
    const filtres = lignes
      .filter((l) => !comp || l.compartiment === comp || (comp === "projet:*" && l.compartiment.startsWith("projet:")))
      .filter((l) => !requete.statuts || requete.statuts.includes(l.statut as ElementMemoire["statut"]))
      .filter((l) => !requete.formes || requete.formes.includes(l.forme as ElementMemoire["forme"]))
      .filter((l) => (pour.type === "mickael" ? true : l.statut !== "retire"))
      .filter((l) => this.lisible(l, pour, new Set()));
    return filtres.slice(apres, apres + limite).map((l) => {
      const el = versElement(l);
      return { element: el, provenance: provenance(el), extrait: el.contenu.length > 240 ? `${el.contenu.slice(0, 237)}…` : el.contenu };
    });
  }

  /** Droits du noyau, plus : un dérivé n'est visible que si toutes ses sources le sont. */
  private lisible(l: Ligne, pour: Demandeur, vus: Set<string>): boolean {
    if (!peutLire({ statut: l.statut as ElementMemoire["statut"], portee: l.portee as ElementMemoire["portee"], compartiment: l.compartiment, restrictions: JSON.parse(l.restrictions) as string[] }, pour)) return false;
    if (vus.has(l.id)) return false;
    vus.add(l.id);
    for (const parent of JSON.parse(l.derive_de) as string[]) {
      const pl = this.actuelle(parent);
      if (!pl || !this.lisible(pl, pour, vus)) return false;
    }
    return true;
  }

  /** Toutes les versions d'un élément, pour Mickaël seulement (historique, « remplacée par »). */
  historique(id: string): ElementMemoire[] {
    return (this.db.prepare("SELECT * FROM versions WHERE id = ? ORDER BY version").all(id) as Ligne[]).map(versElement);
  }

  corriger(id: string, changement: Changement, par: Acteur): ElementMemoire {
    const c = ChangementSchema.safeParse(changement);
    if (!c.success) throw new RefusMemoire(`correction refusée : ${c.error.issues.map((i) => i.message).join(", ")}`, "valeur_refusee");
    if (par.type !== "mickael") throw new RefusMemoire("seul Mickaël corrige un souvenir", "non_autorise");
    const ch = c.data;
    return this.tx(() => {
      const ancienne = this.exiger(id);
      const contenu = ch.contenu ?? ancienne.contenu;
      const details = ch.details ? JSON.stringify(ch.details) : ancienne.details;
      const exclu = motifExclusion(`${contenu}\n${Object.values(JSON.parse(details) as Record<string, string>).join("\n")}`);
      if (exclu) throw new RefusMemoire(`refusé : ${exclu}`, "exclu");
      const compartiment = ch.compartiment ?? ancienne.compartiment;
      if (this.estOublie(null, compartiment, contenu)) throw new RefusMemoire("ce contenu a été oublié", "oublie");
      const maintenant = this.horloge();
      const nouvelle: Ligne = {
        ...ancienne, version: ancienne.version + 1, actuelle: 1, contenu, details, compartiment, forme: ch.forme ?? ancienne.forme, portee: ch.portee ?? ancienne.portee,
        remplace: ancienne.version, date: ancienne.date, statut: ancienne.statut === "retire" ? "retire" : "valide", valide_le: maintenant,
        voie: ancienne.voie, source_ref: `${ancienne.source_ref} ; corrigé par Mickaël le ${maintenant.slice(0, 16)}`,
      };
      this.db.prepare("UPDATE versions SET actuelle = 0 WHERE id = ? AND actuelle = 1").run(id);
      this.inserer(nouvelle);
      // Les index et les dérivés de l'ancienne version disparaissent avec elle (ADR § 6).
      this.desindexer(id);
      if (nouvelle.statut !== "retire") this.indexer(nouvelle);
      const derives = this.descendants(id);
      derives.delete(id);
      for (const d of derives) this.effacer(d);
      this.noter(par, `corriger v${nouvelle.version}${derives.size ? `, ${derives.size} dérivé(s) effacé(s)` : ""}`, id);
      return versElement(nouvelle);
    });
  }

  /**
   * Niveau de confidentialité d'un élément (Mickaël seulement) : métadonnée de la version actuelle,
   * changée sur place et notée au journal ; le contenu ne change pas.
   */
  fixerNiveau(id: string, niveau: Niveau, par: Acteur): ElementMemoire {
    if (par.type !== "mickael") throw new RefusMemoire("seul Mickaël fixe le niveau d'un souvenir", "non_autorise");
    if (!NIVEAUX.includes(niveau)) throw new RefusMemoire("niveau inconnu", "valeur_refusee");
    return this.tx(() => {
      const l = this.exiger(id);
      const restrictions = JSON.stringify(restrictionsPour(JSON.parse(l.restrictions) as string[], niveau));
      this.db.prepare("UPDATE versions SET restrictions = ? WHERE id = ? AND actuelle = 1").run(restrictions, id);
      this.noter(par, `niveau ${niveau}`, id);
      return versElement({ ...l, restrictions });
    });
  }

  /** Ajoute des détails à la version actuelle (ex. « source retirée le … »), sans changer le contenu ni le statut. */
  annoter(id: string, details: Record<string, string>, par: Acteur): ElementMemoire {
    if (par.type !== "mickael") throw new RefusMemoire("seul Mickaël annote un souvenir", "non_autorise");
    return this.tx(() => {
      const l = this.exiger(id);
      const d = JSON.stringify({ ...(JSON.parse(l.details) as Record<string, string>), ...details });
      this.db.prepare("UPDATE versions SET details = ? WHERE id = ? AND actuelle = 1").run(d, id);
      this.noter(par, `annoter ${Object.keys(details).join(", ")}`, id);
      return versElement({ ...l, details: d });
    });
  }

  /** Les faits très privés sans niveau passent en « personnel » (décision du 9 novembre 2026). Idempotent ; rend le nombre de faits étiquetés. */
  migrerNiveaux(par: Acteur): number {
    const a = (this.db.prepare("SELECT id, restrictions FROM versions WHERE actuelle = 1").all() as { id: string; restrictions: string }[]).filter((l) => {
      const r = JSON.parse(l.restrictions) as string[];
      return r.includes("mickael_seulement") && !r.some((x) => x.startsWith("niveau:"));
    });
    for (const l of a) this.fixerNiveau(l.id, "personnel", par);
    return a.length;
  }

  retirer(id: string, motif: string, par: Acteur): void {
    if (par.type !== "mickael") throw new RefusMemoire("seul Mickaël retire un souvenir", "non_autorise");
    this.tx(() => {
      this.exiger(id);
      this.db.prepare("UPDATE versions SET statut = 'retire', motif_retrait = ? WHERE id = ? AND actuelle = 1").run(motif.slice(0, 200), id);
      this.desindexer(id);
      this.noter(par, "retirer", id);
    });
  }

  private descendants(id: string): Set<string> {
    const out = new Set([id]);
    const pile = [id];
    while (pile.length) {
      const p = pile.pop()!;
      for (const { enfant } of this.db.prepare("SELECT enfant FROM derives WHERE parent = ?").all(p) as { enfant: string }[]) {
        if (!out.has(enfant)) out.add(enfant), pile.push(enfant);
      }
    }
    return out;
  }

  /** Efface physiquement toutes les versions et index d'un élément, inscrit ses empreintes. */
  private effacer(id: string): void {
    const versions = this.db.prepare("SELECT compartiment, contenu FROM versions WHERE id = ?").all(id) as { compartiment: string; contenu: string }[];
    const le = this.horloge();
    const ins = this.db.prepare("INSERT OR IGNORE INTO oublis (empreinte, le) VALUES (?, ?)");
    ins.run(empreinteId(id), le);
    for (const v of versions) ins.run(empreinteContenu(v.compartiment, v.contenu), le);
    this.desindexer(id);
    this.db.prepare("DELETE FROM versions WHERE id = ?").run(id);
    this.db.prepare("DELETE FROM derives WHERE enfant = ? OR parent = ?").run(id, id);
  }

  oublier(id: string, par: Acteur): { oublies: number } {
    if (par.type !== "mickael") throw new RefusMemoire("seul Mickaël fait oublier", "non_autorise");
    const n = this.tx(() => {
      if (!this.db.prepare("SELECT 1 FROM versions WHERE id = ?").get(id)) throw new RefusMemoire("souvenir introuvable", "introuvable");
      const tous = this.descendants(id);
      for (const x of tous) this.effacer(x);
      this.noter(par, `oublier (${tous.size})`, id);
      return tous.size;
    });
    // FTS5 garde des segments ; on les réécrit pour ne pas laisser de trace de l'index oublié.
    this.db.exec("INSERT INTO recherche(recherche) VALUES ('optimize')");
    return { oublies: n };
  }

  /**
   * Mickaël redemande explicitement de retenir un contenu oublié : l'empreinte
   * de contenu est levée, et seulement elle (ADR 0004, « nouvelle instruction »).
   */
  reapprendre(compartiment: string, contenu: string, par: Acteur): void {
    if (par.type !== "mickael") throw new RefusMemoire("seule une instruction explicite de Mickaël lève un oubli", "non_autorise");
    this.tx(() => {
      this.db.prepare("DELETE FROM oublis WHERE empreinte = ?").run(empreinteContenu(compartiment, contenu));
      this.noter(par, "reapprendre", null);
    });
  }

  exporter(par: Acteur): ExportMemoire {
    if (par.type !== "mickael") throw new RefusMemoire("seul Mickaël exporte la mémoire", "non_autorise");
    const elements = (this.db.prepare("SELECT * FROM versions ORDER BY id, version").all() as Ligne[]).map(versElement);
    const oublis = (this.db.prepare("SELECT empreinte FROM oublis ORDER BY empreinte").all() as { empreinte: string }[]).map((o) => o.empreinte);
    this.noter(par, "exporter", null);
    return { format: "shyrka.memoire.export", version: 1, exporteLe: this.horloge(), elements, oublis };
  }

  /**
   * Restauration d'un export ou d'une sauvegarde : le registre des oublis
   * ACTUEL est rejoué avant d'insérer quoi que ce soit (ADR § 6), et les
   * empreintes de l'export s'y ajoutent.
   */
  restaurer(s: ExportMemoire, par: Acteur): { restaures: number; ecartes: number } {
    if (par.type !== "mickael") throw new RefusMemoire("seul Mickaël restaure", "non_autorise");
    if (s.format !== "shyrka.memoire.export" || s.version !== 1) throw new RefusMemoire("format de sauvegarde inconnu", "valeur_refusee");
    return this.tx(() => {
      const le = this.horloge();
      for (const o of s.oublis) if (/^[0-9a-f]{64}$/.test(o)) this.db.prepare("INSERT OR IGNORE INTO oublis (empreinte, le) VALUES (?, ?)").run(o, le);
      let restaures = 0;
      let ecartes = 0;
      for (const e of s.elements) {
        if (this.estOublie(e.id, e.compartiment, e.contenu) || motifExclusion(e.contenu)) {
          ecartes++;
          continue;
        }
        if (this.db.prepare("SELECT 1 FROM versions WHERE id = ? AND version = ?").get(e.id, e.version)) continue;
        const actuelleExistante = this.actuelle(e.id);
        // La version restaurée n'est actuelle que si elle est plus récente que ce qui est là.
        const actuelle = !actuelleExistante || actuelleExistante.version < e.version ? 1 : 0;
        if (actuelle && actuelleExistante) {
          this.db.prepare("UPDATE versions SET actuelle = 0 WHERE id = ? AND actuelle = 1").run(e.id);
          this.desindexer(e.id);
        }
        const l: Ligne = {
          id: e.id, version: e.version, actuelle, compartiment: e.compartiment, forme: e.forme, contenu: e.contenu, details: JSON.stringify(e.details), voie: e.source.voie,
          source_ref: e.source.ref, affirme_ia: e.source.affirmeParIA ? 1 : 0, date: e.date, valide_le: e.valideLe, statut: e.statut, emplacement: e.emplacement, portee: e.portee,
          remplace: e.remplace, derive_de: JSON.stringify(e.deriveDe), restrictions: JSON.stringify(e.restrictions), motif_retrait: null,
        };
        this.inserer(l);
        for (const parent of e.deriveDe) this.db.prepare("INSERT OR IGNORE INTO derives VALUES (?, ?)").run(e.id, parent);
        if (actuelle && l.statut !== "retire") this.indexer(l);
        restaures++;
      }
      // Les versions anciennes restaurées ne doivent pas reprendre la main sur une version actuelle.
      this.noter(par, `restaurer (${restaures} restauré(s), ${ecartes} écarté(s))`, null);
      return { restaures, ecartes };
    });
  }

  /** Nombre de lignes par table, pour `doctor` et la recette. Aucun contenu. */
  comptes(): { elements: number; versions: number; oublis: number; index: number } {
    const n = (sql: string) => (this.db.prepare(sql).get() as { n: number }).n;
    return {
      elements: n("SELECT count(*) n FROM versions WHERE actuelle = 1"),
      versions: n("SELECT count(*) n FROM versions"),
      oublis: n("SELECT count(*) n FROM oublis"),
      index: n("SELECT count(*) n FROM recherche"),
    };
  }
}
