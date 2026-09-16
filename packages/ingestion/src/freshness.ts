import type { ConsoleRecord } from "./console";

/**
 * Freshness / expiry re-check (M1 P2 item 12).
 *
 * A shortlist rots. A deadline that was open at discovery closes; a record
 * qualified three months ago says nothing about today. Re-running the whole
 * pipeline needs egress; deciding that a date has passed does not. This module
 * is the deterministic half: no network, no LLM, applied on every read.
 *
 * It only ever REMOVES confidence — it can close a gate condition and downgrade
 * a recommendation, never open one or promote. A record cannot become more
 * pursuable by the passage of time.
 */

export type FreshnessStatus = "FRESH" | "CLOSING_SOON" | "EXPIRED" | "NO_DEADLINE";

export interface FreshnessAssessment {
  status: FreshnessStatus;
  /** Whole days until the application deadline; negative once it has passed. */
  daysToDeadline: number | null;
  /** Days since the notice was published, when a publication date is known. */
  ageDays: number | null;
  /** Human-readable reasons, suitable for the record's warnings. */
  reasons: string[];
}

/** Days remaining before a call is "closing soon" in the UI and the digest. */
export const CLOSING_SOON_DAYS = 14;

function dayDiff(fromIso: string, toIso: string): number | null {
  const a = Date.parse(fromIso);
  const b = Date.parse(toIso);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.floor((b - a) / 86_400_000);
}

export function applicationDeadlineOf(r: ConsoleRecord): string | undefined {
  const app = r.deadlines.find((d) => d.deadlineType === "APPLICATION" && d.normalized);
  return app?.normalized ?? r.deadlines.find((d) => d.normalized)?.normalized;
}

export function publicationDateOf(r: ConsoleRecord): string | undefined {
  return r.facts.find((f) => f.field === "publication-date")?.normalizedValue;
}

export function assessFreshness(r: ConsoleRecord, nowIso: string): FreshnessAssessment {
  const deadline = applicationDeadlineOf(r);
  const published = publicationDateOf(r);
  const daysToDeadline = deadline ? dayDiff(nowIso, deadline) : null;
  const ageDays = published ? dayDiff(published, nowIso) : null;
  const reasons: string[] = [];

  let status: FreshnessStatus;
  if (daysToDeadline === null) {
    status = "NO_DEADLINE";
    reasons.push("no normalized deadline — expiry cannot be checked, only a human can confirm it is open");
  } else if (daysToDeadline < 0) {
    status = "EXPIRED";
    reasons.push(`application deadline passed ${Math.abs(daysToDeadline)} day(s) ago (${deadline})`);
  } else if (daysToDeadline <= CLOSING_SOON_DAYS) {
    status = "CLOSING_SOON";
    reasons.push(`closes in ${daysToDeadline} day(s) (${deadline})`);
  } else {
    status = "FRESH";
  }

  return { status, daysToDeadline, ageDays, reasons };
}

/**
 * Apply the assessment to a record: an expired call loses the `notExpired` and
 * `verifiedDeadline` gate conditions (so it can never be PURSUE, whatever a
 * reviewer clicks) and is recommended REJECT. Everything else is left exactly
 * as the pipeline produced it.
 */
export function applyFreshness(r: ConsoleRecord, nowIso: string): ConsoleRecord {
  const freshness = assessFreshness(r, nowIso);
  if (freshness.status !== "EXPIRED") return { ...r, freshness };

  const gate = r.gate
    ? {
        ...r.gate,
        notExpired: false,
        verifiedDeadline: false,
        pursueEligible: false,
        failedReasons: [...new Set([...r.gate.failedReasons, "opportunity is expired"])],
      }
    : r.gate;

  return {
    ...r,
    gate,
    recommendation: "REJECT",
    freshness,
    warnings: [...r.warnings, ...freshness.reasons.map((x) => `freshness: ${x}`)],
  };
}

/** Apply freshness across a dataset. Pure: returns new records. */
export function applyFreshnessAll(records: ConsoleRecord[], nowIso: string): ConsoleRecord[] {
  return records.map((r) => applyFreshness(r, nowIso));
}
