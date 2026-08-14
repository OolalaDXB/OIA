"use client";

import { useMemo, useState } from "react";
import type { ConsoleData, ConsoleRecord } from "@oia/ingestion/console";
import { THESTUDIO_PROJECTS, scoreProject, type ProjectSuggestion } from "@oia/workspace";
import { Rail, KIND_LABEL } from "../Console";
import { useProjectTags } from "../../lib/workspaceStore";

/**
 * Projects surface (Phase 2) — SAME master-detail skeleton as opportunities:
 * profiles on the left, detail on the right (profile fields + tagged
 * opportunities + top suggestions with the why). Profiles are working
 * hypotheses defined in @oia/workspace/projects — correct them there.
 */
export function ProjectsView({ data }: { data: ConsoleData }) {
  const projectTags = useProjectTags();
  const [selectedSlug, setSelectedSlug] = useState(THESTUDIO_PROJECTS[0]?.slug ?? "");
  const project = THESTUDIO_PROJECTS.find((p) => p.slug === selectedSlug) ?? THESTUDIO_PROJECTS[0]!;

  const tagged = useMemo(
    () => data.records.filter((r) => projectTags.tags[r.id] === project.slug),
    [data.records, projectTags.tags, project.slug],
  );

  const suggested = useMemo(() => {
    const out: { record: ConsoleRecord; s: ProjectSuggestion }[] = [];
    for (const r of data.records) {
      if (projectTags.tags[r.id]) continue; // already decided by a human
      const s = scoreProject(r, project);
      if (s) out.push({ record: r, s });
    }
    return out.sort((a, b) => b.s.confidence - a.s.confidence).slice(0, 10);
  }, [data.records, project, projectTags.tags]);

  return (
    <div className="shell">
      <Rail active="projects" />
      <div className="app">
        <header className="hero reveal">
          <div className="heroRow">
            <h1>Projects — TheStudio</h1>
            <span className="heroStats">{THESTUDIO_PROJECTS.length} profiles · working hypotheses, edit in @oia/workspace</span>
          </div>
          <p className="heroNote">
            Profiles drive the SuggestionService. Suggestions state WHICH signals matched and are never presented as
            certainty; tagging stays a human decision, audit-logged from the opportunity detail.
          </p>
        </header>

        <div className="split">
          <ul className="queue">
            {THESTUDIO_PROJECTS.map((p) => {
              const count = data.records.filter((r) => projectTags.tags[r.id] === p.slug).length;
              return (
                <li key={p.slug} className={p.slug === project.slug ? "row selected" : "row"} onClick={() => setSelectedSlug(p.slug)}>
                  <div className="rowTop">
                    <span className="rowTitle">{p.name}</span>
                  </div>
                  <div className="rowMeta small">
                    <span>{p.sectors.join(" · ")}</span>
                    <span>{count} tagged</span>
                    <span>{p.stage}</span>
                  </div>
                </li>
              );
            })}
          </ul>

          <div className="detail">
            <div className="detailHead">
              <h2>{project.name}</h2>
              <span className="muted">{project.stage}</span>
            </div>

            <section className="sec">
              <h3>Profile (working hypothesis — review me)</h3>
              <div className="kv"><span className="k">Sectors</span><span className="v">{project.sectors.join(", ")}</span></div>
              <div className="kv"><span className="k">Geographies</span><span className="v">{project.geographies.join(", ")}</span></div>
              <div className="kv"><span className="k">Funding types</span><span className="v">{project.fundingTypes.join(", ") || "—"}</span></div>
              <div className="kv"><span className="k">Keywords</span><span className="v">{project.keywords.join(", ")}</span></div>
              <div className="kv"><span className="k">Exclusions</span><span className="v">{project.exclusions.join(", ") || "—"}</span></div>
            </section>

            <section className="sec">
              <h3>Tagged opportunities · {tagged.length}</h3>
              {tagged.length === 0 && <div className="muted">None tagged to {project.name} yet — tag from an opportunity's detail.</div>}
              {tagged.map((r) => (
                <div key={r.id} className="fact">
                  <div><b>{r.title}</b>{r.opportunityKind ? ` · ${KIND_LABEL[r.opportunityKind]}` : ""}</div>
                  <div className="muted small">{r.issuer} · {r.verificationStatus} · {r.recommendation}</div>
                </div>
              ))}
            </section>

            <section className="sec">
              <h3>Top suggestions (untagged) · {suggested.length}</h3>
              {suggested.length === 0 && <div className="muted">No untagged opportunity matches this profile's signals.</div>}
              {suggested.map(({ record, s }) => (
                <div key={record.id} className="fact">
                  <div><b>{record.title}</b> · {s.confidence}/100</div>
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
