# OIA Funding V0 — Architecture & Planning

**Status:** Draft for review. **Nothing here is implemented.** Implementation is
gated on approval of these documents.

This directory answers the ten deliverables requested for the pre-implementation
phase of OIA Funding V0.

| # | Deliverable | Document |
|---|-------------|----------|
| 1 | Repository inventory | [`00-repository-inventory.md`](00-repository-inventory.md) |
| 2 | Assessment of reusable existing components | [`01-reuse-assessment.md`](01-reuse-assessment.md) |
| 3 | Proposed monorepo / application structure | [`02-proposed-structure.md`](02-proposed-structure.md) |
| 4 | Architecture Decision Record | [`adr/0001-oia-funding-v0.md`](adr/0001-oia-funding-v0.md) |
| 5 | Minimal Supabase database schema | [`03-database-schema.md`](03-database-schema.md) · [`schema/0001_init.sql`](schema/0001_init.sql) |
| 6 | Interfaces (connectors, LLM, profiles, qualification, policy/audit) | [`04-interfaces.md`](04-interfaces.md) |
| 7 | Initial scoring model | [`05-scoring-model.md`](05-scoring-model.md) |
| 8 | Milestone 1 implementation plan | [`06-milestone-1-plan.md`](06-milestone-1-plan.md) |
| 9 | Assumptions, risks, open decisions | [`07-assumptions-risks-open-decisions.md`](07-assumptions-risks-open-decisions.md) |
| 10 | Exact files created / modified / deleted | [`08-file-manifest.md`](08-file-manifest.md) |

## Reading order for reviewers

1. **ADR** (`adr/0001`) — the load-bearing decisions and their rationale.
2. **Schema** (`03`) — the data model that encodes fact-vs-inference separation.
3. **Scoring** (`05`) — the four scores and the hard `PURSUE` gate.
4. **Milestone 1** (`06`) — what actually gets built first, and what does not.
5. Everything else as needed.

## The one thing to get right

OIA Funding is a **trust instrument**, not a scraper. Its value is that a human
operator can look at a shortlist and know, per opportunity, which statements are
verified official facts and which are the model's guesses — and that nothing is
labelled `PURSUE` unless it is genuinely actionable today. Every architectural
choice below is subordinate to that.
