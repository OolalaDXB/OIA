import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { loadEnv } from "@oia/config";
import {
  createConnectorContext,
  fetchTedRaw,
  mapTedNotices,
  buildTedQueryLayers,
  queryFromLayers,
  narrowQuery,
  classifyNoticeType,
  isWorthProcessing,
  skipReason,
  noticeProvenance,
  TED_DEFAULT_BASE_URL,
  type QueryLayer,
} from "@oia/connectors";
import { createPolicy } from "@oia/audit";
import { PROJECT_REGISTRY, discoverableProjects, findProject, type ProjectEntry } from "@oia/registry";
import {
  safeFetch,
  ingestOfficialArtifact,
  extractTenderFacts,
  matchableTextLength,
  type ArtifactManifestEntry,
  type LiveFetchAttempt,
  type MaterialFact,
} from "@oia/ingestion";
import { fromRoot } from "./paths";

/**
 * Live TED discovery worker — registry-driven and multi-project.
 *
 * Every project in `registry/projects/*.yaml` with `discovery.enabled` gets its
 * own expert query (its CPV codes, its buyer countries, the recency floor).
 * A notice found by several projects is kept ONCE, carrying the list of
 * projects whose query surfaced it — that list is discovery provenance, not a
 * match verdict: the suggestion engine still has to argue the fit, and the gate
 * still has to pass.
 *
 * Requires egress: runs in the deployed/local Docker worker, NOT in the agent
 * sandbox (whose proxy returns 403). A failed fetch is reported as
 * BLOCKED/ERROR per project, never as success.
 *
 *   pnpm --filter @oia/workers discover:ted                 # every discoverable project
 *   pnpm --filter @oia/workers discover:ted -- --project sillon,bawaba
 *   pnpm --filter @oia/workers discover:ted -- --list       # show the plan, fetch nothing
 */

const ALLOW = ["api.ted.europa.eu", "ted.europa.eu", "europa.eu"];

function envInt(name: string, dflt: number): number {
  const v = process.env[name];
  const n = v ? Number(v) : NaN;
  return Number.isFinite(n) ? n : dflt;
}

/** Median, for the run report's matchable-text measure. */
function median(xs: number[]): number {
  if (xs.length === 0) return 0;
  const sorted = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid]! : Math.round((sorted[mid - 1]! + sorted[mid]!) / 2);
}

function arg(name: string): string | undefined {
  const hit = process.argv.find((a) => a === `--${name}` || a.startsWith(`--${name}=`));
  if (!hit) return undefined;
  if (hit.includes("=")) return hit.slice(hit.indexOf("=") + 1);
  const i = process.argv.indexOf(hit);
  const next = process.argv[i + 1];
  return next && !next.startsWith("--") ? next : "";
}

/** Which projects this run covers: --project a,b, else every discoverable one. */
export function selectProjects(slugsCsv?: string): ProjectEntry[] {
  if (!slugsCsv) return discoverableProjects(PROJECT_REGISTRY);
  const slugs = slugsCsv.split(",").map((s) => s.trim()).filter(Boolean);
  return slugs.map((slug) => {
    const entry = findProject(PROJECT_REGISTRY, slug);
    if (!entry) throw new Error(`unknown project "${slug}" — add registry/projects/${slug}.yaml`);
    return entry;
  });
}

/**
 * Notice types worth asking the server for. SPECULATIVE — this clause's syntax
 * is unverified from here, so it sits in a layer that is dropped if TED rejects
 * it. Correctness does not depend on it: whatever comes back is classified
 * again locally, so qualification systems are removed either way.
 */
const WANTED_NOTICE_TYPES = ["cn-standard", "cn-social"];

/** The query for one project, as layers ordered proven → speculative. */
export function projectQueryLayers(entry: ProjectEntry, publishedSince: string): QueryLayer[] {
  const cpv = entry.discovery.cpvCodes;
  return buildTedQueryLayers({
    cpv: cpv.length ? cpv : ["72000000"],
    countries: entry.discovery.countries,
    publishedSince,
    noticeTypes: WANTED_NOTICE_TYPES,
    fullText: entry.discovery.queryTerms,
  });
}

/** The TED expert query for one project, from its registry discovery block. */
export function projectTedQuery(entry: ProjectEntry, publishedSince: string): string {
  return queryFromLayers(projectQueryLayers(entry, publishedSince)) ?? "classification-cpv IN (72000000)";
}

interface CandidateRow {
  externalId: string;
  title: string;
  officialUrl: string;
  issuer?: string;
  deadline?: string;
  /** Projects whose query surfaced this notice — provenance, not a verdict. */
  discoveredFor: string[];
  liveFetch: string;
  sourceFormat?: string;
  contentHash?: string;
  verificationStatus: string;
  verificationEvidence: string[];
  factCount: number;
  provenance: unknown;
  /** TED notice type and what it means for whether this can be bid on. */
  noticeType?: string;
  noticeClass?: string;
  /** Facts read from the notice PAGE (scope, value, procedure, place, lots). */
  noticeFacts?: MaterialFact[];
  /** Characters the matcher can actually see for this record (the S2 measure). */
  matchableChars?: number;
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

  // Recency floor (default: last 90 days) so discovery surfaces CURRENT notices,
  // not 2016 ones. Override with TED_PUBLISHED_SINCE=YYYYMMDD.
  const publishedSince =
    process.env.TED_PUBLISHED_SINCE ??
    new Date(Date.now() - 90 * 24 * 3600 * 1000).toISOString().slice(0, 10).replace(/-/g, "");

  const projects = selectProjects(arg("project"));
  if (projects.length === 0) {
    console.error("no project has discovery.enabled — nothing to run (registry/projects/*.yaml)");
    process.exit(1);
  }

  if (arg("list") !== undefined) {
    for (const p of projects) console.log(`${p.slug}\t${projectTedQuery(p, publishedSince)}`);
    return;
  }

  const policy = createPolicy({
    fetchAllowlist: ALLOW,
    autoRecommendActions: ["CONSIDER", "MONITOR", "DISCARD"],
  });
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
      tedPublishedSince: publishedSince,
    },
  });

  // 1. Discover per project. One failure does not sink the run: it is recorded.
  const byId = new Map<string, { candidate: ReturnType<typeof mapTedNotices>[number]; projects: string[] }>();
  const perProject: {
    slug: string;
    query: string;
    status: string;
    count: number;
    retrieved?: number;
    setAside?: number;
    error?: string;
  }[] = [];
  let fixtureWritten = false;

  for (const project of projects) {
    // An explicit TED_QUERY override applies to every project (single-query debug run).
    const override = ctx.env.tedQuery?.trim();
    let layers: QueryLayer[] | null = override ? null : projectQueryLayers(project, publishedSince);
    let query = override ?? queryFromLayers(layers!)!;

    let raw: unknown;
    let lastError = "";
    let attempt = 0;
    // Speculative clauses (notice-type, full-text) have unverified syntax. If
    // TED rejects the query, drop the newest speculative layer and try again
    // rather than losing the run to a guess. Once only proven layers remain, a
    // rejection is a real failure and is reported as one.
    for (;;) {
      attempt += 1;
      console.log(`[${project.slug}] TED query (attempt ${attempt}): ${query}`);
      try {
        raw = await fetchTedRaw({
          baseUrl: ctx.env.tedBaseUrl!,
          query,
          pageSize: ctx.env.tedPageSize,
          userAgent: ctx.env.userAgent,
          timeoutMs: ctx.env.timeoutMs,
        });
        break;
      } catch (err) {
        lastError = err instanceof Error ? err.message : String(err);
        const networkProblem = /403|egress|tunnel|proxy|timeout|abort|fetch failed/i.test(lastError);
        const narrowed = !networkProblem && layers ? narrowQuery(layers) : null;
        if (!narrowed) {
          const status = networkProblem ? "BLOCKED" : "ERROR";
          perProject.push({ slug: project.slug, query, status, count: 0, error: lastError });
          console.error(`[${project.slug}] TED discovery ${status}: ${lastError}`);
          break;
        }
        const dropped = layers!.find((l) => !narrowed.includes(l))?.name ?? "?";
        console.warn(`[${project.slug}] TED rejected the query — dropping the "${dropped}" clause and retrying`);
        layers = narrowed;
        query = queryFromLayers(layers)!;
      }
    }
    if (raw === undefined) continue;

    writeFileSync(join(outDir, `ted-search-response.${project.slug}.json`), JSON.stringify(raw, null, 2), "utf8");
    // The shared connector fixture is the FIRST successful response of a run —
    // one recorded real response, not a synthetic merge of several. Opt-in
    // (TED_RECORD_FIXTURE=1) so a scheduled data refresh does not churn a
    // 14k-line test fixture every week; capture it deliberately instead.
    if (!fixtureWritten && process.env.TED_RECORD_FIXTURE === "1") {
      writeFileSync(fixturePath, JSON.stringify(raw, null, 2), "utf8");
      fixtureWritten = true;
    }

    const all = mapTedNotices(raw, new Date().toISOString());
    // The server-side filter is unverified, so the classification is applied
    // again here — this is the half that is guaranteed to work. On the last
    // real recorded response it removed 83 notices out of 100.
    const candidates = all.filter((c) => isWorthProcessing(c.hints.noticeType));
    const setAside = all.length - candidates.length;
    if (setAside > 0) {
      const reasons = new Map<string, number>();
      for (const c of all) {
        const why = skipReason(c.hints.noticeType);
        if (why) reasons.set(why, (reasons.get(why) ?? 0) + 1);
      }
      console.log(
        `[${project.slug}] set aside ${setAside}/${all.length}: ` +
          [...reasons].map(([why, n]) => `${n} × ${why}`).join(" · "),
      );
    }
    perProject.push({
      slug: project.slug,
      query,
      status: "OK",
      count: candidates.length,
      retrieved: all.length,
      setAside,
    });
    for (const c of candidates) {
      const seen = byId.get(c.externalId);
      if (seen) {
        if (!seen.projects.includes(project.slug)) seen.projects.push(project.slug);
      } else {
        byId.set(c.externalId, { candidate: c, projects: [project.slug] });
      }
    }
  }

  const unique = [...byId.values()];
  console.log(`retrieved: ${unique.length} unique notice(s) across ${projects.length} project(s)`);

  if (unique.length === 0) {
    writeFileSync(
      join(outDir, "run-report.md"),
      [
        "# TED discovery run (multi-project)",
        "",
        ...perProject.map((p) => `- **${p.slug}** — ${p.status}${p.error ? `: ${p.error}` : ""}\n  - query: \`${p.query}\``),
        "",
        "> No candidates retrieved. Where a project reports BLOCKED, the TED search fetch did not succeed in this environment — run where egress is allowed.",
        "",
      ].join("\n"),
      "utf8",
    );
    console.error("no candidates retrieved");
    process.exit(1);
    return;
  }

  // 2. Qualify each candidate via the EXISTING engine on the official notice page.
  const rows: CandidateRow[] = [];
  const matchableLengths: number[] = [];
  let qualified = 0;
  let fetchFailures = 0;
  const toProcess = unique.slice(0, maxProcess);
  const liveFetchFor = (attempt: LiveFetchAttempt) => async () => attempt;

  for (const { candidate: c, projects: forProjects } of toProcess) {
    const { attempt, body } = await safeFetch(c.url, {
      policy: { allowlist: ALLOW },
      userAgent: ctx.env.userAgent,
      timeoutMs: ctx.env.timeoutMs,
    });
    if (!body || attempt.fetchStatus !== "OK") {
      fetchFailures += 1;
      rows.push({
        externalId: c.externalId,
        title: c.title,
        officialUrl: c.url,
        discoveredFor: forProjects,
        liveFetch: attempt.fetchStatus,
        verificationStatus: "SOURCE_UNAVAILABLE",
        verificationEvidence: [],
        factCount: 0,
        provenance: noticeProvenance(c.raw as Record<string, unknown>),
        noticeType: c.hints.noticeType,
        noticeClass: classifyNoticeType(c.hints.noticeType),
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

    // The notice page was fetched, hashed and parsed — and until now its text
    // was thrown away, leaving the matcher with a 54-character title. Read the
    // scope, the estimated value, the procedure, the place and the lots out of
    // it, and keep the generic facts the engine already produced.
    const knownCpv = (c.raw as Record<string, unknown>)["classification-cpv"];
    const tenderFacts = extractTenderFacts(body.toString("utf8"), {
      artifactId: ing.artifact.id,
      knownCpv: Array.isArray(knownCpv) ? knownCpv.map(String) : [],
    });
    const noticeFacts = [...tenderFacts, ...ing.facts];
    const matchableChars = matchableTextLength(noticeFacts, c.title, c.hints.funder ?? "");
    matchableLengths.push(matchableChars);

    rows.push({
      externalId: c.externalId,
      title: c.title,
      officialUrl: c.url,
      issuer: c.hints.funder,
      deadline: c.hints.deadlineAt,
      discoveredFor: forProjects,
      liveFetch: attempt.fetchStatus,
      sourceFormat: ing.artifact.sourceFormat,
      contentHash: ing.artifact.contentHash,
      verificationStatus: ing.verification.verificationStatus, // never VERIFIED w/o human
      verificationEvidence: ing.verification.verificationEvidence,
      factCount: noticeFacts.length,
      provenance: noticeProvenance(c.raw as Record<string, unknown>),
      noticeType: c.hints.noticeType,
      noticeClass: classifyNoticeType(c.hints.noticeType),
      noticeFacts,
      matchableChars,
    });
  }

  writeFileSync(join(outDir, "candidates.json"), JSON.stringify(rows, null, 2), "utf8");
  writeFileSync(
    join(outDir, "run-report.md"),
    [
      "# TED discovery run (multi-project)",
      "",
      "## Per project",
      ...perProject.map(
        (p) =>
          `- **${p.slug}** — ${p.status}` +
          (p.error
            ? `: ${p.error}`
            : ` · ${p.count} biddable of ${p.retrieved ?? p.count} retrieved` +
              (p.setAside ? ` (${p.setAside} set aside: qualification systems, corrigenda, award notices)` : "")) +
          `\n  - query: \`${p.query}\``,
      ),
      "",
      `- unique notices across projects: ${unique.length}`,
      `- matchable text per record (the S2 measure): median ${median(matchableLengths)} characters` +
        (matchableLengths.length ? ` over ${matchableLengths.length} record(s)` : " — nothing processed"),
      `- candidates processed (cap ${maxProcess}): ${toProcess.length}`,
      `- qualified at MANUAL_REVIEW_REQUIRED: ${qualified}`,
      `- notice-page fetch failures: ${fetchFailures}`,
      "",
      "## Candidates (each with official source URL)",
      ...rows.map(
        (r) =>
          `- **${r.externalId}** — ${r.title}\n  - source: ${r.officialUrl}\n  - discovered for: ${r.discoveredFor.join(", ")}\n  - verification: ${r.verificationStatus} · live fetch: ${r.liveFetch}`,
      ),
      "",
      "> Discovery via the TED Search API (official primary source), one query per project profile. No item is VERIFIED without a human. `discovered for` is the query that surfaced the notice — not a match verdict.",
      "",
    ].join("\n"),
    "utf8",
  );

  console.log(
    `retained: ${toProcess.length} | qualified (MANUAL_REVIEW_REQUIRED): ${qualified} | ` +
      `fetch failures: ${fetchFailures} | median matchable text: ${median(matchableLengths)} chars`,
  );
  console.log(`Outputs written to ${outDir}`);
}

// Run only when invoked directly (tsx src/discover-ted.ts) so the query
// planning above stays importable — and unit-testable — without firing a run.
if (process.argv[1] && process.argv[1].endsWith("discover-ted.ts")) {
  main().catch((err) => {
    console.error("discover-ted failed:", err);
    process.exitCode = 1;
  });
}
