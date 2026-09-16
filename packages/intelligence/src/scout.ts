import { z } from "zod";
import { OPPORTUNITY_KINDS } from "@oia/ingestion/opportunity-kinds";

/**
 * The aid scout — the agent half of discovery.
 *
 * Most of the money OIA is supposed to find is NOT on a machine-readable
 * portal. Brittany's regional aid, aides-territoires, BPI, France 2030, the
 * CIR/CII/JEI regime, Hub71, ADIO: eighteen sources in the registry and exactly
 * one with a connector. The other seventeen were `DECLARED`, which is an honest
 * word for "a human is supposed to look at this", and no human ever did.
 *
 * So a model reads the page instead. That is the agentic part, and it is worth
 * being precise about what it does and does not change:
 *
 *   IT CHANGES  who does the reading. A page nobody wrote a parser for can now
 *               be turned into structured candidates.
 *
 *   IT DOES NOT CHANGE  what counts as true. Everything the model returns is a
 *               CLAIM. It lands at MANUAL_REVIEW_REQUIRED like a TED notice,
 *               the deterministic gate still refuses PURSUE, and a human still
 *               verifies. A model that could certify its own output would undo
 *               the only property this product has.
 *
 * The anti-hallucination guard is in this file rather than in the prompt, and
 * that is deliberate. "Only report calls that are really on the page" is a
 * wish. `anchorViolations()` is a check: every call must cite a URL that
 * actually appears on the page it was read from, and one that does not is
 * dropped with a reason. A prompt instruction cannot be tested; this can.
 */

export const ScoutedCallSchema = z.object({
  /** The call's own name, as printed on the page. */
  title: z.string().min(3),
  /** Who is offering the money. */
  issuer: z.string().default(""),
  kind: z.enum(OPPORTUNITY_KINDS).default("GRANT"),
  /**
   * The link to THIS call. Must be a URL present on the page — this is what
   * makes the claim checkable, and what the anchor guard enforces.
   */
  sourceUrl: z.string().min(1),
  /** What it funds, in the page's own words. Empty when the page does not say. */
  summary: z.string().default(""),
  /** Who may apply, in the page's own words. */
  eligibility: z.string().default(""),
  /** Amount as written ("jusqu'à 50 000 €"). Never computed, never converted. */
  amountText: z.string().default(""),
  /** Deadline as written. Many aid schemes are permanently open and say so. */
  deadlineText: z.string().default(""),
  /** The exact sentence the model took this from, so a human can check it. */
  quote: z.string().default(""),
});
export type ScoutedCall = z.infer<typeof ScoutedCallSchema>;

const ScoutResultShape = z.object({
  calls: z.array(ScoutedCallSchema).default([]),
  /**
   * The model's own account of what it could not do. An empty page and a page
   * the model failed to read are different, and only one of them is a problem.
   */
  note: z.string().default(""),
});

/**
 * Take the model's list whatever it decided to call it.
 *
 * This cost a whole run to find. The model was returning 36,823 output tokens —
 * pages and pages of extracted programmes — and the scout reported zero calls,
 * with no error anywhere. `calls` has a default of `[]`, so a response keyed
 * `opportunities` or `aides` parsed CLEANLY into an empty result. A schema that
 * silently discards its input and reports success is worse than one that
 * rejects it: rejection is visible.
 *
 * So the array is found by shape rather than by name, and a response whose list
 * cannot be found at all keeps its original keys in `note` — the next person
 * debugging this should not have to guess either.
 */
export const ScoutResultSchema = z.preprocess((raw) => {
  if (typeof raw !== "object" || raw === null) return raw;
  const obj = raw as Record<string, unknown>;
  if (Array.isArray(obj["calls"])) return obj;

  // Any other property holding a list of objects is the list.
  for (const [key, value] of Object.entries(obj)) {
    if (key === "calls") continue;
    if (Array.isArray(value) && value.every((v) => typeof v === "object" && v !== null)) {
      return { ...obj, calls: value, note: String(obj["note"] ?? `list read from "${key}"`) };
    }
  }
  // A single opportunity returned bare, rather than wrapped in a list.
  if (typeof obj["title"] === "string" && typeof obj["sourceUrl"] === "string") {
    return { calls: [obj], note: "the model returned one opportunity unwrapped" };
  }
  return { ...obj, calls: [], note: String(obj["note"] ?? `no list found; keys were: ${Object.keys(obj).join(", ")}`) };
}, ScoutResultShape);

export type ScoutResult = z.infer<typeof ScoutResultShape>;

export interface ScoutPage {
  /** The URL that was fetched. */
  url: string;
  /** Visible text, already extracted from the DOM. */
  text: string;
  /** Every absolute link found on the page. The anchor guard's universe. */
  links: string[];
}

export interface AnchorViolation {
  title: string;
  sourceUrl: string;
  reason: string;
}

/** Normalise for comparison: scheme, trailing slash and fragment are noise here. */
function canonical(url: string): string {
  try {
    const u = new URL(url);
    u.hash = "";
    const path = u.pathname.replace(/\/+$/, "");
    return `${u.host.toLowerCase().replace(/^www\./, "")}${path}${u.search}`;
  } catch {
    return url.trim().toLowerCase().replace(/\/+$/, "");
  }
}

/**
 * Split what the model returned into calls anchored to the page and calls that
 * are not. A call is anchored when its `sourceUrl` is a link the page actually
 * carries, or the page's own URL.
 *
 * This is the whole defence against a plausible-sounding scheme that does not
 * exist. A model asked to list funding calls on a thin page will happily supply
 * the ones it remembers from training, and those are the dangerous ones: real
 * names, real issuers, wrong or dead links, invented deadlines. They cannot
 * survive this function.
 */
export function anchorViolations(
  page: ScoutPage,
  calls: readonly ScoutedCall[],
): { kept: ScoutedCall[]; dropped: AnchorViolation[] } {
  const known = new Set([canonical(page.url), ...page.links.map(canonical)]);
  const kept: ScoutedCall[] = [];
  const dropped: AnchorViolation[] = [];

  for (const call of calls) {
    const target = call.sourceUrl.trim();
    if (!target) {
      dropped.push({ title: call.title, sourceUrl: "", reason: "no source link given" });
      continue;
    }
    let absolute = target;
    if (!/^https?:\/\//i.test(target)) {
      try {
        absolute = new URL(target, page.url).toString();
      } catch {
        dropped.push({ title: call.title, sourceUrl: target, reason: "not a usable URL" });
        continue;
      }
    }
    if (!known.has(canonical(absolute))) {
      dropped.push({
        title: call.title,
        sourceUrl: absolute,
        reason: "link is not on the page it was supposedly read from",
      });
      continue;
    }
    // A quote the page does not contain is the same failure in another field.
    if (call.quote && !page.text.includes(call.quote.slice(0, 40))) {
      dropped.push({
        title: call.title,
        sourceUrl: absolute,
        reason: "quoted text does not appear on the page",
      });
      continue;
    }
    kept.push({ ...call, sourceUrl: absolute });
  }
  return { kept, dropped };
}

/**
 * The instruction given to the model. Kept here, next to the guard that checks
 * it, so the two cannot drift apart.
 */
export const SCOUT_SYSTEM = [
  "You read one web page from a public funding body and list every FUNDING OPPORTUNITY shown on that page.",
  "",
  "A funding opportunity is anything a company or association could receive money, support or a contract from.",
  "List ALL of these:",
  "  - open calls for projects, calls for proposals, calls for tenders",
  "  - grants, subsidies, aid schemes (aides, subventions, dispositifs)",
  "  - permanently open programmes with NO deadline at all — these are still opportunities and MUST be listed",
  "  - tax incentives and status-based reliefs (CIR, CII, JEI) — a status is an opportunity",
  "  - loans, guarantees, equity and accelerator programmes",
  "  - prizes and competitions",
  "",
  "A named programme on a listing page IS an opportunity. Do not skip it because it has no closing date,",
  "no amount, or because it is described rather than advertised. Missing detail is reported as empty fields,",
  "never as a reason to omit the entry. A page listing twenty programmes should return twenty entries.",
  "",
  "Rules, in order of importance:",
  "1. Only list something the page itself shows. Never add a scheme you know about from elsewhere.",
  "2. Every entry must carry sourceUrl: a link that appears on this page and leads to that opportunity.",
  "   If the page names a programme but links nowhere, use the page URL itself.",
  "3. Copy amounts, deadlines and eligibility as the page writes them. Do not convert, compute or infer.",
  "   Leave a field empty rather than guessing it.",
  "4. quote must be an exact sentence copied from the page, or empty.",
  "5. If the page genuinely shows no funding opportunity — it is a contact page, a news article, a login —",
  "   return an empty array and say so in note. An empty answer is a correct answer for an empty page,",
  "   and a wrong answer for a page full of programmes.",
  "",
  "Return the list under the key \"calls\". Not \"opportunities\", not \"results\", not \"aides\" — \"calls\".",
  "",
  "You are extracting claims for a human to verify, not deciding anything.",
].join("\n");

/** Cap what is sent to the model — aid portals can be enormous. */
export const SCOUT_MAX_CHARS = 24_000;

export function scoutPrompt(page: ScoutPage): string {
  const links = page.links.slice(0, 150);
  return [
    `PAGE URL: ${page.url}`,
    "",
    "PAGE TEXT:",
    page.text.slice(0, SCOUT_MAX_CHARS),
    "",
    "LINKS ON THIS PAGE (sourceUrl must be one of these, or the page URL):",
    ...links.map((l) => `- ${l}`),
  ].join("\n");
}
