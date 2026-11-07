/**
 * Contrats de Shyrka 1 « Te parle ». Chaque maillon de la boucle
 * (micro → transcription → modèle texte → voix) est une interface ; les
 * adaptateurs réels (macOS, whisper.cpp, Ollama, `say`) et simulés
 * l'implémentent. La session ne connaît que ces interfaces.
 */

/** Un enregistrement audio local. Jamais envoyé hors de la machine. */
export interface AudioClip {
  /** Chemin d'un fichier WAV 16 kHz mono sur disque local. */
  path: string;
  durationMs: number;
}

export interface Microphone {
  /** Enregistre une prise unique, bornée en durée. Aucune écoute permanente. */
  record(opts: { maxSeconds: number }): Promise<AudioClip>;
}

export interface Transcript {
  text: string;
  language: string;
}

export interface Transcriber {
  transcribe(clip: AudioClip, opts: { language: string }): Promise<Transcript>;
}

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface TextModel {
  readonly name: string;
  chat(messages: ChatMessage[]): Promise<string>;
}

export interface Speaker {
  /** Dit le texte. Rend « interrompu » si la réplique a été coupée avant la fin. */
  speak(text: string): Promise<void | "interrompu">;
  /** Coupe la réplique en cours, sans arrêter Shyrka. */
  interrompre?(): void;
}
