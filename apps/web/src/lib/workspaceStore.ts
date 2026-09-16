"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AUDIT_STORAGE_KEY,
  CONTACTS_STORAGE_KEY,
  NOTES_STORAGE_KEY,
  TAGS_STORAGE_KEY,
  TASKS_STORAGE_KEY,
  VIEWS_STORAGE_KEY,
  appendAuditEvent,
  createLocalStorageStore,
  exportWorkspace,
  importWorkspace,
  latestReviewStatus,
  toggleTask,
  type AuditEvent,
  type ContactItem,
  type NoteItem,
  type ProjectTagMap,
  type ReviewAction,
  type SavedView,
  type TaskItem,
  type WorkspaceStore,
} from "@oia/workspace";

/**
 * The console's human layer, persisted through the @oia/workspace store
 * adapter. Today the driver is localStorage, because the console is a static
 * export with no backend; the day authentication returns, a Supabase driver
 * implements the same three methods and none of these hooks change.
 *
 * Two invariants hold whatever the driver:
 *   - the audit log is APPEND-ONLY (no update, no delete is exposed here);
 *   - a storage failure degrades to "the UI works, persistence doesn't",
 *     never to a broken screen.
 */

function useStore(): WorkspaceStore {
  // Created once per mount; on the server this resolves to the memory driver.
  return useMemo(
    () => createLocalStorageStore(typeof window === "undefined" ? null : window.localStorage),
    [],
  );
}

/** What to tell the operator about where their decisions live. */
export function useStorageInfo() {
  const [info, setInfo] = useState({ driver: "memory", durability: "EPHEMERAL" as string });
  useEffect(() => {
    const store = createLocalStorageStore(typeof window === "undefined" ? null : window.localStorage);
    setInfo({ driver: store.driver, durability: store.durability });
  }, []);
  return info;
}

let idCounter = 0;
function nextId(prefix: string): string {
  idCounter += 1;
  return `${prefix}-${Date.now().toString(36)}-${idCounter}`;
}

function download(filename: string, contents: string, type: string): void {
  const blob = new Blob([contents], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/** Generic list-backed collection hook — one implementation for every item kind. */
function useCollection<T extends { id: string }>(store: WorkspaceStore, key: string) {
  const [items, setItems] = useState<T[]>([]);
  useEffect(() => setItems(store.read<T[]>(key, [])), [store, key]);

  const persist = useCallback(
    (next: T[]) => {
      store.write(key, next);
      setItems(next);
    },
    [store, key],
  );

  const add = useCallback((item: T) => persist([...items, item]), [items, persist]);
  const replace = useCallback(
    (item: T) => persist(items.map((x) => (x.id === item.id ? item : x))),
    [items, persist],
  );
  const remove = useCallback((id: string) => persist(items.filter((x) => x.id !== id)), [items, persist]);

  return { items, add, replace, remove, persist };
}

export function useAuditLog() {
  const store = useStore();
  const [log, setLog] = useState<AuditEvent[]>([]);
  useEffect(() => setLog(store.read<AuditEvent[]>(AUDIT_STORAGE_KEY, [])), [store]);

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
        store.write(AUDIT_STORAGE_KEY, next);
        return next;
      });
    },
    [store],
  );

  const statusFor = useCallback(
    (recordId: string): ReviewAction | "PENDING" => latestReviewStatus(log, recordId),
    [log],
  );

  const eventsFor = useCallback(
    (recordId: string): AuditEvent[] => log.filter((e) => e.recordId === recordId),
    [log],
  );

  const exportLog = useCallback(() => {
    download(`oia-audit-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(log, null, 2), "application/json");
  }, [log]);

  return { log, append, statusFor, eventsFor, exportLog };
}

/** Opportunity → project tag (a human decision, audit-logged by the caller). */
export function useProjectTags() {
  const store = useStore();
  const [tags, setTags] = useState<ProjectTagMap>({});
  useEffect(() => setTags(store.read<ProjectTagMap>(TAGS_STORAGE_KEY, {})), [store]);

  const setTag = useCallback(
    (recordId: string, projectSlug: string) => {
      setTags((prev) => {
        const next = { ...prev };
        if (projectSlug) next[recordId] = projectSlug;
        else delete next[recordId];
        store.write(TAGS_STORAGE_KEY, next);
        return next;
      });
    },
    [store],
  );

  return { tags, setTag };
}

/** Notes — attached to an opportunity, to a project, or standalone (Phase 3). */
export function useNotes() {
  const store = useStore();
  const { items, add, remove } = useCollection<NoteItem>(store, NOTES_STORAGE_KEY);

  const addNote = useCallback(
    (text: string, link: { recordId?: string; projectSlug?: string } = {}) => {
      if (!text.trim()) return;
      add({
        id: nextId("note"),
        text: text.trim(),
        at: new Date().toISOString(),
        actor: "mickael",
        ...(link.recordId ? { recordId: link.recordId } : {}),
        ...(link.projectSlug ? { projectSlug: link.projectSlug } : {}),
      });
    },
    [add],
  );

  const notesFor = useCallback((recordId: string) => items.filter((n) => n.recordId === recordId), [items]);

  return { notes: items, addNote, removeNote: remove, notesFor };
}

/** Phase 2 call site kept working: record-scoped notes. */
export function useAttachedNotes() {
  const { notes, addNote, notesFor } = useNotes();
  return {
    notes,
    notesFor,
    addNote: (recordId: string, text: string) => addNote(text, { recordId }),
  };
}

/** Tasks (Phase 3) — the "what is owed" half of the workspace. */
export function useTasks() {
  const store = useStore();
  const { items, add, replace, remove } = useCollection<TaskItem>(store, TASKS_STORAGE_KEY);

  const addTask = useCallback(
    (title: string, opts: { due?: string; recordId?: string; projectSlug?: string } = {}) => {
      if (!title.trim()) return;
      add({
        id: nextId("task"),
        title: title.trim(),
        status: "OPEN",
        at: new Date().toISOString(),
        actor: "mickael",
        ...(opts.due ? { due: opts.due } : {}),
        ...(opts.recordId ? { recordId: opts.recordId } : {}),
        ...(opts.projectSlug ? { projectSlug: opts.projectSlug } : {}),
      });
    },
    [add],
  );

  const toggle = useCallback(
    (task: TaskItem) => replace(toggleTask(task, new Date().toISOString())),
    [replace],
  );

  const tasksFor = useCallback((recordId: string) => items.filter((t) => t.recordId === recordId), [items]);

  return { tasks: items, addTask, toggle, removeTask: remove, tasksFor };
}

/** Contacts (Phase 3) — people attached to projects and opportunities. */
export function useContacts() {
  const store = useStore();
  const { items, add, remove } = useCollection<ContactItem>(store, CONTACTS_STORAGE_KEY);

  const addContact = useCallback(
    (contact: Omit<ContactItem, "id" | "at" | "actor">) => {
      if (!contact.name.trim()) return;
      add({ ...contact, name: contact.name.trim(), id: nextId("contact"), at: new Date().toISOString(), actor: "mickael" });
    },
    [add],
  );

  return { contacts: items, addContact, removeContact: remove };
}

export function useSavedViews() {
  const store = useStore();
  const { items, add, remove } = useCollection<SavedView>(store, VIEWS_STORAGE_KEY);

  const saveView = useCallback(
    (name: string, filters: Record<string, string>, sortField: string, sortDirection: "asc" | "desc") => {
      add({
        id: nextId("view"),
        name,
        kind: "OPPORTUNITY",
        filters,
        sortField,
        sortDirection,
        createdAt: new Date().toISOString(),
      });
    },
    [add],
  );

  return { views: items, saveView, deleteView: remove };
}

/**
 * Backup / restore of the whole human layer. With browser-local storage this is
 * not a nicety: it is the only way the work survives a cleared browser or moves
 * to another machine.
 */
export function useWorkspaceBackup() {
  const store = useStore();

  const exportAll = useCallback(() => {
    const backup = exportWorkspace(store, new Date().toISOString());
    download(
      `oia-workspace-${new Date().toISOString().slice(0, 10)}.json`,
      JSON.stringify(backup, null, 2),
      "application/json",
    );
  }, [store]);

  const importAll = useCallback(
    async (file: File) => {
      const result = importWorkspace(store, JSON.parse(await file.text()));
      // The hooks read their key on mount, so a reload is the honest way to show
      // restored state rather than half-refreshing the screen.
      window.location.reload();
      return result;
    },
    [store],
  );

  return { exportAll, importAll };
}

export { download };
