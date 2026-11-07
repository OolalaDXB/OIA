/**
 * Rapport d'une fenêtre (bloc B2 du mandat v7) et sa vérification (B3), à
 * partir de la table des preuves locale uniquement : jamais de chiffre saisi
 * à la main, jamais d'appel à un fournisseur d'IA.
 *
 * Chaque chiffre porte sa provenance : nombre de preuves utilisées et
 * empreinte de leurs identifiants. `verify` recalcule tout depuis les preuves
 * et compare au rapport enregistré (figures.json), contrôle l'empreinte de
 * chaque réponse et les versions servies.
 *
 * Les chiffres sont des indicateurs de visibilité mesurés par les API des
 * assistants, pas une mesure exhaustive de ce que voient leurs utilisateurs.
 *
 * CLI :
 *   tsx src/j0-report.ts report <subjectId> <windowId> <evidence.jsonl> <outDir> [failed.json] [fact-keywords.yaml]
 *   tsx src/j0-report.ts verify <subjectId> <windowId> <evidence.jsonl> <outDir> [failed.json] [fact-keywords.yaml]
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { isDeepStrictEqual } from "node:util";
import { parse } from "yaml";
import type { EvidenceRow } from "./elmo-import.js";
import { corruptedEvidence, readEvidence } from "./evidence-store.js";
import type { EvidenceStructured } from "./j0-evidence.js";
import { classifyCitation, mentions, profileUrls } from "./j0-reanalysis.js";
import { checkFact, type ReferenceFact } from "./fact-check.js";
import { defaultSubjectsDir, listSubjectDirs, loadSubject } from "./load.js";
import type { SubjectBundle } from "./schema.js";

export interface Provenance {
  evidenceCount: number;
  /** SHA-256 des identifiants de preuves utilisés, triés. */
  digest: string;
}

export interface ReportFigures {
  reportFormat: 1;
  subjectId: string;
  windowId: string;
  status: "à valider par Mickaël";
  window: { startedAt: string; days: number; daysWithResponses: number[]; missingDays: number[]; failedRuns: number };
  perEngine: {
    engine: string;
    versions: string[];
    responses: number;
    judged: number;
    mentioned: number;
    presencePct: number;
    daily: { day: number; pct: number }[];
    minPct: number;
    maxPct: number;
    estimatedCostUsd: number;
    provenance: Provenance;
  }[];
  total: { responses: number; judged: number; mentioned: number; presencePct: number; minPct: number; maxPct: number; provenance: Provenance };
  sources: { brandSite: number; brandProfiles: number; topDomains: { domain: string; n: number }[]; provenance: Provenance };
  competitorsInstead: { name: string; runs: number; rejectedByOia: boolean }[];
  factCheck: { factId: string; statement: string; checkedRuns: number; matches: number; contradicts: number; absent: number }[];
  spend: { estimatedUsd: number; worstCaseRuns: number; realUsd: null; realNote: string; provenance: Provenance };
}

export interface FactKeywords {
  facts: { id: string; keywords: string[]; contradictions?: string[] }[];
}

const DAY_MS = 86_400_000;
const pct = (n: number, d: number) => (d === 0 ? 0 : Math.round((1000 * n) / d) / 10);
const prov = (rows: EvidenceRow[]): Provenance => ({
  evidenceCount: rows.length,
  digest: createHash("sha256").update(rows.map((r) => r.id).sort().join("\n")).digest("hex"),
});
const st = (r: EvidenceRow) => r.structured as unknown as EvidenceStructured;

export function computeFigures(
  b: SubjectBundle,
  windowId: string,
  evidence: EvidenceRow[],
  window: { startedAt: string; days: number },
  failed: { model: string; createdAt: string }[],
  keywords: FactKeywords,
): ReportFigures {
  const rows = evidence.filter((e) => e.windowId === windowId && e.subjectId === b.subject.id);
  const start = Date.parse(window.startedAt);
  const dayOf = (r: EvidenceRow) => Math.floor((Date.parse(r.receivedAt) - start) / DAY_MS) + 1;
  const judged = (rs: EvidenceRow[]) => rs.filter((r) => st(r).brandMentioned !== null);
  const mentioned = (rs: EvidenceRow[]) => rs.filter((r) => st(r).brandMentioned === true);
  const days = [...new Set(rows.map(dayOf))].sort((a, z) => a - z);
  const dailyOf = (rs: EvidenceRow[]) =>
    days.map((day) => {
      const j = judged(rs.filter((r) => dayOf(r) === day));
      return { day, pct: pct(mentioned(j).length, j.length) };
    });
  const engines = [...new Set(rows.map((r) => r.engine))].sort();

  const perEngine = engines.map((engine) => {
    const rs = rows.filter((r) => r.engine === engine);
    const daily = dailyOf(rs);
    return {
      engine,
      versions: [...new Set(rs.map((r) => r.engineVersion ?? ""))].sort(),
      responses: rs.length,
      judged: judged(rs).length,
      mentioned: mentioned(rs).length,
      presencePct: pct(mentioned(rs).length, judged(rs).length),
      daily,
      minPct: daily.length ? Math.min(...daily.map((d) => d.pct)) : 0,
      maxPct: daily.length ? Math.max(...daily.map((d) => d.pct)) : 0,
      estimatedCostUsd: Math.round(rs.reduce((n, r) => n + r.costUsd, 0) * 1e4) / 1e4,
      provenance: prov(rs),
    };
  });
  const totalDaily = dailyOf(rows);

  const s = b.subject;
  const brandDomains = [s.urls.primary, ...s.urls.additional.filter((a) => a.status !== "rejected").map((a) => a.url)].map((u) =>
    new URL(u).hostname.replace(/^www\./, ""),
  );
  const competitorDomains = s.competitors.filter((c) => c.status !== "rejected").flatMap((c) => c.domains);
  const profiles = profileUrls(b);
  let brandSite = 0;
  let brandProfiles = 0;
  const domains = new Map<string, number>();
  for (const r of rows) {
    for (const { url } of r.citations) {
      const c = classifyCitation(url, brandDomains, profiles, competitorDomains);
      if (c === "marque-site") brandSite++;
      else if (c === "marque-profil") brandProfiles++;
      else {
        try {
          const h = new URL(url).hostname.replace(/^www\./, "");
          domains.set(h, (domains.get(h) ?? 0) + 1);
        } catch {
          // URL illisible : ignorée dans le classement des domaines.
        }
      }
    }
  }

  const rejected = new Set(s.competitors.filter((c) => c.status === "rejected").map((c) => c.name));
  const instead = new Map<string, number>();
  for (const r of rows) {
    if (st(r).brandMentioned !== false) continue;
    for (const name of st(r).competitorsMentioned) instead.set(name, (instead.get(name) ?? 0) + 1);
  }

  const aliases = s.aliases.filter((a) => a.status !== "rejected" && a.kind !== "domain").map((a) => a.value);
  const aboutBrand = rows.filter((r) => mentions(r.rawText, aliases).length > 0);
  const factCheck = b.facts.facts
    .filter((f) => f.status === "validated")
    .flatMap((f) => {
      const k = keywords.facts.find((x) => x.id === f.id);
      if (!k) return [];
      const ref: ReferenceFact = { id: f.id, statement: f.statement, keywords: k.keywords, contradictions: k.contradictions };
      const results = aboutBrand.map((r) => checkFact(r.rawText, ref).status);
      return [{
        factId: f.id,
        statement: f.statement,
        checkedRuns: aboutBrand.length,
        matches: results.filter((x) => x === "matches").length,
        contradicts: results.filter((x) => x === "contradicts").length,
        absent: results.filter((x) => x === "absent").length,
      }];
    });

  const inWin = failed.filter((f) => {
    const t = Date.parse(f.createdAt);
    return t >= start && t < start + window.days * DAY_MS;
  });

  return {
    reportFormat: 1,
    subjectId: s.id,
    windowId,
    status: "à valider par Mickaël",
    window: {
      startedAt: window.startedAt,
      days: window.days,
      daysWithResponses: days,
      missingDays: Array.from({ length: window.days }, (_, i) => i + 1).filter((d) => !days.includes(d)),
      failedRuns: inWin.length,
    },
    perEngine,
    total: {
      responses: rows.length,
      judged: judged(rows).length,
      mentioned: mentioned(rows).length,
      presencePct: pct(mentioned(rows).length, judged(rows).length),
      minPct: totalDaily.length ? Math.min(...totalDaily.map((d) => d.pct)) : 0,
      maxPct: totalDaily.length ? Math.max(...totalDaily.map((d) => d.pct)) : 0,
      provenance: prov(rows),
    },
    sources: {
      brandSite,
      brandProfiles,
      topDomains: [...domains.entries()].sort((a, z) => z[1] - a[1] || a[0].localeCompare(z[0])).slice(0, 10).map(([domain, n]) => ({ domain, n })),
      provenance: prov(rows.filter((r) => r.citations.length > 0)),
    },
    competitorsInstead: [...instead.entries()]
      .sort((a, z) => z[1] - a[1] || a[0].localeCompare(z[0]))
      .map(([name, runs]) => ({ name, runs, rejectedByOia: rejected.has(name) })),
    factCheck,
    spend: {
      estimatedUsd: Math.round(rows.reduce((n, r) => n + r.costUsd, 0) * 1e4) / 1e4,
      worstCaseRuns: rows.filter((r) => !st(r).costFromUsage).length,
      realUsd: null,
      realNote: "À relever par Mickaël dans chaque console (OpenAI, Anthropic, Mistral, OpenRouter, TypeSafe), puis à reporter ici.",
      provenance: prov(rows),
    },
  };
}

export const LIMITS = [
  "Indicateurs de visibilité mesurés par les API des assistants, avec leur recherche web : ce ne sont pas les applications grand public (mémoire, localisation, choix de modèle propres à chaque application).",
  "Un run par jour et par question, sur une fenêtre de cinq jours : une variation d'un jour à l'autre peut relever du hasard des réponses.",
  "Langue unique (anglais) et panel de dix questions : la mesure ne couvre pas toutes les questions qu'un client peut poser.",
  "La mention de la marque est jugée par Jev (TypeSafe) ; les sources dépendent de ce que chaque API renvoie (Mistral Large 4 ne renvoie pas les siennes, Gemini renvoie des liens de redirection).",
  "Ce rapport ne prétend à aucune exhaustivité.",
];

export function renderReportMarkdown(b: SubjectBundle, f: ReportFigures): string {
  const L: string[] = [];
  L.push(`# Rapport ${f.windowId.toUpperCase()} · ${b.subject.displayName}`, "");
  L.push(`**Statut : ${f.status}.** Fenêtre démarrée le ${f.window.startedAt.slice(0, 16).replace("T", " ")} UTC, ${f.window.days} jours.`, "");
  L.push("## Présence de la marque dans les réponses", "");
  L.push("Part des réponses jugées par Jev qui mentionnent la marque ; intervalle = plus bas et plus haut des jours observés.", "");
  L.push("| Assistant | Version servie | Réponses | Jugées | Mentions | Présence | Intervalle (jours) |", "|---|---|---|---|---|---|---|");
  for (const e of f.perEngine) {
    L.push(`| ${e.engine} | ${e.versions.join(", ")} | ${e.responses} | ${e.judged} | ${e.mentioned} | ${e.presencePct} % | ${e.minPct} – ${e.maxPct} % |`);
  }
  const t = f.total;
  L.push(`| **Total** | | ${t.responses} | ${t.judged} | ${t.mentioned} | **${t.presencePct} %** | ${t.minPct} – ${t.maxPct} % |`, "");
  L.push("## Sources citées", "");
  L.push(`Site de la marque : ${f.sources.brandSite} citation(s). Profils officiels (comptés pour la marque, à l'adresse près) : ${f.sources.brandProfiles}.`, "");
  for (const d of f.sources.topDomains) L.push(`- ${d.domain} : ${d.n}`);
  L.push("", "## Concurrents cités quand la marque ne l'est pas", "");
  for (const c of f.competitorsInstead) L.push(`- ${c.name} : ${c.runs} réponse(s)${c.rejectedByOia ? " (retiré des concurrents par OIA : à ne pas interpréter)" : ""}`);
  if (!f.competitorsInstead.length) L.push("- aucun");
  L.push("", "## Contrôle des faits (première passe déterministe)", "");
  L.push("Sur les réponses qui nomment la marque, par mots-clés des faits validés. Une absence n'est pas une erreur : la réponse peut ne pas aborder le sujet.", "");
  L.push("| Fait validé | Réponses contrôlées | Cité | Contredit | Absent |", "|---|---|---|---|---|");
  for (const x of f.factCheck) L.push(`| ${x.statement} | ${x.checkedRuns} | ${x.matches} | ${x.contradicts} | ${x.absent} |`);
  L.push("", "Seconde passe par un modèle et revue croisée : désactivées (aucune dépense nouvelle) ; options à décider par Mickaël.", "");
  L.push("## Jours manquants", "");
  L.push(f.window.missingDays.length ? `Jours sans réponse : ${f.window.missingDays.join(", ")}.` : "Aucun jour manquant.");
  L.push(`Runs échoués pendant la fenêtre : ${f.window.failedRuns}.`, "");
  L.push("## Dépense", "");
  L.push(`Dépense estimée (grille de prix, src/cost-grid.ts) : ${f.spend.estimatedUsd.toFixed(2)} $, dont ${f.spend.worstCaseRuns} réponse(s) comptée(s) au majorant faute de compteurs.`);
  L.push(`Dépense réelle : **à relever**. ${f.spend.realNote}`, "");
  L.push("## Limites de la mesure", "");
  for (const l of LIMITS) L.push(`- ${l}`);
  L.push("", "## Provenance", "");
  L.push(`Tous les chiffres viennent de la table des preuves (${t.provenance.evidenceCount} réponses, empreinte ${t.provenance.digest.slice(0, 16)}…). Vérification : \`pnpm vis:j0-verify\`.`, "");
  return `${L.join("\n")}\n`;
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const inline = (s: string) => esc(s).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>").replace(/`(.+?)`/g, "<code>$1</code>");

/** Markdown du rapport → HTML autonome (titres, paragraphes, listes, tableaux). */
export function markdownToHtml(md: string, title: string): string {
  const out: string[] = [];
  const lines = md.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i]!;
    if (l.startsWith("|")) {
      const rows: string[][] = [];
      while (i < lines.length && lines[i]!.startsWith("|")) {
        const cells = lines[i]!.slice(1, -1).split("|").map((c) => c.trim());
        if (!cells.every((c) => /^-+$/.test(c))) rows.push(cells);
        i++;
      }
      i--;
      const [head, ...body] = rows;
      out.push("<table>", `<tr>${(head ?? []).map((c) => `<th>${inline(c)}</th>`).join("")}</tr>`);
      for (const r of body) out.push(`<tr>${r.map((c) => `<td>${inline(c)}</td>`).join("")}</tr>`);
      out.push("</table>");
    } else if (l.startsWith("- ")) {
      out.push("<ul>");
      while (i < lines.length && lines[i]!.startsWith("- ")) out.push(`<li>${inline(lines[i++]!.slice(2))}</li>`);
      i--;
      out.push("</ul>");
    } else if (/^#{1,3} /.test(l)) {
      const n = l.indexOf(" ");
      out.push(`<h${n}>${inline(l.slice(n + 1))}</h${n}>`);
    } else if (l.trim()) out.push(`<p>${inline(l)}</p>`);
  }
  return `<!DOCTYPE html>
<html lang="fr"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${esc(title)}</title>
<style>body{font-family:system-ui,sans-serif;max-width:60rem;margin:2rem auto;padding:0 1rem;color:#222}table{border-collapse:collapse;margin:1rem 0}th,td{border:1px solid #ccc;padding:.3rem .6rem;text-align:left}th{background:#f4f4f4}</style>
</head><body>
${out.join("\n")}
</body></html>
`;
}

export interface VerifyResult {
  ok: boolean;
  problems: string[];
}

export function verify(recomputed: ReportFigures, stored: ReportFigures, evidence: EvidenceRow[]): VerifyResult {
  const problems: string[] = [];
  const bad = corruptedEvidence(evidence.filter((e) => e.windowId === stored.windowId));
  if (bad.length) problems.push(`${bad.length} preuve(s) dont le texte ne correspond plus à l'empreinte : ${bad.slice(0, 5).join(", ")}`);
  for (const e of recomputed.perEngine) {
    const s = stored.perEngine.find((x) => x.engine === e.engine);
    if (!s) problems.push(`${e.engine} : absent du rapport`);
    else if (!isDeepStrictEqual(s.versions, e.versions)) problems.push(`${e.engine} : versions servies ${s.versions.join(",")} ≠ preuves ${e.versions.join(",")}`);
    else if (!isDeepStrictEqual(s.provenance, e.provenance)) problems.push(`${e.engine} : provenance différente (preuves ajoutées, retirées ou modifiées)`);
  }
  if (!isDeepStrictEqual(recomputed, stored)) {
    for (const k of Object.keys(recomputed) as (keyof ReportFigures)[]) {
      if (!isDeepStrictEqual(recomputed[k], stored[k])) problems.push(`chiffres différents dans « ${k} »`);
    }
  }
  return { ok: problems.length === 0, problems };
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  const [mode, subjectId, windowId, evidenceFile, outDir, failedFile, keywordsFile] = process.argv.slice(2);
  try {
    if (!mode || !subjectId || !windowId || !evidenceFile || !outDir) {
      throw new Error("usage: tsx src/j0-report.ts report|verify <subjectId> <windowId> <evidence.jsonl> <outDir> [failed.json] [fact-keywords.yaml]");
    }
    const dir = listSubjectDirs(defaultSubjectsDir()).find((d) => d.split(/[\\/]/).pop() === subjectId);
    if (!dir) throw new Error(`aucun sujet "${subjectId}"`);
    const b = loadSubject(dir);
    const evidence = readEvidence(evidenceFile);
    if (!evidence.length) throw new Error(`aucune preuve dans ${evidenceFile} : lancer d'abord vis:j0-close`);
    const failedData = failedFile && existsSync(failedFile) ? (JSON.parse(readFileSync(failedFile, "utf8")) as { startedAt: string; days: number; failed: { model: string; createdAt: string }[] }) : null;
    if (!failedData) throw new Error("fichier de fenêtre (failed.json : startedAt, days, failed) absent : lancer d'abord vis:j0-close");
    const keywords = keywordsFile && existsSync(keywordsFile) ? (parse(readFileSync(keywordsFile, "utf8")) as FactKeywords) : { facts: [] };
    const figures = computeFigures(b, windowId, evidence, failedData, failedData.failed, keywords);
    const figFile = join(outDir, "figures.json");
    if (mode === "report") {
      mkdirSync(outDir, { recursive: true });
      const md = renderReportMarkdown(b, figures);
      writeFileSync(figFile, `${JSON.stringify(figures, null, 2)}\n`);
      writeFileSync(join(outDir, `rapport-${windowId}.md`), md);
      writeFileSync(join(outDir, `rapport-${windowId}.html`), markdownToHtml(md, `Rapport ${windowId} · ${b.subject.displayName}`));
      process.stdout.write(`${join(outDir, `rapport-${windowId}.md`)}\n`);
    } else if (mode === "verify") {
      if (!existsSync(figFile)) throw new Error(`${figFile} absent : lancer d'abord vis:j0-report`);
      const r = verify(figures, JSON.parse(readFileSync(figFile, "utf8")) as ReportFigures, evidence);
      process.stdout.write(r.ok ? `VÉRIFIÉ : ${figures.total.responses} réponses, chiffres identiques, empreintes et versions conformes.\n` : `ÉCART :\n${r.problems.map((p) => `- ${p}`).join("\n")}\n`);
      process.exit(r.ok ? 0 : 1);
    } else throw new Error(`mode inconnu : ${mode}`);
  } catch (err) {
    process.stderr.write(`j0-report : ${err instanceof Error ? err.message : String(err)}\n`);
    process.exit(1);
  }
}
