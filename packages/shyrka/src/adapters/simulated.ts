import type { AudioClip, ChatMessage, Microphone, Speaker, TextModel, Transcriber, Transcript } from "../types.js";

/**
 * Adaptateurs simulés, pour les tests et pour un essai sans Mac. Ils ne
 * touchent ni au micro, ni au disque, ni au réseau. Tout ce qu'ils renvoient
 * est marqué « simulé » côté session.
 */
export class SimulatedMicrophone implements Microphone {
  private n = 0;
  readonly takes: number[] = [];
  async record({ maxSeconds }: { maxSeconds: number }): Promise<AudioClip> {
    this.takes.push(maxSeconds);
    this.n += 1;
    return { path: `simule://prise-${this.n}.wav`, durationMs: Math.min(maxSeconds, 3) * 1000 };
  }
}

/** Rend, prise après prise, les phrases fournies (puis du silence). */
export class SimulatedTranscriber implements Transcriber {
  private i = 0;
  constructor(private readonly lines: string[]) {}
  async transcribe(_clip: AudioClip, { language }: { language: string }): Promise<Transcript> {
    const text = this.lines[this.i] ?? "";
    this.i += 1;
    return { text, language };
  }
}

/** Modèle texte scripté : réponse fixe ou fonction de la conversation. */
export class SimulatedTextModel implements TextModel {
  readonly name = "simule:modele-texte";
  readonly calls: ChatMessage[][] = [];
  constructor(private readonly reply: string | ((messages: ChatMessage[]) => string) = (m) => `Bien reçu : ${m[m.length - 1]?.content ?? ""}`) {}
  async chat(messages: ChatMessage[]): Promise<string> {
    this.calls.push(messages.map((m) => ({ ...m })));
    return typeof this.reply === "string" ? this.reply : this.reply(messages);
  }
}

/** Haut-parleur qui n'émet aucun son : il consigne ce qu'il aurait dit. */
export class RecordingSpeaker implements Speaker {
  readonly spoken: string[] = [];
  async speak(text: string): Promise<void> {
    this.spoken.push(text);
  }
}
