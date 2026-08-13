"use client";

import { useCallback, useEffect, useState } from "react";
import {
  AUDIT_STORAGE_KEY,
  VIEWS_STORAGE_KEY,
  appendAuditEvent,
  latestReviewStatus,
  type AuditEvent,
  type ReviewAction,
  type SavedView,
} from "@oia/workspace";

/**
 * Phase 1 persistence for the review workspace: localStorage, because the
 * console is a static export with no backend. Types come from @oia/workspace
 * and migrate unchanged to a server store when Phase 2 restores auth.
 *
 * The audit log is APPEND-ONLY: this module exposes no update/delete. A wiped
 * browser storage loses local history — accepted Phase 1 limitation, stated in
 * the UI.
 */

function readJson<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Quota/blocked storage: the UI still works, persistence is best-effort.
  }
}

let idCounter = 0;
function nextId(prefix: string): string {
  idCounter += 1;
  return `${prefix}-${Date.now().toString(36)}-${idCounter}`;
}

export function useAuditLog() {
  const [log, setLog] = useState<AuditEvent[]>([]);
  useEffect(() => setLog(readJson<AuditEvent[]>(AUDIT_STORAGE_KEY, [])), []);

  const append = useCallback(
    (recordId: string, action: ReviewAction, comment: string, gatePursueEligible: boolean) => {
      const event: AuditEvent = {
        id: nextId("audit"),
        recordId,
        action,
        comment,
        at: new Date().toISOString(),
        actor: "mickael",
        gatePursueEligibleAtDecision: gatePursueEligible,
      };
      setLog((prev) => {
        const next = appendAuditEvent(prev, event);
        writeJson(AUDIT_STORAGE_KEY, next);
        return next;
      });
    },
    [],
  );

  const statusFor = useCallback(
    (recordId: string): ReviewAction | "PENDING" => latestReviewStatus(log, recordId),
    [log],
  );

  const eventsFor = useCallback(
    (recordId: string): AuditEvent[] => log.filter((e) => e.recordId === recordId),
    [log],
  );

  /** Download the full append-only log as JSON (the exportable trail). */
  const exportLog = useCallback(() => {
    const blob = new Blob([JSON.stringify(log, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `oia-audit-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [log]);

  return { log, append, statusFor, eventsFor, exportLog };
}

export function useSavedViews() {
  const [views, setViews] = useState<SavedView[]>([]);
  useEffect(() => setViews(readJson<SavedView[]>(VIEWS_STORAGE_KEY, [])), []);

  const saveView = useCallback(
    (name: string, filters: Record<string, string>, sortField: string, sortDirection: "asc" | "desc") => {
      const view: SavedView = {
        id: nextId("view"),
        name,
        kind: "OPPORTUNITY",
        filters,
        sortField,
        sortDirection,
        createdAt: new Date().toISOString(),
      };
      setViews((prev) => {
        const next = [...prev, view];
        writeJson(VIEWS_STORAGE_KEY, next);
        return next;
      });
    },
    [],
  );

  const deleteView = useCallback((id: string) => {
    setViews((prev) => {
      const next = prev.filter((v) => v.id !== id);
      writeJson(VIEWS_STORAGE_KEY, next);
      return next;
    });
  }, []);

  return { views, saveView, deleteView };
}
