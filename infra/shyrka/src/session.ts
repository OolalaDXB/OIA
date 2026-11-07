import { voiceOutputAllowed, type Identity } from "./identity.js";
import { applyStyle, SHYRKA_SYSTEM_PROMPT } from "./persona.js";
import type { AudioClip, ChatMessage, Microphone, Speaker, TextModel, Transcriber } from "./types.js";
import { assertModeleLocal } from "./local.js";
import {
  detecterDemande, detecterOffre, entiteDecision, estAccord, estArret, estRefus, executer, idsDecision, passageSuivant, questions, refusDocument, renduListe,
  routerDecision, sansRepetition, sourcesDuDepot, texteVocal, type Decision, type Entite, type Execution, type Offre, type Operation, type Sources,
} from "./dialogue.js";

/** États explicites d'un tour. */
export type EtatSession = "attente" | "ecoute" | "transcription" | "reflexion" | "parole" | "interrompue" | "arret";

export interface TurnEvent {
  at: string;
  step: "ecoute" | "transcription" | "reflexion" | "voix" | "texte" | "silence";
  ms: number;
  detail?: string;
}

export interface TurnResult {
  heard: string;
  answer: string | null;
  comparison?: { model: string; answer: string; ms: number };
  /** "voix" seulement si l'identité en vigueur autorise la voix en sortie. */
  output: "voix" | "texte" | "aucune";
  events: TurnEvent[];
  /** Ce qui a été dit (ou aurait été dit) à voix haute, distinct de l'écran. */
  spoken?: string;
  /** Vrai si Mickaël a coupé la réplique avant la fin. */
  interrompue?: boolean;
  /** Vrai si Mickaël a demandé de terminer la session : l'appelant ferme. */
  arret?: boolean;
}

export interface SessionDeps {
  /** Mistral accepté comme modèle de conversation (Ollama absent, mandat v9 G5). */
  mistralAutorise?: boolean;
  microphone?: Microphone;
  transcriber?: Transcriber;
  model: TextModel;
  /** Second modèle, pour comparer : sa réponse s'affiche, ne parle pas, n'entre pas dans l'historique. */
  compareModel?: TextModel;
  speaker?: Speaker;
  identity: Identity;
  /** Consignes système (rôle, style, contexte en lecture seule). Par défaut : le cadre sans contexte. */
  system?: string;
  /** Affichage texte : toujours disponible, c'est la sortie de la version 0. */
  print: (line: string) => void;
  language?: string;
  maxSeconds?: number;
  /** Tours gardés en mémoire de conversation (mémoire de session seulement). */
  historyTurns?: number;
  clock?: () => number;
  /** Sources lues par la liste blanche (cadre, roadmap, rapports). Par défaut : le dépôt. */
  sources?: Sources;
  /** Appelé à chaque changement d'état (affichage, raccourcis clavier). */
  onEtat?: (etat: EtatSession) => void;
}

/**
 * Une conversation de Shyrka 1 « Te parle ».
 *
 * Prise de parole volontaire : chaque tour commence par un appel explicite
 * (touche Entrée dans la CLI), jamais par une écoute permanente. La voix en
 * sortie n'est utilisée que si l'identité en vigueur l'autorise ; en version 0
 * la réponse s'affiche en texte. Aucune mémoire n'est écrite : l'historique
 * vit le temps de la session.
 */
export class ShyrkaSession {
  private history: ChatMessage[] = [];
  private readonly clock: () => number;
  /** Offre faite au tour précédent, en attente d'un accord. Gérée par le code, pas par le modèle. */
  private offre: Offre | null = null;
  /** Questions posées au tour précédent : jamais reposées au tour suivant. */
  private dernieresQuestions: string[] = [];
  /** Opérations déjà faites dans la session : leur offre n'est plus reproposée. */
  private readonly faites: Operation[] = [];

  /** Passages d'une liste longue pas encore lus à voix haute. */
  private suiteVocale: string[] = [];
  /** Dernière entité dont on a parlé, avec sa source : « cette décision » la désigne. */
  private entite: Entite | null = null;
  private etatCourant: EtatSession = "attente";

  get etat(): EtatSession {
    return this.etatCourant;
  }

  get derniereEntite(): Entite | null {
    return this.entite;
  }

  private passer(e: EtatSession): void {
    this.etatCourant = e;
    this.deps.onEtat?.(e);
  }

  /** Coupe la réplique en cours. Shyrka continue ; rend vrai si une réplique était en cours. */
  interrompre(): boolean {
    if (this.etatCourant !== "parole") return false;
    this.deps.speaker?.interrompre?.();
    return true;
  }

  /** Offre en attente, pour l'affichage et les tests. */
  get offreEnAttente(): Offre | null {
    return this.offre;
  }

  constructor(private readonly deps: SessionDeps) {
    assertModeleLocal(deps.model, { mistralAutorise: deps.mistralAutorise === true });
    if (deps.compareModel) assertModeleLocal(deps.compareModel);
    this.clock = deps.clock ?? Date.now;
  }

  get voiceOutput(): boolean {
    return Boolean(this.deps.speaker) && voiceOutputAllowed(this.deps.identity);
  }

  /** Tour à la voix : micro, transcription, réponse. */
  async listenTurn(): Promise<TurnResult> {
    const { microphone, transcriber } = this.deps;
    if (!microphone || !transcriber) throw new Error("Tour à la voix impossible : micro ou transcription non configurés.");
    const events: TurnEvent[] = [];
    const clip = await this.step(events, "ecoute", () => microphone.record({ maxSeconds: this.deps.maxSeconds ?? 8 }));
    const transcript = await this.step(events, "transcription", () => transcriber.transcribe(clip, { language: this.deps.language ?? "fr" }));
    return this.answer(transcript.text, events);
  }

  /** Tour « pousser pour parler » : la prise a été faite par l'appelant, on la transcrit. */
  async clipTurn(clip: AudioClip): Promise<TurnResult> {
    const { transcriber } = this.deps;
    if (!transcriber) throw new Error("Transcription non configurée.");
    const events: TurnEvent[] = [];
    const transcript = await this.step(events, "transcription", () => transcriber.transcribe(clip, { language: this.deps.language ?? "fr" }));
    return this.answer(transcript.text, events);
  }

  /** Tour écrit : utile sans micro, et pour les tests. */
  async textTurn(text: string): Promise<TurnResult> {
    return this.answer(text, []);
  }

  private async answer(heardRaw: string, events: TurnEvent[]): Promise<TurnResult> {
    const heard = heardRaw.trim();
    if (!heard) {
      events.push({ at: new Date(this.clock()).toISOString(), step: "silence", ms: 0 });
      this.deps.print("Shyrka · (rien entendu)");
      this.passer("attente");
      return { heard, answer: null, output: "aucune", events };
    }
    // Arrêt oral : sans modèle, sans confirmation.
    if (estArret(heard)) {
      this.passer("arret");
      return { heard, answer: null, output: "aucune", events, arret: true };
    }
    const system = this.deps.system ?? SHYRKA_SYSTEM_PROMPT;
    const messages: ChatMessage[] = [{ role: "system", content: system }, ...this.history, { role: "user", content: heard }];
    const decision = this.decider(heard);
    let answer: string;
    let parle: string | null = null;
    let suite: string[] | null = null;
    let parModele = false;
    let entite: Entite | null = null;
    if ("suiteVocale" in decision) {
      const p = passageSuivant(this.suiteVocale);
      answer = `(suite de la liste, lue à voix haute)\n${this.suiteVocale.slice(0, this.suiteVocale.length - p.reste.length).join("\n")}`;
      parle = p.parle;
      suite = p.reste;
    } else if ("texte" in decision) answer = decision.texte;
    else if ("liste" in decision) {
      answer = renduListe(decision);
      if (decision.liste.length === 1) entite = entiteDecision(decision.liste[0]!);
    } else if ("expliquer" in decision) {
      const d = decision.expliquer;
      entite = entiteDecision(d);
      this.passer("reflexion");
      const raw = await this.step(events, "reflexion", () => this.deps.model.chat(this.messagesDecision(system, d, decision.question)), this.deps.model.name);
      const explication = sansRepetition(applyStyle(raw), this.dernieresQuestions, this.faites);
      answer = `${d.id} · ${d.intitule} (roadmap, ligne ${d.ligne})\n${explication}`;
      parle = `${d.id}. ${explication}`;
    } else if ("execution" in decision && "texte" in decision.execution) answer = decision.execution.texte;
    else if ("execution" in decision && "synthese" in decision.execution) {
      const { fichier, texte, consigne } = decision.execution.synthese;
      const lecture: ChatMessage[] = [
        { role: "system", content: system },
        { role: "user", content: `Voici le texte intégral de ${fichier}, que tu viens de lire.\n\n${texte}\n\n${consigne} N'ajoute rien qui n'y figure pas. Ne pose aucune question.` },
      ];
      this.passer("reflexion");
      const raw = await this.step(events, "reflexion", () => this.deps.model.chat(lecture), this.deps.model.name);
      answer = `J'ai lu ${fichier}. ${sansRepetition(applyStyle(raw), this.dernieresQuestions, [...this.faites, ...(decision.operation ? [decision.operation] : [])])}`.trim();
    } else {
      parModele = true;
      this.passer("reflexion");
      const raw = await this.step(events, "reflexion", () => this.deps.model.chat(messages), this.deps.model.name);
      answer = sansRepetition(applyStyle(raw), this.dernieresQuestions, this.faites) || "Je n'ai rien à ajouter. Dis-moi ce que tu veux voir.";
      const cites = idsDecision(answer);
      if (cites.length === 1) {
        const d = this.decisions().find((x) => x.id === cites[0]);
        if (d) entite = entiteDecision(d);
      }
    }
    // Une décision citée par Mickaël devient le sujet courant, même sans explication.
    if (!entite) {
      const cites = idsDecision(heard);
      const d = cites.length === 1 ? this.decisions().find((x) => x.id === cites[0]) : undefined;
      if (d) entite = entiteDecision(d);
    }
    if (entite) this.entite = entite;

    // Ce qui se dit est distinct de ce qui s'affiche.
    if (parle === null) {
      const v = texteVocal(answer);
      parle = v.parle;
      suite = v.suite;
    }

    let comparison: TurnResult["comparison"];
    if (parModele && this.deps.compareModel) {
      const cm = this.deps.compareModel;
      const t0 = this.clock();
      const other = applyStyle(await cm.chat(messages));
      comparison = { model: cm.name, answer: other, ms: this.clock() - t0 };
    }
    this.deps.print(`Shyrka · ${answer}`);
    if (comparison) this.deps.print(`  comparaison ${comparison.model} (${comparison.ms} ms) · ${comparison.answer}`);

    let output: TurnResult["output"] = "texte";
    let interrompue = false;
    if (this.voiceOutput && this.deps.speaker) {
      const speaker = this.deps.speaker;
      this.passer("parole");
      const fin = await this.step(events, "voix", () => speaker.speak(parle!));
      output = "voix";
      interrompue = fin === "interrompu";
    } else {
      events.push({ at: new Date(this.clock()).toISOString(), step: "texte", ms: 0, detail: `identité v${this.deps.identity.version}` });
      suite = []; // tout est à l'écran : pas de suite à lire
      parle = answer;
    }

    if (interrompue) {
      // Une réplique coupée n'est pas une opération achevée : rien n'est retenu comme fait,
      // aucune offre ni suite n'attend, et l'historique dit qu'elle a été interrompue.
      this.offre = null;
      this.suiteVocale = [];
      this.dernieresQuestions = [];
      this.remember(heard, `${answer}\n(Réponse interrompue par Mickaël avant la fin : il ne l'a pas entendue en entier.)`);
      this.passer("interrompue");
    } else {
      if ("execution" in decision && decision.operation) this.faites.push(decision.operation);
      // Une offre ne se retient que d'une réponse du modèle ; elle attend la réplique suivante, pas plus.
      this.offre = parModele ? detecterOffre(answer) : null;
      this.suiteVocale = suite ?? [];
      this.dernieresQuestions = [...questions(answer), ...questions(parle)];
      this.remember(heard, answer);
      this.passer("attente");
    }
    return { heard, answer, output, events, spoken: parle, ...(interrompue ? { interrompue } : {}), ...(comparison ? { comparison } : {}) };
  }

  /** Consigne pour expliquer une seule décision, à partir de son intitulé exact. */
  private messagesDecision(system: string, d: Decision, question: string): ChatMessage[] {
    return [
      { role: "system", content: system },
      ...this.history,
      {
        role: "user",
        content: [
          `Mickaël demande : « ${question} »`,
          `Cette demande porte sur une seule décision : ${d.id}, dans docs/roadmap-oia-shyrka-souffleur.md, ligne ${d.ligne}. Intitulé exact : « ${d.intitule} ».`,
          "Réponds sur cette décision seulement, en quatre phrases au plus. Ne liste pas les autres décisions. Distingue ce que la roadmap écrit de ton interprétation ; si la roadmap ne donne pas la raison, dis-le. Ne pose aucune question.",
        ].join("\n"),
      },
    ];
  }

  private decisions(): Decision[] {
    return this.sources().etat().decisionsDetail ?? [];
  }

  /**
   * Ce que le code fait de la réplique, avant tout modèle : exécuter l'offre
   * acceptée, répondre à un refus, exécuter une demande de lecture, refuser
   * un document hors liste. Sinon, le modèle répond.
   */
  private decider(
    heard: string,
  ):
    | { texte: string }
    | { suiteVocale: true }
    | { liste: Decision[]; total: number; libelle: string }
    | { expliquer: Decision; question: string }
    | { execution: Execution; operation: Operation | null }
    | { modele: true } {
    const offre = this.offre;
    this.offre = null;
    if (this.suiteVocale.length && estAccord(heard)) return { suiteVocale: true };
    this.suiteVocale = [];
    if (offre && estAccord(heard)) return { execution: executer(offre, this.sources()), operation: { type: offre.type, sujet: offre.sujet } };
    if (offre && estRefus(heard)) return { texte: "Entendu, je laisse ça de côté." };
    const route = /\bd[ée]cision|\b[dD] ?\d{1,2}\b|celle-ci|cette derni[èe]re|ce point/i.test(heard) ? routerDecision(heard, this.decisions(), this.entite) : null;
    if (route) return route;
    const d = detecterDemande(heard);
    if (d && !d.ok) return { texte: refusDocument(d.document) };
    if (d && "operation" in d) return { execution: executer(d.operation, this.sources()), operation: d.operation };
    if (d) return { execution: executer({ type: d.type, fichier: d.fichier }, this.sources()), operation: null };
    if (estAccord(heard)) return { texte: "Rien n'est en attente de mon côté. Dis-moi ce que tu veux voir." };
    return { modele: true };
  }

  private sourcesCache: Sources | undefined;
  private sources(): Sources {
    return (this.sourcesCache ??= this.deps.sources ?? sourcesDuDepot());
  }

  private remember(user: string, assistant: string): void {
    this.history.push({ role: "user", content: user }, { role: "assistant", content: assistant });
    const keep = (this.deps.historyTurns ?? 6) * 2;
    if (this.history.length > keep) this.history = this.history.slice(-keep);
  }

  private async step<T>(events: TurnEvent[], step: TurnEvent["step"], fn: () => Promise<T>, detail?: string): Promise<T> {
    const t0 = this.clock();
    const out = await fn();
    events.push({ at: new Date(t0).toISOString(), step, ms: this.clock() - t0, ...(detail ? { detail } : {}) });
    return out;
  }
}
