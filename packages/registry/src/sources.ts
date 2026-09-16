import { z } from "zod";
import { OPPORTUNITY_KINDS } from "@oia/ingestion/opportunity-kinds";

/**
 * Where OIA looks — declared as data, with an honest status per source.
 *
 * The temptation with a source list is to write down twenty names and let the
 * length imply coverage. So the status is the first thing each entry carries,
 * and it distinguishes four very different things:
 *
 *   LIVE          a connector exists AND a real run has retrieved from it
 *   FIXTURE_ONLY  a connector exists, exercised only against a recorded response
 *   DECLARED      the source matters and is watched BY HAND — no connector
 *   BLOCKED       it cannot be automated (credentials, terms, no machine access)
 *
 * A DECLARED source is not a promise. It is an instruction to a human, and the
 * console says so rather than implying a queue that does not run.
 *
 * `urlVerified` exists because of a specific complaint: too many published links
 * 404. Every URL added here starts unverified and is confirmed by the link
 * checker against the live web — never by whoever typed it in.
 */

export const SOURCE_STATUSES = ["LIVE", "FIXTURE_ONLY", "DECLARED", "BLOCKED"] as const;
export type SourceStatus = (typeof SOURCE_STATUSES)[number];

export const ACCESS_MODES = ["API", "SCRAPE", "MANUAL", "EMAIL_ALERT"] as const;
export const AUTH_MODES = ["NONE", "API_KEY", "CREDENTIALS", "OAUTH"] as const;

export const SourceEntrySchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  /** Who runs it. */
  operator: z.string().default(""),
  /** What you find there. */
  kinds: z.array(z.enum(OPPORTUNITY_KINDS)).default([]),
  /** Countries or regions covered (ISO-2, or a region name like EMEA, GCC). */
  geographies: z.array(z.string()).default([]),
  /** Public entry point a human can open. */
  url: z.string().default(""),
  /**
   * Whether that URL has been confirmed to resolve. Set by the link checker,
   * never by hand — the whole point is that a typed URL proves nothing.
   */
  urlVerified: z.boolean().default(false),
  lastUrlCheck: z.string().default(""),
  status: z.enum(SOURCE_STATUSES),
  access: z
    .object({
      mode: z.enum(ACCESS_MODES).default("MANUAL"),
      auth: z.enum(AUTH_MODES).default("NONE"),
      endpoint: z.string().default(""),
    })
    .default({}),
  /** Connector key in @oia/connectors, when one exists. */
  connector: z.string().default(""),
  /** Which registry projects this source is relevant to. Empty = all. */
  forProjects: z.array(z.string()).default([]),
  /** What is true and what is not. Required — a bare name is not a source. */
  notes: z.string().min(1),
});
export type SourceEntry = z.infer<typeof SourceEntrySchema>;

export interface SourceRegistry {
  sources: SourceEntry[];
}

export const SourceRegistrySnapshotSchema = z.object({
  sources: z.array(SourceEntrySchema),
});

export function liveSources(registry: SourceRegistry): SourceEntry[] {
  return registry.sources.filter((s) => s.status === "LIVE");
}

/** Sources a human has to check themselves — the honest backlog. */
export function manualSources(registry: SourceRegistry): SourceEntry[] {
  return registry.sources.filter((s) => s.status === "DECLARED" || s.status === "BLOCKED");
}

export function sourcesForProject(registry: SourceRegistry, slug: string): SourceEntry[] {
  return registry.sources.filter((s) => s.forProjects.length === 0 || s.forProjects.includes(slug));
}

export function sourcesForKind(registry: SourceRegistry, kind: string): SourceEntry[] {
  return registry.sources.filter((s) => s.kinds.includes(kind as (typeof OPPORTUNITY_KINDS)[number]));
}

/** Coverage, stated as a fraction rather than a list length. */
export function coverage(registry: SourceRegistry): {
  total: number;
  live: number;
  fixtureOnly: number;
  declared: number;
  blocked: number;
  automatedShare: number;
} {
  const by = (s: SourceStatus) => registry.sources.filter((x) => x.status === s).length;
  const total = registry.sources.length;
  const live = by("LIVE");
  return {
    total,
    live,
    fixtureOnly: by("FIXTURE_ONLY"),
    declared: by("DECLARED"),
    blocked: by("BLOCKED"),
    automatedShare: total === 0 ? 0 : Math.round((live / total) * 100),
  };
}
