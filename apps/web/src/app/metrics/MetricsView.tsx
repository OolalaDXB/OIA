"use client";

import { useMemo } from "react";
import type { ConsoleData } from "@oia/ingestion/console";
import { computeMetrics, projectName } from "@oia/workspace";
import { applyFreshnessAll } from "@oia/ingestion/freshness";
import { Shell } from "../Shell";
import { useAuditLog, useProjectTags } from "../../lib/workspaceStore";
import { useLedger } from "../../lib/watchData";

/** A tally, never a score. Each bar is something already decided elsewhere. */
function Bars({ title, data, rename }: { title: string; data: Record<string, number>; rename?: (k: string) => string }) {
  const rows = Object.entries(data).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const max = Math.max(1, ...rows.map(([, v]) => v));
  return (
    <section className="sec">
      <h3>{title}</h3>
      {rows.length === 0 && <div className="muted">Nothing counted yet.</div>}
      {rows.map(([key, value]) => (
        <div key={key} className="barRow">
          <span className="barLabel">{rename ? rename(key) : key}</span>
          <span className="barTrack">
            <span className="barFill" style={{ width: `${(value / max) * 100}%` }} />
          </span>
          <span className="barValue">{value}</span>
        </div>
      ))}
    </section>
  );
}

export function MetricsView({ data }: { data: ConsoleData }) {
  const audit = useAuditLog();
  const tags = useProjectTags();
  const nowIso = useMemo(() => new Date().toISOString(), []);
  const ledger = useLedger(data);
  const m = useMemo(
    () => computeMetrics(applyFreshnessAll(ledger.records, nowIso), audit.log, tags.tags, nowIso),
    [ledger.records, audit.log, tags.tags, nowIso],
  );

  return (
    <Shell
      active="metrics"
      title="Metrics"
      stats={`${m.total} record(s) · ${m.pursueEligible} gate-clear · ${m.untagged} untagged · ${ledger.source === "LEDGER" ? "watch ledger" : "bundled snapshot"}`}
      note="Counts, not scores. The last panel is the one that matters: the reasons the gate blocks what it blocks — that is the evidence backlog, and it is what work would actually unblock a shortlist."
      onExportAudit={audit.exportLog}
    >
      <div className="detail wide">
        <section className="sec">
          <h3>Gate</h3>
          <div className="kv">
            <span className="k">Records a human could promote to PURSUE</span>
            <span className="v">
              <b>{m.pursueEligible}</b> / {m.total}
            </span>
          </div>
          <div className="muted small">
            Every hard condition passes on these. On all the others an APPROVE is recorded but cannot produce a PURSUE.
          </div>
        </section>

        <Bars title="Why the gate blocks (evidence backlog)" data={Object.fromEntries(m.gateFailures.map((f) => [f.reason, f.count]))} />
        <Bars title="By recommendation" data={m.byRecommendation} />
        <Bars title="By human review" data={m.byReview} />
        <Bars title="By freshness" data={m.byFreshness} />
        <Bars title="By kind" data={m.byKind} />
        <Bars title="By verification status" data={m.byVerification} />
        <Bars title="By project (human tags)" data={m.byProject} rename={projectName} />
        <Bars
          title="Information confidence"
          data={Object.fromEntries(m.confidenceBuckets.map((b) => [b.label, b.count]))}
        />
      </div>
    </Shell>
  );
}
