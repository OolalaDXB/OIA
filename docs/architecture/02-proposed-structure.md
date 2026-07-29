# 3. Proposed Monorepo Structure

## Decision in one line

Adopt a **pnpm + Turborepo monorepo** with `apps/` and `packages/`, but
**scaffold only the packages Funding V0 actually needs.** The full package list
from the task brief is kept as a *target shape* (so future modules slot in
without a reorg), while unused packages are **not created** until a module needs
them. This honours "anticipate future modules without implementing them
prematurely."

## Target shape (documented, not all built now)

```text
oia/
├─ apps/
│  ├─ web/                 # Next.js (App Router) — internal operator UI + API routes
│  └─ workers/             # Dockerized ingestion/qualification jobs (Node/TS)
├─ packages/
│  ├─ database/            # Supabase schema, migrations, generated types, typed client
│  ├─ connectors/          # SourceConnector interface + concrete source adapters
│  ├─ intelligence/        # qualification pipeline: extract → classify claims → assess
│  ├─ providers/           # LLMProvider interface + provider adapters (neutral)
│  ├─ scoring/             # 4-score model + PURSUE gate (pure functions)
│  ├─ audit/               # policy + audit hooks, provenance/event logging
│  ├─ ui/                  # shared React components (deferred until >1 app needs it)
│  └─ config/             # shared tsconfig, eslint, zod env schema, constants
└─ (root: pnpm-workspace.yaml, turbo.json, tsconfig.base.json, .env.example …)
```

## What actually gets created in Milestone 1

Built now (needed to produce a shortlist):

- `apps/web`
- `apps/workers`
- `packages/database`
- `packages/connectors`
- `packages/intelligence`
- `packages/providers`
- `packages/scoring`
- `packages/audit`
- `packages/config`

**Deferred** (created only when justified):

- `packages/ui` — deferred. `apps/web` keeps its components locally until a
  second app or a real sharing need appears. A one-app "shared UI" package is
  pure overhead.

## Why this layout

| Choice | Reason |
|--------|--------|
| Separate `packages/scoring` as **pure functions** | The four scores and the `PURSUE` gate are the trust core; isolating them makes them unit-testable with zero I/O and reusable by both web and workers. |
| Separate `connectors` and `providers` behind interfaces | Direct fulfilment of the "source connectors" and "provider-neutral LLM" requirements; lets us add/swap sources and models without touching the pipeline. |
| `intelligence` depends on `connectors` + `providers` + `scoring` + `database` | It orchestrates; it owns no vendor detail. |
| `audit` is its own package | Policy checks and audit logging are cross-cutting and must not be buried inside pipeline code, so they can be enforced uniformly and reviewed independently. |
| `apps/workers` separate from `apps/web` | Ingestion/qualification are long-running and run on a schedule; the web app must stay a thin, fast operator surface. Docker per the brief. |
| `packages/config` holds the **Zod env schema** | One validated source of truth for environment/config; fail fast on misconfig. |

## Dependency direction (must stay acyclic)

```text
apps/web  ─┐
apps/workers ─┼─▶ intelligence ─▶ connectors
            │                  └▶ providers
            │                  └▶ scoring
            └───────────────────▶ database ◀── audit
config ◀── (everything)
```

`scoring` depends on nothing but `config`/types. `database` and `audit` have no
dependency on `intelligence`. No cycles.

## Tooling defaults

- **pnpm** workspaces + **Turborepo** for task orchestration/caching.
- **TypeScript** strict everywhere; **Zod** at every trust boundary.
- **Docker** only for `apps/workers`.
- Web app deploys to **Vercel**; DB is **Supabase Cloud**.
