/**
 * Milestone 0 ingestion models (spec §5–§9). These are the honest, evidence-first
 * shapes: a fetch attempt is recorded separately from artifact processing; every
 * material fact carries provenance and a source locator; verification is
 * deterministic and caps at MANUAL_REVIEW_REQUIRED without a human.
 */

export type IngestionMode =
  | "MANUAL_OFFICIAL_URL"
  | "DISCOVERED_CANDIDATE_URL"
  | "OFFICIAL_PDF"
  | "MANUAL_DOCUMENT";

export type SourceFormat =
  | "STATIC_HTML"
  | "CLIENT_RENDERED_SPA"
  | "PDF"
  | "AUTHENTICATED"
  | "BLOCKED"
  | "UNSUPPORTED"
  | "UNKNOWN";

export type FetchStatus =
  | "OK"
  | "BLOCKED" // organizational egress / policy denial (e.g. 403 CONNECT)
  | "SOURCE_UNAVAILABLE"
  | "TIMEOUT"
  | "TOO_LARGE"
  | "UNSUPPORTED_CONTENT_TYPE"
  | "SSRF_BLOCKED"
  | "ERROR"
  | "NOT_ATTEMPTED";

export type RenderMethod = "NONE" | "STATIC_HTTP" | "LOCAL_FILE" | "HEADLESS";

export type VerificationStatus =
  | "DISCOVERED_UNVERIFIED"
  | "OFFICIAL_SOURCE_FOUND"
  | "VERIFIED"
  | "VERIFICATION_FAILED"
  | "SOURCE_UNAVAILABLE"
  | "MANUAL_REVIEW_REQUIRED"
  | "REJECTED";

export type FactClassification =
  | "CONFIRMED_OFFICIAL"
  | "EXTRACTED_FROM_OFFICIAL_SOURCE"
  | "INFERRED"
  | "USER_PROVIDED"
  | "UNKNOWN";

export type DeadlineType =
  | "APPLICATION"
  | "EXPRESSION_OF_INTEREST"
  | "CONSORTIUM_REGISTRATION"
  | "DOCUMENT_SUBMISSION"
  | "PROGRAMME_PERIOD"
  | "ROLLING"
  | "UNKNOWN";

export type LocatorType =
  | "HTML_HEADING"
  | "CSS_SELECTOR"
  | "JSON_PATH"
  | "TABLE_ROW"
  | "PDF_PAGE"
  | "DOCUMENT_SECTION";

export interface SourceLocator {
  type: LocatorType;
  /** e.g. CSS selector, JSON path, section title, "h2:Eligibility". */
  value: string;
  /** 1-based page number for PDF_PAGE. */
  page?: number;
}

/** A single material fact with full provenance (spec §8). */
export interface MaterialFact {
  field: string;
  normalizedValue: string;
  originalSourceText: string;
  classification: FactClassification;
  sourceArtifactId: string;
  locator: SourceLocator;
  extractionMethod: string; // e.g. "deterministic-regex", "css-selector", "llm"
  extractingProvider: string; // "deterministic" | "anthropic" | ...
  extractingModel: string; // "rules-v1" | model id | "none"
  extractionConfidence: number; // 0..1
  validationResult: "valid" | "invalid" | "unchecked";
  reviewerCorrection?: string | null;
  auditEventId?: string | null;
}

/** A live-fetch attempt, recorded even when BLOCKED (spec §3, §5). */
export interface LiveFetchAttempt {
  attemptedUrl: string;
  fetchStatus: FetchStatus;
  httpCode?: number;
  /** true when the egress proxy denied the CONNECT (organizational policy). */
  egressDenied: boolean;
  proxyCode?: number; // e.g. 403 from the CONNECT tunnel
  fetchedAt: string; // ISO
  durationMs: number;
  error?: string;
  /** Whether scripts/external resources failed (relevant to SPA). */
  scriptsOrResourcesFailed?: boolean;
}

/** A stored source artifact (fetched OR supplied as a local official file). */
export interface SourceArtifact {
  id: string;
  ingestionMode: IngestionMode;
  sourceFormat: SourceFormat;
  /** The official URL this artifact claims to come from. */
  originalUrl: string;
  canonicalUrl?: string;
  finalUrl?: string;
  issuingOrganization: string;
  localFilename?: string;
  contentType: string;
  byteSize: number;
  contentHash: string; // sha256 of the raw bytes
  retrievedAt: string; // from manifest (when the human downloaded it) or fetch time
  renderMethod: RenderMethod;
  /** Extracted, normalized text used for fact extraction (not the source of truth). */
  text: string;
  /** The linked live-fetch attempt (BLOCKED in this environment). */
  liveFetch?: LiveFetchAttempt;
  /** Whether the artifact itself was processed successfully. */
  processing: "SUCCESS" | "FAILURE";
  processingError?: string;
  /** For PDFs: per-page text lengths, to prove page-level extraction is possible. */
  pageCount?: number;
}

/** Deadline record with full provenance (spec §9). */
export interface DeadlineRecord {
  originalSourceString: string;
  normalized?: string; // ISO date/timestamp when determinable
  sourceTimezone?: string;
  normalizationMethod: string;
  deadlineType: DeadlineType;
  locator: SourceLocator;
  confidence: number; // 0..1
  /** true when the source hedges ("to be confirmed", "confirm", "TBC"). */
  isConfirmPending: boolean;
  conflicts: string[]; // other official date strings that disagree
}

/** Deterministic primary-source verification record (spec §7). */
export interface VerificationRecord {
  discoveredUrl?: string;
  canonicalUrl?: string;
  officialSourceUrl?: string;
  issuingOrganization: string;
  officialDomain?: string;
  applicationDomain?: string;
  domainVerificationMethod: string;
  sourceFormat: SourceFormat;
  fetchedAt?: string;
  sourceHash?: string;
  verificationStatus: VerificationStatus;
  verificationEvidence: string[];
  manualReviewer?: string | null;
  verifiedAt?: string | null;
}

/** The complete per-source ingestion result. */
export interface IngestionResult {
  artifact: SourceArtifact;
  verification: VerificationRecord;
  facts: MaterialFact[];
  deadlines: DeadlineRecord[];
  warnings: string[];
}
