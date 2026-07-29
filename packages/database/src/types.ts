import type {
  ClaimType,
  OpportunityStatus,
  RecommendationAction,
  DeadlineStatus,
  SourceKind,
} from "./schemas";

/**
 * Hand-written row types for V0. When the Supabase project is linked, replace
 * these with `supabase gen types typescript` output in `types.generated.ts` and
 * re-export from here. Kept intentionally minimal — only what the pipeline and
 * web read/write in Milestone 1.
 */

export interface EvidenceRow {
  id: string;
  source_id: string | null;
  url: string;
  http_status: number | null;
  fetched_at: string;
  content_hash: string;
  content_text: string | null;
  content_type: string | null;
  meta: Record<string, unknown>;
}

export interface OpportunityRow {
  id: string;
  project_id: string;
  source_id: string | null;
  primary_evidence_id: string | null;
  title: string;
  summary: string | null;
  programme_name: string | null;
  funder: string | null;
  primary_url: string | null;
  amount_min: number | null;
  amount_max: number | null;
  currency: string | null;
  deadline_at: string | null;
  deadline_status: DeadlineStatus;
  status: OpportunityStatus;
  dedup_key: string | null;
}

export interface ClaimRow {
  id: string;
  opportunity_id: string;
  claim_type: ClaimType;
  field: string;
  value_text: string | null;
  value_json: unknown;
  evidence_id: string | null;
  confidence: number;
  produced_by: string;
  llm_run_id: string | null;
}

export interface ScoreRow {
  opportunity_id: string;
  relevance: number;
  eligibility: number;
  win_potential: number;
  info_confidence: number;
  model_version: string;
  breakdown: Record<string, number>;
}

export interface RecommendationRow {
  opportunity_id: string;
  action: RecommendationAction;
  next_action: string | null;
  gate_passed: boolean;
  gate_report: Record<string, unknown>;
  rationale: string | null;
  is_current: boolean;
}

export interface SourceRow {
  id: string;
  connector_key: string;
  kind: SourceKind;
  name: string;
  base_url: string | null;
  config: Record<string, unknown>;
  is_enabled: boolean;
}
