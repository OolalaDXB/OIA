# OIA — Oolala Intelligence Agency

OIA finds, verifies and qualifies **real and currently actionable**
opportunities — public funding, tenders, investors — for **every project the
studio runs**, and gives one operator a workspace to triage them, decide, and
track what is owed.

It works for all of them from one place: 16 projects today (BAWABA, SILLON,
Maisons.co, myOolala, BEAU, BEAU Treasury, RLS Guard, Coach Gari, Les Vieilles
Pierres, District 267, PandaMood, padel.design, Ludography, two foundations —
and **TheStudio MT itself**, as a bidder on public IT tenders). Adding the next
one is **one YAML file**.

## Non-negotiable product rule

The system must produce a shortlist of **real and currently actionable**
opportunities. For every one it separates:

- confirmed official fact · extracted information · inference · recommendation ·
  unresolved uncertainty

and maintains four independent scores: **Relevance**, **Eligibility**,
**Win potential**, **Information confidence**.

No opportunity may be recommended as `PURSUE` without an accessible primary
source, a verified deadline, confirmation it remains open, an eligibility
assessment, an exact proposed next action, and sufficient source confidence.
**A human approval never overrides a failed condition** — the console records
the approval and the gate still refuses, and the audit trail proves it.

## Adding a project — the entire procedure

```bash
cp registry/projects/sillon.yaml registry/projects/newthing.yaml
$EDITOR registry/projects/newthing.yaml      # signals, discovery, profileReview
pnpm --filter @oia/registry validate
pnpm --filter @oia/registry generate          # regenerate the browser snapshot
```

No code change. The project is immediately in the console, the tagging
dropdowns, the digest, the metrics — and in the next discovery run if
`discovery.enabled`. See [`registry/README.md`](registry/README.md).

## The surfaces

| Route | What it is |
|---|---|
| `/digest` | **Today** — deadlines closing, work overdue, approvals the gate still blocks, what is untriaged. Deterministic; empty when nothing needs you |
| `/` | Review console — the full queue, provenance-typed facts, gate report, four scores |
| `/grants` `/tenders` `/investors` | The same shell, scoped by opportunity kind |
| `/projects` | Every project: matching signals, entity route, discovery config, and whether the profile is owner-confirmed or still a hypothesis |
| `/tasks` `/notes` `/contacts` | The human layer — what is owed, what was decided, who to talk to |
| `/alerts` | What the permanent watch decided was worth interrupting you for — new, closing, moved, withdrawn, approved-but-blocked. Acknowledged, never deleted |
| `/metrics` | Counts, and the one that matters: **why the gate blocks what it blocks** |

Shortlists export to CSV and Markdown; the digest exports to Markdown; the whole
human layer backs up to one JSON file.

## Architecture

| Package | What it does |
|---|---|
| `packages/config` | Zod-validated env + scoring constants |
| `packages/database` | Domain Zod schemas, row types, Supabase client, migration `0001_init.sql` |
| `packages/registry` | **The project registry** — YAML source of truth, schema, honesty rules, generated browser snapshot |
| `packages/audit` | Fail-closed policy hooks + append-only audit sink |
| `packages/providers` | Provider-neutral `LLMProvider` (Anthropic default + fake) |
| `packages/connectors` | `SourceConnector` interface, polite hash-pinning fetcher, TED + EU Funding & Tenders (SEDIA) + manual |
| `packages/ingestion` | Artifact ingestion, provenance-typed facts, deadlines, verification, the deterministic gate, **dedup**, **freshness/expiry** |
| `packages/scoring` | Four scores + the hard PURSUE gate (pure, table-tested) |
| `packages/intelligence` | Qualifier: fact corroboration → eligibility → scores → gate → recommendation |
| `packages/knowledge` | Canonical knowledge base + disclosure gate (what may be claimed externally) |
| `packages/watch` | **The permanent watch** — the ledger that remembers between runs, change detection, and the alert rules |
| `packages/workspace` | Workspace records, suggestions, **digest**, **metrics**, **exports**, storage adapter |
| `apps/workers` | Dockerized pipelines; registry-driven multi-project discovery |
| `apps/web` | The console — static export, no backend |

```bash
pnpm install
pnpm typecheck && pnpm test          # 210 tests
pnpm --filter @oia/registry validate
pnpm --filter @oia/knowledge validate
pnpm --filter @oia/web build
```

## Running discovery

Discovery needs network egress (the agent sandbox is blocked by policy, and
reports it as `BLOCKED` rather than pretending otherwise). Run it locally or in
the Docker worker:

```bash
docker compose up --build
pnpm --filter @oia/workers discover:ted -- --list             # show the plan, fetch nothing
pnpm --filter @oia/workers discover:ted                       # every discoverable project
pnpm --filter @oia/workers discover:ted -- --project sillon,bawaba
pnpm --filter @oia/workers exec tsx src/ted-to-console.ts     # refresh the console dataset
```

Each project gets its own expert query from its registry profile. A notice found
by several projects is kept once and carries the list of projects whose query
surfaced it — discovery provenance, never a match verdict.

**It also runs itself.** `.github/workflows/discovery.yml` performs the same
sequence every Monday (and on demand, with per-project overrides) where egress
exists, verifies the result — typecheck, tests, web build — and only then commits
the refreshed dataset, which redeploys the console. A shortlist that silently
goes stale is not "currently actionable"; that is the point of the schedule.
Disable it in the repository's Actions tab if you would rather refresh by hand.

## The permanent watch

Discovery that runs weekly is not a watch if each run forgets the last one. The
ledger (`packages/watch`) keeps one row per opportunity **identity** across all
runs, so the system can say what is new, what changed, what vanished and since
when a call has been open — and raise alerts on it, idempotently.

Switching it on takes four steps that need your credentials:
[`docs/watch-setup.md`](docs/watch-setup.md). Until then the console runs on its
bundled snapshot exactly as before.

## Access and data

The console is behind Vercel Authentication, and the database behind a sign-in:
it ships its key in a public bundle, so row-level security refuses to answer
without a session. The audit trail is append-only in the database itself, not by
convention. Read [`docs/access-and-data.md`](docs/access-and-data.md) before
attaching a custom domain.

## Where to start reading

- [`docs/roadmap.md`](docs/roadmap.md) — **what the system actually searches on
  today (measured), what it cannot yet represent, and what comes next**
- [`docs/architecture/README.md`](docs/architecture/README.md) — the ten
  architecture deliverables and the rationale behind the code
- [`registry/README.md`](registry/README.md) — who OIA works for, and how to add
  a project
- [`knowledge/README.md`](knowledge/README.md) — what the studio may claim, and
  on what evidence
- [`docs/interface/phase-3-4-compte-rendu.md`](docs/interface/phase-3-4-compte-rendu.md)
  — the latest delivery report (FR)
