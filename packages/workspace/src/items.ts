/**
 * Phase 3 — the three record kinds the skeleton declared and never built:
 * NOTE, TASK, CONTACT.
 *
 * They are deliberately small. A note is text with a link; a task is text with
 * a link, a due date and a done flag; a contact is a person with links. Every
 * one of them can point at a project (registry slug) and/or an opportunity
 * (ConsoleRecord id) — that link is the whole value: it turns a queue of
 * opportunities into a workspace where "what did we decide, who did we talk to,
 * what is owed on Tuesday" lives next to the evidence.
 *
 * All pure: creation, filtering and ordering are functions, storage is
 * somebody else's problem (see store.ts).
 */

export interface WorkspaceItemBase {
  id: string;
  /** ISO creation timestamp. */
  at: string;
  actor: string;
  /** Registry project slug this belongs to, when it belongs to one. */
  projectSlug?: string;
  /** ConsoleRecord id this belongs to, when it belongs to one. */
  recordId?: string;
}

/** A note. `recordId` present = the note is attached to an opportunity. */
export interface NoteItem extends WorkspaceItemBase {
  text: string;
}

/** Kept for the Phase 2 call sites: an attached note is just a note with a record. */
export type AttachedNote = NoteItem;

export const TASK_STATUSES = ["OPEN", "DONE"] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export interface TaskItem extends WorkspaceItemBase {
  title: string;
  /** ISO date (YYYY-MM-DD) the task is due, when there is one. */
  due?: string;
  status: TaskStatus;
  /** ISO timestamp of completion — set once, when status became DONE. */
  completedAt?: string;
}

export interface ContactItem extends WorkspaceItemBase {
  name: string;
  organisation?: string;
  role?: string;
  email?: string;
  phone?: string;
  note?: string;
}

export const NOTES_STORAGE_KEY = "oia.notes.v1";
export const TASKS_STORAGE_KEY = "oia.tasks.v1";
export const CONTACTS_STORAGE_KEY = "oia.contacts.v1";

// ── Pure operations ──────────────────────────────────────────────────────────

/** Toggle a task, stamping the completion time. Returns a NEW task. */
export function toggleTask(task: TaskItem, nowIso: string): TaskItem {
  if (task.status === "DONE") {
    const { completedAt: _dropped, ...rest } = task;
    return { ...rest, status: "OPEN" };
  }
  return { ...task, status: "DONE", completedAt: nowIso };
}

/** Open tasks, soonest due first; undated tasks last, newest first among them. */
export function openTasks(tasks: readonly TaskItem[]): TaskItem[] {
  return tasks
    .filter((t) => t.status === "OPEN")
    .sort((a, b) => {
      if (a.due && b.due) return a.due.localeCompare(b.due);
      if (a.due) return -1;
      if (b.due) return 1;
      return b.at.localeCompare(a.at);
    });
}

/** Open tasks already past their due date at `nowIso`. */
export function overdueTasks(tasks: readonly TaskItem[], nowIso: string): TaskItem[] {
  const today = nowIso.slice(0, 10);
  return openTasks(tasks).filter((t) => !!t.due && t.due < today);
}

/** Open tasks due within `days` (inclusive), excluding overdue ones. */
export function tasksDueWithin(tasks: readonly TaskItem[], nowIso: string, days: number): TaskItem[] {
  const today = nowIso.slice(0, 10);
  const limit = new Date(Date.parse(`${today}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
  return openTasks(tasks).filter((t) => !!t.due && t.due >= today && t.due <= limit);
}

/** Items belonging to a project — directly, or through a linked opportunity. */
export function forProject<T extends WorkspaceItemBase>(
  items: readonly T[],
  projectSlug: string,
  recordProject: (recordId: string) => string | undefined = () => undefined,
): T[] {
  return items.filter(
    (i) => i.projectSlug === projectSlug || (i.recordId ? recordProject(i.recordId) === projectSlug : false),
  );
}

export function forRecord<T extends WorkspaceItemBase>(items: readonly T[], recordId: string): T[] {
  return items.filter((i) => i.recordId === recordId);
}
