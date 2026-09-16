import { createHash } from "node:crypto";
import type { ConsoleData, ConsoleFact, ConsoleRecord } from "@oia/ingestion/console";
import { normalizeKind } from "@oia/ingestion/opportunity-kinds";
import type { MaterialFact } from "@oia/ingestion";

/**
 * Scouted aid calls → console records.
 *
 * Without this, the scout writes a report nobody reads and the console looks
 * exactly as it did before: the same "nothing runs" feeling, one layer deeper.
 *
 * The conversion is deliberately unflattering to its own source. A TED notice
 * comes from an official API with typed metadata; a scouted call comes from a
 * model reading a rendered web page. Both land at MANUAL_REVIEW_REQUIRED, but
 * they do NOT land equal:
 *
 *   - `infoConfidence` is capped at 35 here against 60 for TED. A model reading
 *     a page is a good lead and weak evidence, and the number has to say so,
 *     because the gate reads the number and a human reads the gate.
 *   - the gate's `notAggregatorOnly` is FALSE for a listing page. A regional
 *     aid index that mentions a scheme is not the scheme's own page, and
 *     treating it as one is precisely how a shortlist fills with things that
 *     cannot be applied to.
 *   - the unresolved questions name the model by id. "Who said this" is part of
 *     the claim.
 */

export interface ScoutedRecord {
  title: string;
  issuer: string;
  kind: string;
  sourceUrl: string;
  summary: string;
  eligibility: string;
  amountText: string;
  deadlineText: string;
  quote: string;
  sourceId: string;
  contentHash: string;
  facts: MaterialFact[];
}

/** A stable id, so the same call found next week is the same record. */
export function scoutedId(call: Pick<ScoutedRecord, "sourceId" | "sourceUrl">): string {
  const digest = createHash("sha1").update(call.sourceUrl, "utf8").digest("hex").slice(0, 10);
  return `scout-${call.sourceId}-${digest}`;
}

/**
 * Is this the call's own page, or the index that lists it?
 *
 * A heuristic, and it is only ever used to LOWER confidence — never to raise
 * it. When in doubt it assumes the listing, because the cost of over-trusting a
 * directory page is a shortlist entry a human cannot act on.
 */
export function looksLikeOwnPage(call: Pick<ScoutedRecord, "sourceUrl">, sourceUrl: string): boolean {
  try {
    const a = new URL(call.sourceUrl);
    const b = new URL(sourceUrl);
    if (a.host !== b.host) return true; // left the portal entirely — its own page
    const depth = (u: URL) => u.pathname.replace(/\/+$/, "").split("/").filter(Boolean).length;
    return depth(a) > depth(b);
  } catch {
    return false;
  }
}

function toConsoleFact(f: MaterialFact): ConsoleFact {
  return {
    field: f.field,
    normalizedValue: f.normalizedValue,
    classification: f.classification as ConsoleFact["classification"],
    locator: f.locator as ConsoleFact["locator"],
    extractionMethod: f.extractionMethod,
    extractingProvider: f.extractingProvider,
    extractingModel: f.extractingModel,
    extractionConfidence: f.extractionConfidence,
    originalSourceText: f.originalSourceText,
  };
}

export function scoutedToConsoleRecord(
  call: ScoutedRecord,
  opts: { sourcePageUrl: string; forProjects: readonly string[]; model: string },
): ConsoleRecord {
  const facts = call.facts.map(toConsoleFact);
  const ownPage = looksLikeOwnPage(call, opts.sourcePageUrl);

  const failedReasons = [
    "read by a model, not verified by a human",
    "eligibility not assessed against any project",
  ];
  if (!ownPage) failedReasons.push("this is the portal's listing page, not the call's own page");

  return {
    id: scoutedId(call),
    title: call.title,
    issuer: call.issuer,
    opportunityKind: normalizeKind(call.kind),
    discoveredFor: [...opts.forProjects],
    linkedBy: "officialUrl",
    officialUrl: call.sourceUrl,
    discoveryUrl: opts.sourcePageUrl,
    artifact: {
      id: scoutedId(call),
      sourceFormat: "STATIC_HTML",
      contentHash: call.contentHash,
      renderMethod: "HEADLESS",
      byteSize: 0,
      processing: "SUCCESS",
    },
    liveFetch: { attemptedUrl: opts.sourcePageUrl, status: "OK", egressDenied: false },
    verificationStatus: "MANUAL_REVIEW_REQUIRED",
    verificationEvidence: [
      `Rendered ${opts.sourcePageUrl} in a browser and read it with ${opts.model}.`,
      "The call's link was confirmed to appear on that page before this record was created.",
      call.quote ? `Quoted from the page: "${call.quote.slice(0, 200)}"` : "No quote was returned.",
    ],
    application: "UNKNOWN",
    award: "UNKNOWN",
    strategicRoute: "UNKNOWN",
    scores: {
      relevance: null,
      winPotential: null,
      // Capped well below TED's 60. Read by a model from a web page is the
      // weakest provenance in this system and the score has to show it.
      infoConfidence: Math.min(35, 10 + facts.length * 5 + (ownPage ? 5 : 0)),
    },
    gate: {
      accessiblePrimarySource: true,
      verifiedSource: false,
      verifiedDeadline: false,
      notExpired: true,
      eligibilityAssessed: false,
      notAggregatorOnly: ownPage,
      notClosedCall: true,
      hasExactNextAction: false,
      sufficientConfidence: false,
      pursueEligible: false,
      failedReasons,
    },
    recommendation: "INVESTIGATE",
    humanReview: "PENDING",
    facts,
    deadlines: [],
    conflicts: [],
    discrepancies: [],
    expected: {},
    unresolvedQuestions: [
      `Read from the page by ${opts.model}. Open the link and confirm this call exists and says what is recorded here.`,
      call.deadlineText
        ? `The page states a deadline of "${call.deadlineText}" — unparsed and unconfirmed.`
        : "No deadline was stated on the page. Many aid schemes are permanently open; confirm which this is.",
      call.eligibility
        ? "Eligibility text was extracted but NOT assessed against any project."
        : "No eligibility criteria were found on the page.",
    ],
    warnings: ownPage ? [] : ["Found on a listing page — the call's own page may say something different."],
  };
}

export function scoutedToConsole(
  calls: readonly ScoutedRecord[],
  sourcePages: Record<string, string>,
  forProjects: Record<string, readonly string[]>,
  model: string,
): ConsoleData {
  const records = calls.map((c) =>
    scoutedToConsoleRecord(c, {
      sourcePageUrl: sourcePages[c.sourceId] ?? c.sourceUrl,
      forProjects: forProjects[c.sourceId] ?? [],
      model,
    }),
  );
  return {
    note:
      "Aid scout — funding calls read by a model from public portals that have no API. " +
      "Every call was confirmed to be linked from the page it was read on. All are UNVERIFIED " +
      "and carry lower information confidence than an official API record, by design.",
    run: {
      records: records.length,
      artifactsIngested: records.length,
      discrepancies: 0,
      warnings: [],
      recommendationCounts: { INVESTIGATE: records.length },
    },
    records,
  };
}
