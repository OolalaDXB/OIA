/**
 * Comparaison de deux audits Crawlie d'un même site (avant / après) : scores,
 * pages crawlées et indexables, constats par règle. Lecture de deux fichiers
 * JSON, aucun accès réseau.
 *
 * CLI : tsx src/crawlie-compare.ts <avant.json> <après.json> <libellé avant> <libellé après>
 */
import { readFileSync } from "node:fs";

export interface CrawlieReport {
  summary: { totalPages: number; indexablePages: number; healthScore: number; geoScore: number; a11yScore: number; warnings: number; notices: number; errors: number };
  pages: { url: string; status: number; metaRobots?: string | null }[];
  issues: { rule: string; severity: string; url: string }[];
}

export interface CrawlieDiff {
  scores: { name: string; before: number; after: number }[];
  pagesAdded: string[];
  pagesRemoved: string[];
  rules: { rule: string; before: number; after: number }[];
}

const path = (u: string) => {
  try {
    return new URL(u).pathname.replace(/\/+$/, "") || "/";
  } catch {
    return u;
  }
};

export function compareCrawlie(before: CrawlieReport, after: CrawlieReport): CrawlieDiff {
  const keys: [string, keyof CrawlieReport["summary"]][] = [
    ["Pages crawlées", "totalPages"],
    ["Pages indexables", "indexablePages"],
    ["Score santé", "healthScore"],
    ["Score GEO", "geoScore"],
    ["Score accessibilité", "a11yScore"],
    ["Erreurs", "errors"],
    ["Avertissements", "warnings"],
    ["Notices", "notices"],
  ];
  const b = new Set(before.pages.map((p) => path(p.url)));
  const a = new Set(after.pages.map((p) => path(p.url)));
  const count = (r: CrawlieReport) => {
    const m = new Map<string, number>();
    for (const i of r.issues) m.set(i.rule, (m.get(i.rule) ?? 0) + 1);
    return m;
  };
  const cb = count(before);
  const ca = count(after);
  return {
    scores: keys.map(([name, k]) => ({ name, before: before.summary[k], after: after.summary[k] })),
    pagesAdded: [...a].filter((p) => !b.has(p)).sort(),
    pagesRemoved: [...b].filter((p) => !a.has(p)).sort(),
    rules: [...new Set([...cb.keys(), ...ca.keys()])]
      .sort()
      .map((rule) => ({ rule, before: cb.get(rule) ?? 0, after: ca.get(rule) ?? 0 }))
      .filter((r) => r.before !== r.after),
  };
}

export function renderCrawlieDiff(d: CrawlieDiff, beforeLabel: string, afterLabel: string): string {
  const sign = (n: number) => (n > 0 ? `+${n}` : String(n));
  const L = [
    `# Audit Crawlie : ${beforeLabel} → ${afterLabel}`,
    "",
    "| Indicateur | Avant | Après | Écart |",
    "|---|---|---|---|",
    ...d.scores.map((s) => `| ${s.name} | ${s.before} | ${s.after} | ${sign(s.after - s.before)} |`),
    "",
    "## Pages",
    "",
    `Ajoutées : ${d.pagesAdded.length ? d.pagesAdded.join(", ") : "aucune"}.`,
    `Disparues : ${d.pagesRemoved.length ? d.pagesRemoved.join(", ") : "aucune"}.`,
    "",
    "## Constats qui ont changé (nombre par règle)",
    "",
    ...(d.rules.length ? ["| Règle | Avant | Après |", "|---|---|---|", ...d.rules.map((r) => `| ${r.rule} | ${r.before} | ${r.after} |`)] : ["Aucun changement."]),
    "",
  ];
  return L.join("\n");
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  const [beforeFile, afterFile, beforeLabel = "avant", afterLabel = "après"] = process.argv.slice(2);
  try {
    if (!beforeFile || !afterFile) throw new Error("usage: tsx src/crawlie-compare.ts <avant.json> <après.json> [libellé avant] [libellé après]");
    const read = (f: string) => JSON.parse(readFileSync(f, "utf8")) as CrawlieReport;
    process.stdout.write(renderCrawlieDiff(compareCrawlie(read(beforeFile), read(afterFile)), beforeLabel, afterLabel));
  } catch (err) {
    process.stderr.write(`crawlie-compare : ${err instanceof Error ? err.message : String(err)}\n`);
    process.exit(1);
  }
}
