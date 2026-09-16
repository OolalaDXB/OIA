import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { ConsoleData, ConsoleRecord } from "@oia/ingestion/console";
import { PROJECT_REGISTRY, findProject } from "@oia/registry";
import { createMistralProvider, type MistralProvider } from "@oia/providers";
import {
  ANALYST_SYSTEM,
  EligibilityVerdictSchema,
  analystPrompt,
  verdictViolations,
  type EligibilityVerdict,
} from "@oia/intelligence";
import { fromRoot } from "./paths";

/**
 * Read every opportunity against the project it was found for, and say whether
 * that project could apply.
 *
 * The scout left 270 records and not one eligibility assessment. A shortlist
 * nobody has time to read is the same as no shortlist, so this is what turns it
 * into a dozen worth an hour — and, just as importantly, leaves the other 258
 * with a written, contestable reason for being set aside.
 *
 * It does not open the gate. `eligibilityAssessed` stays false: a model judging
 * is not a human judging, and a gate a model can open is not a gate. What
 * changes is the reason a record is blocked — from "nobody has judged whether
 * we can apply" to "a model judged, you have not confirmed" — and the order you
 * see things in.
 *
 *   pnpm --filter @oia/workers analyse
 *   pnpm --filter @oia/workers analyse -- --limit 20
 */

function arg(name: string): string | undefined {
  const hit = process.argv.find((a) => a === `--${name}` || a.startsWith(`--${name}=`));
  if (!hit) return undefined;
  if (hit.includes("=")) return hit.slice(hit.indexOf("=") + 1);
  const next = process.argv[process.argv.indexOf(hit) + 1];
  return next && !next.startsWith("--") ? next : "";
}

/** Everything the pipeline extracted, as one block for the model to read. */
export function factTextOf(record: ConsoleRecord): string {
  const lines = record.facts.map((f) => `${f.field}: ${f.normalizedValue}`);
  return [record.title, record.issuer, ...lines].filter(Boolean).join("\n");
}

/**
 * Which records are worth spending a model call on.
 *
 * Analysing a record that carries nothing but its title would produce
 * NEEDS_INFO every time, at full price. Skipping it is not a gap: the record
 * keeps saying, correctly, that nobody has judged it.
 */
export function analysable(record: ConsoleRecord): boolean {
  if ((record.discoveredFor ?? []).length === 0) return false;
  return factTextOf(record).length >= 200;
}

export interface AnalysedRecord {
  recordId: string;
  projectSlug: string;
  verdict: EligibilityVerdict;
  droppedCitations: number;
  model: string;
  at: string;
}

async function main() {
  const apiKey = process.env["MISTRAL_API_KEY"] ?? "";
  const outDir = fromRoot("outputs/analyst");
  mkdirSync(outDir, { recursive: true });

  const consolePath = fromRoot("apps/web/src/data/console.json");
  const data = JSON.parse(readFileSync(consolePath, "utf8")) as ConsoleData;

  const candidates = data.records.filter(analysable);
  const limit = Number(arg("limit") ?? process.env["ANALYST_LIMIT"] ?? "40");
  const queue = candidates.slice(0, limit);

  if (!apiKey) {
    console.warn(
      `analyse: MISTRAL_API_KEY is not set — ${candidates.length} record(s) were NOT assessed. ` +
        "Nothing else in this run is affected.",
    );
    writeFileSync(
      join(outDir, "report.md"),
      `# Analyste\n\n> Non exécuté : pas de MISTRAL_API_KEY. ${candidates.length} fiche(s) en attente.\n\n` +
        `# Analyst\n\n> Not run: no MISTRAL_API_KEY. ${candidates.length} record(s) waiting.\n`,
      "utf8",
    );
    return;
  }

  const model = process.env["LLM_MODEL"] ?? "mistral-large-latest";
  const rawDir = join(outDir, "raw");
  mkdirSync(rawDir, { recursive: true });
  const mistral: MistralProvider = createMistralProvider({
    apiKey,
    model,
    maxCalls: queue.length * 2,
    onRawResponse: ({ purpose, text }) =>
      writeFileSync(join(rawDir, `${purpose.replace(/[^a-z0-9._-]+/gi, "_")}.json`), text, "utf8"),
  });

  console.log(`analyse: ${queue.length} of ${candidates.length} analysable record(s), model ${model}`);

  const results: AnalysedRecord[] = [];
  const failures: string[] = [];
  let droppedTotal = 0;

  for (const record of queue) {
    // The project whose query surfaced it. A record found for several is
    // assessed against the first: the others are a separate question, and
    // answering it at the same price twice is not worth it yet.
    const slug = (record.discoveredFor ?? [])[0]!;
    const entry = findProject(PROJECT_REGISTRY, slug);
    if (!entry) continue;

    const factText = factTextOf(record);
    try {
      const { data: raw } = await mistral.extract({
        schema: EligibilityVerdictSchema,
        schemaName: "EligibilityVerdict",
        system: ANALYST_SYSTEM,
        input: analystPrompt({
          title: record.title,
          issuer: record.issuer,
          kind: String(record.opportunityKind ?? "GRANT"),
          factText,
          project: {
            slug: entry.slug,
            name: entry.name,
            oneLiner: entry.oneLiner,
            sectors: entry.sectors,
            geographies: entry.geographies,
            entities: entry.legalEntities.map((e) => (typeof e === "string" ? e : String(e))),
          },
        }),
        purpose: `analyse:${record.id}`,
      });

      const { kept, dropped } = verdictViolations(raw, factText);
      droppedTotal += dropped.length;
      for (const d of dropped) console.warn(`[${record.id}] dropped a citation: ${d.reason}`);
      results.push({
        recordId: record.id,
        projectSlug: slug,
        verdict: kept,
        droppedCitations: dropped.length,
        model,
        at: new Date().toISOString(),
      });
      console.log(`[${record.id}] ${kept.verdict} — ${kept.reason.fr.slice(0, 80)}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[${record.id}] ${message}`);
      failures.push(`${record.id}: ${message.slice(0, 160)}`);
      if (message.includes("call budget")) break;
    }
  }

  const byVerdict = results.reduce<Record<string, number>>((acc, r) => {
    acc[r.verdict.verdict] = (acc[r.verdict.verdict] ?? 0) + 1;
    return acc;
  }, {});
  const spent = mistral.usage();

  writeFileSync(join(outDir, "verdicts.json"), JSON.stringify({ generatedAt: new Date().toISOString(), results }, null, 2), "utf8");
  writeFileSync(
    join(outDir, "report.md"),
    [
      "# Analyste / Analyst",
      "",
      `- fiches évaluées / records assessed: ${results.length} of ${candidates.length} analysable`,
      `- ${Object.entries(byVerdict).map(([k, v]) => `${k}: ${v}`).join(" · ") || "—"}`,
      `- citations inventées et retirées / invented citations dropped: ${droppedTotal}`,
      `- appels modèle / model calls: ${spent.calls} · tokens ${spent.inputTokens}/${spent.outputTokens}`,
      `- échecs / failures: ${failures.length}`,
      "",
      // A run that assessed nothing must say WHY in the report, not only in a
      // console log nobody reads. The last one reported "0 of 87" with no
      // reason anywhere, and the answer was one HTTP status away.
      ...(failures.length > 0
        ? ["## Échecs / Failures", "", ...failures.slice(0, 10).map((f) => `- ${f}`), ""]
        : []),
      "> Chaque verdict a été produit par un modèle et n'est PAS une vérification humaine.",
      "> Aucun ne débloque le gate : il change l'ordre dans lequel tu regardes, pas ce que tu peux poursuivre.",
      "",
      "> Every verdict was produced by a model and is NOT a human verification.",
      "> None of them opens the gate: they change the order you look in, not what you may pursue.",
      "",
      ...results.map(
        (r) =>
          `- **${r.recordId}** (${r.projectSlug}) — **${r.verdict.verdict}**\n` +
          `  - FR: ${r.verdict.reason.fr}\n  - EN: ${r.verdict.reason.en}\n` +
          `  - ${r.verdict.citations.length} citation(s) vérifiée(s)`,
      ),
      "",
    ].join("\n"),
    "utf8",
  );
  // Write the verdicts back onto the console dataset. A report nobody opens is
  // the same as not running — the same lesson the scout already taught.
  const byId = new Map(results.map((r) => [r.recordId, r]));
  const updated: ConsoleData = {
    ...data,
    records: data.records.map((r) => {
      const found = byId.get(r.id);
      if (!found) return r;
      return {
        ...r,
        assessment: {
          verdict: found.verdict.verdict,
          projectSlug: found.projectSlug,
          reason: found.verdict.reason,
          nextAction: found.verdict.nextAction,
          ...(found.verdict.entity ? { entity: found.verdict.entity } : {}),
          ...(found.verdict.missing.length > 0 ? { missing: found.verdict.missing } : {}),
          citations: found.verdict.citations,
          by: "model" as const,
          model: found.model,
          at: found.at,
        },
        gate: r.gate
          ? {
              ...r.gate,
              // The gate is NOT opened. Only the wording of the block changes,
              // so the console can say who judged and who still has not.
              failedReasons: r.gate.failedReasons.map((reason) =>
                reason === "application eligibility is UNKNOWN" || reason === "eligibility not assessed"
                  ? "a model judged eligibility — you have not confirmed it"
                  : reason,
              ),
            }
          : r.gate,
      };
    }),
  };
  writeFileSync(consolePath, JSON.stringify(updated, null, 2), "utf8");
  console.log(`analyse: ${results.length} verdict(s), ${droppedTotal} invented citation(s) dropped`);
}

if (process.argv[1] && process.argv[1].endsWith("analyse.ts")) {
  main().catch((err) => {
    console.error("analyse failed:", err);
    process.exitCode = 1;
  });
}
