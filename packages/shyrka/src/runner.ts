import { execFile } from "node:child_process";

export interface RunResult {
  code: number;
  stdout: string;
  stderr: string;
}

/**
 * Exécute une commande locale. Jamais de shell : les arguments passent tels
 * quels, ce qui exclut toute injection depuis un texte dicté ou généré.
 */
export type CommandRunner = (cmd: string, args: string[], opts?: { timeoutMs?: number }) => Promise<RunResult>;

export const execFileRunner: CommandRunner = (cmd, args, opts = {}) =>
  new Promise((resolve) => {
    execFile(
      cmd,
      args,
      { timeout: opts.timeoutMs ?? 120_000, maxBuffer: 16 * 1024 * 1024, shell: false },
      (err, stdout, stderr) => {
        const code = err ? (typeof (err as NodeJS.ErrnoException).code === "number" ? Number((err as NodeJS.ErrnoException).code) : 127) : 0;
        resolve({ code, stdout: String(stdout), stderr: String(stderr || (err && !stderr ? err.message : "")) });
      },
    );
  });
