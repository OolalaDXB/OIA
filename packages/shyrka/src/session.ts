import { voiceOutputAllowed, type Identity } from "./identity.js";
import { applyStyle, SHYRKA_SYSTEM_PROMPT } from "./persona.js";
import type { ChatMessage, Microphone, Speaker, TextModel, Transcriber } from "./types.js";

export interface TurnEvent {
  at: string;
  step: "ecoute" | "transcription" | "reflexion" | "voix" | "texte" | "silence";
  ms: number;
  detail?: string;
}

export interface TurnResult {
  heard: string;
  answer: string | null;
  /** "voix" seulement si l'identité en vigueur autorise la voix en sortie. */
  output: "voix" | "texte" | "aucune";
  events: TurnEvent[];
}

export interface SessionDeps {
  microphone?: Microphone;
  transcriber?: Transcriber;
  model: TextModel;
  speaker?: Speaker;
  identity: Identity;
  /** Affichage texte : toujours disponible, c'est la sortie de la version 0. */
  print: (line: string) => void;
  language?: string;
  maxSeconds?: number;
  /** Tours gardés en mémoire de conversation (mémoire de session seulement). */
  historyTurns?: number;
  clock?: () => number;
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

  constructor(private readonly deps: SessionDeps) {
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
    const messages: ChatMessage[] = [{ role: "system", content: SHYRKA_SYSTEM_PROMPT }, ...this.history, { role: "user", content: heard }];
    const raw = await this.step(events, "reflexion", () => this.deps.model.chat(messages), this.deps.model.name);
    const answer = applyStyle(raw);
    this.remember(heard, answer);
    this.deps.print(`Shyrka · ${answer}`);
    if (this.voiceOutput && this.deps.speaker) {
      const speaker = this.deps.speaker;
      await this.step(events, "voix", () => speaker.speak(answer));
      return { heard, answer, output: "voix", events };
    }
    events.push({ at: new Date(this.clock()).toISOString(), step: "texte", ms: 0, detail: `identité v${this.deps.identity.version}` });
    return { heard, answer, output: "texte", events };
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
