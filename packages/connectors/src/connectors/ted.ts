import type { ProjectProfile } from "@oia/database";
import type {
  ConnectorContext,
  FetchedEvidence,
  RawOpportunity,
  SourceConnector,
} from "../types";
import { mapTedNotices, TED_FIELDS } from "../ted/map";
import { buildTedExpertQuery, sectorsToCpv } from "../ted/query";

/**
 * TED (Tenders Electronic Daily) connector — first implementation of the shared
 * SourceConnector interface (Sprint 1). Discovery is a POST with a JSON body
 * (query + pagination) to the anonymous public Search API. Requires egress:
 * runs in the deployed/local Docker worker, NOT in the sandbox (which returns a
 * 403). Verification of each candidate reuses the existing M0 engine on the
 * official notice page and caps at MANUAL_REVIEW_REQUIRED.
 */

export const TED_KEY = "ted";
export const TED_DEFAULT_BASE_URL = "https://api.ted.europa.eu/v3/notices/search";

export interface TedSearchParams {
  baseUrl: string;
  query: string;
  fields?: readonly string[];
  pageSize?: number; // max 250 (the `limit`)
  page?: number; // 1-based (PAGE_NUMBER mode)
  scope?: "ACTIVE" | "LATEST" | "ALL";
  userAgent: string;
  timeoutMs: number;
  fetchImpl?: typeof fetch;
}

/** Low-level POST that returns the RAW TED response (for recording a real fixture). */
export async function fetchTedRaw(params: TedSearchParams): Promise<unknown> {
  const doFetch = params.fetchImpl ?? fetch;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), params.timeoutMs);
  try {
    const res = await doFetch(params.baseUrl, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json, */*",
        "user-agent": params.userAgent,
      },
      // Body matches the contract validated from the container: page + limit.
      body: JSON.stringify({
        query: params.query,
        fields: [...(params.fields ?? TED_FIELDS)],
        page: params.page ?? 1,
        limit: Math.min(params.pageSize ?? 100, 250),
        scope: params.scope ?? "ACTIVE",
        checkQuerySyntax: false,
        paginationMode: "PAGE_NUMBER",
      }),
      signal: controller.signal,
    });
    if (!res.ok) {
      throw new Error(`TED search HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
    }
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

/** Resolve the expert query: explicit override wins, else derive from the profile. */
export function resolveTedQuery(ctx: ConnectorContext, project: ProjectProfile): string {
  if (ctx.env.tedQuery && ctx.env.tedQuery.trim()) return ctx.env.tedQuery.trim();
  const cpv = sectorsToCpv(project.sectors);
  // Recency floor: without it, scope ACTIVE + no sort surfaced 2016 notices (first live run).
  const built = buildTedExpertQuery({
    cpv: cpv.length ? cpv : ["72000000"],
    publishedSince: ctx.env.tedPublishedSince,
  });
  return built ?? "classification-cpv IN (72000000)";
}

async function discover(ctx: ConnectorContext, project: ProjectProfile): Promise<RawOpportunity[]> {
  const baseUrl = ctx.env.tedBaseUrl ?? TED_DEFAULT_BASE_URL;
  const query = resolveTedQuery(ctx, project);

  const decision = await ctx.policy.canFetch(baseUrl);
  if (!decision.allowed) {
    ctx.log("policy_denied", { url: baseUrl, reason: decision.reason });
    return [];
  }

  const raw = await fetchTedRaw({
    baseUrl,
    query,
    pageSize: ctx.env.tedPageSize,
    userAgent: ctx.env.userAgent,
    timeoutMs: ctx.env.timeoutMs,
  });
  const results = mapTedNotices(raw, new Date().toISOString());
  ctx.log("discovered", { source: "ted", count: results.length });
  return results;
}

async function fetchEvidence(ctx: ConnectorContext, url: string): Promise<FetchedEvidence> {
  return ctx.fetchText(url);
}

export const tedConnector: SourceConnector = {
  key: TED_KEY,
  kind: "official_programme",
  discover,
  fetch: fetchEvidence,
};
