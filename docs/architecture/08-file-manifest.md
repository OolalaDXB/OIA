# 10. Exact Files — Created / Modified / Deleted

Two parts: (A) what **this planning branch** actually contains right now, and
(B) the **precise file manifest** that Milestone 1 P1 would create **once
approved** (no code files are created before approval).

---

## A. Files created by this planning work (present on this branch)

**Created:**

```
README.md
docs/architecture/README.md
docs/architecture/00-repository-inventory.md
docs/architecture/01-reuse-assessment.md
docs/architecture/02-proposed-structure.md
docs/architecture/03-database-schema.md
docs/architecture/04-interfaces.md
docs/architecture/05-scoring-model.md
docs/architecture/06-milestone-1-plan.md
docs/architecture/07-assumptions-risks-open-decisions.md
docs/architecture/08-file-manifest.md
docs/architecture/adr/0001-oia-funding-v0.md
docs/architecture/schema/0001_init.sql
```

**Modified:** none (empty repo).
**Deleted:** none.

---

## B. Milestone 1 · P1 manifest (planned — NOT created yet)

Created only after approval. Grouped by area. `~` marks files whose exact
content depends on OD-1/OD-2/OD-3.

### Root / tooling
```
package.json                      # workspace root
pnpm-workspace.yaml
turbo.json
tsconfig.base.json
.gitignore
.env.example                      # documents required env (no secrets)
.dockerignore
```

### packages/config
```
packages/config/package.json
packages/config/src/env.ts        # Zod env schema (fail-fast)
packages/config/src/constants.ts  # CONFIDENCE_FLOOR, weights, model_version
packages/config/tsconfig.json
```

### packages/database
```
packages/database/package.json
packages/database/supabase/migrations/0001_init.sql   # promoted from docs/schema
packages/database/src/client.ts   # typed Supabase client
packages/database/src/types.generated.ts              # supabase gen types
packages/database/src/schemas.ts  # Zod mirrors for jsonb payloads
packages/database/src/seed/bawaba.ts                  # ~ project + sources seed
```

### packages/audit
```
packages/audit/package.json
packages/audit/src/audit-sink.ts  # AuditSink → audit_log
packages/audit/src/policy.ts      # PolicyHooks (canFetch, canAutoRecommend)
packages/audit/src/index.ts
packages/audit/test/policy.test.ts
```

### packages/providers
```
packages/providers/package.json
packages/providers/src/types.ts             # LLMProvider, LLMResult
packages/providers/src/default-provider.ts  # ~ one concrete adapter (OD-2)
packages/providers/src/index.ts
packages/providers/test/provider.contract.test.ts
```

### packages/connectors
```
packages/connectors/package.json
packages/connectors/src/types.ts            # SourceConnector, RawOpportunity...
packages/connectors/src/context.ts          # polite fetcher → evidence + hash
packages/connectors/src/registry.ts
packages/connectors/src/connectors/manual.ts
packages/connectors/src/connectors/primary-source.ts  # ~ EU/FR or GCC (OD-1)
packages/connectors/src/index.ts
packages/connectors/test/*.contract.test.ts
```

### packages/scoring
```
packages/scoring/package.json
packages/scoring/src/scores.ts    # relevance, eligibility, winPotential, infoConfidence
packages/scoring/src/gate.ts      # evaluateGate → GateReport
packages/scoring/src/index.ts
packages/scoring/test/scores.test.ts
packages/scoring/test/gate.test.ts            # highest-value tests
```

### packages/intelligence
```
packages/intelligence/package.json
packages/intelligence/src/qualifier.ts        # orchestration
packages/intelligence/src/claims.ts           # typed claim builders
packages/intelligence/src/corroborate.ts      # deterministic fact confirmation
packages/intelligence/src/eligibility.ts
packages/intelligence/src/profile.ts          # ProjectProfile type + Zod
packages/intelligence/src/index.ts
packages/intelligence/test/qualifier.integration.test.ts
```

### apps/workers
```
apps/workers/package.json
apps/workers/Dockerfile
apps/workers/src/pipeline.ts      # discover → fetch → qualify → persist
apps/workers/src/run.ts           # entrypoint: run for a project slug
apps/workers/test/pipeline.test.ts
```

### apps/web (minimal internal operator UI)
```
apps/web/package.json
apps/web/next.config.js
apps/web/tsconfig.json
apps/web/src/app/layout.tsx
apps/web/src/app/page.tsx                     # shortlist view
apps/web/src/app/opportunities/[id]/page.tsx  # detail: claims-by-type, 4 scores, gate
apps/web/src/lib/supabase.ts                  # auth + typed queries
apps/web/src/components/*                      # local components (no packages/ui in V0)
```

### CI (optional in P1)
```
.github/workflows/ci.yml          # typecheck + unit/contract tests, no live net
```

**Modified in P1:** the docs `schema/0001_init.sql` is *promoted* (copied) into
`packages/database/supabase/migrations/`; the ADR status flips to *Accepted*.

**Deleted in P1:** none.

### Deferred beyond P1 (documented, not created)
```
packages/ui/**                    # only when a 2nd app needs shared components
packages/connectors/src/connectors/<second-family>.ts   # P2 (OD-1 other option)
```

---

## Summary counts

- **This branch now:** 13 files created, 0 modified, 0 deleted.
- **Milestone 1 P1 (planned):** ~55 files created, 2 modified (schema promotion,
  ADR status), 0 deleted — pending approval and OD-1/OD-2/OD-3.
