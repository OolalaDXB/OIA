# BAWABA — Contradictions & risks detected (code inventory, 2026-08-14)

Manual Knowledge-Curator pass over `bawaba@561451f` (website) and
`bawaba-command@9913a36` (product). Each item is CONFLICTING_CLAIM /
STALE_DOCUMENT / RISK — the system signals, it does not silently pick a
version (§20).

## CONFLICTING_CLAIM

1. **Positioning drift** — website: "gateway-neutral decision and evidence
   plane" (`bawaba/README.md:3`) vs product README: "Sovereign AI Control
   Plane for Regulated Industries" (`bawaba-command/README.md:3`). The
   canonical positioning fact says "control and evidence plane". Pick one
   externally.
2. **Domain & contact** — website uses `bawaba.systems`; product README uses
   `bawaba.io` (+ `contact@bawaba.io`, `demo.bawaba.io`)
   (`bawaba-command/README.md:221,229,282`). Two identities externally.
3. **"Not a SaaS"** — product README: "deploys inside the client's perimeter…
   It is not a SaaS" (`README.md:222`) vs the console shipping a hardcoded
   hosted Supabase client (`src/integrations/supabase/client.ts`) as a
   parallel data path.
4. **Architecture diagram vs code** — README diagram shows traffic reaching
   "Core Banking, CRM, Databases, APIs"; `executeToolCall`
   (`internal/proxy/proxy.go:463`) never contacts any backend. "P1 ✅"
   roadmap overstates the Gateway line.
5. **Monitoring** — Prometheus config scrapes `gateway:9090` /metrics; no
   /metrics endpoint exists (`internal/api/server.go:202-205`).
6. **Entity naming** — product README asserts "Oolala Next FZ-LLC — Dubai,
   UAE" as the proprietor. Consistent with the carrier-entity fact (OK), but
   remember the canonical rule: this is the CARRIER, not "BAWABA's
   incorporation" — no dedicated entity exists.

## RISK (act on this one)

7. **Real bank names in the Supabase seed** — `supabase/migrations/
   20260217162332_*.sql` still seeds tenants named `attijari-wafa`,
   `snb-capital`, `mashreq-difc`, `bnp-cib` (real institutions). The Postgres
   demo seed was sanitised (`migrations/999_demo_seed.sql` uses fictional
   names) but the Supabase copy was NOT. If that hosted Supabase project is
   live and the console reads it (`src/hooks/use-agents.ts`), real bank names
   can surface in a demo. **Sanitise the Supabase migration + wipe/reseed the
   hosted project.**

## STALE_DOCUMENT candidates

8. Console screenshots on the website are substantially mock-rendered
   (labelled "demonstration" — acceptable, but regenerate after the console
   drops its mock/local-audit fallbacks).

## Positive findings (for balance)

- The website's "Available now" list is item-by-item TRUE against the code
  (default-deny engine, MENA PII tokenization, signed jurisdiction proofs,
  tamper-evident audit + one-command verification, quotas/rate limiting,
  demonstration console).
- The public evidence sample verifies independently (verify.py executed:
  chain OK, signature OK).
- The `video-demo-v2` HEAD commit was a de-faking pass (persisted signed
  proofs instead of Math.random, disclosure banners) — strong honesty signal.
- No certification claims, no named customers, no incorporation claims, and
  hedged pilot language on the site.
