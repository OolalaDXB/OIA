import type { ConsoleRecord } from "@oia/ingestion/console";
import { applicationDeadlineOf, assessFreshness } from "@oia/ingestion/freshness";
import type { AuditEvent } from "./audit";
import { latestReviewStatus } from "./audit";

/**
 * Shortlist export (M1 P3 item 17) — CSV for a spreadsheet, Markdown for a
 * human.
 *
 * Both carry the same honesty as the screen: the gate verdict and the reasons
 * it failed travel WITH the row. An exported shortlist that dropped "blocked
 * because the source is not human-verified" would be exactly the document the
 * product exists to prevent.
 */

export interface ExportContext {
  auditLog: readonly AuditEvent[];
  tags: Record<string, string>;
  projectName: (slug: string) => string;
  nowIso: string;
}

const CSV_COLUMNS = [
  "id",
  "kind",
  "title",
  "issuer",
  "project",
  "recommendation",
  "human_review",
  "gate_pursue_eligible",
  "gate_failed_reasons",
  "verification",
  "deadline",
  "freshness",
  "info_confidence",
  "official_url",
  "discovered_for",
] as const;

function csvCell(value: string | number | boolean | undefined): string {
  const s = value === undefined ? "" : String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function recordsToCsv(records: readonly ConsoleRecord[], ctx: ExportContext): string {
  const rows = [CSV_COLUMNS.join(",")];
  for (const r of records) {
    const slug = ctx.tags[r.id];
    rows.push(
      [
        r.id,
        r.opportunityKind ?? "",
        r.title,
        r.issuer,
        slug ? ctx.projectName(slug) : "",
        r.recommendation,
        latestReviewStatus(ctx.auditLog, r.id),
        r.gate ? r.gate.pursueEligible : "",
        (r.gate?.failedReasons ?? []).join("; "),
        r.verificationStatus,
        applicationDeadlineOf(r) ?? "",
        assessFreshness(r, ctx.nowIso).status,
        r.scores.infoConfidence,
        r.officialUrl ?? "",
        (r.discoveredFor ?? []).join(" "),
      ]
        .map(csvCell)
        .join(","),
    );
  }
  return rows.join("\n") + "\n";
}

export function recordsToMarkdown(
  records: readonly ConsoleRecord[],
  ctx: ExportContext,
  title = "OIA shortlist",
): string {
  const lines = [`# ${title}`, "", `_${records.length} record(s) · exported ${ctx.nowIso.slice(0, 10)}_`, ""];

  for (const r of records) {
    const slug = ctx.tags[r.id];
    const review = latestReviewStatus(ctx.auditLog, r.id);
    const freshness = assessFreshness(r, ctx.nowIso);
    lines.push(`## ${r.title}`, "");
    lines.push(`- **Recommendation**: ${r.recommendation} · human review: ${review}`);
    lines.push(`- **Issuer**: ${r.issuer}${slug ? ` · project: ${ctx.projectName(slug)}` : ""}`);
    if (r.opportunityKind) lines.push(`- **Kind**: ${r.opportunityKind}`);
    lines.push(`- **Verification**: ${r.verificationStatus}`);
    const deadline = applicationDeadlineOf(r);
    lines.push(`- **Deadline**: ${deadline ?? "none established"} (${freshness.status})`);
    lines.push(`- **Information confidence**: ${r.scores.infoConfidence}/100`);
    if (r.officialUrl) lines.push(`- **Official source**: ${r.officialUrl}`);
    if (r.gate) {
      lines.push(
        r.gate.pursueEligible
          ? "- **Gate**: every hard condition passes — a human APPROVE would make this PURSUE."
          : `- **Gate**: BLOCKED — ${r.gate.failedReasons.join("; ")}`,
      );
    }
    if (r.unresolvedQuestions.length > 0) {
      lines.push("- **Unresolved**:");
      for (const q of r.unresolvedQuestions) lines.push(`  - ${q}`);
    }
    lines.push("");
  }

  lines.push(
    "> Exported from the OIA review console. The gate verdict travels with each row: a blocked record is blocked in this document too, whatever a reviewer clicked.",
    "",
  );
  return lines.join("\n");
}
