"use client";

import { useMemo, useState } from "react";
import type { ConsoleData } from "@oia/ingestion/console";
import { PROJECT_ENTRIES, projectName } from "@oia/workspace";
import { Shell } from "../Shell";
import { useNotes } from "../../lib/workspaceStore";

/**
 * Notes (Phase 3). The same note model the opportunity detail has used since
 * Phase 2, now with a surface of its own and an optional project link — so
 * "what we decided about SILLON's funding route" is findable without
 * remembering which opportunity it was attached to.
 */
export function NotesView({ data }: { data: ConsoleData }) {
  const { notes, addNote, removeNote } = useNotes();
  const [text, setText] = useState("");
  const [project, setProject] = useState("");
  const [recordId, setRecordId] = useState("");
  const [filter, setFilter] = useState("");

  const shown = useMemo(() => {
    const sorted = [...notes].sort((a, b) => b.at.localeCompare(a.at));
    if (!filter) return sorted;
    if (filter === "__standalone") return sorted.filter((n) => !n.projectSlug && !n.recordId);
    return sorted.filter((n) => n.projectSlug === filter);
  }, [notes, filter]);

  const recordTitle = (id: string) => data.records.find((r) => r.id === id)?.title ?? id;

  return (
    <Shell active="notes" title="Notes" stats={`${notes.length} note(s)`}
      note="Free text, attached where it belongs: to an opportunity, to a project, or to nothing at all.">
      <div className="filters">
        <label className="filter">
          <span className="muted">New note</span>
          <span className="viewsRow">
            <textarea
              className="comment wideInput"
              placeholder="Write it down before it is lost…"
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
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
                addNote(text, {
                  ...(project ? { projectSlug: project } : {}),
                  ...(recordId ? { recordId } : {}),
                });
                setText("");
              }}
            >
              add
            </button>
          </span>
        </label>
        <label className="filter">
          <span className="muted">Filter</span>
          <select value={filter} onChange={(e) => setFilter(e.target.value)}>
            <option value="">all</option>
            <option value="__standalone">standalone only</option>
            {PROJECT_ENTRIES.map((p) => (
              <option key={p.slug} value={p.slug}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="detail wide">
        {shown.length === 0 && <div className="muted">No note here yet.</div>}
        {shown.map((n) => (
          <div key={n.id} className="fact">
            <div className="noteText">{n.text}</div>
            <div className="muted small">
              {n.at.slice(0, 16).replace("T", " ")} · {n.actor}
              {n.projectSlug && <span className="pubChip tagChip">{projectName(n.projectSlug)}</span>}
              {n.recordId && ` · on: ${recordTitle(n.recordId)}`}
              <button className="ghostBtn applyBtn" onClick={() => removeNote(n.id)}>
                delete
              </button>
            </div>
          </div>
        ))}
      </div>
    </Shell>
  );
}
