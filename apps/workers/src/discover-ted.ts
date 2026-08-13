import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { loadEnv } from "@oia/config";
import type { ProjectProfile } from "@oia/database";
import {
  createConnectorContext,
  fetchTedRaw,
  mapTedNotices,
  resolveTedQuery,
  noticeProvenance,
  TED_DEFAULT_BASE_URL,
} from "@oia/connectors";
import { createPolicy } from "@oia/audit";
import {
  safeFetch,
  ingestOfficialArtifact,
  type ArtifactManifestEntry,
  type LiveFetchAttempt,
} from "@oia/ingestion";
import { fromRoot } from "./paths";

/**
 * Sprint 1 — live TED discovery worker. Runs where there is egress (local Docker
 * via `docker compose up`). Discovers real TED notices (POST search API), records
 * the raw response as the real test fixture, then runs each candidate's official
 * notice page through the EXISTING M0 engine (caps at MANUAL_REVIEW_REQUIRED).
 * Honest: a failed fetch is reported as ERROR/BLOCKED, never as success.
 */

const ALLOW = ["api.ted.europa.eu", "ted.europa.eu", "europa.eu"];

function envInt(name: string, dflt: number): number {
  const v = process.env[name];
  const n = v ? Number(v) : NaN;
  return Number.isFinite(n) ? n : dflt;
}

async function main() {
  const env = loadEnv({
    ...process.env,
    SUPABASE_URL: process.env.SUPABASE_URL ?? "https://placeholder.supabase.co",
    SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY ?? "placeholder",
  });
  const outDir = fromRoot("outputs/sprint-1");
  mkdirSync(outDir, { recursive: true });
  const fixturePath = fromRoot("packages/connectors/test/fixtures/ted-search-response.json");
  mkdirSync(dirname(fixturePath), { recursive: true });
  const today = new Date().toISOString().slice(0, 10);
  const maxProcess = envInt("TED_MAX", 5);

  // BAWABA discovery profile (minimal; sectors → CPV, or a raw TED_QUERY override).
  const project: ProjectProfile = {
    slug: "bawaba",
    name: "BAWABA",
    legalEntities: [],
    sectors: (process.env.TED_SECTORS ?? "AI,digital,creative").split(",").map((s) => s.trim()),
    geographies: ["EU", "FR"],
    stage: "",
    fundingTypes: [],
    keywords: [],
    exclusions: [],
  };

  const policy = createPolicy({ fetchAllowlist: ALLOW, autoRecommendActions: ["CONSIDER", "MONITOR", "DISCARD"] });
  const ctx = createConnectorContext({
    policy,
    log: (event, data) => console.log(`[ted] ${event}`, data ?? ""),
    env: {
      euFtApiKey: env.EU_FT_API_KEY,
      euFtBaseUrl: env.EU_FT_BASE_URL,
      userAgent: env.FETCH_USER_AGENT,
      timeoutMs: env.FETCH_TIMEOUT_MS,
      tedBaseUrl: process.env.TED_BASE_URL ?? TED_DEFAULT_BASE_URL,
      tedQuery: process.env.TED_QUERY,
      tedPageSize: envInt("TED_PAGE_SIZE", 100),
      // Recency floor (default: last 90 days) so discovery surfaces CURRENT
      // notices, not 2016 ones. Override with TED_PUBLISHED_SINCE=YYYYMMDD.
      tedPublishedSince:
        process.env.TED_PUBLISHED_SINCE ??
        new Date(Date.now() - 90 * 24 * 3600 * 1000).toISOString().slice(0, 10).replace(/-/g, ""),
    },
  });

  const query = resolveTedQuery(ctx, project);
  console.log(`TED query: ${query}`);

  // 1. Discover (POST). Record the RAW response as the real fixture. Honest on failure.
  let raw: unknown;
  try {
    raw = await fetchTedRaw({
      baseUrl: ctx.env.tedBaseUrl!,
      query,
      pageSize: ctx.env.tedPageSize,
      userAgent: ctx.env.userAgent,
      timeoutMs: ctx.env.timeoutMs,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const status = /403|egress|tunnel|proxy/i.test(msg) ? "BLOCKED" : "ERROR";
    writeFileSync(
      join(outDir, "run-report.md"),
      `# Sprint 1 — TED discovery run\n\n- discovery: **${status}**\n- query: \`${query}\`\n- error: ${msg}\n\n> No candidates: the TED search fetch did not succeed where this worker ran. Run where egress is allowed.\n`,
      "utf8",
    );
    console.error(`TED discovery ${status}: ${msg}`);
    process.exit(1);
    return;
  }

  writeFileSync(fixturePath, JSON.stringify(raw, null, 2), "utf8");
  writeFileSync(join(outDir, "ted-search-response.raw.json"), JSON.stringify(raw, null, 2), "utf8");

  const candidates = mapTedNotices(raw, new Date().toISOString());
  console.log(`retrieved: ${candidates.length} candidate(s)`);

  // 2. Qualify each candidate via the EXISTING engine on the official notice page.
  const records: unknown[] = [];
  let qualified = 0;
  let fetchFailures = 0;
  const toProcess = candidates.slice(0, maxProcess);

  const liveFetchFor = (attempt: LiveFetchAttempt) => async () => attempt;

  for (const c of toProcess) {
    const { attempt, body } = await safeFetch(c.url, {
      policy: { allowlist: ALLOW },
      userAgent: ctx.env.userAgent,
      timeoutMs: ctx.env.timeoutMs,
    });
    if (!body || attempt.fetchStatus !== "OK") {
      fetchFailures += 1;
      records.push({
        externalId: c.externalId,
        title: c.title,
        officialUrl: c.url,
        liveFetch: attempt.fetchStatus,
        verificationStatus: "SOURCE_UNAVAILABLE",
        provenance: noticeProvenance(c.raw as Record<string, unknown>),
      });
      continue;
    }

    const entry: ArtifactManifestEntry = {
      originalUrl: c.url,
      issuingOrganization: c.hints.funder ?? "European Union — TED",
      officialDomain: "ted.europa.eu",
      retrievalDate: today,
      localFilename: `${c.externalId}.html`,
      contentType: "text/html",
      sourceFormat: "STATIC_HTML",
      expectedDocumentTitle: c.title,
    };
    const ing = await ingestOfficialArtifact(entry, body, { liveFetch: liveFetchFor(attempt) });
    if (ing.verification.verificationStatus === "MANUAL_REVIEW_REQUIRED") qualified += 1;

    records.push({
      externalId: c.externalId,
      title: c.title,
      officialUrl: c.url,
      issuer: c.hints.funder,
      deadline: c.hints.deadlineAt,
      liveFetch: attempt.fetchStatus,
      sourceFormat: ing.artifact.sourceFormat,
      contentHash: ing.artifact.contentHash,
      verificationStatus: ing.verification.verificationStatus, // MANUAL_REVIEW_REQUIRED (never VERIFIED w/o human)
      verificationEvidence: ing.verification.verificationEvidence,
      factCount: ing.facts.length,
      provenance: noticeProvenance(c.raw as Record<string, unknown>),
    });
  }

  writeFileSync(join(outDir, "candidates.json"), JSON.stringify(records, null, 2), "utf8");
  writeFileSync(
    join(outDir, "run-report.md"),
    [
      "# Sprint 1 — TED discovery run",
      "",
      `- query: \`${query}\``,
      `- notices retrieved: ${candidates.length}`,
      `- candidates processed (cap ${maxProcess}): ${toProcess.length}`,
      `- qualified at MANUAL_REVIEW_REQUIRED: ${qualified}`,
      `- notice-page fetch failures: ${fetchFailures}`,
      "",
      "## Candidates (each with official source URL)",
      ...records.map((r: any) => `- **${r.externalId}** — ${r.title}\n  - source: ${r.officialUrl}\n  - verification: ${r.verificationStatus} · live fetch: ${r.liveFetch}`),
      "",
      "> Discovery via TED Search API (official primary source). No item is VERIFIED without a human. Raw response recorded as the real test fixture.",
      "",
    ].join("\n"),
    "utf8",
  );

  console.log(`retained: ${toProcess.length} | qualified (MANUAL_REVIEW_REQUIRED): ${qualified} | fetch failures: ${fetchFailures}`);
  console.log(`Outputs written to ${outDir}; fixture recorded at ${fixturePath}`);
  if (!existsSync(join(outDir, "candidates.json"))) process.exitCode = 1;
}

main().catch((err) => {
  console.error("discover-ted failed:", err);
  process.exitCode = 1;
});
