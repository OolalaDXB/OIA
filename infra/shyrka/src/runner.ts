import { execFile } from "node:child_process";

export interface RunResult {
  /** Code de sortie. 124 : délai dépassé ; 130 : annulé par l'appelant ; 127 : commande introuvable. */
  code: number;
  stdout: string;
  stderr: string;
  /** Vrai si le délai a été dépassé et le processus arrêté. */
  timedOut?: boolean;
  /** Vrai si l'appelant a annulé (interruption de la voix, par exemple). */
  aborted?: boolean;
  /** Signal qui a arrêté le processus, s'il y en a un. */
  signal?: string | null;
  /** Code d'erreur système (ENOENT, EACCES…), s'il y en a un. */
  errno?: string;
}

/**
 * Exécute une commande locale. Jamais de shell : les arguments passent tels
 * quels, ce qui exclut toute injection depuis un texte dicté ou généré.
 * `signal` permet d'arrêter la commande en cours (voix interrompue).
 */
export type CommandRunner = (cmd: string, args: string[], opts?: { timeoutMs?: number; signal?: AbortSignal }) => Promise<RunResult>;

export type ErreurExec = Omit<NodeJS.ErrnoException, "code"> & { killed?: boolean; signal?: NodeJS.Signals | null; code?: string | number | null };

/** Traduit une erreur d'execFile en résultat précis : délai, annulation, signal, commande absente ou code. */
export function resultatDErreur(err: ErreurExec | null, stdout: string, stderr: string, opts: { aborted?: boolean } = {}): RunResult {
  if (!err) return { code: 0, stdout, stderr };
  const signal = err.signal ?? null;
  if (opts.aborted || err.name === "AbortError" || err.code === "ABORT_ERR") return { code: 130, stdout, stderr, aborted: true, signal };
  if (err.killed && signal) return { code: 124, stdout, stderr: stderr || `délai dépassé, arrêt par ${signal}`, timedOut: true, signal };
  if (typeof err.code === "number") return { code: err.code, stdout, stderr: stderr || err.message, signal };
  if (signal) return { code: 128, stdout, stderr: stderr || `arrêté par le signal ${signal}`, signal };
  const errno = typeof err.code === "string" ? err.code : undefined;
  return { code: errno === "ENOENT" ? 127 : 1, stdout, stderr: stderr || err.message, signal, ...(errno ? { errno } : {}) };
}

export const execFileRunner: CommandRunner = (cmd, args, opts = {}) =>
  new Promise((resolve) => {
    execFile(
      cmd,
      args,
      { timeout: opts.timeoutMs ?? 120_000, maxBuffer: 16 * 1024 * 1024, shell: false, ...(opts.signal ? { signal: opts.signal } : {}) },
      (err, stdout, stderr) => resolve(resultatDErreur(err as ErreurExec | null, String(stdout), String(stderr), { aborted: opts.signal?.aborted === true })),
    );
  });
