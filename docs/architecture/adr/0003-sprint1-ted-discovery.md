# ADR 0003 — Sprint 1: TED discovery worker (where it runs, how the sandbox tests)

- **Status:** Proposed (plan-only; awaiting Mickaël's validation before coding)
- **Date:** 2026-08-05
- **Scope:** ONE source (TED), end to end: discover → map to the existing
  candidate model → run through the existing Milestone-0 verification engine →
  store with provenance → run report. Out of scope: other sources, scraping,
  multilingual extraction, multi-project profiles, any `apps/web` change, any
  business-schema change.

## Context

TED (Tenders Electronic Daily) exposes a **public, anonymous, read-only Search
API** (`POST https://api.ted.europa.eu/v3/notices/search`). It requires outbound
network access, which the Claude Code **sandbox blocks (403)**. So discovery
cannot run live in the sandbox — it must run where there is egress.

We already have: `@oia/connectors` (`SourceConnector.discover → RawOpportunity[]`),
the Milestone-0 ingestion/verification engine (`@oia/ingestion`:
`ingestOfficialArtifact`, `verifySuppliedArtifact` capped at
`MANUAL_REVIEW_REQUIRED`), and a Dockerized Node worker (`apps/workers`).

## Decision

### D1 — Reuse, don't redefine
TED is a **new implementation of the existing `SourceConnector`**, producing the
existing `RawOpportunity` candidate model. No DTO is redefined in the worker.
Verification reuses the existing M0 engine unchanged.

### D2 — Two-step per candidate (discovery API, then official-page verification)
1. **Discover** via the TED Search API → structured metadata → `RawOpportunity`
   candidates. Each API-derived field records a `JSON_PATH` source locator
   (the `SourceLocator.type = "JSON_PATH"` already exists).
2. **Verify** by fetching each candidate's **canonical TED notice URL**
   (`https://ted.europa.eu/en/notice/{publication-number}/html`, an official
   `europa.eu`/`ted.europa.eu` primary source) as a `STATIC_HTML` **SourceArtifact**,
   then running the **existing** `verifySuppliedArtifact`. This reaches
   `MANUAL_REVIEW_REQUIRED` and never `VERIFIED` without a human — reusing the M0
   engine verbatim, no schema change.

Rationale: the M0 verification model is artifact-centric (`SourceFormat` has no
"JSON/API" value). Rather than bend the schema, we treat the API as *discovery*
and the official notice **page** as the *verifiable artifact*. Clean reuse.

### D3 — Deployment target for the live run
**Primary: a Node container on Fly.io using the existing `apps/workers/Dockerfile`.**
It has real egress, reuses everything we built (Node + pnpm workspace + the
ingestion engine incl. cheerio), is cheap, and can run on a schedule later.
**Zero-infra fallback for the very first "found-it-alone" proof: run the same
worker CLI on Mickaël's machine** (`pnpm --filter @oia/workers run discover:ted`),
which has ordinary internet.

Alternatives rejected:
- **Supabase Edge Function (Deno):** our engine is Node/npm (cheerio, pdfjs);
  porting to Deno edge is friction for no benefit this sprint.
- **Vercel serverless/cron:** function time limits + monorepo function bundling
  friction; Vercel is already our static host for the console — keep concerns
  separate.

### D4 — Sandbox testing without network
The connector, mapping and dedup are **pure** and tested in the sandbox against a
**recorded, real TED Search API response (fixture)** — never an invented one.
The fixture is captured verbatim from the first live call (on Fly or Mickaël's
machine) and committed, or pasted by Mickaël. A `LOCAL_INTEGRATION` test feeds
one mapped candidate (plus a recorded notice-page fixture) through the existing
engine and asserts it comes out `MANUAL_REVIEW_REQUIRED`. A `LIVE_SOURCE_SPIKE`
runs only where there is egress.

### D5 — Storage for this sprint
Run output goes to **`outputs/sprint-1/` (JSON + markdown)**, consistent with
Milestone 0 and requiring no production Supabase. DB persistence
(`opportunities`/`sources`/`evidence` tables already in `@oia/database`) is a
later step, out of Sprint 1 scope.

### D6 — Honesty
A failed fetch (search or notice page) is recorded as `ERROR`/`BLOCKED`, never
presented as success. If the worker runs somewhere without egress, the run
report says so.

## Consequences

- The proof "OIA discovers real opportunities on its own" happens in the **live
  run** outside the sandbox; the sandbox proves the connector/mapping/verification
  wiring against a real recorded fixture.
- No schema change; two honest mapping gaps are flagged (see the plan doc:
  `RawOpportunity.hints` has no country/CPV slots → carried in `raw` + emitted as
  provenance-typed facts).
- Sprint 2 (SAM/UK/SEDIA) reuses this same `SourceConnector` + worker.

## Open decisions for Mickaël (validate before coding)

1. Deployment target: **Fly.io container** (recommended) vs run on your machine
   for the first proof. Do you have a Fly account, or start local?
2. Storage: `outputs/sprint-1/` JSON now (recommended) vs wire Supabase this sprint.
3. Discovery scope for the first query: which **CPV codes / countries / date
   window** define "relevant for BAWABA"? (Needed to build the expert query.)
