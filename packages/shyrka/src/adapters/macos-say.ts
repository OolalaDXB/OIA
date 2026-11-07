import { writeFileSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import type { CommandRunner } from "../runner.js";
import type { Speaker } from "../types.js";

/**
 * Voix macOS par `say`. Le texte passe par un fichier (`-f`) : aucun texte
 * généré n'est interprété comme une option de la commande.
 * Voix de référence du cadre : Aurélie.
 */
export class MacSaySpeaker implements Speaker {
  constructor(
    private readonly run: CommandRunner,
    private readonly opts: { voice: string; dir: string; rate?: number; writeFile?: (p: string, s: string) => void; removeFile?: (p: string) => void; now?: () => number },
  ) {}

  async speak(text: string): Promise<void> {
    const path = join(this.opts.dir, `replique-${(this.opts.now ?? Date.now)()}.txt`);
    (this.opts.writeFile ?? ((p, s) => writeFileSync(p, s, "utf8")))(path, text);
    try {
      const args = ["-v", this.opts.voice, "-f", path];
      if (this.opts.rate) args.push("-r", String(this.opts.rate));
      const res = await this.run("say", args, { timeoutMs: 120_000 });
      if (res.code !== 0) throw new Error(`Voix macOS : échec (code ${res.code}). ${res.stderr.trim()}`);
    } finally {
      try {
        (this.opts.removeFile ?? unlinkSync)(path);
      } catch {
        /* fichier déjà absent */
      }
    }
  }
}
