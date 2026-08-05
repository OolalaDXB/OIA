import { readFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { loadEnv, DEFAULT_CONFIDENCE_FLOOR } from "@oia/config";
import {
  validateSeedDataset,
  validateManifest,
  ingestOfficialArtifact,
  safeFetch,
  evaluateM0Gate,
  automatedRecommendation,
  evaluateDeadlineGate,
  compareRecord,
  discoveredLead,
  type SeedRecord,
  type IngestionResult,
  type LiveFetchAttempt,
  type ObservedForRecord,
  type ConsoleRecord,
  type ConsoleData,
} from "@oia/ingestion";
import { deriveStrategicRoute } from "@oia/scoring";
import { assembleOpportunity } from "./m0";
import { fromRoot } from "./paths";

/**
 * Full Milestone-0 run (spec §11): validate seed → ingest supplied official
 * artifacts → evaluate EACH seed record with its OWN context → compare against
 * the seed hypothesis → write outputs, including console.json which the review
 * console (apps/web) renders. Headline deliverable: discrepancies.md.
 *
 *   pnpm --filter @oia/workers run m0:run
 */

function distinctFactFields(ing: IngestionResult): string[] {
  return [...new Set(ing.facts.map((f) => f.field))];
}

async function main() {
  const env = loadEnv({
    ...process.env,
    SUPABASE_URL: process.env.SUPABASE_URL ?? "https://placeholder.supabase.co",
    SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY ?? "placeholder",
  });
  const seedPath = fromRoot("data/seeds/bawaba-funding-opportunities.json");
  const manifestPath = fromRoot("data/artifacts/manifest.json");
  const outDir = fromRoot("outputs/milestone-0");
  mkdirSync(outDir, { recursive: true });
  const today = new Date().toISOString().slice(0, 10);
  const warnings: string[] = [];

  if (!existsSync(seedPath)) {
    console.error(`Seed not found: ${seedPath}. Run is paused until it is supplied.`);
    process.exit(2);
  }
  const seedValidation = validateSeedDataset(JSON.parse(readFileSync(seedPath, "utf8")));
  if (!seedValidation.ok || !seedValidation.dataset) {
    console.error("Seed invalid:\n" + seedValidation.errors.map((e) => `  - ${e}`).join("\n"));
    process.exit(1);
  }
  const seed = seedValidation.dataset;

  const ingestionByFile = new Map<string, IngestionResult>();
  const liveFetch = async (url: string): Promise<LiveFetchAttempt> =>
    (await safeFetch(url, { userAgent: env.FETCH_USER_AGENT, timeoutMs: env.FETCH_TIMEOUT_MS })).attempt;

  if (existsSync(manifestPath)) {
    const mv = validateManifest(JSON.parse(readFileSync(manifestPath, "utf8")));
    if (!mv.ok || !mv.manifest) {
      console.error("Manifest invalid:\n" + mv.errors.map((e) => `  - ${e}`).join("\n"));
      process.exit(1);
    }
    const manifestDir = dirname(manifestPath);
    for (const entry of mv.manifest.artifacts) {
      const filePath = join(manifestDir, entry.localFilename);
      if (!existsSync(filePath)) {
        warnings.push(`artifact file not supplied: ${entry.localFilename}`);
        continue;
      }
      ingestionByFile.set(entry.localFilename, await ingestOfficialArtifact(entry, readFileSync(filePath), { liveFetch }));
    }
  } else {
    warnings.push("no manifest.json — all records evaluated without official artifacts");
  }

  const records: ConsoleRecord[] = [];
  for (const rec of seed.records) records.push(await evaluateRecord(rec, ingestionByFile, liveFetch, today));

  const recommendationCounts: Record<string, number> = {};
  for (const r of records) recommendationCounts[r.recommendation] = (recommendationCounts[r.recommendation] ?? 0) + 1;
  const totalDisc = records.reduce((n, r) => n + r.discrepancies.length, 0);

  const data: ConsoleData = {
    note: "Milestone 0 real run. Automated (no human sign-off): nothing is human-VERIFIED, so no item is PURSUE. Live external fetch is blocked; official content supplied as local files.",
    run: { records: records.length, artifactsIngested: ingestionByFile.size, discrepancies: totalDisc, warnings, recommendationCounts },
    records,
  };
  writeFileSync(join(outDir, "console.json"), JSON.stringify(data, null, 2), "utf8");
  writeMarkdown(outDir, data);

  console.log(`Records: ${records.length} | artifacts ingested: ${ingestionByFile.size} | discrepancies: ${totalDisc}`);
  console.log(`Outputs (incl. console.json) written to ${outDir}`);
}

function unresolvedQuestions(gateFailed: string[] | undefined, confirmPending: boolean, appUnknown: boolean): string[] {
  const q: string[] = [];
  if (appUnknown) q.push("Application/award eligibility not yet determined (UNKNOWN).");
  if (confirmPending) q.push("A deadline is marked 'to be confirmed' — cannot be verified.");
  for (const r of gateFailed ?? []) q.push(`Gate: ${r}`);
  return q;
}

async function evaluateRecord(
  rec: SeedRecord,
  ingestionByFile: Map<string, IngestionResult>,
  liveFetch: (url: string) => Promise<LiveFetchAttempt>,
  today: string,
): Promise<ConsoleRecord> {
  const expected = {
    recommendation: rec.expectedRecommendation,
    verificationStatus: rec.expectedVerificationStatus,
    sourceFormat: rec.expectedSourceFormat,
  };
  const base = {
    id: rec.id,
    title: rec.title,
    issuer: rec.issuer,
    officialUrl: rec.officialUrl,
    discoveryUrl: rec.discoveryUrl,
    applicationUrl: rec.applicationUrl,
    expected,
    humanReview: "PENDING" as const,
  };

  // Path A: linked to a supplied official artifact.
  if (rec.localArtifact && ingestionByFile.has(rec.localArtifact)) {
    const ing = ingestionByFile.get(rec.localArtifact)!;
    const opp = assembleOpportunity(rec.id, ing, { today, isClosedCall: rec.isClosedCall, isAggregatorOnly: rec.isAggregatorOnly });
    const confirmPending = ing.deadlines.some((d) => d.isConfirmPending);
    const deadlineConflicts = [...new Set(ing.deadlines.flatMap((d) => d.conflicts))];
    const observed: ObservedForRecord = {
      linkedBy: "localArtifact",
      hasArtifact: ing.artifact.processing === "SUCCESS",
      artifactId: ing.artifact.id,
      sourceFormat: ing.artifact.sourceFormat,
      verificationStatus: ing.verification.verificationStatus,
      recommendation: opp.recommendation,
      liveFetchStatus: ing.artifact.liveFetch?.fetchStatus,
      factFields: distinctFactFields(ing),
    };
    return {
      ...base,
      linkedBy: "localArtifact",
      artifact: {
        id: ing.artifact.id,
        sourceFormat: ing.artifact.sourceFormat,
        contentHash: ing.artifact.contentHash,
        renderMethod: ing.artifact.renderMethod,
        byteSize: ing.artifact.byteSize,
        pageCount: ing.artifact.pageCount,
        localFilename: ing.artifact.localFilename,
        processing: ing.artifact.processing,
        processingError: ing.artifact.processingError,
      },
      liveFetch: ing.artifact.liveFetch
        ? { attemptedUrl: ing.artifact.liveFetch.attemptedUrl, status: ing.artifact.liveFetch.fetchStatus, egressDenied: ing.artifact.liveFetch.egressDenied, proxyCode: ing.artifact.liveFetch.proxyCode, error: ing.artifact.liveFetch.error }
        : undefined,
      verificationStatus: ing.verification.verificationStatus,
      verificationEvidence: ing.verification.verificationEvidence,
      application: opp.application,
      award: opp.award,
      strategicRoute: opp.strategicRoute,
      scores: { relevance: null, winPotential: null, infoConfidence: opp.infoConfidence },
      gate: opp.gate,
      recommendation: opp.recommendation,
      facts: ing.facts.map((f) => ({
        field: f.field, normalizedValue: f.normalizedValue, classification: f.classification, locator: f.locator,
        extractionMethod: f.extractionMethod, extractingProvider: f.extractingProvider, extractingModel: f.extractingModel,
        extractionConfidence: f.extractionConfidence, originalSourceText: f.originalSourceText,
      })),
      deadlines: ing.deadlines.map((d) => ({
        normalized: d.normalized, originalSourceString: d.originalSourceString, deadlineType: d.deadlineType,
        isConfirmPending: d.isConfirmPending, locator: d.locator, conflicts: d.conflicts,
      })),
      conflicts: deadlineConflicts,
      discrepancies: compareRecord(rec, observed),
      unresolvedQuestions: unresolvedQuestions(opp.gate.failedReasons, confirmPending, opp.application === "UNKNOWN"),
      warnings: ing.warnings,
    };
  }

  // Path B / C: no official artifact.
  const url = rec.officialUrl ?? rec.applicationUrl ?? rec.discoveryUrl;
  const live = url ? await liveFetch(url) : undefined;
  const isAggregator = !!rec.isAggregatorOnly;
  const verification = isAggregator ? discoveredLead(rec.discoveryUrl ?? url ?? "", rec.issuer) : undefined;
  const verificationStatus = verification?.verificationStatus ?? "SOURCE_UNAVAILABLE";

  const gateInput = {
    fetchStatus: live?.fetchStatus ?? "NOT_ATTEMPTED",
    verificationStatus,
    sourceFormat: "UNKNOWN" as const,
    hasOfficialArtifact: false,
    isAggregatorOnly: isAggregator,
    isClosedCall: !!rec.isClosedCall,
    deadline: evaluateDeadlineGate({ deadlines: [], today, rollingStated: false }),
    application: "UNKNOWN" as const,
    award: "UNKNOWN" as const,
    hasExactNextAction: false,
    infoConfidence: 0,
    confidenceFloor: DEFAULT_CONFIDENCE_FLOOR,
  };
  const gate = evaluateM0Gate(gateInput);
  const recommendation = automatedRecommendation(gateInput, gate);
  const linkedBy: ObservedForRecord["linkedBy"] = rec.localArtifact ? "localArtifact" : rec.officialUrl ? "officialUrl" : rec.discoveryUrl ? "discoveryUrl" : "none";
  const observed: ObservedForRecord = { linkedBy, hasArtifact: false, verificationStatus, recommendation, liveFetchStatus: live?.fetchStatus, factFields: [] };

  return {
    ...base,
    linkedBy,
    liveFetch: live ? { attemptedUrl: live.attemptedUrl, status: live.fetchStatus, egressDenied: live.egressDenied, proxyCode: live.proxyCode, error: live.error } : undefined,
    verificationStatus,
    verificationEvidence: verification?.verificationEvidence ?? (rec.localArtifact ? [`artifact file '${rec.localArtifact}' not supplied`] : ["live fetch blocked; no official artifact supplied"]),
    application: "UNKNOWN",
    award: "UNKNOWN",
    strategicRoute: deriveStrategicRoute("UNKNOWN", "UNKNOWN"),
    scores: { relevance: null, winPotential: null, infoConfidence: 0 },
    gate,
    recommendation,
    facts: [],
    deadlines: [],
    conflicts: [],
    discrepancies: compareRecord(rec, observed),
    unresolvedQuestions: unresolvedQuestions(gate.failedReasons, false, true),
    warnings: rec.localArtifact && !ingestionByFile.has(rec.localArtifact) ? [`linked artifact '${rec.localArtifact}' not supplied`] : [],
  };
}

function writeMarkdown(outDir: string, data: ConsoleData) {
  const { records, run } = data;

  const disc: string[] = ["# Milestone 0 — Discrepancies (seed hypothesis vs observed)", ""];
  const withDisc = records.filter((r) => r.discrepancies.length > 0);
  if (withDisc.length === 0) disc.push("_No discrepancies: every seed hypothesis matched the observed result._", "");
  for (const r of withDisc) {
    disc.push(`## ${r.id} (${r.issuer})`);
    for (const d of r.discrepancies)
      disc.push(`- **${d.field}** — seed \`${d.seedExpectation}\` vs observed \`${d.observed}\`\n  - evidence: ${d.evidence}\n  - rule: \`${d.ruleApplied}\` · human review: ${d.humanReviewRequired ? "YES" : "no"}`);
    disc.push("");
  }
  if (run.warnings.length) disc.push("## Run warnings", ...run.warnings.map((w) => `- ${w}`), "");
  writeFileSync(join(outDir, "discrepancies.md"), disc.join("\n"), "utf8");

  const short = records.filter((r) => ["PURSUE", "PARTNER", "INVESTIGATE"].includes(r.recommendation));
  writeFileSync(join(outDir, "shortlist.md"), [
    "# Milestone 0 — Shortlist (observed)", "",
    "> Automated run; nothing is human-VERIFIED, so no item is PURSUE.", "",
    "| Record | Issuer | Reco | Verification | Source | Live | Info | Facts |", "|---|---|---|---|---|---|---|---|",
    ...(short.length ? short.map((r) => `| ${r.id} | ${r.issuer} | ${r.recommendation} | ${r.verificationStatus} | ${r.artifact?.sourceFormat ?? "-"} | ${r.liveFetch?.status ?? "-"} | ${r.scores.infoConfidence} | ${r.facts.length} |`) : ["| _none_ | | | | | | | |"]),
    "",
  ].join("\n"), "utf8");

  const rej = records.filter((r) => r.recommendation === "REJECT");
  writeFileSync(join(outDir, "rejections.md"), ["# Milestone 0 — Rejections", "", ...(rej.length ? rej.map((r) => `- **${r.id}** (${r.issuer}) — verification=${r.verificationStatus}, live=${r.liveFetch?.status ?? "-"}`) : ["_none_"]), ""].join("\n"), "utf8");

  writeFileSync(join(outDir, "run-report.md"), [
    "# Milestone 0 — Run report", "",
    `- seed records evaluated: ${run.records}`,
    `- official artifacts ingested: ${run.artifactsIngested}`,
    `- total discrepancies (seed vs observed): ${run.discrepancies}`, "",
    "## Recommendations (observed)",
    ...["PURSUE", "PARTNER", "INVESTIGATE", "MONITOR", "REJECT"].map((k) => `- ${k}: ${run.recommendationCounts[k] ?? 0}`), "",
    "## Warnings", ...(run.warnings.length ? run.warnings.map((w) => `- ${w}`) : ["- none"]), "",
    "> Live external fetch is blocked in this environment; official content was supplied as local files. No production-readiness claim relies on fixtures.", "",
  ].join("\n"), "utf8");
}

main().catch((err) => {
  console.error("m0:run failed:", err);
  process.exitCode = 1;
});
