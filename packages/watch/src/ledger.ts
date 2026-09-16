import type { ConsoleRecord } from "@oia/ingestion/console";
import { applicationDeadlineOf } from "@oia/ingestion/freshness";
import { normalizeText, titleStem } from "@oia/ingestion/dedup";

/**
 * The watch ledger — OIA's memory between runs.
 *
 * Until this existed, every discovery run REPLACED the dataset. A snapshot has
 * no notion of "new": you cannot alert on something you cannot tell apart from
 * what was already there. The ledger keeps one row per opportunity *identity*
 * (not per run), so the system can answer: is this new, has it changed, has it
 * vanished, and since when has it been open?
 *
 * Everything here is pure. The database is one driver among possible others;
 * the reconciliation logic must be testable without one.
 */

export interface LedgerRow {
  /** Identity of the opportunity THROUGH TIME (see `watchKey`). */
  watchKey: string;
  recordId: string;
  title: string;
  issuer: string;
  opportunityKind?: string | undefined;
  officialUrl?: string | undefined;
  deadlineAt: string | null;
  recommendation: string;
  verificationStatus: string;
  infoConfidence: number;
  gatePursueEligible: boolean;
  gateFailedReasons: string[];
  /** Registry slugs whose query surfaced it. Provenance, not a verdict. */
  discoveredFor: string[];
  /** Hash of the material fields — an unchanged re-observation is not an event. */
  contentFingerprint: string;
  firstSeenAt: string;
  lastSeenAt: string;
  timesSeen: number;
  /** Set when a run that DID cover it no longer returned it. Never deleted. */
  disappearedAt: string | null;
  payload: ConsoleRecord;
}

export const WATCH_EVENT_TYPES = [
  "DISCOVERED",
  "UPDATED",
  "DEADLINE_SET",
  "DEADLINE_CHANGED",
  "RECOMMENDATION_CHANGED",
  "VERIFICATION_CHANGED",
  "DISAPPEARED",
  "REAPPEARED",
] as const;
export type WatchEventType = (typeof WATCH_EVENT_TYPES)[number];

export interface WatchEvent {
  watchKey: string;
  type: WatchEventType;
  at: string;
  detail: Record<string, unknown>;
}

/**
 * The material fields. Deliberately narrow: a re-run that changes only a
 * timestamp or re-orders facts must NOT read as a change, or every run would
 * fire alerts for everything and the operator would stop reading them.
 */
export function fingerprint(r: ConsoleRecord): string {
  const material = [
    r.title.trim(),
    r.issuer.trim(),
    r.opportunityKind ?? "",
    r.officialUrl ?? "",
    applicationDeadlineOf(r) ?? "",
    r.recommendation,
    r.verificationStatus,
    String(r.scores.infoConfidence),
    String(!!r.gate?.pursueEligible),
  ].join("|");

  // Small, dependency-free, stable hash (FNV-1a). Not cryptographic: its job is
  // change detection, and the artifact hash already carries the integrity claim.
  let h = 0x811c9dc5;
  for (let i = 0; i < material.length; i++) {
    h ^= material.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

/**
 * Identity of an opportunity THROUGH TIME — which is not the same question as
 * "are these two rows in one run the same call?".
 *
 * `dedupKey` (issuer + title stem + deadline) answers the second, and it is
 * right for that: two editions of one programme are two things. But it is wrong
 * as a persistent identity, because a deadline EXTENSION would mint a new key —
 * the watch would announce a phantom new opportunity and report the real one as
 * vanished, on the single event most likely to happen to an open call.
 *
 * So the ledger keys on the official URL when there is one: it survives a
 * deadline change and still separates two editions, which are two pages.
 *
 * With no URL it falls back to issuer + title stem, deliberately WITHOUT the
 * deadline. That trades a rare wrong merge (two same-titled editions from an
 * issuer publishing no URL) against a frequent catastrophic split (every
 * deadline extension). The wrong merge still surfaces as DEADLINE_CHANGED; the
 * split would poison the alerts.
 */
export function watchKey(r: ConsoleRecord): string {
  if (r.officialUrl) {
    try {
      const url = new URL(r.officialUrl);
      return `url:${url.host.toLowerCase()}${url.pathname.replace(/\/+$/, "")}`;
    } catch {
      return `url:${r.officialUrl.trim().toLowerCase()}`;
    }
  }
  const issuer = normalizeText(r.issuer).split(" ").slice(0, 4).join("-") || "unknown-issuer";
  return `key:${issuer}|${titleStem(r.title)}`;
}

export function toLedgerRow(r: ConsoleRecord, now: string): LedgerRow {
  return {
    watchKey: watchKey(r),
    recordId: r.id,
    title: r.title,
    issuer: r.issuer,
    opportunityKind: r.opportunityKind,
    officialUrl: r.officialUrl,
    deadlineAt: applicationDeadlineOf(r) ?? null,
    recommendation: r.recommendation,
    verificationStatus: r.verificationStatus,
    infoConfidence: r.scores.infoConfidence,
    gatePursueEligible: !!r.gate?.pursueEligible,
    gateFailedReasons: r.gate?.failedReasons ?? [],
    discoveredFor: r.discoveredFor ?? [],
    contentFingerprint: fingerprint(r),
    firstSeenAt: now,
    lastSeenAt: now,
    timesSeen: 1,
    disappearedAt: null,
    payload: r,
  };
}

export interface RunScope {
  /** Registry slugs this run actually queried. */
  projects: string[];
}

export interface ReconcileInput {
  existing: readonly LedgerRow[];
  observed: readonly ConsoleRecord[];
  scope: RunScope;
  now: string;
}

export interface ReconcileResult {
  inserts: LedgerRow[];
  /** Full replacement rows for what changed (the driver upserts them). */
  updates: LedgerRow[];
  /** Rows only touched to record that they were seen again, unchanged. */
  touched: LedgerRow[];
  disappeared: LedgerRow[];
  events: WatchEvent[];
  summary: { new: number; updated: number; unchanged: number; disappeared: number };
}

/**
 * Whether this run was in a position to say anything about a row.
 *
 * The rule is conservative on purpose: a row counts as covered only when EVERY
 * project that ever surfaced it was queried in this run. Running `--project
 * sillon` must not declare a record also discovered for bawaba as vanished —
 * bawaba's query was simply not asked. Rows with no discovery provenance
 * (manually seeded, M0) are never in scope of an automated run, so an automated
 * run can never make them disappear.
 */
export function isInScope(row: LedgerRow, scope: RunScope): boolean {
  if (row.discoveredFor.length === 0) return false;
  return row.discoveredFor.every((slug) => scope.projects.includes(slug));
}

function diffEvents(before: LedgerRow, after: LedgerRow, now: string): WatchEvent[] {
  const events: WatchEvent[] = [];
  const at = now;
  const key = before.watchKey;

  if (before.deadlineAt !== after.deadlineAt) {
    if (!before.deadlineAt && after.deadlineAt) {
      events.push({ watchKey: key, type: "DEADLINE_SET", at, detail: { to: after.deadlineAt } });
    } else {
      events.push({
        watchKey: key,
        type: "DEADLINE_CHANGED",
        at,
        detail: { from: before.deadlineAt, to: after.deadlineAt },
      });
    }
  }
  if (before.recommendation !== after.recommendation) {
    events.push({
      watchKey: key,
      type: "RECOMMENDATION_CHANGED",
      at,
      detail: { from: before.recommendation, to: after.recommendation },
    });
  }
  if (before.verificationStatus !== after.verificationStatus) {
    events.push({
      watchKey: key,
      type: "VERIFICATION_CHANGED",
      at,
      detail: { from: before.verificationStatus, to: after.verificationStatus },
    });
  }
  if (events.length === 0) {
    events.push({ watchKey: key, type: "UPDATED", at, detail: { fingerprint: after.contentFingerprint } });
  }
  return events;
}

/** Fold one run's observations into the ledger. Pure: returns what to write. */
export function reconcile(input: ReconcileInput): ReconcileResult {
  const { existing, observed, scope, now } = input;
  const byKey = new Map(existing.map((r) => [r.watchKey, r]));

  const inserts: LedgerRow[] = [];
  const updates: LedgerRow[] = [];
  const touched: LedgerRow[] = [];
  const events: WatchEvent[] = [];
  const seen = new Set<string>();

  for (const record of observed) {
    const incoming = toLedgerRow(record, now);
    seen.add(incoming.watchKey);
    const previous = byKey.get(incoming.watchKey);

    if (!previous) {
      inserts.push(incoming);
      events.push({
        watchKey: incoming.watchKey,
        type: "DISCOVERED",
        at: now,
        detail: { title: incoming.title, discoveredFor: incoming.discoveredFor },
      });
      continue;
    }

    // Identity is preserved: first sighting and the counter survive every run.
    const merged: LedgerRow = {
      ...incoming,
      firstSeenAt: previous.firstSeenAt,
      timesSeen: previous.timesSeen + 1,
      disappearedAt: null,
      // Discovery provenance accumulates: a record found for a second project
      // is relevant to both, even if this run only queried one of them.
      discoveredFor: [...new Set([...previous.discoveredFor, ...incoming.discoveredFor])],
    };

    if (previous.disappearedAt) {
      events.push({
        watchKey: merged.watchKey,
        type: "REAPPEARED",
        at: now,
        detail: { goneSince: previous.disappearedAt },
      });
      updates.push(merged);
      continue;
    }

    if (previous.contentFingerprint === merged.contentFingerprint) {
      touched.push(merged);
      continue;
    }

    events.push(...diffEvents(previous, merged, now));
    updates.push(merged);
  }

  const disappeared: LedgerRow[] = [];
  for (const row of existing) {
    if (seen.has(row.watchKey) || row.disappearedAt) continue;
    if (!isInScope(row, scope)) continue;
    disappeared.push({ ...row, disappearedAt: now });
    events.push({
      watchKey: row.watchKey,
      type: "DISAPPEARED",
      at: now,
      detail: { lastSeenAt: row.lastSeenAt, discoveredFor: row.discoveredFor },
    });
  }

  return {
    inserts,
    updates,
    touched,
    disappeared,
    events,
    summary: {
      new: inserts.length,
      updated: updates.length,
      unchanged: touched.length,
      disappeared: disappeared.length,
    },
  };
}
