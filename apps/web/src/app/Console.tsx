"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { ConsoleData, ConsoleRecord, OpportunityKind } from "@oia/ingestion/console";
import {
  PROJECT_ENTRIES,
  projectName,
  recordsToCsv,
  recordsToMarkdown,
  scoreProject,
  toProfile,
  type ProjectSuggestion,
  type ReviewAction,
  type TaskItem,
} from "@oia/workspace";
import { applyFreshnessAll, assessFreshness } from "@oia/ingestion/freshness";
import { classifyNoticeType, skipReason } from "@oia/connectors/notice-type";
import { useAlerts, useLedger } from "../lib/watchData";
import { useAuth } from "../lib/supabase";
import {
  download,
  useAttachedNotes,
  useAuditLog,
  useProjectTags,
  useSavedViews,
  useStorageInfo,
  useTasks,
  useWorkspaceBackup,
} from "../lib/workspaceStore";

type FactClass =
  | "CONFIRMED_OFFICIAL"
  | "EXTRACTED_FROM_OFFICIAL_SOURCE"
  | "INFERRED"
  | "USER_PROVIDED"
  | "UNKNOWN";

const RECO_COLOR: Record<string, string> = {
  PURSUE: "var(--pursue)",
  PARTNER: "var(--partner)",
  INVESTIGATE: "var(--investigate)",
  MONITOR: "var(--monitor)",
  REJECT: "var(--reject)",
};
const PROV_COLOR: Record<FactClass, string> = {
  CONFIRMED_OFFICIAL: "var(--pursue)",
  EXTRACTED_FROM_OFFICIAL_SOURCE: "var(--partner)",
  INFERRED: "var(--investigate)",
  USER_PROVIDED: "var(--muted)",
  UNKNOWN: "var(--muted)",
};
const CONFIRMED: FactClass[] = ["CONFIRMED_OFFICIAL", "EXTRACTED_FROM_OFFICIAL_SOURCE"];
const FACT_ORDER: FactClass[] = ["CONFIRMED_OFFICIAL", "EXTRACTED_FROM_OFFICIAL_SOURCE", "INFERRED", "USER_PROVIDED", "UNKNOWN"];

export const KIND_LABEL: Record<OpportunityKind, string> = {
  GRANT: "Grant",
  TENDER_RFP: "Tender / RFP",
  VC_INVESTOR: "Investor",
  REGULATORY: "Regulatory",
};
const KIND_COLOR: Record<OpportunityKind, string> = {
  GRANT: "var(--pursue)",
  TENDER_RFP: "var(--partner)",
  VC_INVESTOR: "var(--monitor)",
  REGULATORY: "var(--investigate)",
};

export type RailKey =
  | "dashboard"
  | "digest"
  | "alerts"
  | "grants"
  | "tenders"
  | "investors"
  | "projects"
  | "tasks"
  | "notes"
  | "contacts"
  | "metrics";

/**
 * Shared workspace rail — one shell for every surface. Every kind the Phase 1
 * skeleton declared is now a real destination: notes, tasks and contacts stopped
 * being greyed-out promises in Phase 3.
 */
export function Rail({ active, onExportAudit }: { active: RailKey; onExportAudit?: () => void }) {
  // The badge is the whole point of a permanent watch: the number is visible
  // before you decide to go looking.
  const { open } = useAlerts();
  const nav: { key: RailKey; label: string; href: string; group?: boolean }[] = [
    { key: "digest", label: "Today", href: "/digest/" },
    { key: "alerts", label: "Alerts", href: "/alerts/" },
    { key: "dashboard", label: "Dashboard", href: "/" },
    { key: "grants", label: "Grants", href: "/grants/" },
    { key: "tenders", label: "Tenders / RFP", href: "/tenders/" },
    { key: "investors", label: "Investors", href: "/investors/" },
    { key: "projects", label: "Projects", href: "/projects/", group: true },
    { key: "tasks", label: "Tasks", href: "/tasks/" },
    { key: "notes", label: "Notes", href: "/notes/" },
    { key: "contacts", label: "Contacts", href: "/contacts/" },
    { key: "metrics", label: "Metrics", href: "/metrics/", group: true },
  ];
  return (
    <aside className="rail">
      <div className="railBrand">OIA</div>
      {nav.map((n) => (
        <Link
          key={n.key}
          href={n.href}
          className={`${active === n.key ? "railItem active" : "railItem"}${n.group ? " railGroup" : ""}`}
        >
          <span>{n.label}</span>
          {n.key === "alerts" && open.length > 0 && <span className="railBadge">{open.length}</span>}
        </Link>
      ))}
      {onExportAudit && (
        <div className="railFoot">
          <button className="ghostBtn" onClick={onExportAudit}>Export audit</button>
        </div>
      )}
    </aside>
  );
}

/** Where the human layer lives — stated, never implied. */
export function StorageNote() {
  const info = useStorageInfo();
  const backup = useWorkspaceBackup();
  const { state, signOut } = useAuth();
  const [pending, setPending] = useState(0);
  const [migration, setMigration] = useState<string | null>(null);

  // Only offered when this browser still holds decisions the database does not.
  useEffect(() => {
    if (info.remote) setPending(backup.localCount());
  }, [info.remote, backup]);

  return (
    <div className="storageNote">
      <span className="muted small">
        {info.remote
          ? "Reviews, tags, notes, tasks and contacts are stored in the watch database — durable, and readable from another device."
          : info.durability === "BROWSER_LOCAL"
            ? "Reviews, tags, notes, tasks and contacts are stored in THIS browser only — no server, no sync. Back them up."
            : "No browser storage available: this session keeps nothing."}
        {migration && <span className="ok"> · {migration}</span>}
      </span>
      <span className="viewsRow">
        {info.remote && pending > 0 && (
          <button
            className="ghostBtn"
            onClick={async () => {
              setMigration("migrating…");
              try {
                const r = await backup.migrateLocalToDatabase();
                setMigration(
                  `migrated ${r.reviews} review(s), ${r.tags} tag(s), ${r.notes} note(s), ${r.tasks} task(s), ${r.contacts} contact(s)`,
                );
                setPending(0);
              } catch (e) {
                setMigration(`migration failed: ${(e as Error).message}`);
              }
            }}
          >
            move {pending} local item(s) to the database
          </button>
        )}
        <button className="ghostBtn" onClick={backup.exportAll}>backup</button>
        {!info.remote && (
          <label className="ghostBtn restoreBtn">
            restore
            <input
              type="file"
              accept="application/json"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void backup.importAll(file);
              }}
            />
          </label>
        )}
        {state.status === "SIGNED_IN" && (
          <button className="ghostBtn" onClick={() => void signOut()} title={state.email}>
            sign out
          </button>
        )}
      </span>
    </div>
  );
}

function Badge({ text, color }: { text: string; color: string }) {
  return (
    <span className="badge" style={{ borderColor: color, color }}>
      {text}
    </span>
  );
}

function appDeadline(r: ConsoleRecord): string {
  const app = r.deadlines.find((d) => d.deadlineType === "APPLICATION" && d.normalized);
  return app?.normalized ?? r.deadlines.find((d) => d.normalized)?.normalized ?? "—";
}

/** Publication date read from the provenance-typed facts (TED metadata). */
function pubDate(r: ConsoleRecord): string {
  const f = r.facts.find((x) => x.field === "publication-date");
  return f ? f.normalizedValue.slice(0, 10) : "";
}

const uniq = (xs: string[]) => [...new Set(xs)];

/**
 * What TED said this notice is. Records discovered before the classification
 * existed still carry the raw `notice-type` fact, so the console can now name
 * what it is — rather than rewriting a real run's output to look tidier.
 */
function noticeAside(r: ConsoleRecord): string | null {
  const noticeType = r.facts.find((f) => f.field === "notice-type")?.normalizedValue;
  return noticeType ? skipReason(noticeType) : null;
}

export function Console({
  data,
  fixedKind,
  active,
  title,
}: {
  data: ConsoleData;
  /** Set on /grants, /tenders, /investors — same shell, kind-scoped queue. */
  fixedKind?: OpportunityKind;
  active: RailKey;
  title: string;
}) {
  // One clock for the whole render: freshness must not shift between the row
  // and the detail of the same record.
  const nowIso = useMemo(() => new Date().toISOString(), []);
  const audit = useAuditLog();
  const savedViews = useSavedViews();
  const projectTags = useProjectTags();
  const notes = useAttachedNotes();
  const tasks = useTasks();

  // The permanent ledger when there is one, the bundled snapshot otherwise —
  // and the header says which, because a stale snapshot presented as live data
  // is the failure this product exists to avoid.
  const ledger = useLedger(data);

  // Expiry is re-checked on every read, not at generation time: a shortlist
  // generated last month must not still present a closed call as pursuable.
  // applyFreshness only ever removes — it can close a gate condition, never open one.
  const records = useMemo(() => {
    const scoped = fixedKind ? ledger.records.filter((r) => r.opportunityKind === fixedKind) : ledger.records;
    return applyFreshnessAll(scoped, nowIso);
  }, [ledger.records, fixedKind, nowIso]);

  const [selectedId, setSelectedId] = useState<string>("");
  const [fKind, setFKind] = useState("");
  const [fReco, setFReco] = useState("");
  const [fVerif, setFVerif] = useState("");
  const [fRoute, setFRoute] = useState("");
  const [fReview, setFReview] = useState("");
  const [fProject, setFProject] = useState("");
  const [fFresh, setFFresh] = useState("");
  const [sortKey, setSortKey] = useState("pubDate:desc");

  const filtered = useMemo(() => {
    const xs = records.filter(
      (r) =>
        (!fKind || (r.opportunityKind ?? "GRANT") === fKind) &&
        (!fReco || r.recommendation === fReco) &&
        (!fVerif || r.verificationStatus === fVerif) &&
        (!fRoute || r.strategicRoute === fRoute) &&
        (!fReview || audit.statusFor(r.id) === fReview) &&
        (!fProject ||
          (fProject === "__untagged" ? !projectTags.tags[r.id] : projectTags.tags[r.id] === fProject)) &&
        (!fFresh || assessFreshness(r, nowIso).status === fFresh),
    );
    const [field, dir] = sortKey.split(":");
    const mul = dir === "asc" ? 1 : -1;
    return [...xs].sort((a, b) => {
      if (field === "confidence") return mul * (a.scores.infoConfidence - b.scores.infoConfidence);
      if (field === "title") return mul * a.title.localeCompare(b.title);
      if (field === "deadline") return mul * appDeadline(a).localeCompare(appDeadline(b));
      return mul * pubDate(a).localeCompare(pubDate(b)); // pubDate default
    });
  }, [records, fKind, fReco, fVerif, fRoute, fReview, fProject, fFresh, sortKey, audit, projectTags.tags, nowIso]);

  const selected = records.find((r) => r.id === selectedId) ?? filtered[0];

  const opt = (xs: string[]) => uniq(xs).sort();

  const applyView = (id: string) => {
    const v = savedViews.views.find((x) => x.id === id);
    if (!v) return;
    setFKind(v.filters.kind ?? "");
    setFReco(v.filters.reco ?? "");
    setFVerif(v.filters.verif ?? "");
    setFRoute(v.filters.route ?? "");
    setFReview(v.filters.review ?? "");
    setFProject(v.filters.project ?? "");
    setFFresh(v.filters.fresh ?? "");
    setSortKey(`${v.sortField}:${v.sortDirection}`);
  };

  const saveCurrentView = () => {
    const name = window.prompt("Name this view");
    if (!name?.trim()) return;
    const [sortField, sortDirection] = sortKey.split(":");
    savedViews.saveView(
      name.trim(),
      { kind: fKind, reco: fReco, verif: fVerif, route: fRoute, review: fReview, project: fProject, fresh: fFresh },
      sortField ?? "pubDate",
      (sortDirection as "asc" | "desc") ?? "desc",
    );
  };

  const exportCtx = {
    auditLog: audit.log,
    tags: projectTags.tags,
    projectName,
    nowIso,
  };
  const stamp = nowIso.slice(0, 10);
  const exportCsv = () =>
    download(`oia-shortlist-${stamp}.csv`, recordsToCsv(filtered, exportCtx), "text/csv");
  const exportMarkdown = () =>
    download(
      `oia-shortlist-${stamp}.md`,
      recordsToMarkdown(filtered, exportCtx, `${title} — ${stamp}`),
      "text/markdown",
    );

  return (
    <div className="shell">
      <Rail active={active} onExportAudit={audit.exportLog} />

      <div className="app">
        {/* Envelope: hero band gets the treatment; the triage table below stays native. */}
        <header className="hero">
          <div className="heroRow">
            <h1>{title}</h1>
            <span className="heroStats">
              {ledger.source === "LEDGER" ? "watch ledger" : "bundled snapshot"} ·{" "}
              {records.length} shown / {ledger.records.length} total · {data.run.discrepancies} discrepancies ·{" "}
              {Object.entries(data.run.recommendationCounts)
                .map(([k, v]) => `${k}:${v}`)
                .join("  ")}
            </span>
          </div>
          {data.note && <p className="heroNote">{data.note}</p>}
        </header>

        <div className="filters">
          {!fixedKind && (
            <label className="filter">
              <span className="muted">Kind</span>
              <select value={fKind} onChange={(e) => setFKind(e.target.value)}>
                <option value="">all</option>
                {(Object.keys(KIND_LABEL) as OpportunityKind[]).map((k) => (
                  <option key={k} value={k}>{KIND_LABEL[k]}</option>
                ))}
              </select>
            </label>
          )}
          <Select label="Recommendation" value={fReco} onChange={setFReco} options={opt(records.map((r) => r.recommendation))} />
          <Select label="Verification" value={fVerif} onChange={setFVerif} options={opt(records.map((r) => r.verificationStatus))} />
          <Select label="Route" value={fRoute} onChange={setFRoute} options={opt(records.map((r) => r.strategicRoute))} />
          <Select label="Human review" value={fReview} onChange={setFReview} options={["PENDING", "APPROVE", "REJECT", "NEEDS_VERIFICATION"]} />
          <label className="filter">
            <span className="muted">Project</span>
            <select value={fProject} onChange={(e) => setFProject(e.target.value)}>
              <option value="">all</option>
              <option value="__untagged">untagged</option>
              {PROJECT_ENTRIES.map((p) => (
                <option key={p.slug} value={p.slug}>{p.name}</option>
              ))}
            </select>
          </label>
          <label className="filter">
            <span className="muted">Sort</span>
            <select value={sortKey} onChange={(e) => setSortKey(e.target.value)}>
              <option value="pubDate:desc">publication ↓ (recent first)</option>
              <option value="pubDate:asc">publication ↑</option>
              <option value="deadline:asc">deadline ↑</option>
              <option value="confidence:desc">confidence ↓</option>
              <option value="title:asc">title A→Z</option>
            </select>
          </label>
          <Select
            label="Freshness"
            value={fFresh}
            onChange={setFFresh}
            options={["FRESH", "CLOSING_SOON", "EXPIRED", "NO_DEADLINE"]}
          />
          <label className="filter">
            <span className="muted">Export ({filtered.length})</span>
            <span className="viewsRow">
              <button className="ghostBtn" onClick={exportCsv}>csv</button>
              <button className="ghostBtn" onClick={exportMarkdown}>markdown</button>
            </span>
          </label>
          <label className="filter">
            <span className="muted">Saved views</span>
            <span className="viewsRow">
              <select defaultValue="" onChange={(e) => { applyView(e.target.value); e.target.value = ""; }}>
                <option value="" disabled>{savedViews.views.length ? "apply…" : "none yet"}</option>
                {savedViews.views.map((v) => (
                  <option key={v.id} value={v.id}>{v.name}</option>
                ))}
              </select>
              <button className="ghostBtn" onClick={saveCurrentView}>save view</button>
            </span>
          </label>
        </div>

        <div className="split">
          {/* LEFT — triage queue: dense, native scroll, no animation. */}
          <ul className="queue">
            {filtered.map((r) => {
              const rev = audit.statusFor(r.id);
              const tag = projectTags.tags[r.id];
              const kind = r.opportunityKind;
              const fresh = assessFreshness(r, nowIso);
              const aside = noticeAside(r);
              return (
                <li
                  key={r.id}
                  className={r.id === selected?.id ? "row selected" : "row"}
                  onClick={() => setSelectedId(r.id)}
                >
                  <div className="rowTop">
                    <Badge text={r.recommendation} color={RECO_COLOR[r.recommendation] ?? "#888"} />
                    {kind && !fixedKind && <Badge text={KIND_LABEL[kind]} color={KIND_COLOR[kind]} />}
                    <span className="rowTitle">{r.title}</span>
                  </div>
                  <div className="rowMeta">
                    <span>{r.issuer}</span>
                    {pubDate(r) && <span className="pubChip">{pubDate(r)}</span>}
                    {(fresh.status === "CLOSING_SOON" || fresh.status === "EXPIRED") && (
                      <span className={fresh.status === "EXPIRED" ? "pubChip expiredChip" : "pubChip closingChip"}>
                        {fresh.status === "EXPIRED" ? "closed" : `closes in ${fresh.daysToDeadline}d`}
                      </span>
                    )}
                    {aside && <span className="pubChip asideChip">not a call</span>}
                    {tag && <span className="pubChip tagChip">{projectName(tag)}</span>}
                  </div>
                  <div className="rowMeta small">
                    <span>{r.verificationStatus}</span>
                    {r.strategicRoute !== "UNKNOWN" && <span>{r.strategicRoute}</span>}
                    {appDeadline(r) !== "—" && <span>due {appDeadline(r)}</span>}
                    <span>fetch {r.liveFetch?.status ?? "—"}</span>
                    <span>conf {r.scores.infoConfidence}</span>
                    <span className={rev === "PENDING" ? "muted" : "hrOn"}>{rev}</span>
                  </div>
                </li>
              );
            })}
            {filtered.length === 0 && <li className="row muted">No record matches (or none of this kind yet).</li>}
          </ul>

          {/* RIGHT — detail */}
          {selected && (
            <div className="detail">
              <Detail
                record={selected}
                reviewStatus={audit.statusFor(selected.id)}
                events={audit.eventsFor(selected.id)}
                projectTag={projectTags.tags[selected.id] ?? ""}
                onTag={(slug) => {
                  projectTags.setTag(selected.id, slug);
                  audit.append(
                    selected.id,
                    "COMMENT",
                    `project tag → ${slug || "(untagged)"}`,
                    !!selected.gate?.pursueEligible,
                  );
                }}
                notes={notes.notesFor(selected.id)}
                onAddNote={(text) => notes.addNote(selected.id, text)}
                tasks={tasks.tasksFor(selected.id)}
                onAddTask={(title, due) =>
                  tasks.addTask(title, {
                    recordId: selected.id,
                    ...(due ? { due } : {}),
                    ...(projectTags.tags[selected.id] ? { projectSlug: projectTags.tags[selected.id]! } : {}),
                  })
                }
                onToggleTask={tasks.toggle}
                nowIso={nowIso}
                onReview={(action, comment) =>
                  audit.append(selected.id, action, comment, !!selected.gate?.pursueEligible)
                }
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Select({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: string[] }) {
  return (
    <label className="filter">
      <span className="muted">{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">all</option>
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </label>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="sec">
      <h3>{title}</h3>
      {children}
    </section>
  );
}

function KV({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="kv">
      <span className="k">{k}</span>
      <span className="v">{v}</span>
    </div>
  );
}

function Detail({
  record: r,
  reviewStatus,
  events,
  projectTag,
  onTag,
  notes,
  onAddNote,
  tasks,
  onAddTask,
  onToggleTask,
  nowIso,
  onReview,
}: {
  record: ConsoleRecord;
  reviewStatus: ReviewAction | "PENDING";
  events: { id: string; action: string; comment: string; at: string; actor: string; gatePursueEligibleAtDecision: boolean }[];
  projectTag: string;
  onTag: (slug: string) => void;
  notes: { id: string; text: string; at: string; actor: string }[];
  onAddNote: (text: string) => void;
  tasks: TaskItem[];
  onAddTask: (title: string, due: string) => void;
  onToggleTask: (task: TaskItem) => void;
  nowIso: string;
  onReview: (action: ReviewAction, comment: string) => void;
}) {
  const [comment, setComment] = useState("");
  const [noteDraft, setNoteDraft] = useState("");
  const [taskDraft, setTaskDraft] = useState("");
  const [taskDue, setTaskDue] = useState("");
  const gate = r.gate;
  const canPursue = !!gate?.pursueEligible;
  const freshness = assessFreshness(r, nowIso);

  const suggestions: ProjectSuggestion[] = useMemo(
    () =>
      PROJECT_ENTRIES.map((p) => scoreProject(r, toProfile(p)))
        .filter((x): x is ProjectSuggestion => x !== null)
        .sort((a, b) => b.confidence - a.confidence)
        .slice(0, 5),
    [r],
  );

  const factsBy = (c: FactClass) => r.facts.filter((f) => (f.classification as FactClass) === c);

  return (
    <div>
      <div className="detailHead">
        <Badge text={r.recommendation} color={RECO_COLOR[r.recommendation] ?? "#888"} />
        {r.opportunityKind && <Badge text={KIND_LABEL[r.opportunityKind]} color={KIND_COLOR[r.opportunityKind]} />}
        <h2>{r.title}</h2>
        <span className="muted">{r.issuer}</span>
        {pubDate(r) && <span className="pubChip">published {pubDate(r)}</span>}
        <span
          className={
            freshness.status === "EXPIRED"
              ? "pubChip expiredChip"
              : freshness.status === "CLOSING_SOON"
                ? "pubChip closingChip"
                : "pubChip"
          }
        >
          {freshness.status.toLowerCase().replace("_", " ")}
        </span>
      </div>

      {noticeAside(r) && (
        <div className="warn small">
          TED notice type <code>{r.facts.find((f) => f.field === "notice-type")?.normalizedValue}</code> —{" "}
          {noticeAside(r)}. Discovery now filters these out at the source; this record predates that filter and is
          kept rather than deleted, because it is the real output of a real run.
        </div>
      )}
      {freshness.reasons.length > 0 && (
        <div className={freshness.status === "EXPIRED" ? "warn small" : "muted small"}>
          {freshness.reasons.join(" · ")}
        </div>
      )}

      {r.discrepancies.length > 0 && (
        <Section title={`Discrepancies (seed vs observed) · ${r.discrepancies.length}`}>
          {r.discrepancies.map((d, i) => (
            <div key={i} className="disc">
              <b>{d.field}</b>: seed <code>{d.seedExpectation}</code> vs observed <code>{d.observed}</code>
              <div className="muted small">{d.evidence} · rule {d.ruleApplied} · human review {d.humanReviewRequired ? "YES" : "no"}</div>
            </div>
          ))}
        </Section>
      )}

      <Section title="TheStudio project">
        {r.discoveredFor && r.discoveredFor.length > 0 && (
          <KV
            k="Discovered for"
            v={
              <span>
                {r.discoveredFor.map((slug) => projectName(slug)).join(", ")}
                <div className="muted small">
                  The project queries that surfaced this notice — discovery provenance, not a match verdict.
                </div>
              </span>
            }
          />
        )}
        <KV
          k="Tagged project"
          v={
            <span className="viewsRow">
              <select value={projectTag} onChange={(e) => onTag(e.target.value)}>
                <option value="">— untagged —</option>
                {PROJECT_ENTRIES.map((p) => (
                  <option key={p.slug} value={p.slug}>{p.name}</option>
                ))}
              </select>
              <span className="muted small">(a human decision — tagging is audit-logged)</span>
            </span>
          }
        />
        {suggestions.length === 0 ? (
          <div className="muted small">No suggestion: no project profile signal matches this record (honest silence).</div>
        ) : (
          suggestions.map((s) => {
            const p = PROJECT_ENTRIES.find((x) => x.slug === s.projectSlug);
            return (
              <div key={s.projectSlug} className="fact">
                <div>
                  <b>{p?.name ?? s.projectSlug}</b> · suggested {s.confidence}/100
                  {p?.profileReview.status === "DRAFT" && (
                    <span className="muted small"> · profile unconfirmed</span>
                  )}
                  {projectTag !== s.projectSlug && (
                    <button className="ghostBtn applyBtn" onClick={() => onTag(s.projectSlug)}>tag it</button>
                  )}
                </div>
                <div className="muted small">{s.rationale}</div>
              </div>
            );
          })
        )}
      </Section>

      <Section title="Sources">
        <KV k="Official source" v={r.officialUrl ? <a href={r.officialUrl} target="_blank" rel="noreferrer">{r.officialUrl}</a> : <span className="muted">—</span>} />
        <KV k="Discovery source" v={r.discoveryUrl ? <a href={r.discoveryUrl} target="_blank" rel="noreferrer">{r.discoveryUrl}</a> : <span className="muted">—</span>} />
        <KV k="Application portal" v={r.applicationUrl ? <a href={r.applicationUrl} target="_blank" rel="noreferrer">{r.applicationUrl}</a> : <span className="muted">—</span>} />
        <KV k="Linked by" v={r.linkedBy} />
      </Section>

      <Section title="Source artifact & ingestion (technical)">
        {r.artifact ? (
          <>
            <KV k="Artifact id" v={<code>{r.artifact.id}</code>} />
            <KV k="Format" v={r.artifact.sourceFormat} />
            <KV k="Render method" v={r.artifact.renderMethod} />
            <KV k="Source hash (sha256)" v={<code>{r.artifact.contentHash}</code>} />
            <KV k="Size / pages" v={`${r.artifact.byteSize} bytes${r.artifact.pageCount ? ` · ${r.artifact.pageCount} pages` : ""}`} />
            <KV k="Processing" v={r.artifact.processing + (r.artifact.processingError ? ` (${r.artifact.processingError})` : "")} />
          </>
        ) : (
          <div className="muted">No official artifact supplied for this record.</div>
        )}
        <KV
          k="Live fetch"
          v={
            r.liveFetch ? (
              <span>
                <b>{r.liveFetch.status}</b>
                {r.liveFetch.egressDenied ? " · egress denied" : ""} {r.liveFetch.error ? `· ${r.liveFetch.error}` : ""}
                <div className="muted small">{r.liveFetch.attemptedUrl}</div>
              </span>
            ) : (
              <span className="muted">not attempted</span>
            )
          }
        />
      </Section>

      <Section title="Verification">
        <KV k="Status" v={<Badge text={r.verificationStatus} color={r.verificationStatus === "VERIFIED" ? "var(--pursue)" : "var(--investigate)"} />} />
        <ul className="evi">
          {r.verificationEvidence.map((e, i) => (
            <li key={i} className="muted">{e}</li>
          ))}
        </ul>
      </Section>

      <Section title="Eligibility (two-stage) & entity route">
        <KV k="Application eligibility" v={r.application} />
        <KV k="Award/onboarding eligibility" v={r.award} />
        <KV k="Strategic route" v={<b>{r.strategicRoute}</b>} />
      </Section>

      <Section title="Scores">
        <KV k="Information confidence" v={`${r.scores.infoConfidence} / 100`} />
        <KV k="Relevance" v={r.scores.relevance ?? <span className="muted">not computed</span>} />
        <KV k="Win potential" v={r.scores.winPotential ?? <span className="muted">not computed</span>} />
      </Section>

      {gate && (
        <Section title={`Deterministic gate · ${gate.pursueEligible ? "PURSUE-eligible" : "blocked"}`}>
          <div className="gate">
            {(
              [
                ["accessible primary source", gate.accessiblePrimarySource],
                ["source human-VERIFIED", gate.verifiedSource],
                ["verified deadline", gate.verifiedDeadline],
                ["not expired", gate.notExpired],
                ["eligibility assessed", gate.eligibilityAssessed],
                ["not aggregator-only", gate.notAggregatorOnly],
                ["not closed call", gate.notClosedCall],
                ["exact next action", gate.hasExactNextAction],
                ["sufficient confidence", gate.sufficientConfidence],
              ] as [string, boolean][]
            ).map(([label, ok]) => (
              <span key={label} className={ok ? "gpass" : "gfail"}>
                {ok ? "✓" : "✗"} {label}
              </span>
            ))}
          </div>
          {gate.failedReasons.length > 0 && <div className="muted small">Failed: {gate.failedReasons.join("; ")}</div>}
        </Section>
      )}

      <Section title={`Facts · ${r.facts.length} (provenance-typed)`}>
        {r.facts.length === 0 && <div className="muted">No facts extracted (no official artifact processed).</div>}
        {FACT_ORDER.map((cls) => {
          const fs = factsBy(cls);
          if (fs.length === 0) return null;
          const attenuate = !CONFIRMED.includes(cls);
          return (
            <div key={cls} className="factGroup" style={{ opacity: attenuate ? 0.55 : 1 }}>
              <div className="factGroupHead">
                <Badge text={cls} color={PROV_COLOR[cls]} /> <span className="muted small">{fs.length}</span>
              </div>
              {fs.map((f, i) => (
                <div key={i} className="fact">
                  <div>
                    <span className="factKey">{f.field}</span> {f.normalizedValue}
                  </div>
                  <div className="muted small">
                    {f.locator.type}
                    {f.locator.page ? ` p.${f.locator.page}` : ""}
                    {f.locator.value && f.locator.type !== "PDF_PAGE" ? ` ${f.locator.value}` : ""} · {f.extractionMethod} · conf {f.extractionConfidence}
                  </div>
                  {f.originalSourceText && f.originalSourceText !== f.normalizedValue && (
                    <div className="src small">“{f.originalSourceText}”</div>
                  )}
                </div>
              ))}
            </div>
          );
        })}
      </Section>

      {r.deadlines.length > 0 && (
        <Section title={`Deadlines · ${r.deadlines.length}`}>
          {r.deadlines.map((d, i) => (
            <div key={i} className="fact">
              <div>
                <b>{d.normalized ?? d.originalSourceString}</b> · {d.deadlineType}
                {d.isConfirmPending && <span className="warn"> · to-be-confirmed (cannot verify)</span>}
              </div>
              <div className="muted small">
                {d.locator.type}
                {d.locator.page ? ` p.${d.locator.page}` : ""} · “{d.originalSourceString}”
                {d.conflicts.length > 0 && ` · conflicts: ${d.conflicts.join(", ")}`}
              </div>
            </div>
          ))}
        </Section>
      )}

      {r.unresolvedQuestions.length > 0 && (
        <Section title="Unresolved questions">
          <ul className="evi">
            {r.unresolvedQuestions.map((q, i) => (
              <li key={i}>{q}</li>
            ))}
          </ul>
        </Section>
      )}

      <Section title={`Notes · ${notes.length}`}>
        {notes.map((n) => (
          <div key={n.id} className="fact">
            <div>{n.text}</div>
            <div className="muted small">{n.at} · {n.actor}</div>
          </div>
        ))}
        <div className="viewsRow noteRow">
          <textarea className="comment" placeholder="Attach a note to this opportunity…" value={noteDraft} onChange={(e) => setNoteDraft(e.target.value)} />
          <button
            className="ghostBtn"
            onClick={() => {
              onAddNote(noteDraft);
              setNoteDraft("");
            }}
          >
            add note
          </button>
        </div>
      </Section>

      <Section title={`Tasks · ${tasks.filter((t) => t.status === "OPEN").length} open`}>
        {tasks.length === 0 && <div className="muted">No task on this opportunity yet.</div>}
        {tasks.map((t) => (
          <div key={t.id} className="fact">
            <div className="viewsRow">
              <button className="ghostBtn" onClick={() => onToggleTask(t)}>
                {t.status === "DONE" ? "done" : "mark done"}
              </button>
              <span className={t.status === "DONE" ? "muted" : undefined}>{t.title}</span>
            </div>
            <div className="muted small">
              {t.due ? `due ${t.due}` : "no due date"}
              {t.completedAt ? ` · completed ${t.completedAt.slice(0, 10)}` : ""}
            </div>
          </div>
        ))}
        <div className="viewsRow noteRow">
          <input
            className="comment inputLine"
            placeholder="What has to happen next…"
            value={taskDraft}
            onChange={(e) => setTaskDraft(e.target.value)}
          />
          <input
            className="comment inputLine dateInput"
            type="date"
            value={taskDue}
            onChange={(e) => setTaskDue(e.target.value)}
          />
          <button
            className="ghostBtn"
            onClick={() => {
              onAddTask(taskDraft, taskDue);
              setTaskDraft("");
              setTaskDue("");
            }}
          >
            add task
          </button>
        </div>
      </Section>

      <Section title="Human review">
        <div className="reviewBtns">
          {(["APPROVE", "REJECT", "NEEDS_VERIFICATION"] as const).map((s) => (
            <button
              key={s}
              className={reviewStatus === s ? "btn on" : "btn"}
              onClick={() => {
                onReview(s, comment);
                setComment("");
              }}
            >
              {s}
            </button>
          ))}
        </div>
        <textarea className="comment" placeholder="Reviewer comment (recorded with the decision)…" value={comment} onChange={(e) => setComment(e.target.value)} />
        {reviewStatus === "APPROVE" && (
          <div className={canPursue ? "ok small" : "warn small"}>
            {canPursue
              ? "APPROVE would promote to PURSUE (all hard gate conditions pass)."
              : "APPROVE recorded in the audit trail, but the hard gate is NOT satisfied → it CANNOT become PURSUE. A human sign-off never overrides a failed deterministic condition."}
          </div>
        )}
        <div className="muted small">
          Every decision appends an immutable audit event (local to this browser in Phase 1-2; server store returns with auth).
        </div>
      </Section>

      <Section title={`Audit trail (append-only) · ${events.length}`}>
        {events.length === 0 && <div className="muted">No review event yet for this record.</div>}
        {events.map((e) => (
          <div key={e.id} className="fact">
            <div>
              <b>{e.action}</b>
              {e.comment ? ` — “${e.comment}”` : ""}
            </div>
            <div className="muted small">
              {e.at} · {e.actor} · gate at decision: {e.gatePursueEligibleAtDecision ? "PURSUE-eligible" : "blocked"}
            </div>
          </div>
        ))}
        <ul className="evi small">
          {r.verificationEvidence.map((e, i) => (
            <li key={`v${i}`} className="muted">verification: {e}</li>
          ))}
          {r.warnings.map((w, i) => (
            <li key={`w${i}`} className="muted">warning: {w}</li>
          ))}
        </ul>
      </Section>
    </div>
  );
}
