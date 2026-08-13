import type { WorkspaceRecordKind } from "./record";

/**
 * Saved views (Phase 1 requirement): a named set of filters + sort, reusable
 * per record kind. Persisted client-side (localStorage `oia.views.v1`) while
 * the console is a static export; the shape is store-agnostic so it migrates
 * unchanged to a server store when Phase 2 restores authentication.
 */

export type SortDirection = "asc" | "desc";

export interface SavedView {
  id: string;
  name: string;
  kind: WorkspaceRecordKind;
  /** Filter values keyed by filter name; empty string = "all". */
  filters: Record<string, string>;
  sortField: string;
  sortDirection: SortDirection;
  createdAt: string;
}

export const VIEWS_STORAGE_KEY = "oia.views.v1";
