import type { MaterialFact, FactClassification, SourceLocator } from "./models";
import type { HtmlBlock } from "./html";
import type { PdfPage } from "./pdf";

/**
 * Deterministic fact extraction with provenance (spec §8). Every fact records
 * its original source text, a source locator, the extraction method, and a
 * classification. Deterministic extraction from an official artifact yields
 * EXTRACTED_FROM_OFFICIAL_SOURCE — never CONFIRMED_OFFICIAL, which requires a
 * human. An inferred value must never overwrite an official value.
 */

const TOPIC_ID = /\b([A-Z]{3,}[A-Z0-9]*(?:-[A-Z0-9]+){2,})\b/g;
const AMOUNT =
  /(?:€|£|\$|eur|gbp|usd|aed|qar)\s?\d[\d .,]*\s?(?:million|billion|m|bn|k)?\b/gi;

interface ExtractOptions {
  artifactId: string;
  officialSource: boolean;
  method: string;
}

function baseFact(
  field: string,
  normalizedValue: string,
  originalSourceText: string,
  locator: SourceLocator,
  opts: ExtractOptions,
  confidence: number,
): MaterialFact {
  const classification: FactClassification = opts.officialSource
    ? "EXTRACTED_FROM_OFFICIAL_SOURCE"
    : "UNKNOWN";
  return {
    field,
    normalizedValue,
    originalSourceText: originalSourceText.slice(0, 300),
    classification,
    sourceArtifactId: opts.artifactId,
    locator,
    extractionMethod: opts.method,
    extractingProvider: "deterministic",
    extractingModel: "rules-v1",
    extractionConfidence: confidence,
    validationResult: "unchecked",
    reviewerCorrection: null,
    auditEventId: null,
  };
}

function extractFromText(text: string, locator: SourceLocator, opts: ExtractOptions): MaterialFact[] {
  const facts: MaterialFact[] = [];
  const seen = new Set<string>();

  for (const m of text.matchAll(TOPIC_ID)) {
    const val = m[1]!;
    if (val.length < 8) continue; // avoid trivial all-caps words
    const key = `topic_identifier:${val}`;
    if (seen.has(key)) continue;
    seen.add(key);
    facts.push(baseFact("topic_identifier", val, m[0], locator, opts, 0.8));
  }
  for (const m of text.matchAll(AMOUNT)) {
    const val = m[0].replace(/\s+/g, " ").trim();
    const key = `amount:${val}`;
    if (seen.has(key)) continue;
    seen.add(key);
    facts.push(baseFact("amount", val, m[0], locator, opts, 0.6));
  }
  return facts;
}

/** Facts from HTML content blocks (CSS-selector / heading locators). */
export function extractFactsFromBlocks(
  blocks: HtmlBlock[],
  title: string | undefined,
  opts: Omit<ExtractOptions, "method">,
): MaterialFact[] {
  const facts: MaterialFact[] = [];
  if (title) {
    facts.push(
      baseFact(
        "title",
        title,
        title,
        { type: "HTML_HEADING", value: "title/h1" },
        { ...opts, method: "html-title" },
        0.8,
      ),
    );
  }
  for (const b of blocks) {
    const locator: SourceLocator = b.heading
      ? { type: "HTML_HEADING", value: b.selector }
      : { type: "CSS_SELECTOR", value: b.selector };
    facts.push(...extractFromText(`${b.heading ?? ""} ${b.text}`, locator, { ...opts, method: "css-selector" }));
  }
  return facts;
}

/** Facts from PDF pages — each fact retains its PDF_PAGE locator (spec test §18.10). */
export function extractFactsFromPages(
  pages: PdfPage[],
  opts: Omit<ExtractOptions, "method">,
): MaterialFact[] {
  const facts: MaterialFact[] = [];
  for (const page of pages) {
    const locator: SourceLocator = { type: "PDF_PAGE", value: `page ${page.pageNumber}`, page: page.pageNumber };
    facts.push(...extractFromText(page.text, locator, { ...opts, method: "pdf-text" }));
  }
  return facts;
}

/** A USER_PROVIDED fact (e.g. the manifest's expected title) — a hypothesis. */
export function userProvidedFact(field: string, value: string, artifactId: string): MaterialFact {
  return {
    field,
    normalizedValue: value,
    originalSourceText: value,
    classification: "USER_PROVIDED",
    sourceArtifactId: artifactId,
    locator: { type: "DOCUMENT_SECTION", value: "manifest" },
    extractionMethod: "manifest",
    extractingProvider: "user",
    extractingModel: "none",
    extractionConfidence: 0.5,
    validationResult: "unchecked",
    reviewerCorrection: null,
    auditEventId: null,
  };
}

/**
 * Merge rule: an INFERRED value must never overwrite a CONFIRMED_OFFICIAL or
 * EXTRACTED_FROM_OFFICIAL_SOURCE value for the same field. Conflicting OFFICIAL
 * values are preserved (both kept, flagged as conflict).
 */
const RANK: Record<FactClassification, number> = {
  CONFIRMED_OFFICIAL: 4,
  EXTRACTED_FROM_OFFICIAL_SOURCE: 3,
  USER_PROVIDED: 2,
  INFERRED: 1,
  UNKNOWN: 0,
};

export interface FieldView {
  field: string;
  chosen: MaterialFact;
  conflicts: MaterialFact[];
  hasOfficialConflict: boolean;
}

export function reconcileFacts(facts: MaterialFact[]): FieldView[] {
  const byField = new Map<string, MaterialFact[]>();
  for (const f of facts) {
    const arr = byField.get(f.field) ?? [];
    arr.push(f);
    byField.set(f.field, arr);
  }
  const views: FieldView[] = [];
  for (const [field, arr] of byField) {
    const sorted = [...arr].sort((a, b) => RANK[b.classification] - RANK[a.classification]);
    const chosen = sorted[0]!;
    const conflicts = sorted.slice(1).filter((f) => f.normalizedValue !== chosen.normalizedValue);
    const officialClasses: FactClassification[] = ["CONFIRMED_OFFICIAL", "EXTRACTED_FROM_OFFICIAL_SOURCE"];
    const officials = arr.filter((f) => officialClasses.includes(f.classification));
    const distinctOfficialValues = new Set(officials.map((f) => f.normalizedValue));
    views.push({
      field,
      chosen,
      conflicts,
      hasOfficialConflict: distinctOfficialValues.size > 1,
    });
  }
  return views;
}
