/**
 * Getting to the page that actually lists the calls.
 *
 * The first real scout run read fourteen sources and found nothing, and the
 * model was right every time: it was shown cookie banners, navigation menus and
 * site homepages. A funding body's front page does not list its calls, and no
 * amount of prompting changes that — the fix is to arrive somewhere else.
 *
 * Both steps here are deliberately modest about what they are allowed to do.
 * Dismissing a cookie banner is clicking the button a human clicks. Following a
 * link is following a link the page itself offers. Neither defeats a control
 * anybody put up on purpose; that distinction is the whole reason a site that
 * answers with a bot challenge is marked BLOCKED instead of being worked
 * around.
 */

/** Consent buttons, by their visible text. Ordered most specific first. */
export const CONSENT_LABELS = [
  "tout accepter",
  "accepter tout",
  "accepter et fermer",
  "j'accepte",
  "jaccepte",
  "accepter",
  "accept all",
  "allow all",
  "i accept",
  "accept",
  "ok, tout accepter",
  "continuer sans accepter",
] as const;

/**
 * Words that mark a link as leading to a list of open calls, with a weight.
 *
 * Tuned for the French and Gulf funding vocabulary this registry actually
 * contains: "appels à projets", "aides", "subventions", "financements", plus
 * the English of UNGM, the World Bank and Hub71.
 */
const LISTING_SIGNALS: Array<[RegExp, number]> = [
  [/appels?[-\s]?(a|à)[-\s]?projets?/i, 10],
  [/appels?[-\s]?(a|à)[-\s]?candidatures?/i, 10],
  [/appels?[-\s]?d.?offres?/i, 9],
  [/\bsubventions?\b/i, 8],
  [/\baides?\b/i, 7],
  [/\bfinancements?\b/i, 7],
  [/\bdispositifs?\b/i, 6],
  [/\bprogrammes?\b/i, 5],
  [/\bguichets?\b/i, 5],
  [/\bcalls?\b/i, 8],
  [/\bfunding\b/i, 8],
  [/\bgrants?\b/i, 8],
  [/\btenders?\b/i, 8],
  [/\bopportunit(y|ies|es)\b/i, 7],
  [/\bincentives?\b/i, 6],
  [/\bprocurement\b/i, 6],
  [/\bapply\b/i, 4],
  [/\bcandidater\b/i, 4],
];

/** Links that look like a listing but never are. */
const LISTING_ANTI_SIGNALS: Array<[RegExp, number]> = [
  [/\b(login|connexion|se-connecter|signin|register|inscription|compte)\b/i, -20],
  [/\b(cookie|privacy|confidentialite|mentions-legales|legal|rgpd)\b/i, -20],
  [/\b(contact|presse|press|about|a-propos|recrutement|careers|jobs)\b/i, -12],
  [/\b(actualites?|news|blog|events?|evenements?)\b/i, -8],
];

/**
 * A downloadable file is never a listing page to browse. Matched against the
 * PATH alone: an end-anchored extension test against "path + link text" can
 * never fire, because the text follows the extension.
 */
const DOWNLOADABLE = /\.(pdf|zip|docx?|xlsx?|pptx?|csv)$/i;

export interface PageLink {
  url: string;
  /** The link's visible text, when the page gave one. */
  text?: string;
}

export interface ListingChoice {
  url: string;
  score: number;
  why: string;
}

/**
 * Pick the link on an entry page most likely to lead to the list of open calls.
 *
 * Returns null rather than a weak guess: following an arbitrary link would turn
 * a source that found nothing into a source that found the wrong thing, which
 * is worse — nothing is at least honest.
 */
export function chooseListingLink(
  entryUrl: string,
  links: readonly PageLink[],
  opts: { minScore?: number } = {},
): ListingChoice | null {
  const minScore = opts.minScore ?? 7;
  let entryHost = "";
  let entryPath = "";
  try {
    const u = new URL(entryUrl);
    entryHost = u.host.replace(/^www\./, "");
    entryPath = u.pathname.replace(/\/+$/, "");
  } catch {
    return null;
  }

  let best: ListingChoice | null = null;
  for (const link of links) {
    let host = "";
    let path = "";
    try {
      const u = new URL(link.url);
      host = u.host.replace(/^www\./, "");
      path = u.pathname.replace(/\/+$/, "");
    } catch {
      continue;
    }
    // Never wander off the source's own site: that is how a scout ends up
    // reading somebody else's portal and attributing it to this source.
    if (host !== entryHost) continue;
    if (path === entryPath) continue;

    const haystack = `${path} ${link.text ?? ""}`;
    let score = 0;
    const reasons: string[] = [];
    for (const [pattern, weight] of LISTING_SIGNALS) {
      if (pattern.test(haystack)) {
        score += weight;
        reasons.push(pattern.source.replace(/\\b|\\s|\?|\(|\)|\|/g, "").slice(0, 24));
      }
    }
    for (const [pattern, weight] of LISTING_ANTI_SIGNALS) {
      if (pattern.test(haystack)) score += weight;
    }
    if (DOWNLOADABLE.test(path)) continue; // a file to download, not a page to read
    // A deeper path under the entry page is more likely to be the list itself
    // than a sibling section of the site.
    if (entryPath && path.startsWith(`${entryPath}/`)) score += 3;

    if (score >= minScore && (!best || score > best.score)) {
      best = { url: link.url, score, why: reasons.join(", ") || "matched a listing word" };
    }
  }
  return best;
}
