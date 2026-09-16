import type { ConsoleRecord } from "@oia/ingestion/console";
import type { ProjectProfile } from "@oia/database";

/**
 * Workspace record model — the generic envelope every OIA surface shares
 * (design doc: docs/interface/phase-1-design.md §1-2).
 *
 * ONE kind is wired in Phase 1: OPPORTUNITY, whose payload IS the existing
 * `ConsoleRecord` from @oia/ingestion — no DTO is redefined here or in the web.
 * The other kinds are DECLARED so the list/detail skeleton, saved views and
 * audit trail accommodate them without a rewrite, but they carry no
 * implementation until their phase (PROJECT: Phase 2; NOTE/TASK/CONTACT:
 * Phase 3). Declaring them is not building them.
 */

export const WORKSPACE_RECORD_KINDS = [
  "OPPORTUNITY",
  "PROJECT",
  "NOTE",
  "TASK",
  "CONTACT",
] as const;
export type WorkspaceRecordKind = (typeof WORKSPACE_RECORD_KINDS)[number];

/** Phase in which each kind gets a real implementation. */
export const KIND_PHASE: Record<WorkspaceRecordKind, 1 | 2 | 3> = {
  OPPORTUNITY: 1,
  PROJECT: 2,
  NOTE: 3,
  TASK: 3,
  CONTACT: 3,
};

interface WorkspaceRecordBase {
  /** Stable id, unique within its kind (opportunity: the ConsoleRecord id). */
  id: string;
  kind: WorkspaceRecordKind;
  title: string;
  /** Future cross-record links (note→opportunity, task→project…). Empty in Phase 1. */
  linkedRecordIds: string[];
}

export interface OpportunityRecord extends WorkspaceRecordBase {
  kind: "OPPORTUNITY";
  /** The EXISTING review-console model — the single source of truth. */
  payload: ConsoleRecord;
}

/** Phase 2: project records — payload IS the existing ProjectProfile. */
export interface ProjectRecord extends WorkspaceRecordBase {
  kind: "PROJECT";
  payload: ProjectProfile;
}

/** Declared, not built (Phase 3): payload intentionally absent until then. */
export interface PlannedRecord extends WorkspaceRecordBase {
  kind: Exclude<WorkspaceRecordKind, "OPPORTUNITY" | "PROJECT">;
}

export type WorkspaceRecord = OpportunityRecord | ProjectRecord | PlannedRecord;

export function projectToRecord(payload: ProjectProfile): ProjectRecord {
  return { id: payload.slug, kind: "PROJECT", title: payload.name, linkedRecordIds: [], payload };
}

export function opportunityToRecord(payload: ConsoleRecord): OpportunityRecord {
  return { id: payload.id, kind: "OPPORTUNITY", title: payload.title, linkedRecordIds: [], payload };
}
