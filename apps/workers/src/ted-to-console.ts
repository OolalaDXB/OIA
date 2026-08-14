import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import type { ConsoleData, ConsoleRecord, ConsoleFact, SourceFormat, FetchStatus, VerificationStatus } from "@oia/ingestion";
import { fromRoot } from "./paths";

/**
 * Builds the review-console data (ConsoleData) from a real TED discovery run
 * (outputs/sprint-1/candidates.json) and writes it where apps/web reads it.
 * Reuses the existing ConsoleRecord model — no new DTO. Facts shown are the
 * official TED metadata fields with their JSON_PATH locators; verification caps
 * at MANUAL_REVIEW_REQUIRED (never VERIFIED without a human).
 */

interface TedCandidate {
  externalId: string;
  title: string;
  officialUrl: string;
  issuer?: string;
  liveFetch: string;
  sourceFormat?: string;
  contentHash?: string;
  verificationStatus: string;
  verificationEvidence: string[];
  factCount: number;
  provenance: { field: string; value: string; locator: { type: string; value: string } }[];
}

function toConsoleRecord(c: TedCandidate): ConsoleRecord {
  const facts: ConsoleFact[] = c.provenance.map((p) => ({
    field: p.field,
    normalizedValue: p.value,
    classification: "EXTRACTED_FROM_OFFICIAL_SOURCE",
    locator: { type: "JSON_PATH", value: p.locator.value },
    extractionMethod: "ted-search-api",
    extractingProvider: "ted",
    extractingModel: "search-api-v3",
    extractionConfidence: 0.85,
    originalSourceText: p.value,
  }));

  // TED discovery does not assess eligibility and is never human-VERIFIED here:
  // a gate that cannot pass, so APPROVE can never force PURSUE.
  const gate = {
    accessiblePrimarySource: true,
    verifiedSource: false,
    verifiedDeadline: false,
    notExpired: true,
    eligibilityAssessed: false,
    notAggregatorOnly: true,
    notClosedCall: true,
    hasExactNextAction: false,
    sufficientConfidence: false,
    pursueEligible: false,
    failedReasons: ["source not human-VERIFIED", "eligibility not assessed"],
  };

  return {
    id: c.externalId,
    title: c.title,
    issuer: c.issuer ?? "European Union — TED",
    opportunityKind: "TENDER_RFP", // TED = public procurement notices
    linkedBy: "officialUrl",
    officialUrl: c.officialUrl,
    artifact: c.contentHash
      ? {
          id: c.externalId,
          sourceFormat: (c.sourceFormat as SourceFormat | undefined) ?? "STATIC_HTML",
          contentHash: c.contentHash,
          renderMethod: "STATIC_HTTP",
          byteSize: 0,
          processing: "SUCCESS",
        }
      : undefined,
    liveFetch: {
      attemptedUrl: c.officialUrl,
      status: (c.liveFetch as FetchStatus | undefined) ?? "OK",
      egressDenied: false,
    },
    verificationStatus: c.verificationStatus as VerificationStatus,
    verificationEvidence: c.verificationEvidence,
    application: "UNKNOWN",
    award: "UNKNOWN",
    strategicRoute: "UNKNOWN",
    scores: { relevance: null, winPotential: null, infoConfidence: Math.min(50, 15 + facts.length * 5) },
    gate,
    recommendation: "INVESTIGATE",
    humanReview: "PENDING",
    facts,
    deadlines: [],
    conflicts: [],
    discrepancies: [],
    expected: {},
    unresolvedQuestions: [
      "Eligibility not assessed (TED discovery surfaces metadata; qualification is Sprint 2+).",
      "Source not human-VERIFIED — a reviewer must confirm before PURSUE.",
    ],
    warnings: [],
  };
}

function publicationDate(c: TedCandidate): string {
  return c.provenance.find((p) => p.field === "publication-date")?.value ?? "";
}

export function tedCandidatesToConsole(candidates: TedCandidate[]): ConsoleData {
  // Most recent first (publication-date desc): current opportunities lead the queue.
  const records = [...candidates]
    .sort((a, b) => publicationDate(b).localeCompare(publicationDate(a)))
    .map(toConsoleRecord);
  return {
    note: "Sprint 1 — real TED discovery (live run). Candidates found via the TED Search API and run through the existing engine; each caps at MANUAL_REVIEW_REQUIRED — never VERIFIED without a human. Facts are the official TED metadata fields with their JSON_PATH locators.",
    run: {
      records: records.length,
      artifactsIngested: records.length,
      discrepancies: 0,
      warnings: [],
      recommendationCounts: { INVESTIGATE: records.length },
    },
    records,
  };
}

/**
 * Merge the two REAL runs into one console dataset: the Milestone-0 funding
 * opportunities (official PDFs, seed comparison) AND the Sprint-1 TED
 * discovery. Both are real outputs; neither replaces the other.
 */
/**
 * Explicit kind per M0 record (reviewable data, not a title heuristic).
 * Unlisted M0 records default to GRANT — the M0 seed is funding calls.
 */
const M0_KIND_OVERRIDES: Record<string, "TENDER_RFP" | "VC_INVESTOR"> = {
  "unesco-ungm-300342": "TENDER_RFP", // an RFP, not a grant call
  "startup-qatar-qdb-start": "VC_INVESTOR", // equity investment programme
};

export function mergeConsoleData(ted: ConsoleData, m0: ConsoleData | null): ConsoleData {
  if (!m0) return ted;
  const m0Records = m0.records.map((r) => ({
    ...r,
    opportunityKind: r.opportunityKind ?? M0_KIND_OVERRIDES[r.id] ?? ("GRANT" as const),
  }));
  const counts: Record<string, number> = { ...m0.run.recommendationCounts };
  for (const [k, v] of Object.entries(ted.run.recommendationCounts)) counts[k] = (counts[k] ?? 0) + v;
  return {
    note: `${m0.note ? `Milestone 0 — ${m0.note} ` : ""}· ${ted.note}`,
    run: {
      records: m0.run.records + ted.run.records,
      artifactsIngested: m0.run.artifactsIngested + ted.run.artifactsIngested,
      discrepancies: m0.run.discrepancies + ted.run.discrepancies,
      warnings: [...m0.run.warnings, ...ted.run.warnings],
      recommendationCounts: counts,
    },
    // Funding opportunities (the shortlist work) lead; TED notices follow,
    // already sorted most-recent-first. The UI re-sorts client-side anyway.
    records: [...m0Records, ...ted.records],
  };
}

/** Standalone: read the last TED run output and refresh the console data. */
function main() {
  const candidatesPath = fromRoot("outputs/sprint-1/candidates.json");
  const candidates = JSON.parse(readFileSync(candidatesPath, "utf8")) as TedCandidate[];

  const m0Path = fromRoot("outputs/milestone-0/console.json");
  const m0 = existsSync(m0Path) ? (JSON.parse(readFileSync(m0Path, "utf8")) as ConsoleData) : null;
  if (!m0) console.warn("outputs/milestone-0/console.json not found — console will only carry TED records.");

  const data = mergeConsoleData(tedCandidatesToConsole(candidates), m0);

  const webData = fromRoot("apps/web/src/data/console.json");
  mkdirSync(dirname(webData), { recursive: true });
  writeFileSync(webData, JSON.stringify(data, null, 2), "utf8");
  writeFileSync(fromRoot("outputs/sprint-1/console.json"), JSON.stringify(data, null, 2), "utf8");
  console.log(
    `Wrote console data: ${data.records.length} record(s) (${m0 ? m0.run.records : 0} M0 funding + ${data.records.length - (m0 ? m0.run.records : 0)} TED) → apps/web/src/data/console.json`,
  );
}

// Run when invoked directly (tsx src/ted-to-console.ts).
main();
