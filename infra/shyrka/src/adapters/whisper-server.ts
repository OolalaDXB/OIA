import { spawn, type ChildProcess } from "node:child_process";
import { readFileSync } from "node:fs";
import { basename } from "node:path";
import type { AudioClip, Transcriber, Transcript } from "../types.js";
import { cleanWhisperOutput } from "./whisper-cpp.js";

export const WHISPER_PORT = 8178;

type Spawn = (cmd: string, args: string[]) => Pick<ChildProcess, "kill" | "once">;
type Fetch = (url: string, init?: { method?: string; body?: FormData }) => Promise<{ ok: boolean; status: number; text(): Promise<string> }>;

/**
 * Serveur Whisper local (whisper.cpp, `whisper-server`), lancé au début de la
 * session et arrêté à la fin (mandat v6, B1). Modèles dans local-models/whisper,
 * port 8178, adresse 127.0.0.1 seulement. Le son ne quitte pas la machine.
 */
export class WhisperServer implements Transcriber {
  private proc: Pick<ChildProcess, "kill" | "once"> | null = null;
  private readonly base: string;

  constructor(
    private readonly opts: {
      model: string;
      bin?: string;
      port?: number;
      prompt?: string;
      spawn?: Spawn;
      fetch?: Fetch;
      readFile?: (p: string) => Uint8Array;
      attendreMs?: number;
      pause?: (ms: number) => Promise<void>;
    },
  ) {
    this.base = `http://127.0.0.1:${opts.port ?? WHISPER_PORT}`;
  }

  get enMarche(): boolean {
    return this.proc !== null;
  }

  /** Lance le serveur et attend qu'il réponde. */
  async demarrer(): Promise<void> {
    if (this.proc) return;
    const sp = this.opts.spawn ?? ((c: string, a: string[]) => spawn(c, a, { stdio: "ignore" }));
    const args = ["-m", this.opts.model, "--host", "127.0.0.1", "--port", String(this.opts.port ?? WHISPER_PORT)];
    this.proc = sp(this.opts.bin ?? "whisper-server", args);
    const f = this.opts.fetch ?? (globalThis.fetch as unknown as Fetch);
    const pause = this.opts.pause ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
    const limite = this.opts.attendreMs ?? 30_000;
    for (let attendu = 0; attendu <= limite; attendu += 250) {
      try {
        const r = await f(`${this.base}/`);
        if (r.ok || r.status === 404) return;
      } catch {
        /* pas encore prêt */
      }
      await pause(250);
    }
    this.arreter();
    throw new Error(`Serveur Whisper injoignable sur ${this.base} après ${limite} ms.`);
  }

  /** Arrête le serveur. Sans effet s'il ne tourne pas. */
  arreter(): void {
    this.proc?.kill("SIGTERM");
    this.proc = null;
  }

  /** Arrête le serveur et attend sa sortie ; au-delà du délai, il est tué (SIGKILL). Rien d'orphelin. */
  async arreterEtAttendre(delaiMs = 3000): Promise<void> {
    const p = this.proc;
    if (!p) return;
    const sorti = new Promise<void>((r) => p.once("exit", () => r()));
    this.arreter();
    const t = setTimeout(() => p.kill("SIGKILL"), delaiMs);
    await sorti;
    clearTimeout(t);
  }

  async transcribe(clip: AudioClip, { language }: { language: string }): Promise<Transcript> {
    if (!this.proc) throw new Error("Serveur Whisper arrêté : appeler demarrer() d'abord.");
    const f = this.opts.fetch ?? (globalThis.fetch as unknown as Fetch);
    const bytes = (this.opts.readFile ?? ((p: string) => readFileSync(p)))(clip.path);
    const form = new FormData();
    form.append("file", new Blob([bytes], { type: "audio/wav" }), basename(clip.path));
    form.append("language", language);
    form.append("temperature", "0");
    // « auto » : Whisper détecte la langue, rendue par verbose_json (nom anglais, ramené au code ISO).
    form.append("response_format", language === "auto" ? "verbose_json" : "text");
    // L'invite de vocabulaire est en français : elle biaiserait la détection d'une autre langue.
    if (this.opts.prompt && language !== "auto") form.append("prompt", this.opts.prompt);
    const r = await f(`${this.base}/inference`, { method: "POST", body: form });
    if (!r.ok) throw new Error(`Whisper : HTTP ${r.status}.`);
    if (language !== "auto") return { text: cleanWhisperOutput(await r.text()), language };
    const d = JSON.parse(await r.text()) as { text?: string; language?: string };
    return { text: cleanWhisperOutput(d.text ?? ""), language: codeLangue(d.language ?? "") };
  }
}

/** Indication de vocabulaire, reprise de docs/shyrka/entretiens.md. */
export const PROMPT_WHISPER = "Entretien entre Mickaël Thomas et Shyrka. Noms : Mickaël, Shyrka, OIA, Souffleur, SEO Command.";

/** Noms de langue de Whisper (verbose_json) → code ISO 639-1. Inconnu : rendu tel quel. */
const CODES: Record<string, string> = {
  french: "fr", english: "en", russian: "ru", ukrainian: "uk", spanish: "es", german: "de", italian: "it", portuguese: "pt", dutch: "nl",
  polish: "pl", turkish: "tr", arabic: "ar", hebrew: "he", chinese: "zh", japanese: "ja", korean: "ko", hindi: "hi", persian: "fa", greek: "el",
};
export function codeLangue(nom: string): string {
  const n = nom.trim().toLowerCase();
  return CODES[n] ?? (/^[a-z]{2}$/.test(n) ? n : n || "fr");
}
