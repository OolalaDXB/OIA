import type { ConsoleRecord } from "@oia/ingestion";

/**
 * Service interfaces stubbed in Phase 1 so the skeleton accommodates later
 * phases without rewrite. Stubs are HONEST: they say "not implemented", they
 * never fabricate a suggestion or a digest.
 */

/** Phase 2 — best TheStudio project/candidate per opportunity, with reasoning. */
export interface ProjectSuggestion {
  projectSlug: string;
  /** Why this project fits — shown to the human, NEVER presented as certainty. */
  rationale: string;
  /** 0-100; a suggestion, not a verdict. */
  confidence: number;
}

export interface SuggestionService {
  suggestProjects(opportunity: ConsoleRecord): Promise<ProjectSuggestion[]>;
}

/** Phase 1 stub: no suggestions, honestly. Implemented in Phase 2. */
export const stubSuggestionService: SuggestionService = {
  async suggestProjects() {
    return [];
  },
};

/** Phase 4 — morning digest: opportunities that matter, actions, follow-ups. */
export interface DigestEntry {
  recordId: string;
  headline: string;
  nextAction: string;
}

export interface Digest {
  date: string;
  entries: DigestEntry[];
  /** True only when a real digest was computed (Phase 4). */
  implemented: boolean;
}

export interface DigestService {
  buildDailyDigest(date: string): Promise<Digest>;
}

/** Phase 1 stub: empty digest flagged unimplemented. Real one in Phase 4. */
export const stubDigestService: DigestService = {
  async buildDailyDigest(date: string) {
    return { date, entries: [], implemented: false };
  },
};
