"use client";

import { useMemo, useState } from "react";
import type { ConsoleData, ConsoleRecord } from "@oia/ingestion/console";
import { KIND_PROFILES, normalizeKind } from "@oia/ingestion/opportunity-kinds";
import {
  PROJECT_ENTRIES,
  openTasks,
  scoreProject,
  toProfile,
  type ProjectSuggestion,
} from "@oia/workspace";
import { SOURCE_REGISTRY, sourcesForProject } from "@oia/registry";
import { useLang } from "../../../lib/lang";
import { Rail, StorageNote } from "../Console";
import { useNotes, useProjectTags, useTasks, useAuditLog } from "../../../lib/workspaceStore";
import { useLinkStatus } from "../../../lib/watchData";
import { kindLabel, recommendationLabel, verificationLabel } from "../../../lib/vocabulary";
import { NewProject } from "./NewProject";
import { AddByUrl, RunSearch } from "./AddByUrl";
import { financeByProject, formatTotals } from "@oia/workspace";

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
  const { lang, toggle: toggleLang } = useLang();
  const fr = lang === "fr";
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

  const audit = useAuditLog();
  const links = useLinkStatus();
  const nowIso = useMemo(() => new Date().toISOString(), []);
  const finance = useMemo(
    () =>
      financeByProject(
        { records: data.records, tags: projectTags.tags, auditLog: audit.log, nowIso },
        [project.slug],
      )[0],
    [data.records, projectTags.tags, audit.log, nowIso, project.slug],
  );
  const sources = useMemo(() => sourcesForProject(SOURCE_REGISTRY, project.slug), [project.slug]);
  const confirmed = project.profileReview.status === "CONFIRMED_BY_OWNER";
  const discoverable = PROJECT_ENTRIES.filter((p) => p.discovery.enabled).length;

  return (
    <div className="shell">
      <Rail active="projects" />
      <div className="app">
        <header className="hero">
          <div className="heroRow">
            <h1>{lang === "fr" ? "Projets" : "Projects"}</h1>
            <span className="heroStats">
              <button
                className="langBtn"
                onClick={toggleLang}
                title={lang === "fr" ? "Switch to English" : "Passer en français"}
              >
                {lang === "fr" ? "EN" : "FR"}
              </button>{" "}
              {lang === "fr"
                ? `${PROJECT_ENTRIES.length} projets · ${discoverable} avec recherche automatique · ${
                    PROJECT_ENTRIES.filter((p) => p.profileReview.status === "CONFIRMED_BY_OWNER").length
                  } confirmés par toi`
                : `${PROJECT_ENTRIES.length} projects · ${discoverable} with automated discovery · ${
                    PROJECT_ENTRIES.filter((p) => p.profileReview.status === "CONFIRMED_BY_OWNER").length
                  } owner-confirmed`}
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
            <NewProject onDone={() => undefined} />
            <div className="detailHead">
              <h2>{project.name}</h2>
              <span className="pubChip">{project.status.toLowerCase().replace(/_/g, " ")}</span>
              <span className="muted">{project.kind.toLowerCase()}</span>
            </div>
            {project.oneLiner && <p className="oneLiner">{project.oneLiner}</p>}
            {project.url && (
              <p className="small">
                <CheckedLink url={project.url} status={links.statusOf(project.url)} />
              </p>
            )}

            <section className="sec">
              <h3>{fr ? "État de la fiche" : "Profile status"}</h3>
              <div className={confirmed ? "ok small" : "warn small"}>
                {confirmed
                  ? `Confirmed by the owner on ${project.profileReview.confirmedAt}.`
                  : "WORKING HYPOTHESIS — not confirmed by the owner. These signals steer what the system puts in front of you; correcting them is editing one file."}
              </div>
              {project.profileReview.derivedFrom.length > 0 && (
                <div className="kv">
                  <span className="k">{fr ? "Dérivée de" : "Derived from"}</span>
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
                  <span className="k">{fr ? "Note" : "Note"}</span>
                  <span className="v muted">{project.profileReview.note}</span>
                </div>
              )}
              <div className="kv">
                <span className="k">{fr ? "Modifier dans" : "Edit at"}</span>
                <span className="v">
                  <code>registry/projects/{project.slug}.yaml</code>
                </span>
              </div>
            </section>

            <section className="sec">
              <h3>{fr ? "Signaux de correspondance" : "Matching signals"}</h3>
              <div className="kv"><span className="k">{fr ? "Secteurs" : "Sectors"}</span><span className="v">{project.sectors.join(", ") || "—"}</span></div>
              <div className="kv"><span className="k">{fr ? "Géographies" : "Geographies"}</span><span className="v">{project.geographies.join(", ") || "—"}</span></div>
              <div className="kv"><span className="k">{fr ? "Types de financement" : "Funding types"}</span><span className="v">{project.fundingTypes.join(", ") || "—"}</span></div>
              <div className="kv"><span className="k">{fr ? "Mots-clés" : "Keywords"}</span><span className="v">{project.keywords.join(", ") || "—"}</span></div>
              <div className="kv"><span className="k">{fr ? "Exclusions" : "Exclusions"}</span><span className="v">{project.exclusions.join(", ") || "—"}</span></div>
              <div className="kv">
                <span className="k">{fr ? "Entité porteuse" : "Entity route"}</span>
                <span className="v">
                  {project.legalEntities.length > 0
                    ? project.legalEntities.map((e) => `${e.name} (${e.jurisdiction}, ${e.role})`).join(" · ")
                    : "— none declared"}
                </span>
              </div>
            </section>

            <section className="sec">
              <h3>{fr ? "Recherche automatique" : "Automated discovery"}</h3>
              {project.discovery.enabled ? (
                <>
                  <div className="kv">
                    <span className="k">{fr ? "Surveille" : "Watching"}</span>
                    {/* Registry entries still carry the pre-S3 labels (TENDER_RFP, */}
                    {/* VC_INVESTOR). They are remapped on read, so the screen shows */}
                    {/* the plain name rather than the stored token. */}
                    <span className="v">
                      {project.discovery.watch.map((w) => KIND_PROFILES[normalizeKind(w)].label).join(", ") || "—"}
                    </span>
                  </div>
                  <div className="kv">
                    <span className="k">{fr ? "Codes CPV" : "CPV codes"}</span>
                    <span className="v">
                      {project.discovery.cpvCodes.join(", ") || "—"}
                      {project.discovery.cpvNote && <div className="muted small">{project.discovery.cpvNote}</div>}
                    </span>
                  </div>
                  <div className="kv"><span className="k">{fr ? "Pays acheteurs" : "Buyer countries"}</span><span className="v">{project.discovery.countries.join(", ") || "any"}</span></div>
                  <div className="kv">
                    <span className="k">{fr ? "Termes de recherche" : "Query terms"}</span>
                    <span className="v">
                      {project.discovery.queryTerms.join(", ") || "—"}
                      <div className="muted small">
                        OR-ed into the query&apos;s full-text clause. That clause sits in a speculative layer: if TED
                        rejects its syntax the run drops it and retries on the proven clauses rather than failing.
                      </div>
                    </span>
                  </div>
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

            {finance && (
              <section className="sec">
                <h3>Money in play</h3>
                <div className="kv">
                  <span className="k">Could come in</span>
                  <span className="v">
                    <b>{formatTotals(finance.inbound)}</b>
                    <span className="muted small">
                      {" "}
                      · from {finance.withAmount} of {finance.records} record(s) that state a figure
                    </span>
                  </span>
                </div>
                {Object.keys(finance.clear).length > 0 && (
                  <div className="kv">
                    <span className="k">Ready to go after</span>
                    <span className="v ok">{formatTotals(finance.clear)}</span>
                  </div>
                )}
                {Object.keys(finance.outbound).length > 0 && (
                  <div className="kv">
                    <span className="k">Would go out</span>
                    <span className="v warn">{formatTotals(finance.outbound)} — acquisitions, never added above</span>
                  </div>
                )}
              </section>
            )}

            <section className="sec">
              <div className="secHead">
                <h3>Where we look for {project.name}</h3>
                <RunSearch slug={project.slug} enabled={project.discovery.enabled} />
              </div>
              {sources.map((src) => (
                <div key={src.id} className="fact">
                  <div className="viewsRow">
                    {src.url ? (
                      <a href={src.url} target="_blank" rel="noreferrer">
                        <b>{src.name}</b>
                      </a>
                    ) : (
                      <b>{src.name}</b>
                    )}
                    <span className={src.status === "LIVE" ? "pubChip okChip" : "pubChip"}>
                      {src.status === "LIVE"
                        ? "automated"
                        : src.status === "FIXTURE_ONLY"
                          ? "connector untested"
                          : src.status === "BLOCKED"
                            ? "cannot be automated"
                            : "watched by hand"}
                    </span>
                    {src.url && <LinkChip status={links.statusOf(src.url)} />}
                  </div>
                  <div className="muted small">
                    {src.kinds.map((k) => kindLabel(k, lang)).join(", ")} · {src.geographies.join(", ")}
                  </div>
                  <div className="muted small">{src.notes}</div>
                </div>
              ))}
            </section>

            <AddByUrl projectSlug={project.slug} />

            <section className="sec">
              <h3>Tagged opportunities · {tagged.length}</h3>
              {tagged.length === 0 && (
                <div className="muted">None tagged to {project.name} yet — tag from an opportunity&apos;s detail.</div>
              )}
              {tagged.map((r) => (
                <div key={r.id} className="fact">
                  <div>
                    {r.officialUrl ? (
                      <a href={r.officialUrl} target="_blank" rel="noreferrer">
                        <b>{r.title}</b>
                      </a>
                    ) : (
                      <b>{r.title}</b>
                    )}
                    {r.opportunityKind ? ` · ${kindLabel(r.opportunityKind, lang)}` : ""}
                  </div>
                  <div className="muted small">
                    {r.issuer} · {verificationLabel(r.verificationStatus, lang)} · {recommendationLabel(r.recommendation, lang)}
                    {r.officialUrl && <LinkChip status={links.statusOf(r.officialUrl)} />}
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
                    {record.officialUrl ? (
                      <a href={record.officialUrl} target="_blank" rel="noreferrer">
                        <b>{record.title}</b>
                      </a>
                    ) : (
                      <b>{record.title}</b>
                    )}{" "}
                    · {s.confidence}/100
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

/** A link, with what we know about whether it actually resolves. */
function CheckedLink({ url, status }: { url: string; status: ReturnType<typeof useLinkStatus>["statusOf"] extends (u: string) => infer R ? R : never }) {
  return (
    <span className="viewsRow">
      <a href={url} target="_blank" rel="noreferrer">
        {url}
      </a>
      <LinkChip status={status} />
    </span>
  );
}

function LinkChip({ status }: { status: { status: string; checkedAt: string; note: string } | null }) {
  if (!status) return <span className="pubChip muted" title="never checked">unchecked</span>;
  if (status.status === "DEAD" || status.status === "UNREACHABLE") {
    return (
      <span className="pubChip expiredChip" title={`${status.note} · checked ${status.checkedAt.slice(0, 10)}`}>
        broken
      </span>
    );
  }
  if (status.status === "REDIRECTED") {
    return <span className="pubChip closingChip" title={status.note}>moved</span>;
  }
  if (status.status === "OK") {
    return <span className="pubChip okChip" title={`checked ${status.checkedAt.slice(0, 10)}`}>works</span>;
  }
  return <span className="pubChip muted" title={status.note}>not conclusive</span>;
}
