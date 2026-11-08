import { createHash } from "node:crypto";
import { lstatSync, mkdirSync, readdirSync, readFileSync, realpathSync, rmSync } from "node:fs";
import { join } from "node:path";

/**
 * Dossier « Déposer dans Shyrka » (mandat Corpus local, connecteur 3), sur le
 * volume chiffré monté. Désactivé par défaut ; activé, mis en pause ou arrêté
 * par un bouton ; jamais lancé au démarrage de la session.
 *
 * Une détection n'est qu'une PROPOSITION d'import : le fichier attend dans le
 * dossier jusqu'à ce que Mickaël l'examine et le confirme dans le module
 * Corpus. Ignorés : fichiers cachés ou temporaires, sous-dossiers, liens
 * symboliques, fichiers encore en cours de copie (taille ou date qui bougent).
 * Aucun son, aucune voix : l'interface affiche « N fichiers à examiner ».
 */

export const NOM_DOSSIER = "Déposer dans Shyrka";
const STABLE_MS = 2_000;
const TEMPORAIRES = /^(\.|~\$)|\.(part|crdownload|download|tmp|icloud)$/i;

export interface FichierDetecte {
  id: string;
  nom: string;
  taille: number;
  detecteLe: string;
}

export type EtatSurveillance = "arretee" | "active" | "pause" | "volume_absent";

export class Surveillance {
  private etatCourant: EtatSurveillance = "arretee";
  private minuterie: ReturnType<typeof setInterval> | null = null;
  private vus = new Map<string, { taille: number; mtime: number; depuis: number }>();
  private prets = new Map<string, FichierDetecte & { chemin: string }>();

  constructor(
    private readonly racine: () => string | null,
    private readonly opts: { intervalleMs?: number; horloge?: () => number; auChangement?: (n: number) => void } = {},
  ) {}

  get etat(): EtatSurveillance {
    return this.etatCourant;
  }

  get dossier(): string | null {
    const r = this.racine();
    return r ? join(r, NOM_DOSSIER) : null;
  }

  activer(): EtatSurveillance {
    const d = this.dossier;
    if (!d) return (this.etatCourant = "volume_absent");
    mkdirSync(d, { recursive: true, mode: 0o700 });
    this.etatCourant = "active";
    if (!this.minuterie) this.minuterie = setInterval(() => this.balayer(), this.opts.intervalleMs ?? 3_000);
    this.balayer();
    return this.etatCourant;
  }

  pause(): EtatSurveillance {
    if (this.etatCourant === "active") this.etatCourant = "pause";
    return this.etatCourant;
  }

  /** Arrêt immédiat : plus aucun balayage, liste vidée (les fichiers restent dans le dossier). */
  arreter(): EtatSurveillance {
    if (this.minuterie) clearInterval(this.minuterie);
    this.minuterie = null;
    this.vus.clear();
    this.prets.clear();
    this.etatCourant = "arretee";
    return this.etatCourant;
  }

  aExaminer(): FichierDetecte[] {
    return [...this.prets.values()].map(({ chemin: _c, ...f }) => f);
  }

  /** Un balayage ; public pour les tests. Volume démonté : arrêt propre, aucun repli ailleurs. */
  balayer(): void {
    if (this.etatCourant !== "active") return;
    const d = this.dossier;
    if (!d) {
      this.arreter();
      this.etatCourant = "volume_absent";
      return;
    }
    const maintenant = (this.opts.horloge ?? Date.now)();
    let reel: string;
    try {
      reel = realpathSync(d);
    } catch {
      return;
    }
    const presents = new Set<string>();
    for (const nom of readdirSync(reel)) {
      if (TEMPORAIRES.test(nom)) continue;
      const chemin = join(reel, nom);
      let st;
      try {
        st = lstatSync(chemin);
      } catch {
        continue;
      }
      if (!st.isFile() || st.isSymbolicLink()) continue;
      presents.add(chemin);
      const avant = this.vus.get(chemin);
      if (!avant || avant.taille !== st.size || avant.mtime !== st.mtimeMs) {
        this.vus.set(chemin, { taille: st.size, mtime: st.mtimeMs, depuis: maintenant });
        this.prets.delete(this.idDe(chemin));
        continue;
      }
      if (maintenant - avant.depuis >= STABLE_MS && maintenant - st.mtimeMs >= STABLE_MS) {
        const id = this.idDe(chemin);
        if (!this.prets.has(id)) this.prets.set(id, { id, nom, taille: st.size, detecteLe: new Date(maintenant).toISOString(), chemin });
      }
    }
    for (const c of [...this.vus.keys()]) if (!presents.has(c)) this.vus.delete(c);
    for (const [id, f] of [...this.prets]) if (!presents.has(f.chemin)) this.prets.delete(id);
    this.opts.auChangement?.(this.prets.size);
  }

  private idDe(chemin: string): string {
    return `f-${createHash("sha256").update(chemin).digest("hex").slice(0, 16)}`;
  }

  /** Lit un fichier détecté (par son identifiant opaque, jamais par un chemin venu du navigateur). */
  lire(id: string): { nom: string; octets: Uint8Array } {
    const f = this.prets.get(id);
    if (!f) throw new Error("fichier inconnu ou plus dans le dossier");
    const d = realpathSync(this.dossier!);
    if (realpathSync(f.chemin) !== join(d, f.nom) || lstatSync(f.chemin).isSymbolicLink()) throw new Error("chemin hors du dossier de dépôt");
    return { nom: f.nom, octets: readFileSync(f.chemin) };
  }

  /** Retire le fichier du dossier de dépôt (après import, ou refus confirmé par Mickaël). */
  effacer(id: string): void {
    const f = this.prets.get(id);
    if (!f) return;
    rmSync(f.chemin, { force: true });
    this.prets.delete(id);
    this.vus.delete(f.chemin);
  }
}
