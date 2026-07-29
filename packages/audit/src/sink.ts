import type { OiaClient } from "@oia/database";
import type { AuditSink, AuditEvent } from "./types";

/** Persists audit events to the append-only `audit_log` table. */
export function createDbAuditSink(client: OiaClient): AuditSink {
  return {
    async record(event: AuditEvent): Promise<void> {
      const { error } = await client.from("audit_log").insert({
        event_type: event.eventType,
        actor: event.actor,
        opportunity_id: event.opportunityId ?? null,
        project_id: event.projectId ?? null,
        payload: event.payload ?? {},
      });
      if (error) {
        // Auditing must never silently vanish; surface it.
        throw new Error(`audit_log insert failed: ${error.message}`);
      }
    },
  };
}

/** In-memory sink for tests and dry runs. */
export function createMemoryAuditSink(): AuditSink & { events: AuditEvent[] } {
  const events: AuditEvent[] = [];
  return {
    events,
    async record(event: AuditEvent): Promise<void> {
      events.push(event);
    },
  };
}
