import type { SourceArtifact, VerificationRecord, VerificationStatus } from "./models";
import type { ArtifactManifestEntry } from "./manifest";
import { officialDomainFor } from "./manifest";

/**
 * Deterministic primary-source verification (spec §7). Key rule: a source is
 * NEVER verified just because the organisation name resembles the domain. The
 * automated path caps at MANUAL_REVIEW_REQUIRED; only a human confirms VERIFIED.
 * Aggregators/blogs/newsletters can create a lead but never produce VERIFIED.
 */

const GOV_SUPRANATIONAL_SUFFIXES = [
  ".gov", ".gov.uk", ".gouv.fr", ".europa.eu", ".int", ".un.org", ".unesco.org",
  ".gov.qa", ".gov.ae", ".nsf.gov", ".mil",
];

const AGGREGATOR_HINTS = [
  "medium.com", "linkedin.com", "twitter.com", "x.com", "facebook.com",
  "substack.com", "wordpress.com", "blogspot.", "news", "magazine",
];

export function isGovOrSupranationalDomain(domain: string): boolean {
  const d = domain.toLowerCase();
  return GOV_SUPRANATIONAL_SUFFIXES.some((s) => d === s.replace(/^\./, "") || d.endsWith(s));
}

export function looksLikeAggregator(domain: string): boolean {
  const d = domain.toLowerCase();
  return AGGREGATOR_HINTS.some((h) => d.includes(h));
}

/** Token overlap between the expected title and the artifact text (evidence only). */
function contentConsistent(expectedTitle: string, text: string): boolean {
  const tokens = expectedTitle
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 4);
  if (tokens.length === 0) return false;
  const lower = text.toLowerCase();
  const hits = tokens.filter((t) => lower.includes(t)).length;
  return hits / tokens.length >= 0.5;
}

/**
 * Verify a locally supplied official artifact. Deterministic ceiling is
 * MANUAL_REVIEW_REQUIRED (or VERIFICATION_FAILED / REJECTED). A human closes it.
 */
export function verifySuppliedArtifact(
  entry: ArtifactManifestEntry,
  artifact: SourceArtifact,
): VerificationRecord {
  const officialDomain = officialDomainFor(entry);
  const evidence: string[] = [];
  let status: VerificationStatus = "MANUAL_REVIEW_REQUIRED";

  evidence.push(`issuer domain recorded from official URL: ${officialDomain}`);
  if (isGovOrSupranationalDomain(officialDomain)) {
    evidence.push(`government/supranational domain: ${officialDomain}`);
  }
  if (looksLikeAggregator(officialDomain)) {
    evidence.push(`domain resembles an aggregator/social host: ${officialDomain}`);
    status = "DISCOVERED_UNVERIFIED"; // cannot be an official primary source
  }
  if (entry.applicationUrl) {
    evidence.push(`application portal linked by issuer: ${new URL(entry.applicationUrl).host}`);
  }

  if (artifact.processing === "FAILURE") {
    status = "VERIFICATION_FAILED";
    evidence.push(`artifact processing failed: ${artifact.processingError ?? "unknown"}`);
  } else {
    const consistent = contentConsistent(entry.expectedDocumentTitle, artifact.text);
    evidence.push(
      consistent
        ? "artifact content is consistent with the named programme (token overlap ≥ 50%)"
        : "artifact content does NOT clearly match the expected title — needs human review",
    );
    if (!consistent && status === "MANUAL_REVIEW_REQUIRED") {
      evidence.push("content-consistency check failed → still requires human review, not auto-reject");
    }
  }

  return {
    discoveredUrl: entry.originalUrl,
    canonicalUrl: artifact.canonicalUrl,
    officialSourceUrl: entry.originalUrl,
    issuingOrganization: entry.issuingOrganization,
    officialDomain,
    applicationDomain: entry.applicationUrl ? new URL(entry.applicationUrl).host : undefined,
    domainVerificationMethod: "manifest-official-url + human-confirmation-required",
    sourceFormat: artifact.sourceFormat,
    fetchedAt: artifact.retrievedAt,
    sourceHash: artifact.contentHash,
    verificationStatus: status,
    verificationEvidence: evidence,
    manualReviewer: null,
    verifiedAt: null,
  };
}

/** Aggregator-only / discovered lead: never scored as a real opportunity. */
export function discoveredLead(url: string, issuer: string): VerificationRecord {
  const domain = (() => {
    try {
      return new URL(url).host.toLowerCase();
    } catch {
      return "unknown";
    }
  })();
  return {
    discoveredUrl: url,
    issuingOrganization: issuer,
    officialDomain: domain,
    domainVerificationMethod: "none (discovery source only)",
    sourceFormat: "UNKNOWN",
    verificationStatus: "DISCOVERED_UNVERIFIED",
    verificationEvidence: [
      `discovery source only: ${domain}`,
      "an aggregator/blog/newsletter/search result cannot independently produce VERIFIED or PURSUE",
    ],
    manualReviewer: null,
    verifiedAt: null,
  };
}

/** The ONLY path to VERIFIED: an explicit human confirmation of the issuer↔domain link. */
export function applyHumanVerification(
  record: VerificationRecord,
  reviewer: string,
  verifiedAtIso: string,
  approve: boolean,
): VerificationRecord {
  if (!approve) {
    return { ...record, verificationStatus: "REJECTED", manualReviewer: reviewer, verifiedAt: verifiedAtIso };
  }
  // Can only promote from a review-eligible state.
  const eligible: VerificationStatus[] = ["MANUAL_REVIEW_REQUIRED", "OFFICIAL_SOURCE_FOUND"];
  if (!eligible.includes(record.verificationStatus)) {
    return record; // cannot verify a DISCOVERED_UNVERIFIED or FAILED source directly
  }
  return {
    ...record,
    verificationStatus: "VERIFIED",
    manualReviewer: reviewer,
    verifiedAt: verifiedAtIso,
    verificationEvidence: [...record.verificationEvidence, `human confirmed issuer-domain relationship: ${reviewer}`],
  };
}
