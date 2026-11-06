/**
 * Journal des actions SEO Command, en ajout seul. En mémoire ce soir ;
 * persistance C1/E5 à venir.
 */

export interface ActionLogEntry {
  at: string;             // ISO-8601 timestamp.
  who: string;            // agent-name ou humain:<id>.
  what: string;           // short label, e.g. "mission.claim", "mission.transition".
  clientId: string;
  subjectId?: string;
  missionId?: string;
  costUsd?: number;
  details?: Record<string, unknown>;
}

export interface ActionLog {
  append(e: Omit<ActionLogEntry, "at"> & { at?: string }): void;
  all(): ReadonlyArray<ActionLogEntry>;
  byClient(clientId: string): ReadonlyArray<ActionLogEntry>;
}

export function createActionLog(): ActionLog {
  const entries: ActionLogEntry[] = [];
  return {
    append(e) {
      entries.push({ ...e, at: e.at ?? new Date().toISOString() });
    },
    all: () => Object.freeze([...entries]),
    byClient: (c) => Object.freeze(entries.filter((e) => e.clientId === c)),
  };
}
