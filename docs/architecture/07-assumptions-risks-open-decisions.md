# 9. Assumptions, Risks & Open Decisions

## Assumptions (A)

| # | Assumption | If wrong |
|---|------------|----------|
| A1 | The repo is greenfield and we own all conventions. | Confirmed by inspection — low risk. |
| A2 | BAWABA's funding surface is primarily **EU/FR programmes** (via Oolala France SAS) and **GCC programmes** (via Oolala Next FZ-LLC). | Reprioritize connectors; profile geographies change. |
| A3 | V0 is single-operator / single-org internal use; "multi-project" not "multi-tenant." | RLS policies need tightening earlier. |
| A4 | One default LLM provider is sufficient; provider-neutral means *swappable*, not simultaneous. | Revisit `providers` only if a second is truly needed. |
| A5 | Supabase Cloud + Vercel are the deployment targets available to this account. | MCP tools for both are present — low risk. |
| A6 | Target sources permit automated fetching within reasonable politeness (robots/allow-list respected). | Some sources may require manual entry → `manual` connector covers it. |
| A7 | Operators review the shortlist; the system never auto-submits anything. | Explicit product boundary — held. |
| A8 | Deliverables aesthetic follows quiet-luxury editorial house style. | Cosmetic only. |

## Risks (R)

| # | Risk | Severity | Mitigation |
|---|------|:--------:|------------|
| R1 | **False confidence** — model presents an inference as fact. | High | Deterministic corroboration for facts; claim typing enforced in schema; info-confidence score; DB constraint `fact_requires_evidence`. |
| R2 | **Stale "open" status** — deadline passed but item still shows PURSUE. | High | `confirmedOpen` in gate; P2 scheduled re-verify; `deadline_status`. |
| R3 | **Source blocking / brittle scraping** — pages change or block bots. | Med | Connector interface isolates breakage; `manual` fallback; evidence hashing detects drift. |
| R4 | **LLM cost / drift** across runs. | Med | `llm_runs` logs cost + prompt hash; structured extraction (Zod) constrains output; one model. |
| R5 | **Over-engineering** the monorepo before value exists. | Med | Only M1 packages built; `ui` deferred; scope boundaries enforced. |
| R6 | **Legal/eligibility misjudgement** presented as authoritative. | High | Eligibility is an *assessment* with per-criterion evidence and a `verdict`; unknowns surfaced, never hidden; human sign-off before PURSUE (policy hook `canAutoRecommend`). |
| R7 | **Secret handling** (Supabase service key, LLM key) in workers. | Med | Zod-validated env, secrets only in worker/deploy env, never in repo; `.env.example` only. |
| R8 | **Empty shortlist** for BAWABA (nothing passes the gate). | Low/By-design | Correct outcome if nothing is genuinely actionable; `CONSIDER`/`MONITOR` still provide value; calibrate floor in M1 exit. |

## Open decisions (OD) — need owner input before/at M1

| # | Decision | Options | Recommendation |
|---|----------|---------|----------------|
| **OD-1** | **First connector** for BAWABA. | (a) EU/FR programme portal, (b) GCC programme source. | Start with the family where BAWABA is most fundable *today*; **default (a) EU/FR** given Oolala France SAS is the funding vehicle — confirm with owner. |
| **OD-2** | **Default LLM provider** for V0. | Anthropic / OpenAI / other. | Pick one; keep behind `LLMProvider`. Provider identity is a config value, not an architecture decision. Owner to choose the account/key available. |
| **OD-3** | **BAWABA profile contents** — exact sectors, geographies, funding types, keywords, exclusions, amount range. | — | Needs owner to supply (or approve a first draft). Blocks relevance/eligibility quality, not the scaffold. |
| **OD-4** | **Confidence floor** for PURSUE. | Default 70. | Ship at 70; calibrate at M1 exit against real results. |
| **OD-5** | **Where workers run.** | Vercel cron invoking a route, Supabase scheduled function, or a container host. | For V0 simplicity, prefer a scheduled invocation over a standing daemon; decide at scaffold time based on run duration. |
| **OD-6** | **Human sign-off requirement** for PURSUE. | Auto-PURSUE if gate passes, vs require operator confirmation. | Recommend **require operator confirmation** for PURSUE in V0 (policy hook `canAutoRecommend` returns false); trust is the priority. |
| **OD-7** | **Approval to proceed to code.** | — | **This is the gating decision.** No code until these docs are approved. |

## What I need from you to start Milestone 1

1. Approve the ADR, schema and M1 plan (OD-7).
2. Answer OD-1 (first connector) and OD-2 (LLM provider/account).
3. Provide or approve a first draft of the BAWABA profile (OD-3).

With those, P1 of Milestone 1 can begin.
