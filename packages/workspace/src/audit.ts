/**
 * Append-only human-review audit trail (Phase 1). Every APPROVE / REJECT /
 * NEEDS_VERIFICATION / COMMENT writes an event; events are never mutated or
 * deleted. The gate state is captured AT DECISION TIME so the trail proves a
 * reviewer's APPROVE on a gate-blocked item never produced a PURSUE — human
 * sign-off does not override the deterministic gate (gate sovereign).
 *
 * Phase 1 persistence: localStorage (`oia.audit.v1`) — the console is a static
 * export with no backend. The event shape is store-agnostic for Phase 2.
 */

export const REVIEW_ACTIONS = ["APPROVE", "REJECT", "NEEDS_VERIFICATION", "COMMENT"] as const;
export type ReviewAction = (typeof REVIEW_ACTIONS)[number];

export interface AuditEvent {
  id: string;
  recordId: string;
  action: ReviewAction;
  comment: string;
  /** ISO timestamp of the decision. */
  at: string;
  /** Reviewer identity (Phase 1: free label; Phase 2: authenticated user). */
  actor: string;
  /** Gate verdict at decision time — proves APPROVE never forced PURSUE. */
  gatePursueEligibleAtDecision: boolean;
}

export const AUDIT_STORAGE_KEY = "oia.audit.v1";

/** Pure append — returns a NEW array; existing events are never touched. */
export function appendAuditEvent(log: readonly AuditEvent[], event: AuditEvent): AuditEvent[] {
  return [...log, event];
}

/** Latest review action per record (PENDING when none), derived from the log. */
export function latestReviewStatus(
  log: readonly AuditEvent[],
  recordId: string,
): ReviewAction | "PENDING" {
  for (let i = log.length - 1; i >= 0; i--) {
    const e = log[i];
    if (e && e.recordId === recordId && e.action !== "COMMENT") return e.action;
  }
  return "PENDING";
}
