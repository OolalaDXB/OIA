/**
 * Shyrka sur le Mac (issue #11, phase Mac Studio) : client de la passerelle
 * locale, joignable seulement par le proxy de développement (/shyrka-local,
 * voir vite.config.ts). Hors du Mac, rien ne répond : la page reste en
 * démonstration et le dit.
 */
const BASE = "/shyrka-local/v1";

export type EtatLocal = "repos" | "ecoute" | "transcription" | "reflexion" | "parle" | "erreur" | "interrompu";

export interface SanteLocale {
  modele: { nom: string; disponible: boolean };
  transcription: "whisper-local" | "indisponible";
  voix: { sortie: "mac"; nom: string } | { sortie: "aucune" };
  memoire: "active" | "indisponible";
  corpus: "actif" | "indisponible";
  detail: string;
  prive: boolean;
}

export interface SourceLocale { chemin: string; ligne: number; section: string; version: string; date: string }
export interface ReponseLocale { reponse: string | null; sources: SourceLocale[]; memoire: SanteLocale["memoire"]; corpus: SanteLocale["corpus"]; langue: string; ms: number }
/** `langue` : code ISO détecté par Whisper sur la prise (fr, ru, en…). */
export interface Transcription { verdict: "parole" | "silence" | "douteux"; raison?: string; transcription: string; langue?: string; analyse: { dureeMs: number; paroleMs: number } }

export class ErreurLocale extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
  }
}

async function appel<T>(chemin: string, init?: RequestInit): Promise<T> {
  const r = await fetch(`${BASE}${chemin}`, init);
  const corps = (await r.json().catch(() => ({}))) as { erreur?: string; message?: string };
  if (!r.ok) throw new ErreurLocale(corps.erreur ?? `http_${r.status}`, corps.message ?? `Passerelle : HTTP ${r.status}`);
  return corps as T;
}
const json = (corps: unknown): RequestInit => ({ method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(corps) });

/** Santé détaillée : elle n'existe que si le proxy du Mac a posé le jeton. Sinon : null (pas de passerelle). */
export async function santeLocale(delaiMs = 1500): Promise<SanteLocale | null> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), delaiMs);
  try {
    const r = await fetch(`${BASE}/sante`, { signal: ctrl.signal });
    if (!r.ok) return null;
    const s = (await r.json()) as Partial<SanteLocale>;
    return s.modele && s.memoire ? (s as SanteLocale) : null;
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

export const tourTexte = (texte: string, langue?: string) => appel<ReponseLocale>("/tour/texte", json(langue ? { texte, langue } : { texte }));
export const tourAudio = (prise: Blob) => appel<Transcription>("/tour/audio", { method: "POST", headers: { "content-type": prise.type || "audio/webm" }, body: prise });
export const interrompre = () => appel<{ interrompue: boolean }>("/interrompre", json({}));
export const definirPrive = (actif: boolean) => appel<{ prive: boolean }>("/prive", json({ actif }));

/** Flux des états réels du Mac. Rend une fonction de fermeture. */
export function suivreEtats(h: { etat: (e: EtatLocal) => void; fin: (f: { interrompue: boolean }) => void; perdu: () => void }): () => void {
  const es = new EventSource(`${BASE}/evenements`);
  es.addEventListener("etat", (e) => h.etat((JSON.parse((e as MessageEvent).data) as { etat: EtatLocal }).etat));
  es.addEventListener("fin", (e) => h.fin(JSON.parse((e as MessageEvent).data) as { interrompue: boolean }));
  es.onerror = () => h.perdu();
  return () => es.close();
}

/**
 * Pousser pour parler : une prise commence sur action de Mickaël, s'arrête sur
 * une seconde action ou au plafond (60 s). Les pistes du micro sont libérées à
 * chaque arrêt ; aucune écoute permanente.
 */
export class PriseMicro {
  private flux: MediaStream | null = null;
  private enregistreur: MediaRecorder | null = null;
  private morceaux: Blob[] = [];
  private plafond: ReturnType<typeof setTimeout> | undefined;

  async demarrer(auPlafond: () => void): Promise<void> {
    if (!navigator.mediaDevices?.getUserMedia) throw new ErreurLocale("micro_indisponible", "Micro indisponible dans ce navigateur : le clavier reste disponible.");
    try {
      this.flux = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, channelCount: 1 } });
    } catch (e) {
      const refuse = e instanceof DOMException && (e.name === "NotAllowedError" || e.name === "SecurityError");
      throw new ErreurLocale(refuse ? "micro_refuse" : "micro_indisponible", refuse ? "Accès au micro refusé : le clavier reste disponible." : "Micro introuvable : le clavier reste disponible.");
    }
    const type = ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus", "audio/mp4"].find((t) => MediaRecorder.isTypeSupported(t));
    this.morceaux = [];
    this.enregistreur = new MediaRecorder(this.flux, type ? { mimeType: type } : undefined);
    this.enregistreur.ondataavailable = (e) => e.data.size && this.morceaux.push(e.data);
    this.enregistreur.start();
    this.plafond = setTimeout(auPlafond, 60_000);
  }

  get active(): boolean {
    return this.enregistreur?.state === "recording";
  }

  arreter(): Promise<Blob> {
    const rec = this.enregistreur;
    clearTimeout(this.plafond);
    if (!rec) return Promise.resolve(new Blob());
    return new Promise((ok) => {
      rec.onstop = () => {
        const b = new Blob(this.morceaux, { type: rec.mimeType || "audio/webm" });
        this.liberer();
        ok(b);
      };
      if (rec.state === "inactive") rec.onstop?.(new Event("stop"));
      else rec.stop();
    });
  }

  /** Libère le micro (voyant du navigateur éteint), sans rien rendre. */
  liberer(): void {
    clearTimeout(this.plafond);
    this.flux?.getTracks().forEach((t) => t.stop());
    this.flux = null;
    this.enregistreur = null;
    this.morceaux = [];
  }
}
