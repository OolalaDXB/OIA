# ADR 0001 — Architecture for OIA Funding V0

- **Status:** Proposed (awaiting approval)
- **Date:** 2026-07-29
- **Deciders:** Oolala / TheStudio MT (owner: Mickaël)
- **Supersedes:** —

## Context

OIA Funding V0 must discover, verify, qualify and rank **actionable** funding
opportunities for Oolala / TheStudio MT projects, validated first on the
**BAWABA** profile. It is an **internal operational tool**, not a public SaaS.

The defining requirement is **trust**: every opportunity must separate confirmed
official fact from extracted info, inference, recommendation and unresolved
uncertainty, and carry four independent scores (Relevance, Eligibility, Win
potential, Information confidence). Nothing may be recommended `PURSUE` unless it
is genuinely actionable today (accessible primary source, verified deadline,
confirmed still open, eligibility assessed, exact next action, sufficient source
confidence).

Explicitly **out of scope for V0**: billing, subscriptions, public registration,
advanced multi-tenancy, generic CRM, training, venture generation, MCP gateway,
autonomous agent conversations, complex multi-model routing, automatic
application submission, marketing pages.

## Decision

### D1 — Monorepo, but built incrementally
Adopt a pnpm + Turborepo monorepo with the `apps/` + `packages/` shape from the
brief as the *target*, creating **only** the packages Funding V0 needs (see
`02-proposed-structure.md`). `packages/ui` is deferred.

### D2 — Supabase Cloud (Postgres) is the single system of record
Use Supabase for the database, Auth, RLS and Edge Functions. No separate
bespoke API/auth layer. RLS is **on from day one** even though V0 is single-org,
so multi-project (not multi-tenant) isolation and audit are structural, not
retrofitted.

### D3 — Provenance is first-class in the data model
The unit of truth is not "an opportunity" but a set of **typed claims** attached
to an opportunity, each with `claim_type ∈ {confirmed_official_fact, extracted,
inference, recommendation, unresolved_uncertainty}`, a source reference, and a
confidence. Scores and the `PURSUE` gate are computed **from claims**, never from
free-text. This makes fact-vs-guess separation a schema invariant, not a prompt
convention.

### D4 — Every external-fact claim points to stored evidence
Fetched primary sources are stored as immutable `evidence` rows (URL, fetch
timestamp, HTTP status, content hash, extracted text). A
`confirmed_official_fact` claim **must** reference evidence. "Accessible primary
source" in the PURSUE gate = a reachable, hash-pinned evidence row.

### D5 — Four independent scores + a hard, non-scored gate
The four scores are computed by **pure functions** in `packages/scoring` and
stored per opportunity. `PURSUE` is **not** a score threshold: it is a boolean
**gate** over hard preconditions (D3/D4 + verified deadline + open status +
eligibility assessment + exact next action + confidence floor). A high score can
never override a failed gate. (See `05-scoring-model.md`.)

### D6 — Connectors and LLM providers are interfaces, not vendors
`SourceConnector` and `LLMProvider` are narrow TS interfaces (see
`04-interfaces.md`). The pipeline depends only on the interfaces. V0 ships a
small number of concrete connectors (starting with EU/FR and GCC programme
sources relevant to BAWABA) and **one** default LLM provider. No multi-model
routing — provider-neutral means *swappable*, not *simultaneous*.

### D7 — LLM extracts and proposes; it never confirms
The model is used to extract candidate fields and draft claims/recommendations.
A field only becomes a `confirmed_official_fact` when it is corroborated by
stored evidence (deterministic checks: deadline present in source text, page
reachable, status language present). The LLM cannot self-certify a fact. Every
LLM call is logged (`llm_runs`) with prompt hash, model, and cost for audit and
reproducibility.

### D8 — Ingestion/qualification run as scheduled Docker workers
`apps/workers` runs the pipeline on a schedule (discover → fetch → extract →
claim-type → assess eligibility → score → gate). The web app is a thin operator
surface (review shortlist, inspect provenance, override). No autonomous agent
loops; the pipeline is a deterministic DAG with LLM steps inside it.

### D9 — Policy + audit hooks are cross-cutting and mandatory
`packages/audit` exposes policy hooks (e.g. "may this source be fetched?", "may
this opportunity be auto-marked PURSUE?") and append-only audit logging of every
state transition and human override. The gate decision and its inputs are always
audit-logged.

### D10 — Zod at every boundary
All external input (connector output, LLM output, env, API payloads) is parsed
through Zod schemas before entering the domain. Invalid data fails closed.

## Consequences

**Positive**
- Trust is structural: you cannot store a "fact" without evidence, or reach
  `PURSUE` without meeting every precondition.
- Vendor independence for both data sources and LLMs is built in cheaply.
- Pure scoring core is trivially testable; the gate is auditable.
- Future modules (Tenders, etc.) can reuse `connectors`, `providers`, `scoring`,
  `audit`, `database` without a rewrite.

**Negative / costs**
- More moving parts than a single scraper script: a claim/evidence model is more
  work up front than dumping rows.
- RLS + audit from day one adds friction for a single-user V0.
- Deterministic corroboration of facts limits how much we can "trust the model,"
  by design — some opportunities will sit at `CONSIDER`/`MONITOR` rather than
  `PURSUE` because evidence is thin. **This is the intended behaviour**, not a
  defect.

## Alternatives considered

| Alternative | Rejected because |
|-------------|------------------|
| Single Next.js app, no workers, scrape on request | No provenance discipline, no reproducibility, conflates UI with a long-running verified pipeline. |
| Store opportunities as flat rows with a "notes" field | Cannot mechanically separate fact/inference or enforce the gate; trust becomes a prompt promise. |
| Multi-model routing / agent conversations now | Explicitly out of scope; adds routing/eval complexity with no V0 payoff. |
| Lovable-generated app | Optimizes for UI generation, not a verifiable data pipeline we must own and test. |
| Defer RLS/audit to "later" | Retrofitting security and provenance is the classic way they never happen; cheap now, expensive later. |

## Open questions

Tracked in `07-assumptions-risks-open-decisions.md` (source list for BAWABA,
default LLM provider choice, hosting split web vs workers, human-review SLA).
