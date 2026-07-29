import {
  type IngestionResult,
  type M0Recommendation,
  type M0GateReport,
  evaluateM0Gate,
  evaluateDeadlineGate,
  automatedRecommendation,
} from "@oia/ingestion";
import {
  type ApplicationEligibility,
  type AwardEligibility,
  type StrategicRoute,
  deriveStrategicRoute,
} from "@oia/scoring";
import { DEFAULT_CONFIDENCE_FLOOR } from "@oia/config";

/**
 * Assemble a Milestone-0 opportunity record from a real ingestion result. The
 * eligibility engine returns UNKNOWN unless real programme rules resolve it — we
 * never fabricate eligibility. Recommendation ceilings at INVESTIGATE for the
 * automated (no-human) run because nothing is human-VERIFIED yet.
 */

export interface M0Opportunity {
  id: string;
  title: string;
  issuer: string;
  ingestion: IngestionResult;
  liveFetchStatus: string;
  artifactProcessing: "SUCCESS" | "FAILURE";
  application: ApplicationEligibility;
  award: AwardEligibility;
  strategicRoute: StrategicRoute;
  infoConfidence: number;
  gate: M0GateReport;
  recommendation: M0Recommendation;
  humanReview: "PENDING" | "APPROVE" | "REJECT" | "NEEDS_VERIFICATION";
}

/** Deterministic info-confidence (0..100) from facts + verification + deadline. */
export function computeInfoConfidence(ing: IngestionResult, hasVerifiedDeadline: boolean): number {
  const official = ing.facts.filter((f) => f.classification === "EXTRACTED_FROM_OFFICIAL_SOURCE").length;
  let score = 0;
  score += Math.min(official, 5) * 8; // up to 40
  if (ing.verification.verificationStatus === "VERIFIED") score += 30;
  else if (ing.verification.verificationStatus === "MANUAL_REVIEW_REQUIRED") score += 15;
  if (hasVerifiedDeadline) score += 20;
  if (ing.artifact.processing === "SUCCESS") score += 10;
  return Math.max(0, Math.min(100, score));
}

export interface AssembleOptions {
  today: string;
  application?: ApplicationEligibility;
  award?: AwardEligibility;
  isAggregatorOnly?: boolean;
  isClosedCall?: boolean;
  rollingStated?: boolean;
}

export function assembleOpportunity(id: string, ing: IngestionResult, opts: AssembleOptions): M0Opportunity {
  const deadlineGate = evaluateDeadlineGate({
    deadlines: ing.deadlines,
    today: opts.today,
    rollingStated: opts.rollingStated ?? false,
  });
  const application = opts.application ?? "UNKNOWN";
  const award = opts.award ?? "UNKNOWN";
  const strategicRoute = deriveStrategicRoute(application, award);
  const infoConfidence = computeInfoConfidence(ing, deadlineGate.hasVerifiableDeadline);

  const gateInput = {
    fetchStatus: ing.artifact.liveFetch?.fetchStatus ?? "NOT_ATTEMPTED",
    verificationStatus: ing.verification.verificationStatus,
    sourceFormat: ing.artifact.sourceFormat,
    hasOfficialArtifact: ing.artifact.processing === "SUCCESS",
    isAggregatorOnly: opts.isAggregatorOnly ?? false,
    isClosedCall: opts.isClosedCall ?? false,
    deadline: deadlineGate,
    application,
    award,
    hasExactNextAction: false, // no next action until a route is resolved
    infoConfidence,
    confidenceFloor: DEFAULT_CONFIDENCE_FLOOR,
  } as const;

  const gate = evaluateM0Gate(gateInput);
  const recommendation = automatedRecommendation(gateInput, gate);

  return {
    id,
    title: ing.artifact.text ? (ing.facts.find((f) => f.field === "title")?.normalizedValue ?? id) : id,
    issuer: ing.artifact.issuingOrganization,
    ingestion: ing,
    liveFetchStatus: ing.artifact.liveFetch?.fetchStatus ?? "NOT_ATTEMPTED",
    artifactProcessing: ing.artifact.processing,
    application,
    award,
    strategicRoute,
    infoConfidence,
    gate,
    recommendation,
    humanReview: "PENDING",
  };
}

// ── Output rendering (spec §17) ──────────────────────────────────────────────

export interface RunStats {
  attempted: number;
  fetchedLive: number;
  liveBlocked: number;
  artifactsProcessed: number;
  artifactFailures: number;
  spaDetected: number;
  pdfProcessed: number;
  verificationsRequiringReview: number;
  warnings: string[];
}

export function renderOpportunitiesJson(opps: M0Opportunity[]): string {
  return JSON.stringify(opps, null, 2);
}

export function renderShortlist(opps: M0Opportunity[]): string {
  const rows = opps
    .filter((o) => o.recommendation === "PURSUE" || o.recommendation === "INVESTIGATE" || o.recommendation === "PARTNER")
    .map(
      (o) =>
        `| ${o.title} | ${o.issuer} | ${o.recommendation} | ${o.strategicRoute} | ${o.ingestion.verification.verificationStatus} | ${o.infoConfidence} | live:${o.liveFetchStatus} |`,
    );
  return [
    "# Milestone 0 — Shortlist (real run)",
    "",
    "> Automated run; nothing is human-VERIFIED, so no item is PURSUE. INVESTIGATE = official artifact awaiting human verification.",
    "",
    "| Title | Issuer | Recommendation | Strategic route | Verification | Info conf. | Live fetch |",
    "|---|---|---|---|---|---|---|",
    ...(rows.length ? rows : ["| _none_ | | | | | | |"]),
    "",
  ].join("\n");
}

export function renderRejections(opps: M0Opportunity[]): string {
  const rows = opps
    .filter((o) => o.recommendation === "REJECT")
    .map((o) => `- **${o.title}** (${o.issuer}) — ${o.gate.failedReasons.join("; ") || "rejected"}`);
  return ["# Milestone 0 — Rejections", "", ...(rows.length ? rows : ["_none_"]), ""].join("\n");
}

export function renderRunReport(stats: RunStats, opps: M0Opportunity[]): string {
  return [
    "# Milestone 0 — Run report",
    "",
    "## Live fetch vs artifact processing (reported separately)",
    `- sources attempted: ${stats.attempted}`,
    `- live fetch succeeded: ${stats.fetchedLive}`,
    `- live fetch BLOCKED (organizational egress 403): ${stats.liveBlocked}`,
    `- official artifacts processed: ${stats.artifactsProcessed}`,
    `- artifact processing failures: ${stats.artifactFailures}`,
    `- PDFs processed: ${stats.pdfProcessed}`,
    `- SPA/empty-shell detected: ${stats.spaDetected}`,
    `- verifications requiring human review: ${stats.verificationsRequiringReview}`,
    "",
    "## Recommendations",
    ...["PURSUE", "PARTNER", "INVESTIGATE", "MONITOR", "REJECT"].map(
      (r) => `- ${r}: ${opps.filter((o) => o.recommendation === r).length}`,
    ),
    "",
    "## Warnings",
    ...(stats.warnings.length ? stats.warnings.map((w) => `- ${w}`) : ["- none"]),
    "",
    "> No production-readiness claim is made. Live-source processing was blocked by egress; official content was supplied as local files and processed as OFFICIAL_PDF / MANUAL_DOCUMENT.",
    "",
  ].join("\n");
}
