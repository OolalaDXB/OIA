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
  type Discrepancy,
  type M0Recommendation,
} from "@oia/ingestion";
import { assembleOpportunity } from "./m0";
import { fromRoot } from "./paths";

/**
 * Full Milestone-0 run (spec §11): validate seed → ingest supplied official
 * artifacts → for EACH seed record, compute the OBSERVED result with that
 * record's own context → compare against the seed hypothesis → write outputs.
 * The headline deliverable is discrepancies.md: where the real result
 * contradicts the seed's assumptions.
 *
 *   pnpm --filter @oia/workers run m0:run
 */

interface RecordResult {
  id: string;
  issuer: string;
  linkedBy: ObservedForRecord["linkedBy"];
  recommendation: M0Recommendation;
  verificationStatus: string;
  sourceFormat?: string;
  liveFetchStatus?: string;
  infoConfidence: number;
  factCount: number;
  discrepancies: Discrepancy[];
  expected: {
    recommendation?: string;
    verificationStatus?: string;
    sourceFormat?: string;
  };
}

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

  // Ingest supplied artifacts (those whose local file exists).
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
      const ing = await ingestOfficialArtifact(entry, readFileSync(filePath), { liveFetch });
      ingestionByFile.set(entry.localFilename, ing);
    }
  } else {
    warnings.push("no manifest.json — all records evaluated without official artifacts");
  }

  // Evaluate each seed record with its own context, then compare.
  const results: RecordResult[] = [];
  for (const rec of seed.records) {
    const result = await evaluateRecord(rec, ingestionByFile, liveFetch, today);
    results.push(result);
  }

  writeOutputs(outDir, results, warnings, ingestionByFile.size, seed.records.length);
  const totalDisc = results.reduce((n, r) => n + r.discrepancies.length, 0);
  console.log(`Records: ${results.length} | artifacts ingested: ${ingestionByFile.size} | discrepancies: ${totalDisc}`);
  console.log(`Outputs written to ${outDir}`);
}

async function evaluateRecord(
  rec: SeedRecord,
  ingestionByFile: Map<string, IngestionResult>,
  liveFetch: (url: string) => Promise<LiveFetchAttempt>,
  today: string,
): Promise<RecordResult> {
  const expected = {
    recommendation: rec.expectedRecommendation,
    verificationStatus: rec.expectedVerificationStatus,
    sourceFormat: rec.expectedSourceFormat,
  };

  // Path A: linked to a supplied official artifact.
  if (rec.localArtifact && ingestionByFile.has(rec.localArtifact)) {
    const ing = ingestionByFile.get(rec.localArtifact)!;
    const opp = assembleOpportunity(rec.id, ing, {
      today,
      isClosedCall: rec.isClosedCall,
      isAggregatorOnly: rec.isAggregatorOnly,
    });
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
      id: rec.id,
      issuer: rec.issuer,
      linkedBy: "localArtifact",
      recommendation: opp.recommendation,
      verificationStatus: observed.verificationStatus,
      sourceFormat: observed.sourceFormat,
      liveFetchStatus: observed.liveFetchStatus,
      infoConfidence: opp.infoConfidence,
      factCount: ing.facts.length,
      discrepancies: compareRecord(rec, observed),
      expected,
    };
  }

  // Path B / C: no official artifact (officialUrl-only, aggregator, or missing file).
  const url = rec.officialUrl ?? rec.applicationUrl ?? rec.discoveryUrl;
  const live = url ? await liveFetch(url) : undefined;
  const isAggregator = !!rec.isAggregatorOnly;
  const verificationStatus = isAggregator
    ? discoveredLead(rec.discoveryUrl ?? url ?? "", rec.issuer).verificationStatus
    : "SOURCE_UNAVAILABLE";

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

  const observed: ObservedForRecord = {
    linkedBy: rec.localArtifact ? "localArtifact" : rec.officialUrl ? "officialUrl" : rec.discoveryUrl ? "discoveryUrl" : "none",
    hasArtifact: false,
    verificationStatus,
    recommendation,
    liveFetchStatus: live?.fetchStatus,
    factFields: [],
  };

  return {
    id: rec.id,
    issuer: rec.issuer,
    linkedBy: observed.linkedBy,
    recommendation,
    verificationStatus,
    liveFetchStatus: live?.fetchStatus,
    infoConfidence: 0,
    factCount: 0,
    discrepancies: compareRecord(rec, observed),
    expected,
  };
}

function writeOutputs(outDir: string, results: RecordResult[], warnings: string[], ingested: number, recordCount: number) {
  writeFileSync(join(outDir, "opportunities.json"), JSON.stringify(results, null, 2), "utf8");

  // Discrepancies — the headline output.
  const disc: string[] = ["# Milestone 0 — Discrepancies (seed hypothesis vs observed)", ""];
  const withDisc = results.filter((r) => r.discrepancies.length > 0);
  if (withDisc.length === 0) {
    disc.push("_No discrepancies: every seed hypothesis matched the observed result._");
  }
  for (const r of withDisc) {
    disc.push(`## ${r.id} (${r.issuer})`);
    for (const d of r.discrepancies) {
      disc.push(
        `- **${d.field}** — seed said \`${d.seedExpectation}\`, observed \`${d.observed}\`` +
          `\n  - evidence: ${d.evidence}\n  - rule: \`${d.ruleApplied}\`` +
          `\n  - human review required: ${d.humanReviewRequired ? "YES" : "no"}`,
      );
    }
    disc.push("");
  }
  if (warnings.length) disc.push("## Run warnings", ...warnings.map((w) => `- ${w}`), "");
  writeFileSync(join(outDir, "discrepancies.md"), disc.join("\n"), "utf8");

  // Shortlist (observed, honest — nothing is PURSUE without a human).
  const short = results.filter((r) => ["PURSUE", "PARTNER", "INVESTIGATE"].includes(r.recommendation));
  const shortMd = [
    "# Milestone 0 — Shortlist (observed)",
    "",
    "> Automated run; nothing is human-VERIFIED, so no item is PURSUE.",
    "",
    "| Record | Issuer | Reco | Verification | Source | Live fetch | Info | Facts |",
    "|---|---|---|---|---|---|---|---|",
    ...(short.length
      ? short.map((r) => `| ${r.id} | ${r.issuer} | ${r.recommendation} | ${r.verificationStatus} | ${r.sourceFormat ?? "-"} | ${r.liveFetchStatus ?? "-"} | ${r.infoConfidence} | ${r.factCount} |`)
      : ["| _none_ | | | | | | | |"]),
    "",
  ].join("\n");
  writeFileSync(join(outDir, "shortlist.md"), shortMd, "utf8");

  // Rejections.
  const rej = results.filter((r) => r.recommendation === "REJECT");
  const rejMd = ["# Milestone 0 — Rejections", "", ...(rej.length ? rej.map((r) => `- **${r.id}** (${r.issuer}) — verification=${r.verificationStatus}, live=${r.liveFetchStatus ?? "-"}`) : ["_none_"]), ""].join("\n");
  writeFileSync(join(outDir, "rejections.md"), rejMd, "utf8");

  // Run report.
  const byRec: Record<string, number> = {};
  for (const r of results) byRec[r.recommendation] = (byRec[r.recommendation] ?? 0) + 1;
  const totalDisc = results.reduce((n, r) => n + r.discrepancies.length, 0);
  const runMd = [
    "# Milestone 0 — Run report",
    "",
    `- seed records evaluated: ${recordCount}`,
    `- official artifacts ingested: ${ingested}`,
    `- total discrepancies (seed vs observed): ${totalDisc}`,
    "",
    "## Recommendations (observed)",
    ...["PURSUE", "PARTNER", "INVESTIGATE", "MONITOR", "REJECT"].map((k) => `- ${k}: ${byRec[k] ?? 0}`),
    "",
    "## Warnings",
    ...(warnings.length ? warnings.map((w) => `- ${w}`) : ["- none"]),
    "",
    "> Live external fetch is blocked in this environment; official content was supplied as local files. No production-readiness claim relies on fixtures.",
    "",
  ].join("\n");
  writeFileSync(join(outDir, "run-report.md"), runMd, "utf8");
}

main().catch((err) => {
  console.error("m0:run failed:", err);
  process.exitCode = 1;
});
