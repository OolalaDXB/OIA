/**
 * Conversation mains libres avec Shyrka sur le Mac (décision de Mickaël,
 * 8 novembre 2026) : une fois activé, le micro reste ouvert ; un énoncé se
 * termine après SILENCE_FIN_MS sans parole et part aussitôt ; si Mickaël
 * reprend la parole pendant que Shyrka parle, elle s'interrompt.
 *
 * Le micro n'est ouvert que pendant le mode, signalé à l'écran, et fermé à
 * l'arrêt (pistes libérées). Seuls les énoncés partent vers la passerelle
 * locale, qui écarte encore le silence. La voix de Shyrka sort des
 * haut-parleurs du Mac, hors du navigateur : l'annulation d'écho ne la voit
 * pas. Pendant qu'elle parle, le seuil de reprise se règle donc sur le niveau
 * de sa propre voix capté par le micro (un casque rend la reprise plus sûre).
 */

export const SILENCE_FIN_MS = 2000;
const TRAME_MS = 50;
/** Parole : ce nombre de dB au-dessus du bruit de fond, et au moins ce niveau absolu. */
const MARGE_DB = 12;
const SEUIL_MIN_DB = -48;
/** Reprise pendant la voix de Shyrka : ce nombre de dB au-dessus de son écho, pendant au moins REPRISE_MS. */
const MARGE_ECHO_DB = 6;
const REPRISE_MS = 250;
const DEBUT_PAROLE_MS = 150;
/** Sans parole, la prise en cours est jetée et relancée (pas d'accumulation de silence). */
const RELANCE_MS = 30_000;
const ENONCE_MAX_MS = 60_000;

export interface Rappels {
  /** Énoncé terminé (2 s de silence) : la prise à transcrire. */
  enonce: (prise: Blob) => void;
  /** Mickaël commence à parler (pour l'animation) ; `pendantVoix` : il coupe Shyrka. */
  debutParole: (pendantVoix: boolean) => void;
  erreur: (message: string, code: "micro_refuse" | "micro_indisponible") => void;
}

export class EcouteContinue {
  private flux: MediaStream | null = null;
  private contexte: AudioContext | null = null;
  private analyseur: AnalyserNode | null = null;
  private enregistreur: MediaRecorder | null = null;
  private morceaux: Blob[] = [];
  private minuterie: ReturnType<typeof setInterval> | undefined;
  private plancher = -60;
  private echo = -60;
  private parole = false;
  private debutParoleMs = 0;
  private dernierSonMs = 0;
  private debutPriseMs = 0;
  private auDessus = 0;
  /** Shyrka parle (voix sur le Mac) : reprise possible, seuil relevé. */
  voixShyrka = false;
  /** Shyrka transcrit ou réfléchit : rien n'est pris. */
  enAttente = false;

  constructor(private readonly rappels: Rappels) {}

  get active(): boolean {
    return this.flux !== null;
  }

  async demarrer(): Promise<void> {
    if (this.flux) return;
    if (!navigator.mediaDevices?.getUserMedia) return this.rappels.erreur("Micro indisponible dans ce navigateur : le clavier reste disponible.", "micro_indisponible");
    try {
      this.flux = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 } });
    } catch (e) {
      const refuse = e instanceof DOMException && (e.name === "NotAllowedError" || e.name === "SecurityError");
      return this.rappels.erreur(refuse ? "Accès au micro refusé : le clavier reste disponible." : "Micro introuvable : le clavier reste disponible.", refuse ? "micro_refuse" : "micro_indisponible");
    }
    this.contexte = new AudioContext();
    this.analyseur = this.contexte.createAnalyser();
    this.analyseur.fftSize = 2048;
    this.contexte.createMediaStreamSource(this.flux).connect(this.analyseur);
    this.nouvellePrise();
    this.minuterie = setInterval(() => this.trame(), TRAME_MS);
  }

  arreter(): void {
    clearInterval(this.minuterie);
    if (this.enregistreur && this.enregistreur.state !== "inactive") {
      this.enregistreur.onstop = null;
      this.enregistreur.stop();
    }
    this.enregistreur = null;
    this.morceaux = [];
    this.flux?.getTracks().forEach((t) => t.stop());
    this.flux = null;
    void this.contexte?.close().catch(() => undefined);
    this.contexte = null;
    this.analyseur = null;
    this.parole = false;
  }

  private nouvellePrise(): void {
    if (!this.flux) return;
    const type = ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus", "audio/mp4"].find((t) => MediaRecorder.isTypeSupported(t));
    this.morceaux = [];
    this.enregistreur = new MediaRecorder(this.flux, type ? { mimeType: type } : undefined);
    this.enregistreur.ondataavailable = (e) => e.data.size && this.morceaux.push(e.data);
    this.enregistreur.start();
    this.debutPriseMs = performance.now();
  }

  /** Termine la prise en cours et la rend ; une nouvelle prise commence aussitôt. */
  private couperPrise(rendre: boolean): void {
    const rec = this.enregistreur;
    if (!rec) return;
    rec.onstop = () => {
      const b = new Blob(this.morceaux, { type: rec.mimeType || "audio/webm" });
      if (rendre && b.size) this.rappels.enonce(b);
      this.nouvellePrise();
    };
    rec.stop();
    this.enregistreur = null;
  }

  private niveau(): number {
    const a = this.analyseur!;
    const buf = new Float32Array(a.fftSize);
    a.getFloatTimeDomainData(buf);
    let s = 0;
    for (const v of buf) s += v * v;
    const rms = Math.sqrt(s / buf.length);
    return rms > 0 ? 20 * Math.log10(rms) : -120;
  }

  private trame(): void {
    if (!this.analyseur || !this.enregistreur) return;
    const maintenant = performance.now();
    const n = this.niveau();
    if (this.enAttente) {
      // Transcription ou réflexion : on n'écoute pas ; la prise repart à vide ensuite.
      if (maintenant - this.debutPriseMs > 1000) this.couperPrise(false);
      this.parole = false;
      return;
    }
    // Écho de la voix de Shyrka : moyenne glissante de ce que capte le micro pendant qu'elle parle.
    if (this.voixShyrka) this.echo = this.echo * 0.9 + n * 0.1;
    else this.echo = Math.max(-60, this.echo - 1);
    const seuil = Math.max(SEUIL_MIN_DB, this.plancher + MARGE_DB, this.voixShyrka ? this.echo + MARGE_ECHO_DB : -Infinity);
    if (!this.parole && !this.voixShyrka && n < this.plancher + 6) this.plancher = this.plancher * 0.97 + n * 0.03;

    if (n >= seuil) {
      this.auDessus += TRAME_MS;
      this.dernierSonMs = maintenant;
      if (!this.parole && this.auDessus >= (this.voixShyrka ? REPRISE_MS : DEBUT_PAROLE_MS)) {
        this.parole = true;
        this.debutParoleMs = maintenant;
        // Reprise pendant la voix de Shyrka : la prise repart, sans l'écho de sa voix.
        if (this.voixShyrka) this.couperPrise(false);
        this.rappels.debutParole(this.voixShyrka);
      }
    } else this.auDessus = 0;

    if (this.parole) {
      // Fin d'énoncé : SILENCE_FIN_MS sans parole, ou durée maximale atteinte.
      if (maintenant - this.dernierSonMs >= SILENCE_FIN_MS || maintenant - this.debutParoleMs >= ENONCE_MAX_MS) {
        this.parole = false;
        this.auDessus = 0;
        this.couperPrise(true);
      }
    } else if (maintenant - this.debutPriseMs >= RELANCE_MS) this.couperPrise(false);
  }
}
