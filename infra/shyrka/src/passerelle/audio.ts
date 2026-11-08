import { normaliserTexte } from "@oia/shyrka-noyau";

/**
 * Parole réelle ou silence, avant et après Whisper (issue #11, axe C).
 *
 * Observé sur ce Mac (whisper.cpp, large-v3-turbo, 8 novembre 2026) : une prise
 * de silence est transcrite « Sous-titrage Société Radio-Canada », un léger
 * souffle rend le texte de l'invite de vocabulaire (« Noms : Mickaël, … »), et
 * `no_speech_prob` vaut 0 dans les deux cas. Une liste noire ne suffit donc
 * pas : la prise est d'abord mesurée (énergie par trames de 30 ms, plancher de
 * bruit), et Whisper n'est appelé que s'il y a assez de parole. Après Whisper,
 * une transcription qui reprend l'invite, ou une phrase de sous-titrage connue
 * sur une prise pauvre en parole, est déclarée douteuse : elle s'affiche,
 * signalée, et n'est jamais envoyée sans que Mickaël la valide.
 */

export interface AnalyseParole {
  dureeMs: number;
  /** Durée des trames nettement au-dessus du plancher de bruit. */
  paroleMs: number;
  /** Niveau RMS de la trame la plus forte, en dBFS. */
  creteDb: number;
  /** Plancher de bruit (10ᵉ centile des trames), en dBFS. */
  plancherDb: number;
}

const TRAME_MS = 30;
/** Parole : au moins ce niveau absolu, et ce nombre de dB au-dessus du plancher. */
const SEUIL_ABSOLU_DB = -42;
const MARGE_PLANCHER_DB = 12;
/** En dessous, la prise est un silence : Whisper n'est pas appelé. */
export const PAROLE_MIN_MS = 300;

const db = (rms: number) => (rms > 0 ? 20 * Math.log10(rms) : -120);

/** Lit un WAV PCM 16 bits mono (sortie de ffmpeg) et rend ses échantillons dans [-1, 1]. */
export function lireWav(buf: Uint8Array): { echantillons: Float32Array; frequence: number } {
  const v = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const tag = (o: number) => String.fromCharCode(buf[o]!, buf[o + 1]!, buf[o + 2]!, buf[o + 3]!);
  if (buf.byteLength < 44 || tag(0) !== "RIFF" || tag(8) !== "WAVE") throw new Error("WAV illisible");
  let o = 12;
  let frequence = 16000;
  let bits = 16;
  let canaux = 1;
  while (o + 8 <= buf.byteLength) {
    const id = tag(o);
    const taille = v.getUint32(o + 4, true);
    if (id === "fmt ") {
      canaux = v.getUint16(o + 10, true);
      frequence = v.getUint32(o + 12, true);
      bits = v.getUint16(o + 22, true);
    } else if (id === "data") {
      if (bits !== 16 || canaux !== 1) throw new Error(`WAV attendu en PCM 16 bits mono (reçu ${bits} bits, ${canaux} canaux)`);
      const n = Math.floor(Math.min(taille, buf.byteLength - o - 8) / 2);
      const echantillons = new Float32Array(n);
      for (let i = 0; i < n; i++) echantillons[i] = v.getInt16(o + 8 + i * 2, true) / 32768;
      return { echantillons, frequence };
    }
    o += 8 + taille + (taille % 2);
  }
  throw new Error("WAV sans données");
}

export function analyserParole(echantillons: Float32Array, frequence: number): AnalyseParole {
  const parTrame = Math.max(1, Math.round((frequence * TRAME_MS) / 1000));
  const niveaux: number[] = [];
  for (let i = 0; i + parTrame <= echantillons.length; i += parTrame) {
    let s = 0;
    for (let j = i; j < i + parTrame; j++) s += echantillons[j]! * echantillons[j]!;
    niveaux.push(db(Math.sqrt(s / parTrame)));
  }
  const tries = [...niveaux].sort((a, b) => a - b);
  const plancherDb = tries.length ? tries[Math.floor(tries.length * 0.1)]! : -120;
  const seuil = Math.max(SEUIL_ABSOLU_DB, plancherDb + MARGE_PLANCHER_DB);
  const paroleMs = niveaux.filter((n) => n >= seuil).length * TRAME_MS;
  return { dureeMs: Math.round((echantillons.length / frequence) * 1000), paroleMs, creteDb: tries.at(-1) ?? -120, plancherDb };
}

/** Phrases que Whisper produit sur du silence ou de la musique (sous-titrage de ses données d'entraînement). */
const SOUS_TITRAGE = [
  /sous[- ]titr(age|es?)\b.*(radio[- ]canada|amara|st'? ?\d+|communaute)/,
  /^merci d avoir regarde/,
  /^(abonnez vous|n oubliez pas de vous abonner)/,
  /^sous titres? (realises?|faits?) par/,
];

export type Verdict =
  | { verdict: "parole" }
  | { verdict: "silence"; raison: string }
  | { verdict: "douteux"; raison: string };

/** Avant Whisper : assez de parole pour transcrire ? */
export function verdictAvant(a: AnalyseParole): Verdict {
  if (a.paroleMs < PAROLE_MIN_MS) return { verdict: "silence", raison: `${a.paroleMs} ms de parole mesurée sur ${a.dureeMs} ms (crête ${a.creteDb.toFixed(0)} dBFS, bruit ${a.plancherDb.toFixed(0)} dBFS)` };
  return { verdict: "parole" };
}

/** Après Whisper : la transcription vient-elle de la prise, ou de l'invite et des sous-titres appris ? */
export function verdictApres(texte: string, a: AnalyseParole, invite: string): Verdict {
  const n = normaliserTexte(texte);
  if (!n) return { verdict: "silence", raison: "transcription vide" };
  const mots = n.split(" ").filter((m) => m.length > 2);
  const motsInvite = new Set(normaliserTexte(invite).split(" ").filter((m) => m.length > 2));
  const repris = mots.filter((m) => motsInvite.has(m)).length;
  if (mots.length >= 3 && repris / mots.length >= 0.6) return { verdict: "douteux", raison: "la transcription reprend l'invite de vocabulaire de Whisper, pas la prise" };
  // Une phrase de sous-titrage n'est suspecte que sur une prise pauvre en parole : on peut vraiment la dire.
  if (SOUS_TITRAGE.some((re) => re.test(n)) && a.paroleMs < 1500) return { verdict: "douteux", raison: "phrase de sous-titrage connue de Whisper sur une prise presque silencieuse" };
  return { verdict: "parole" };
}

/** Invite de vocabulaire : noms propres de Shyrka et des projets du portefeuille. */
export function inviteWhisper(projets: { noms: string[] }[]): string {
  const noms = [...new Set(["Mickaël", "Shyrka", "OIA", "Souffleur", "SEO Command", ...projets.flatMap((p) => p.noms)])];
  return `Conversation entre Mickaël Thomas et Shyrka. Noms : ${noms.join(", ")}.`;
}
