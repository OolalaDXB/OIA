import type { DeadlineRecord, DeadlineType, SourceLocator } from "./models";

const MONTHS: Record<string, number> = {
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
  july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
};

const CONFIRM_TOKENS = ["to be confirmed", "tbc", "tbd", "(confirm", "provisional", "indicative", "expected to"];

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function contextWindow(text: string, index: number, radius = 80): string {
  return text.slice(Math.max(0, index - radius), index + radius).toLowerCase();
}

function detectType(ctx: string): DeadlineType {
  if (ctx.includes("expression of interest")) return "EXPRESSION_OF_INTEREST";
  if (ctx.includes("consortium")) return "CONSORTIUM_REGISTRATION";
  if (ctx.includes("document") && ctx.includes("submission")) return "DOCUMENT_SUBMISSION";
  if (ctx.includes("programme period") || ctx.includes("work programme")) return "PROGRAMME_PERIOD";
  if (ctx.includes("deadline") || ctx.includes("submit") || ctx.includes("application") || ctx.includes("closes")) return "APPLICATION";
  return "UNKNOWN";
}

function isConfirmPending(ctx: string): boolean {
  return CONFIRM_TOKENS.some((t) => ctx.includes(t));
}

/**
 * Extract deadline records from text (spec §9). Preserves the original string,
 * a normalized ISO date when determinable, the deadline type, a confidence, and
 * a `confirm-pending` flag (which blocks VERIFIED deadline status).
 */
export function extractDeadlines(text: string, locator: SourceLocator): DeadlineRecord[] {
  const records: DeadlineRecord[] = [];
  const seen = new Set<string>();

  const push = (original: string, iso: string | undefined, method: string, index: number, conf: number) => {
    const ctx = contextWindow(text, index);
    const key = `${original}|${iso ?? ""}`;
    if (seen.has(key)) return;
    seen.add(key);
    records.push({
      originalSourceString: original.trim(),
      normalized: iso,
      normalizationMethod: method,
      deadlineType: detectType(ctx),
      locator,
      confidence: isConfirmPending(ctx) ? Math.min(conf, 0.4) : conf,
      isConfirmPending: isConfirmPending(ctx),
      conflicts: [],
    });
  };

  // ISO: 2026-09-15
  for (const m of text.matchAll(/\b(\d{4})-(\d{2})-(\d{2})\b/g)) {
    push(m[0], `${m[1]}-${m[2]}-${m[3]}`, "iso-8601", m.index ?? 0, 0.9);
  }
  // D Month YYYY  /  Month D, YYYY
  for (const m of text.matchAll(/\b(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})\b/g)) {
    const mon = MONTHS[m[2]!.toLowerCase()];
    if (mon) push(m[0], `${m[3]}-${pad(mon)}-${pad(Number(m[1]))}`, "d-month-yyyy", m.index ?? 0, 0.85);
  }
  for (const m of text.matchAll(/\b([A-Za-z]+)\s+(\d{1,2}),?\s+(\d{4})\b/g)) {
    const mon = MONTHS[m[1]!.toLowerCase()];
    if (mon) push(m[0], `${m[3]}-${pad(mon)}-${pad(Number(m[2]))}`, "month-d-yyyy", m.index ?? 0, 0.85);
  }
  // DD/MM/YYYY (assume day-first; ambiguous → lower confidence)
  for (const m of text.matchAll(/\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/g)) {
    push(m[0], `${m[3]}-${pad(Number(m[2]))}-${pad(Number(m[1]))}`, "dd-mm-yyyy(assumed)", m.index ?? 0, 0.6);
  }

  // Rolling / continuous language with no date.
  const lower = text.toLowerCase();
  if (/\b(rolling basis|continuous(ly)? open|no fixed deadline|applications are accepted at any time|open call)\b/.test(lower)) {
    records.push({
      originalSourceString: "rolling / continuously open (per source language)",
      normalizationMethod: "rolling-language",
      deadlineType: "ROLLING",
      locator,
      confidence: 0.7,
      isConfirmPending: false,
      conflicts: [],
    });
  }

  return records;
}

/** Mark conflicts between differently-normalized official APPLICATION dates. */
export function annotateConflicts(records: DeadlineRecord[]): DeadlineRecord[] {
  const appDates = records.filter((r) => r.deadlineType === "APPLICATION" && r.normalized);
  const distinct = [...new Set(appDates.map((r) => r.normalized))];
  if (distinct.length <= 1) return records;
  return records.map((r) =>
    r.deadlineType === "APPLICATION" && r.normalized
      ? { ...r, conflicts: distinct.filter((d) => d !== r.normalized) as string[] }
      : r,
  );
}

export interface DeadlineGateInput {
  deadlines: DeadlineRecord[];
  /** Now, for expiry checks (ISO date). Injected for determinism. */
  today: string;
  /** Does the official source explicitly state applications are rolling? */
  rollingStated: boolean;
}

export interface DeadlineGateResult {
  hasVerifiableDeadline: boolean;
  isExpired: boolean;
  hasConflict: boolean;
  blocksPursue: boolean;
  reasons: string[];
}

/** Deterministic deadline rules from spec §9. */
export function evaluateDeadlineGate(input: DeadlineGateInput): DeadlineGateResult {
  const reasons: string[] = [];
  const app = input.deadlines.filter((d) => d.deadlineType === "APPLICATION");
  const rolling = input.rollingStated || input.deadlines.some((d) => d.deadlineType === "ROLLING");

  // A "confirm"-pending deadline cannot support a verified deadline.
  const verifiable = app.filter((d) => d.normalized && !d.isConfirmPending);
  const hasVerifiableDeadline = verifiable.length > 0;
  if (app.some((d) => d.isConfirmPending)) reasons.push('deadline marked "confirm/TBC" cannot be verified');

  const hasConflict = app.some((d) => d.conflicts.length > 0);
  if (hasConflict) reasons.push("conflicting official application dates require human review");

  const isExpired = verifiable.some((d) => (d.normalized as string) < input.today);
  if (isExpired) reasons.push("application deadline has passed (expired)");

  let blocksPursue = false;
  if (isExpired) blocksPursue = true;
  if (!hasVerifiableDeadline && !rolling) {
    blocksPursue = true;
    reasons.push("no verified deadline and source does not state rolling applications");
  }
  if (hasConflict) blocksPursue = true;

  return { hasVerifiableDeadline, isExpired, hasConflict, blocksPursue, reasons };
}
