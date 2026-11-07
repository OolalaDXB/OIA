import { voiceOutputAllowed, type Identity } from "./identity.js";
import { applyStyle, SHYRKA_SYSTEM_PROMPT } from "./persona.js";
import type { AudioClip, ChatMessage, Microphone, Speaker, TextModel, Transcriber } from "./types.js";
import { assertModeleLocal } from "./local.js";
import type { MemoireLocale } from "./memoire-locale.js";
import { detecterDemande, detecterOffre, estAccord, estRefus, executer, questions, refusDocument, sansRepetition, sourcesDuDepot, type Execution, type Offre, type Operation, type Sources } from "./dialogue.js";

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
  /** Memoire explicite locale ; jamais transmise a un modele cloud. */
  memoire?: MemoireLocale;
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
      return { heard, answer: null, output: "aucune", events };
    }
    const commandeMemoire = this.deps.memoire?.traiter(heard);
    if (commandeMemoire !== null && commandeMemoire !== undefined) {
      if (/mode prive/i.test(commandeMemoire)) this.history = [];
      this.deps.print(`Shyrka · ${commandeMemoire}`);
      if (this.voiceOutput && this.deps.speaker) {
        await this.step(events, "voix", () => this.deps.speaker!.speak(commandeMemoire));
        return { heard, answer: commandeMemoire, output: "voix", events };
      }
      events.push({ at: new Date(this.clock()).toISOString(), step: "texte", ms: 0 });
      return { heard, answer: commandeMemoire, output: "texte", events };
    }
    const systemBase = this.deps.system ?? SHYRKA_SYSTEM_PROMPT;
    // Memorisation exclusivement pour le modele local, jamais pour un fournisseur externe.
    const system = systemBase + (this.deps.model.name.startsWith("ollama:") ? (this.deps.memoire?.contextePour(heard) ?? "") : "");
    const messages: ChatMessage[] = [{ role: "system", content: system }, ...this.history, { role: "user", content: heard }];
    const decision = this.decider(heard);
    let answer: string;
    let parModele = false;
    if ("texte" in decision) answer = decision.texte;
    else if ("execution" in decision && "texte" in decision.execution) answer = decision.execution.texte;
    else if ("execution" in decision && "synthese" in decision.execution) {
      const { fichier, texte, consigne } = decision.execution.synthese;
      const lecture: ChatMessage[] = [
        { role: "system", content: system },
        { role: "user", content: `Voici le texte intégral de ${fichier}, que tu viens de lire.\n\n${texte}\n\n${consigne} N'ajoute rien qui n'y figure pas. Ne pose aucune question.` },
      ];
      const raw = await this.step(events, "reflexion", () => this.deps.model.chat(lecture), this.deps.model.name);
      answer = `J'ai lu ${fichier}. ${sansRepetition(applyStyle(raw), this.dernieresQuestions, [...this.faites, ...(decision.operation ? [decision.operation] : [])])}`.trim();
    } else {
      parModele = true;
      const raw = await this.step(events, "reflexion", () => this.deps.model.chat(messages), this.deps.model.name);
      answer = sansRepetition(applyStyle(raw), this.dernieresQuestions, this.faites) || "Je n'ai rien à ajouter. Dis-moi ce que tu veux voir.";
    }
    if ("execution" in decision && decision.operation) this.faites.push(decision.operation);
    // Une offre ne se retient que d'une réponse du modèle ; elle attend la réplique suivante, pas plus.
    this.offre = parModele ? detecterOffre(answer) : null;
    this.dernieresQuestions = questions(answer);
    let comparison: TurnResult["comparison"];
    if (parModele && this.deps.compareModel) {
      const cm = this.deps.compareModel;
      const t0 = this.clock();
      const other = applyStyle(await cm.chat(messages));
      comparison = { model: cm.name, answer: other, ms: this.clock() - t0 };
    }
    this.remember(heard, answer);
    this.deps.print(`Shyrka · ${answer}`);
    if (comparison) this.deps.print(`  comparaison ${comparison.model} (${comparison.ms} ms) · ${comparison.answer}`);
    if (this.voiceOutput && this.deps.speaker) {
      const speaker = this.deps.speaker;
      await this.step(events, "voix", () => speaker.speak(answer));
      return { heard, answer, output: "voix", events, ...(comparison ? { comparison } : {}) };
    }
    events.push({ at: new Date(this.clock()).toISOString(), step: "texte", ms: 0, detail: `identité v${this.deps.identity.version}` });
    return { heard, answer, output: "texte", events, ...(comparison ? { comparison } : {}) };
  }

  /**
   * Ce que le code fait de la réplique, avant tout modèle : exécuter l'offre
   * acceptée, répondre à un refus, exécuter une demande de lecture, refuser
   * un document hors liste. Sinon, le modèle répond.
   */
  private decider(heard: string): { texte: string } | { execution: Execution; operation: Operation | null } | { modele: true } {
    const offre = this.offre;
    this.offre = null;
    if (offre && estAccord(heard)) return { execution: executer(offre, this.sources()), operation: { type: offre.type, sujet: offre.sujet } };
    if (offre && estRefus(heard)) return { texte: "Entendu, je laisse ça de côté." };
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
    if (this.deps.memoire?.modePriveActif) return;
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
