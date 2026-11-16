/**
 * Dossier privé des sujets (mandat v15, docs/industrialisation.md § 1) : les sujets réels
 * vivent hors du dépôt, dans `OIA_VIS_SUBJECTS_DIR` (défaut `~/oia-visibility-data/sujets/`,
 * droits 700). Toute écriture d'un sujet dont le chemin résolu tombe dans un dépôt Git est
 * refusée, avant la moindre création de dossier.
 */
import { chmodSync, existsSync, mkdirSync, realpathSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

export class RepoPathError extends Error {}

/** Dossier privé des sujets : `OIA_VIS_SUBJECTS_DIR`, sinon `~/oia-visibility-data/sujets`. */
export function privateSubjectsDir(env: Record<string, string | undefined> = process.env): string {
  const fromEnv = env.OIA_VIS_SUBJECTS_DIR;
  return resolve(fromEnv && fromEnv.trim() ? fromEnv : join(homedir(), "oia-visibility-data", "sujets"));
}

/** Racine du dépôt de l'outil (le dossier qui contient `.git`, au-dessus de ce fichier). */
export function toolRepoRoot(): string | null {
  return gitRootAbove(dirname(fileURLToPath(import.meta.url)));
}

function gitRootAbove(start: string): string | null {
  let dir = start;
  for (;;) {
    if (existsSync(join(dir, ".git"))) return dir;
    const up = dirname(dir);
    if (up === dir) return null;
    dir = up;
  }
}

/** Chemin réel : celui du plus proche parent existant, suivi du reste (le dossier n'existe pas encore). */
function realish(path: string): string {
  let existing = resolve(path);
  const rest: string[] = [];
  while (!existsSync(existing)) {
    const up = dirname(existing);
    if (up === existing) break;
    rest.unshift(existing.slice(up.length).replace(/^[\\/]/, ""));
    existing = up;
  }
  return join(realpathSync(existing), ...rest);
}

const inside = (path: string, root: string) => path === root || path.startsWith(root.endsWith(sep) ? root : root + sep);

/** Refuse un chemin situé dans un dépôt Git (celui de l'outil, ou tout autre). */
export function assertOutsideRepo(path: string): string {
  const real = realish(path);
  const tool = toolRepoRoot();
  if (tool && inside(real, realpathSync(tool))) {
    throw new RepoPathError(`refus : ${real} est dans le dépôt ${tool} (dépôt public : aucun sujet réel n'y est écrit)`);
  }
  const other = gitRootAbove(real);
  if (other) throw new RepoPathError(`refus : ${real} est dans le dépôt Git ${other}`);
  return real;
}

/** Crée (si besoin) un dossier aux droits 700, après le contrôle du dépôt. */
export function ensurePrivateDir(path: string): string {
  const real = assertOutsideRepo(path);
  mkdirSync(real, { recursive: true, mode: 0o700 });
  chmodSync(real, 0o700);
  return real;
}
