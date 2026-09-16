"use client";

import { useMemo, useState } from "react";
import type { ConsoleData } from "@oia/ingestion/console";
import { PROJECT_ENTRIES, projectName } from "@oia/workspace";
import { Shell } from "../Shell";
import { useContacts } from "../../lib/workspaceStore";

/**
 * Contacts (Phase 3). Deliberately not a CRM: a name, where they sit, how to
 * reach them, and which project or opportunity they belong to. The moment it
 * needs pipelines and stages it has stopped being part of this product.
 */
export function ContactsView({ data }: { data: ConsoleData }) {
  const { contacts, addContact, removeContact } = useContacts();
  const [form, setForm] = useState({
    name: "",
    organisation: "",
    role: "",
    email: "",
    phone: "",
    note: "",
    projectSlug: "",
    recordId: "",
  });
  const [filter, setFilter] = useState("");

  const shown = useMemo(() => {
    const sorted = [...contacts].sort((a, b) => a.name.localeCompare(b.name));
    return filter ? sorted.filter((c) => c.projectSlug === filter) : sorted;
  }, [contacts, filter]);

  const set = (k: keyof typeof form) => (e: { target: { value: string } }) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const recordTitle = (id: string) => data.records.find((r) => r.id === id)?.title ?? id;

  return (
    <Shell
      active="contacts"
      title="Contacts"
      stats={`${contacts.length} contact(s)`}
      note="Who to talk to, and about what. Stored in this browser like every other human-layer record — back it up."
    >
      <div className="filters">
        <label className="filter">
          <span className="muted">New contact</span>
          <span className="viewsRow contactForm">
            <input className="comment inputLine" placeholder="Name" value={form.name} onChange={set("name")} />
            <input className="comment inputLine" placeholder="Organisation" value={form.organisation} onChange={set("organisation")} />
            <input className="comment inputLine" placeholder="Role" value={form.role} onChange={set("role")} />
            <input className="comment inputLine" placeholder="Email" value={form.email} onChange={set("email")} />
            <input className="comment inputLine" placeholder="Phone" value={form.phone} onChange={set("phone")} />
            <select value={form.projectSlug} onChange={set("projectSlug")}>
              <option value="">no project</option>
              {PROJECT_ENTRIES.map((p) => (
                <option key={p.slug} value={p.slug}>
                  {p.name}
                </option>
              ))}
            </select>
            <select value={form.recordId} onChange={set("recordId")}>
              <option value="">no opportunity</option>
              {data.records.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.title.slice(0, 60)}
                </option>
              ))}
            </select>
            <input className="comment inputLine wideInput" placeholder="Note" value={form.note} onChange={set("note")} />
            <button
              className="ghostBtn"
              onClick={() => {
                addContact({
                  name: form.name,
                  ...(form.organisation ? { organisation: form.organisation } : {}),
                  ...(form.role ? { role: form.role } : {}),
                  ...(form.email ? { email: form.email } : {}),
                  ...(form.phone ? { phone: form.phone } : {}),
                  ...(form.note ? { note: form.note } : {}),
                  ...(form.projectSlug ? { projectSlug: form.projectSlug } : {}),
                  ...(form.recordId ? { recordId: form.recordId } : {}),
                });
                setForm({ name: "", organisation: "", role: "", email: "", phone: "", note: "", projectSlug: form.projectSlug, recordId: "" });
              }}
            >
              add
            </button>
          </span>
        </label>
        <label className="filter">
          <span className="muted">Project</span>
          <select value={filter} onChange={(e) => setFilter(e.target.value)}>
            <option value="">all</option>
            {PROJECT_ENTRIES.map((p) => (
              <option key={p.slug} value={p.slug}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="detail wide">
        {shown.length === 0 && <div className="muted">No contact here yet.</div>}
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
              {c.phone}
            </div>
            {c.note && <div className="muted small">{c.note}</div>}
            <div className="muted small">
              added {c.at.slice(0, 10)}
              {c.recordId && ` · on: ${recordTitle(c.recordId)}`}
              <button className="ghostBtn applyBtn" onClick={() => removeContact(c.id)}>
                delete
              </button>
            </div>
          </div>
        ))}
      </div>
    </Shell>
  );
}
