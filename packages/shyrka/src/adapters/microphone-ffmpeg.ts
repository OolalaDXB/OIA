import { join } from "node:path";
import type { CommandRunner } from "../runner.js";
import type { AudioClip, Microphone } from "../types.js";

/** Plafond dur d'une prise de dialogue, quelle que soit la demande : pas d'écoute longue. */
export const MAX_RECORD_SECONDS = 30;
/** Plafond d'une réponse en mode entretien : on y parle plus longtemps, jamais sans fin. */
export const MAX_ENTRETIEN_SECONDS = 300;

/**
 * Micro du Mac par ffmpeg (entrée avfoundation). Une prise = un fichier WAV
 * 16 kHz mono, le format attendu par whisper.cpp. macOS demande l'accès au
 * micro pour le terminal à la première prise.
 */
export class FfmpegMicrophone implements Microphone {
  constructor(
    private readonly run: CommandRunner,
    private readonly opts: { device: string; dir: string; ffmpeg?: string; now?: () => number; capSeconds?: number },
  ) {}

  async record({ maxSeconds }: { maxSeconds: number }): Promise<AudioClip> {
    const cap = Math.min(this.opts.capSeconds ?? MAX_RECORD_SECONDS, MAX_ENTRETIEN_SECONDS);
    const seconds = Math.max(1, Math.min(cap, Math.floor(maxSeconds)));
    const path = join(this.opts.dir, `prise-${(this.opts.now ?? Date.now)()}.wav`);
    const args = ["-hide_banner", "-loglevel", "error", "-f", "avfoundation", "-i", this.opts.device, "-t", String(seconds), "-ac", "1", "-ar", "16000", "-y", path];
    const res = await this.run(this.opts.ffmpeg ?? "ffmpeg", args, { timeoutMs: (seconds + 10) * 1000 });
    if (res.code !== 0) throw new Error(`Micro : ffmpeg a échoué (code ${res.code}). ${res.stderr.trim()}`);
    return { path, durationMs: seconds * 1000 };
  }
}
