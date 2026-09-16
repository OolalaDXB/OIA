import * as cheerio from "cheerio";
import type { MaterialFact, SourceLocator } from "./models";

/**
 * Read a TED notice's XML, which carries what the HTML summary page does not.
 *
 * The measurement that forced this: after widening the HTML section patterns to
 * seven languages, an eligibility section was found on 19 records out of 205.
 * The patterns were not the problem. The HTML page TED serves is a SUMMARY —
 * the selection criteria live in the notice's structured XML, and the tender
 * documents themselves live behind a national portal that usually wants an
 * account.
 *
 * So this reads the XML, which every search result already links to and which
 * needs no account. eForms carries the criteria as typed elements:
 *
 *   selection criteria      efac:SelectionCriteria / cbc:Description
 *   exclusion grounds       cac:TendererQualificationRequest / …
 *   award criteria          cac:AwardingCriterion / cbc:Description
 *   procurement documents   cac:CallForTendersDocumentReference → cbc:URI
 *   submission deadline     cac:TenderSubmissionDeadlinePeriod / cbc:EndDate
 *   estimated value         cbc:EstimatedOverallContractAmount
 *
 * Older notices (pre-2023) use the TED_EXPORT schema instead, with entirely
 * different tags — SUITABILITY, ECONOMIC_FINANCIAL_CAPACITY. Both are read,
 * because the archive is full of the old shape and half-reading it would be a
 * silent gap of exactly the kind this file exists to close.
 *
 * Matching is on LOCAL NAME throughout: eForms XML arrives with several
 * namespace prefixes and a parser that insists on one of them finds nothing.
 */

/** Elements whose text is eligibility, by local name, in both schemas. */
const ELIGIBILITY_TAGS = [
  // eForms
  "SelectionCriteria",
  "SpecificTendererRequirement",
  "TendererQualificationRequest",
  // TED_EXPORT (legacy)
  "SUITABILITY",
  "ECONOMIC_FINANCIAL_CAPACITY",
  "TECHNICAL_PROFESSIONAL_CAPACITY",
  "ECONOMIC_FINANCIAL_INFO",
  "TECHNICAL_PROFESSIONAL_INFO",
  "INFORMATION_AND_FORMALITIES",
  "MINIMUM_LEVEL",
];

const AWARD_TAGS = ["AwardingCriterion", "SubordinateAwardingCriterion", "AC_QUALITY", "AC_CRITERION", "AC_PRICE"];
const SCOPE_TAGS = ["ProcurementProject", "SHORT_DESCR", "SHORT_CONTRACT_DESCRIPTION", "DESCRIPTION"];
const DEADLINE_TAGS = ["TenderSubmissionDeadlinePeriod", "DATE_RECEIPT_TENDERS", "ParticipationRequestReceptionPeriod"];
// The legacy export spells it VAL_ESTIMATED_TOTAL / VAL_TOTAL, not VALUE_*.
const VALUE_TAGS = ["EstimatedOverallContractAmount", "EstimatedValue", "VAL_ESTIMATED_TOTAL", "VAL_TOTAL", "VAL_OBJECT"];

/** Tags that carry a link to the tender documents themselves. */
const DOCUMENT_TAGS = ["CallForTendersDocumentReference", "ProcurementDocumentReference", "URL_DOCUMENT", "DOCUMENT_FULL"];

export interface TedXmlFacts {
  eligibility: string;
  awardCriteria: string;
  scope: string;
  deadline: string;
  estimatedValue: string;
  /** Where the tender documents live, when the notice says. */
  documentsUrl: string;
  /** Which schema this notice used — eForms or the legacy export. */
  schema: "EFORMS" | "TED_EXPORT" | "UNKNOWN";
  /**
   * The root element's local name, verbatim.
   *
   * The first real run came back with 10 notices out of 25 classified
   * UNKNOWN, which says nothing about what they actually were. The root
   * element is the one fact that always exists, so it is reported rather
   * than guessed at — a run that finds a shape this file does not read can
   * then name it instead of shrugging.
   */
  rootElement: string;
}

function textOf(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/** eForms arrives with several namespace prefixes; the local name is the identity. */
function localName(el: unknown): string {
  const name = (el as { tagName?: string }).tagName ?? "";
  return (name.includes(":") ? name.slice(name.indexOf(":") + 1) : name).toLowerCase();
}

/** The shape this file needs off a parsed node — cheerio's own types vary by version. */
interface XmlNode {
  tagName?: string;
  parent?: XmlNode | null;
}

/** True when an ancestor is itself one of the wanted elements. */
function nestedInside(el: unknown, wanted: ReadonlySet<string>): boolean {
  let p = (el as XmlNode).parent ?? null;
  while (p) {
    if (wanted.has(localName(p))) return true;
    p = p.parent ?? null;
  }
  return false;
}

interface CollectOptions {
  /** Hard cap on the joined text. */
  max?: number;
  /** Shortest text worth keeping. Criteria prose needs a floor; a value does not. */
  min?: number;
  /** Attributes worth keeping beside the text — the currency on an amount, which
   * eForms spells currencyID and the legacy export spells CURRENCY. */
  withAttr?: readonly string[];
}

/**
 * Collect the text under every OUTERMOST element with one of these local names.
 *
 * Outermost matters: both schemas nest their criteria (eForms puts
 * SpecificTendererRequirement inside TendererQualificationRequest; the legacy
 * export puts INFORMATION_AND_FORMALITIES inside ECONOMIC_FINANCIAL_CAPACITY).
 * Collecting every match would repeat the same sentences two and three times
 * and hand the analyst padding it would have to read as evidence.
 */
function collect($: cheerio.CheerioAPI, tags: readonly string[], options: CollectOptions = {}): string {
  const { max = 4000, min = 8, withAttr } = options;
  const wanted = new Set(tags.map((t) => t.toLowerCase()));
  const parts: string[] = [];
  $("*").each((_i, el) => {
    if (!wanted.has(localName(el))) return;
    if (nestedInside(el, wanted)) return;
    let t = textOf($(el).text());
    for (const name of withAttr ?? []) {
      const attr = $(el).attr(name);
      if (attr) t = `${t} ${attr}`.trim();
    }
    if (t.length >= min && !parts.includes(t)) parts.push(t);
  });
  return parts.join(" · ").slice(0, max);
}

/** The first URL found under a documents element. */
function documentsUrl($: cheerio.CheerioAPI): string {
  let found = "";
  const wanted = new Set(DOCUMENT_TAGS.map((t) => t.toLowerCase()));
  $("*").each((_i, el) => {
    if (found) return;
    if (!wanted.has(localName(el))) return;
    const text = textOf($(el).text());
    const match = text.match(/https?:\/\/[^\s"'<>]+/);
    if (match) found = match[0];
  });
  return found;
}

/** eForms document roots, by local name. All of them are UBL. */
const EFORMS_ROOTS = new Set([
  "contractnotice",
  "contractawardnotice",
  "priorinformationnotice",
  "tender",
  "tenderercontractnotice",
]);

export function readTedNoticeXml(xml: string): TedXmlFacts {
  const $ = cheerio.load(xml, { xmlMode: true });

  // Read the root rather than pattern-matching the whole document: a legacy
  // export that happens to quote the word "ContractNotice" in a description
  // would otherwise be called eForms.
  let rootElement = "";
  $("*").each((_i, el) => {
    if (!rootElement) rootElement = localName(el);
  });

  const schema: TedXmlFacts["schema"] =
    EFORMS_ROOTS.has(rootElement) || /efac:|efbc:/i.test(xml)
      ? "EFORMS"
      : rootElement === "ted_export" || /<TED_EXPORT|FORM_SECTION/i.test(xml)
        ? "TED_EXPORT"
        : "UNKNOWN";

  return {
    eligibility: collect($, ELIGIBILITY_TAGS),
    awardCriteria: collect($, AWARD_TAGS, { max: 1500 }),
    scope: collect($, SCOPE_TAGS, { max: 2000 }),
    // A date is 10 characters and an amount can be 7 — the prose floor would
    // have dropped both, silently, which is how this file's own bugs start.
    deadline: collect($, DEADLINE_TAGS, { max: 200, min: 4 }),
    estimatedValue: collect($, VALUE_TAGS, { max: 200, min: 1, withAttr: ["currencyID", "CURRENCY"] }),
    documentsUrl: documentsUrl($),
    schema,
    rootElement,
  };
}

/**
 * Turn what the XML said into provenance-typed facts.
 *
 * Confidence is higher than the HTML extractor's, and deliberately so: these
 * are typed elements from the publisher's own structured record, not prose
 * under a heading a regex recognised.
 */
export function tedXmlToFacts(facts: TedXmlFacts, artifactId: string, xmlUrl: string): MaterialFact[] {
  const locator = (element: string): SourceLocator => ({ type: "JSON_PATH", value: `${xmlUrl}#${element}` });
  const out: MaterialFact[] = [];
  const add = (field: string, value: string, element: string, confidence: number) => {
    if (!value.trim()) return;
    out.push({
      field,
      normalizedValue: value.trim(),
      originalSourceText: value.trim().slice(0, 400),
      classification: "EXTRACTED_FROM_OFFICIAL_SOURCE",
      sourceArtifactId: artifactId,
      locator: locator(element),
      extractionMethod: "xml-element",
      extractingProvider: "deterministic",
      extractingModel: "ted-eforms-v1",
      extractionConfidence: confidence,
      validationResult: "unchecked",
    });
  };

  add("eligibility", facts.eligibility, "SelectionCriteria", 0.85);
  add("award_criteria", facts.awardCriteria, "AwardingCriterion", 0.85);
  add("scope", facts.scope, "ProcurementProject", 0.8);
  add("deadline_text", facts.deadline, "TenderSubmissionDeadlinePeriod", 0.85);
  add("estimated_value", facts.estimatedValue, "EstimatedOverallContractAmount", 0.85);
  add("tender_documents_url", facts.documentsUrl, "CallForTendersDocumentReference", 0.9);
  return out;
}
