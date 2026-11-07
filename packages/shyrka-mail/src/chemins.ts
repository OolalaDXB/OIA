import { existsSync, realpathSync } from "node:fs";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** Racine du dépôt OIA (packages/shyrka-mail/src → ../../../). */
export const RACINE_DEPOT = fileURLToPath(new URL("../../../", import.meta.url));

/** Chemin réel, liens symboliques résolus, même pour un fichier qui n'existe pas encore. */
export function cheminReel(chemin: string): string {
  let p = resolve(chemin);
  const reste: string[] = [];
  while (!existsSync(p)) {
    const parent = dirname(p);
    if (parent === p) break;
    reste.unshift(p.slice(parent.length + 1));
    p = parent;
  }
  return resolve(existsSync(p) ? realpathSync(p) : p, ...reste);
}

/**
 * Jetons Gmail, résumés et brouillons locaux restent hors du dépôt
 * (amendement, § 4). Refuse tout chemin dans le dépôt, lien symbolique compris.
 */
export function horsDepot(chemin: string, depot: string = RACINE_DEPOT): string {
  const reel = cheminReel(chemin);
  const rel = relative(cheminReel(depot), reel);
  if (rel === "" || (!rel.startsWith("..") && !isAbsolute(rel))) {
    throw new Error(`Refus : ${chemin} est dans le dépôt (${reel}). Jetons, résumés et brouillons restent hors du dépôt.`);
  }
  return reel;
}
