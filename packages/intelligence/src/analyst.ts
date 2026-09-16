import { z } from "zod";

/**
 * The analyst — can we actually apply to this?
 *
 * After the scout, the console holds 270 opportunities and not one of them has
 * an eligibility assessment. That is 270 lines to open by hand, and a shortlist
 * nobody has time to read is the same as no shortlist. The analyst reads each
 * opportunity against a project's dossier and says which of four things is true,
 * in both languages, with the sentences it relied on.
 *
 * WHAT IT DOES NOT DO is decide. This distinction is the whole product:
 *
 *   - Its verdict never flips the gate's `eligibilityAssessed` to true. A model
 *     judging is not a human judging, and a gate a model can open is not a gate.
 *     What changes is the REASON shown: "nobody has judged whether we can apply"
 *     becomes "a model judged — you have not confirmed", which is the same block
 *     with better information.
 *   - It changes what you see FIRST, not what you are allowed to pursue. 270
 *     records become a dozen worth an hour, and the other 258 keep their reason
 *     for being set aside, in writing, contestable.
 *
 * Every claim must quote the record. `verdictViolations` checks that
 * deterministically, because "only use what the document says" is a wish and a
 * function is a check.
 */

export const VERDICTS = ["ELIGIBLE", "LIKELY", "NEEDS_INFO", "NOT_ELIGIBLE"] as const;
export type Verdict = (typeof VERDICTS)[number];

/** How a verdict should be read, in both languages. */
export const VERDICT_MEANING: Record<Verdict, { fr: string; en: string }> = {
  ELIGIBLE: {
    fr: "Rien dans le document ne nous exclut, et l'entité est identifiée.",
    en: "Nothing in the document rules us out, and the entity is identified.",
  },
  LIKELY: {
    fr: "Probablement pour nous, mais un critère reste à confirmer.",
    en: "Probably for us, but one criterion is still to confirm.",
  },
  NEEDS_INFO: {
    fr: "Impossible de trancher : le document ne dit pas qui peut candidater.",
    en: "Cannot be decided: the document does not say who may apply.",
  },
  NOT_ELIGIBLE: {
    fr: "Exclu par un critère écrit dans le document.",
    en: "Ruled out by a criterion written in the document.",
  },
};

const Bilingual = z.object({ fr: z.string().default(""), en: z.string().default("") });

/**
 * Accept the singular where the schema asks for a list.
 *
 * A real response came back with `"citation": "…"` instead of
 * `"citations": ["…"]`. One value where a list was expected is a shape
 * disagreement, not a wrong answer, and rejecting the whole verdict over it
 * loses the analysis.
 */
function acceptSingular(raw: unknown): unknown {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return raw;
  const obj = { ...(raw as Record<string, unknown>) };
  if (obj["citations"] === undefined && typeof obj["citation"] === "string") {
    obj["citations"] = [obj["citation"]];
  }
  if (obj["missing"] === undefined && typeof obj["missing_information"] === "string") {
    obj["missing"] = [obj["missing_information"]];
  }
  if (typeof obj["missing"] === "string") obj["missing"] = [obj["missing"]];
  return obj;
}

export const EligibilityVerdictSchema = z.preprocess(acceptSingular, z.object({
  verdict: z.enum(VERDICTS),
  /** Why, in the operator's language and in English. */
  reason: Bilingual,
  /** Which legal entity would apply, when the document makes that answerable. */
  entity: z.string().default(""),
  /** What is missing before this could be decided or submitted. */
  missing: z.array(z.string()).default([]),
  /** The single next thing to do. */
  nextAction: Bilingual,
  /**
   * Sentences copied from the opportunity that support the verdict.
   * A verdict with no citation is an opinion, and this product does not traffic
   * in opinions.
   */
  citations: z.array(z.string()).default([]),
}));
export type EligibilityVerdict = z.infer<typeof EligibilityVerdictSchema>;

export interface AnalystInput {
  /** The opportunity, as the console holds it. */
  title: string;
  issuer: string;
  kind: string;
  /** Everything the pipeline extracted: scope, eligibility, value, procedure… */
  factText: string;
  /** The project's own dossier. */
  project: {
    slug: string;
    name: string;
    oneLiner: string;
    sectors: readonly string[];
    geographies: readonly string[];
    entities: readonly string[];
  };
}

export interface VerdictViolation {
  citation: string;
  reason: string;
}

/** Normalise for comparison: whitespace and case are noise, accents are not. */
function squash(text: string): string {
  return text.toLowerCase().replace(/\s+/g, " ").trim();
}

/**
 * Check every citation against the text the model was given.
 *
 * A verdict is only worth the sentences under it. A model that decides
 * "NOT_ELIGIBLE — reserved for local authorities" while the document says no
 * such thing has cost more than saying nothing: it has hidden a real
 * opportunity behind a confident sentence.
 *
 * A NOT_ELIGIBLE or ELIGIBLE verdict with no surviving citation is downgraded to
 * NEEDS_INFO rather than dropped — the analysis still says something useful
 * ("the document does not settle this"), and silently discarding it would leave
 * the record looking unexamined.
 */
export function verdictViolations(
  verdict: EligibilityVerdict,
  factText: string,
): { kept: EligibilityVerdict; dropped: VerdictViolation[] } {
  const haystack = squash(factText);
  const kept: string[] = [];
  const dropped: VerdictViolation[] = [];

  for (const citation of verdict.citations) {
    const needle = squash(citation);
    if (needle.length < 12) {
      dropped.push({ citation, reason: "too short to be checkable" });
      continue;
    }
    // Long quotes are frequently re-wrapped or lightly trimmed; match on a
    // substantial prefix rather than demanding a byte-identical string.
    const probe = needle.slice(0, Math.min(needle.length, 60));
    if (!haystack.includes(probe)) {
      dropped.push({ citation, reason: "does not appear in the opportunity" });
      continue;
    }
    kept.push(citation);
  }

  const decisive = verdict.verdict === "ELIGIBLE" || verdict.verdict === "NOT_ELIGIBLE";
  if (decisive && kept.length === 0) {
    return {
      kept: {
        ...verdict,
        verdict: "NEEDS_INFO",
        citations: [],
        reason: {
          fr: "Le verdict initial ne citait rien de vérifiable dans le document — ramené à « à vérifier ».",
          en: "The original verdict cited nothing checkable in the document — downgraded to 'needs info'.",
        },
      },
      dropped,
    };
  }
  return { kept: { ...verdict, citations: kept }, dropped };
}

export const ANALYST_SYSTEM = [
  "You decide whether ONE organisation could apply to ONE funding opportunity.",
  "",
  "You are given the opportunity exactly as it was extracted, and the organisation's dossier.",
  "Answer with one of four verdicts:",
  "  ELIGIBLE      nothing in the document rules this organisation out, and you can name the entity",
  "  LIKELY        probably for them, but one criterion is not settled by the document",
  "  NEEDS_INFO    the document does not say who may apply — you cannot decide, and you say so",
  "  NOT_ELIGIBLE  a criterion written in the document rules them out",
  "",
  "Rules:",
  "1. Use ONLY the opportunity text provided. Never use what you know about this programme",
  "   from elsewhere — that is the single most damaging thing you can do here.",
  "2. Every verdict must carry citations: exact sentences copied from the opportunity.",
  "   A verdict with no citation is an opinion. NEEDS_INFO with no citation is fine and honest.",
  "3. NOT_ELIGIBLE requires a sentence that actually excludes them. 'It does not mention",
  "   companies' is NOT an exclusion — that is NEEDS_INFO.",
  "4. Write reason and nextAction in BOTH French and English. Same meaning, not a transliteration.",
  "5. nextAction is one concrete step a person does next, not advice.",
  "",
  "You are producing an assessment for a human to confirm. You are not deciding anything.",
].join("\n");

export function analystPrompt(input: AnalystInput): string {
  const p = input.project;
  return [
    "OPPORTUNITY",
    `title: ${input.title}`,
    `issuer: ${input.issuer}`,
    `kind: ${input.kind}`,
    "extracted text:",
    input.factText.slice(0, 12_000),
    "",
    "ORGANISATION",
    `name: ${p.name}`,
    `what it does: ${p.oneLiner}`,
    `sectors: ${p.sectors.join(", ") || "—"}`,
    `operates in: ${p.geographies.join(", ") || "—"}`,
    `legal entities available to apply: ${p.entities.join(", ") || "none recorded"}`,
  ].join("\n");
}
