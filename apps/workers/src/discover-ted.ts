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
  readTedNoticeXml,
  tedXmlToFacts,
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

/**
 * Where this notice's XML lives.
 *
 * The search response already carries it under `links.xml.MUL` ("MUL" being
 * TED's multilingual bundle). Derive it from the publication number only when
 * the response omits the link, and never invent a host.
 */
export function noticeXmlUrl(raw: Record<string, unknown>, externalId: string): string | undefined {
  const links = raw["links"];
  const xml = links && typeof links === "object" ? (links as Record<string, unknown>)["xml"] : undefined;
  if (xml && typeof xml === "object") {
    const byLang = xml as Record<string, unknown>;
    const preferred = byLang["MUL"] ?? Object.values(byLang).find((v) => typeof v === "string");
    if (typeof preferred === "string" && preferred.startsWith("https://")) return preferred;
  }
  return /^\d+-\d{4}$/.test(externalId) ? `https://ted.europa.eu/en/notice/${externalId}/xml` : undefined;
}

/** True when a record carries eligibility text an analyst could actually read. */
function hasEligibility(facts: MaterialFact[]): boolean {
  return facts.some((f) => f.field === "eligibility" && f.normalizedValue.trim().length >= 40);
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
  /** Which schema the notice XML used, when it was read at all. */
  xmlSchema?: string;
  /** The XML root element's local name — what it actually was, not a guess. */
  xmlRoot?: string;
}

/** What the notice XML actually was, counted by root element and schema. */
function xmlShapeBreakdown(rows: readonly CandidateRow[]): string {
  const counts = new Map<string, number>();
  for (const r of rows) {
    if (!r.xmlSchema) continue;
    const key = `${r.xmlSchema}/${r.xmlRoot || "?"}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  if (counts.size === 0) return "none read";
  return [...counts].sort((a, b) => b[1] - a[1]).map(([k, n]) => `${n} × ${k}`).join(" · ");
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
  // `??` is not enough: a workflow that passes an unset input sets the variable
  // to the EMPTY STRING, which `??` happily accepts. The first real scheduled
  // run lost its entire recency floor that way — the plan printed
  // `publication-date>=20260618` and the query that went out had no date clause
  // at all. Treat blank as absent.
  const sinceEnv = (process.env.TED_PUBLISHED_SINCE ?? "").trim();
  const publishedSince =
    sinceEnv !== ""
      ? sinceEnv
      : new Date(Date.now() - 90 * 24 * 3600 * 1000).toISOString().slice(0, 10).replace(/-/g, "");

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
    let narrowedOnEmpty = false;
    // Speculative clauses (notice-type, full-text) have unverified syntax AND
    // unverified selectivity. Both have to be survivable:
    //
    //   - REJECTED — TED refuses the syntax. Drop the newest speculative layer
    //     and retry.
    //   - ACCEPTED BUT EMPTY — TED is happy and returns nothing. This is the
    //     failure mode that actually happened on the first real run: ten
    //     projects, ten accepted queries, zero notices, and a layered fallback
    //     that never fired because nothing was ever rejected. A guess that
    //     matches nothing silently is worse than one that errors loudly.
    //
    // Both now narrow. Only once the PROVEN core returns empty is the answer
    // "there is genuinely nothing", which is a real and reportable result.
    for (;;) {
      attempt += 1;
      console.log(`[${project.slug}] TED query (attempt ${attempt}): ${query}`);
      try {
        const response = await fetchTedRaw({
          baseUrl: ctx.env.tedBaseUrl!,
          query,
          pageSize: ctx.env.tedPageSize,
          userAgent: ctx.env.userAgent,
          timeoutMs: ctx.env.timeoutMs,
        });
        const got = mapTedNotices(response, new Date().toISOString()).length;
        console.log(`[${project.slug}] TED returned ${got} notice(s)`);
        if (got > 0) {
          raw = response;
          break;
        }
        const narrowed = layers ? narrowQuery(layers) : null;
        if (!narrowed) {
          // The proven core itself found nothing. That is an answer, not a bug.
          raw = response;
          break;
        }
        const dropped = layers!.find((l) => !narrowed.includes(l))?.name ?? "?";
        console.warn(
          `[${project.slug}] accepted but empty — dropping the speculative "${dropped}" clause and retrying`,
        );
        layers = narrowed;
        query = queryFromLayers(layers)!;
        narrowedOnEmpty = true;
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
    if (narrowedOnEmpty) {
      console.log(`[${project.slug}] the speculative clauses were what emptied this query, not the market`);
    }

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
    // "Nothing came back" has two very different causes and they must not share
    // an exit code. If every project reached TED and TED had nothing matching,
    // that is a true and unremarkable answer — an empty week is not a broken
    // build, and failing here would skip the link check and the ledger for no
    // reason. If nothing reached TED at all, that IS a failure.
    const reached = perProject.filter((p) => p.status === "OK");
    const unreachable = perProject.filter((p) => p.status !== "OK");
    const genuinelyEmpty = reached.length > 0 && unreachable.length === 0;

    writeFileSync(
      join(outDir, "run-report.md"),
      [
        "# TED discovery run (multi-project)",
        "",
        ...perProject.map((p) => `- **${p.slug}** — ${p.status}${p.error ? `: ${p.error}` : ""}\n  - query: \`${p.query}\``),
        "",
        genuinelyEmpty
          ? `> Every one of the ${reached.length} project queries reached TED and matched nothing. ` +
            "That is an answer, not a failure: no notice published in the window fits these CPV codes and countries. " +
            "If this repeats week after week, the codes are too narrow — widen them in `registry/projects/*.yaml`."
          : "> No candidates retrieved, and " +
            `${unreachable.length} project(s) never reached TED. Where a project reports BLOCKED, the search fetch did ` +
            "not succeed in this environment — run where egress is allowed.",
        "",
      ].join("\n"),
      "utf8",
    );

    if (genuinelyEmpty) {
      console.warn(
        `no notice matched any of the ${reached.length} project queries — the searches ran and the window is empty`,
      );
      return;
    }
    console.error(`no candidates retrieved, and ${unreachable.length} project(s) could not reach TED`);
    process.exit(1);
    return;
  }

  // 2. Qualify each candidate via the EXISTING engine on the official notice page.
  const rows: CandidateRow[] = [];
  const matchableLengths: number[] = [];
  let qualified = 0;
  let fetchFailures = 0;
  // The eligibility hit rate is the measure this whole XML pass exists to move.
  // It is printed and written to the report so the next run either proves the
  // improvement or shows it did nothing.
  let withEligibility = 0;
  let withEligibilityFromXml = 0;
  let xmlFetchFailures = 0;
  const fetchXml = process.env.TED_FETCH_XML !== "0";
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
    // The HTML page is a SUMMARY. After widening the section patterns to seven
    // languages, eligibility text was found on 19 records out of 205 — the
    // patterns were never the problem, the page simply does not carry the
    // criteria. The notice's own XML does, as typed elements, and needs no
    // account (unlike the tender documents, which sit behind national portals).
    // So read it, and put its facts FIRST: they come from the publisher's
    // structured record, not from prose under a heading a regex recognised.
    let xmlFacts: MaterialFact[] = [];
    let xmlSchema: string | undefined;
    let xmlRoot: string | undefined;
    const xmlUrl = fetchXml ? noticeXmlUrl(c.raw as Record<string, unknown>, c.externalId) : undefined;
    if (xmlUrl) {
      // Two requests per notice instead of one, against a public EU service.
      // A quarter-second between them costs 25 seconds over a full page and
      // keeps the run from looking like a burst.
      await new Promise((resolve) => setTimeout(resolve, 250));
      const got = await safeFetch(xmlUrl, {
        policy: { allowlist: ALLOW },
        userAgent: ctx.env.userAgent,
        timeoutMs: ctx.env.timeoutMs,
      });
      if (got.body && got.attempt.fetchStatus === "OK") {
        const read = readTedNoticeXml(got.body.toString("utf8"));
        xmlSchema = read.schema;
        xmlRoot = read.rootElement;
        xmlFacts = tedXmlToFacts(read, ing.artifact.id, xmlUrl);
      } else {
        // Not fatal — the HTML facts still stand. But it is counted, because a
        // silent XML failure would look exactly like a notice with no criteria.
        xmlFetchFailures += 1;
      }
    }

    const noticeFacts = [...xmlFacts, ...tenderFacts, ...ing.facts];
    if (hasEligibility(xmlFacts)) withEligibilityFromXml += 1;
    if (hasEligibility(noticeFacts)) withEligibility += 1;
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
      xmlSchema,
      xmlRoot,
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
      `- **records carrying eligibility text: ${withEligibility}/${toProcess.length}**` +
        (fetchXml
          ? ` — ${withEligibilityFromXml} of them from the notice XML, which the HTML summary page does not carry`
          : " — notice XML reading is OFF (TED_FETCH_XML=0), so this is the HTML summary alone"),
      `- qualified at MANUAL_REVIEW_REQUIRED: ${qualified}`,
      `- notice-page fetch failures: ${fetchFailures}`,
      `- notice-XML fetch failures: ${xmlFetchFailures}`,
      `- notice XML shapes read: ${xmlShapeBreakdown(rows)}` +
        " — a shape this reader does not know is named here rather than counted as silence",
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
  console.log(
    `eligibility text: ${withEligibility}/${toProcess.length} record(s) ` +
      `(${withEligibilityFromXml} from the notice XML, ${xmlFetchFailures} XML fetch failure(s))`,
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
