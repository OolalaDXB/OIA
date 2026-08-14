import type { ConsoleRecord } from "@oia/ingestion";
import type { ProjectProfile } from "@oia/database";
import type { ProjectSuggestion, SuggestionService } from "./services";

/**
 * Phase 2 SuggestionService — deterministic, explainable matching between an
 * opportunity and TheStudio project profiles. No LLM, no network: a pure
 * keyword/sector/geography overlap score over the record's provenance-typed
 * text, so every suggestion states WHY (matched signals) and is NEVER
 * presented as certainty (confidence hard-capped, rationale lists signals).
 * A record with no matching signal yields NO suggestion — honesty over
 * coverage.
 */

const CONFIDENCE_CAP = 70; // a heuristic can suggest, never conclude

interface Signals {
  keywords: string[];
  sectors: string[];
  geographies: string[];
}

/** Lower-cased searchable corpus of a record (title + issuer + fact values). */
function corpusOf(r: ConsoleRecord): string {
  const parts = [r.title, r.issuer, ...r.facts.map((f) => `${f.field} ${f.normalizedValue}`)];
  return parts.join(" \n ").toLowerCase();
}

function wordMatch(corpus: string, term: string): boolean {
  const t = term.toLowerCase().trim();
  if (!t) return false;
  // Word-boundary match so "ai" does not fire inside "maintenance".
  return new RegExp(`(^|[^a-z0-9])${t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^a-z0-9]|$)`, "i").test(corpus);
}

function matchSignals(record: ConsoleRecord, project: ProjectProfile): Signals {
  const corpus = corpusOf(record);
  return {
    keywords: project.keywords.filter((k) => wordMatch(corpus, k)),
    sectors: project.sectors.filter((s) => wordMatch(corpus, s)),
    geographies: project.geographies.filter((g) => wordMatch(corpus, g)),
  };
}

export function scoreProject(record: ConsoleRecord, project: ProjectProfile): ProjectSuggestion | null {
  // Exclusions veto the match outright.
  const corpus = corpusOf(record);
  if (project.exclusions.some((x) => wordMatch(corpus, x))) return null;

  const s = matchSignals(record, project);
  const score = s.keywords.length * 12 + s.sectors.length * 10 + s.geographies.length * 4;
  if (score <= 0) return null;

  const parts: string[] = [];
  if (s.keywords.length) parts.push(`keywords: ${s.keywords.join(", ")}`);
  if (s.sectors.length) parts.push(`sectors: ${s.sectors.join(", ")}`);
  if (s.geographies.length) parts.push(`geo: ${s.geographies.join(", ")}`);

  return {
    projectSlug: project.slug,
    rationale: `Matched ${parts.join(" · ")} — heuristic signal overlap, not a verdict.`,
    confidence: Math.min(CONFIDENCE_CAP, score),
  };
}

/** Build the real SuggestionService over a set of project profiles. */
export function createSuggestionService(projects: ProjectProfile[]): SuggestionService {
  return {
    async suggestProjects(opportunity: ConsoleRecord): Promise<ProjectSuggestion[]> {
      return projects
        .map((p) => scoreProject(opportunity, p))
        .filter((x): x is ProjectSuggestion => x !== null)
        .sort((a, b) => b.confidence - a.confidence);
    },
  };
}
