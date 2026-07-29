# OIA — Oolala Intelligence Agency

OIA is intended to become a modular operational-intelligence platform. Planned
(but **not yet authorized**) modules: Funding, Tenders, CRM, Data, Training,
Signals, Ventures.

**The only module currently authorized for implementation is `OIA Funding V0`.**

> OIA Funding must discover, verify, qualify and rank **actionable** funding
> opportunities for projects operated by Oolala and TheStudio MT.
> **BAWABA** is the first project profile used to validate the system.

## Status

Architecture **approved**. Milestone 1 (P1) implementation is **underway**,
starting with the EU/FR connector as directed.

**Implemented and tested (46 tests green):**

| Package | What it does |
|---------|--------------|
| `packages/config` | Zod-validated env + scoring constants |
| `packages/database` | Domain Zod schemas, row types, Supabase client, migration `0001_init.sql`, BAWABA seed |
| `packages/audit` | Fail-closed policy hooks + append-only audit sink |
| `packages/providers` | Provider-neutral `LLMProvider` (Anthropic default + fake) |
| `packages/connectors` | `SourceConnector` interface, polite hash-pinning fetcher, **EU Funding & Tenders (SEDIA)** + manual connectors |
| `packages/scoring` | Four scores + the hard PURSUE gate (pure, table-tested) |
| `packages/intelligence` | Qualifier: deterministic fact corroboration, eligibility, scoring, gating |
| `apps/workers` | Dockerized `discover→fetch→qualify→persist` pipeline (Supabase + memory persistence) |

**Not yet built:** `apps/web` operator UI (P1 item 10), live Supabase project
link, scoring calibration. See [`docs/architecture/06-milestone-1-plan.md`](docs/architecture/06-milestone-1-plan.md).

```bash
pnpm install
pnpm typecheck
pnpm test
```

## Where to start

Read [`docs/architecture/README.md`](docs/architecture/README.md) — the index
for all ten architecture deliverables and the rationale behind the code.

## Non-negotiable product rule

The system must produce a shortlist of **real and currently actionable**
funding opportunities. For every opportunity it must separate:

- confirmed official fact
- extracted information
- inference
- recommendation
- unresolved uncertainty

and maintain four independent scores: **Relevance**, **Eligibility**,
**Win potential**, **Information confidence**.

No opportunity may be recommended as `PURSUE` without an accessible primary
source, a verified deadline, confirmation it remains open, an eligibility
assessment, an exact proposed next action, and sufficient source confidence.
