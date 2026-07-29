# 2. Assessment of Reusable Existing Components

Because the repository is empty (see `00-repository-inventory.md`), there is
**nothing in-repo to reuse.** This section therefore assesses the *external*
assets and platform capabilities available to this account/session, and
recommends what to lean on instead of building — countering the "build
everything" bias.

## Platform capabilities available to the session

| Capability | Available? | Reuse decision |
|------------|-----------|----------------|
| **Supabase** (managed Postgres, Auth, RLS, Edge Functions, storage) | Yes (MCP tools present) | **Use as the system of record.** Do not hand-roll auth, row security, or a bespoke API layer. |
| **Vercel** (Next.js hosting, cron, logs) | Yes (MCP tools present) | **Use for the web app** and, optionally, lightweight scheduled triggers. |
| **GitHub** | Yes | Source control, PRs, CI. |
| **Lovable** | Yes | *Not adopted for V0.* It optimizes for generated UI apps; OIA needs a verifiable data pipeline with strict provenance, which is code we must own and test. Reconsider only for throwaway internal dashboards. |
| **Indeed connector** | Yes | Out of scope — jobs, not funding. Ignore for V0. |

## External building blocks to prefer over custom code

| Concern | Prefer (buy/borrow) | Rather than (build) |
|---------|--------------------|--------------------|
| Structured LLM output | **Zod schema + provider-native JSON/tool mode** | Custom parsers / regex extraction |
| HTML → text/markdown | A maintained extractor lib (e.g. Mozilla Readability / `@mozilla/readability`, or `turndown`) | A bespoke DOM cleaner |
| HTTP fetching + politeness | `undici`/`fetch` + a small rate-limit/robots helper | A custom crawler framework |
| Scheduling | Supabase scheduled functions **or** Vercel cron | A standing worker daemon (adds ops surface V0 doesn't need) |
| Content hashing / dedup | Standard `crypto` SHA-256 over normalized text | A custom similarity engine |
| Validation everywhere | **Zod** (already in the preferred stack) | Ad-hoc type guards |

## Reusable *concepts* (not code) worth carrying forward

- **Entity doctrine** (Oolala France SAS = EU/FR funding vehicle; Oolala Next
  FZ-LLC = GCC arm) directly informs the **project profile** model and source
  selection: EU/FR programmes and GCC programmes are the two primary source
  families for the BAWABA validation.
- **P1/P2/P3** prioritization convention is reused for the milestone/backlog
  labelling instead of inventing a new scheme.

## Recommendation

Build **only** the domain-specific core that no vendor provides:

1. the **provenance/claim-typing data model**,
2. the **four-score qualification** and the **PURSUE gate**,
3. thin, swappable **connector** and **LLM-provider** interfaces.

Everything else (hosting, DB, auth, scheduling, parsing, validation) is borrowed.
