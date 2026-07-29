import type { ProjectProfile } from "@oia/database";
import type { RawOpportunity } from "@oia/connectors";
import type { RelevanceSignals } from "@oia/scoring";

const norm = (s: string): string => s.toLowerCase();

/** Fraction of `needles` that appear as substrings in `haystack` (0..1). */
function overlapRatio(needles: string[], haystack: string): number {
  if (needles.length === 0) return 0.5; // undefined profile dimension → neutral
  const h = norm(haystack);
  const hits = needles.filter((n) => h.includes(norm(n))).length;
  return hits / needles.length;
}

function anyPresent(needles: string[], haystack: string): boolean {
  const h = norm(haystack);
  return needles.some((n) => n.length > 0 && h.includes(norm(n)));
}

/**
 * Compute relevance signals (0..1) from the profile, the opportunity hints and
 * the fetched source text. Pure and unit-testable. Domain matching lives here;
 * the weighting lives in @oia/scoring.
 */
export function computeRelevanceSignals(
  project: ProjectProfile,
  opp: RawOpportunity,
  sourceText: string,
): RelevanceSignals {
  const corpus = [opp.title, opp.hints.summary ?? "", opp.hints.programmeName ?? "", sourceText].join(" ");

  const sectorOverlap = overlapRatio(project.sectors, corpus);

  // Geography: EU calls are open to EU/associated members. If the profile targets
  // EU/FR and the funder is the EC, treat geography as a strong match.
  let geographyOverlap = overlapRatio(project.geographies, corpus);
  const euIntent = anyPresent(["EU", "FR", "France", "Europe"], project.geographies.join(" "));
  if (euIntent && norm(opp.hints.funder ?? "").includes("european")) {
    geographyOverlap = Math.max(geographyOverlap, 0.8);
  }

  // Funding type: EU F&T calls of type "1" are grants.
  const wantsGrant = project.fundingTypes.length === 0 || anyPresent(["grant"], project.fundingTypes.join(" "));
  const fundingTypeMatch = wantsGrant ? 1 : 0.2;

  // Amount: only judged when both sides are known; otherwise neutral.
  let amountFit = 0.5;
  const range = project.amountRange;
  const oppMax = opp.hints.amountMax;
  if (range && oppMax !== undefined) {
    const within =
      (range.min === undefined || oppMax >= range.min) &&
      (range.max === undefined || oppMax <= range.max);
    amountFit = within ? 1 : 0.3;
  }

  // Stage: heuristic keyword presence; neutral if unknown.
  const stageFit = project.stage ? (anyPresent([project.stage], corpus) ? 1 : 0.5) : 0.5;

  const hardExclusionHit = anyPresent(project.exclusions, corpus);

  return { sectorOverlap, geographyOverlap, fundingTypeMatch, amountFit, stageFit, hardExclusionHit };
}
