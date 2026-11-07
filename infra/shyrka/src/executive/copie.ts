import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { RACINE_DEPOT } from "../local.js";

/**
 * Copie temporaire isolée du dépôt (mandat v11.2, § 1.1.3) : extraite d'un
 * SHA connu de main par `git archive`, SANS branche, SANS worktree, sans
 * dépôt Git. Seuls les fichiers suivis à ce SHA y figurent : ni `.env`, ni
 * mémoire, ni fichier local non suivi. Les dépendances installées sont des
 * liens en lecture vers celles de main (le bac à sable refuse d'y écrire).
 *
 * Le diff se calcule contre une seconde extraction intacte du même SHA,
 * avec `diff -ruN`, et s'applique ailleurs avec `git apply` hors dépôt.
 */

const DEPENDANCES = ["node_modules", "infra/shyrka/node_modules", "packages/shyrka/node_modules"];
const EXCLUS = ["node_modules", ".DS_Store", ".vitest", "*.tsbuildinfo"];

export interface Copie {
  racine: string;
  sha: string;
  /** Dossier parent jetable (contient aussi l'extraction de référence). */
  dossier: string;
}

export function shaComplet(ref: string, depot = RACINE_DEPOT): string {
  return execFileSync("git", ["-C", depot, "rev-parse", "--verify", `${ref}^{commit}`], { encoding: "utf8" }).trim();
}

function extraire(sha: string, dest: string, depot: string): void {
  mkdirSync(dest, { recursive: true });
  const archive = spawnSync("git", ["-C", depot, "archive", "--format=tar", sha], { maxBuffer: 512 * 1024 * 1024 });
  if (archive.status !== 0) throw new Error(`git archive ${sha.slice(0, 12)} : ${archive.stderr.toString().slice(0, 200)}`);
  const tar = spawnSync("tar", ["-x", "-C", dest], { input: archive.stdout });
  if (tar.status !== 0) throw new Error(`tar : ${tar.stderr.toString().slice(0, 200)}`);
  for (const d of DEPENDANCES) if (existsSync(join(depot, d)) && !existsSync(join(dest, d))) symlinkSync(join(depot, d), join(dest, d));
}

/** Crée `base/` (référence intacte) et `copie/` (zone de travail) depuis un SHA de main. */
export function creerCopie(ref: string, opts: { depot?: string; parent?: string } = {}): Copie {
  const depot = opts.depot ?? RACINE_DEPOT;
  const sha = shaComplet(ref, depot);
  const dossier = realpathSync(mkdtempSync(join(opts.parent ?? tmpdir(), `shyrka-copie-${sha.slice(0, 8)}-`)));
  extraire(sha, join(dossier, "base"), depot);
  extraire(sha, join(dossier, "copie"), depot);
  writeFileSync(join(dossier, "SHA"), `${sha}\n`);
  return { racine: join(dossier, "copie"), sha, dossier };
}

export function supprimerCopie(c: Copie): void {
  if (c.dossier.startsWith(realpathSync(tmpdir())) || c.dossier.includes("/shyrka-copie-")) rmSync(c.dossier, { recursive: true, force: true });
}

/** Diff unifié de la copie contre la référence, et fichiers touchés (chemins du dépôt). */
export function diffCopie(c: Copie): { diff: string; fichiers: string[]; empreinte: string } {
  const args = ["-ruN", ...EXCLUS.flatMap((x) => ["-x", x]), "base", "copie"];
  const r = spawnSync("diff", args, { cwd: c.dossier, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  if (r.status !== 0 && r.status !== 1) throw new Error(`diff : ${r.stderr.slice(0, 200)}`);
  const diff = r.stdout;
  return { diff, fichiers: fichiersDuDiff(diff), empreinte: empreinteDiff(diff) };
}

/** Empreinte d'un diff, indépendante des horodatages des en-têtes `---`/`+++`. */
export function empreinteDiff(diff: string): string {
  const stable = diff.replace(/^(---|\+\+\+) (\S+)\t.*$/gm, "$1 $2");
  return createHash("sha256").update(stable).digest("hex");
}

export function fichiersDuDiff(diff: string): string[] {
  const f = new Set<string>();
  for (const m of diff.matchAll(/^(?:---|\+\+\+) (?:base|copie)\/(\S+)/gm)) f.add(m[1]!);
  for (const m of diff.matchAll(/^Binary files (?:base|copie)\/(\S+) and/gm)) f.add(m[1]!);
  return [...f].sort();
}

/** Applique un patch sur une copie fraîche (vérificateur). Refus explicite si le patch ne s'applique pas tel quel. */
export function appliquer(c: Copie, patch: string): { ok: boolean; detail: string } {
  const f = join(c.dossier, "candidat.patch");
  writeFileSync(f, patch);
  const r = spawnSync("git", ["apply", "-p1", "--whitespace=nowarn", f], { cwd: c.racine, encoding: "utf8" });
  if (r.status === 0) return { ok: true, detail: "appliqué" };
  // Repli : patch(1), sans flou (aucun décalage silencieux).
  const p = spawnSync("patch", ["-p1", "-F0", "--no-backup-if-mismatch", "-i", f], { cwd: c.racine, encoding: "utf8" });
  return p.status === 0 ? { ok: true, detail: "appliqué (patch)" } : { ok: false, detail: `${r.stderr}${p.stdout}`.slice(0, 400) };
}

export function lirePatch(fichier: string): { patch: string; empreinte: string } {
  const patch = readFileSync(fichier, "utf8");
  return { patch, empreinte: empreinteDiff(patch) };
}
