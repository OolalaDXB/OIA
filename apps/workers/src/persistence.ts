import type { ProjectProfile } from "@oia/database";
import type { RawOpportunity, FetchedEvidence } from "@oia/connectors";
import type { QualificationResult } from "@oia/intelligence";

/**
 * Port for persisting a qualified opportunity. A Supabase implementation writes
 * to the real schema; a memory implementation backs the network-free pipeline
 * test. Keeping the pipeline behind this port makes it testable end-to-end.
 */
export interface PersistInput {
  project: ProjectProfile;
  projectId: string;
  sourceId: string;
  opportunity: RawOpportunity;
  evidence: FetchedEvidence | null;
  result: QualificationResult;
}

export interface Persistence {
  /** Persist everything for one opportunity; returns the opportunity id. */
  persist(input: PersistInput): Promise<string>;
}
