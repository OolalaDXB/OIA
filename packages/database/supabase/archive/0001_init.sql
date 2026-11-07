-- ====================================================================
-- ARCHIVÉE le 2026-11-08 (décision de Mickaël) : JAMAIS APPLIQUÉE.
-- Schéma M0 de conception, sorti du dossier des migrations. Copie de
-- conception identique : docs/architecture/schema/0001_init.sql.
-- ====================================================================
-- OIA Funding V0 — Minimal Supabase schema (PROPOSAL, NOT YET APPLIED)
-- Target: Supabase Cloud / PostgreSQL. Reviewed before any `apply_migration`.
--
-- Design principles encoded here:
--   * Provenance is first-class: opportunities are qualified via TYPED CLAIMS.
--   * Every external fact must reference stored, hash-pinned EVIDENCE.
--   * Four independent scores are stored per opportunity.
--   * PURSUE is a gated recommendation, not a score threshold.
--   * RLS is ON from day one (single-org, multi-project isolation + audit).
--
-- Naming: snake_case, singular enums, plural tables. All ids are uuid.
-- Timestamps are timestamptz, default now().

create extension if not exists "pgcrypto";  -- gen_random_uuid()

-- ─────────────────────────────────────────────────────────────────────────────
-- Enums
-- ─────────────────────────────────────────────────────────────────────────────

create type claim_type as enum (
  'confirmed_official_fact',  -- corroborated by stored evidence
  'extracted',                -- pulled from source, not yet corroborated
  'inference',                -- model reasoning beyond the text
  'recommendation',           -- suggested action / judgement
  'unresolved_uncertainty'    -- explicitly flagged unknown
);

create type opportunity_status as enum (
  'discovered',   -- found, not yet fetched/qualified
  'qualifying',   -- in pipeline
  'qualified',    -- scores + claims present
  'archived',     -- closed/expired/irrelevant
  'error'         -- pipeline failure, needs attention
);

create type recommendation_action as enum (
  'PURSUE',    -- passed the hard gate
  'CONSIDER',  -- promising but gate not fully met
  'MONITOR',   -- relevant but not actionable yet (e.g. not open)
  'DISCARD'    -- not relevant / not eligible
);

create type deadline_status as enum (
  'open',       -- verified currently open
  'upcoming',   -- opens in the future
  'closed',     -- verified closed/expired
  'unknown'     -- could not verify
);

create type source_kind as enum (
  'official_programme',  -- primary source (grant/programme page)
  'aggregator',          -- secondary listing/portal
  'manual'               -- entered by an operator
);

create type audit_event_type as enum (
  'source_fetched',
  'opportunity_created',
  'opportunity_scored',
  'gate_evaluated',
  'recommendation_set',
  'human_override',
  'policy_denied',
  'llm_call'
);

-- ─────────────────────────────────────────────────────────────────────────────
-- Project profiles  (BAWABA is the first row)
-- ─────────────────────────────────────────────────────────────────────────────

create table projects (
  id            uuid primary key default gen_random_uuid(),
  slug          text unique not null,              -- 'bawaba'
  name          text not null,
  -- Structured profile used for relevance/eligibility matching.
  -- Validated by a Zod schema in packages/database before insert.
  profile       jsonb not null default '{}'::jsonb,
  -- e.g. { legal_entities:[{name,jurisdiction,role}], sectors:[], geographies:[],
  --        stage:'', funding_types:[], amount_range:{min,max,currency},
  --        keywords:[], exclusions:[] }
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- Sources  (registry of what connectors point at)
-- ─────────────────────────────────────────────────────────────────────────────

create table sources (
  id            uuid primary key default gen_random_uuid(),
  connector_key text not null,                     -- which SourceConnector handles it
  kind          source_kind not null,
  name          text not null,
  base_url      text,
  config        jsonb not null default '{}'::jsonb, -- connector-specific, Zod-validated
  is_enabled    boolean not null default true,
  last_run_at   timestamptz,
  created_at    timestamptz not null default now()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- Evidence  (immutable stored primary/secondary source snapshots)
-- ─────────────────────────────────────────────────────────────────────────────

create table evidence (
  id            uuid primary key default gen_random_uuid(),
  source_id     uuid references sources(id) on delete set null,
  url           text not null,
  http_status   int,
  fetched_at    timestamptz not null default now(),
  content_hash  text not null,                     -- sha256 of normalized text
  content_text  text,                              -- extracted text/markdown
  content_type  text,
  meta          jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now()
);
create index evidence_hash_idx on evidence (content_hash);
create index evidence_url_idx  on evidence (url);

-- ─────────────────────────────────────────────────────────────────────────────
-- Opportunities
-- ─────────────────────────────────────────────────────────────────────────────

create table opportunities (
  id                uuid primary key default gen_random_uuid(),
  project_id        uuid not null references projects(id) on delete cascade,
  source_id         uuid references sources(id) on delete set null,
  primary_evidence_id uuid references evidence(id) on delete set null, -- accessible primary source
  title             text not null,
  summary           text,
  programme_name    text,
  funder            text,
  primary_url       text,                          -- canonical link operators click
  amount_min        numeric,
  amount_max        numeric,
  currency          text,
  deadline_at       timestamptz,                   -- verified deadline (nullable until verified)
  deadline_status   deadline_status not null default 'unknown',
  status            opportunity_status not null default 'discovered',
  dedup_key         text,                          -- normalized key to collapse duplicates
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (project_id, dedup_key)
);
create index opportunities_project_idx on opportunities (project_id);
create index opportunities_status_idx  on opportunities (status);

-- ─────────────────────────────────────────────────────────────────────────────
-- Claims  (the provenance core — fact vs extraction vs inference vs …)
-- ─────────────────────────────────────────────────────────────────────────────

create table claims (
  id            uuid primary key default gen_random_uuid(),
  opportunity_id uuid not null references opportunities(id) on delete cascade,
  claim_type    claim_type not null,
  field         text not null,                     -- e.g. 'deadline', 'eligibility.geography'
  value_text    text,                              -- human-readable statement
  value_json    jsonb,                             -- structured value when applicable
  -- Facts MUST cite evidence; enforced at app layer + partial constraint below.
  evidence_id   uuid references evidence(id) on delete set null,
  confidence    numeric not null default 0 check (confidence >= 0 and confidence <= 1),
  produced_by   text not null default 'pipeline',  -- 'pipeline' | 'llm:<provider>' | 'human:<id>'
  llm_run_id    uuid,                              -- fk added after llm_runs defined
  created_at    timestamptz not null default now()
);
create index claims_opportunity_idx on claims (opportunity_id);
create index claims_type_idx        on claims (claim_type);

-- Integrity: a confirmed_official_fact must reference evidence.
alter table claims add constraint fact_requires_evidence
  check (claim_type <> 'confirmed_official_fact' or evidence_id is not null);

-- ─────────────────────────────────────────────────────────────────────────────
-- Scores  (four independent scores, one row per opportunity, versioned)
-- ─────────────────────────────────────────────────────────────────────────────

create table opportunity_scores (
  id                uuid primary key default gen_random_uuid(),
  opportunity_id    uuid not null references opportunities(id) on delete cascade,
  relevance         numeric not null check (relevance between 0 and 100),
  eligibility       numeric not null check (eligibility between 0 and 100),
  win_potential     numeric not null check (win_potential between 0 and 100),
  info_confidence   numeric not null check (info_confidence between 0 and 100),
  model_version     text not null,                 -- scoring model version for reproducibility
  breakdown         jsonb not null default '{}'::jsonb, -- per-factor contributions
  scored_at         timestamptz not null default now()
);
create index scores_opportunity_idx on opportunity_scores (opportunity_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- Eligibility assessment  (explicit, required for PURSUE)
-- ─────────────────────────────────────────────────────────────────────────────

create table eligibility_assessments (
  id             uuid primary key default gen_random_uuid(),
  opportunity_id uuid not null references opportunities(id) on delete cascade,
  project_id     uuid not null references projects(id) on delete cascade,
  verdict        text not null,                    -- 'eligible' | 'likely' | 'ineligible' | 'unknown'
  criteria       jsonb not null default '[]'::jsonb, -- [{criterion, met:bool|null, note, evidence_id}]
  rationale      text,
  assessed_by    text not null default 'pipeline',
  created_at     timestamptz not null default now()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- Recommendations  (the gated output; PURSUE only if gate passed)
-- ─────────────────────────────────────────────────────────────────────────────

create table recommendations (
  id              uuid primary key default gen_random_uuid(),
  opportunity_id  uuid not null references opportunities(id) on delete cascade,
  action          recommendation_action not null,
  next_action     text,                            -- exact proposed next step (required for PURSUE)
  gate_passed     boolean not null default false,
  gate_report     jsonb not null default '{}'::jsonb, -- per-precondition pass/fail (see scoring doc)
  rationale       text,
  is_current      boolean not null default true,   -- latest recommendation per opportunity
  created_by      text not null default 'pipeline',
  created_at      timestamptz not null default now()
);
create index recs_opportunity_idx on recommendations (opportunity_id);
create unique index recs_current_idx on recommendations (opportunity_id) where is_current;

-- Hard invariant: cannot store a PURSUE recommendation unless the gate passed.
alter table recommendations add constraint pursue_requires_gate
  check (action <> 'PURSUE' or (gate_passed = true and next_action is not null));

-- ─────────────────────────────────────────────────────────────────────────────
-- LLM runs  (provider-neutral call log for audit + reproducibility)
-- ─────────────────────────────────────────────────────────────────────────────

create table llm_runs (
  id            uuid primary key default gen_random_uuid(),
  provider      text not null,                     -- 'anthropic' | 'openai' | ... (neutral)
  model         text not null,
  purpose       text not null,                     -- 'extract' | 'classify_claims' | 'assess' ...
  prompt_hash   text not null,                     -- sha256 of rendered prompt
  input_tokens  int,
  output_tokens int,
  cost_usd      numeric,
  opportunity_id uuid references opportunities(id) on delete set null,
  created_at    timestamptz not null default now()
);

alter table claims add constraint claims_llm_run_fk
  foreign key (llm_run_id) references llm_runs(id) on delete set null;

-- ─────────────────────────────────────────────────────────────────────────────
-- Audit log  (append-only; every state transition & override)
-- ─────────────────────────────────────────────────────────────────────────────

create table audit_log (
  id            uuid primary key default gen_random_uuid(),
  event_type    audit_event_type not null,
  actor         text not null default 'pipeline',  -- 'pipeline' | 'human:<uid>' | 'policy'
  opportunity_id uuid references opportunities(id) on delete set null,
  project_id    uuid references projects(id) on delete set null,
  payload       jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now()
);
create index audit_opportunity_idx on audit_log (opportunity_id);
create index audit_event_idx       on audit_log (event_type);

-- ─────────────────────────────────────────────────────────────────────────────
-- Pipeline runs  (observability for scheduled worker executions)
-- ─────────────────────────────────────────────────────────────────────────────

create table pipeline_runs (
  id            uuid primary key default gen_random_uuid(),
  project_id    uuid references projects(id) on delete set null,
  stage         text not null,                     -- 'discover' | 'qualify' | 'full'
  status        text not null default 'running',   -- 'running' | 'succeeded' | 'failed'
  stats         jsonb not null default '{}'::jsonb,
  started_at    timestamptz not null default now(),
  finished_at   timestamptz
);

-- ─────────────────────────────────────────────────────────────────────────────
-- Row Level Security  (ON from day one; policies are minimal for V0)
-- ─────────────────────────────────────────────────────────────────────────────
-- V0 is single-org: any authenticated internal user may read/write.
-- audit_log is append-only (no update/delete). Service role bypasses RLS for
-- worker writes. Tighten to per-project roles when a second operator appears.

alter table projects                enable row level security;
alter table sources                 enable row level security;
alter table evidence                enable row level security;
alter table opportunities           enable row level security;
alter table claims                  enable row level security;
alter table opportunity_scores      enable row level security;
alter table eligibility_assessments enable row level security;
alter table recommendations         enable row level security;
alter table llm_runs                enable row level security;
alter table audit_log               enable row level security;
alter table pipeline_runs           enable row level security;

-- Read/write for authenticated internal users (single-org V0).
do $$
declare t text;
begin
  foreach t in array array[
    'projects','sources','evidence','opportunities','claims',
    'opportunity_scores','eligibility_assessments','recommendations',
    'llm_runs','pipeline_runs'
  ] loop
    execute format(
      'create policy %I_rw on %I for all to authenticated using (true) with check (true);',
      t, t);
  end loop;
end $$;

-- audit_log: authenticated may read and insert, never update/delete.
create policy audit_read   on audit_log for select to authenticated using (true);
create policy audit_insert on audit_log for insert to authenticated with check (true);
