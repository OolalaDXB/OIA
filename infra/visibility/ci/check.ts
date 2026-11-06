#!/usr/bin/env tsx
/**
 * Garde-fou SEO CI · D5. Tourne en analyse statique sur une copie du dépôt :
 * refuse une PR qui dégrade la visibilité. Rend un JSON {ok, findings} sur
 * stdout, un code de sortie 0 (passe) / 1 (échec).
 *
 * Usage : `tsx infra/visibility/ci/check.ts <repoRoot> <siteUrl> [--fail-on=medium]`
 *
 * N'exécute aucun code du dépôt (règle 14). N'ouvre aucune connexion réseau.
 */

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

type Severity = "low" | "medium" | "high";

interface Finding {
  rule: string;
  severity: Severity;
  file: string | null;
  message: string;
}

const SEVERITY_RANK: Record<Severity, number> = { low: 0, medium: 1, high: 2 };

function walk(dir: string, base = dir, acc: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if ([".git", "node_modules", "dist", ".next", "out", "build", ".turbo", "coverage"].includes(name)) continue;
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, base, acc);
    else acc.push(relative(base, full));
  }
  return acc;
}

function readText(root: string, rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

export interface CheckOptions {
  failOn?: Severity;
}

export function runChecks(repoRoot: string, siteUrl: string, _opts: CheckOptions = {}): Finding[] {
  if (!existsSync(repoRoot)) throw new Error(`repoRoot absent: ${repoRoot}`);
  const files = walk(repoRoot);
  const findings: Finding[] = [];

  // --- robots.txt
  const robotsPath = files.find((f) => f === "robots.txt" || f === "public/robots.txt");
  if (!robotsPath) {
    findings.push({ rule: "robots-missing", severity: "medium", file: null, message: "robots.txt absent (recommandé pour les robots des IA)." });
  } else {
    const content = readText(repoRoot, robotsPath);
    if (!/^User-agent:/im.test(content)) {
      findings.push({ rule: "robots-no-user-agent", severity: "high", file: robotsPath, message: "robots.txt sans directive User-agent." });
    }
    if (!/^Sitemap:/im.test(content)) {
      findings.push({ rule: "robots-no-sitemap", severity: "low", file: robotsPath, message: "robots.txt sans ligne Sitemap:" });
    }
  }

  // --- sitemap.xml
  const sitemapPath = files.find((f) => f === "sitemap.xml" || f === "public/sitemap.xml");
  if (!sitemapPath) {
    findings.push({ rule: "sitemap-missing", severity: "medium", file: null, message: "sitemap.xml absent." });
  } else {
    const content = readText(repoRoot, sitemapPath);
    if (!/<\?xml/.test(content)) {
      findings.push({ rule: "sitemap-not-xml", severity: "high", file: sitemapPath, message: "sitemap.xml sans déclaration XML." });
    }
    if (!/<loc>/.test(content)) {
      findings.push({ rule: "sitemap-empty", severity: "medium", file: sitemapPath, message: "sitemap.xml ne contient aucune balise <loc>." });
    }
  }

  // --- pages HTML : titre, noindex, prix invisibles sans JS, JSON-LD
  const htmlLike = files.filter((f) => /\.(html?|tsx|jsx)$/.test(f));
  for (const rel of htmlLike) {
    const text = readText(repoRoot, rel);
    // Titre : minimalement présent dans le HTML initial.
    if (/\.html?$/.test(rel) && !/<title>[^<]{3,}<\/title>/.test(text) && !/Metadata\s*=/.test(text)) {
      findings.push({ rule: "title-missing", severity: "medium", file: rel, message: "Pas de <title> lisible côté serveur." });
    }
    // noindex oublié : on n'empêche pas, on signale.
    if (/<meta\s+name="robots"\s+content="[^"]*noindex[^"]*"/i.test(text)) {
      findings.push({ rule: "noindex-present", severity: "low", file: rel, message: "noindex présent : à vérifier (voulu ou oubli ?)." });
    }
    // Prix invisibles sans JS : heuristique.
    const lower = text.toLowerCase();
    const mentionsPrice = lower.includes("price") || lower.includes("prix");
    const looksClientSide = /useEffect|useState|fetch\(|document\./i.test(text);
    if (mentionsPrice && looksClientSide && !/[0-9]+[.,][0-9]{2}/.test(text)) {
      findings.push({ rule: "price-client-side", severity: "medium", file: rel, message: "Un mot « prix »/« price » apparaît avec un rendu côté client, sans valeur numérique visible : les IA ne le liront pas." });
    }
    // JSON-LD : parseable ?
    const ldMatches = text.matchAll(/<script\s+type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi);
    for (const m of ldMatches) {
      try {
        JSON.parse(m[1]!.trim());
      } catch {
        findings.push({ rule: "jsonld-invalid", severity: "high", file: rel, message: "JSON-LD invalide (JSON.parse échoue)." });
      }
    }
  }

  // --- La sitemap pointe vers le site déclaré.
  if (sitemapPath) {
    const content = readText(repoRoot, sitemapPath);
    const siteHost = (() => {
      try {
        return new URL(siteUrl).hostname;
      } catch {
        return "";
      }
    })();
    if (siteHost && !content.includes(siteHost)) {
      findings.push({ rule: "sitemap-wrong-host", severity: "high", file: sitemapPath, message: `sitemap.xml ne contient aucune URL sur ${siteHost}.` });
    }
  }

  return findings;
}

export function failsWith(findings: Finding[], failOn: Severity): boolean {
  const threshold = SEVERITY_RANK[failOn];
  return findings.some((f) => SEVERITY_RANK[f.severity] >= threshold);
}

// --- CLI
async function cliMain(): Promise<void> {
  const [, , repoRoot, siteUrl, ...rest] = process.argv;
  if (!repoRoot || !siteUrl) {
    console.error("usage: check.ts <repoRoot> <siteUrl> [--fail-on=medium]");
    process.exit(2);
  }
  const failOn: Severity = (rest.find((a) => a.startsWith("--fail-on="))?.split("=")[1] as Severity | undefined) ?? "medium";
  const findings = runChecks(repoRoot, siteUrl, { failOn });
  const ok = !failsWith(findings, failOn);
  process.stdout.write(JSON.stringify({ ok, failOn, findings }, null, 2) + "\n");
  process.exit(ok ? 0 : 1);
}

// `tsx` runs the file top-to-bottom; in vitest import we only get the exports.
// Minimal guard: run CLI only when invoked directly.
const isDirect = (() => {
  try {
    return (import.meta as unknown as { url: string }).url?.endsWith(process.argv[1] ?? "") ?? false;
  } catch {
    return false;
  }
})();
if (isDirect) {
  void cliMain();
}
