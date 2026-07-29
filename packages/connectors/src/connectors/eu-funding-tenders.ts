import { z } from "zod";
import type { ProjectProfile } from "@oia/database";
import type {
  ConnectorContext,
  FetchedEvidence,
  RawOpportunity,
  SourceConnector,
  StatusResult,
} from "../types";

/**
 * EU Funding & Tenders Portal connector (SEDIA public search API).
 *
 * ⚠️  STATUS: EXPERIMENTAL_UNVERIFIED — NOT production-ready, NOT "delivered".
 * No successful live contract test has ever occurred; the execution environment
 * returns a proxy/egress 403 for `api.tech.ec.europa.eu`. All tests use RECORDED
 * FIXTURES, which prove compatibility with the fixture only — not endpoint
 * availability, stability, live schema, auth requirements, or production
 * usability. See docs/connectors/sedia-experimental-status.md before any
 * activation.
 *
 * Endpoint (ASSUMED): POST {EU_FT_BASE_URL}?apiKey=SEDIA&text=<query>
 * Body (ASSUMED): multipart/form-data with JSON `query`, `languages`, `page`, `pageSize`.
 */

export const EU_FT_KEY = "eu-funding-tenders";

/** Lifecycle status of this connector. Do not present it as delivered. */
export const EU_FT_CONNECTOR_STATUS = "EXPERIMENTAL_UNVERIFIED" as const;

// SEDIA status codes → our status vocabulary.
const STATUS_MAP: Record<string, RawOpportunity["hints"]["status"]> = {
  "31094501": "upcoming", // Forthcoming
  "31094502": "open", // Open for submission
  "31094503": "closed", // Closed
};

// ── Response schema (defensive; the API returns arrays of strings in metadata) ─

const MetadataSchema = z
  .object({
    identifier: z.array(z.string()).optional(),
    title: z.array(z.string()).optional(),
    status: z.array(z.string()).optional(),
    deadlineDate: z.array(z.string()).optional(),
    startDate: z.array(z.string()).optional(),
    callIdentifier: z.array(z.string()).optional(),
    programmeName: z.array(z.string()).optional(),
    frameworkProgramme: z.array(z.string()).optional(),
  })
  .passthrough();

const ResultSchema = z
  .object({
    reference: z.string().optional(),
    url: z.string().optional(),
    title: z.string().optional(),
    content: z.string().optional(),
    metadata: MetadataSchema.optional(),
  })
  .passthrough();

export const SediaResponseSchema = z
  .object({
    totalResults: z.number().optional(),
    results: z.array(ResultSchema).default([]),
  })
  .passthrough();

export type SediaResponse = z.infer<typeof SediaResponseSchema>;

const first = (a?: string[]): string | undefined => (a && a.length > 0 ? a[0] : undefined);

/** Pure mapping of a SEDIA response into RawOpportunity[]. Unit-tested. */
export function mapSediaResults(raw: unknown, discoveredAt: string): RawOpportunity[] {
  const parsed = SediaResponseSchema.parse(raw);
  const out: RawOpportunity[] = [];
  for (const r of parsed.results) {
    const md = r.metadata ?? {};
    const identifier = first(md.identifier) ?? r.reference;
    const url = r.url;
    const title = first(md.title) ?? r.title;
    if (!identifier || !url || !title) continue; // require the essentials

    const statusCode = first(md.status);
    out.push({
      sourceKey: EU_FT_KEY,
      externalId: identifier,
      title,
      url,
      discoveredAt,
      hints: {
        programmeName: first(md.programmeName) ?? first(md.frameworkProgramme),
        funder: "European Commission",
        deadlineAt: first(md.deadlineDate),
        status: statusCode ? (STATUS_MAP[statusCode] ?? "unknown") : "unknown",
        summary: r.content,
        currency: "EUR",
      },
      raw: r,
    });
  }
  return out;
}

/** Build the SEDIA query JSON from a project profile. */
export function buildSediaQuery(project: ProjectProfile): {
  text: string;
  query: unknown;
} {
  const text = project.keywords.length > 0 ? project.keywords.join(" ") : "***";
  const query = {
    bool: {
      must: [
        { terms: { type: ["1"] } }, // grants / calls for proposals
        { terms: { status: ["31094501", "31094502"] } }, // forthcoming + open
      ],
    },
  };
  return { text, query };
}

async function discover(
  ctx: ConnectorContext,
  project: ProjectProfile,
): Promise<RawOpportunity[]> {
  const { text, query } = buildSediaQuery(project);
  const url = `${ctx.env.euFtBaseUrl}?apiKey=${encodeURIComponent(
    ctx.env.euFtApiKey,
  )}&text=${encodeURIComponent(text)}`;

  const decision = await ctx.policy.canFetch(url);
  if (!decision.allowed) {
    ctx.log("policy_denied", { url, reason: decision.reason });
    return [];
  }

  const form = new FormData();
  form.append("query", JSON.stringify(query));
  form.append("languages", JSON.stringify(["en"]));
  form.append("page", "1");
  form.append("pageSize", "50");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ctx.env.timeoutMs);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "user-agent": ctx.env.userAgent },
      body: form,
      signal: controller.signal,
    });
    if (!res.ok) {
      ctx.log("discover_failed", { status: res.status });
      return [];
    }
    const json = await res.json();
    const results = mapSediaResults(json, new Date().toISOString());
    ctx.log("discovered", { count: results.length });
    return results;
  } finally {
    clearTimeout(timer);
  }
}

async function fetchEvidence(ctx: ConnectorContext, url: string): Promise<FetchedEvidence> {
  return ctx.fetchText(url);
}

async function checkStatus(
  ctx: ConnectorContext,
  opportunity: RawOpportunity,
): Promise<StatusResult> {
  // V0: re-run discovery and match by externalId. A dedicated per-call endpoint
  // is a P2 refinement.
  const results = await discover(ctx, { keywords: [] } as unknown as ProjectProfile);
  const match = results.find((r) => r.externalId === opportunity.externalId);
  if (!match) return { status: "unknown" };
  return { status: match.hints.status ?? "unknown", deadlineAt: match.hints.deadlineAt };
}

export const euFundingTendersConnector: SourceConnector = {
  key: EU_FT_KEY,
  kind: "official_programme",
  discover,
  fetch: fetchEvidence,
  checkStatus,
};
