import type { ClaimType } from "@oia/database";
import type { RawOpportunity, FetchedEvidence } from "@oia/connectors";

export interface BuiltClaim {
  claimType: ClaimType;
  field: string;
  valueText?: string;
  valueJson?: unknown;
  /** true when the fact is backed by the primary evidence (→ evidence_id set on persist). */
  citesEvidence: boolean;
  confidence: number; // 0..1
  producedBy: string;
}

const MONTHS = [
  "january", "february", "march", "april", "may", "june",
  "july", "august", "september", "october", "november", "december",
];

/**
 * Does a date (ISO string) appear, in some human-recognizable form, in the text?
 * Checks ISO (YYYY-MM-DD), DD/MM/YYYY, and "D Month YYYY". Deliberately strict:
 * we only CONFIRM a deadline we can actually see in the source.
 */
export function dateAppearsInText(iso: string, text: string): boolean {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return false;
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth(); // 0-based
  const day = d.getUTCDate();
  const t = text.toLowerCase();

  const pad = (n: number) => String(n).padStart(2, "0");
  const isoDate = `${y}-${pad(m + 1)}-${pad(day)}`;
  const dmy = `${pad(day)}/${pad(m + 1)}/${y}`;
  const dmyLoose = `${day}/${m + 1}/${y}`;
  const monthName = MONTHS[m]!;
  const longForm = `${day} ${monthName} ${y}`;

  return (
    t.includes(isoDate) ||
    t.includes(dmy) ||
    t.includes(dmyLoose) ||
    t.includes(longForm)
  );
}

const STATUS_PHRASES: Record<string, string[]> = {
  open: ["open for submission", "call is open", "status: open", "open call"],
  closed: ["closed", "call is closed", "status: closed", "deadline passed"],
  upcoming: ["forthcoming", "not yet open", "opens on", "status: forthcoming"],
};

function statusCorroborated(status: string | undefined, text: string): boolean {
  if (!status) return false;
  const phrases = STATUS_PHRASES[status] ?? [];
  const t = text.toLowerCase();
  return phrases.some((p) => t.includes(p));
}

/**
 * Turn a discovered opportunity + its fetched evidence into typed claims.
 * A field becomes `confirmed_official_fact` ONLY when corroborated by evidence.
 * Otherwise it is `extracted` (present in the source hint but unverified) or
 * `unresolved_uncertainty` (unknown).
 */
export function buildClaims(opp: RawOpportunity, evidence: FetchedEvidence | null): BuiltClaim[] {
  const claims: BuiltClaim[] = [];
  const text = evidence?.text ?? "";
  const evidenceReachable = !!evidence && evidence.httpStatus >= 200 && evidence.httpStatus < 400;

  // primary_url — confirmed if we reached the page.
  claims.push({
    field: "primary_url",
    claimType: evidenceReachable ? "confirmed_official_fact" : "unresolved_uncertainty",
    valueText: opp.url,
    citesEvidence: evidenceReachable,
    confidence: evidenceReachable ? 0.99 : 0.2,
    producedBy: "pipeline",
  });

  // deadline — confirmed only if the date is visible in the evidence.
  if (opp.hints.deadlineAt) {
    const confirmed = evidenceReachable && dateAppearsInText(opp.hints.deadlineAt, text);
    claims.push({
      field: "deadline",
      claimType: confirmed ? "confirmed_official_fact" : "extracted",
      valueText: opp.hints.deadlineAt,
      valueJson: { deadlineAt: opp.hints.deadlineAt },
      citesEvidence: confirmed,
      confidence: confirmed ? 0.95 : 0.5,
      producedBy: "pipeline",
    });
  } else {
    claims.push({
      field: "deadline",
      claimType: "unresolved_uncertainty",
      valueText: "no deadline found in source",
      citesEvidence: false,
      confidence: 0.1,
      producedBy: "pipeline",
    });
  }

  // open_status — confirmed if status language is present in evidence.
  const statusConfirmed = evidenceReachable && statusCorroborated(opp.hints.status, text);
  claims.push({
    field: "open_status",
    claimType: statusConfirmed
      ? "confirmed_official_fact"
      : opp.hints.status
        ? "extracted"
        : "unresolved_uncertainty",
    valueText: opp.hints.status ?? "unknown",
    citesEvidence: statusConfirmed,
    confidence: statusConfirmed ? 0.9 : opp.hints.status ? 0.5 : 0.1,
    producedBy: "pipeline",
  });

  // funder — extracted from the source listing (not independently corroborated).
  claims.push({
    field: "funder",
    claimType: opp.hints.funder ? "extracted" : "unresolved_uncertainty",
    valueText: opp.hints.funder ?? "unknown",
    citesEvidence: false,
    confidence: opp.hints.funder ? 0.6 : 0.1,
    producedBy: "pipeline",
  });

  // amount — usually absent from the F&T listing; unresolved unless present.
  const hasAmount = opp.hints.amountMin !== undefined || opp.hints.amountMax !== undefined;
  claims.push({
    field: "amount",
    claimType: hasAmount ? "extracted" : "unresolved_uncertainty",
    valueText: hasAmount ? `${opp.hints.amountMin ?? "?"}–${opp.hints.amountMax ?? "?"}` : "unknown",
    valueJson: hasAmount ? { min: opp.hints.amountMin, max: opp.hints.amountMax } : undefined,
    citesEvidence: false,
    confidence: hasAmount ? 0.5 : 0.1,
    producedBy: "pipeline",
  });

  return claims;
}
