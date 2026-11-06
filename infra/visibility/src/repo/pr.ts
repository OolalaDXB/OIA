import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { resolveActionMode, type Client, type Site } from "../tenancy";
import type { Fix } from "./fixers";
import { unifiedDiff } from "./fixers";

/**
 * Assemblage, en SIMULATION, d'une demande de fusion. Aucun push réseau,
 * aucun appel à l'API GitHub : la tâche de la nuit s'arrête au moment où
 * `git push` serait appelé. L'appel GitHub réel est caché derrière
 * `postPullRequestDisabled()` qui refuse toujours, et un test le prouve.
 *
 * Les branches sont autorisées DANS LES DÉPÔTS FICTIFS uniquement (règle 1.2
 * du mandat : aucune branche dans le dépôt OIA). L'appelant est responsable
 * d'éviter ce chemin sur `~/OIA`.
 */

export interface SimulatedPR {
  /** Branche locale créée dans le dépôt fictif. */
  branch: string;
  /** Hash du commit créé. */
  commitSha: string;
  /** Titre de la PR. */
  title: string;
  /** Description Markdown de la PR. */
  body: string;
  /** Diffs générés par D3. */
  fixes: Fix[];
  /** Résultat attendu du garde-fou CI quand il tournera sur cette PR. */
  ciExpected: "pass" | "fail" | "unknown";
}

/**
 * Prépare une PR en simulation dans un dépôt local (dépôt fictif ou dépôt
 * cloné du client). Écrit les fichiers, commite, mais NE POUSSE PAS.
 * Refuse d'intervenir si le mode d'action du site l'interdit.
 */
export function prepareSimulatedPR(args: {
  client: Client;
  site: Site;
  repoRoot: string;
  fixes: Fix[];
  /** Référence de la recommandation (E2) et de la décision (E3). */
  recommendationId: string;
  decisionId: string;
  /** Preuves à joindre dans la description de la PR. */
  evidences: Array<{ label: string; url?: string; sha256?: string }>;
  /** Titre court (< 70 car). Le reste va dans la description. */
  title: string;
  ciExpected?: SimulatedPR["ciExpected"];
}): SimulatedPR {
  const mode = resolveActionMode(args.client, args.site);
  if (mode !== "proposition" && mode !== "direct") {
    throw new Error(`prepareSimulatedPR refused: repo action mode is "${mode}" (expected proposition or direct)`);
  }
  if (args.fixes.length === 0) throw new Error("prepareSimulatedPR refused: no fix to commit");
  if (args.title.length > 72) throw new Error("prepareSimulatedPR refused: title > 72 chars");

  // Branche nommée de manière déterministe.
  const branch = `oia-visibility/${args.recommendationId}`;
  runGit(args.repoRoot, ["checkout", "-B", branch]);

  for (const fix of args.fixes) {
    const full = join(args.repoRoot, fix.path);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, fix.after);
    runGit(args.repoRoot, ["add", "--", fix.path]);
  }
  // Commit sans hook, sans push.
  runGit(args.repoRoot, [
    "-c", "user.email=oia-visibility@example.test",
    "-c", "user.name=OIA Visibility (simulation)",
    "commit",
    "-m", `oia-visibility: ${args.title}\n\nRecommendation ${args.recommendationId} · Decision ${args.decisionId}`,
  ]);
  const commitSha = runGit(args.repoRoot, ["rev-parse", "HEAD"]).trim();

  const body = renderPullRequestBody({
    client: args.client,
    site: args.site,
    fixes: args.fixes,
    recommendationId: args.recommendationId,
    decisionId: args.decisionId,
    evidences: args.evidences,
    mode,
  });

  return {
    branch,
    commitSha,
    title: args.title,
    body,
    fixes: args.fixes,
    ciExpected: args.ciExpected ?? "unknown",
  };
}

function runGit(root: string, argv: string[]): string {
  return execFileSync("git", ["-C", root, ...argv], { encoding: "utf8" });
}

function renderPullRequestBody(args: {
  client: Client;
  site: Site;
  fixes: Fix[];
  recommendationId: string;
  decisionId: string;
  evidences: Array<{ label: string; url?: string; sha256?: string }>;
  mode: string;
}): string {
  const lines: string[] = [];
  lines.push(`## Résumé`, "");
  lines.push(`Recommendation \`${args.recommendationId}\` approuvée dans la décision \`${args.decisionId}\`.`);
  lines.push(`Client : \`${args.client.id}\` (${args.client.ownership}). Site : \`${args.site.id}\`. Mode : \`${args.mode}\`.`);
  lines.push("", "## Correctifs");
  for (const f of args.fixes) {
    lines.push(`- **${f.kind}** → \`${f.path}\` (${f.risk}). ${f.rationale}`);
  }
  lines.push("", "## Preuves");
  if (args.evidences.length === 0) lines.push("- *(aucune preuve jointe — cette PR est en simulation sur un dépôt fictif)*");
  for (const ev of args.evidences) {
    const parts = [`- ${ev.label}`];
    if (ev.url) parts.push(`<${ev.url}>`);
    if (ev.sha256) parts.push(`sha256=${ev.sha256}`);
    lines.push(parts.join(" · "));
  }
  lines.push("", "## Garde-fou SEO");
  lines.push("La GitHub Action `oia-visibility/seo-ci` tourne automatiquement sur cette PR.");
  lines.push("La fusion est conditionnée à son passage.");
  lines.push("", "## Diffs");
  for (const f of args.fixes) {
    lines.push(`<details><summary>${f.path}</summary>`, "", "```diff");
    lines.push(unifiedDiff(f));
    lines.push("```", "", "</details>");
  }
  lines.push("", "---", "", "Généré par OIA Visibility (connecteur de dépôt). Aucune donnée inventée (règle 12).");
  return lines.join("\n");
}

/**
 * Point de branchement API GitHub. Déactivé en permanence cette nuit : jamais
 * d'appel réseau. Un test couvre les deux garde-fous (mode d'action
 * incompatible et appel direct). Un futur adaptateur (D6) injectera la
 * vraie implémentation.
 */
export async function postPullRequestDisabled(ctx: {
  client: Client;
  site: Site;
  pr: SimulatedPR;
}): Promise<never> {
  const mode = resolveActionMode(ctx.client, ctx.site);
  if (mode !== "proposition" && mode !== "direct") {
    throw new Error(`postPullRequestDisabled refused: action mode is "${mode}"`);
  }
  throw new Error("postPullRequestDisabled: real GitHub posting is disabled tonight (see D4).");
}

/** Petit utilitaire pour initialiser un dépôt Git jetable (fixtures, tests). */
export function ensureGitInit(root: string): void {
  if (existsSync(join(root, ".git"))) return;
  execFileSync("git", ["init", "-q", "-b", "main", root]);
  execFileSync("git", ["-C", root, "add", "-A"]);
  execFileSync("git", [
    "-C", root,
    "-c", "user.email=oia-visibility@example.test",
    "-c", "user.name=OIA Visibility (simulation)",
    "commit", "-q", "-m", "fictive initial commit",
  ]);
}
