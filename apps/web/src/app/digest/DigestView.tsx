"use client";

import { useMemo, useState } from "react";
import type { ConsoleData } from "@oia/ingestion/console";
import { buildDigest, digestToMarkdown, projectName, type DigestReason } from "@oia/workspace";
import { applyFreshnessAll } from "@oia/ingestion/freshness";
import { Shell } from "../Shell";
import { download, useAuditLog, useProjectTags, useTasks } from "../../lib/workspaceStore";
import { useLedger } from "../../lib/watchData";

/**
 * "Today" — the Phase 4 digest, on screen. Deterministic and unflattering: it
 * lists deadlines, overdue work, approvals the gate still blocks and untriaged
 * records. It promotes nothing, and when there is nothing to say it says so
 * instead of filling the page.
 */

const LABEL: Record<DigestReason, string> = {
  TASK_OVERDUE: "Overdue",
  JUST_EXPIRED: "Closed since you last looked",
  CLOSING_SOON: "Closing soon",
  TASK_DUE: "Due shortly",
  APPROVED_BUT_BLOCKED: "Approved but gate-blocked",
  UNREVIEWED: "Waiting for triage",
};

const TONE: Record<DigestReason, string> = {
  TASK_OVERDUE: "var(--reject)",
  JUST_EXPIRED: "var(--reject)",
  CLOSING_SOON: "var(--investigate)",
  TASK_DUE: "var(--partner)",
  APPROVED_BUT_BLOCKED: "var(--monitor)",
  UNREVIEWED: "var(--muted)",
};

export function DigestView({ data }: { data: ConsoleData }) {
  const audit = useAuditLog();
  const tags = useProjectTags();
  const tasks = useTasks();
  const [horizon, setHorizon] = useState(14);

  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const ledger = useLedger(data);
  const records = useMemo(
    () => applyFreshnessAll(ledger.records, `${today}T00:00:00Z`),
    [ledger.records, today],
  );
  const digest = useMemo(
    () =>
      buildDigest(today, {
        records,
        tasks: tasks.tasks,
        auditLog: audit.log,
        tags: tags.tags,
        horizonDays: horizon,
      }),
    [today, records, tasks.tasks, audit.log, tags.tags, horizon],
  );

  const groups = (Object.keys(LABEL) as DigestReason[])
    .map((reason) => ({ reason, entries: digest.entries.filter((e) => e.reason === reason) }))
    .filter((g) => g.entries.length > 0);

  return (
    <Shell
      active="digest"
      title={`Today — ${digest.date}`}
      stats={`${digest.entries.length} item(s) · horizon ${horizon}d · ${ledger.source === "LEDGER" ? "watch ledger" : "bundled snapshot"}`}
      note="Deterministic: deadlines, tasks and review state. No ranking model, no LLM. It never promotes a record and never invents an action."
      onExportAudit={audit.exportLog}
    >
      <div className="filters">
        <label className="filter">
          <span className="muted">Horizon</span>
          <select value={horizon} onChange={(e) => setHorizon(Number(e.target.value))}>
            <option value={7}>7 days</option>
            <option value={14}>14 days</option>
            <option value={30}>30 days</option>
          </select>
        </label>
        <label className="filter">
          <span className="muted">Export</span>
          <button
            className="ghostBtn"
            onClick={() =>
              download(`oia-digest-${digest.date}.md`, digestToMarkdown(digest, projectName), "text/markdown")
            }
          >
            markdown
          </button>
        </label>
      </div>

      <div className="detail wide">
        {groups.length === 0 && (
          <section className="sec">
            <h3>Nothing needs you today</h3>
            <p className="muted">
              No call closing inside the horizon, no task due, no approval blocked by the gate, nothing untriaged.
              That is a real answer, not an empty screen.
            </p>
          </section>
        )}

        {groups.map(({ reason, entries }) => (
          <section key={reason} className="sec">
            <h3 style={{ color: TONE[reason] }}>
              {LABEL[reason]} · {entries.length}
            </h3>
            {entries.map((e, i) => (
              <div key={`${e.recordId}-${i}`} className="fact" style={{ borderLeftColor: TONE[reason] }}>
                <div>
                  <b>{e.headline}</b>
                  {e.projectSlug && <span className="pubChip tagChip digestChip">{projectName(e.projectSlug)}</span>}
                </div>
                <div>{e.nextAction}</div>
                <div className="muted small">{e.detail}</div>
              </div>
            ))}
          </section>
        ))}
      </div>
    </Shell>
  );
}
