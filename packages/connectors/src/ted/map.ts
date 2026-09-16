import { z } from "zod";
import type { RawOpportunity } from "../types";

/**
 * Maps a TED Search API response (POST /v3/notices/search) into the EXISTING
 * `RawOpportunity` candidate model. Pure. Defensive parsing: TED field values
 * may be plain strings, language maps ({eng,fra,...}) or arrays; missing/renamed
 * fields fail soft (skipped), never invented.
 *
 * The canonical official notice URL is the candidate's primary source:
 *   https://ted.europa.eu/{lang}/notice/{publication-number}/html
 */

export const TED_FIELDS = [
  "publication-number",
  "notice-title",
  "buyer-name",
  "buyer-country",
  "publication-date",
  "deadline",
  "classification-cpv",
  "notice-type",
  "links",
] as const;

const NoticeSchema = z.record(z.string(), z.unknown());

export const TedSearchResponseSchema = z
  .object({
    // Real TED responses return these as null in PAGE_NUMBER mode → tolerate null.
    totalNoticeCount: z.number().nullish(),
    iterationNextToken: z.string().nullish(),
    // The envelope names the array `notices`; accept `results` defensively too.
    notices: z.array(NoticeSchema).nullish(),
    results: z.array(NoticeSchema).nullish(),
  })
  .passthrough();

export type TedSearchResponse = z.infer<typeof TedSearchResponseSchema>;
export type TedNotice = Record<string, unknown>;

export function noticeUrl(publicationNumber: string, lang = "en"): string {
  return `https://ted.europa.eu/${lang}/notice/${publicationNumber}/html`;
}

/** Extract a display string from a TED value (string | lang-map | array). */
export function pickText(value: unknown): string | undefined {
  if (value == null) return undefined;
  if (typeof value === "string") return value.trim() || undefined;
  if (typeof value === "number") return String(value);
  if (Array.isArray(value)) {
    for (const v of value) {
      const s = pickText(v);
      if (s) return s;
    }
    return undefined;
  }
  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    for (const key of ["eng", "en", "ENG", "EN"]) {
      if (obj[key] != null) return pickText(obj[key]);
    }
    for (const v of Object.values(obj)) {
      const s = pickText(v);
      if (s) return s;
    }
  }
  return undefined;
}

export function pickList(value: unknown): string[] {
  if (value == null) return [];
  if (Array.isArray(value)) return value.map((v) => pickText(v)).filter((s): s is string => !!s);
  const s = pickText(value);
  return s ? [s] : [];
}

export function getNotices(parsed: TedSearchResponse): TedNotice[] {
  return parsed.notices ?? parsed.results ?? [];
}

/** Field provenance for the worker's output (URL + JSON-path locator per field). */
export interface TedFieldProvenance {
  field: string;
  value: string;
  locator: { type: "JSON_PATH"; value: string };
}

export function noticeProvenance(notice: TedNotice): TedFieldProvenance[] {
  const out: TedFieldProvenance[] = [];
  for (const f of TED_FIELDS) {
    const v = f === "classification-cpv" ? pickList(notice[f]).join(", ") : pickText(notice[f]);
    if (v) out.push({ field: f, value: v, locator: { type: "JSON_PATH", value: f } });
  }
  return out;
}

/** Map a parsed TED response into deduped RawOpportunity candidates. */
export function mapTedNotices(raw: unknown, discoveredAt: string): RawOpportunity[] {
  const parsed = TedSearchResponseSchema.parse(raw);
  const seen = new Set<string>();
  const out: RawOpportunity[] = [];

  for (const notice of getNotices(parsed)) {
    const pub = pickText(notice["publication-number"]);
    if (!pub || seen.has(pub)) continue; // dedup by publication-number
    seen.add(pub);

    const title = pickText(notice["notice-title"]) ?? pub;
    const buyer = pickText(notice["buyer-name"]);
    const deadline = pickText(notice["deadline"]);

    out.push({
      sourceKey: "ted",
      externalId: pub,
      title,
      url: noticeUrl(pub),
      discoveredAt,
      hints: {
        // The notice type decides whether this is a call at all (see
        // notice-type.ts): 81% of a real recorded run were qualification
        // systems, which have no deadline and nothing to bid on.
        noticeType: pickText(notice["notice-type"]),
        programmeName: pickText(notice["notice-type"]),
        funder: buyer ?? "European Union — TED",
        deadlineAt: deadline,
        status: "unknown",
        summary: undefined,
        currency: "EUR",
      },
      raw: notice, // full notice retained (country/CPV live here — see plan doc)
    });
  }
  return out;
}
