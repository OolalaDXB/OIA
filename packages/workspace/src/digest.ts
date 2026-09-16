import type { ConsoleRecord } from "@oia/ingestion/console";
import { assessFreshness } from "@oia/ingestion/freshness";
import type { AuditEvent } from "./audit";
import { latestReviewStatus } from "./audit";
import type { TaskItem } from "./items";
import { overdueTasks, tasksDueWithin } from "./items";
import type { Digest, DigestEntry, DigestService } from "./services";

/**
 * Phase 4 — the real DigestService. Deterministic: no LLM, no network, no
 * ranking model. It answers one question — "what actually needs you today?" —
 * from facts that are already in the workspace:
 *
 *   1. calls that close soon (deadline within the window)
 *   2. calls that closed since you last looked (so they stop being pursued)
 *   3. tasks overdue or due in the window
 *   4. opportunities approved by a human but still blocked by the gate
 *   5. opportunities never reviewed, newest first
 *
 * The rule of the house applies: the digest never promotes anything. It cannot
 * turn a blocked record into a PURSUE, it cannot invent an action. When there
 * is nothing worth saying, it says nothing — an empty digest is a valid answer,
 * and `implemented: true` distinguishes it from the Phase 1 stub that returned
 * an empty digest because it could not do better.
 */

export type DigestReason =
  | "CLOSING_SOON"
  | "JUST_EXPIRED"
  | "TASK_OVERDUE"
  | "TASK_DUE"
  | "APPROVED_BUT_BLOCKED"
  | "UNREVIEWED";

export interface RichDigestEntry extends DigestEntry {
  reason: DigestReason;
  /** Registry slug when the item is attached to a project. */
  projectSlug?: string;
  /** Sort key: lower is more urgent. */
  urgency: number;
  detail: string;
}

export interface RichDigest extends Digest {
  entries: RichDigestEntry[];
  /** Counts by reason — the "nothing burning" check at a glance. */
  counts: Record<DigestReason, number>;
}

export interface DigestInput {
  records: readonly ConsoleRecord[];
  tasks: readonly TaskItem[];
  auditLog: readonly AuditEvent[];
  /** recordId → project slug (human tagging decisions). */
  tags: Record<string, string>;
  /** Days ahead counted as "closing soon" / "due". */
  horizonDays?: number;
  /** Cap on unreviewed items, so a 400-row queue does not become the digest. */
  maxUnreviewed?: number;
}

const URGENCY: Record<DigestReason, number> = {
  TASK_OVERDUE: 0,
  JUST_EXPIRED: 1,
  CLOSING_SOON: 2,
  TASK_DUE: 3,
  APPROVED_BUT_BLOCKED: 4,
  UNREVIEWED: 5,
};

function emptyCounts(): Record<DigestReason, number> {
  return {
    CLOSING_SOON: 0,
    JUST_EXPIRED: 0,
    TASK_OVERDUE: 0,
    TASK_DUE: 0,
    APPROVED_BUT_BLOCKED: 0,
    UNREVIEWED: 0,
  };
}

export function buildDigest(date: string, input: DigestInput): RichDigest {
  const nowIso = date.length === 10 ? `${date}T00:00:00Z` : date;
  const horizon = input.horizonDays ?? 14;
  const maxUnreviewed = input.maxUnreviewed ?? 5;
  const entries: RichDigestEntry[] = [];

  const push = (e: Omit<RichDigestEntry, "urgency">) => entries.push({ ...e, urgency: URGENCY[e.reason] });

  for (const r of input.records) {
    const freshness = assessFreshness(r, nowIso);
    const projectSlug = input.tags[r.id];
    const review = latestReviewStatus(input.auditLog, r.id);

    if (freshness.status === "CLOSING_SOON") {
      push({
        recordId: r.id,
        reason: "CLOSING_SOON",
        headline: `Closes in ${freshness.daysToDeadline} day(s): ${r.title}`,
        nextAction:
          review === "PENDING"
            ? "Review it now or let it go — the deadline decides, not the queue."
            : "Confirm the submission is on track.",
        detail: `${r.issuer} · ${r.recommendation} · review ${review}`,
        ...(projectSlug ? { projectSlug } : {}),
      });
      continue;
    }

    // Expired, and someone had engaged with it: worth saying out loud once.
    if (freshness.status === "EXPIRED" && review !== "PENDING" && review !== "REJECT") {
      push({
        recordId: r.id,
        reason: "JUST_EXPIRED",
        headline: `Closed ${Math.abs(freshness.daysToDeadline ?? 0)} day(s) ago: ${r.title}`,
        nextAction: "Stop work on it, or find the next edition of the call.",
        detail: `${r.issuer} · was marked ${review}`,
        ...(projectSlug ? { projectSlug } : {}),
      });
      continue;
    }

    // A human said yes; the deterministic gate still says no. That gap is the
    // single most useful thing a digest can surface — it is where work is owed.
    if (review === "APPROVE" && r.gate && !r.gate.pursueEligible) {
      push({
        recordId: r.id,
        reason: "APPROVED_BUT_BLOCKED",
        headline: `Approved but still gate-blocked: ${r.title}`,
        nextAction: `Clear: ${r.gate.failedReasons.join("; ")}`,
        detail: `${r.issuer} · a human approval never overrides a failed condition`,
        ...(projectSlug ? { projectSlug } : {}),
      });
    }
  }

  // Unreviewed, newest first, capped. A record already named above (closing,
  // just expired) is not repeated here — one record, one line in the digest.
  const alreadyListed = new Set(entries.map((e) => e.recordId));
  const unreviewed = input.records
    .filter((r) => !alreadyListed.has(r.id))
    .filter((r) => latestReviewStatus(input.auditLog, r.id) === "PENDING")
    .filter((r) => assessFreshness(r, nowIso).status !== "EXPIRED")
    .sort((a, b) => publicationOf(b).localeCompare(publicationOf(a)))
    .slice(0, maxUnreviewed);
  for (const r of unreviewed) {
    const projectSlug = input.tags[r.id];
    push({
      recordId: r.id,
      reason: "UNREVIEWED",
      headline: `Not yet triaged: ${r.title}`,
      nextAction: "Triage it: approve, reject, or ask for verification.",
      detail: `${r.issuer} · ${r.recommendation}`,
      ...(projectSlug ? { projectSlug } : {}),
    });
  }

  for (const t of overdueTasks(input.tasks, nowIso)) {
    push({
      recordId: t.recordId ?? t.id,
      reason: "TASK_OVERDUE",
      headline: `Overdue since ${t.due}: ${t.title}`,
      nextAction: "Do it, or move the date deliberately.",
      detail: t.projectSlug ? `project ${t.projectSlug}` : "no project",
      ...(t.projectSlug ? { projectSlug: t.projectSlug } : {}),
    });
  }
  for (const t of tasksDueWithin(input.tasks, nowIso, horizon)) {
    push({
      recordId: t.recordId ?? t.id,
      reason: "TASK_DUE",
      headline: `Due ${t.due}: ${t.title}`,
      nextAction: "Plan it into the week.",
      detail: t.projectSlug ? `project ${t.projectSlug}` : "no project",
      ...(t.projectSlug ? { projectSlug: t.projectSlug } : {}),
    });
  }

  entries.sort((a, b) => a.urgency - b.urgency || a.headline.localeCompare(b.headline));
  const counts = emptyCounts();
  for (const e of entries) counts[e.reason] += 1;

  return { date: date.slice(0, 10), entries, implemented: true, counts };
}

function publicationOf(r: ConsoleRecord): string {
  return r.facts.find((f) => f.field === "publication-date")?.normalizedValue ?? "";
}

/** The real service, bound to a dataset. Replaces `stubDigestService`. */
export function createDigestService(input: DigestInput): DigestService {
  return {
    async buildDailyDigest(date: string): Promise<Digest> {
      return buildDigest(date, input);
    },
  };
}

/** The digest as Markdown — for a morning mail, a commit, or a paste. */
export function digestToMarkdown(digest: RichDigest, projectName: (slug: string) => string = (s) => s): string {
  const lines = [`# OIA digest — ${digest.date}`, ""];
  if (digest.entries.length === 0) {
    lines.push("Nothing needs you today: no call closing, no task due, no approval blocked, nothing untriaged.", "");
    return lines.join("\n");
  }

  const LABEL: Record<DigestReason, string> = {
    TASK_OVERDUE: "Overdue",
    JUST_EXPIRED: "Closed since you last looked",
    CLOSING_SOON: "Closing soon",
    TASK_DUE: "Due shortly",
    APPROVED_BUT_BLOCKED: "Approved but gate-blocked",
    UNREVIEWED: "Waiting for triage",
  };

  for (const reason of Object.keys(LABEL) as DigestReason[]) {
    const group = digest.entries.filter((e) => e.reason === reason);
    if (group.length === 0) continue;
    lines.push(`## ${LABEL[reason]} (${group.length})`, "");
    for (const e of group) {
      const project = e.projectSlug ? ` _(${projectName(e.projectSlug)})_` : "";
      lines.push(`- **${e.headline}**${project}`, `  - ${e.nextAction}`, `  - ${e.detail}`);
    }
    lines.push("");
  }
  lines.push("> Deterministic digest: deadlines, tasks and review state only. It never promotes a record and never invents an action.", "");
  return lines.join("\n");
}
