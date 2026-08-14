/**
 * Phase 2 — opportunity → TheStudio project tagging. The tag is a human
 * decision (possibly seeded by a suggestion, never applied silently). Stored
 * client-side in Phase 1-2 (localStorage); shape is store-agnostic.
 */

/** recordId → project slug ("" / absent = untagged). */
export type ProjectTagMap = Record<string, string>;

export const TAGS_STORAGE_KEY = "oia.tags.v1";

/** Phase 2 — lightweight note attached to a record (standalone notes = Phase 3). */
export interface AttachedNote {
  id: string;
  recordId: string;
  text: string;
  at: string;
  actor: string;
}

export const NOTES_STORAGE_KEY = "oia.notes.v1";
