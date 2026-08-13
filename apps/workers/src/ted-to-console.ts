import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
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

export function tedCandidatesToConsole(candidates: TedCandidate[]): ConsoleData {
  const records = candidates.map(toConsoleRecord);
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

/** Standalone: read the last TED run output and refresh the console data. */
function main() {
  const candidatesPath = fromRoot("outputs/sprint-1/candidates.json");
  const candidates = JSON.parse(readFileSync(candidatesPath, "utf8")) as TedCandidate[];
  const data = tedCandidatesToConsole(candidates);

  const webData = fromRoot("apps/web/src/data/console.json");
  mkdirSync(dirname(webData), { recursive: true });
  writeFileSync(webData, JSON.stringify(data, null, 2), "utf8");
  writeFileSync(fromRoot("outputs/sprint-1/console.json"), JSON.stringify(data, null, 2), "utf8");
  console.log(`Wrote console data for ${data.records.length} TED candidate(s) → apps/web/src/data/console.json`);
}

// Run when invoked directly (tsx src/ted-to-console.ts).
main();
