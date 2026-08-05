"use client";

import { useMemo, useState } from "react";
import type { ConsoleData, ConsoleRecord } from "@oia/ingestion/console";

type FactClass =
  | "CONFIRMED_OFFICIAL"
  | "EXTRACTED_FROM_OFFICIAL_SOURCE"
  | "INFERRED"
  | "USER_PROVIDED"
  | "UNKNOWN";

const RECO_COLOR: Record<string, string> = {
  PURSUE: "#2f9e44",
  PARTNER: "#1971c2",
  INVESTIGATE: "#e8a90c",
  MONITOR: "#7048e8",
  REJECT: "#e03131",
};
const PROV_COLOR: Record<FactClass, string> = {
  CONFIRMED_OFFICIAL: "#2f9e44",
  EXTRACTED_FROM_OFFICIAL_SOURCE: "#1971c2",
  INFERRED: "#e8a90c",
  USER_PROVIDED: "#868e96",
  UNKNOWN: "#868e96",
};
const CONFIRMED: FactClass[] = ["CONFIRMED_OFFICIAL", "EXTRACTED_FROM_OFFICIAL_SOURCE"];
const FACT_ORDER: FactClass[] = ["CONFIRMED_OFFICIAL", "EXTRACTED_FROM_OFFICIAL_SOURCE", "INFERRED", "USER_PROVIDED", "UNKNOWN"];

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

const uniq = (xs: string[]) => [...new Set(xs)];

export function Console({ data }: { data: ConsoleData }) {
  const records = data.records;
  const [selectedId, setSelectedId] = useState<string>(records[0]?.id ?? "");
  const [fReco, setFReco] = useState("");
  const [fVerif, setFVerif] = useState("");
  const [fFormat, setFFormat] = useState("");
  const [fRoute, setFRoute] = useState("");
  const [fReview, setFReview] = useState("");
  const [review, setReview] = useState<Record<string, { status: string; comment: string }>>({});

  const filtered = useMemo(
    () =>
      records.filter(
        (r) =>
          (!fReco || r.recommendation === fReco) &&
          (!fVerif || r.verificationStatus === fVerif) &&
          (!fFormat || (r.artifact?.sourceFormat ?? "—") === fFormat) &&
          (!fRoute || r.strategicRoute === fRoute) &&
          (!fReview || (review[r.id]?.status ?? "PENDING") === fReview),
      ),
    [records, fReco, fVerif, fFormat, fRoute, fReview, review],
  );

  const selected = records.find((r) => r.id === selectedId) ?? filtered[0] ?? records[0];

  const opt = (xs: string[]) => uniq(xs).sort();

  return (
    <div className="app">
      <header className="topbar">
        <strong>OIA Funding · Milestone 0 Review Console</strong>
        <span className="muted">
          {data.run.records} opportunities · {data.run.artifactsIngested} official artifact(s) ingested ·{" "}
          {data.run.discrepancies} discrepancies ·{" "}
          {Object.entries(data.run.recommendationCounts)
            .map(([k, v]) => `${k}:${v}`)
            .join("  ")}
        </span>
      </header>

      <div className="filters">
        <Select label="Recommendation" value={fReco} onChange={setFReco} options={opt(records.map((r) => r.recommendation))} />
        <Select label="Verification" value={fVerif} onChange={setFVerif} options={opt(records.map((r) => r.verificationStatus))} />
        <Select label="Source format" value={fFormat} onChange={setFFormat} options={opt(records.map((r) => r.artifact?.sourceFormat ?? "—"))} />
        <Select label="Route" value={fRoute} onChange={setFRoute} options={opt(records.map((r) => r.strategicRoute))} />
        <Select label="Human review" value={fReview} onChange={setFReview} options={["PENDING", "APPROVE", "REJECT", "NEEDS_VERIFICATION"]} />
      </div>

      <div className="split">
        {/* LEFT — review queue */}
        <ul className="queue">
          {filtered.map((r) => {
            const rev = review[r.id]?.status ?? "PENDING";
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
                </div>
                <div className="rowMeta small">
                  <span>⚖ {r.verificationStatus}</span>
                  <span>▸ {r.strategicRoute}</span>
                  <span>◷ {appDeadline(r)}</span>
                  <span>{r.artifact?.sourceFormat ?? r.linkedBy}</span>
                  <span>fetch:{r.liveFetch?.status ?? "—"}</span>
                  <span>conf:{r.scores.infoConfidence}</span>
                  <span className={rev === "PENDING" ? "muted" : ""}>HR:{rev}</span>
                </div>
              </li>
            );
          })}
        </ul>

        {/* RIGHT — detail */}
        {selected && (
          <div className="detail">
            <Detail record={selected} review={review[selected.id]} onReview={(status, comment) => setReview((s) => ({ ...s, [selected.id]: { status, comment } }))} />
          </div>
        )}
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

function Detail({ record: r, review, onReview }: { record: ConsoleRecord; review?: { status: string; comment: string }; onReview: (status: string, comment: string) => void }) {
  const [comment, setComment] = useState(review?.comment ?? "");
  const gate = r.gate;
  const canPursue = !!gate?.pursueEligible;

  const factsBy = (c: FactClass) => r.facts.filter((f) => (f.classification as FactClass) === c);

  return (
    <div>
      <div className="detailHead">
        <Badge text={r.recommendation} color={RECO_COLOR[r.recommendation] ?? "#888"} />
        <h2>{r.title}</h2>
        <span className="muted">{r.issuer}</span>
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
        <KV k="Status" v={<Badge text={r.verificationStatus} color={r.verificationStatus === "VERIFIED" ? "#2f9e44" : "#e8a90c"} />} />
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
        <KV k="Relevance" v={r.scores.relevance ?? <span className="muted">not computed (M0)</span>} />
        <KV k="Win potential" v={r.scores.winPotential ?? <span className="muted">not computed (M0)</span>} />
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
                    {f.locator.page ? ` p.${f.locator.page}` : ""} · {f.extractionMethod} ({f.extractingProvider}/{f.extractingModel}) · conf {f.extractionConfidence}
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
              className={(review?.status ?? "PENDING") === s ? "btn on" : "btn"}
              onClick={() => onReview(s, comment)}
            >
              {s}
            </button>
          ))}
        </div>
        <textarea className="comment" placeholder="Reviewer comment…" value={comment} onChange={(e) => setComment(e.target.value)} onBlur={() => onReview(review?.status ?? "PENDING", comment)} />
        {review?.status === "APPROVE" && (
          <div className={canPursue ? "ok small" : "warn small"}>
            {canPursue
              ? "APPROVE would promote to PURSUE (all hard gate conditions pass)."
              : "APPROVE recorded, but the hard gate is NOT satisfied → it CANNOT become PURSUE. A human sign-off never overrides a failed deterministic condition."}
          </div>
        )}
        <div className="muted small">M0: review is local to this session (no production Supabase). Persisted as an append-only audit event once the store is wired.</div>
      </Section>

      <Section title="Provenance / audit trail">
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
