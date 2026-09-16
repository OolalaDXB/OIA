import type { MaterialFact, SourceLocator } from "./models";
import { extractHtmlBlocks, htmlToVisibleText, type HtmlBlock } from "./html";

/**
 * What a tender notice actually says — extracted from the page the pipeline
 * already downloads, hashes and parses, and then threw away.
 *
 * The matcher used to compare a project against a 54-character title:
 *
 *     "Italy-Rome: Machine tools"
 *
 * That is the whole basis on which a project was or was not suggested. Meanwhile
 * the notice page — with the scope, the estimated value, the procedure, the
 * place of performance and the lots — had been fetched, verified and discarded.
 * This module turns that page into provenance-typed facts, which the matching
 * corpus reads for free because it already reads facts.
 *
 * Deterministic: regular expressions and section headings, no model. Every fact
 * carries its locator and its confidence, and the confidences are deliberately
 * modest — a heading-based extraction is a good guess about a document's
 * structure, not a reading of it.
 */

/** Longest scope text kept. Enough to match on; short enough not to bloat a row. */
export const SCOPE_MAX = 1200;

/**
 * Section headings, in the languages the notices are actually written in.
 *
 * These patterns were English-only, and the measurement showed the cost: an
 * eligibility section was found on 9 records out of 47, so the analyst was
 * asked "can we apply?" about documents whose eligibility text had never been
 * extracted, and correctly answered "the document does not say".
 *
 * TED titles are translated to English; the BODY is in the buyer's language.
 * A German notice says "Eignungskriterien", an Italian one "Criteri di
 * selezione" — neither matches /eligib|selection criteria/. The extractor was
 * looking for words that were never going to be there.
 *
 * The terms below are the standard eForms procurement vocabulary in the seven
 * languages this registry's buyer countries use. They are UNVERIFIED against a
 * live notice from this environment, which has no egress — so the worker
 * measures and prints the eligibility hit rate on every run, and the next real
 * run either proves this or shows it did nothing.
 *
 * The widening was done, and the measurement came back 19/205. The patterns
 * were not the problem: TED's HTML page is a SUMMARY and carries no criteria
 * section in any language. That is what `ted-notice-xml.ts` exists for — it
 * reads the notice's structured record, where the criteria are typed elements.
 * These patterns still earn their place on every non-TED source and on the
 * older notices whose HTML does carry a LEFTI block.
 */
const SECTION_PATTERNS: Array<{ field: string; re: RegExp; confidence: number }> = [
  {
    field: "scope",
    re: /\b(description|object of the contract|scope|purpose|short description|objet|description succincte|beschreibung|auftragsgegenstand|leistungsbeschreibung|oggetto|descrizione|objeto|descripción|voorwerp|omschrijving|objeto do contrato)\b/i,
    confidence: 0.7,
  },
  {
    field: "eligibility",
    re: /\b(eligib|selection criteria|conditions? for participation|participation|suitability|exclusion grounds|critères de sélection|conditions de participation|motifs d'exclusion|capacité (?:économique|technique)|eignungskriterien|teilnahmebedingungen|ausschlussgründe|(?:wirtschaftliche|technische)[a-zäöüß ]*leistungsfähigkeit|criteri di selezione|condizioni di partecipazione|motivi di esclusione|criterios de selección|condiciones de participación|motivos de exclusión|selectiecriteria|uitsluitingsgronden|deelnemingsvoorwaarden|critérios de seleção|urvalskriterier)\b/i,
    confidence: 0.65,
  },
  {
    field: "award_criteria",
    re: /\b(award criteria|criteria for award|attribution|critères d'attribution|zuschlagskriterien|criteri di aggiudicazione|criterios de adjudicación|gunningscriteria|critérios de adjudicação|tilldelningskriterier)\b/i,
    confidence: 0.65,
  },
];

const ESTIMATED_VALUE =
  /\b(?:estimated (?:total )?value|total value|value excluding vat|budget|valeur (?:totale )?estimée|montant estimé|geschätzter (?:gesamt)?wert|auftragswert|valore stimato|importo stimato|valor estimado|geraamde waarde)\b[^.\n]{0,80}?((?:eur|€|gbp|£|usd|\$)\s?[\d][\d\s.,]*(?:million|bn|m)?)/i;
const PROCEDURE =
  /\b(open procedure|restricted procedure|competitive procedure with negotiation|competitive dialogue|innovation partnership|negotiated procedure(?: without prior publication)?|direct award)\b/i;
const NUTS = /\bNUTS(?: code)?\s*:?\s*([A-Z]{2}[A-Z0-9]{0,3})\b/;
const PLACE = /\b(?:place of performance|main site or place of performance|lieu d'exécution)\b\s*:?\s*([^.\n]{3,80})/i;
const LOT = /\blot\s*(?:n[o°.]?\s*)?(\d{1,3})\b/gi;
const CPV_CODE = /\b(\d{8})(?:-\d)?\b/g;

function fact(
  field: string,
  normalizedValue: string,
  originalSourceText: string,
  locator: SourceLocator,
  artifactId: string,
  confidence: number,
  method: string,
): MaterialFact {
  return {
    field,
    normalizedValue: normalizedValue.slice(0, SCOPE_MAX),
    originalSourceText: originalSourceText.slice(0, 300),
    // An official page, read deterministically. Never CONFIRMED_OFFICIAL: that
    // still requires a human, here as everywhere else.
    classification: "EXTRACTED_FROM_OFFICIAL_SOURCE",
    sourceArtifactId: artifactId,
    locator,
    extractionMethod: method,
    extractingProvider: "deterministic",
    extractingModel: "tender-rules-v1",
    extractionConfidence: confidence,
    validationResult: "unchecked",
    reviewerCorrection: null,
    auditEventId: null,
  };
}

function blockLocator(b: HtmlBlock): SourceLocator {
  return b.heading ? { type: "HTML_HEADING", value: b.selector } : { type: "CSS_SELECTOR", value: b.selector };
}

/** Longest of the sections whose heading matches — the fullest statement wins. */
function sectionText(blocks: HtmlBlock[], re: RegExp): HtmlBlock | undefined {
  const matches = blocks.filter((b) => b.heading && re.test(b.heading) && b.text.length > 40);
  if (matches.length === 0) return undefined;
  return matches.sort((a, b) => b.text.length - a.text.length)[0];
}

export interface TenderExtractionOptions {
  artifactId: string;
  /** CPV codes already known from the search API, to avoid re-reporting them. */
  knownCpv?: string[];
}

/**
 * Extract the fields that decide whether a call is worth a project's time.
 * Returns only what it found: a missing section yields no fact, never a guess.
 */
export function extractTenderFacts(html: string, opts: TenderExtractionOptions): MaterialFact[] {
  const blocks = extractHtmlBlocks(html);
  const text = htmlToVisibleText(html);
  const facts: MaterialFact[] = [];
  const { artifactId } = opts;

  // 1. Named sections, by heading.
  for (const { field, re, confidence } of SECTION_PATTERNS) {
    const block = sectionText(blocks, re);
    if (!block) continue;
    facts.push(
      fact(field, block.text, block.heading ?? block.text, blockLocator(block), artifactId, confidence, "html-section"),
    );
  }

  // 2. A scope of last resort: without a recognised heading the matcher would
  // be back to the title alone, so take the document's opening prose instead
  // and say plainly, through the locator, that it is not a labelled section.
  if (!facts.some((f) => f.field === "scope") && text.length > 200) {
    facts.push(
      fact(
        "scope",
        text.slice(0, SCOPE_MAX),
        text.slice(0, 300),
        { type: "DOCUMENT_SECTION", value: "opening text (no description heading found)" },
        artifactId,
        0.4,
        "html-fallback",
      ),
    );
  }

  const value = ESTIMATED_VALUE.exec(text);
  if (value?.[1]) {
    facts.push(
      fact(
        "estimated_value",
        value[1].replace(/\s+/g, " ").trim(),
        value[0],
        { type: "DOCUMENT_SECTION", value: "estimated value" },
        artifactId,
        0.7,
        "regex",
      ),
    );
  }

  const procedure = PROCEDURE.exec(text);
  if (procedure?.[1]) {
    facts.push(
      fact(
        "procedure",
        procedure[1].toLowerCase(),
        procedure[0],
        { type: "DOCUMENT_SECTION", value: "procedure" },
        artifactId,
        0.75,
        "regex",
      ),
    );
  }

  const place = PLACE.exec(text);
  if (place?.[1]) {
    facts.push(
      fact(
        "place_of_performance",
        place[1].trim(),
        place[0],
        { type: "DOCUMENT_SECTION", value: "place of performance" },
        artifactId,
        0.6,
        "regex",
      ),
    );
  }

  const nuts = NUTS.exec(text);
  if (nuts?.[1]) {
    facts.push(
      fact("nuts_code", nuts[1], nuts[0], { type: "DOCUMENT_SECTION", value: "NUTS" }, artifactId, 0.7, "regex"),
    );
  }

  const lots = new Set<string>();
  for (const m of text.matchAll(LOT)) lots.add(m[1]!);
  if (lots.size > 0) {
    facts.push(
      fact(
        "lots",
        String(lots.size),
        `lot numbers seen: ${[...lots].sort().join(", ").slice(0, 200)}`,
        { type: "DOCUMENT_SECTION", value: "lots" },
        artifactId,
        0.5,
        "regex",
      ),
    );
  }

  // 3. CPV codes present in the body but not in the search metadata: a notice
  // often carries secondary codes the search result never showed.
  const known = new Set(opts.knownCpv ?? []);
  const extra = new Set<string>();
  for (const m of text.matchAll(CPV_CODE)) {
    const code = m[1]!;
    // A CPV division is a plausible 8-digit number; so is a postcode. Require
    // the code to sit near the letters "CPV" to claim it as one.
    if (known.has(code) || extra.has(code)) continue;
    const around = text.slice(Math.max(0, m.index - 40), m.index + 20);
    if (/cpv/i.test(around)) extra.add(code);
  }
  if (extra.size > 0) {
    facts.push(
      fact(
        "cpv_additional",
        [...extra].join(", "),
        `CPV codes found in the notice body`,
        { type: "DOCUMENT_SECTION", value: "CPV" },
        artifactId,
        0.6,
        "regex",
      ),
    );
  }

  return facts;
}

/**
 * How much text the matcher will actually see for a record. The S2 measure:
 * before this module the median was a 54-character title.
 */
export function matchableTextLength(facts: readonly MaterialFact[], title: string, issuer: string): number {
  return (
    title.length + issuer.length + facts.reduce((n, f) => n + f.field.length + f.normalizedValue.length + 2, 0)
  );
}
