/**
 * TED expert-query builder.
 *
 * The syntax is the TED website's Expert Search. Three clauses are PROVEN — a
 * real recorded run used them and came back with notices:
 *
 *   classification-cpv IN (...)   buyer-country IN (...)   publication-date>=YYYYMMDD
 *
 * Two more would be valuable and are NOT proven from this environment, which
 * has no egress to TED: filtering by `notice-type`, and full-text terms. Rather
 * than gamble a whole run on syntax I cannot test, the query is built in
 * LAYERS ordered from proven to speculative, and the caller drops the newest
 * layer whenever TED rejects the query (see `narrowQuery`). A speculative
 * clause can therefore make a run better; it can never make one fail.
 *
 * Correctness never depends on the speculative layers: the worker also
 * classifies `notice-type` on the results it receives, so the noise is removed
 * whether or not the server agreed to filter it.
 */

export interface TedQueryInput {
  /** CPV codes, e.g. ["72212000", "72230000"]. */
  cpv?: string[];
  /** ISO 3-letter buyer countries, e.g. ["FRA", "LUX"]. */
  countries?: string[];
  /** Publication date lower bound, TED format YYYYMMDD. */
  publishedSince?: string;
  /** notice-type values to keep, e.g. ["cn-standard", "cn-social"]. SPECULATIVE. */
  noticeTypes?: string[];
  /** Free-text terms, OR-ed against the notice text. SPECULATIVE. */
  fullText?: string[];
}

export interface QueryLayer {
  name: string;
  clause: string;
  /** False when the syntax has never been confirmed against the live API. */
  proven: boolean;
}

/** Minimal sector → CPV lookup, kept for callers with no registry entry. */
const SECTOR_CPV: Array<[RegExp, string]> = [
  [/\b(ai|artificial intelligence|machine learning|data)\b/i, "72000000"], // IT services
  [/\b(software|platform|saas|application)\b/i, "48000000"], // software packages
  [/\b(digital|it|information technology)\b/i, "72000000"],
  [/\b(research|r&d|innovation)\b/i, "73000000"], // R&D services
  [/\b(creative|cultural|culture|media|content)\b/i, "92000000"], // recreational/cultural
];

export function sectorsToCpv(sectors: string[]): string[] {
  const out = new Set<string>();
  for (const s of sectors) for (const [re, cpv] of SECTOR_CPV) if (re.test(s)) out.add(cpv);
  return [...out];
}

/** Quote a free-text term for the expert-search full-text operator. */
function quote(term: string): string {
  return `"${term.replace(/"/g, "").trim()}"`;
}

/**
 * The query as an ordered list of layers, proven first. Callers join them with
 * AND and may drop from the end.
 */
export function buildTedQueryLayers(input: TedQueryInput): QueryLayer[] {
  const layers: QueryLayer[] = [];

  if (input.cpv && input.cpv.length > 0) {
    layers.push({ name: "cpv", clause: `classification-cpv IN (${input.cpv.join(" ")})`, proven: true });
  }
  if (input.countries && input.countries.length > 0) {
    layers.push({ name: "country", clause: `buyer-country IN (${input.countries.join(" ")})`, proven: true });
  }
  if (input.publishedSince) {
    layers.push({ name: "recency", clause: `publication-date>=${input.publishedSince}`, proven: true });
  }
  if (input.noticeTypes && input.noticeTypes.length > 0) {
    layers.push({
      name: "notice-type",
      clause: `notice-type IN (${input.noticeTypes.join(" ")})`,
      proven: false,
    });
  }
  if (input.fullText && input.fullText.length > 0) {
    const terms = input.fullText.map(quote).join(" OR ");
    layers.push({ name: "full-text", clause: `FT ~ (${terms})`, proven: false });
  }

  return layers;
}

export function queryFromLayers(layers: readonly QueryLayer[]): string | undefined {
  return layers.length > 0 ? layers.map((l) => l.clause).join(" AND ") : undefined;
}

/**
 * Drop the last speculative layer. Returns null once only proven layers remain —
 * at which point a rejection is a real problem, not an unverified guess, and the
 * caller should surface it rather than keep degrading.
 */
export function narrowQuery(layers: readonly QueryLayer[]): QueryLayer[] | null {
  for (let i = layers.length - 1; i >= 0; i--) {
    if (!layers[i]!.proven) return [...layers.slice(0, i), ...layers.slice(i + 1)];
  }
  return null;
}

/** Build a TED expert query. Returns undefined when there is nothing to filter on. */
export function buildTedExpertQuery(input: TedQueryInput): string | undefined {
  return queryFromLayers(buildTedQueryLayers(input));
}
