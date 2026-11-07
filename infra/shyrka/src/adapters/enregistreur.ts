import { spawn, type ChildProcess } from "node:child_process";
import type { AudioClip } from "../types.js";

/** Une prise en cours : elle s'arrête sur demande (pousser pour parler) ou au plafond. */
export interface Prise {
  arreter(): Promise<AudioClip>;
  /** Abandonne la prise : le processus d'enregistrement est arrêté, rien n'est rendu. */
  annuler?(): void;
}

export interface Enregistreur {
  demarrer(chemin: string): Prise;
}

type Proc = Pick<ChildProcess, "once" | "kill"> & { stdin: { write(s: string): unknown; end(): unknown } | null };
type Spawn = (cmd: string, args: string[]) => Proc;

/**
 * Enregistrement au micro du Mac par ffmpeg (avfoundation), en WAV 16 kHz
 * mono. La prise commence à la demande et s'arrête quand on la stoppe (envoi
 * de « q » à ffmpeg), ou au plafond de durée. Aucune écoute permanente.
 */
export class EnregistreurFfmpeg implements Enregistreur {
  constructor(
    private readonly opts: { device: string; plafondSecondes: number; ffmpeg?: string; spawn?: Spawn; now?: () => number },
  ) {}

  demarrer(chemin: string): Prise {
    const sp = this.opts.spawn ?? ((c: string, a: string[]) => spawn(c, a, { stdio: ["pipe", "ignore", "pipe"] }) as unknown as Proc);
    const now = this.opts.now ?? Date.now;
    const t0 = now();
    const args = ["-hide_banner", "-loglevel", "error", "-f", "avfoundation", "-i", this.opts.device, "-t", String(this.opts.plafondSecondes), "-ac", "1", "-ar", "16000", "-y", chemin];
    const proc = sp(this.opts.ffmpeg ?? "ffmpeg", args);
    const fin = new Promise<number>((resolve) => proc.once("exit", (code: number | null) => resolve(code ?? 0)));
    return {
      annuler: () => {
        proc.kill("SIGTERM");
      },
      arreter: async () => {
        proc.stdin?.write("q");
        proc.stdin?.end();
        const code = await fin;
        if (code !== 0 && code !== 255) throw new Error(`Micro : ffmpeg s'est arrêté avec le code ${code} (accès au micro refusé par macOS ?).`);
        return { path: chemin, durationMs: Math.min(now() - t0, this.opts.plafondSecondes * 1000) };
      },
    };
  }
}

/** Enregistreur simulé : ne touche ni au micro ni au disque. */
export class EnregistreurSimule implements Enregistreur {
  readonly prises: string[] = [];
  demarrer(chemin: string): Prise {
    this.prises.push(chemin);
    return { arreter: async () => ({ path: chemin, durationMs: 1000 }), annuler: () => {} };
  }
}
