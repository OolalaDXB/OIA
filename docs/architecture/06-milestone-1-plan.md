# 8. Milestone 1 Implementation Plan

**Goal of M1:** produce a **trustworthy funding shortlist for BAWABA** — a small
set of real opportunities, each with typed claims, four scores, and a gated
recommendation, viewable by an operator with full provenance.

**Definition of done:** running the worker for the BAWABA profile populates the
DB such that the web app shows a shortlist where at least the `PURSUE`/`CONSIDER`
items each have an accessible primary source, a verified deadline, a confirmed
open status, an eligibility assessment, an exact next action, and info-confidence
≥ floor — and where every displayed statement is labelled by claim type.

> **This plan is not executed until the architecture, schema and this plan are
> approved.**

## Work is labelled P1/P2/P3 per house convention.

### P1 — the spine (must ship for a shortlist to exist)

1. **Repo scaffold** — pnpm workspace, Turborepo, `tsconfig.base`, `packages/config`
   with the Zod **env schema**, `.env.example`. (`apps/web`, `apps/workers`, and
   the nine M1 packages created empty-but-wired.)
2. **Supabase project + schema** — apply `schema/0001_init.sql` via migration;
   generate TypeScript types into `packages/database`; typed client + Zod mirrors
   for the `jsonb` payloads.
3. **`packages/audit`** — `AuditSink` writing `audit_log`; `PolicyHooks` with a
   fetch allow-list + robots check (fail-closed).
4. **`packages/providers`** — `LLMProvider` interface + **one** default adapter;
   every call logs an `llm_runs` row. Provider selected by config.
5. **`packages/connectors`** — `SourceConnector` interface + shared polite
   fetcher (`ConnectorContext.fetchText` → hash + store `evidence`) + **one**
   real connector for the primary BAWABA source family (EU/FR **or** GCC — see
   open decision OD-1) and a `manual` connector for operator-entered URLs.
6. **`packages/scoring`** — the four score functions + `evaluateGate` as pure,
   unit-tested functions (v1 weights from `05-scoring-model.md`).
7. **`packages/intelligence`** — the `Qualifier`: extract (LLM) → deterministic
   fact corroboration → build typed `claims` → eligibility assessment → scores →
   gate → recommendation. Persists everything with audit events.
8. **`apps/workers`** — Dockerized entrypoint running the pipeline for a project
   slug: `discover → fetch → qualify → persist`, writing `pipeline_runs`.
9. **BAWABA profile seed** — insert the `projects` row + its `sources`.
10. **`apps/web` (minimal)** — auth (Supabase), a **shortlist view** and an
    **opportunity detail view** that renders claims grouped by type, the four
    scores, the gate report, and the exact next action. Read-mostly.

### P2 — makes it trustworthy in practice

11. **Human override + audit** — operator can change a recommendation; the
    override is audit-logged and becomes the current recommendation.
12. **Status re-check** — `checkStatus` connector path + a scheduled re-verify so
    `confirmedOpen` doesn't go stale (expired items drop out of `PURSUE`).
13. **Dedup** — `dedup_key` normalization across sources.
14. **Scoring calibration pass** — tune weights/floor against real BAWABA output.
15. **Second connector** — add the other of EU/FR / GCC.

### P3 — nice, deferred

16. Basic run scheduling via Vercel cron / Supabase scheduled function.
17. Export shortlist (CSV/Markdown) in quiet-luxury editorial style.
18. Simple metrics (counts by action, confidence distribution).

## Explicitly NOT in Milestone 1

Billing, subscriptions, public registration, multi-tenancy, CRM, training,
ventures, MCP gateway, autonomous agents, multi-model routing, automatic
application submission, marketing pages, `packages/ui`.

## Sequencing / critical path

```
scaffold(1) → db(2) → audit(3) ─┬→ providers(4) ─┐
                                └→ connectors(5) ─┼→ intelligence(7) → workers(8) → web(10)
                     scoring(6) ──────────────────┘        ▲
                                            profile seed(9)─┘
```

`scoring(6)` is parallelizable (pure functions, no deps beyond config).

## Test strategy

- **Unit:** `scoring` and `evaluateGate` (table-driven — the gate is the highest-
  value tests in the system).
- **Contract:** each connector + provider adapter against recorded fixtures
  (no live network in CI).
- **Integration:** one end-to-end run against 2–3 fixed real BAWABA source URLs,
  asserting the invariants (facts cite evidence; no PURSUE without gate).

## Milestone 1 exit review

Demo the BAWABA shortlist; confirm every `PURSUE`/`CONSIDER` item satisfies the
core product rule and every claim is typed. Decide connector #2 and calibrate
scoring. Only then scope Milestone 2.
