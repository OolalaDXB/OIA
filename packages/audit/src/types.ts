export type AuditEventType =
  | "source_fetched"
  | "opportunity_created"
  | "opportunity_scored"
  | "gate_evaluated"
  | "recommendation_set"
  | "human_override"
  | "policy_denied"
  | "llm_call";

export interface AuditEvent {
  eventType: AuditEventType;
  actor: string; // "pipeline" | "human:<uid>" | "policy"
  opportunityId?: string;
  projectId?: string;
  payload?: unknown;
}

/** Append-only audit trail sink. */
export interface AuditSink {
  record(event: AuditEvent): Promise<void>;
}

export interface PolicyDecision {
  allowed: boolean;
  reason?: string;
}

/** Fail-closed gates on side effects. */
export interface PolicyHooks {
  /** May this URL be fetched? (allow-list + robots-style policy) */
  canFetch(url: string): Promise<PolicyDecision>;
  /** May an opportunity be auto-set to this action without human sign-off? */
  canAutoRecommend(action: string, ctx?: unknown): Promise<PolicyDecision>;
}
