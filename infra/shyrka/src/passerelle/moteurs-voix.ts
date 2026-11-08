import { spawn, type ChildProcess } from "node:child_process";
import { existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

/**
 * Moteurs de voix de Shyrka (mandat « Shyrka English Voice V1 », 9 novembre 2026).
 *
 * Trois moteurs, toujours nommés à l'écran : macOS (voix installées : Aurélie
 * Enhanced en français, Milena en russe…, le moteur des réponses), Chatterbox
 * local (essai, fichiers générés sur le Mac) et Original ElevenLabs (le fichier
 * de référence approuvé ; l'API n'est jamais appelée sans autorisation
 * explicite de Mickaël, et jamais avec un texte du Corpus ou de la mémoire).
 *
 * Les échantillons sont des fichiers locaux, privés, hors du dépôt
 * (`~/oia-shyrka-data/voix/`), joués sur le Mac par `afplay` : seulement sur un
 * clic, coupés par « Couper », par un mot d'arrêt ou par un nouveau tour.
 */

export type MoteurVoix = "macos" | "chatterbox" | "elevenlabs";

export const LIBELLES_MOTEURS: Record<MoteurVoix, string> = {
  macos: "macOS (local)",
  chatterbox: "Chatterbox (local, essai)",
  elevenlabs: "Original ElevenLabs",
};

export interface Echantillon {
  id: string;
  libelle: string;
  moteur: MoteurVoix;
  fichier: string;
  /** Phrase dite, pour l'affichage (aucun contenu privé). */
  texte: string;
}

export const DOSSIER_VOIX = join(homedir(), "oia-shyrka-data", "voix");

/** Échantillons connus ; seuls ceux dont le fichier existe sont proposés. */
export const ECHANTILLONS: Echantillon[] = [
  { id: "elevenlabs", libelle: "Tester Shyrka EN", moteur: "elevenlabs", fichier: "shyrka-en-v1-elevenlabs.mp3", texte: "Fichier de référence approuvé (Shyrka EN V1, voix ElevenLabs Db8EPC5H3DMmzFFWsi1D)." },
  { id: "elevenlabs-variante", libelle: "Variante", moteur: "elevenlabs", fichier: "shyrka-en-v1-elevenlabs-variante.mp3", texte: "Second fichier téléchargé de la même génération ElevenLabs." },
  // Voix PAR DÉFAUT de Chatterbox : le MP3 ElevenLabs n'est pas utilisé comme référence (politique d'usage ElevenLabs, section 12).
  { id: "chatterbox", libelle: "Test local Chatterbox", moteur: "chatterbox", fichier: "shyrka-en-v1-chatterbox.wav", texte: "Voix par défaut de Chatterbox, pas le timbre Shyrka EN : « Good morning. I've reviewed your priorities for today, and I have two suggestions that could make your day easier. »" },
  { id: "elevenlabs-api", libelle: "Nouvelle phrase ElevenLabs (API)", moteur: "elevenlabs", fichier: "shyrka-en-v1-elevenlabs-api-demo.mp3", texte: `Phrase de démonstration générée par l'API ElevenLabs : « ${"Good morning. I've reviewed your priorities for today, and I have two suggestions that could make your day easier."} »` },
];

/** Shyrka EN V1 : voix ElevenLabs choisie par Mickaël. */
export const VOIX_ELEVENLABS = "Db8EPC5H3DMmzFFWsi1D";
/** Seul texte que la passerelle peut envoyer à ElevenLabs sans autorisation propre à chaque réponse : une phrase de démonstration, fixe, non confidentielle. */
export const PHRASE_DEMONSTRATION = "Good morning. I've reviewed your priorities for today, and I have two suggestions that could make your day easier.";
const FICHIER_CLE = join(DOSSIER_VOIX, "elevenlabs-cle");

/**
 * Clé de l'API ElevenLabs : variable d'environnement `ELEVENLABS_API_KEY` de la passerelle, ou fichier privé
 * `~/oia-shyrka-data/voix/elevenlabs-cle` (droits 600) posé par Mickaël. Jamais dans Git ni le navigateur.
 * Absente : ElevenLabs est désactivé (aucun repli silencieux vers le cloud, dans aucun sens).
 */
export function cleElevenLabs(env = process.env, lire: (f: string) => string | null = lireCle): string | null {
  return env.ELEVENLABS_API_KEY?.trim() || lire(FICHIER_CLE);
}
/** Lit le fichier de clé ; refusé s'il est lisible par d'autres que Mickaël. */
export function lireCle(f: string): string | null {
  try {
    const st = statSync(f);
    if ((st.mode & 0o077) !== 0) return null; // fichier lisible par d'autres : refusé
    return readFileSync(f, "utf8").trim() || null;
  } catch {
    return null;
  }
}

/** Génère la phrase de démonstration par l'API officielle (le texte quitte le Mac) ; rend la durée de l'appel. */
export async function genererDemonstrationElevenLabs(cle: string, sortie = join(DOSSIER_VOIX, "shyrka-en-v1-elevenlabs-api-demo.mp3"), appel: typeof fetch = fetch): Promise<{ ms: number; octets: number }> {
  const t0 = Date.now();
  const r = await appel(`https://api.elevenlabs.io/v1/text-to-speech/${VOIX_ELEVENLABS}?output_format=mp3_44100_128`, {
    method: "POST",
    headers: { "xi-api-key": cle, "content-type": "application/json", accept: "audio/mpeg" },
    body: JSON.stringify({ text: PHRASE_DEMONSTRATION, model_id: "eleven_multilingual_v2" }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!r.ok) throw new Error(`ElevenLabs a refusé (HTTP ${r.status})`);
  const octets = new Uint8Array(await r.arrayBuffer());
  writeFileSync(sortie, octets, { mode: 0o600 });
  return { ms: Date.now() - t0, octets: octets.byteLength };
}

export class LecteurEchantillons {
  private lecture: ChildProcess | null = null;
  private enCours: Echantillon | null = null;

  constructor(
    private readonly dossier = DOSSIER_VOIX,
    private readonly lecteur: (fichier: string, volume: number) => ChildProcess = (f, v) => spawn("/usr/bin/afplay", ["-v", String(v), f], { stdio: "ignore" }),
  ) {}

  disponibles(): (Echantillon & { moteurLibelle: string })[] {
    return ECHANTILLONS.filter((e) => existsSync(join(this.dossier, e.fichier))).map((e) => ({ ...e, moteurLibelle: LIBELLES_MOTEURS[e.moteur] }));
  }

  get joue(): Echantillon | null {
    return this.enCours;
  }

  /** Joue un échantillon sur le Mac ; rend une promesse résolue à la fin (ou à l'arrêt). Un seul à la fois. */
  jouer(id: string, volume = 1): { echantillon: Echantillon; fin: Promise<"fini" | "interrompu"> } {
    const e = this.disponibles().find((x) => x.id === id);
    if (!e) throw new Error("échantillon inconnu ou absent du Mac");
    this.arreter();
    const p = this.lecteur(join(this.dossier, e.fichier), Math.min(Math.max(volume, 0.1), 2));
    this.lecture = p;
    this.enCours = e;
    const fin = new Promise<"fini" | "interrompu">((ok) =>
      p.on("exit", (code, signal) => {
        if (this.lecture === p) {
          this.lecture = null;
          this.enCours = null;
        }
        ok(signal || code ? "interrompu" : "fini");
      }),
    );
    return { echantillon: e, fin };
  }

  /** Arrêt immédiat ; vrai si quelque chose jouait. */
  arreter(): boolean {
    const p = this.lecture;
    if (!p) return false;
    this.lecture = null;
    this.enCours = null;
    p.kill("SIGTERM");
    return true;
  }
}
