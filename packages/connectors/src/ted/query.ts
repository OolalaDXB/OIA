/**
 * TED expert-query builder (Sprint 1). Pure, unit-tested. TED expert syntax is
 * the same as the TED website Expert Search; the exact multi-value separator can
 * be validated live with `checkQuerySyntax: true`. Prefer pasting a query built
 * on the TED site via `ConnectorContext.env.tedQuery` when precision matters.
 */

export interface TedQueryInput {
  /** CPV codes, e.g. ["72000000", "48000000"]. */
  cpv?: string[];
  /** ISO 3-letter buyer countries, e.g. ["FRA", "LUX"]. */
  countries?: string[];
  /** Publication date lower bound, TED format YYYYMMDD (optional). */
  publishedSince?: string;
}

/** Minimal BAWABA sector → CPV lookup (digital / AI / creative). Connector-local. */
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

/** Build a TED expert query. Returns undefined when there is nothing to filter on. */
export function buildTedExpertQuery(input: TedQueryInput): string | undefined {
  const parts: string[] = [];
  if (input.cpv && input.cpv.length > 0) {
    parts.push(`classification-cpv IN (${input.cpv.join(" ")})`);
  }
  if (input.countries && input.countries.length > 0) {
    parts.push(`buyer-country IN (${input.countries.join(" ")})`);
  }
  if (input.publishedSince) {
    parts.push(`publication-date>=${input.publishedSince}`);
  }
  return parts.length > 0 ? parts.join(" AND ") : undefined;
}
