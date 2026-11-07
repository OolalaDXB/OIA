-- ====================================================================
-- MIGRATION DE DÉPART, DÉJÀ DÉPLOYÉE sur la base OIA (iywmvyebuikxyvnrcnoy)
-- le 16 septembre 2026. NE JAMAIS LA REJOUER sur cette base : elle décrit
-- l'état réel, d'où partent les migrations suivantes. Rangée ici le
-- 2026-11-08 (décision de Mickaël), depuis docs/architecture/schema/.
-- Elle ne sert qu'aux tests sur Postgres jetable et à une base neuve.
-- ====================================================================
-- The applied schema of the OIA Supabase project (ref iywmvyebuikxyvnrcnoy).
--
-- APPLIED on 2026-09-16 as three migrations: `watch_ledger_and_workspace`,
-- `rename_dedup_key_to_watch_key`, then `requests_drafts_link_checks`. This file
-- is the consolidated result, **transcribed from the live database** (catalog
-- dump, not from memory) so the repository carries the truth it claims to.
--
-- Note on 0001_init.sql (archived in packages/database/supabase/archive/, design
-- copy in docs/architecture/schema/): it is a DESIGN document
-- for the Milestone-1 qualifier (claims / scores / recommendations tables) and
-- is deliberately NOT applied. Nothing writes to it, and a dead schema is the
-- same lie as a dead feature. What is applied is what is used.
--
-- Two properties in here are load-bearing and are enforced by the database
-- rather than by convention:
--
--   1. `reviews` is APPEND-ONLY. There is an INSERT policy and a SELECT policy
--      and no UPDATE or DELETE policy at all, so a signed-in session cannot
--      rewrite a decision it already recorded. Verified by impersonation: an
--      authenticated role could insert, and both an update and a delete were
--      refused.
--   2. `requests` can be ASKED FOR but not RESOLVED from the browser. The
--      INSERT policy admits only `status = 'QUEUED'`, and there is no UPDATE
--      policy — only the service role (which bypasses RLS, and lives solely in
--      GitHub secrets) can move a request to RUNNING / DONE / FAILED. That is
--      what makes "never reported as searched unless a search ran" a property
--      of the system rather than a promise in the worker.
--
-- Every table has RLS enabled and NO policy for `anon`: the console ships its
-- publishable key in a public bundle, and row-level security is the only reason
-- that is safe. Verified: role anon reads 0 rows from every table.

-- ---------------------------------------------------------------- enumerations

create type watch_event_type as enum (
  'DISCOVERED', 'UPDATED', 'DEADLINE_SET', 'DEADLINE_CHANGED',
  'RECOMMENDATION_CHANGED', 'VERIFICATION_CHANGED', 'DISAPPEARED', 'REAPPEARED');

create type alert_kind as enum (
  'NEW_MATCH', 'CLOSING_SOON', 'JUST_EXPIRED', 'DEADLINE_CHANGED',
  'DISAPPEARED', 'APPROVED_BUT_BLOCKED');

create type request_kind   as enum ('DISCOVERY', 'INGEST_URL', 'LINK_CHECK');
create type request_status as enum ('QUEUED', 'RUNNING', 'DONE', 'FAILED');

-- --------------------------------------------------------------- the watch

-- One row per opportunity IDENTITY, across all runs. This is the memory that
-- makes "new since last time" — and therefore alerting — possible.
--
-- `watch_key` is that identity: the normalised official URL, else issuer plus
-- title stem. It deliberately does NOT contain the deadline. An earlier version
-- did, and a deadline extension would have minted a phantom new opportunity
-- while declaring the real one vanished — the exact opposite of a watch.
create table watch_opportunities (
  id uuid primary key default gen_random_uuid(),
  watch_key text not null unique,
  record_id text not null,
  title text not null,
  issuer text not null,
  opportunity_kind text,
  official_url text,
  deadline_at timestamptz,
  recommendation text not null,
  verification_status text not null,
  info_confidence integer not null default 0,
  gate_pursue_eligible boolean not null default false,
  gate_failed_reasons text[] not null default '{}',
  discovered_for text[] not null default '{}',
  payload jsonb not null,
  content_fingerprint text not null,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  times_seen integer not null default 1,
  disappeared_at timestamptz
);
create index watch_opportunities_deadline_idx   on watch_opportunities (deadline_at);
create index watch_opportunities_first_seen_idx on watch_opportunities (first_seen_at desc);
create index watch_opportunities_kind_idx       on watch_opportunities (opportunity_kind);
create index watch_opportunities_projects_idx   on watch_opportunities using gin (discovered_for);

-- Append-only change log. Nothing updates or deletes these.
create table watch_events (
  id bigserial primary key,
  opportunity_id uuid not null references watch_opportunities (id) on delete cascade,
  event_type watch_event_type not null,
  at timestamptz not null default now(),
  run_id uuid,
  detail jsonb not null default '{}'
);
create index watch_events_at_idx          on watch_events (at desc);
create index watch_events_opportunity_idx on watch_events (opportunity_id, at desc);

create table watch_runs (
  id uuid primary key default gen_random_uuid(),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  source text not null,
  projects text[] not null default '{}',
  records_seen integer not null default 0,
  new_count integer not null default 0,
  updated_count integer not null default 0,
  disappeared_count integer not null default 0,
  report jsonb not null default '{}'
);
create index watch_runs_started_idx on watch_runs (started_at desc);

-- `dedup_hash` is built from the CONDITION, not the moment: "this call closes
-- within 14 days" hashes the same on every run, so the same warning is raised
-- once and never again. The unique constraint is what makes the alert engine
-- idempotent — it is enforced here, not trusted to the caller.
create table alerts (
  id uuid primary key default gen_random_uuid(),
  kind alert_kind not null,
  opportunity_id uuid references watch_opportunities (id) on delete cascade,
  project_slug text,
  headline text not null,
  detail text not null default '',
  next_action text not null default '',
  severity integer not null default 5,
  created_at timestamptz not null default now(),
  acknowledged_at timestamptz,
  acknowledged_by text,
  dedup_hash text not null unique
);
create index alerts_open_idx    on alerts (acknowledged_at, severity, created_at desc);
create index alerts_project_idx on alerts (project_slug);

-- ------------------------------------------------------------ the human layer

create table reviews (
  id uuid primary key default gen_random_uuid(),
  record_id text not null,
  action text not null check (action in ('APPROVE', 'REJECT', 'NEEDS_VERIFICATION', 'COMMENT')),
  comment text not null default '',
  at timestamptz not null default now(),
  actor text not null,
  -- What the gate said AT THE MOMENT of the decision. Kept on the row so a
  -- later re-run cannot retroactively make a decision look better informed
  -- than it was.
  gate_pursue_eligible_at_decision boolean not null
);
create index reviews_record_idx on reviews (record_id, at desc);

create table project_tags (
  record_id text primary key,
  project_slug text not null,
  at timestamptz not null default now(),
  actor text not null
);

create table notes (
  id uuid primary key default gen_random_uuid(),
  text text not null,
  record_id text,
  project_slug text,
  at timestamptz not null default now(),
  actor text not null
);
create index notes_project_idx on notes (project_slug);
create index notes_record_idx  on notes (record_id);

create table tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  due date,
  status text not null default 'OPEN' check (status in ('OPEN', 'DONE')),
  completed_at timestamptz,
  record_id text,
  project_slug text,
  at timestamptz not null default now(),
  actor text not null
);
create index tasks_project_idx    on tasks (project_slug);
create index tasks_status_due_idx on tasks (status, due);

create table contacts (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  organisation text,
  role text,
  email text,
  phone text,
  note text,
  record_id text,
  project_slug text,
  at timestamptz not null default now(),
  actor text not null
);
create index contacts_project_idx on contacts (project_slug);

create table saved_views (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  kind text not null default 'OPPORTUNITY',
  filters jsonb not null default '{}',
  sort_field text not null default 'pubDate',
  sort_direction text not null default 'desc' check (sort_direction in ('asc', 'desc')),
  created_at timestamptz not null default now()
);

-- ------------------------------------------ what the console asks the worker for

-- The console is a static export with no backend and no egress: it can ask, not
-- act. This table is the boundary between the two.
create table requests (
  id uuid primary key default gen_random_uuid(),
  kind request_kind not null,
  payload jsonb not null default '{}',
  status request_status not null default 'QUEUED',
  requested_at timestamptz not null default now(),
  requested_by text not null default '',
  started_at timestamptz,
  finished_at timestamptz,
  result jsonb,
  error text
);
create index requests_queue_idx on requests (status, requested_at);

-- A project created from the console, waiting to be written into
-- registry/projects/*.yaml by the worker. The YAML remains the source of truth:
-- this is a staging area, never a second one.
create table project_drafts (
  slug text primary key,
  entry jsonb not null,
  status text not null default 'PENDING' check (status in ('PENDING', 'APPLIED', 'REJECTED')),
  created_at timestamptz not null default now(),
  created_by text not null default '',
  applied_at timestamptz,
  applied_commit text,
  error text
);

-- What the link checker found, per URL. A URL with no row here has simply never
-- been checked, and the console says "unchecked" rather than implying it works.
create table link_checks (
  url text primary key,
  status text not null,
  http_code integer,
  final_url text,
  checked_at timestamptz not null,
  note text not null default '',
  where_found text[] not null default '{}'
);
create index link_checks_status_idx on link_checks (status);

-- --------------------------------------------------------- row-level security

alter table watch_opportunities enable row level security;
alter table watch_events        enable row level security;
alter table watch_runs          enable row level security;
alter table alerts              enable row level security;
alter table reviews             enable row level security;
alter table project_tags        enable row level security;
alter table notes               enable row level security;
alter table tasks               enable row level security;
alter table contacts            enable row level security;
alter table saved_views         enable row level security;
alter table requests            enable row level security;
alter table project_drafts      enable row level security;
alter table link_checks         enable row level security;

-- What the weekly run writes, a session only reads. The ledger is produced by
-- evidence, never edited by hand.
create policy "authenticated read" on watch_opportunities for select to authenticated using (true);
create policy "authenticated read" on watch_events        for select to authenticated using (true);
create policy "authenticated read" on watch_runs          for select to authenticated using (true);
create policy "authenticated read" on link_checks         for select to authenticated using (true);

-- An alert is acknowledged, never deleted: the row stays as the record that the
-- system did warn you, and when.
create policy "authenticated read"        on alerts for select to authenticated using (true);
create policy "authenticated acknowledge" on alerts for update to authenticated using (true) with check (true);

-- APPEND-ONLY, at the database level. No update policy, no delete policy.
create policy "authenticated read"   on reviews for select to authenticated using (true);
create policy "authenticated append" on reviews for insert to authenticated with check (true);

-- The workspace is yours to edit freely — it is your working memory, not evidence.
create policy "authenticated all" on project_tags for all to authenticated using (true) with check (true);
create policy "authenticated all" on notes        for all to authenticated using (true) with check (true);
create policy "authenticated all" on tasks        for all to authenticated using (true) with check (true);
create policy "authenticated all" on contacts     for all to authenticated using (true) with check (true);
create policy "authenticated all" on saved_views  for all to authenticated using (true) with check (true);

-- Ask, don't resolve. `QUEUED` is the only status the browser may write, and
-- there is no update policy — moving a request forward needs the service role.
create policy "authenticated read" on requests for select to authenticated using (true);
create policy "authenticated ask"  on requests for insert to authenticated
  with check (status = 'QUEUED'::request_status);

-- A draft may be written and revised while PENDING; once the worker has applied
-- or rejected it, it is out of the browser's reach.
create policy "authenticated read"            on project_drafts for select to authenticated using (true);
create policy "authenticated draft"           on project_drafts for insert to authenticated
  with check (status = 'PENDING');
create policy "authenticated edit own draft"  on project_drafts for update to authenticated
  using (status = 'PENDING') with check (status = 'PENDING');
