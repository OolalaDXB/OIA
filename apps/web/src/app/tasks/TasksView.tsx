"use client";

import { useMemo, useState } from "react";
import type { ConsoleData } from "@oia/ingestion/console";
import { PROJECT_ENTRIES, openTasks, overdueTasks, projectName } from "@oia/workspace";
import { Shell } from "../Shell";
import { useProjectTags, useTasks } from "../../lib/workspaceStore";

/**
 * Tasks (Phase 3) — declared by the Phase 1 skeleton, built here. A task can
 * hang off a project, off an opportunity, or off nothing; the digest reads the
 * same list, so "due Thursday" appears on the morning screen without a second
 * model.
 */
export function TasksView({ data }: { data: ConsoleData }) {
  const { tasks, addTask, toggle, removeTask } = useTasks();
  const tags = useProjectTags();
  const [title, setTitle] = useState("");
  const [due, setDue] = useState("");
  const [project, setProject] = useState("");
  const [recordId, setRecordId] = useState("");
  const [filter, setFilter] = useState("OPEN");

  const nowIso = useMemo(() => new Date().toISOString(), []);
  const overdue = useMemo(() => new Set(overdueTasks(tasks, nowIso).map((t) => t.id)), [tasks, nowIso]);

  const shown = useMemo(() => {
    if (filter === "OPEN") return openTasks(tasks);
    if (filter === "DONE") return tasks.filter((t) => t.status === "DONE").sort((a, b) => b.at.localeCompare(a.at));
    return [...openTasks(tasks), ...tasks.filter((t) => t.status === "DONE")];
  }, [tasks, filter]);

  const recordTitle = (id: string) => data.records.find((r) => r.id === id)?.title ?? id;

  return (
    <Shell
      active="tasks"
      title="Tasks"
      stats={`${openTasks(tasks).length} open · ${overdue.size} overdue · ${tasks.length} total`}
      note="What is owed, and by when. Attach a task to a project or to an opportunity and it shows up in Today, on the project, and in the opportunity's detail."
    >
      <div className="filters">
        <label className="filter">
          <span className="muted">New task</span>
          <span className="viewsRow">
            <input
              className="comment inputLine wideInput"
              placeholder="What has to happen…"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
            <input className="comment inputLine dateInput" type="date" value={due} onChange={(e) => setDue(e.target.value)} />
            <select value={project} onChange={(e) => setProject(e.target.value)}>
              <option value="">no project</option>
              {PROJECT_ENTRIES.map((p) => (
                <option key={p.slug} value={p.slug}>
                  {p.name}
                </option>
              ))}
            </select>
            <select value={recordId} onChange={(e) => setRecordId(e.target.value)}>
              <option value="">no opportunity</option>
              {data.records.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.title.slice(0, 60)}
                </option>
              ))}
            </select>
            <button
              className="ghostBtn"
              onClick={() => {
                addTask(title, {
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
          </span>
        </label>
        <label className="filter">
          <span className="muted">Show</span>
          <select value={filter} onChange={(e) => setFilter(e.target.value)}>
            <option value="OPEN">open</option>
            <option value="DONE">done</option>
            <option value="ALL">all</option>
          </select>
        </label>
      </div>

      <div className="detail wide">
        {shown.length === 0 && <div className="muted">No task here yet.</div>}
        {shown.map((t) => (
          <div key={t.id} className="fact" style={overdue.has(t.id) ? { borderLeftColor: "var(--reject)" } : undefined}>
            <div className="viewsRow">
              <button className="ghostBtn" onClick={() => toggle(t)}>
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
            {t.recordId && <div className="muted small">on: {recordTitle(t.recordId)}</div>}
            <div className="muted small">
              created {t.at.slice(0, 10)} · {t.actor}
              {tags.tags[t.recordId ?? ""] && ` · opportunity tagged ${projectName(tags.tags[t.recordId ?? ""]!)}`}
              <button className="ghostBtn applyBtn" onClick={() => removeTask(t.id)}>
                delete
              </button>
            </div>
          </div>
        ))}
      </div>
    </Shell>
  );
}
