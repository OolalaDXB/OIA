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

/** `citation` : « chemin:ligne » pour un document du dépôt, « titre · page 3 » pour un document privé (aucun chemin du Mac). */
export interface SourceLocale { chemin: string; ligne: number; section: string; version: string; date: string; citation?: string; ref?: string; titre?: string }
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
/** Passage pris pendant la voix de Shyrka : la passerelle la coupe seulement s'il contient un mot d'arrêt. */
export const verifierInterruption = (prise: Blob) => appel<{ interrompue: boolean; mot?: string; raison?: string }>("/interruption", { method: "POST", headers: { "content-type": prise.type || "audio/webm" }, body: prise });
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

// ── Corpus (mandat Corpus local) : déposer, consulter, valider. Tout passe par la passerelle du Mac. ──

export interface EtatCorpus {
  volume: "chiffre"; sourcesOia: number; sourcesPrivees: number; propositions: number | null; sources: number; extraits: number; avecSens: number; modeleSens: string;
  surveillance: { etat: EtatSurveillance; aExaminer: number }; taches: Record<string, TacheCorpus>; prive: boolean;
}
export type EtatSurveillance = "arretee" | "active" | "pause" | "volume_absent";
export interface TacheCorpus { etape: "indexation" | "sens" | "propositions" | "fini" | "erreur"; fait: number; total: number; propositions?: number; ecartees?: number; message?: string }
export interface ApercuCorpus {
  jeton: string; nom: string; type: string; taille: number; pages?: number; passages: number; apercu: string; etat: "pret" | "a_verifier"; motifs: string[]; avertissements: string[];
  dejaPresent: { id: string; nom: string } | null; memeNom: { id: string; nom: string; version: number } | null; retireLe: string | null;
}
export interface SourcePrivee {
  id: string; nom: string; origine: "depot" | "note" | "dossier"; type: string; compartiment: string; lecteurs: string[]; empreinte: string; taille: number;
  dateSource: string; dateImport: string; version: number; statut: "indexe" | "echec" | "revoque"; attestation: string | null; revoqueLe: string | null; tache: TacheCorpus | null;
}
export interface ExtraitCorpus {
  source: string; section: string; ligne: number; ref: string; citation: string; titre: string; version: string; dateSource: string; indexeLe: string;
  statut: string; compartiment: string; connecteur: "depot-git" | "fichier-local" | "note"; extrait: string; mode: "sens" | "mots"; score: number; identifiant: boolean; sousLeSeuil?: boolean;
}
export interface PropositionCorpus {
  id: string; enonce: string; forme: "preference" | "decision" | "travail" | "experience"; compartiment: string; date: string; portee: string; provenance: string;
  details: { citation?: string; document?: string; ref?: string; version?: string; raison?: string; incertitude?: string; source_id?: string }; proches: { id: string; contenu: string; forme: string; valideLe: string | null }[];
}
export interface FichierDetecte { id: string; nom: string; taille: number; detecteLe: string }

export const TAILLE_MAX_CORPUS = 25 * 1024 * 1024;

export const etatCorpus = () => appel<EtatCorpus>("/corpus/etat");
export const sourcesCorpus = () => appel<{ sources: SourcePrivee[] }>("/corpus/sources");
export const extraitsSource = (id: string) => appel<{ extraits: ExtraitCorpus[] }>(`/corpus/sources/${encodeURIComponent(id)}/extraits`);
export const rechercherCorpus = (q: string, f: { source?: string; compartiment?: string } = {}) => {
  const p = new URLSearchParams({ q });
  if (f.source) p.set("source", f.source);
  if (f.compartiment) p.set("compartiment", f.compartiment);
  return appel<{ mode: "sens" | "mots"; resultats: ExtraitCorpus[]; ms: number }>(`/corpus/rechercher?${p}`);
};
/** Envoie le document à la passerelle du Mac pour analyse : rien n'est écrit tant qu'il n'est pas confirmé. */
export const preparerDocument = (f: File) =>
  appel<ApercuCorpus>("/corpus/preparer", { method: "POST", headers: { "content-type": "application/octet-stream", "x-corpus-nom": encodeURIComponent(f.name), "x-corpus-date": new Date(f.lastModified || Date.now()).toISOString() }, body: f });
export const preparerNote = (titre: string, texte: string) => appel<ApercuCorpus>("/corpus/note", json({ titre, texte }));
export const annulerPreparation = (jeton: string) => appel<{ annule: boolean }>("/corpus/annuler", json({ jeton }));
export const confirmerDocument = (c: { jeton: string; compartiment: string; conversation: boolean; nouvelleVersionDe?: string; attestation?: boolean }) =>
  appel<{ source: string; version: number; extraits: number; deja?: boolean }>("/corpus/confirmer", json(c));
export const reindexerSource = (id: string) => appel<{ extraits: number }>(`/corpus/sources/${encodeURIComponent(id)}/reindexer`, json({}));
export const retirerSource = (id: string) => appel<{ retire: true; propositionsRetirees: number; souvenirsValidesConserves: number }>(`/corpus/sources/${encodeURIComponent(id)}/retirer`, json({ confirmer: true }));
export const propositionsCorpus = () => appel<{ total: number; reportees: number; lot: PropositionCorpus[] }>("/corpus/propositions");
export const deciderProposition = (id: string, action: "valider" | "corriger" | "refuser" | "reporter", contenu?: string) =>
  appel<Record<string, unknown>>(`/corpus/propositions/${encodeURIComponent(id)}`, json(contenu ? { action, contenu } : { action }));
export const etatSurveillance = () => appel<{ etat: EtatSurveillance; aExaminer: FichierDetecte[] }>("/corpus/surveillance");
export const piloterSurveillance = (action: "activer" | "pause" | "arreter") => appel<{ etat: EtatSurveillance }>("/corpus/surveillance", json({ action }));
export const examinerFichier = (id: string) => appel<ApercuCorpus>(`/corpus/surveillance/${encodeURIComponent(id)}/examiner`, json({}));
export const effacerFichierDossier = (id: string) => appel<{ efface: true }>(`/corpus/surveillance/${encodeURIComponent(id)}/effacer`, json({ confirmer: true }));
