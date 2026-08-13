import type { ProjectProfile, SourceKind } from "@oia/database";
import type { PolicyHooks } from "@oia/audit";

/** A candidate opportunity as discovered from a source, before qualification. */
export interface RawOpportunity {
  sourceKey: string;
  externalId: string; // stable id within the source, used for dedup
  title: string;
  url: string; // canonical primary link
  discoveredAt: string; // ISO
  /** Fields the source already exposes (deadline, status, amount…) — untrusted until corroborated. */
  hints: {
    programmeName?: string;
    funder?: string;
    deadlineAt?: string; // ISO, source-claimed
    status?: "open" | "upcoming" | "closed" | "unknown";
    amountMin?: number;
    amountMax?: number;
    currency?: string;
    summary?: string;
  };
  raw: unknown; // original payload, retained for provenance
}

/** An immutable snapshot of a fetched source. */
export interface FetchedEvidence {
  url: string;
  httpStatus: number;
  fetchedAt: string; // ISO
  contentType?: string;
  text: string; // normalized extracted text
  contentHash: string; // sha256 of `text`
}

export interface StatusResult {
  status: "open" | "upcoming" | "closed" | "unknown";
  deadlineAt?: string;
}

export interface ConnectorContext {
  /** Polite, policy-checked fetcher that yields hash-pinned evidence. */
  fetchText(url: string): Promise<FetchedEvidence>;
  policy: PolicyHooks;
  log: (event: string, data?: unknown) => void;
  env: {
    euFtApiKey: string;
    euFtBaseUrl: string;
    userAgent: string;
    timeoutMs: number;
    /** TED Search API config (optional; connectors default when unset). */
    tedBaseUrl?: string;
    /** Raw TED expert query override (built on the TED site, pasted verbatim). */
    tedQuery?: string;
    /** TED result page size (max 250). */
    tedPageSize?: number;
    /** Recency floor (TED format YYYYMMDD): publication-date >= this. Ignored when tedQuery is set. */
    tedPublishedSince?: string;
  };
}

export interface SourceConnector {
  readonly key: string;
  readonly kind: SourceKind;
  /** Discover candidate opportunities for a project profile. */
  discover(ctx: ConnectorContext, project: ProjectProfile): Promise<RawOpportunity[]>;
  /** Fetch and normalize the primary source for one opportunity. */
  fetch(ctx: ConnectorContext, url: string): Promise<FetchedEvidence>;
  /** Optional: re-check whether a known opportunity is still open. */
  checkStatus?(ctx: ConnectorContext, opportunity: RawOpportunity): Promise<StatusResult>;
}
