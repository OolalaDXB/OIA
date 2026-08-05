import type { SeedRecord } from "./seed-manifest";
import type { M0Recommendation } from "./gate";
import type { VerificationStatus, SourceFormat, FetchStatus } from "./models";

/**
 * Seed↔observed comparator (spec §1, §10). Each seed `expected_*` is a HYPOTHESIS;
 * this compares it against what the deterministic pipeline actually observed and
 * emits a discrepancy for every disagreement. This is the value of OIA: not
 * "the document says X" but "the real result contradicts your assumption Y".
 *
 * Two seed records may point at the SAME artifact (e.g. a closed call vs a PDF
 * fixture); each is compared independently with its own structural context, so
 * they are never conflated.
 */

export interface ObservedForRecord {
  linkedBy: "localArtifact" | "officialUrl" | "discoveryUrl" | "none";
  hasArtifact: boolean;
  artifactId?: string;
  sourceFormat?: SourceFormat;
  verificationStatus: VerificationStatus;
  recommendation: M0Recommendation;
  liveFetchStatus?: FetchStatus;
  /** Observed material-fact field names (e.g. "amount", "topic_identifier"). */
  factFields: string[];
}

export interface Discrepancy {
  recordId: string;
  field: string;
  seedExpectation: string;
  observed: string;
  evidence: string;
  ruleApplied: string;
  humanReviewRequired: boolean;
}

export function compareRecord(seed: SeedRecord, obs: ObservedForRecord): Discrepancy[] {
  const out: Discrepancy[] = [];
  const add = (
    field: string,
    seedExpectation: string,
    observed: string,
    evidence: string,
    ruleApplied: string,
    humanReviewRequired = false,
  ) => out.push({ recordId: seed.id, field, seedExpectation, observed, evidence, ruleApplied, humanReviewRequired });

  // Recommendation (the headline hypothesis).
  if (seed.expectedRecommendation && seed.expectedRecommendation !== obs.recommendation) {
    add(
      "recommendation",
      seed.expectedRecommendation,
      obs.recommendation,
      `verification=${obs.verificationStatus}; hasArtifact=${obs.hasArtifact}; liveFetch=${obs.liveFetchStatus ?? "n/a"}`,
      "deterministic-gate",
      true,
    );
  }

  // Verification status.
  if (seed.expectedVerificationStatus && seed.expectedVerificationStatus !== obs.verificationStatus) {
    add(
      "verificationStatus",
      seed.expectedVerificationStatus,
      obs.verificationStatus,
      obs.hasArtifact ? `artifact ${obs.artifactId}` : `linked by ${obs.linkedBy}`,
      "verification-rules",
      true,
    );
  }

  // Source format (classifier vs the seed's claim).
  if (seed.expectedSourceFormat && obs.sourceFormat && seed.expectedSourceFormat !== obs.sourceFormat) {
    add("sourceFormat", seed.expectedSourceFormat, obs.sourceFormat, "content classifier", "format-classification");
  }

  // Expected facts the seed asserted but which were NOT observed in the official source.
  if (seed.expectedExtractedFacts) {
    for (const key of Object.keys(seed.expectedExtractedFacts)) {
      if (!obs.factFields.includes(key)) {
        add(
          `fact:${key}`,
          typeof seed.expectedExtractedFacts[key] === "string"
            ? (seed.expectedExtractedFacts[key] as string)
            : JSON.stringify(seed.expectedExtractedFacts[key]),
          "not extracted from official source",
          obs.hasArtifact ? "official artifact processed" : "no official artifact",
          "fact-extraction",
          true,
        );
      }
    }
  }

  // Aggregator hygiene: a lead flagged aggregator-only must not carry confirmed facts.
  if (seed.isAggregatorOnly && obs.factFields.length > 0) {
    add(
      "aggregatorFacts",
      "no confirmed facts (aggregator-only)",
      `${obs.factFields.length} fact(s) observed`,
      "aggregator lead",
      "aggregator-no-confirmed-facts",
      true,
    );
  }

  return out;
}
