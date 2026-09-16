import type { ConsoleRecord } from "./console";

/**
 * Deduplication across sources (M1 P2 item 13).
 *
 * The same call reaches the queue twice: once from TED, once from a programme
 * page, once from a manual URL. Three rows for one opportunity is worse than a
 * missing row — the reviewer triages the same thing three times and the counts
 * lie.
 *
 * The key is deliberately conservative: issuer + a normalized title stem +
 * the application deadline when there is one. Two records collapse only when
 * all three agree. A false merge hides an opportunity, so when in doubt the
 * records stay apart, and every merge is recorded on the survivor
 * (`mergedFrom`) rather than silently dropping the loser.
 */

/** Lowercase, strip accents and punctuation, collapse whitespace. */
export function normalizeText(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Noise words that vary between publishers for the same call. */
const STOPWORDS = new Set([
  "the", "a", "an", "of", "for", "and", "to", "in", "on", "de", "des", "du", "la", "le", "les",
  "call", "calls", "notice", "tender", "procurement", "contract", "award", "services", "service",
]);

/** The stem used for identity: the first 8 meaningful title words. */
export function titleStem(title: string, words = 8): string {
  return normalizeText(title)
    .split(" ")
    .filter((w) => w.length > 2 && !STOPWORDS.has(w))
    .slice(0, words)
    .join("-");
}

function applicationDeadline(r: ConsoleRecord): string {
  const app = r.deadlines.find((d) => d.deadlineType === "APPLICATION" && d.normalized);
  return (app?.normalized ?? r.deadlines.find((d) => d.normalized)?.normalized ?? "").slice(0, 10);
}

/** Stable identity key for an opportunity, independent of which source found it. */
export function dedupKey(r: ConsoleRecord): string {
  const issuer = normalizeText(r.issuer).split(" ").slice(0, 4).join("-") || "unknown-issuer";
  const deadline = applicationDeadline(r) || "no-deadline";
  return `${issuer}|${titleStem(r.title)}|${deadline}`;
}

/**
 * Which of two records for the same opportunity to keep. Richer evidence wins:
 * an ingested artifact beats none, then more facts, then higher information
 * confidence, then the longer title (usually the less truncated one). Purely
 * deterministic — the same input pair always yields the same survivor.
 */
function preferred(a: ConsoleRecord, b: ConsoleRecord): ConsoleRecord {
  const artifact = Number(!!b.artifact) - Number(!!a.artifact);
  if (artifact !== 0) return artifact > 0 ? b : a;
  if (b.facts.length !== a.facts.length) return b.facts.length > a.facts.length ? b : a;
  if (b.scores.infoConfidence !== a.scores.infoConfidence) {
    return b.scores.infoConfidence > a.scores.infoConfidence ? b : a;
  }
  return b.title.length > a.title.length ? b : a;
}

export interface DedupResult {
  records: ConsoleRecord[];
  /** How many rows were merged away (records removed from the queue). */
  merged: number;
}

/**
 * Collapse duplicates, keeping the richest record and recording what was merged
 * into it. Input order is preserved for survivors — the queue does not reshuffle
 * because a duplicate appeared.
 */
export function dedupeRecords(records: ConsoleRecord[]): DedupResult {
  const byKey = new Map<string, ConsoleRecord>();
  const order: string[] = [];
  let merged = 0;

  for (const record of records) {
    const key = dedupKey(record);
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, { ...record, dedupKey: key });
      order.push(key);
      continue;
    }

    merged += 1;
    const winner = preferred(existing, record);
    const loser = winner === existing ? record : existing;
    byKey.set(key, {
      ...winner,
      dedupKey: key,
      // Union of the discovery provenance: a record found for two projects is
      // still relevant to both after the merge.
      discoveredFor: [...new Set([...(existing.discoveredFor ?? []), ...(record.discoveredFor ?? [])])],
      mergedFrom: [
        ...new Set([
          ...(existing.mergedFrom ?? []),
          ...(record.mergedFrom ?? []),
          loser.id,
        ]),
      ],
      warnings: [
        ...winner.warnings,
        `merged duplicate ${loser.id} (${loser.officialUrl ?? "no url"}) — same issuer, title stem and deadline`,
      ],
    });
  }

  return { records: order.map((k) => byKey.get(k)!), merged };
}
