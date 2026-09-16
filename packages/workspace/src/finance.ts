import type { ConsoleRecord } from "@oia/ingestion/console";
import { KIND_PROFILES, normalizeKind } from "@oia/ingestion/opportunity-kinds";
import { assessFreshness } from "@oia/ingestion/freshness";
import type { AuditEvent } from "./audit";
import { latestReviewStatus } from "./audit";

/**
 * How much is actually in play, per project.
 *
 * Three rules, because a financial table is the easiest place in this product
 * to tell a comfortable lie:
 *
 *   1. **Coverage is shown next to every total.** A sum over the 3 records out
 *      of 14 that happen to state a figure is not a pipeline value, and a
 *      number without its denominator invites exactly that reading.
 *   2. **Inbound and outbound never mix.** An acquisition SPENDS money. Adding
 *      it to grants would produce a total that means nothing.
 *   3. **Gate-blocked money is counted separately.** Everything the system
 *      knows is blocked until a human verifies it, so a single headline figure
 *      would be the number this whole product exists to avoid printing.
 */

export interface ParsedAmount {
  currency: string;
  value: number;
  /** How much to trust the parse — spacing noise in extracted text is common. */
  confidence: "HIGH" | "LOW";
  source: string;
}

const CURRENCY_WORDS: Record<string, string> = {
  "€": "EUR", eur: "EUR", euro: "EUR", euros: "EUR",
  "£": "GBP", gbp: "GBP",
  $: "USD", usd: "USD",
  aed: "AED", qar: "QAR", sar: "SAR", mad: "MAD",
};

/**
 * Parse an amount out of extracted text. Conservative by design: anything it
 * cannot read confidently is reported as unparsed rather than guessed, because
 * a wrong figure in a financial table is worse than a missing one.
 */
export function parseAmount(text: string): ParsedAmount | null {
  if (!text) return null;
  const lower = text.toLowerCase().trim();

  let currency = "";
  for (const [token, code] of Object.entries(CURRENCY_WORDS)) {
    const pattern = /^[a-z]+$/.test(token) ? new RegExp(`\\b${token}\\b`) : new RegExp(token.replace(/[$]/g, "\\$"));
    if (pattern.test(lower)) {
      currency = code;
      break;
    }
  }

  const digits = lower.match(/[\d][\d\s.,]*/);
  if (!digits) return null;
  const raw = digits[0].trim().replace(/[.,\s]+$/, "");

  // European and Anglo grouping both appear; the last separator followed by
  // exactly two digits is a decimal, anything else is a thousands separator.
  let normalized = raw.replace(/\s/g, "");
  const decimal = normalized.match(/[.,](\d{2})$/);
  if (decimal) {
    normalized = normalized.slice(0, -3).replace(/[.,]/g, "") + "." + decimal[1];
  } else {
    normalized = normalized.replace(/[.,]/g, "");
  }

  const value = Number(normalized);
  if (!Number.isFinite(value) || value <= 0) return null;

  // "EUR 5 0 00 000" is real output from a real PDF extraction. The digits may
  // well be right, but ragged grouping means the parse is a guess, and it says so.
  const raggedGrouping = /\d\s\d(?!\d\d)/.test(raw) || /\d{1,2}\s\d{2}\s/.test(raw);
  const multiplier = /\bmillion\b|\bm\b/.test(lower) ? 1_000_000 : /\bbn\b|\bbillion\b/.test(lower) ? 1_000_000_000 : 1;

  return {
    currency: currency || "UNKNOWN",
    value: value * multiplier,
    confidence: raggedGrouping || !currency ? "LOW" : "HIGH",
    source: text.slice(0, 120),
  };
}

/** The best amount a record states, if any. */
export function amountOf(record: ConsoleRecord): ParsedAmount | null {
  // `estimated_value` comes from the notice's own "estimated value" section and
  // beats a bare number picked up anywhere in the document.
  const preferred = record.facts.find((f) => f.field === "estimated_value");
  if (preferred) {
    const parsed = parseAmount(preferred.normalizedValue);
    if (parsed) return parsed;
  }
  const candidates = record.facts
    .filter((f) => f.field === "amount")
    .map((f) => parseAmount(f.normalizedValue))
    .filter((a): a is ParsedAmount => a !== null);
  if (candidates.length === 0) return null;
  // Several amounts in one document: the largest is usually the call's envelope
  // rather than a per-item figure. Reported as LOW confidence for that reason.
  const largest = candidates.sort((a, b) => b.value - a.value)[0]!;
  return { ...largest, confidence: "LOW" };
}

export interface ProjectFinance {
  projectSlug: string;
  /** Records attached to this project (tagged by a human, or discovered for it). */
  records: number;
  /** Of those, how many state an amount at all. */
  withAmount: number;
  /** Money that could come IN, by currency. */
  inbound: Record<string, number>;
  /** Money that would go OUT (acquisitions), by currency. Never added to inbound. */
  outbound: Record<string, number>;
  /** Of the inbound total, how much sits on records the gate currently blocks. */
  blocked: Record<string, number>;
  /** …and how much on records a human could promote today. */
  clear: Record<string, number>;
  /** Closing within the horizon — the part that expires if nothing happens. */
  closingSoon: Record<string, number>;
  /** How many amounts were read with low confidence. */
  lowConfidence: number;
  byKind: Record<string, { count: number; amount: Record<string, number> }>;
}

function add(target: Record<string, number>, currency: string, value: number): void {
  target[currency] = (target[currency] ?? 0) + value;
}

export interface FinanceInput {
  records: readonly ConsoleRecord[];
  tags: Record<string, string>;
  auditLog: readonly AuditEvent[];
  nowIso: string;
}

export function projectFinance(
  input: FinanceInput,
  projectSlug: string,
  /** Take every record as-is instead of filtering by project (used for orphans). */
  takeAll = false,
): ProjectFinance {
  const { records, tags, nowIso } = input;
  const mine = takeAll
    ? [...records]
    : records.filter(
        (r) => tags[r.id] === projectSlug || (!tags[r.id] && (r.discoveredFor ?? []).includes(projectSlug)),
      );

  const finance: ProjectFinance = {
    projectSlug,
    records: mine.length,
    withAmount: 0,
    inbound: {},
    outbound: {},
    blocked: {},
    clear: {},
    closingSoon: {},
    lowConfidence: 0,
    byKind: {},
  };

  for (const record of mine) {
    const kind = normalizeKind(record.opportunityKind);
    const profile = KIND_PROFILES[kind];
    const amount = amountOf(record);

    const bucket = (finance.byKind[kind] ??= { count: 0, amount: {} });
    bucket.count += 1;
    if (!amount) continue;

    finance.withAmount += 1;
    if (amount.confidence === "LOW") finance.lowConfidence += 1;
    add(bucket.amount, amount.currency, amount.value);

    if (profile.direction === "OUTBOUND") {
      add(finance.outbound, amount.currency, amount.value);
      continue;
    }
    if (profile.direction === "NEUTRAL") continue;

    add(finance.inbound, amount.currency, amount.value);
    if (record.gate?.pursueEligible) add(finance.clear, amount.currency, amount.value);
    else add(finance.blocked, amount.currency, amount.value);

    if (assessFreshness(record, nowIso).status === "CLOSING_SOON") {
      add(finance.closingSoon, amount.currency, amount.value);
    }
  }

  return finance;
}

export function financeByProject(input: FinanceInput, projectSlugs: readonly string[]): ProjectFinance[] {
  return projectSlugs
    .map((slug) => projectFinance(input, slug))
    .filter((f) => f.records > 0)
    .sort((a, b) => {
      const total = (x: ProjectFinance) => Object.values(x.inbound).reduce((n, v) => n + v, 0);
      return total(b) - total(a) || b.records - a.records;
    });
}

/**
 * Records attached to no project at all — the part of the pipeline nobody owns.
 *
 * This is deliberately a visible row rather than an omission. On the current
 * dataset it is EVERY record: nothing has been tagged, and the historical runs
 * predate discovery provenance. A money page that silently showed nothing in
 * that situation would be reporting an empty pipeline when the truth is an
 * untriaged one.
 */
export function untriagedFinance(input: FinanceInput, projectSlugs: readonly string[]): ProjectFinance {
  const known = new Set(projectSlugs);
  const orphans = input.records.filter(
    (r) => !input.tags[r.id] && !(r.discoveredFor ?? []).some((s) => known.has(s)),
  );
  return projectFinance({ ...input, records: orphans, tags: {} }, "__untriaged", true);
}

/** Currency totals as a readable string. Never invents a conversion rate. */
export function formatTotals(totals: Record<string, number>): string {
  const entries = Object.entries(totals).filter(([, v]) => v > 0);
  if (entries.length === 0) return "—";
  return entries
    .sort((a, b) => b[1] - a[1])
    .map(([currency, value]) => `${currency} ${Math.round(value).toLocaleString("en-GB")}`)
    .join(" · ");
}

export function reviewOf(input: FinanceInput, recordId: string): string {
  return latestReviewStatus(input.auditLog, recordId);
}
