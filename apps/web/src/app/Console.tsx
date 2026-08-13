"use client";

import { useMemo, useState } from "react";
import type { ConsoleData, ConsoleRecord } from "@oia/ingestion/console";
import { KIND_PHASE, WORKSPACE_RECORD_KINDS, type ReviewAction } from "@oia/workspace";
import { useAuditLog, useSavedViews } from "../lib/workspaceStore";

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

const KIND_LABEL: Record<string, string> = {
  OPPORTUNITY: "Opportunities",
  PROJECT: "Projects",
  NOTE: "Notes",
  TASK: "Tasks",
  CONTACT: "Contacts",
};

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

export function Console({ data }: { data: ConsoleData }) {
  const records = data.records;
  const audit = useAuditLog();
  const savedViews = useSavedViews();

  const [selectedId, setSelectedId] = useState<string>(records[0]?.id ?? "");
  const [fReco, setFReco] = useState("");
  const [fVerif, setFVerif] = useState("");
  const [fFormat, setFFormat] = useState("");
  const [fRoute, setFRoute] = useState("");
  const [fReview, setFReview] = useState("");
  const [sortKey, setSortKey] = useState("pubDate:desc");

  const filtered = useMemo(() => {
    const xs = records.filter(
      (r) =>
        (!fReco || r.recommendation === fReco) &&
        (!fVerif || r.verificationStatus === fVerif) &&
        (!fFormat || (r.artifact?.sourceFormat ?? "—") === fFormat) &&
        (!fRoute || r.strategicRoute === fRoute) &&
        (!fReview || audit.statusFor(r.id) === fReview),
    );
    const [field, dir] = sortKey.split(":");
    const mul = dir === "asc" ? 1 : -1;
    return [...xs].sort((a, b) => {
      if (field === "confidence") return mul * (a.scores.infoConfidence - b.scores.infoConfidence);
      if (field === "title") return mul * a.title.localeCompare(b.title);
      return mul * pubDate(a).localeCompare(pubDate(b)); // pubDate default
    });
  }, [records, fReco, fVerif, fFormat, fRoute, fReview, sortKey, audit]);

  const selected = records.find((r) => r.id === selectedId) ?? filtered[0] ?? records[0];

  const opt = (xs: string[]) => uniq(xs).sort();

  const applyView = (id: string) => {
    const v = savedViews.views.find((x) => x.id === id);
    if (!v) return;
    setFReco(v.filters.reco ?? "");
    setFVerif(v.filters.verif ?? "");
    setFFormat(v.filters.format ?? "");
    setFRoute(v.filters.route ?? "");
    setFReview(v.filters.review ?? "");
    setSortKey(`${v.sortField}:${v.sortDirection}`);
  };

  const saveCurrentView = () => {
    const name = window.prompt("Nom de la vue ?");
    if (!name?.trim()) return;
    const [sortField, sortDirection] = sortKey.split(":");
    savedViews.saveView(
      name.trim(),
      { reco: fReco, verif: fVerif, format: fFormat, route: fRoute, review: fReview },
      sortField ?? "pubDate",
      (sortDirection as "asc" | "desc") ?? "desc",
    );
  };

  return (
    <div className="shell">
      {/* Workspace rail — the evolutive skeleton. Only OPPORTUNITY is wired
          (Phase 1); the others are declared, visibly disabled with their phase. */}
      <aside className="rail">
        <div className="railBrand">OIA</div>
        {WORKSPACE_RECORD_KINDS.map((k) => (
          <div key={k} className={k === "OPPORTUNITY" ? "railItem active" : "railItem off"} title={k === "OPPORTUNITY" ? "" : `Phase ${KIND_PHASE[k]}`}>
            <span>{KIND_LABEL[k]}</span>
            {k !== "OPPORTUNITY" && <span className="railPhase">P{KIND_PHASE[k]}</span>}
          </div>
        ))}
        <div className="railFoot">
          <button className="ghostBtn" onClick={audit.exportLog}>Export audit</button>
        </div>
      </aside>

      <div className="app">
        {/* Envelope: hero band gets the treatment; the triage table below stays native. */}
        <header className="hero reveal">
          <div className="heroRow">
            <h1>Review Console</h1>
            <span className="heroStats">
              {data.run.records} opportunities · {data.run.artifactsIngested} artifact(s) ·{" "}
              {data.run.discrepancies} discrepancies ·{" "}
              {Object.entries(data.run.recommendationCounts)
                .map(([k, v]) => `${k}:${v}`)
                .join("  ")}
            </span>
          </div>
          {data.note && <p className="heroNote">{data.note}</p>}
        </header>

        <div className="filters">
          <Select label="Recommendation" value={fReco} onChange={setFReco} options={opt(records.map((r) => r.recommendation))} />
          <Select label="Verification" value={fVerif} onChange={setFVerif} options={opt(records.map((r) => r.verificationStatus))} />
          <Select label="Source format" value={fFormat} onChange={setFFormat} options={opt(records.map((r) => r.artifact?.sourceFormat ?? "—"))} />
          <Select label="Route" value={fRoute} onChange={setFRoute} options={opt(records.map((r) => r.strategicRoute))} />
          <Select label="Human review" value={fReview} onChange={setFReview} options={["PENDING", "APPROVE", "REJECT", "NEEDS_VERIFICATION"]} />
          <label className="filter">
            <span className="muted">Sort</span>
            <select value={sortKey} onChange={(e) => setSortKey(e.target.value)}>
              <option value="pubDate:desc">publication ↓ (recent first)</option>
              <option value="pubDate:asc">publication ↑</option>
              <option value="confidence:desc">confidence ↓</option>
              <option value="title:asc">title A→Z</option>
            </select>
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
              return (
                <li
                  key={r.id}
                  className={r.id === selected?.id ? "row selected" : "row"}
                  onClick={() => setSelectedId(r.id)}
                >
                  <div className="rowTop">
                    <Badge text={r.recommendation} color={RECO_COLOR[r.recommendation] ?? "#888"} />
                    <span className="rowTitle">{r.title}</span>
                  </div>
                  <div className="rowMeta">
                    <span>{r.issuer}</span>
                    {pubDate(r) && <span className="pubChip">published {pubDate(r)}</span>}
                  </div>
                  <div className="rowMeta small">
                    <span>⚖ {r.verificationStatus}</span>
                    <span>▸ {r.strategicRoute}</span>
                    <span>◷ {appDeadline(r)}</span>
                    <span>{r.artifact?.sourceFormat ?? r.linkedBy}</span>
                    <span>fetch:{r.liveFetch?.status ?? "—"}</span>
                    <span>conf:{r.scores.infoConfidence}</span>
                    <span className={rev === "PENDING" ? "muted" : "hrOn"}>HR:{rev}</span>
                  </div>
                </li>
              );
            })}
          </ul>

          {/* RIGHT — detail */}
          {selected && (
            <div className="detail">
              <Detail
                record={selected}
                reviewStatus={audit.statusFor(selected.id)}
                events={audit.eventsFor(selected.id)}
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
  onReview,
}: {
  record: ConsoleRecord;
  reviewStatus: ReviewAction | "PENDING";
  events: { id: string; action: string; comment: string; at: string; actor: string; gatePursueEligibleAtDecision: boolean }[];
  onReview: (action: ReviewAction, comment: string) => void;
}) {
  const [comment, setComment] = useState("");
  const gate = r.gate;
  const canPursue = !!gate?.pursueEligible;

  const factsBy = (c: FactClass) => r.facts.filter((f) => (f.classification as FactClass) === c);

  return (
    <div>
      <div className="detailHead">
        <Badge text={r.recommendation} color={RECO_COLOR[r.recommendation] ?? "#888"} />
        <h2>{r.title}</h2>
        <span className="muted">{r.issuer}</span>
        {pubDate(r) && <span className="pubChip">published {pubDate(r)}</span>}
      </div>

      {r.discrepancies.length > 0 && (
        <Section title={`⚠ Discrepancies (seed vs observed) · ${r.discrepancies.length}`}>
          {r.discrepancies.map((d, i) => (
            <div key={i} className="disc">
              <b>{d.field}</b>: seed <code>{d.seedExpectation}</code> vs observed <code>{d.observed}</code>
              <div className="muted small">{d.evidence} · rule {d.ruleApplied} · human review {d.humanReviewRequired ? "YES" : "no"}</div>
            </div>
          ))}
        </Section>
      )}

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
                    <b>{f.field}</b> = {f.normalizedValue}
                  </div>
                  <div className="muted small">
                    @{f.locator.type}
                    {f.locator.page ? ` p.${f.locator.page}` : ""}
                    {f.locator.value && f.locator.type !== "PDF_PAGE" ? ` ${f.locator.value}` : ""} · {f.extractionMethod} ({f.extractingProvider}/{f.extractingModel}) · conf {f.extractionConfidence}
                  </div>
                  {f.originalSourceText && <div className="src small">“{f.originalSourceText}”</div>}
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
                @{d.locator.type}
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
          Every decision appends an immutable audit event (local to this browser in Phase 1; server store returns with Phase 2 auth).
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
