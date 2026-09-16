/**
 * Opportunity → project tagging. The tag is a human decision (possibly seeded
 * by a suggestion, never applied silently) and every change is audit-logged by
 * the caller. Notes moved to items.ts when Phase 3 generalised them.
 */

/** recordId → project slug ("" / absent = untagged). */
export type ProjectTagMap = Record<string, string>;

export const TAGS_STORAGE_KEY = "oia.tags.v1";
