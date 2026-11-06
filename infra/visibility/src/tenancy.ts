import { z } from "zod";

/**
 * Client → site → sujet, in TypeScript only (no storage). The production
 * schema and RLS policy live in C1 and extend this contract. Every table
 * added by later blocks derives its tenancy columns from these types.
 *
 * A subject is one measured brand; it is rattached to one client and to one
 * or more sites. A site is one web property; it belongs to one client. A
 * client is the organisation we bill and whose data we isolate.
 */

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "expected YYYY-MM-DD");
const httpsUrl = z.string().url().refine((u) => u.startsWith("https://"), "https URL expected");
const kebab = z.string().regex(/^[a-z0-9][a-z0-9-]{1,62}$/, "kebab-case id");
const ownerRepo = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_.-]*\/[A-Za-z0-9][A-Za-z0-9_.-]*$/, "owner/name");

/**
 * How we may act on a client's or site's repository.
 *
 *   lecture     read-only audit of the source code.
 *   proposition create a branch and a pull request in the client's repo,
 *               the client merges. **Default and mandatory for every
 *               external client.**
 *   direct      commit on the default branch, reserved to Mickaël's own
 *               repositories and only on his explicit request.
 */
export const RepoActionMode = z.enum(["lecture", "proposition", "direct"]);
export type RepoActionMode = z.infer<typeof RepoActionMode>;

/** A client is the organisation. Billing and data isolation hang off this id. */
export const ClientSchema = z
  .object({
    id: kebab,
    displayName: z.string().min(2),
    /** Mickaël's own work vs. an external paying client. Affects D1 defaults. */
    ownership: z.enum(["internal", "external"]),
    status: z.enum(["active", "paused", "archived"]),
    /** Monthly spending ceiling for this client, in US dollars. 0 = do not spend. */
    monthlyBudgetUsd: z.number().min(0),
    /** Default mode a new site inherits when no per-repo override is declared. */
    defaultRepoActionMode: RepoActionMode,
    /**
     * Human operators. Each entry carries the identity we use for the
     * validation role of rule 16 (a human, not an agent).
     */
    contacts: z
      .array(
        z
          .object({
            id: kebab,
            displayName: z.string().min(2),
            email: z.string().email(),
            /**
             * `owner` can validate panels, approve fixes, enable the
             * scheduler. `member` can author but cannot validate. Agents
             * never carry a human role.
             */
            role: z.enum(["owner", "member"]),
          })
          .strict(),
      )
      .default([]),
    note: z.string().optional(),
  })
  .strict();

/**
 * A site is one web property. It always belongs to one client; it may be
 * attached to one or more subjects. The repository, when present, carries
 * its own action mode which overrides the client default.
 */
export const SiteSchema = z
  .object({
    id: kebab,
    clientId: kebab,
    primaryUrl: httpsUrl,
    additionalUrls: z.array(httpsUrl).default([]),
    status: z.enum(["active", "paused", "archived"]),
    /**
     * `null` means no repository connected; writes are then impossible.
     * `url` is left as a free string here so clients can have GitLab,
     * private hosting, or a bare directory. D1 restricts what the
     * connector actually accepts.
     */
    repository: z
      .object({
        url: z.string().min(3),
        branch: z.string().default("main"),
        /** Overrides client.defaultRepoActionMode for this repo. */
        actionMode: RepoActionMode,
      })
      .strict()
      .nullable()
      .default(null),
    note: z.string().optional(),
  })
  .strict();

/**
 * A subject is one measured brand or offer. `siteIds` references one or
 * more sites of the same client; the loader checks the client match.
 */
export const SubjectRefSchema = z
  .object({
    id: kebab,
    clientId: kebab,
    siteIds: z.array(kebab).min(1),
    status: z.enum(["draft", "active", "paused", "archived"]),
    note: z.string().optional(),
  })
  .strict();

export type Client = z.infer<typeof ClientSchema>;
export type Site = z.infer<typeof SiteSchema>;
export type SubjectRef = z.infer<typeof SubjectRefSchema>;

/** Full bundle a loader returns. No persistence is assumed. */
export interface TenancyBundle {
  clients: Client[];
  sites: Site[];
  subjects: SubjectRef[];
}

/**
 * Cross-entity invariants a schema alone cannot express. Returns a list of
 * human-readable problems. Empty list = valid. **A5 and every later table's
 * RLS use this exact contract**: a row of client A is never visible from
 * client B.
 */
export function checkTenancy(b: TenancyBundle): string[] {
  const problems: string[] = [];
  const clientIds = new Set(b.clients.map((c) => c.id));
  if (clientIds.size !== b.clients.length) problems.push("client id appears twice");

  const siteIds = new Set<string>();
  for (const s of b.sites) {
    if (siteIds.has(s.id)) problems.push(`site ${s.id} appears twice`);
    siteIds.add(s.id);
    if (!clientIds.has(s.clientId)) problems.push(`site ${s.id}: unknown clientId "${s.clientId}"`);
    // Every external client defaults to `proposition`; `direct` is refused.
    const client = b.clients.find((c) => c.id === s.clientId);
    if (s.repository && client && client.ownership === "external" && s.repository.actionMode === "direct") {
      problems.push(`site ${s.id}: external client cannot grant "direct" repo action`);
    }
  }

  const subjectIds = new Set<string>();
  for (const su of b.subjects) {
    if (subjectIds.has(su.id)) problems.push(`subject ${su.id} appears twice`);
    subjectIds.add(su.id);
    if (!clientIds.has(su.clientId)) problems.push(`subject ${su.id}: unknown clientId "${su.clientId}"`);
    for (const sid of su.siteIds) {
      if (!siteIds.has(sid)) problems.push(`subject ${su.id}: unknown siteId "${sid}"`);
      const site = b.sites.find((s) => s.id === sid);
      if (site && site.clientId !== su.clientId) {
        problems.push(`subject ${su.id}: siteId "${sid}" belongs to client "${site.clientId}", not "${su.clientId}"`);
      }
    }
  }
  return problems;
}

/**
 * What a row stamped for isolation looks like. Every table added by later
 * blocks carries these three columns and enforces them via RLS. The
 * `subjectId` is nullable because a client-level audit log row is not
 * attached to any subject; it is still client-scoped.
 */
export interface Tenanted {
  clientId: string;
  siteId: string | null;
  subjectId: string | null;
}

/**
 * Validates that a caller reading a row holds the matching client scope.
 * The test suite for A5 and C1 reuses this helper to check that a
 * cross-client read raises.
 */
export function assertTenantReadAllowed(row: Tenanted, scope: { clientId: string }): void {
  if (row.clientId !== scope.clientId) {
    throw new Error(`tenant isolation: row of client "${row.clientId}" read with scope "${scope.clientId}"`);
  }
}

/** `direct` is only acceptable for internal clients. */
export function resolveActionMode(client: Client, site: Site): RepoActionMode {
  const mode = site.repository?.actionMode ?? client.defaultRepoActionMode;
  if (mode === "direct" && client.ownership === "external") {
    // Would never pass checkTenancy either; defensive rebound.
    return "proposition";
  }
  return mode;
}

export const _schemas = { ClientSchema, SiteSchema, SubjectRefSchema, isoDate, httpsUrl, kebab, ownerRepo };
