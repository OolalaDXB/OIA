# 5. Minimal Supabase Database Schema

Full DDL: [`schema/0001_init.sql`](schema/0001_init.sql). **Proposal — not
applied.** No `apply_migration` runs until this is approved.

## Shape at a glance

```text
projects ──< opportunities ──< claims >── evidence
                │   │  │            └──────┘  (facts must cite evidence)
                │   │  └──< opportunity_scores        (4 scores)
                │   ├──< eligibility_assessments
                │   └──< recommendations              (gated PURSUE)
sources ──< evidence
llm_runs (provider-neutral call log)     audit_log (append-only)
pipeline_runs (worker observability)
```

## Tables and why each exists

| Table | Purpose | Trust role |
|-------|---------|-----------|
| `projects` | Project profiles (BAWABA first). Structured `profile` jsonb (entities, sectors, geographies, funding types, keywords, exclusions). | Defines relevance/eligibility matching input. |
| `sources` | Registry of what connectors fetch (official programme, aggregator, manual). | Provenance origin. |
| `evidence` | Immutable snapshot of a fetched page: URL, HTTP status, fetch time, **content hash**, extracted text. | The physical "accessible primary source." |
| `opportunities` | One funding opportunity per project, with verified `deadline_at` + `deadline_status`, `primary_evidence_id`. | The thing being ranked. |
| `claims` | **Typed statements** (`confirmed_official_fact` / `extracted` / `inference` / `recommendation` / `unresolved_uncertainty`) with confidence, producer, and (for facts) an evidence reference. | The provenance core — encodes the five-way separation. |
| `opportunity_scores` | The **four** scores (0–100) + per-factor `breakdown` + `model_version`. | Ranking, reproducible. |
| `eligibility_assessments` | Explicit verdict + per-criterion checklist. | Required PURSUE precondition. |
| `recommendations` | Gated action (`PURSUE`/`CONSIDER`/`MONITOR`/`DISCARD`) + exact `next_action` + `gate_report`. | The shortlist output. |
| `llm_runs` | Provider-neutral log of every model call (provider, model, prompt hash, tokens, cost). | Auditability & reproducibility of AI steps. |
| `audit_log` | Append-only event trail (fetch, score, gate, override, policy deny…). | Policy & audit hooks sink. |
| `pipeline_runs` | Worker run stats. | Observability. |

## Invariants enforced in the database (not just prompts)

1. **Facts require evidence** —
   `check (claim_type <> 'confirmed_official_fact' or evidence_id is not null)`.
   You cannot record an "official fact" with no source.
2. **PURSUE requires a passed gate + a next action** —
   `check (action <> 'PURSUE' or (gate_passed and next_action is not null))`.
   The core product rule is a table constraint, not a convention.
3. **One current recommendation per opportunity** — partial unique index on
   `is_current`.
4. **Dedup** — `unique (project_id, dedup_key)` collapses the same programme
   surfaced by multiple sources.
5. **RLS on every table from day one**; `audit_log` is insert+select only
   (no update/delete) so the trail is tamper-evident.

## What is deliberately NOT in the schema (scope discipline)

No billing, subscription, tenant, user-org, CRM, training, or venture tables.
No `users`/`orgs` beyond Supabase Auth's built-ins. Multi-project ≠
multi-tenant: isolation is by `project_id`, and RLS stays simple until a second
operator or tenant actually exists.

## Generated types

`packages/database` will run `supabase gen types typescript` (or the MCP
`generate_typescript_types`) to produce a typed client. Domain code imports
those types; Zod schemas mirror the `jsonb` payloads (`projects.profile`,
`claims.value_json`, `gate_report`, `criteria`) that Postgres can't type.
