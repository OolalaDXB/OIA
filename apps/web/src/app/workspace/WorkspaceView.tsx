"use client";

import { useMemo, useState } from "react";
import type { ConsoleData } from "@oia/ingestion/console";
import { PROJECT_ENTRIES, openTasks, overdueTasks, projectName } from "@oia/workspace";
import { Shell } from "../Shell";
import { useContacts, useNotes, useProjectTags, useTasks } from "../../lib/workspaceStore";

/**
 * Tasks, notes and people — one place, three tabs.
 *
 * They used to be three routes in an eleven-item menu. They are the same kind
 * of thing (what a human put there, attached to a project or an opportunity)
 * and they are consulted together, so they live together.
 */

export type WorkspaceTab = "tasks" | "notes" | "contacts";

export function WorkspaceView({ data, tab: initial = "tasks" }: { data: ConsoleData; tab?: WorkspaceTab }) {
  const [tab, setTab] = useState<WorkspaceTab>(initial);
  const tasks = useTasks();
  const notes = useNotes();
  const contacts = useContacts();
  const { tags } = useProjectTags();
  const nowIso = useMemo(() => new Date().toISOString(), []);

  const overdue = useMemo(() => new Set(overdueTasks(tasks.tasks, nowIso).map((t) => t.id)), [tasks.tasks, nowIso]);
  const open = openTasks(tasks.tasks);
  const recordTitle = (id: string) => data.records.find((r) => r.id === id)?.title ?? id;

  return (
    <Shell
      active="workspace"
      title="Workspace"
      stats={`${open.length} open task(s) · ${notes.notes.length} note(s) · ${contacts.contacts.length} contact(s)`}
      note="What you put here, attached to a project or to an opportunity. Anything with a due date shows up in Today."
    >
      <div className="tabs">
        {(
          [
            ["tasks", `Tasks${overdue.size > 0 ? ` · ${overdue.size} overdue` : ""}`],
            ["notes", "Notes"],
            ["contacts", "People"],
          ] as [WorkspaceTab, string][]
        ).map(([key, label]) => (
          <button key={key} className={tab === key ? "tab on" : "tab"} onClick={() => setTab(key)}>
            {label}
          </button>
        ))}
      </div>

      <div className="detail wide">
        {tab === "tasks" && (
          <TasksPanel
            data={data}
            tasks={tasks}
            overdue={overdue}
            recordTitle={recordTitle}
            tagOf={(id) => tags[id]}
          />
        )}
        {tab === "notes" && <NotesPanel data={data} notes={notes} recordTitle={recordTitle} />}
        {tab === "contacts" && <ContactsPanel data={data} contacts={contacts} recordTitle={recordTitle} />}
      </div>
    </Shell>
  );
}

function ProjectSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">no project</option>
      {PROJECT_ENTRIES.map((p) => (
        <option key={p.slug} value={p.slug}>
          {p.name}
        </option>
      ))}
    </select>
  );
}

function RecordSelect({ data, value, onChange }: { data: ConsoleData; value: string; onChange: (v: string) => void }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">no opportunity</option>
      {data.records.map((r) => (
        <option key={r.id} value={r.id}>
          {r.title.slice(0, 60)}
        </option>
      ))}
    </select>
  );
}

function TasksPanel({
  data,
  tasks,
  overdue,
  recordTitle,
  tagOf,
}: {
  data: ConsoleData;
  tasks: ReturnType<typeof useTasks>;
  overdue: Set<string>;
  recordTitle: (id: string) => string;
  tagOf: (id: string) => string | undefined;
}) {
  const [title, setTitle] = useState("");
  const [due, setDue] = useState("");
  const [project, setProject] = useState("");
  const [recordId, setRecordId] = useState("");
  const [filter, setFilter] = useState("OPEN");

  const shown = useMemo(() => {
    if (filter === "OPEN") return openTasks(tasks.tasks);
    if (filter === "DONE") return tasks.tasks.filter((t) => t.status === "DONE").sort((a, b) => b.at.localeCompare(a.at));
    return [...openTasks(tasks.tasks), ...tasks.tasks.filter((t) => t.status === "DONE")];
  }, [tasks.tasks, filter]);

  return (
    <>
      <section className="sec">
        <h3>Add a task</h3>
        <div className="viewsRow wrapRow">
          <input
            className="comment inputLine wideInput"
            placeholder="What has to happen…"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
          <input className="comment inputLine dateInput" type="date" value={due} onChange={(e) => setDue(e.target.value)} />
          <ProjectSelect value={project} onChange={setProject} />
          <RecordSelect data={data} value={recordId} onChange={setRecordId} />
          <button
            className="btn on"
            onClick={() => {
              tasks.addTask(title, {
                ...(due ? { due } : {}),
                ...(project ? { projectSlug: project } : {}),
                ...(recordId ? { recordId } : {}),
              });
              setTitle("");
              setDue("");
            }}
          >
            add
          </button>
        </div>
      </section>

      <section className="sec">
        <div className="secHead">
          <h3>{shown.length} task(s)</h3>
          <select value={filter} onChange={(e) => setFilter(e.target.value)}>
            <option value="OPEN">open</option>
            <option value="DONE">done</option>
            <option value="ALL">all</option>
          </select>
        </div>
        {shown.length === 0 && <div className="muted">Nothing here.</div>}
        {shown.map((t) => (
          <div key={t.id} className="fact" style={overdue.has(t.id) ? { borderLeftColor: "var(--reject)" } : undefined}>
            <div className="viewsRow">
              <button className="ghostBtn" onClick={() => tasks.toggle(t)}>
                {t.status === "DONE" ? "reopen" : "done"}
              </button>
              <span className={t.status === "DONE" ? "muted" : undefined}>{t.title}</span>
              {t.due && (
                <span className={overdue.has(t.id) ? "pubChip expiredChip" : "pubChip"}>
                  {overdue.has(t.id) ? `overdue ${t.due}` : `due ${t.due}`}
                </span>
              )}
              {t.projectSlug && <span className="pubChip tagChip">{projectName(t.projectSlug)}</span>}
            </div>
            {t.recordId && (
              <div className="muted small">
                on: {recordTitle(t.recordId)}
                {tagOf(t.recordId) ? ` · ${projectName(tagOf(t.recordId)!)}` : ""}
              </div>
            )}
            <div className="muted small">
              added {t.at.slice(0, 10)}
              <button className="ghostBtn applyBtn" onClick={() => tasks.removeTask(t.id)}>
                delete
              </button>
            </div>
          </div>
        ))}
      </section>
    </>
  );
}

function NotesPanel({
  data,
  notes,
  recordTitle,
}: {
  data: ConsoleData;
  notes: ReturnType<typeof useNotes>;
  recordTitle: (id: string) => string;
}) {
  const [text, setText] = useState("");
  const [project, setProject] = useState("");
  const [recordId, setRecordId] = useState("");
  const [filter, setFilter] = useState("");

  const shown = useMemo(() => {
    const sorted = [...notes.notes].sort((a, b) => b.at.localeCompare(a.at));
    if (!filter) return sorted;
    if (filter === "__standalone") return sorted.filter((n) => !n.projectSlug && !n.recordId);
    return sorted.filter((n) => n.projectSlug === filter);
  }, [notes.notes, filter]);

  return (
    <>
      <section className="sec">
        <h3>Write a note</h3>
        <div className="viewsRow wrapRow">
          <textarea
            className="comment wideInput"
            placeholder="Write it down before it is lost…"
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
          <ProjectSelect value={project} onChange={setProject} />
          <RecordSelect data={data} value={recordId} onChange={setRecordId} />
          <button
            className="btn on"
            onClick={() => {
              notes.addNote(text, {
                ...(project ? { projectSlug: project } : {}),
                ...(recordId ? { recordId } : {}),
              });
              setText("");
            }}
          >
            add
          </button>
        </div>
      </section>

      <section className="sec">
        <div className="secHead">
          <h3>{shown.length} note(s)</h3>
          <select value={filter} onChange={(e) => setFilter(e.target.value)}>
            <option value="">all</option>
            <option value="__standalone">standalone only</option>
            {PROJECT_ENTRIES.map((p) => (
              <option key={p.slug} value={p.slug}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
        {shown.length === 0 && <div className="muted">Nothing here.</div>}
        {shown.map((n) => (
          <div key={n.id} className="fact">
            <div className="noteText">{n.text}</div>
            <div className="muted small">
              {n.at.slice(0, 16).replace("T", " ")}
              {n.projectSlug && <span className="pubChip tagChip">{projectName(n.projectSlug)}</span>}
              {n.recordId && ` · on: ${recordTitle(n.recordId)}`}
              <button className="ghostBtn applyBtn" onClick={() => notes.removeNote(n.id)}>
                delete
              </button>
            </div>
          </div>
        ))}
      </section>
    </>
  );
}

function ContactsPanel({
  data,
  contacts,
  recordTitle,
}: {
  data: ConsoleData;
  contacts: ReturnType<typeof useContacts>;
  recordTitle: (id: string) => string;
}) {
  const [form, setForm] = useState({
    name: "", organisation: "", role: "", email: "", phone: "", note: "", projectSlug: "", recordId: "",
  });
  const [filter, setFilter] = useState("");
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const shown = useMemo(() => {
    const sorted = [...contacts.contacts].sort((a, b) => a.name.localeCompare(b.name));
    return filter ? sorted.filter((c) => c.projectSlug === filter) : sorted;
  }, [contacts.contacts, filter]);

  return (
    <>
      <section className="sec">
        <h3>Add someone</h3>
        <div className="viewsRow wrapRow">
          <input className="comment inputLine" placeholder="Name" value={form.name} onChange={set("name")} />
          <input className="comment inputLine" placeholder="Organisation" value={form.organisation} onChange={set("organisation")} />
          <input className="comment inputLine" placeholder="Role" value={form.role} onChange={set("role")} />
          <input className="comment inputLine" placeholder="Email" value={form.email} onChange={set("email")} />
          <input className="comment inputLine" placeholder="Phone" value={form.phone} onChange={set("phone")} />
          <ProjectSelect value={form.projectSlug} onChange={(v) => setForm((f) => ({ ...f, projectSlug: v }))} />
          <RecordSelect data={data} value={form.recordId} onChange={(v) => setForm((f) => ({ ...f, recordId: v }))} />
          <input className="comment inputLine wideInput" placeholder="Note" value={form.note} onChange={set("note")} />
          <button
            className="btn on"
            onClick={() => {
              contacts.addContact({
                name: form.name,
                ...(form.organisation ? { organisation: form.organisation } : {}),
                ...(form.role ? { role: form.role } : {}),
                ...(form.email ? { email: form.email } : {}),
                ...(form.phone ? { phone: form.phone } : {}),
                ...(form.note ? { note: form.note } : {}),
                ...(form.projectSlug ? { projectSlug: form.projectSlug } : {}),
                ...(form.recordId ? { recordId: form.recordId } : {}),
              });
              setForm({ ...form, name: "", organisation: "", role: "", email: "", phone: "", note: "", recordId: "" });
            }}
          >
            add
          </button>
        </div>
      </section>

      <section className="sec">
        <div className="secHead">
          <h3>{shown.length} contact(s)</h3>
          <select value={filter} onChange={(e) => setFilter(e.target.value)}>
            <option value="">all projects</option>
            {PROJECT_ENTRIES.map((p) => (
              <option key={p.slug} value={p.slug}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
        {shown.length === 0 && <div className="muted">Nobody here yet.</div>}
        {shown.map((c) => (
          <div key={c.id} className="fact">
            <div>
              <b>{c.name}</b>
              {c.role && <span className="muted"> · {c.role}</span>}
              {c.organisation && <span> · {c.organisation}</span>}
              {c.projectSlug && <span className="pubChip tagChip">{projectName(c.projectSlug)}</span>}
            </div>
            <div className="small">
              {c.email && <a href={`mailto:${c.email}`}>{c.email}</a>}
              {c.email && c.phone && " · "}
              {c.phone && <a href={`tel:${c.phone.replace(/\s/g, "")}`}>{c.phone}</a>}
            </div>
            {c.note && <div className="muted small">{c.note}</div>}
            <div className="muted small">
              added {c.at.slice(0, 10)}
              {c.recordId && ` · on: ${recordTitle(c.recordId)}`}
              <button className="ghostBtn applyBtn" onClick={() => contacts.removeContact(c.id)}>
                delete
              </button>
            </div>
          </div>
        ))}
      </section>
    </>
  );
}
