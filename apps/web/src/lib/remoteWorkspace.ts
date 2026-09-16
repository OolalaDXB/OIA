"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { AuditEvent, ContactItem, NoteItem, ProjectTagMap, SavedView, TaskItem } from "@oia/workspace";

/**
 * The human layer, in Postgres.
 *
 * Same six collections the browser held; the difference is that they now
 * survive a cleared browser and are visible from a second device. The shapes
 * are unchanged — @oia/workspace still owns them — so nothing downstream had to
 * be rewritten to move the storage.
 *
 * One asymmetry is deliberate: reviews can be inserted and read, never updated
 * or deleted. That is enforced by the absence of an update policy in the
 * database, not by this file being careful. An append-only trail whose
 * append-only-ness lives in client code is not append-only.
 */

export async function loadReviews(client: SupabaseClient): Promise<AuditEvent[]> {
  const { data, error } = await client
    .from("reviews")
    .select("id, record_id, action, comment, at, actor, gate_pursue_eligible_at_decision")
    .order("at", { ascending: true });
  if (error) throw new Error(error.message);
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    id: String(r["id"]),
    recordId: String(r["record_id"]),
    action: r["action"] as AuditEvent["action"],
    comment: String(r["comment"] ?? ""),
    at: String(r["at"]),
    actor: String(r["actor"]),
    gatePursueEligibleAtDecision: !!r["gate_pursue_eligible_at_decision"],
  }));
}

export async function appendReview(client: SupabaseClient, event: Omit<AuditEvent, "id">): Promise<AuditEvent> {
  const { data, error } = await client
    .from("reviews")
    .insert({
      record_id: event.recordId,
      action: event.action,
      comment: event.comment,
      at: event.at,
      actor: event.actor,
      gate_pursue_eligible_at_decision: event.gatePursueEligibleAtDecision,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return { ...event, id: String((data as { id: string }).id) };
}

export async function loadTags(client: SupabaseClient): Promise<ProjectTagMap> {
  const { data, error } = await client.from("project_tags").select("record_id, project_slug");
  if (error) throw new Error(error.message);
  const map: ProjectTagMap = {};
  for (const r of (data ?? []) as { record_id: string; project_slug: string }[]) map[r.record_id] = r.project_slug;
  return map;
}

export async function setTag(
  client: SupabaseClient,
  recordId: string,
  projectSlug: string,
  actor: string,
): Promise<void> {
  if (!projectSlug) {
    const { error } = await client.from("project_tags").delete().eq("record_id", recordId);
    if (error) throw new Error(error.message);
    return;
  }
  const { error } = await client
    .from("project_tags")
    .upsert({ record_id: recordId, project_slug: projectSlug, at: new Date().toISOString(), actor });
  if (error) throw new Error(error.message);
}

export async function loadNotes(client: SupabaseClient): Promise<NoteItem[]> {
  const { data, error } = await client
    .from("notes")
    .select("id, text, record_id, project_slug, at, actor")
    .order("at", { ascending: true });
  if (error) throw new Error(error.message);
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    id: String(r["id"]),
    text: String(r["text"]),
    at: String(r["at"]),
    actor: String(r["actor"]),
    ...(r["record_id"] ? { recordId: String(r["record_id"]) } : {}),
    ...(r["project_slug"] ? { projectSlug: String(r["project_slug"]) } : {}),
  }));
}

export async function insertNote(client: SupabaseClient, note: Omit<NoteItem, "id">): Promise<NoteItem> {
  const { data, error } = await client
    .from("notes")
    .insert({
      text: note.text,
      record_id: note.recordId ?? null,
      project_slug: note.projectSlug ?? null,
      at: note.at,
      actor: note.actor,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return { ...note, id: String((data as { id: string }).id) };
}

export async function loadTasks(client: SupabaseClient): Promise<TaskItem[]> {
  const { data, error } = await client
    .from("tasks")
    .select("id, title, due, status, completed_at, record_id, project_slug, at, actor")
    .order("at", { ascending: true });
  if (error) throw new Error(error.message);
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    id: String(r["id"]),
    title: String(r["title"]),
    status: r["status"] as TaskItem["status"],
    at: String(r["at"]),
    actor: String(r["actor"]),
    ...(r["due"] ? { due: String(r["due"]) } : {}),
    ...(r["completed_at"] ? { completedAt: String(r["completed_at"]) } : {}),
    ...(r["record_id"] ? { recordId: String(r["record_id"]) } : {}),
    ...(r["project_slug"] ? { projectSlug: String(r["project_slug"]) } : {}),
  }));
}

export async function insertTask(client: SupabaseClient, task: Omit<TaskItem, "id">): Promise<TaskItem> {
  const { data, error } = await client
    .from("tasks")
    .insert({
      title: task.title,
      due: task.due ?? null,
      status: task.status,
      completed_at: task.completedAt ?? null,
      record_id: task.recordId ?? null,
      project_slug: task.projectSlug ?? null,
      at: task.at,
      actor: task.actor,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return { ...task, id: String((data as { id: string }).id) };
}

export async function updateTask(client: SupabaseClient, task: TaskItem): Promise<void> {
  const { error } = await client
    .from("tasks")
    .update({ status: task.status, completed_at: task.completedAt ?? null, due: task.due ?? null, title: task.title })
    .eq("id", task.id);
  if (error) throw new Error(error.message);
}

export async function loadContacts(client: SupabaseClient): Promise<ContactItem[]> {
  const { data, error } = await client
    .from("contacts")
    .select("id, name, organisation, role, email, phone, note, record_id, project_slug, at, actor")
    .order("name", { ascending: true });
  if (error) throw new Error(error.message);
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    id: String(r["id"]),
    name: String(r["name"]),
    at: String(r["at"]),
    actor: String(r["actor"]),
    ...(r["organisation"] ? { organisation: String(r["organisation"]) } : {}),
    ...(r["role"] ? { role: String(r["role"]) } : {}),
    ...(r["email"] ? { email: String(r["email"]) } : {}),
    ...(r["phone"] ? { phone: String(r["phone"]) } : {}),
    ...(r["note"] ? { note: String(r["note"]) } : {}),
    ...(r["record_id"] ? { recordId: String(r["record_id"]) } : {}),
    ...(r["project_slug"] ? { projectSlug: String(r["project_slug"]) } : {}),
  }));
}

export async function insertContact(
  client: SupabaseClient,
  contact: Omit<ContactItem, "id">,
): Promise<ContactItem> {
  const { data, error } = await client
    .from("contacts")
    .insert({
      name: contact.name,
      organisation: contact.organisation ?? null,
      role: contact.role ?? null,
      email: contact.email ?? null,
      phone: contact.phone ?? null,
      note: contact.note ?? null,
      record_id: contact.recordId ?? null,
      project_slug: contact.projectSlug ?? null,
      at: contact.at,
      actor: contact.actor,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return { ...contact, id: String((data as { id: string }).id) };
}

export async function removeRow(client: SupabaseClient, table: string, id: string): Promise<void> {
  const { error } = await client.from(table).delete().eq("id", id);
  if (error) throw new Error(error.message);
}

export async function loadViews(client: SupabaseClient): Promise<SavedView[]> {
  const { data, error } = await client
    .from("saved_views")
    .select("id, name, kind, filters, sort_field, sort_direction, created_at")
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    id: String(r["id"]),
    name: String(r["name"]),
    kind: r["kind"] as SavedView["kind"],
    filters: (r["filters"] ?? {}) as Record<string, string>,
    sortField: String(r["sort_field"]),
    sortDirection: r["sort_direction"] as "asc" | "desc",
    createdAt: String(r["created_at"]),
  }));
}

export async function insertView(client: SupabaseClient, view: Omit<SavedView, "id">): Promise<SavedView> {
  const { data, error } = await client
    .from("saved_views")
    .insert({
      name: view.name,
      kind: view.kind,
      filters: view.filters,
      sort_field: view.sortField,
      sort_direction: view.sortDirection,
      created_at: view.createdAt,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return { ...view, id: String((data as { id: string }).id) };
}

export interface MigrationReport {
  reviews: number;
  tags: number;
  notes: number;
  tasks: number;
  contacts: number;
  views: number;
}

/**
 * Push what is already in this browser into the database, once.
 *
 * Months of triage decisions currently live in localStorage; losing them to
 * make the storage "cleaner" would be an absurd trade. Reviews are inserted
 * as-is — the trail keeps its original timestamps, so the history reads as what
 * actually happened, not as the day it was migrated.
 */
export async function migrateLocalToRemote(
  client: SupabaseClient,
  local: {
    reviews: AuditEvent[];
    tags: ProjectTagMap;
    notes: NoteItem[];
    tasks: TaskItem[];
    contacts: ContactItem[];
    views: SavedView[];
  },
  actor: string,
): Promise<MigrationReport> {
  const report: MigrationReport = { reviews: 0, tags: 0, notes: 0, tasks: 0, contacts: 0, views: 0 };

  const existing = await loadReviews(client);
  const seen = new Set(existing.map((e) => `${e.recordId}|${e.at}|${e.action}`));
  for (const e of local.reviews) {
    if (seen.has(`${e.recordId}|${e.at}|${e.action}`)) continue;
    await appendReview(client, e);
    report.reviews += 1;
  }

  for (const [recordId, slug] of Object.entries(local.tags)) {
    await setTag(client, recordId, slug, actor);
    report.tags += 1;
  }
  for (const n of local.notes) {
    await insertNote(client, n);
    report.notes += 1;
  }
  for (const t of local.tasks) {
    await insertTask(client, t);
    report.tasks += 1;
  }
  for (const c of local.contacts) {
    await insertContact(client, c);
    report.contacts += 1;
  }
  for (const v of local.views) {
    await insertView(client, v);
    report.views += 1;
  }
  return report;
}
