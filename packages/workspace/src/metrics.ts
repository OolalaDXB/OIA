import type { ConsoleRecord } from "@oia/ingestion/console";
import { assessFreshness } from "@oia/ingestion/freshness";
import type { AuditEvent } from "./audit";
import { latestReviewStatus } from "./audit";

/**
 * Workspace metrics (M1 P3 item 18). Counting, not modelling: every number here
 * is a tally of something already decided elsewhere, so the page can never
 * flatter the pipeline. The most useful panel is the last one — why the gate
 * blocks what it blocks, which is the actual backlog of missing evidence.
 */

export interface WorkspaceMetrics {
  total: number;
  byRecommendation: Record<string, number>;
  byKind: Record<string, number>;
  byVerification: Record<string, number>;
  byProject: Record<string, number>;
  byReview: Record<string, number>;
  byFreshness: Record<string, number>;
  /** Information-confidence histogram in 20-point buckets. */
  confidenceBuckets: { label: string; count: number }[];
  /** Gate failure reasons, most frequent first — the evidence backlog. */
  gateFailures: { reason: string; count: number }[];
  /** How many records the gate would let a human promote to PURSUE. */
  pursueEligible: number;
  untagged: number;
}

function tally(target: Record<string, number>, key: string): void {
  target[key] = (target[key] ?? 0) + 1;
}

export function computeMetrics(
  records: readonly ConsoleRecord[],
  auditLog: readonly AuditEvent[],
  tags: Record<string, string>,
  nowIso: string,
): WorkspaceMetrics {
  const m: WorkspaceMetrics = {
    total: records.length,
    byRecommendation: {},
    byKind: {},
    byVerification: {},
    byProject: {},
    byReview: {},
    byFreshness: {},
    confidenceBuckets: [
      { label: "0–19", count: 0 },
      { label: "20–39", count: 0 },
      { label: "40–59", count: 0 },
      { label: "60–79", count: 0 },
      { label: "80–100", count: 0 },
    ],
    gateFailures: [],
    pursueEligible: 0,
    untagged: 0,
  };

  const failures: Record<string, number> = {};

  for (const r of records) {
    tally(m.byRecommendation, r.recommendation);
    tally(m.byKind, r.opportunityKind ?? "UNSPECIFIED");
    tally(m.byVerification, r.verificationStatus);
    tally(m.byReview, latestReviewStatus(auditLog, r.id));
    tally(m.byFreshness, assessFreshness(r, nowIso).status);

    const project = tags[r.id];
    if (project) tally(m.byProject, project);
    else m.untagged += 1;

    const c = r.scores.infoConfidence;
    const bucket = c >= 80 ? 4 : c >= 60 ? 3 : c >= 40 ? 2 : c >= 20 ? 1 : 0;
    m.confidenceBuckets[bucket]!.count += 1;

    if (r.gate?.pursueEligible) m.pursueEligible += 1;
    for (const reason of r.gate?.failedReasons ?? []) tally(failures, reason);
  }

  m.gateFailures = Object.entries(failures)
    .map(([reason, count]) => ({ reason, count }))
    .sort((a, b) => b.count - a.count || a.reason.localeCompare(b.reason));

  return m;
}
