import { createRequire } from "node:module";

/**
 * Chargement unique de `node:sqlite` (mandat v11, bloc 0).
 *
 * Node 24 émet « ExperimentalWarning: SQLite is an experimental feature » au
 * premier chargement, ce qui salit chaque sortie de Shyrka (journal du
 * service compris). On ne masque QUE cet avertissement, pendant ce seul
 * chargement : tout autre avertissement, expérimental ou non, passe.
 *
 * Chargé par require : Vite 5 (vitest) ne reconnaît pas encore `node:sqlite`
 * comme module intégré.
 */
export function estAvertissementSqlite(warning: unknown, type?: unknown): boolean {
  const nom = warning instanceof Error ? warning.name : typeof type === "string" ? type : "";
  const message = warning instanceof Error ? warning.message : String(warning);
  return nom === "ExperimentalWarning" && /^SQLite is an experimental feature/.test(message);
}

function charger(): typeof import("node:sqlite") {
  const emettre = process.emitWarning;
  process.emitWarning = function (this: unknown, warning: string | Error, ...reste: unknown[]) {
    const type = typeof reste[0] === "string" ? reste[0] : (reste[0] as { type?: string } | undefined)?.type;
    if (estAvertissementSqlite(warning, type)) return;
    return (emettre as (...a: unknown[]) => void).call(process, warning, ...reste);
  } as typeof process.emitWarning;
  try {
    return createRequire(import.meta.url)("node:sqlite") as typeof import("node:sqlite");
  } finally {
    process.emitWarning = emettre;
  }
}

export const { DatabaseSync } = charger();
