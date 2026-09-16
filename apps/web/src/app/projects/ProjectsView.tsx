"use client";

import { useMemo, useState } from "react";
import type { ConsoleData, ConsoleRecord } from "@oia/ingestion/console";
import {
  PROJECT_ENTRIES,
  openTasks,
  scoreProject,
  toProfile,
  type ProjectSuggestion,
} from "@oia/workspace";
import { Rail, KIND_LABEL, StorageNote } from "../Console";
import { useNotes, useProjectTags, useTasks } from "../../lib/workspaceStore";

/**
 * Projects — every project the studio runs, from `registry/projects/*.yaml`.
 * Same master-detail skeleton as opportunities: profiles on the left, detail on
 * the right (identity, matching signals, discovery config, tagged
 * opportunities, suggestions with the why, and the project's own notes and
 * tasks).
 *
 * A profile that the owner has not confirmed is shown as what it is: a working
 * hypothesis, with the source it was derived from. Correct it in one YAML file.
 */
export function ProjectsView({ data }: { data: ConsoleData }) {
  const projectTags = useProjectTags();
  const { tasks } = useTasks();
  const { notes } = useNotes();
  const [selectedSlug, setSelectedSlug] = useState(PROJECT_ENTRIES[0]?.slug ?? "");
  const project = PROJECT_ENTRIES.find((p) => p.slug === selectedSlug) ?? PROJECT_ENTRIES[0]!;

  const tagged = useMemo(
    () => data.records.filter((r) => projectTags.tags[r.id] === project.slug),
    [data.records, projectTags.tags, project.slug],
  );

  const suggested = useMemo(() => {
    const profile = toProfile(project);
    const out: { record: ConsoleRecord; s: ProjectSuggestion }[] = [];
    for (const r of data.records) {
      if (projectTags.tags[r.id]) continue; // already decided by a human
      const s = scoreProject(r, profile);
      if (s) out.push({ record: r, s });
    }
    return out.sort((a, b) => b.s.confidence - a.s.confidence).slice(0, 10);
  }, [data.records, project, projectTags.tags]);

  const projectTasks = useMemo(
    () =>
      openTasks(
        tasks.filter(
          (t) => t.projectSlug === project.slug || (t.recordId ? projectTags.tags[t.recordId] === project.slug : false),
        ),
      ),
    [tasks, project.slug, projectTags.tags],
  );
  const projectNotes = useMemo(
    () =>
      notes
        .filter((n) => n.projectSlug === project.slug || (n.recordId ? projectTags.tags[n.recordId] === project.slug : false))
        .sort((a, b) => b.at.localeCompare(a.at)),
    [notes, project.slug, projectTags.tags],
  );

  const confirmed = project.profileReview.status === "CONFIRMED_BY_OWNER";
  const discoverable = PROJECT_ENTRIES.filter((p) => p.discovery.enabled).length;

  return (
    <div className="shell">
      <Rail active="projects" />
      <div className="app">
        <header className="hero">
          <div className="heroRow">
            <h1>Projects</h1>
            <span className="heroStats">
              {PROJECT_ENTRIES.length} projects · {discoverable} with automated discovery ·{" "}
              {PROJECT_ENTRIES.filter((p) => p.profileReview.status === "CONFIRMED_BY_OWNER").length} owner-confirmed
            </span>
          </div>
          <p className="heroNote">
            One YAML file per project in <code>registry/projects/</code> — the source of truth for matching signals and
            discovery. Adding next year&apos;s project is adding one file. Suggestions state WHICH signals matched and
            are never certainty; tagging stays a human decision, audit-logged from the opportunity detail.
          </p>
        </header>
        <StorageNote />

        <div className="split">
          <ul className="queue">
            {PROJECT_ENTRIES.map((p) => {
              const count = data.records.filter((r) => projectTags.tags[r.id] === p.slug).length;
              return (
                <li
                  key={p.slug}
                  className={p.slug === project.slug ? "row selected" : "row"}
                  onClick={() => setSelectedSlug(p.slug)}
                >
                  <div className="rowTop">
                    <span className="rowTitle">{p.name}</span>
                    <span className="pubChip">{p.status.toLowerCase().replace(/_/g, " ")}</span>
                  </div>
                  <div className="rowMeta small">
                    <span>{p.kind.toLowerCase()}</span>
                    <span>{count} tagged</span>
                    <span>{p.discovery.enabled ? "discovery on" : "manual"}</span>
                  </div>
                </li>
              );
            })}
          </ul>

          <div className="detail">
            <div className="detailHead">
              <h2>{project.name}</h2>
              <span className="pubChip">{project.status.toLowerCase().replace(/_/g, " ")}</span>
              <span className="muted">{project.kind.toLowerCase()}</span>
            </div>
            {project.oneLiner && <p className="oneLiner">{project.oneLiner}</p>}
            {project.url && (
              <p className="small">
                <a href={project.url} target="_blank" rel="noreferrer">
                  {project.url}
                </a>
              </p>
            )}

            <section className="sec">
              <h3>Profile status</h3>
              <div className={confirmed ? "ok small" : "warn small"}>
                {confirmed
                  ? `Confirmed by the owner on ${project.profileReview.confirmedAt}.`
                  : "WORKING HYPOTHESIS — not confirmed by the owner. These signals steer what the system puts in front of you; correcting them is editing one file."}
              </div>
              {project.profileReview.derivedFrom.length > 0 && (
                <div className="kv">
                  <span className="k">Derived from</span>
                  <span className="v">
                    <ul className="evi small">
                      {project.profileReview.derivedFrom.map((d, i) => (
                        <li key={i} className="muted">
                          {d}
                        </li>
                      ))}
                    </ul>
                  </span>
                </div>
              )}
              {project.profileReview.note && (
                <div className="kv">
                  <span className="k">Note</span>
                  <span className="v muted">{project.profileReview.note}</span>
                </div>
              )}
              <div className="kv">
                <span className="k">Edit at</span>
                <span className="v">
                  <code>registry/projects/{project.slug}.yaml</code>
                </span>
              </div>
            </section>

            <section className="sec">
              <h3>Matching signals</h3>
              <div className="kv"><span className="k">Sectors</span><span className="v">{project.sectors.join(", ") || "—"}</span></div>
              <div className="kv"><span className="k">Geographies</span><span className="v">{project.geographies.join(", ") || "—"}</span></div>
              <div className="kv"><span className="k">Funding types</span><span className="v">{project.fundingTypes.join(", ") || "—"}</span></div>
              <div className="kv"><span className="k">Keywords</span><span className="v">{project.keywords.join(", ") || "—"}</span></div>
              <div className="kv"><span className="k">Exclusions</span><span className="v">{project.exclusions.join(", ") || "—"}</span></div>
              <div className="kv">
                <span className="k">Entity route</span>
                <span className="v">
                  {project.legalEntities.length > 0
                    ? project.legalEntities.map((e) => `${e.name} (${e.jurisdiction}, ${e.role})`).join(" · ")
                    : "— none declared"}
                </span>
              </div>
            </section>

            <section className="sec">
              <h3>Automated discovery</h3>
              {project.discovery.enabled ? (
                <>
                  <div className="kv"><span className="k">Watching</span><span className="v">{project.discovery.watch.join(", ")}</span></div>
                  <div className="kv"><span className="k">CPV codes</span><span className="v">{project.discovery.cpvCodes.join(", ") || "—"}</span></div>
                  <div className="kv"><span className="k">Buyer countries</span><span className="v">{project.discovery.countries.join(", ") || "any"}</span></div>
                  <div className="kv"><span className="k">Query terms</span><span className="v">{project.discovery.queryTerms.join(", ") || "—"}</span></div>
                  <div className="muted small">
                    Runs with <code>pnpm --filter @oia/workers discover:ted -- --project {project.slug}</code> (needs
                    network egress).
                  </div>
                </>
              ) : (
                <div className="muted">
                  Off — this project is tracked in the workspace but no automated query runs for it. An honest state,
                  not a silent no-op: turn it on in the registry when a real source covers it.
                </div>
              )}
            </section>

            <section className="sec">
              <h3>Tagged opportunities · {tagged.length}</h3>
              {tagged.length === 0 && (
                <div className="muted">None tagged to {project.name} yet — tag from an opportunity&apos;s detail.</div>
              )}
              {tagged.map((r) => (
                <div key={r.id} className="fact">
                  <div>
                    <b>{r.title}</b>
                    {r.opportunityKind ? ` · ${KIND_LABEL[r.opportunityKind]}` : ""}
                  </div>
                  <div className="muted small">
                    {r.issuer} · {r.verificationStatus} · {r.recommendation}
                  </div>
                </div>
              ))}
            </section>

            <section className="sec">
              <h3>Open tasks · {projectTasks.length}</h3>
              {projectTasks.length === 0 && <div className="muted">Nothing owed on this project.</div>}
              {projectTasks.map((t) => (
                <div key={t.id} className="fact">
                  <div>{t.title}</div>
                  <div className="muted small">{t.due ? `due ${t.due}` : "no due date"}</div>
                </div>
              ))}
            </section>

            <section className="sec">
              <h3>Notes · {projectNotes.length}</h3>
              {projectNotes.length === 0 && <div className="muted">No note on this project.</div>}
              {projectNotes.map((n) => (
                <div key={n.id} className="fact">
                  <div className="noteText">{n.text}</div>
                  <div className="muted small">
                    {n.at.slice(0, 10)} · {n.actor}
                  </div>
                </div>
              ))}
            </section>

            <section className="sec">
              <h3>Top suggestions (untagged) · {suggested.length}</h3>
              {suggested.length === 0 && <div className="muted">No untagged opportunity matches this profile&apos;s signals.</div>}
              {suggested.map(({ record, s }) => (
                <div key={record.id} className="fact">
                  <div>
                    <b>{record.title}</b> · {s.confidence}/100
                  </div>
                  <div className="muted small">{s.rationale}</div>
                </div>
              ))}
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}
