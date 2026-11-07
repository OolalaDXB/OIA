import { writeFileSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import type { CommandRunner, RunResult } from "../runner.js";
import type { Speaker } from "../types.js";

/** Échec de la voix, décrit précisément : délai, signal, commande absente ou code de sortie. */
export class ErreurVoix extends Error {
  constructor(
    message: string,
    readonly motif: "delai" | "signal" | "introuvable" | "code",
    readonly detail: { code: number; signal?: string | null; errno?: string; delaiMs?: number },
  ) {
    super(message);
  }
}

export function erreurVoix(res: RunResult, delaiMs: number): ErreurVoix {
  const base = { code: res.code, signal: res.signal ?? null, ...(res.errno ? { errno: res.errno } : {}) };
  if (res.timedOut) return new ErreurVoix(`Voix macOS : délai dépassé (${Math.round(delaiMs / 1000)} s), say arrêté par ${res.signal ?? "SIGTERM"}.`, "delai", { ...base, delaiMs });
  if (res.errno === "ENOENT") return new ErreurVoix("Voix macOS : commande say introuvable (ENOENT).", "introuvable", base);
  if (res.signal) return new ErreurVoix(`Voix macOS : say arrêté par le signal ${res.signal}.`, "signal", base);
  return new ErreurVoix(`Voix macOS : échec (code ${res.code}${res.errno ? `, ${res.errno}` : ""}). ${res.stderr.trim()}`.trim(), "code", base);
}

/**
 * Voix macOS par `say`. Le texte passe par un fichier (`-f`) : aucun texte
 * généré n'est interprété comme une option de la commande.
 * La réplique en cours s'interrompt sur demande (`interrompre`) : le
 * processus `say` est arrêté, Shyrka continue.
 */
export class MacSaySpeaker implements Speaker {
  private enCours: AbortController | null = null;

  constructor(
    private readonly run: CommandRunner,
    private readonly opts: { voice: string; dir: string; rate?: number; timeoutMs?: number; writeFile?: (p: string, s: string) => void; removeFile?: (p: string) => void; now?: () => number },
  ) {}

  get parle(): boolean {
    return this.enCours !== null;
  }

  interrompre(): void {
    this.enCours?.abort();
  }

  async speak(text: string): Promise<void | "interrompu"> {
    const path = join(this.opts.dir, `replique-${(this.opts.now ?? Date.now)()}.txt`);
    (this.opts.writeFile ?? ((p, s) => writeFileSync(p, s, "utf8")))(path, text);
    const ctrl = new AbortController();
    this.enCours = ctrl;
    const delaiMs = this.opts.timeoutMs ?? 120_000;
    try {
      const args = ["-v", this.opts.voice, "-f", path];
      if (this.opts.rate) args.push("-r", String(this.opts.rate));
      const res = await this.run("say", args, { timeoutMs: delaiMs, signal: ctrl.signal });
      if (res.aborted || ctrl.signal.aborted) return "interrompu";
      if (res.code !== 0) throw erreurVoix(res, delaiMs);
    } finally {
      if (this.enCours === ctrl) this.enCours = null;
      try {
        (this.opts.removeFile ?? unlinkSync)(path);
      } catch {
        /* fichier déjà absent */
      }
    }
  }
}
