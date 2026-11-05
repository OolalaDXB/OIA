import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

/** Lower case, accents stripped: "Café" and "cafe" are the same term. */
export function normalize(s: string): string {
  return s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** A term matches only as a whole token (not inside a longer word or domain label). */
export function termRegex(term: string): RegExp {
  return new RegExp(`(?<![\\p{L}\\p{N}_-])${escape(normalize(term))}(?![\\p{L}\\p{N}_])`, "u");
}

const TEXT = /\.(ts|tsx|js|mjs|cjs|json|ya?ml|sh|md|toml|sql|env\.example|example|txt)$|(^|\/)(Dockerfile|\.gitignore)$/;

/**
 * Every text file under `root`, minus the excluded top-level folders. Used to
 * prove the tool's code and docs never name a subject.
 */
export function listTextFiles(root: string, excludeTop: string[]): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      const rel = relative(root, p).split(sep).join("/");
      if (name === "node_modules" || name === ".git" || name === ".turbo") continue;
      if (excludeTop.some((x) => rel === x || rel.startsWith(`${x}/`))) continue;
      if (statSync(p).isDirectory()) walk(p);
      else if (TEXT.test(rel) || TEXT.test(name)) out.push(p);
    }
  };
  walk(root);
  return out.sort();
}

export type Hit = { file: string; line: number; term: string };

export function findTerms(files: string[], terms: string[], root: string): Hit[] {
  const regexes = terms.map((t) => [t, termRegex(t)] as const);
  const hits: Hit[] = [];
  for (const file of files) {
    const lines = normalize(readFileSync(file, "utf8")).split("\n");
    lines.forEach((text, i) => {
      for (const [term, re] of regexes) if (re.test(text)) hits.push({ file: relative(root, file), line: i + 1, term });
    });
  }
  return hits;
}
