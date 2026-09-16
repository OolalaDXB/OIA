"use client";

import { useMemo, useState } from "react";
import { projectName } from "@oia/workspace";
import { Shell } from "../Shell";
import { isConfigured } from "../../lib/supabase";
import { useAlerts } from "../../lib/watchData";

/**
 * Alerts — what the permanent watch decided was worth interrupting you for.
 *
 * Raised by the watch when a run is folded into the ledger, and by the
 * deadline rules that need no run at all. Acknowledging one does not delete it:
 * the row stays as the record that you were told, and when.
 */

const LABEL: Record<string, string> = {
  JUST_EXPIRED: "Closed",
  CLOSING_SOON: "Closing soon",
  DEADLINE_CHANGED: "Deadline moved",
  DISAPPEARED: "No longer published",
  APPROVED_BUT_BLOCKED: "Approved but gate-blocked",
  NEW_MATCH: "New",
};

const TONE: Record<string, string> = {
  JUST_EXPIRED: "var(--reject)",
  CLOSING_SOON: "var(--investigate)",
  DEADLINE_CHANGED: "var(--partner)",
  DISAPPEARED: "var(--reject)",
  APPROVED_BUT_BLOCKED: "var(--monitor)",
  NEW_MATCH: "var(--pursue)",
};

export function AlertsView() {
  const { alerts, open, loading, error, acknowledge } = useAlerts();
  const [showAcknowledged, setShowAcknowledged] = useState(false);
  const [project, setProject] = useState("");

  const shown = useMemo(() => {
    const base = showAcknowledged ? alerts : open;
    return project ? base.filter((a) => a.projectSlug === project) : base;
  }, [alerts, open, showAcknowledged, project]);

  const projects = useMemo(
    () => [...new Set(alerts.map((a) => a.projectSlug).filter((s): s is string => !!s))].sort(),
    [alerts],
  );

  return (
    <Shell
      active="alerts"
      title="Alerts"
      stats={`${open.length} open · ${alerts.length} raised in total`}
      note="Raised by the permanent watch: a new call matching a project, a deadline closing or moving, a call withdrawn, an approval the gate still blocks. Deterministic and idempotent — the same condition is never raised twice."
    >
      <div className="filters">
        <label className="filter">
          <span className="muted">Project</span>
          <select value={project} onChange={(e) => setProject(e.target.value)}>
            <option value="">all</option>
            {projects.map((p) => (
              <option key={p} value={p}>
                {projectName(p)}
              </option>
            ))}
          </select>
        </label>
        <label className="filter">
          <span className="muted">Show</span>
          <select value={showAcknowledged ? "ALL" : "OPEN"} onChange={(e) => setShowAcknowledged(e.target.value === "ALL")}>
            <option value="OPEN">open only</option>
            <option value="ALL">including acknowledged</option>
          </select>
        </label>
      </div>

      <div className="detail wide">
        {!isConfigured() && (
          <section className="sec">
            <h3>No watch database configured</h3>
            <p className="muted">
              Alerts need the permanent ledger — the memory that lets the system tell a new call from one it has
              seen ten times. Set <code>NEXT_PUBLIC_SUPABASE_URL</code> and <code>NEXT_PUBLIC_SUPABASE_ANON_KEY</code>,
              and this console starts reading it. Until then it runs on its bundled snapshot, which has no history
              and therefore nothing to alert on.
            </p>
          </section>
        )}

        {error && (
          <section className="sec">
            <h3 className="warn">The database refused the request</h3>
            <p className="warn small">{error}</p>
          </section>
        )}

        {isConfigured() && loading && <div className="muted">Loading alerts…</div>}

        {isConfigured() && !loading && shown.length === 0 && (
          <section className="sec">
            <h3>Nothing is asking for you</h3>
            <p className="muted">
              {alerts.length === 0
                ? "No alert has ever been raised. On the current dataset that is the honest answer: nothing is closing, nothing changed, nothing new is attached to a project."
                : "Everything raised has been acknowledged."}
            </p>
          </section>
        )}

        {shown.map((a) => (
          <div
            key={a.id}
            className="fact"
            style={{ borderLeftColor: TONE[a.kind] ?? "var(--line)", opacity: a.acknowledgedAt ? 0.5 : 1 }}
          >
            <div className="viewsRow">
              <span className="badge" style={{ borderColor: TONE[a.kind], color: TONE[a.kind] }}>
                {LABEL[a.kind] ?? a.kind}
              </span>
              <b>{a.headline}</b>
              {a.projectSlug && <span className="pubChip tagChip">{projectName(a.projectSlug)}</span>}
            </div>
            <div>{a.nextAction}</div>
            <div className="muted small">
              {a.detail} · raised {a.createdAt.slice(0, 16).replace("T", " ")}
              {a.acknowledgedAt ? ` · acknowledged ${a.acknowledgedAt.slice(0, 10)}` : ""}
              {!a.acknowledgedAt && (
                <button className="ghostBtn applyBtn" onClick={() => void acknowledge(a.id, "mickael")}>
                  acknowledge
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </Shell>
  );
}
