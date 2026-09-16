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
import { supabase } from "./supabase";
import * as remote from "./remoteWorkspace";

/**
 * The console's human layer: review decisions, project tags, notes, tasks,
 * contacts, saved views.
 *
 * Two drivers, one surface. When the watch database is configured every
 * collection lives in Postgres — durable, visible from a second device, and
 * readable by the alert rules, which is what made "you approved this but never
 * acted on it" possible at all. When it is not, the same hooks fall back to
 * localStorage and the console keeps working exactly as it did as a static
 * export.
 *
 * Writes are optimistic: local state moves first so the UI never waits on the
 * network, and a failed write surfaces as an error rather than a silent revert
 * to a state the operator did not choose.
 */

function useStore(): WorkspaceStore {
  return useMemo(
    () => createLocalStorageStore(typeof window === "undefined" ? null : window.localStorage),
    [],
  );
}

/** Which driver is in play, and how durable it is — the UI says so out loud. */
export function useStorageInfo() {
  const [info, setInfo] = useState({ driver: "memory", durability: "EPHEMERAL" as string, remote: false });
  useEffect(() => {
    const isRemote = supabase() !== null;
    if (isRemote) {
      setInfo({ driver: "supabase", durability: "SERVER", remote: true });
      return;
    }
    const store = createLocalStorageStore(typeof window === "undefined" ? null : window.localStorage);
    setInfo({ driver: store.driver, durability: store.durability, remote: false });
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

const ACTOR = "mickael";

export function useAuditLog() {
  const store = useStore();
  const [log, setLog] = useState<AuditEvent[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const client = supabase();
    if (!client) {
      setLog(store.read<AuditEvent[]>(AUDIT_STORAGE_KEY, []));
      return;
    }
    let active = true;
    void remote
      .loadReviews(client)
      .then((rows) => active && setLog(rows))
      .catch((e: Error) => active && setError(e.message));
    return () => {
      active = false;
    };
  }, [store]);

  const append = useCallback(
    (recordId: string, action: ReviewAction, comment: string, gatePursueEligible: boolean) => {
      const base = {
        recordId,
        action,
        comment,
        at: new Date().toISOString(),
        actor: ACTOR,
        gatePursueEligibleAtDecision: gatePursueEligible,
      };
      const client = supabase();
      if (!client) {
        const event: AuditEvent = { ...base, id: nextId("audit") };
        setLog((prev) => {
          const next = appendAuditEvent(prev, event);
          store.write(AUDIT_STORAGE_KEY, next);
          return next;
        });
        return;
      }
      // Optimistic, then reconciled with the id the database assigns.
      const provisional: AuditEvent = { ...base, id: nextId("pending") };
      setLog((prev) => appendAuditEvent(prev, provisional));
      void remote
        .appendReview(client, base)
        .then((saved) => setLog((prev) => prev.map((e) => (e.id === provisional.id ? saved : e))))
        .catch((e: Error) => {
          setError(e.message);
          setLog((prev) => prev.filter((x) => x.id !== provisional.id));
        });
    },
    [store],
  );

  const statusFor = useCallback(
    (recordId: string): ReviewAction | "PENDING" => latestReviewStatus(log, recordId),
    [log],
  );
  const eventsFor = useCallback((recordId: string) => log.filter((e) => e.recordId === recordId), [log]);

  const exportLog = useCallback(() => {
    download(`oia-audit-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(log, null, 2), "application/json");
  }, [log]);

  return { log, append, statusFor, eventsFor, exportLog, error };
}

export function useProjectTags() {
  const store = useStore();
  const [tags, setTags] = useState<ProjectTagMap>({});

  useEffect(() => {
    const client = supabase();
    if (!client) {
      setTags(store.read<ProjectTagMap>(TAGS_STORAGE_KEY, {}));
      return;
    }
    let active = true;
    void remote.loadTags(client).then((t) => active && setTags(t));
    return () => {
      active = false;
    };
  }, [store]);

  const setTag = useCallback(
    (recordId: string, projectSlug: string) => {
      setTags((prev) => {
        const next = { ...prev };
        if (projectSlug) next[recordId] = projectSlug;
        else delete next[recordId];
        const client = supabase();
        if (client) void remote.setTag(client, recordId, projectSlug, ACTOR);
        else store.write(TAGS_STORAGE_KEY, next);
        return next;
      });
    },
    [store],
  );

  return { tags, setTag };
}

/** Shared shape for the three Phase 3 collections, over either driver. */
function useRemoteCollection<T extends { id: string }>(
  storageKey: string,
  loadRemote: (client: import("@supabase/supabase-js").SupabaseClient) => Promise<T[]>,
  insertRemote: (client: import("@supabase/supabase-js").SupabaseClient, item: Omit<T, "id">) => Promise<T>,
  table: string,
) {
  const store = useStore();
  const [items, setItems] = useState<T[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const client = supabase();
    if (!client) {
      setItems(store.read<T[]>(storageKey, []));
      return;
    }
    let active = true;
    void loadRemote(client)
      .then((rows) => active && setItems(rows))
      .catch((e: Error) => active && setError(e.message));
    return () => {
      active = false;
    };
    // loadRemote is stable per hook instance by construction.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store, storageKey]);

  const add = useCallback(
    (item: Omit<T, "id">) => {
      const client = supabase();
      if (!client) {
        const created = { ...item, id: nextId(table) } as T;
        setItems((prev) => {
          const next = [...prev, created];
          store.write(storageKey, next);
          return next;
        });
        return;
      }
      const provisional = { ...item, id: nextId("pending") } as T;
      setItems((prev) => [...prev, provisional]);
      void insertRemote(client, item)
        .then((saved) => setItems((prev) => prev.map((x) => (x.id === provisional.id ? saved : x))))
        .catch((e: Error) => {
          setError(e.message);
          setItems((prev) => prev.filter((x) => x.id !== provisional.id));
        });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [store, storageKey, table],
  );

  const replace = useCallback(
    (item: T, persist?: (client: import("@supabase/supabase-js").SupabaseClient, item: T) => Promise<void>) => {
      setItems((prev) => {
        const next = prev.map((x) => (x.id === item.id ? item : x));
        const client = supabase();
        if (client && persist) void persist(client, item).catch((e: Error) => setError(e.message));
        else if (!client) store.write(storageKey, next);
        return next;
      });
    },
    [store, storageKey],
  );

  const remove = useCallback(
    (id: string) => {
      setItems((prev) => {
        const next = prev.filter((x) => x.id !== id);
        const client = supabase();
        if (client) void remote.removeRow(client, table, id).catch((e: Error) => setError(e.message));
        else store.write(storageKey, next);
        return next;
      });
    },
    [store, storageKey, table],
  );

  return { items, add, replace, remove, error };
}

export function useNotes() {
  const { items, add, remove, error } = useRemoteCollection<NoteItem>(
    NOTES_STORAGE_KEY,
    remote.loadNotes,
    remote.insertNote,
    "notes",
  );

  const addNote = useCallback(
    (text: string, link: { recordId?: string; projectSlug?: string } = {}) => {
      if (!text.trim()) return;
      add({
        text: text.trim(),
        at: new Date().toISOString(),
        actor: ACTOR,
        ...(link.recordId ? { recordId: link.recordId } : {}),
        ...(link.projectSlug ? { projectSlug: link.projectSlug } : {}),
      });
    },
    [add],
  );

  const notesFor = useCallback((recordId: string) => items.filter((n) => n.recordId === recordId), [items]);
  return { notes: items, addNote, removeNote: remove, notesFor, error };
}

/** The Phase 2 call site kept working: record-scoped notes. */
export function useAttachedNotes() {
  const { notes, addNote, notesFor } = useNotes();
  return { notes, notesFor, addNote: (recordId: string, text: string) => addNote(text, { recordId }) };
}

export function useTasks() {
  const { items, add, replace, remove, error } = useRemoteCollection<TaskItem>(
    TASKS_STORAGE_KEY,
    remote.loadTasks,
    remote.insertTask,
    "tasks",
  );

  const addTask = useCallback(
    (title: string, opts: { due?: string; recordId?: string; projectSlug?: string } = {}) => {
      if (!title.trim()) return;
      add({
        title: title.trim(),
        status: "OPEN",
        at: new Date().toISOString(),
        actor: ACTOR,
        ...(opts.due ? { due: opts.due } : {}),
        ...(opts.recordId ? { recordId: opts.recordId } : {}),
        ...(opts.projectSlug ? { projectSlug: opts.projectSlug } : {}),
      });
    },
    [add],
  );

  const toggle = useCallback(
    (task: TaskItem) => replace(toggleTask(task, new Date().toISOString()), remote.updateTask),
    [replace],
  );

  const tasksFor = useCallback((recordId: string) => items.filter((t) => t.recordId === recordId), [items]);
  return { tasks: items, addTask, toggle, removeTask: remove, tasksFor, error };
}

export function useContacts() {
  const { items, add, remove, error } = useRemoteCollection<ContactItem>(
    CONTACTS_STORAGE_KEY,
    remote.loadContacts,
    remote.insertContact,
    "contacts",
  );

  const addContact = useCallback(
    (contact: Omit<ContactItem, "id" | "at" | "actor">) => {
      if (!contact.name.trim()) return;
      add({ ...contact, name: contact.name.trim(), at: new Date().toISOString(), actor: ACTOR });
    },
    [add],
  );

  return { contacts: items, addContact, removeContact: remove, error };
}

export function useSavedViews() {
  const { items, add, remove } = useRemoteCollection<SavedView>(
    VIEWS_STORAGE_KEY,
    remote.loadViews,
    remote.insertView,
    "saved_views",
  );

  const saveView = useCallback(
    (name: string, filters: Record<string, string>, sortField: string, sortDirection: "asc" | "desc") => {
      add({ name, kind: "OPPORTUNITY", filters, sortField, sortDirection, createdAt: new Date().toISOString() });
    },
    [add],
  );

  return { views: items, saveView, deleteView: remove };
}

/**
 * Backup, restore, and the one-way trip from the browser to the database.
 *
 * The migration matters more than the backup: months of triage decisions sit in
 * localStorage today, and losing them to make the storage "cleaner" would be an
 * absurd trade. Reviews keep their original timestamps, so the trail reads as
 * what happened rather than as the day it moved.
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
      window.location.reload();
      return result;
    },
    [store],
  );

  const migrateLocalToDatabase = useCallback(async () => {
    const client = supabase();
    if (!client) throw new Error("No database configured.");
    const report = await remote.migrateLocalToRemote(
      client,
      {
        reviews: store.read<AuditEvent[]>(AUDIT_STORAGE_KEY, []),
        tags: store.read<ProjectTagMap>(TAGS_STORAGE_KEY, {}),
        notes: store.read<NoteItem[]>(NOTES_STORAGE_KEY, []),
        tasks: store.read<TaskItem[]>(TASKS_STORAGE_KEY, []),
        contacts: store.read<ContactItem[]>(CONTACTS_STORAGE_KEY, []),
        views: store.read<SavedView[]>(VIEWS_STORAGE_KEY, []),
      },
      ACTOR,
    );
    return report;
  }, [store]);

  /** Whether this browser still holds anything worth migrating. */
  const localCount = useCallback(() => {
    return (
      store.read<AuditEvent[]>(AUDIT_STORAGE_KEY, []).length +
      Object.keys(store.read<ProjectTagMap>(TAGS_STORAGE_KEY, {})).length +
      store.read<NoteItem[]>(NOTES_STORAGE_KEY, []).length +
      store.read<TaskItem[]>(TASKS_STORAGE_KEY, []).length +
      store.read<ContactItem[]>(CONTACTS_STORAGE_KEY, []).length
    );
  }, [store]);

  return { exportAll, importAll, migrateLocalToDatabase, localCount };
}

export { download };
