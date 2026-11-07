/**
 * Exportation d'une fenêtre (scripts/j0-export.sh, lecture seule d'Elmo) →
 * preuves de la table locale (src/evidence-store.ts). Une preuve par réponse,
 * avec son empreinte, la version servie, le jugement de Jev, les citations et
 * le coût selon la grille de prix. Seules les réponses de la fenêtre comptent.
 *
 * CLI : tsx src/j0-evidence.ts <subjectId> <windowId> <export.json> <evidence.jsonl>
 */
import { readFileSync } from "node:fs";
import { runCostUsd } from "./cost-grid.js";
import type { EvidenceRow } from "./elmo-import.js";
import { appendEvidence, sha256Hex } from "./evidence-store.js";
import { defaultSubjectsDir, listSubjectDirs, loadSubject } from "./load.js";
import type { SubjectBundle } from "./schema.js";

export interface WindowExport {
  exportedAt: string;
  subjectId: string;
  startedAt: string;
  days: number;
  runs: {
    id: string;
    promptTags: string[];
    model: string;
    provider: string;
    version: string;
    webSearch: boolean;
    createdAt: string;
    text: string | null;
    usage: unknown;
    searchItems: number;
    citations: string[];
    brandMentioned: boolean | null;
    competitorsMentioned: string[];
  }[];
  failed: { model: string; createdAt: string }[];
}

/** Structure propre à OIA, rangée dans `structured` de chaque preuve. */
export interface EvidenceStructured {
  fromElmo: true;
  provider: string;
  webSearch: boolean;
  brandMentioned: boolean | null;
  competitorsMentioned: string[];
  usage: unknown;
  costFromUsage: boolean;
}

export function promptFromTags(tags: string[]): { id: string; version: number; language: string } | null {
  const oia = tags.map((t) => /^oia:([a-z0-9-]+)@v(\d+)$/.exec(t)).find(Boolean);
  if (!oia) return null;
  const lang = tags.map((t) => /^lang:([a-z]{2})$/.exec(t)).find(Boolean);
  return { id: oia[1]!, version: Number(oia[2]), language: lang?.[1] ?? "und" };
}

export function inWindow(exp: WindowExport, at: string): boolean {
  const t = Date.parse(at);
  const start = Date.parse(exp.startedAt);
  return t >= start && t < start + exp.days * 86_400_000;
}

export function toEvidence(b: SubjectBundle, exp: WindowExport, windowId: string): EvidenceRow[] {
  const clientId = b.subject.ownership === "internal" ? "oia-internal" : b.subject.id;
  return exp.runs
    .filter((r) => inWindow(exp, r.createdAt))
    .map((r) => {
      const prompt = promptFromTags(r.promptTags);
      if (!prompt) throw new Error(`run ${r.id} : question sans tag oia:<id>@v<n>, preuve impossible à rattacher au panel`);
      const text = r.text ?? "";
      const cost = runCostUsd({ provider: r.provider, version: r.version, webSearch: r.webSearch, usage: r.usage, searchItems: r.searchItems });
      if (!cost) throw new Error(`run ${r.id} : ${r.provider}:${r.version} absent de la grille de prix`);
      const structured: EvidenceStructured = {
        fromElmo: true,
        provider: r.provider,
        webSearch: r.webSearch,
        brandMentioned: r.brandMentioned,
        competitorsMentioned: r.competitorsMentioned,
        usage: r.usage,
        costFromUsage: cost.fromUsage,
      };
      return {
        id: `elmo:${r.id}`,
        clientId,
        siteId: b.subject.id,
        subjectId: b.subject.id,
        windowId,
        promptId: prompt.id,
        promptVersion: prompt.version,
        promptLanguage: prompt.language,
        engine: r.model,
        engineVersion: r.version,
        collectorName: "elmo",
        collectorRunId: r.id,
        receivedAt: r.createdAt,
        rawText: text,
        rawSha256Hex: sha256Hex(text),
        structured: structured as unknown as Record<string, unknown>,
        citations: [...new Set(r.citations)].map((url) => ({ url })),
        costUsd: Math.round(cost.usd * 1e6) / 1e6,
      };
    });
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  const [subjectId, windowId, exportFile, evidenceFile] = process.argv.slice(2);
  try {
    if (!subjectId || !windowId || !exportFile || !evidenceFile) throw new Error("usage: tsx src/j0-evidence.ts <subjectId> <windowId> <export.json> <evidence.jsonl>");
    const dir = listSubjectDirs(defaultSubjectsDir()).find((d) => d.split(/[\\/]/).pop() === subjectId);
    if (!dir) throw new Error(`aucun sujet "${subjectId}"`);
    const exp = JSON.parse(readFileSync(exportFile, "utf8")) as WindowExport;
    const r = appendEvidence(evidenceFile, toEvidence(loadSubject(dir), exp, windowId));
    process.stdout.write(`${r.added} preuve(s) ajoutée(s), ${r.skipped} déjà présente(s)\n`);
  } catch (err) {
    process.stderr.write(`j0-evidence : ${err instanceof Error ? err.message : String(err)}\n`);
    process.exit(1);
  }
}
