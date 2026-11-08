/**
 * Conversation mains libres avec Shyrka sur le Mac (décisions de Mickaël,
 * 8 novembre 2026).
 *
 * - Le micro reste ouvert pendant le mode, signalé à l'écran, fermé à l'arrêt.
 * - Un énoncé se termine après SILENCE_FIN_MS sans parole et part aussitôt.
 * - Pendant que Shyrka parle, un son ne la coupe pas : elle finit sa phrase.
 *   Un passage qui ressemble à la voix de Mickaël (nettement au-dessus de
 *   l'écho de la sienne) part en vérification (`candidat`) : la passerelle ne
 *   la coupe que s'il contient un mot d'arrêt (« Stop », « Attends »,
 *   « Excuse-moi », toutes langues).
 * - Après sa réponse, APRES_VOIX_MS sans écoute : la fin de sa voix (et son
 *   écho) n'est pas prise pour une parole de Mickaël.
 *
 * La voix de Shyrka sort des haut-parleurs du Mac, hors du navigateur :
 * l'annulation d'écho ne la voit pas, d'où le seuil réglé sur son écho.
 */

export const SILENCE_FIN_MS = 2000;
export const APRES_VOIX_MS = 500;
const TRAME_MS = 50;
const MARGE_DB = 12;
const SEUIL_MIN_DB = -48;
/** Pendant la voix de Shyrka : un passage à vérifier doit dépasser son écho de MARGE_ECHO_DB pendant DEBUT_CANDIDAT_MS. */
const MARGE_ECHO_DB = 8;
const DEBUT_CANDIDAT_MS = 200;
const FIN_CANDIDAT_MS = 500;
const CANDIDAT_MAX_MS = 2500;
const DEBUT_PAROLE_MS = 150;
const RELANCE_MS = 30_000;
const ENONCE_MAX_MS = 60_000;

export interface Rappels {
  /** Énoncé terminé (2 s de silence) : la prise à transcrire et à envoyer. */
  enonce: (prise: Blob) => void;
  /** Passage court pris pendant la voix de Shyrka : à vérifier (mot d'arrêt ou non). */
  candidat: (prise: Blob) => void;
  /** Mickaël commence à parler (animation). */
  debutParole: () => void;
  erreur: (message: string, code: "micro_refuse" | "micro_indisponible") => void;
}

type Destination = "enonce" | "candidat" | null;

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
  private candidat = false;
  private debutMs = 0;
  private dernierSonMs = 0;
  private debutPriseMs = 0;
  private auDessus = 0;
  private muetJusqua = 0;
  private voix = false;
  /** Shyrka transcrit ou réfléchit : rien n'est pris. */
  enAttente = false;

  constructor(private readonly rappels: Rappels) {}

  get active(): boolean {
    return this.flux !== null;
  }

  /** Shyrka parle ou se tait ; à la fin de sa voix, un court temps sans écoute. */
  set voixShyrka(actif: boolean) {
    if (this.voix && !actif) {
      this.muetJusqua = performance.now() + APRES_VOIX_MS;
      this.candidat = false;
      this.parole = false;
      this.auDessus = 0;
    }
    this.voix = actif;
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
    this.parole = this.candidat = false;
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

  /** Termine la prise en cours (rendue à `destination`, ou jetée) ; une nouvelle prise commence aussitôt. */
  private couperPrise(destination: Destination): void {
    const rec = this.enregistreur;
    if (!rec) return;
    rec.onstop = () => {
      const b = new Blob(this.morceaux, { type: rec.mimeType || "audio/webm" });
      if (destination && b.size) this.rappels[destination](b);
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
    // Transcription, réflexion, ou fin de la voix de Shyrka : on n'écoute pas, la prise repart à vide.
    if (this.enAttente || maintenant < this.muetJusqua) {
      if (maintenant - this.debutPriseMs > 300) this.couperPrise(null);
      this.parole = this.candidat = false;
      this.auDessus = 0;
      return;
    }
    if (this.voix) this.echo = this.echo * 0.9 + n * 0.1;
    else this.echo = Math.max(-60, this.echo - 1);
    if (!this.parole && !this.voix && n < this.plancher + 6) this.plancher = this.plancher * 0.97 + n * 0.03;

    if (this.voix) {
      // Pendant la voix : seul un passage nettement au-dessus de son écho est vérifié ; il ne la coupe pas.
      const seuil = Math.max(SEUIL_MIN_DB, this.plancher + MARGE_DB, this.echo + MARGE_ECHO_DB);
      if (n >= seuil) {
        this.auDessus += TRAME_MS;
        this.dernierSonMs = maintenant;
        if (!this.candidat && this.auDessus >= DEBUT_CANDIDAT_MS) {
          this.candidat = true;
          this.debutMs = maintenant;
          this.couperPrise(null); // la vérification part du début de ce passage
        }
      } else this.auDessus = 0;
      if (this.candidat && (maintenant - this.dernierSonMs >= FIN_CANDIDAT_MS || maintenant - this.debutMs >= CANDIDAT_MAX_MS)) {
        this.candidat = false;
        this.couperPrise("candidat");
      } else if (!this.candidat && maintenant - this.debutPriseMs >= 3000) this.couperPrise(null);
      return;
    }

    const seuil = Math.max(SEUIL_MIN_DB, this.plancher + MARGE_DB);
    if (n >= seuil) {
      this.auDessus += TRAME_MS;
      this.dernierSonMs = maintenant;
      if (!this.parole && this.auDessus >= DEBUT_PAROLE_MS) {
        this.parole = true;
        this.debutMs = maintenant;
        this.rappels.debutParole();
      }
    } else this.auDessus = 0;
    if (this.parole) {
      if (maintenant - this.dernierSonMs >= SILENCE_FIN_MS || maintenant - this.debutMs >= ENONCE_MAX_MS) {
        this.parole = false;
        this.auDessus = 0;
        this.couperPrise("enonce");
      }
    } else if (maintenant - this.debutPriseMs >= RELANCE_MS) this.couperPrise(null);
  }
}
