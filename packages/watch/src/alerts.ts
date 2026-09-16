import { assessFreshness, CLOSING_SOON_DAYS } from "@oia/ingestion/freshness";
import type { LedgerRow, WatchEvent } from "./ledger";

/**
 * Alert rules.
 *
 * An alert is a claim on someone's attention, so the bar is high and the rules
 * are deterministic: no model, no scoring, no "interesting" heuristic. Every
 * alert states what happened, and what to do about it.
 *
 * Two properties matter more than the rules themselves:
 *
 *   1. **Idempotence.** Each alert carries a `dedupHash` built from the
 *      condition, not the moment. Re-running the watch ten times raises the
 *      same alert once. Without this the operator stops reading them by week
 *      three, and the feature is worse than nothing.
 *   2. **It never promotes.** An alert can say a record is approved but
 *      gate-blocked; it can never make it pursuable.
 */

export const ALERT_KINDS = [
  "NEW_MATCH",
  "CLOSING_SOON",
  "JUST_EXPIRED",
  "DEADLINE_CHANGED",
  "DISAPPEARED",
  "APPROVED_BUT_BLOCKED",
] as const;
export type AlertKind = (typeof ALERT_KINDS)[number];

export interface Alert {
  kind: AlertKind;
  watchKey: string;
  projectSlug: string | null;
  headline: string;
  detail: string;
  nextAction: string;
  /** 0 = most urgent. Ordering only, never a quality judgement. */
  severity: number;
  dedupHash: string;
}

const SEVERITY: Record<AlertKind, number> = {
  JUST_EXPIRED: 0,
  CLOSING_SOON: 1,
  DEADLINE_CHANGED: 2,
  DISAPPEARED: 3,
  APPROVED_BUT_BLOCKED: 4,
  NEW_MATCH: 5,
};

/**
 * The condition's identity. Note what is IN it and what is not: the deadline
 * date is in (a deadline that moves is a new thing to know), the current time
 * is not (the same closing call must not re-alert every Monday).
 */
function hash(kind: AlertKind, watchKey: string, discriminator = ""): string {
  return [kind, watchKey, discriminator].filter(Boolean).join("::");
}

export interface AlertInput {
  /** The ledger AFTER the run was folded in. */
  rows: readonly LedgerRow[];
  /** Events produced by that run. */
  events: readonly WatchEvent[];
  /** Latest human review per record id ("PENDING" when never triaged). */
  reviewOf: (recordId: string) => "PENDING" | "APPROVE" | "REJECT" | "NEEDS_VERIFICATION";
  /** Human project tag per record id, when one was set. */
  tagOf: (recordId: string) => string | undefined;
  now: string;
}

export function evaluateAlerts(input: AlertInput): Alert[] {
  const { rows, events, reviewOf, tagOf, now } = input;
  const byKey = new Map(rows.map((r) => [r.watchKey, r]));
  const alerts: Alert[] = [];
  const push = (a: Omit<Alert, "severity">) => alerts.push({ ...a, severity: SEVERITY[a.kind] });

  const projectOf = (row: LedgerRow): string | null =>
    tagOf(row.recordId) ?? row.discoveredFor[0] ?? null;

  // ── From this run's events ────────────────────────────────────────────────
  for (const event of events) {
    const row = byKey.get(event.watchKey);
    if (!row) continue;
    const project = projectOf(row);

    if (event.type === "DISCOVERED") {
      // A new record is only worth an alert if it is attached to something:
      // a project query surfaced it, or a human already tagged it. Otherwise
      // it belongs in the triage queue, not in an interruption.
      if (!project) continue;
      push({
        kind: "NEW_MATCH",
        watchKey: row.watchKey,
        projectSlug: project,
        headline: `New: ${row.title}`,
        detail: `${row.issuer} · surfaced by ${row.discoveredFor.join(", ") || "manual entry"}`,
        nextAction: "Triage it: approve, reject, or ask for verification.",
        dedupHash: hash("NEW_MATCH", row.watchKey),
      });
    }

    if (event.type === "DEADLINE_CHANGED") {
      push({
        kind: "DEADLINE_CHANGED",
        watchKey: row.watchKey,
        projectSlug: project,
        headline: `Deadline moved: ${row.title}`,
        detail: `${String(event.detail["from"] ?? "none")} → ${String(event.detail["to"] ?? "none")}`,
        nextAction: "Re-plan the submission against the new date.",
        // The new date is part of the identity: a second move alerts again.
        dedupHash: hash("DEADLINE_CHANGED", row.watchKey, String(event.detail["to"] ?? "")),
      });
    }

    if (event.type === "DISAPPEARED") {
      // Only worth saying when someone had engaged with it.
      const review = reviewOf(row.recordId);
      if (review === "PENDING" || review === "REJECT") continue;
      push({
        kind: "DISAPPEARED",
        watchKey: row.watchKey,
        projectSlug: project,
        headline: `No longer published: ${row.title}`,
        detail: `${row.issuer} · last seen ${row.lastSeenAt.slice(0, 10)} · you had marked it ${review}`,
        nextAction: "Check the source directly — it may have been withdrawn or replaced.",
        dedupHash: hash("DISAPPEARED", row.watchKey, row.lastSeenAt.slice(0, 10)),
      });
    }
  }

  // ── From the state of the ledger, independent of any run ──────────────────
  // These need no discovery and no network: they are why the watch is permanent
  // rather than weekly.
  for (const row of rows) {
    if (row.disappearedAt) continue;
    const project = projectOf(row);
    const review = reviewOf(row.recordId);
    const freshness = assessFreshness(row.payload, now);

    if (freshness.status === "CLOSING_SOON") {
      push({
        kind: "CLOSING_SOON",
        watchKey: row.watchKey,
        projectSlug: project,
        headline: `Closes in ${freshness.daysToDeadline} day(s): ${row.title}`,
        detail: `${row.issuer} · deadline ${row.deadlineAt?.slice(0, 10) ?? "unknown"} · review ${review}`,
        nextAction:
          review === "PENDING"
            ? "Decide now or let it go — the deadline decides, not the queue."
            : "Confirm the submission is on track.",
        // Keyed on the deadline, so one alert per call per deadline — not one
        // per day for the whole fortnight.
        dedupHash: hash("CLOSING_SOON", row.watchKey, row.deadlineAt?.slice(0, 10) ?? ""),
      });
    }

    if (freshness.status === "EXPIRED" && review !== "PENDING" && review !== "REJECT") {
      push({
        kind: "JUST_EXPIRED",
        watchKey: row.watchKey,
        projectSlug: project,
        headline: `Closed: ${row.title}`,
        detail: `${row.issuer} · deadline ${row.deadlineAt?.slice(0, 10) ?? "unknown"} · you had marked it ${review}`,
        nextAction: "Stop work on it, or find the next edition of the call.",
        dedupHash: hash("JUST_EXPIRED", row.watchKey, row.deadlineAt?.slice(0, 10) ?? ""),
      });
    }

    // An expired call has nothing left to clear — saying "approved but blocked"
    // about it would be true and useless, and the JUST_EXPIRED alert above
    // already covers it.
    if (review === "APPROVE" && !row.gatePursueEligible && freshness.status !== "EXPIRED") {
      push({
        kind: "APPROVED_BUT_BLOCKED",
        watchKey: row.watchKey,
        projectSlug: project,
        headline: `Approved but still gate-blocked: ${row.title}`,
        detail: `${row.issuer} · a human approval never overrides a failed condition`,
        nextAction: `Clear: ${row.gateFailedReasons.join("; ") || "unknown condition"}`,
        // Keyed on what is missing: clearing one condition and still failing
        // another is a different alert.
        dedupHash: hash("APPROVED_BUT_BLOCKED", row.watchKey, row.gateFailedReasons.join("|")),
      });
    }
  }

  // Same condition reached twice in one evaluation collapses to one alert.
  const unique = new Map(alerts.map((a) => [a.dedupHash, a]));
  return [...unique.values()].sort(
    (a, b) => a.severity - b.severity || a.headline.localeCompare(b.headline),
  );
}

/** Alerts not already stored — what the watch should actually raise. */
export function newAlertsOnly(candidates: readonly Alert[], knownHashes: ReadonlySet<string>): Alert[] {
  return candidates.filter((a) => !knownHashes.has(a.dedupHash));
}

export { CLOSING_SOON_DAYS };
