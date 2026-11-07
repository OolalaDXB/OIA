import { createHash } from "node:crypto";
import { chmodSync, existsSync, lstatSync, mkdirSync, realpathSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

/**
 * Premiere persistance de la memoire personnelle. Aucun appel reseau.
 * La base ne peut se trouver que dans le volume chiffre Shyrka-corpus.
 * Une demande explicite "retiens que" vaut validation de l'utilisateur.
 * Les extractions automatiques restent hors perimetre de cette version.
 */
const VOLUME = "/Volumes/Shyrka-corpus";
const MAX = 1200;
export type Souvenir = { id: string; contenu: string; creeLe: string };

function normaliser(t: string): string {
  return t.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[’']/g, " ").replace(/\s+/g, " ").trim();
}
const empreinte = (t: string) => createHash("sha256").update(normaliser(t)).digest("hex");
const identifiant = (id: number) => "M" + String(id).padStart(4, "0");
const MOTS_IGNORES = new Set(["est", "que", "quoi", "les", "une", "sur", "pour", "dans", "avec", "comment", "sais", "souviens", "moi", "des", "mes", "ton", "quel", "quelle", "rappelle", "dis", "parle", "sujet"]);

export class MemoireLocale {
  private base: DatabaseSync | null = null;
  private prive = false;
  private readonly racine: string;
  private readonly pourTests: boolean;

  constructor(options: { racine?: string; pourTests?: boolean } = {}) {
    this.racine = options.racine ?? VOLUME;
    this.pourTests = options.pourTests === true;
    if (!this.pourTests && this.racine !== VOLUME) throw new Error("Memoire : seul le volume Shyrka-corpus est autorise.");
  }

  get disponible(): boolean {
    return existsSync(this.racine) && lstatSync(this.racine).isDirectory() && !lstatSync(this.racine).isSymbolicLink();
  }

  private ouvrir(): DatabaseSync {
    if (this.prive) throw new Error("Mode prive actif.");
    if (!this.disponible) throw new Error("Le volume chiffre /Volumes/Shyrka-corpus n'est pas monte. Aucun souvenir enregistre.");
    const racine = realpathSync(this.racine);
    if (!this.pourTests && racine !== VOLUME) throw new Error("Point de montage inattendu : acces refuse.");
    if (this.base) return this.base;
    const dossier = join(racine, "valide");
    if (existsSync(dossier) && lstatSync(dossier).isSymbolicLink()) throw new Error("Lien symbolique interdit pour la memoire.");
    mkdirSync(dossier, { recursive: true, mode: 0o700 });
    chmodSync(dossier, 0o700);
    const chemin = join(dossier, "memoire.sqlite");
    if (existsSync(chemin) && lstatSync(chemin).isSymbolicLink()) throw new Error("Lien symbolique interdit pour la base.");
    const db = new DatabaseSync(chemin);
    db.exec("PRAGMA journal_mode = DELETE; PRAGMA secure_delete = ON; PRAGMA busy_timeout = 3000;");
    db.exec("CREATE TABLE IF NOT EXISTS memoires (id INTEGER PRIMARY KEY AUTOINCREMENT, contenu TEXT NOT NULL, hash TEXT NOT NULL UNIQUE, cree_le TEXT NOT NULL); CREATE TABLE IF NOT EXISTS oublis (hash TEXT PRIMARY KEY, oublie_le TEXT NOT NULL);");
    chmodSync(chemin, 0o600);
    this.base = db;
    return db;
  }

  fermer(): void { this.base?.close(); this.base = null; }

  retenir(contenu: string): string {
    if (this.prive) return "Mode prive actif : je ne conserve rien.";
    const texte = contenu.trim().replace(/\s+/g, " ");
    if (!texte || texte.length > MAX) return "Memoire refusee : contenu vide ou trop long (1200 caracteres maximum).";
    if (/\bswift\b/i.test(texte)) return "Memoire refusee : les informations liees a Swift sont exclues.";
    let db: DatabaseSync;
    try { db = this.ouvrir(); } catch (e) { return (e as Error).message; }
    const hash = empreinte(texte);
    if (db.prepare("SELECT 1 FROM oublis WHERE hash=?").get(hash)) return "Cette information a ete oubliee : elle ne peut pas etre reintegree automatiquement.";
    const ancienne = db.prepare("SELECT id FROM memoires WHERE hash=?").get(hash) as { id: number } | undefined;
    if (ancienne) return "Je connais deja cette information sous " + identifiant(ancienne.id) + ".";
    const id = Number(db.prepare("INSERT INTO memoires (contenu, hash, cree_le) VALUES (?, ?, ?)").run(texte, hash, new Date().toISOString()).lastInsertRowid);
    return "C'est retenu localement sous " + identifiant(id) + ". Tu pourras me le redemander apres redemarrage.";
  }

  lister(): Souvenir[] {
    if (this.prive) return [];
    let db: DatabaseSync;
    try { db = this.ouvrir(); } catch { return []; }
    const rows = db.prepare("SELECT id, contenu, cree_le FROM memoires ORDER BY id DESC LIMIT 100").all() as { id: number; contenu: string; cree_le: string }[];
    return rows.map(r => ({ id: identifiant(r.id), contenu: r.contenu, creeLe: r.cree_le }));
  }

  chercher(question: string, limite = 3): Souvenir[] {
    const termes = (normaliser(question).match(/[\p{L}\p{N}]{3,}/gu) ?? []).filter(m => !MOTS_IGNORES.has(m));
    if (this.prive || !termes.length) return [];
    return this.lister().map(s => ({ s, points: termes.filter(t => normaliser(s.contenu).includes(t)).length }))
      .filter(x => x.points > 0).sort((a,b) => b.points - a.points).slice(0, limite).map(x => x.s);
  }

  oublier(id: string): string {
    if (this.prive) return "Mode prive actif : aucune operation de memoire.";
    const m = /^M0*([1-9]\d*)$/i.exec(id.trim());
    if (!m) return "Indique l'identifiant exact, par exemple « oublie M0001 ». Rien n'a ete supprime.";
    let db: DatabaseSync;
    try { db = this.ouvrir(); } catch (e) { return (e as Error).message; }
    const n = Number(m[1]);
    const item = db.prepare("SELECT hash FROM memoires WHERE id=?").get(n) as {hash:string} | undefined;
    if (!item) return "Souvenir introuvable : rien n'a ete supprime.";
    db.exec("BEGIN IMMEDIATE");
    try {
      db.prepare("INSERT OR IGNORE INTO oublis (hash, oublie_le) VALUES (?, ?)").run(item.hash, new Date().toISOString());
      db.prepare("DELETE FROM memoires WHERE id=?").run(n);
      db.exec("COMMIT");
    } catch (e) { db.exec("ROLLBACK"); throw e; }
    return identifiant(n) + " oublie localement. Je ne l'utiliserai plus.";
  }

  /** Exclusivement pour une conversation Ollama locale ; jamais pour Mistral. */
  contextePour(question: string): string {
    const items = this.chercher(question, 3);
    return items.length ? "\n\nSouvenirs personnels valides, locaux, uniquement si pertinents. Cite les identifiants, n'invente rien :\n" + items.map(s => s.id + " : " + s.contenu).join("\n") : "";
  }

  /** Traite les commandes explicites avant tout appel au modele. */
  traiter(phrase: string): string | null {
    const brut = phrase.trim().replace(/^Shyrka[,! ]+/i, "");
    const normal = normaliser(brut);
    if (/^(active|activer) (le )?mode prive$/.test(normal)) {
      this.prive = true; this.fermer(); return "Mode prive actif pour cette session : aucun souvenir lu ou enregistre.";
    }
    if (/^(desactive|desactiver) (le )?mode prive$/.test(normal)) {
      this.prive = false; return "Mode prive desactive pour cette session.";
    }
    const ajout = /^(?:retiens|souviens-toi|rappelle-toi) que\s+(.+)/is.exec(brut);
    if (ajout) return this.retenir(ajout[1]!);
    const oubli = /^(?:oublie|efface|supprime)\s+(M\d+)\s*[.!]?$/i.exec(brut);
    if (oubli) return this.oublier(oubli[1]!);
    if (/^(?:oublie|efface|supprime)\b/i.test(brut)) return "Demande la liste et indique l'identifiant exact M0001. Aucun element supprime.";
    if (/^(?:de quoi (?:te souviens-tu|te souviens tu)|qu as tu retenu|liste (?:mes |tes )?souvenirs)/.test(normal)) {
      if (this.prive) return "Mode prive : aucun souvenir consulte.";
      if (!this.disponible) return "Volume Shyrka-corpus absent : aucun souvenir accessible.";
      const items = this.lister();
      return items.length ? "Souvenirs valides :\n" + items.slice(0,8).map(s => s.id + " : " + s.contenu).join("\n") + (items.length > 8 ? "\nD'autres souvenirs sont disponibles." : "") : "Aucun souvenir valide pour le moment.";
    }
    const q = /^(?:que sais-tu de|rappelle-moi|tu te souviens de|qu est ce que tu sais de)\s+(.+)/.exec(normal);
    if (q) {
      if (this.prive) return "Mode prive : aucun souvenir consulte.";
      if (!this.disponible) return "Volume Shyrka-corpus absent : aucun souvenir accessible.";
      const items = this.chercher(q[1]!, 5);
      return items.length ? items.map(s => s.id + " : " + s.contenu).join("\n") : "Je n'ai pas de souvenir valide correspondant.";
    }
    return null;
  }
}
