"use client";

import { useMemo, useState } from "react";
import type { ConsoleData } from "@oia/ingestion/console";
import { applyFreshnessAll } from "@oia/ingestion/freshness";
import { KIND_PROFILES, normalizeKind } from "@oia/ingestion/opportunity-kinds";
import {
  PROJECT_ENTRIES,
  computeMetrics,
  financeByProject,
  formatTotals,
  projectName,
  untriagedFinance,
  type ProjectFinance,
} from "@oia/workspace";
import { Shell } from "../Shell";
import { useAuditLog, useProjectTags } from "../../lib/workspaceStore";
import { useLedger } from "../../lib/watchData";
import { plainFailure, kindLabel, kindMeaning } from "../../lib/vocabulary";
import { useLang } from "../../lib/lang";

/**
 * How much is actually in play, and what is stopping it.
 *
 * Three rules are visible on this screen rather than buried in the code, because
 * a financial table is the easiest place in this product to tell a comfortable
 * lie:
 *
 *   - every total shows its COVERAGE (how many records state a figure at all);
 *   - acquisitions are counted separately, because money going out is not money
 *     coming in;
 *   - what the checks block is shown apart from what is ready, so there is no
 *     single flattering headline number.
 */
export function MoneyView({ data }: { data: ConsoleData }) {
  const { lang } = useLang();
  const fr = lang === "fr";
  const audit = useAuditLog();
  const tags = useProjectTags();
  const ledger = useLedger(data);
  const nowIso = useMemo(() => new Date().toISOString(), []);
  const [showBacklog, setShowBacklog] = useState(true);

  const records = useMemo(() => applyFreshnessAll(ledger.records, nowIso), [ledger.records, nowIso]);
  const input = useMemo(
    () => ({ records, tags: tags.tags, auditLog: audit.log, nowIso }),
    [records, tags.tags, audit.log, nowIso],
  );

  const slugs = PROJECT_ENTRIES.map((p) => p.slug);
  const rows = useMemo(() => financeByProject(input, slugs), [input, slugs.join(",")]);
  const untriaged = useMemo(() => untriagedFinance(input, slugs), [input, slugs.join(",")]);
  const metrics = useMemo(() => computeMetrics(records, audit.log, tags.tags, nowIso), [records, audit.log, tags.tags, nowIso]);

  // "Across everything" means everything, the untriaged included. Summing only
  // the project rows would print a headline of "—" directly above a table
  // showing EUR 128,900,000, which is the sort of contradiction that makes a
  // reader distrust both numbers — and on this dataset every record is
  // untriaged, so the headline would be wrong by the entire pipeline.
  const grand = useMemo(() => {
    const inbound: Record<string, number> = {};
    const outbound: Record<string, number> = {};
    const clear: Record<string, number> = {};
    for (const r of [...rows, untriaged]) {
      for (const [c, v] of Object.entries(r.inbound)) inbound[c] = (inbound[c] ?? 0) + v;
      for (const [c, v] of Object.entries(r.outbound)) outbound[c] = (outbound[c] ?? 0) + v;
      for (const [c, v] of Object.entries(r.clear)) clear[c] = (clear[c] ?? 0) + v;
    }
    return { inbound, outbound, clear };
  }, [rows, untriaged]);

  const totalRecords = rows.reduce((n, r) => n + r.records, 0) + untriaged.records;
  const totalWithAmount = rows.reduce((n, r) => n + r.withAmount, 0) + untriaged.withAmount;

  return (
    <Shell
      active="money"
      title={{ fr: "Argent", en: "Money" }}
      stats={fr
        ? `${totalWithAmount} fiche(s) sur ${totalRecords} indiquent un montant`
        : `${totalWithAmount} of ${totalRecords} record(s) state an amount`}
      note={fr
        ? "Chaque chiffre ici a été lu dans un document publié par une règle, jamais estimé. La colonne de couverture fait partie du nombre — un total ne vaut que ce que dit sa couverture, et ce qui n'indique aucun montant est inconnu, pas zéro."
        : "Every figure here was read out of a published document by a rule, not estimated. The coverage column is part of the number — a total is only worth what its coverage says, and what states no figure is unknown, not zero."}
      onExportAudit={audit.exportLog}
    >
      <div className="detail wide">
        <section className="sec">
          <h3>{fr ? "Tous projets confondus" : "Across everything"}</h3>
          <div className="moneyHeads">
            <div className="moneyHead">
              <span className="moneyLabel">{fr ? "Pourrait rentrer" : "Could come in"}</span>
              <span className="moneyValue">{formatTotals(grand.inbound)}</span>
              <span className="muted small">
                {fr ? `sur ${totalWithAmount} fiche(s) indiquant un montant — le reste est inconnu, pas zéro` : `across ${totalWithAmount} record(s) that state a figure — the rest are unknown, not zero`}
              </span>
            </div>
            <div className="moneyHead">
              <span className="moneyLabel">{fr ? "Prêt à être poursuivi" : "Ready to go after"}</span>
              <span className="moneyValue ok">{formatTotals(grand.clear)}</span>
              <span className="muted small">
                {Object.keys(grand.clear).length === 0
                  ? (fr ? "rien pour l'instant — chaque montant ci-dessus porte sur une fiche qu'un contrôle bloque encore" : "nothing yet — every figure above sits on a record a check still blocks")
                  : (fr ? "tout le reste est bloqué par un contrôle non levé" : "everything else is blocked by a check that has not been cleared")}
              </span>
            </div>
            {Object.keys(grand.outbound).length > 0 && (
              <div className="moneyHead">
                <span className="moneyLabel">{fr ? "Sortirait" : "Would go out"}</span>
                <span className="moneyValue warn">{formatTotals(grand.outbound)}</span>
                <span className="muted small">{fr ? "acquisitions — jamais additionnées aux montants ci-dessus" : "acquisitions — never added to the figures above"}</span>
              </div>
            )}
          </div>
        </section>

        <section className="sec">
          <h3>{fr ? "Par projet" : "By project"}</h3>
          {rows.length === 0 && untriaged.records > 0 && (
            <div className="muted">
              {fr ? "Rien n'est encore rattaché à un projet — chaque fiche ci-dessous attend d'être étiquetée, ou d'être trouvée par la recherche d'un projet. Étiquette-en une depuis une opportunité, ou lance une recherche depuis un projet." : "Nothing is attached to a project yet — every record below is waiting to be tagged, or to be found by a project's own search. Tag one from an opportunity, or start a search from a project."}
            </div>
          )}
          {(rows.length > 0 || untriaged.records > 0) && (
            <table className="money">
              <thead>
                <tr>
                  <th>{fr ? "Projet" : "Project"}</th>
                  <th className="num">{fr ? "Fiches" : "Records"}</th>
                  <th className="num">{fr ? "Avec un montant" : "With a figure"}</th>
                  <th>{fr ? "Pourrait rentrer" : "Could come in"}</th>
                  <th>{fr ? "Prêt" : "Ready"}</th>
                  <th>{fr ? "Bientôt clos" : "Closing soon"}</th>
                  <th>{fr ? "Sortirait" : "Would go out"}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <FinanceRow key={r.projectSlug} row={r} name={projectName(r.projectSlug)} />
                ))}
                {untriaged.records > 0 && (
                  <FinanceRow row={untriaged} name={fr ? "Rattaché à aucun projet" : "Attached to no project"} muted />
                )}
              </tbody>
            </table>
          )}
          <div className="muted small">
            {fr ? "Une fiche compte pour un projet quand tu l'as étiquetée, ou — jusqu'à ce que tu en décides autrement — quand la recherche de ce projet l'a remontée." : "A record counts for a project when you tagged it, or — until you decide otherwise — when that project's own query surfaced it."}
          </div>
        </section>

        <section className="sec">
          <h3>{fr ? "Par type" : "By kind"}</h3>
          <div className="kindGrid">
            {Object.entries(metrics.byKind)
              .sort((a, b) => b[1] - a[1])
              .map(([kind, count]) => {
                const profile = KIND_PROFILES[normalizeKind(kind)];
                return (
                  <div key={kind} className="kindCard">
                    <div className="viewsRow">
                      <b>{kindLabel(kind, lang)}</b>
                      <span className="pubChip">{count}</span>
                      {profile.direction === "OUTBOUND" && <span className="pubChip expiredChip">{fr ? "argent sortant" : "money out"}</span>}
                    </div>
                    <div className="muted small">{kindMeaning(kind, lang)}</div>
                  </div>
                );
              })}
          </div>
        </section>

        <section className="sec">
          <div className="secHead">
            <h3>{fr ? "Ce qui bloque l'argent" : "What is blocking the money"}</h3>
            <button className="ghostBtn" onClick={() => setShowBacklog(!showBacklog)}>
              {showBacklog ? (fr ? "masquer" : "hide") : (fr ? "afficher" : "show")}
            </button>
          </div>
          <div className="muted small">
            {fr ? `${metrics.pursueEligible} fiche(s) sur ${metrics.total} passent tous les contrôles. Voici les raisons pour les autres — le vrai travail à faire, par ordre de ce qu'il débloquerait.` : `${metrics.pursueEligible} of ${metrics.total} record(s) pass every check. These are the reasons for the rest — the actual backlog of work, in order of how much it would unblock.`}
          </div>
          {showBacklog &&
            metrics.gateFailures.map((f) => (
              <div key={f.reason} className="barRow">
                <span className="barLabel">{plainFailure(f.reason, lang)}</span>
                <span className="barTrack">
                  <span
                    className="barFill"
                    style={{ width: `${(f.count / Math.max(1, metrics.gateFailures[0]?.count ?? 1)) * 100}%` }}
                  />
                </span>
                <span className="barValue">{f.count}</span>
              </div>
            ))}
          {showBacklog && metrics.gateFailures.length === 0 && (
            <div className="muted">{fr ? "Rien n'est bloqué." : "Nothing is blocked."}</div>
          )}
        </section>
      </div>
    </Shell>
  );
}

function FinanceRow({ row, name, muted }: { row: ProjectFinance; name: string; muted?: boolean }) {
  const coverage = row.records === 0 ? 0 : Math.round((row.withAmount / row.records) * 100);
  return (
    <tr className={muted ? "mutedRow" : undefined}>
      <td>{name}</td>
      <td className="num">{row.records}</td>
      <td className="num">
        {row.withAmount}
        <span className="muted small"> ({coverage}%)</span>
        {row.lowConfidence > 0 && (
          <span className="muted small" title="read from ragged text — treat as approximate">
            {" "}
            · {row.lowConfidence} approx
          </span>
        )}
      </td>
      <td>{formatTotals(row.inbound)}</td>
      <td className={Object.keys(row.clear).length ? "ok" : "muted"}>{formatTotals(row.clear)}</td>
      <td className={Object.keys(row.closingSoon).length ? "warn" : "muted"}>{formatTotals(row.closingSoon)}</td>
      <td className={Object.keys(row.outbound).length ? "warn" : "muted"}>{formatTotals(row.outbound)}</td>
    </tr>
  );
}
