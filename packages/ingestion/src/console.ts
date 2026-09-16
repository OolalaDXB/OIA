import type {
  FactClassification,
  SourceLocator,
  SourceFormat,
  RenderMethod,
  FetchStatus,
  VerificationStatus,
  DeadlineType,
} from "./models";
import type { M0GateReport, M0Recommendation } from "./gate";
import type { ObservedForRecord, Discrepancy } from "./discrepancy";
import type {
  ApplicationEligibility,
  AwardEligibility,
  StrategicRoute,
} from "@oia/scoring";

/**
 * Self-contained view model the review console (apps/web) reads from
 * outputs/milestone-0/console.json. Every field reuses an existing domain type;
 * the web app imports THIS type and never redefines DTOs (spec §12, test §18.12).
 * Full artifact text is intentionally excluded (kept in the local dump); facts
 * carry short original-source excerpts only.
 */

export interface ConsoleFact {
  field: string;
  normalizedValue: string;
  classification: FactClassification;
  locator: SourceLocator;
  extractionMethod: string;
  extractingProvider: string;
  extractingModel: string;
  extractionConfidence: number;
  originalSourceText: string;
}

export interface ConsoleDeadline {
  normalized?: string;
  originalSourceString: string;
  deadlineType: DeadlineType;
  isConfirmPending: boolean;
  locator: SourceLocator;
  conflicts: string[];
}

/**
 * Opportunity sub-typing now lives in `opportunity-kinds.ts`, which replaced the
 * original four values with nine — and, more importantly, stopped assuming that
 * every opportunity is a call with a deadline. Re-exported here so the console's
 * existing imports keep working.
 */
import type { OpportunityKind } from "./opportunity-kinds";
export { OPPORTUNITY_KINDS } from "./opportunity-kinds";
export type { OpportunityKind } from "./opportunity-kinds";

export interface ConsoleRecord {
  id: string;
  title: string;
  issuer: string;
  /**
   * Sub-type discriminant. Records written before the taxonomy grew carry the
   * legacy values (TENDER_RFP, VC_INVESTOR) — `normalizeKind` maps them on read
   * rather than rewriting what a past run actually produced.
   */
  opportunityKind?: OpportunityKind | "TENDER_RFP" | "VC_INVESTOR";
  linkedBy: ObservedForRecord["linkedBy"];

  officialUrl?: string;
  discoveryUrl?: string;
  applicationUrl?: string;

  artifact?: {
    id: string;
    sourceFormat: SourceFormat;
    contentHash: string;
    renderMethod: RenderMethod;
    byteSize: number;
    pageCount?: number;
    localFilename?: string;
    processing: "SUCCESS" | "FAILURE";
    processingError?: string;
  };
  liveFetch?: {
    attemptedUrl: string;
    status: FetchStatus;
    egressDenied: boolean;
    proxyCode?: number;
    error?: string;
  };

  verificationStatus: VerificationStatus;
  verificationEvidence: string[];

  application: ApplicationEligibility;
  award: AwardEligibility;
  strategicRoute: StrategicRoute;

  scores: {
    relevance: number | null;
    winPotential: number | null;
    infoConfidence: number;
  };
  gate?: M0GateReport;
  recommendation: M0Recommendation;
  humanReview: "PENDING" | "APPROVE" | "REJECT" | "NEEDS_VERIFICATION";

  /**
   * Projects whose discovery query surfaced this record (registry slugs).
   * Discovery provenance, NOT a match verdict: the suggestion engine still has
   * to argue the fit and the gate still has to pass. Absent on records
   * generated before the registry existed.
   */
  discoveredFor?: string[];
  /**
   * What the analyst concluded, and why.
   *
   * A CLAIM, never a certification. It deliberately does not touch
   * `gate.eligibilityAssessed`: a model judging is not a human judging, and a
   * gate a model can open is not a gate. What it changes is the order you look
   * in, and the reason a record is set aside — from "nobody has judged whether
   * we can apply" to "a model judged, you have not confirmed".
   */
  assessment?: {
    verdict: "ELIGIBLE" | "LIKELY" | "NEEDS_INFO" | "NOT_ELIGIBLE";
    projectSlug: string;
    reason: { fr: string; en: string };
    nextAction: { fr: string; en: string };
    entity?: string;
    missing?: string[];
    /** Sentences from the opportunity itself, each checked to be present. */
    citations: string[];
    by: "model";
    model: string;
    at: string;
  };
  /** Cross-source identity key (see dedup.ts). Set when a dataset is deduped. */
  dedupKey?: string;
  /** Ids of duplicate records merged into this one — never silently dropped. */
  mergedFrom?: string[];
  /** Deterministic expiry/recency re-check, applied on read (see freshness.ts). */
  freshness?: {
    status: "FRESH" | "CLOSING_SOON" | "EXPIRED" | "NO_DEADLINE";
    daysToDeadline: number | null;
    ageDays: number | null;
    reasons: string[];
  };

  facts: ConsoleFact[];
  deadlines: ConsoleDeadline[];
  conflicts: string[];
  discrepancies: Discrepancy[];
  expected: {
    recommendation?: string;
    verificationStatus?: string;
    sourceFormat?: string;
  };
  unresolvedQuestions: string[];
  warnings: string[];
}

export interface ConsoleData {
  note: string;
  run: {
    records: number;
    artifactsIngested: number;
    discrepancies: number;
    warnings: string[];
    recommendationCounts: Record<string, number>;
  };
  records: ConsoleRecord[];
}
