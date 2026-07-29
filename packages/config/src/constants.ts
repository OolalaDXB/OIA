/**
 * Scoring / gate constants. Changing these should bump SCORING_MODEL_VERSION so
 * stored scores remain comparable to the model that produced them.
 * See docs/architecture/05-scoring-model.md.
 */

export const SCORING_MODEL_VERSION = "v1";

/** Info-confidence (0..100) required for the PURSUE gate to pass. */
export const DEFAULT_CONFIDENCE_FLOOR = 70;

/** Relevance factor weights (sum ≈ 1.0). */
export const RELEVANCE_WEIGHTS = {
  sector: 0.35,
  geography: 0.25,
  fundingType: 0.2,
  amount: 0.1,
  stage: 0.1,
} as const;

/** Win-potential factor weights (sum ≈ 1.0). */
export const WIN_WEIGHTS = {
  fitStrength: 0.3,
  competition: 0.2,
  amountEffort: 0.2,
  trackRecord: 0.2,
  timingHeadroom: 0.1,
} as const;

/** Key fields used by the information-confidence score and the gate. */
export const KEY_FIELDS = [
  "deadline",
  "open_status",
  "eligibility",
  "funder",
  "amount",
  "primary_url",
] as const;

export type KeyField = (typeof KEY_FIELDS)[number];

/**
 * Ingestion / fetch-security limits (Milestone 0, spec §5–§6). Conservative
 * defaults; tune via env if needed.
 */
export const INGESTION_LIMITS = {
  maxRedirects: 5,
  timeoutMs: 30_000,
  maxResponseBytes: 10 * 1024 * 1024, // 10 MB
  maxDecompressedBytes: 50 * 1024 * 1024, // 50 MB (decompression-bomb guard)
  rateLimitPerHostPerMinute: 20,
} as const;

/** Content types the fetcher will retain. Anything else → UNSUPPORTED. */
export const FETCH_CONTENT_TYPE_ALLOWLIST = [
  "text/html",
  "application/xhtml+xml",
  "application/pdf",
  "text/plain",
] as const;

/**
 * Domain denylist (never fetch) and optional allowlist. Empty allowlist means
 * "no allowlist filter" (deny-by-policy still applies via the egress proxy).
 */
export const FETCH_DOMAIN_DENYLIST: string[] = [];
export const FETCH_DOMAIN_ALLOWLIST: string[] = [];
