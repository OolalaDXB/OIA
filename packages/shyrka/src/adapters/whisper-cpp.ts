import type { CommandRunner } from "../runner.js";
import type { AudioClip, Transcriber, Transcript } from "../types.js";

/**
 * Transcription locale par whisper.cpp (`whisper-cli`, Homebrew : whisper-cpp).
 * Le son ne quitte pas la machine. Sortie texte sans horodatage.
 */
export class WhisperCppTranscriber implements Transcriber {
  constructor(
    private readonly run: CommandRunner,
    private readonly opts: { model: string; bin?: string; threads?: number },
  ) {}

  async transcribe(clip: AudioClip, { language }: { language: string }): Promise<Transcript> {
    const args = ["-m", this.opts.model, "-f", clip.path, "-l", language, "-nt", "-np"];
    if (this.opts.threads) args.push("-t", String(this.opts.threads));
    const res = await this.run(this.opts.bin ?? "whisper-cli", args, { timeoutMs: 120_000 });
    if (res.code !== 0) throw new Error(`Whisper : échec (code ${res.code}). ${res.stderr.trim()}`);
    return { text: cleanWhisperOutput(res.stdout), language };
  }
}

/** Retire horodatages éventuels, marqueurs de silence et lignes vides. */
export function cleanWhisperOutput(stdout: string): string {
  return stdout
    .split("\n")
    .map((l) => l.replace(/^\s*\[[\d:.]+\s*-->\s*[\d:.]+\]\s*/, "").trim())
    .filter((l) => l && !/^\[(BLANK_AUDIO|MUSIC|SILENCE|Musique)\]$/i.test(l) && !/^\((musique|silence)\)$/i.test(l))
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}
