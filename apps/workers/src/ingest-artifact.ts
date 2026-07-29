import { readFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { loadEnv } from "@oia/config";
import { fromRoot } from "./paths";
import {
  validateManifest,
  ingestOfficialArtifact,
  safeFetch,
  type LiveFetchAttempt,
  type IngestionResult,
} from "@oia/ingestion";
import {
  assembleOpportunity,
  renderOpportunitiesJson,
  renderShortlist,
  renderRejections,
  renderRunReport,
  type M0Opportunity,
  type RunStats,
} from "./m0";

/**
 * Official-artifact ingestion CLI (spec §5, §11). Processes locally supplied
 * official files (OFFICIAL_PDF / MANUAL_DOCUMENT), attempts the linked live
 * fetch (BLOCKED here, recorded honestly), and writes outputs/milestone-0/*.
 *
 *   pnpm --filter @oia/workers run ingest:artifact -- \
 *     --manifest data/artifacts/manifest.json [--entry hub71-access.html]
 */
function argValue(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  const env = loadEnv({ ...process.env, SUPABASE_URL: process.env.SUPABASE_URL ?? "https://placeholder.supabase.co", SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY ?? "placeholder" });
  const manifestPath = fromRoot(argValue("--manifest") ?? "data/artifacts/manifest.json");
  const only = argValue("--entry");
  const outDir = fromRoot("outputs/milestone-0");
  mkdirSync(outDir, { recursive: true });

  if (!existsSync(manifestPath)) {
    console.error(
      `Manifest not found: ${manifestPath}\n` +
        "No official artifacts have been supplied yet. Provide files + a manifest\n" +
        "(see data/artifacts/manifest.example.json). Ingestion is paused until then.",
    );
    process.exit(2);
  }

  const manifestRaw = JSON.parse(readFileSync(manifestPath, "utf8"));
  const validation = validateManifest(manifestRaw);
  if (!validation.ok || !validation.manifest) {
    console.error("Manifest invalid:\n" + validation.errors.map((e) => `  - ${e}`).join("\n"));
    process.exit(1);
  }

  const manifestDir = dirname(manifestPath);
  const today = new Date().toISOString().slice(0, 10);

  // Live-fetch backed by the SSRF-safe fetcher (returns BLOCKED under egress denial).
  const liveFetch = async (url: string): Promise<LiveFetchAttempt> => {
    const { attempt } = await safeFetch(url, {
      userAgent: env.FETCH_USER_AGENT,
      timeoutMs: env.FETCH_TIMEOUT_MS,
    });
    return attempt;
  };

  const entries = validation.manifest.artifacts.filter((a) => !only || a.localFilename === only);
  if (entries.length === 0) {
    console.error(`No manifest entry matches --entry ${only}`);
    process.exit(1);
  }

  const results: IngestionResult[] = [];
  const opps: M0Opportunity[] = [];
  const stats: RunStats = {
    attempted: 0, fetchedLive: 0, liveBlocked: 0, artifactsProcessed: 0, artifactFailures: 0,
    spaDetected: 0, pdfProcessed: 0, verificationsRequiringReview: 0, warnings: [],
  };

  for (const entry of entries) {
    const filePath = join(manifestDir, entry.localFilename);
    stats.attempted += 1;
    if (!existsSync(filePath)) {
      stats.artifactFailures += 1;
      stats.warnings.push(`missing local file: ${entry.localFilename}`);
      continue;
    }
    const bytes = readFileSync(filePath);
    const ing = await ingestOfficialArtifact(entry, bytes, { liveFetch });
    results.push(ing);

    if (ing.artifact.liveFetch?.fetchStatus === "BLOCKED") stats.liveBlocked += 1;
    else if (ing.artifact.liveFetch?.fetchStatus === "OK") stats.fetchedLive += 1;
    if (ing.artifact.processing === "SUCCESS") stats.artifactsProcessed += 1;
    else stats.artifactFailures += 1;
    if (ing.artifact.sourceFormat === "PDF") stats.pdfProcessed += 1;
    if (ing.artifact.sourceFormat === "CLIENT_RENDERED_SPA") stats.spaDetected += 1;
    if (ing.verification.verificationStatus === "MANUAL_REVIEW_REQUIRED") stats.verificationsRequiringReview += 1;
    stats.warnings.push(...ing.warnings.map((w) => `${entry.localFilename}: ${w}`));

    opps.push(assembleOpportunity(entry.localFilename, ing, { today }));
  }

  // Write outputs.
  writeFileSync(join(outDir, "opportunities.json"), renderOpportunitiesJson(opps), "utf8");
  writeFileSync(join(outDir, "shortlist.md"), renderShortlist(opps), "utf8");
  writeFileSync(join(outDir, "rejections.md"), renderRejections(opps), "utf8");
  writeFileSync(join(outDir, "run-report.md"), renderRunReport(stats, opps), "utf8");
  writeFileSync(
    join(outDir, "discrepancies.md"),
    ["# Milestone 0 — Discrepancies", "", "> Seed-vs-observed discrepancies are produced once the seed dataset is supplied.", "", "## Ingestion warnings (observed)", ...stats.warnings.map((w) => `- ${w}`), ""].join("\n"),
    "utf8",
  );

  console.log(`Processed ${results.length} artifact(s).`);
  console.log(`Live fetch: ${stats.liveBlocked} BLOCKED, ${stats.fetchedLive} OK. Artifacts: ${stats.artifactsProcessed} processed, ${stats.artifactFailures} failed.`);
  console.log(`Outputs written to ${outDir}`);
}

main().catch((err) => {
  console.error("Ingestion failed:", err);
  process.exitCode = 1;
});
